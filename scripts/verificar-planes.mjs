#!/usr/bin/env node
/**
 * Verificación de /plans y /credits contra la base nueva con un JWT real: carga
 * PlanesDataService tal cual lo usa la consola y comprueba lo que las vistas
 * pintan (planes con precio, plan actual, acceso, saldo, almacenamiento,
 * paquetes, puede_facturar) y que la compra está cerrada con palabras
 * (candado ADR-0042). Solo lectura.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_PRUEBA_ORG=<uuid>] [AISC_API_URL=…] node scripts/verificar-planes.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (paso, detalle = '') => { pasos.push(['OK', paso, detalle]); console.log(`OK     ${paso}${detalle ? ' — ' + detalle : ''}`); };
const falla = (paso, e) => { const m = e?.message || e?.error || String(e); pasos.push(['FALLA', paso, m]); console.log(`FALLA  ${paso} — ${e?.code || ''} ${m}`); };

globalThis.window = globalThis;
globalThis.document = { hidden: false };
new Function(readFileSync(new URL('../js/services/ApiV2.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/services/PlanesDataService.js', import.meta.url), 'utf8'))();
const P = globalThis.PlanesDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
P._inyectarCliente(sb);
globalThis.AISC_API_URL = env('AISC_API_URL');
let sesion = null;
globalThis.apiV2.configurar({ sesion: { actual: async () => sesion, refrescar: async () => sesion } });

async function main() {
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error;
    sesion = data.session;
    ok('login', `uid ${data.user.id.slice(0, 8)}…`);
  } catch (e) { falla('login', e); return fin(); }
  let org;
  try {
    const { data, error } = await sb.rpc('mi_contexto');
    if (error) throw error;
    const orgs = data?.organizations || [];
    org = orgs.find((o) => o.id === env('AISC_PRUEBA_ORG')) || orgs[0];
    if (!org) throw new Error('sin marcas');
    ok('mi_contexto', `${org.name} · plan ${org.plan} · créditos ${org.credits?.available}`);
  } catch (e) { falla('mi_contexto', e); return fin(); }

  try {
    const d = await P.cargar(org.id);
    if (!d) throw new Error('cargar() vacío');
    if (!d.plans.length) throw new Error('sin planes');
    ok('planes', d.plans.map((p) => `${p.id} $${p.price_usd_month ?? '—'}/mes (${p.features.capacidades.length} cap., ${p.sin_limite_almacenamiento ? 'sin límite' : p.storage_mb + ' MB'})`).join(' · '));
    if (!d.plans.some((p) => p.id === 'free')) throw new Error('free no se muestra');
    if (d.plans.some((p) => p.id === 'starter')) throw new Error('starter sin precio se muestra');
    if (!d.currentPlan) throw new Error('sin plan actual');
    ok('plan actual', `${d.currentPlan.name} · suscripción ${d.currentSubscription?.status} · renueva ${d.currentSubscription?.current_period_end || '—'}`);
    if (!d.acceso || typeof d.acceso.acceso !== 'boolean') throw new Error('acceso_por_suscripcion sin forma');
    ok('acceso_por_suscripcion', `${d.acceso.estado} · bloquea ${d.acceso.bloquea}`);
    if (Math.abs(d.orgCredits.credits_available - Number(org.credits?.available)) > 0.001) throw new Error(`available ${d.orgCredits.credits_available} ≠ contexto ${org.credits?.available}`);
    ok('créditos = contexto', `${d.orgCredits.credits_available} de ${d.orgCredits.credits_total}`);
    ok('almacenamiento', `${d.orgStorage.used_mb} MB en ${d.orgStorage.archivos} archivos · tope ${d.orgStorage.max_mb ?? 'sin límite'}`);
  } catch (e) { falla('cargar()', e); }

  try {
    const packs = await P.paquetes();
    if (!packs.length) throw new Error('sin paquetes');
    ok('paquetes', packs.map((p) => `${p.id} ${p.credits}cr ${p.price} ${p.currency}`).join(' · '));
  } catch (e) { falla('paquetes', e); }

  try { const r = await P.puedeFacturar(org.id); ok('puede_facturar', `${r.puede} · falta ${JSON.stringify(r.falta)}`); } catch (e) { falla('puede_facturar', e); }

  try {
    await P.iniciarCompra(org.id, 'pack_mini');
    falla('candado de compra', new Error('iniciarCompra NO estaba cerrado'));
  } catch (e) {
    if (e.code === 'pagos_no_habilitados' || e.code === 'sin_api') ok('candado de compra (ADR-0042)', `${e.code}: ${e.message}`);
    else falla('candado de compra', e);
  }
  ok('cambiar de plan sin puerta', String(P.puedeCambiarPlan()));
  return fin();
}
function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('inesperado', e); fin(); });
