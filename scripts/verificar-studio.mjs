#!/usr/bin/env node
/**
 * Verificación del STUDIO (/image, /video) y PRODUCCIONES contra la base nueva
 * con un JWT real: carga StudioDataService tal cual lo usa la consola y
 * comprueba el catálogo (imagen-directa / video-directo), el contexto de marca
 * (mercado + elementos con fotos), las producciones (public.salidas) y que
 * producir sin borde falla con palabras. Con AISC_API_URL y PRODUCIR=1 lanza
 * una imagen real (~0,09 USD).
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_API_URL=…] [PRODUCIR=1] node scripts/verificar-studio.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (p, d = '') => { pasos.push(['OK', p]); console.log(`OK     ${p}${d ? ' — ' + d : ''}`); };
const falla = (p, e) => { pasos.push(['FALLA', p]); console.log(`FALLA  ${p} — ${e?.code || ''} ${e?.message || e}`); };
const salta = (p, d) => { pasos.push(['SALTA', p]); console.log(`SALTA  ${p} — ${d}`); };
globalThis.window = globalThis; globalThis.document = { hidden: false };
new Function(readFileSync(new URL('../js/services/ApiV2.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/services/StudioDataService.js', import.meta.url), 'utf8'))();
const S = globalThis.StudioDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
S._inyectarCliente(sb);
globalThis.AISC_API_URL = env('AISC_API_URL');
let sesion = null;
globalThis.apiV2.configurar({ sesion: { actual: async () => sesion, refrescar: async () => sesion } });
async function main() {
  let org;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; sesion = data.session; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG')) || ctx.data.organizations[0];
    ok('mi_contexto', `${org.name} · mercados ${org.markets?.length}`);
  } catch (e) { falla('login/contexto', e); return fin(); }
  for (const slug of ['imagen-directa', 'video-directo']) {
    try { const f = await S.flujo(slug); if (!f?.id) throw new Error('no está en catalog_view'); ok(`flujo ${slug}`, `${f.kind} · ${f.pricing_mode} · común ${f.organization_id == null}`); } catch (e) { falla(`flujo ${slug}`, e); }
  }
  try {
    const c = await S.contexto(org.id);
    if (!c.brand) throw new Error('sin mercado');
    ok('contexto', `mercado «${c.brand.nombre_marca}» · nicho ${c.brand.nicho_core} · productos ${c.products.length} (${c.products.filter((p) => p.image_urls.length).length} con foto) · servicios ${c.services.length} · entidades ${c.entities.length}`);
    const m = org.markets?.[0]?.id; if (m) { const c2 = await S.contexto(org.id, m); ok('contexto por market_id', c2.brand?.nombre_marca || '—'); }
  } catch (e) { falla('contexto', e); }
  try {
    const p = await S.producciones(org.id, 'image', 50);
    ok('producciones image', `${p.length} con URL · ${p.filter((x) => x.file_id).length} con file_id`);
    const t = await S.producciones(org.id, null, 50); ok('producciones todas', `${t.length} · tipos ${[...new Set(t.map((x) => x.output_type))].join(',')}`);
  } catch (e) { falla('producciones', e); }
  if (!env('AISC_API_URL')) {
    try { await S.producir(org.id, 'imagen', { prompt: 'x' }); falla('producir sin borde', new Error('no falló')); } catch (e) { if (e.code === 'sin_api') ok('producir sin borde → sin_api con palabras', e.message); else falla('producir sin borde', e); }
    salta('lanzar imagen-directa', 'sin AISC_API_URL');
  } else if (env('PRODUCIR') === '1') {
    try {
      const r = await S.producir(org.id, 'imagen', { prompt: 'Un frasco de crema de maní sobre madera clara, luz de mañana', aspecto: '1:1', resolucion: '1K' }, { alCambiar: (c) => console.log('   …', c.status) });
      ok('lanzar imagen-directa', `corrida ${r.run_id} · salida ${r.salida?.file_id || '—'} · url ${r.salida?.url ? 'sí' : 'no'}`);
    } catch (e) { falla('lanzar imagen-directa', e); }
  } else salta('lanzar imagen-directa', 'PRODUCIR≠1');
  return fin();
}
function fin() { const n = (t) => pasos.filter((p) => p[0] === t).length; console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('SALTA')} SALTA`); process.exit(n('FALLA') ? 1 : 0); }
main().catch((e) => { falla('inesperado', e); fin(); });
