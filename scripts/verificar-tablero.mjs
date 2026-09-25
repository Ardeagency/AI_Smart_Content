#!/usr/bin/env node
/**
 * Verificación del TABLERO (/dashboard) contra la base nueva con un JWT real:
 * carga TableroDataService tal cual lo usa la consola y mide lecturas de Vera
 * (marketing.readings: prosa viva o bloques heredados), tendencias (vista 190000
 * o respaldo intel.trends), huecos (intel.content_gaps), competencia (social.profiles
 * + intel.signals) y que «Lo hice» (PATCH acted_on) pasa el grant. Con ACTUAR=1
 * marca la lectura más antigua NO atendida y la deja marcada (dispara estrategia.producir).
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… [ACTUAR=1] node scripts/verificar-tablero.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (p, d = '') => { pasos.push(['OK', p]); console.log(`OK     ${p}${d ? ' — ' + d : ''}`); };
const falla = (p, e) => { pasos.push(['FALLA', p]); console.log(`FALLA  ${p} — ${e?.code || ''} ${e?.message || e}`); };
const pendiente = (p, d) => { pasos.push(['PENDIENTE', p]); console.log(`PEND.  ${p} — ${d}`); };
const salta = (p, d) => { pasos.push(['SALTA', p]); console.log(`SALTA  ${p} — ${d}`); };
globalThis.window = globalThis;
new Function(readFileSync(new URL('../js/services/TableroDataService.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/components/LecturaVera.js', import.meta.url), 'utf8'))();
const T = globalThis.TableroDatos; const L = globalThis.LecturaVera;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
T._inyectarCliente(sb);
async function main() {
  let org;
  try {
    const { error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG')) || ctx.data.organizations[0];
    ok('mi_contexto', `${org.name} · ver_contenido ${org.permissions?.includes('ver_contenido')}`);
  } catch (e) { falla('login/contexto', e); return fin(); }
  let r;
  try {
    r = await T.resumen(org.id);
    const lec = r.lecturas;
    ok('lecturas (diagnosis+recommendation)', `${lec.length} · de v1 ${lec.filter((l) => l.de_v1).length} · con prosa ${lec.filter((l) => l.prosa).length} · con movidas ${lec.filter((l) => l.movidas.length).length} · atendidas ${lec.filter((l) => l.acted_on).length}`);
    ok('observaciones', `${r.observaciones.length} · con bloques ${r.observaciones.filter((l) => l.bloques.length).length}`);
    const html = [...lec, ...r.observaciones].map((l) => L.lectura(l, { accion: true })).join('');
    if (/<script|onerror=/i.test(html)) throw new Error('la lectura pintó markup sin escapar');
    ok('pintar lecturas', `${html.length} caracteres de HTML escapado`);
    (r.tendenciasFuente === 'tendencias_vivas' ? ok : pendiente)('tendencias', `${r.tendencias.length} · fuente ${r.tendenciasFuente}${r.tendenciasFuente === 'trends' ? ' (intel.tendencias_vivas espera la 190000)' : ''} · fuentes ${[...new Set(r.tendencias.map((t) => t.fuente))].join(',')}`);
    if (r.tendencias[0]) { const s = await T.serie(r.tendencias[0].id); ok('serie de una tendencia', `${s.length} lecturas`); }
    ok('huecos', `${r.huecos.length} · mejor «${r.huecos[0]?.phrase || '—'}» ${Math.round((r.huecos[0]?.gap_score || 0) * 100)}%`);
    ok('competencia', `rivales ${r.competencia.rivales} · propios ${r.competencia.propios} · señales ${r.competencia.senales.length} (${[...new Set(r.competencia.senales.map((s) => s.kind))].join(',')})`);
  } catch (e) { falla('resumen', e); }
  try {
    const todas = await T.lecturas(org.id, { kinds: ['diagnosis', 'recommendation'], limite: 100 });
    const cand = todas.filter((l) => !l.acted_on).slice(-1)[0];
    if (!cand) salta('actuar', 'todas atendidas');
    else if (env('ACTUAR') !== '1') {
      // Sin ACTUAR=1 solo se prueba el grant con un PATCH que no cambia nada (acted_on=false→false no existe: se salta).
      salta('actuar', `hay ${todas.filter((l) => !l.acted_on).length} sin atender; ACTUAR=1 marca «${cand.headline.slice(0, 50)}»`);
    } else {
      const l = await T.actuar(cand.id, 'verificar-tablero.mjs');
      if (!l?.acted_on) throw new Error('el PATCH no devolvió acted_on=true (¿RLS sin returning?)');
      ok('actuar (PATCH acted_on)', `«${l.headline.slice(0, 50)}» atendida ${l.acted_at}`);
    }
  } catch (e) { if (e?.code === '42501') pendiente('actuar', `42501 ${e.message}`); else falla('actuar', e); }
  fin();
}
function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('PENDIENTE')} PENDIENTE · ${n('SALTA')} SALTA`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('inesperado', e); fin(); });
