#!/usr/bin/env node
/**
 * Verificación de VERA contra la base nueva con un JWT real: agentes, listar
 * conversaciones, crear una, leer mensajes, renombrar, borrar (sin rastro), y
 * que enviar sin borde falla con palabras. Con AISC_API_URL y HABLAR=1 manda un
 * mensaje real y espera la respuesta (cuesta créditos).
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… [AISC_API_URL=…] [HABLAR=1] node scripts/verificar-vera.mjs
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
new Function(readFileSync(new URL('../js/services/VeraDataService.js', import.meta.url), 'utf8'))();
const V = globalThis.VeraDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
V._inyectarCliente(sb);
globalThis.AISC_API_URL = env('AISC_API_URL');
let sesion = null;
globalThis.apiV2.configurar({ sesion: { actual: async () => sesion, refrescar: async () => sesion } });
async function main() {
  let org, uid;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; sesion = data.session; uid = data.user.id; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG')) || ctx.data.organizations[0];
    ok('mi_contexto', `${org.name} · conversar_con_agente ${org.permissions.includes('conversar_con_agente')}`);
  } catch (e) { falla('login/contexto', e); return fin(); }
  let ag;
  try { ag = await V.agente(org.id); if (!ag) throw new Error('sin agente activo'); ok('agente', `«${ag.name}» ${ag.autonomy} ${ag.model}`); } catch (e) { falla('agente', e); }
  try { const l = await V.conversaciones(org.id, { mias: false, limite: 5 }); ok('conversaciones de la marca', `${l.length} (5 máx) · ${l[0] ? `«${l[0].title || 'sin título'}» ${l[0].updated_at}` : ''}`); const m = await V.conversaciones(org.id, { mias: true, userId: uid, limite: 5 }); ok('mis conversaciones', String(m.length)); } catch (e) { falla('conversaciones', e); }
  let conv = null;
  try {
    conv = await V.crearConversacion(org.id, { userId: uid, title: 'verificación' });
    if (!conv?.id) throw new Error('sin id');
    ok('crearConversacion', conv.id.slice(0, 8) + '…');
    const msgs = await V.mensajes(conv.id); ok('mensajes (vacía)', String(msgs.length));
    const r = await V.renombrar(conv.id, 'verificación renombrada'); ok('renombrar', r?.title || '—');
    const nuevos = await V.respuestasNuevas(conv.id, new Set()); ok('respuestasNuevas (vacía)', String(nuevos.length));
  } catch (e) { falla('conversación', e); }
  if (conv) {
    if (!env('AISC_API_URL')) { try { await V.enviar(conv.id, 'hola'); falla('enviar sin borde', new Error('no falló')); } catch (e) { if (e.code === 'sin_api') ok('enviar sin borde → sin_api con palabras', e.message); else falla('enviar sin borde', e); } }
    else if (env('HABLAR') === '1') {
      try {
        const r = await V.enviar(conv.id, 'Hola Vera, ¿qué sabes de esta marca? Responde en una frase.');
        ok('enviar', `turno ${r.turno_id} · ${r.estado}`);
        let resp = null; const inicio = Date.now();
        while (!resp && Date.now() - inicio < 120000) { await new Promise((r2) => setTimeout(r2, 5000)); const n = await V.respuestasNuevas(conv.id, new Set()); resp = n[0] || null; }
        if (resp) ok('respuesta de Vera', resp.content.slice(0, 80)); else falla('respuesta de Vera', new Error('sin respuesta en 2 min'));
      } catch (e) { falla('enviar', e); }
    } else salta('enviar', 'HABLAR≠1');
    try { const b = await V.borrar(conv.id); if (!b) throw new Error('no borró'); ok('borrar (sin rastro)'); } catch (e) { falla('borrar', e); }
  }
  try { const u = await V.universo(org.id); ok('universo del omnibox', Object.entries(u).map(([k, v]) => `${k} ${v.length}`).join(' · ')); } catch (e) { falla('universo', e); }
  return fin();
}
function fin() { const n = (t) => pasos.filter((p) => p[0] === t).length; console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('SALTA')} SALTA`); process.exit(n('FALLA') ? 1 : 0); }
main().catch((e) => { falla('inesperado', e); fin(); });
