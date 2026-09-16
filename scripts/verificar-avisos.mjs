#!/usr/bin/env node
/**
 * Verificación de AVISOS (ADR-0054) contra la base nueva con un JWT real:
 * taxonomía (cada tipo activo tiene render en Avisos.js), contador de la
 * campana (unread_alerts), lista (alerts vivos), marcar uno ida y vuelta,
 * marcar todo (RPC), preferencias (upsert y borrado). Hasta que JC aplique la
 * 170000 el contador trae los 367 de v1 y marcar_avisos_leidos puede no existir:
 * se anota PENDIENTE, no fallo.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… node scripts/verificar-avisos.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (p, d = '') => { pasos.push(['OK', p]); console.log(`OK        ${p}${d ? ' — ' + d : ''}`); };
const falla = (p, e) => { pasos.push(['FALLA', p]); console.log(`FALLA     ${p} — ${e?.code || ''} ${e?.message || e}`); };
const pendiente = (p, d) => { pasos.push(['PENDIENTE', p]); console.log(`PENDIENTE ${p} — ${d}`); };
globalThis.window = globalThis; globalThis.document = { hidden: false, dispatchEvent() {} };
globalThis.window.__ = (k, p) => String(k).replace(/\{(\w+)\}/g, (_, n) => (p && p[n] != null ? p[n] : `{${n}}`));
new Function(readFileSync(new URL('../js/utils/markdown.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/services/AvisosDataService.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/components/Avisos.js', import.meta.url), 'utf8'))();
const D = globalThis.AvisosDatos; const A = globalThis.Avisos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
D._inyectarCliente(sb);
async function main() {
  let org, uid;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; uid = data.user.id; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG')) || ctx.data.organizations[0];
    ok('mi_contexto', org.name);
  } catch (e) { falla('login/contexto', e); return fin(); }
  let tipos = {};
  try {
    tipos = await D.tipos({ fresco: true });
    const activos = Object.values(tipos).filter((t) => t.is_active);
    const sinRender = activos.filter((t) => !A.RENDER[t.code]);
    const conParams = Object.values(tipos).filter((t) => Array.isArray(t.params) && t.params.length);
    ok('alert_types', `${Object.keys(tipos).length} tipos · ${activos.length} activos · ${conParams.length} con params · default_channels ${Object.values(tipos).some((t) => t.default_channels) ? 'sí' : 'NO (170000 sin aplicar)'}`);
    if (sinRender.length) falla('tipo activo sin render', new Error(sinRender.map((t) => t.code).join(', '))); else ok('todo tipo activo tiene render');
    // Los params del render son subconjunto de los del tipo (cuando la base ya los declara).
    const malos = conParams.filter((t) => A.RENDER[t.code]?.params?.some((k) => !t.params.includes(k)));
    if (malos.length) falla('render pide params que el tipo no declara', new Error(malos.map((t) => t.code).join(', '))); else if (conParams.length) ok('params del render ⊆ params del tipo');
  } catch (e) { falla('alert_types', e); }
  try {
    const c = await D.contador(org.id);
    if (c.total > 100) pendiente('campana en cero', `${c.total} sin leer (archivo del corte, 170000 sin aplicar)`); else ok('contador', `${c.total} sin leer · newest ${c.newest || '—'}`);
  } catch (e) { falla('contador', e); }
  let lista = [];
  try {
    lista = await D.lista(org.id, { estado: 'all', limite: 20 });
    ok('lista', `${lista.length} · ${lista.slice(0, 3).map((a) => `${a.type}${a.veces > 1 ? '×' + a.veces : ''}`).join(', ')}`);
    const traducidos = lista.filter((a) => A.texto(a).traducido).length;
    ok('render', `${traducidos} traducidos por tipo · ${lista.length - traducidos} con respaldo title/body`);
  } catch (e) { falla('lista', e); }
  const vivo = lista.find((a) => !a.is_read);
  if (!vivo) pendiente('marcar uno', 'no hay avisos sin leer');
  else {
    try {
      const r1 = await D.marcar(vivo, 'read'); if (!r1.read_at) throw new Error('read_at nulo');
      const r2 = await D.marcar({ ...vivo, is_delivered: true }, 'unread'); if (r2.read_at) throw new Error('no volvió a no leído');
      ok('marcar uno (leído → no leído)', `id ${vivo.id}`);
    } catch (e) { if (e.code === '23514') pendiente('marcar uno', `${e.code} el CHECK viejo exige delivered_at — lo relaja la 170000 (1f96cfc)`); else falla('marcar uno', e); }
  }
  try {
    const n = await D.marcarTodo(org.id, '2000-01-01T00:00:00Z');
    ok('marcar_avisos_leidos (hasta el año 2000 = 0 filas)', String(n));
  } catch (e) { if (e.code === 'PGRST202' || e.code === '42883') pendiente('marcar_avisos_leidos', `${e.code} (170000 sin aplicar)`); else falla('marcar_avisos_leidos', e); }
  try {
    const code = Object.keys(tipos)[0] || 'ops.job_dead';
    await D.guardarPreferencia(org.id, uid, code, { channels: ['in_app'], is_muted: false });
    const p1 = await D.preferencias(org.id); if (!p1[code]) throw new Error('no se guardó');
    await D.guardarPreferencia(org.id, uid, code, { channels: null, is_muted: false });
    const p2 = await D.preferencias(org.id); if (p2[code]) throw new Error('no se borró');
    ok('preferencia (upsert y volver al defecto)', code);
  } catch (e) { if (e.code === '22P02' || /email_digest|invalid input value/.test(e.message || '')) pendiente('preferencias', `${e.code} ${e.message} (enum 170000)`); else falla('preferencias', e); }
  return fin();
}
function fin() { const n = (t) => pasos.filter((p) => p[0] === t).length; console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('PENDIENTE')} PENDIENTE`); process.exit(n('FALLA') ? 1 : 0); }
main().catch((e) => { falla('inesperado', e); fin(); });
