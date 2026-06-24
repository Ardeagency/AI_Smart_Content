#!/usr/bin/env node
/**
 * audit-org-isolation.mjs — Guardrail de aislamiento multi-org.
 *
 * Falla si encuentra una LECTURA (.select) de una tabla de workspace/tenant sin
 * acotar a la org/marca activa (organization_id / brand_container_id / brand_id).
 * RLS NO basta: un usuario dueño de varias orgs pasa RLS para TODAS, así que la
 * app SIEMPRE debe filtrar por la org activa (window.currentOrgId / resolver central).
 *
 * Heurística (evita falsos positivos comunes):
 *   - Solo lecturas: la cadena debe tener .select(. Inserts/updates/deletes se ignoran.
 *   - Se considera SCOPED si la cadena (hasta fin de statement) contiene
 *     organization_id | brand_container_id | brand_id.
 *   - Se considera SEGURO-POR-ID si filtra por una columna *_id/ id concreta vía
 *     .eq('id'|'<x>_id') o .in('id'|'<x>_id') (cascada desde datos ya scopeados,
 *     o fetch por PK único). user_id y flow_id NO cuentan como scope de org.
 *   - Anotación de escape: agregar  // isolation-safe: <razón>  en la línea del
 *     .from(...) o hasta 2 líneas arriba, para reads global legítimos.
 *
 * Uso:  node scripts/audit-org-isolation.mjs   (exit 1 si hay hallazgos)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = decodeURIComponent(new URL('../js/', import.meta.url).pathname);

// Tablas de workspace/tenant: su contenido pertenece a UNA org y debe acotarse.
const WS = new Set([
  'flow_runs','runs_outputs','runs_inputs','brand_posts','brand_post_comments',
  'brand_characters','brand_places','brand_entities','character_images','place_images',
  'product_images','products','product_variants','services','audience_personas','audience_segments',
  'campaigns','campaign_briefs','campaign_brief_entities','brand_profiles','brand_colors','brand_fonts',
  'brand_assets','system_ai_outputs','body_missions','vera_pending_actions','mission_runs',
  'flow_schedules','vera_artifacts','vera_action_outcomes','vera_content_signals','org_flow_saves',
  'ai_conversations','ai_messages','monitoring_triggers','url_watchers','competitors','brand_competitors',
  'intelligence_entities','intelligence_signals','sensor_runs','apify_runs','brand_vulnerabilities',
  'social_publications','ad_insights_daily','brand_strategies','strategy_nodes','brand_audiences',
  'canvas_node_placements','canvas_groups','canvas_stickies','canvas_strategies','canvas_edges',
  'production_output_likes',
]);

const SCOPE = /\b(organization_id|brand_container_id|brand_id)\b/;
// columnas *_id concretas que acotan por cascada/PK (NO user_id ni flow_id solos)
const SAFE_ID = /\.(eq|in)\(\s*['"](id|run_id|entity_id|product_id|place_id|character_id|brief_id|campaign_id|persona_id|strategy_id|conversation_id|output_id|node_id|container_id)['"]/;
const WRITE = /\.(insert|update|upsert|delete|rpc)\(/;

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { if (name !== 'node_modules') out = out.concat(walk(p)); }
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const fromRe = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
const findings = [];

for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const text = lines.join('\n');
  let m;
  fromRe.lastIndex = 0;
  while ((m = fromRe.exec(text)) !== null) {
    const table = m[1];
    if (!WS.has(table)) continue;
    const start = m.index;
    const lineNo = text.slice(0, start).split('\n').length;
    // Ventana: el patrón builder (`let q = sb.from(...); q = q.eq('organization_id'…)`)
    // pone el filtro en líneas posteriores; escaneamos un bloque amplio alrededor
    // del .from (2 arriba, 18 abajo) para no marcar como fuga código ya acotado.
    const win = lines.slice(Math.max(0, lineNo - 3), lineNo + 18).join('\n');
    if (!/\.select\(/.test(win)) continue;        // solo lecturas
    if (WRITE.test(win)) continue;
    if (SCOPE.test(win)) continue;                // scoped por org/marca
    if (SAFE_ID.test(win)) continue;              // by-id / cascada
    if (/isolation-safe:/.test(win)) continue;    // anotación de escape
    const rel = file.slice(file.indexOf('/js/') + 1);
    findings.push({ rel, lineNo, table });
  }
}

if (findings.length === 0) {
  console.log('✓ Aislamiento OK: ninguna lectura de tabla de workspace sin scope de org/marca.');
  process.exit(0);
}
console.error(`✗ ${findings.length} lectura(s) de workspace sin scope de org/marca:\n`);
for (const f of findings) {
  console.error(`  ${f.rel}:${f.lineNo}  →  ${f.table}  (falta organization_id/brand_container_id/brand_id, o anotar // isolation-safe: <razón>)`);
}
process.exit(1);
