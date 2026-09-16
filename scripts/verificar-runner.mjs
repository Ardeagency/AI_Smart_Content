#!/usr/bin/env node
/**
 * Verificación del RUNNER genérico del Studio (/studio/:flowSlug) contra la base
 * nueva con un JWT real: carga FlujosDataService y StudioDataService tal cual los
 * usa la consola y comprueba que cada flujo publicado del catálogo trae sus
 * entradas (flows.inputs) ya convertidas en campos que InputRegistry pinta, que
 * los kinds de la base son todos conocidos, que las corridas/salidas de la marca
 * se leen (ProduccionesDatos) y que lanzar sin borde falla con palabras. Con
 * AISC_API_URL y LANZAR=<slug> lanza ese flujo con sus valores por defecto.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_API_URL=…] [LANZAR=slug] node scripts/verificar-runner.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (p, d = '') => { pasos.push(['OK', p]); console.log(`OK     ${p}${d ? ' — ' + d : ''}`); };
const falla = (p, e) => { pasos.push(['FALLA', p]); console.log(`FALLA  ${p} — ${e?.code || ''} ${e?.message || e}`); };
const salta = (p, d) => { pasos.push(['SALTA', p]); console.log(`SALTA  ${p} — ${d}`); };
const pendiente = (p, d) => { pasos.push(['PENDIENTE', p]); console.log(`PEND.  ${p} — ${d}`); };
globalThis.window = globalThis; globalThis.document = { hidden: false };
for (const f of ['ApiV2', 'StudioDataService', 'FlujosDataService', 'ProduccionesDataService']) new Function(readFileSync(new URL(`../js/services/${f}.js`, import.meta.url), 'utf8'))();
const F = globalThis.FlujosDatos; const S = globalThis.StudioDatos; const P = globalThis.ProduccionesDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
F._inyectarCliente(sb); S._inyectarCliente(sb); P._inyectarCliente(sb);
globalThis.AISC_API_URL = env('AISC_API_URL');
let sesion = null;
globalThis.apiV2.configurar({ sesion: { actual: async () => sesion, refrescar: async () => sesion } });
const TIPOS_QUE_PINTA = new Set(['text', 'textarea', 'number', 'toggle', 'select', 'multi_select', 'file']);
async function main() {
  let org;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; sesion = data.session; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG')) || ctx.data.organizations[0];
    ok('mi_contexto', `${org.name} · créditos ${org.credits?.available}`);
  } catch (e) { falla('login/contexto', e); return fin(); }
  let flujos = [];
  try { flujos = await F.flujos(org.id); if (!flujos.length) throw new Error('catálogo vacío'); ok('catálogo', `${flujos.length} flujos · con slug ${flujos.filter((f) => f.slug).length}`); } catch (e) { falla('catálogo', e); }
  const kinds = new Set(); let sinEntradas = 0;
  for (const f of flujos) {
    try {
      const campos = await F.entradas(f.id, { elementos: [{ value: 'e', label: 'E' }], mercados: [{ value: 'm', label: 'M' }] });
      if (!campos.length) sinEntradas++;
      campos.forEach((c) => kinds.add(c.kind));
      const raros = campos.filter((c) => !TIPOS_QUE_PINTA.has(c.input_type));
      if (raros.length) throw new Error(`tipos sin pintor: ${raros.map((c) => c.kind + '→' + c.input_type).join(', ')}`);
      const sinOpciones = campos.filter((c) => c.input_type === 'select' && !c.options.length);
      ok(`entradas ${f.slug || f.id}`, `${campos.length} campos · obligatorios ${campos.filter((c) => c.required).length} · archivos ${campos.filter((c) => c.input_type === 'file').length}${sinOpciones.length ? ' · select SIN opciones: ' + sinOpciones.map((c) => c.key).join(',') : ''}`);
    } catch (e) { falla(`entradas ${f.slug || f.id}`, e); }
  }
  ok('kinds vistos', [...kinds].sort().join(', ') + (sinEntradas ? ` · ${sinEntradas} flujos sin entradas` : ''));
  try {
    const c = await P.corridas(org.id, { limite: 20 });
    ok('corridas', `${c.length} · con nombre ${c.filter((r) => r.content_flows?.name).length} · estados ${[...new Set(c.map((r) => r.status))].join(',')}`);
    const ids = c.slice(0, 5).map((r) => r.id);
    const s = ids.length ? await P.salidas(org.id, ids, { limite: 50 }) : [];
    ok('salidas de las últimas 5', `${s.length} · con url ${s.filter((x) => x.storage_path).length}`);
    const e = ids.length ? await P.entradas(org.id, ids) : [];
    ok('run_inputs de las últimas 5', `${e.length} filas · claves ${[...new Set(e.map((x) => x.key))].slice(0, 6).join(',')}`);
    if (ids[0]) { const una = await P.corrida(org.id, ids[0]); if (!una?.id) throw new Error('corrida por id vacía'); ok('corrida por id', `${una.status} · ${una.content_flows?.name || '—'}`); }
    try { await P.decidirCorrida('00000000-0000-0000-0000-000000000000', true); falla('decidir_corrida', new Error('no falló con id imposible')); }
    catch (e) { (e.code === 'sin_puerta' ? pendiente : ok)('flows.decidir_corrida', e.code === 'sin_puerta' ? 'espera la migración de BD' : `${e.code || ''} ${e.message}`); }
  } catch (e) { falla('corridas/salidas', e); }
  const slug = env('LANZAR');
  if (!env('AISC_API_URL')) {
    try { await S.lanzar(org.id, flujos[0]?.id, { prompt: 'x' }); falla('lanzar sin borde', new Error('no falló')); } catch (e) { if (e.code === 'sin_api') ok('lanzar sin borde → sin_api con palabras', e.message); else falla('lanzar sin borde', e); }
    salta('lanzar', 'sin AISC_API_URL');
  } else if (slug) {
    const f = flujos.find((x) => x.slug === slug);
    if (!f) falla('lanzar', new Error(`«${slug}» no está en el catálogo`));
    else {
      try {
        const campos = await F.entradas(f.id);
        const entradas = {}; campos.forEach((c) => { if (c.defaultValue != null) entradas[c.key] = c.defaultValue; });
        if (campos.some((c) => c.key === 'prompt')) entradas.prompt = 'Un frasco de crema de maní sobre madera clara, luz de mañana';
        const r = await S.lanzar(org.id, f.id, entradas);
        ok(`lanzar ${slug}`, `corrida ${r.run_id} · ${r.estado}`);
      } catch (e) { falla(`lanzar ${slug}`, e); }
    }
  } else salta('lanzar', 'sin LANZAR=<slug>');
  fin();
}
function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('PENDIENTE')} PENDIENTE · ${n('SALTA')} SALTA`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('inesperado', e); fin(); });
