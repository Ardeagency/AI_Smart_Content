#!/usr/bin/env node
/**
 * Recorrido de verificación del CORTE (ADR-0052), por API con JWT real — lo que
 * la consola hace por debajo, paso a paso, anotando OK/FALLA con el error exacto.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_API_URL=http://127.0.0.1:3100 \
 *   AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… [AISC_PRUEBA_ORG=<uuid>] [AISC_PRUEBA_CONVERSACION=<uuid>] \
 *   [PRODUCIR=1] node scripts/verificar-corte.mjs
 *
 * Nunca imprime la clave ni el JWT. PRODUCIR=1 lanza `imagen-directa` (cuesta ~0,09 USD).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (paso, detalle = '') => { pasos.push(['OK', paso, detalle]); console.log(`OK     ${paso}${detalle ? ' — ' + detalle : ''}`); };
const falla = (paso, e) => { const m = e?.message || e?.error || String(e); pasos.push(['FALLA', paso, m]); console.log(`FALLA  ${paso} — ${m}`); };
const salta = (paso, por) => { pasos.push(['SALTA', paso, por]); console.log(`SALTA  ${paso} — ${por}`); };

// ApiV2 tal cual lo usa la consola (IIFE de navegador cargado en Node).
globalThis.window = globalThis;
globalThis.document = { hidden: false };
new Function(readFileSync(new URL('../js/services/ApiV2.js', import.meta.url), 'utf8'))();
const { api, configurar, ErrorApi } = globalThis.apiV2;

const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
globalThis.AISC_API_URL = env('AISC_API_URL');

let sesion = null;
configurar({ sesion: { actual: async () => sesion, refrescar: async () => { const { data } = await sb.auth.refreshSession(); sesion = data?.session || sesion; return sesion; } } });

async function main() {
  // 1) Login
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error;
    sesion = data.session;
    ok('login (password)', `uid ${data.user.id.slice(0, 8)}…`);
  } catch (e) { falla('login (password)', e); return fin(); }

  // 2) mi_contexto
  let ctx = null; let org = null;
  try {
    const { data, error } = await sb.rpc('mi_contexto');
    if (error) throw error;
    ctx = data;
    const orgs = ctx?.organizations || [];
    org = orgs.find((o) => o.id === env('AISC_PRUEBA_ORG')) || orgs[0];
    if (!org) throw new Error('mi_contexto sin organizations');
    ok('mi_contexto()', `${orgs.length} marca(s); activa ${org.name} · rol ${org.role} · ${org.permissions.length} permisos · créditos ${org.credits?.available} · ${org.markets?.length} mercados · ${org.colores?.length} colores`);
  } catch (e) { falla('mi_contexto()', e); return fin(); }
  try { const { data, error } = await sb.rpc('marcar_presencia'); if (error) throw error; ok('marcar_presencia()', String(data)); } catch (e) { falla('marcar_presencia()', e); }

  // 3) Cascarón: avisos, pendientes de Vera, catálogo, planes, storage
  const cuenta = async (paso, q) => { try { const { count, error } = await q; if (error) throw error; ok(paso, `${count} filas`); } catch (e) { falla(paso, e); } };
  await cuenta('alerts (no leídos)', sb.from('alerts').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).is('read_at', null));
  await cuenta('ai.pending_actions (pendientes)', sb.schema('ai').from('pending_actions').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).is('decided_at', null));
  await cuenta('flows.categories', sb.schema('flows').from('categories').select('id', { count: 'exact', head: true }).eq('is_active', true));
  await cuenta('flows.catalog_view (published)', sb.schema('flows').from('catalog_view').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('show_in_catalog', true));
  await cuenta('flows.saves (org)', sb.schema('flows').from('saves').select('flow_id', { count: 'exact', head: true }).eq('organization_id', org.id));
  await cuenta('billing.plans', sb.schema('billing').from('plans').select('tier', { count: 'exact', head: true }));
  await cuenta('storage_usage (org)', sb.from('storage_usage').select('gb', { count: 'exact', head: true }).eq('organization_id', org.id));
  // Aislamiento: la org ajena da 0 filas sin error
  const ajena = (ctx.organizations || []).find((o) => o.id !== org.id);
  try {
    const { data, error } = await sb.from('elements_full').select('organization_id').eq('organization_id', 'a1000000-0000-0000-0000-000000000001').limit(5);
    if (error) throw error;
    const esMiembroDeIgnis = (ctx.organizations || []).some((o) => o.id === 'a1000000-0000-0000-0000-000000000001');
    if (!esMiembroDeIgnis && data.length) throw new Error(`FUGA: ${data.length} filas de IGNIS sin ser miembro`);
    ok('aislamiento elements_full', esMiembroDeIgnis ? 'miembro de IGNIS: no prueba aislamiento' : '0 filas de IGNIS');
  } catch (e) { falla('aislamiento elements_full', e); }
  void ajena;

  // 4) Borde /v1 con JWT real
  if (!globalThis.AISC_API_URL) { salta('/v1', 'sin AISC_API_URL'); return fin(); }
  try { const s = await api.salud(); ok('GET /salud', JSON.stringify(s).slice(0, 80)); } catch (e) { falla('GET /salud', e); }
  try { const a = await api.aprobaciones(org.id); ok('GET /v1/aprobaciones', `${Array.isArray(a) ? a.length : '?'} aprobaciones`); } catch (e) { falla('GET /v1/aprobaciones', e); }
  try { const g = await api.sesionGaleria(org.id); ok('POST /v1/sesion/galeria', JSON.stringify(g).slice(0, 60) + ' (cookie no aplica en 127.0.0.1)'); } catch (e) { falla('POST /v1/sesion/galeria', e); }
  try { const i = await api.integraciones(org.id); ok('GET /v1/integraciones', `${Array.isArray(i) ? i.length : '?'} integraciones`); } catch (e) { falla('GET /v1/integraciones', e); }
  try { const f = await api.archivos(org.id); ok('GET /v1/archivos', `${Array.isArray(f) ? f.length : '?'} archivos`); } catch (e) { falla('GET /v1/archivos', e); }
  try { await api.aprobaciones('00000000-0000-0000-0000-000000000000'); falla('org ajena → 404', 'respondió 200'); } catch (e) { if (e instanceof ErrorApi && (e.http === 404 || e.http === 403)) ok('org ajena → 404', `${e.http} ${e.codigo}`); else falla('org ajena → 404', e); }

  // 5) Studio: imagen-directa como corrida
  if (env('PRODUCIR') !== '1') { salta('imagen-directa', 'PRODUCIR=1 para lanzar (~0,09 USD)'); }
  else {
    try {
      const { data: flujos, error } = await sb.schema('flows').from('catalog_view').select('id, slug').is('organization_id', null).eq('slug', 'imagen-directa').limit(1);
      if (error) throw error;
      const flujo = flujos?.[0]; if (!flujo) throw new Error('imagen-directa no está en catalog_view');
      const idCliente = globalThis.apiV2.nuevoIdCliente();
      const lanzada = await api.lanzarFlujo(flujo.id, org.id, { prompt: 'Una taza de café sobre una mesa de madera, luz de mañana, fotografía de producto', aspecto: '1:1', resolucion: '1K' }, idCliente);
      ok('POST /v1/flujos/imagen-directa/lanzar', `run ${String(lanzada.run_id || lanzada.id || '').slice(0, 8)}…`);
      const runId = lanzada.run_id || lanzada.id;
      const fin_ = await api.esperarCorrida(runId, org.id, { intervaloMs: 4000, topeMs: 5 * 60 * 1000, alCambiar: (c) => process.stdout.write(`   … ${c.status}\r`) });
      if (fin_.status !== 'succeeded') throw new Error(`corrida ${fin_.status}: ${fin_.error || fin_.motivo || JSON.stringify(fin_).slice(0, 160)}`);
      const salida = (fin_.salidas || fin_.outputs || [])[0];
      ok('esperarCorrida → succeeded', `${(fin_.salidas || []).length} salida(s); kind ${salida?.kind} · file_id ${String(salida?.metadata?.file_id || '').slice(0, 8)}… · costo ${salida?.metadata?.costo_usd ?? '?'} USD`);
      const fileId = salida?.metadata?.file_id;
      if (!fileId) throw new Error('la salida no trae metadata.file_id');
      const d = await api.urlDescarga(fileId, org.id);
      const r = await fetch(d.url, { method: 'HEAD' });
      ok('GET /v1/archivos/:id/descarga', `prefirmada ${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-length')}B`);
    } catch (e) { falla('imagen-directa end-to-end', e); }
  }

  // 6) Vera
  let conv = env('AISC_PRUEBA_CONVERSACION');
  if (!conv) {
    // Sin ruta en /v1 para crear: insert en ai.conversations con el JWT (backend, 15/09).
    try {
      const { data, error } = await sb.schema('ai').from('conversations')
        .insert({ organization_id: org.id, agent_id: env('AISC_PRUEBA_AGENTE', '35caaa09-4873-40db-bd14-7c7e7be2efae'), title: 'Verificación del corte' })
        .select('id').single();
      if (error) throw error;
      conv = data.id; ok('insert ai.conversations', `conversación ${conv.slice(0, 8)}…`);
    } catch (e) { falla('insert ai.conversations', e); }
  }
  if (!conv) salta('Vera /v1/conversaciones/:id/mensajes', 'sin conversación');
  else {
    try {
      const r = await api.enviarMensaje(conv, 'Hola Vera, ¿qué sabes de mi marca? Responde en una línea.');
      ok('POST /v1/conversaciones/:id/mensajes', `mensaje ${String(r.mensaje_id || '').slice(0, 8)}… turno ${String(r.turno_id || '').slice(0, 8)}…`);
      // La respuesta llega por la tabla: sondeo simple 90 s.
      const inicio = Date.now(); let respuesta = null;
      while (Date.now() - inicio < 90_000 && !respuesta) {
        await new Promise((res) => setTimeout(res, 5000));
        const { data } = await sb.schema('ai').from('messages').select('id, role, content, created_at').eq('conversation_id', conv).order('created_at', { ascending: false }).limit(1);
        if (data?.[0] && data[0].role !== 'user') respuesta = data[0];
      }
      if (respuesta) ok('Vera respondió', String(respuesta.content || '').slice(0, 120));
      else falla('Vera respondió', 'sin respuesta en 90 s (¿worker agents arriba? ¿saldo Anthropic?)');
    } catch (e) { falla('Vera', e); }
  }
  fin();
}

function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\nRESULTADO: ${n('OK')} OK · ${n('FALLA')} FALLA · ${n('SALTA')} saltados`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('recorrido', e); fin(); });
