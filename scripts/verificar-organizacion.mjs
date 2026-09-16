#!/usr/bin/env node
/**
 * Verificación de /organization contra la base nueva con un JWT real: carga
 * OrganizacionDataService (y PlanesDataService) tal cual los usa la consola y
 * recorre las cinco pestañas. Escrituras: zona horaria ida y vuelta, y
 * `guardar_ficha` con un DV inválido (la base debe rechazarlo con palabras,
 * sin guardar nada). Las puertas que la 190000 aún no abre se anotan como
 * PENDIENTE con su código, no como fallo de la consola.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_PRUEBA_ORG=<uuid>] node scripts/verificar-organizacion.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (paso, detalle = '') => { pasos.push(['OK', paso, detalle]); console.log(`OK        ${paso}${detalle ? ' — ' + detalle : ''}`); };
const falla = (paso, e) => { const m = e?.message || e?.error || String(e); pasos.push(['FALLA', paso, m]); console.log(`FALLA     ${paso} — ${e?.code || ''} ${m}`); };
const pendiente = (paso, d) => { pasos.push(['PENDIENTE', paso, d]); console.log(`PENDIENTE ${paso} — ${d}`); };

globalThis.window = globalThis;
globalThis.document = { hidden: false };
new Function(readFileSync(new URL('../js/services/ApiV2.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/services/PlanesDataService.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/services/OrganizacionDataService.js', import.meta.url), 'utf8'))();
const O = globalThis.OrganizacionDatos; const P = globalThis.PlanesDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
O._inyectarCliente(sb); P._inyectarCliente(sb);
globalThis.AISC_API_URL = env('AISC_API_URL');
globalThis.apiV2.configurar({ sesion: { actual: async () => null, refrescar: async () => null } });

async function main() {
  let uid;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; uid = data.user.id;
    ok('login', `uid ${uid.slice(0, 8)}…`);
  } catch (e) { falla('login', e); return fin(); }
  let org;
  try {
    const { data, error } = await sb.rpc('mi_contexto'); if (error) throw error;
    const orgs = data?.organizations || []; org = orgs.find((o) => o.id === env('AISC_PRUEBA_ORG')) || orgs[0];
    if (!org) throw new Error('sin marcas');
    ok('mi_contexto', `${org.name} · rol ${org.role}`);
  } catch (e) { falla('mi_contexto', e); return fin(); }

  // General
  let o;
  try { o = await O.organizacion(org.id); if (!o) throw new Error('vacío'); ok('organizacion', `«${o.name}» · tz ${o.timezone} · locale ${o.locale} · mfa ${o.mfa_required} · plan ${o.plan} · owner ${String(o.owner_user_id).slice(0, 8)}…`); } catch (e) { falla('organizacion', e); return fin(); }
  try {
    const r1 = await O.actualizarOrganizacion(org.id, { timezone: o.timezone === 'America/Bogota' ? 'America/Mexico_City' : 'America/Bogota' });
    if (r1.timezone === o.timezone) throw new Error('no cambió');
    const r2 = await O.actualizarOrganizacion(org.id, { timezone: o.timezone });
    if (r2.timezone !== o.timezone) throw new Error('no volvió');
    ok('actualizarOrganizacion (timezone ida y vuelta)');
  } catch (e) { falla('actualizarOrganizacion', e); }
  try { const m = await O.mercados(org.id); ok('mercados', m.map((x) => `${x.nombre_marca}${x.is_primary ? '*' : ''} ${JSON.stringify(x.mercado_objetivo)}`).join(' · ') || '0'); } catch (e) { falla('mercados', e); }
  try { const c = await O.centroDeControl(org.id); ok('centroDeControl', JSON.stringify(c)); } catch (e) { falla('centroDeControl', e); }
  try { const r = await O.resumen(org.id, { name: 'Pro', credits_monthly: 3000 }, []); if (r?.pendiente) pendiente('resumen_de_marca', `${r.codigo} ${r.mensaje} (190000 sin aplicar)`); else ok('resumen_de_marca', `créditos ${JSON.stringify(r.creditos)} · vigilados ${r.vigilancia.total} · audiencias ${r.audiencias.total}`); } catch (e) { falla('resumen', e); }

  // Miembros
  try {
    const eq = await O.equipo(org.id);
    if (!eq.length) throw new Error('equipo vacío');
    const yo = eq.find((m) => m.user_id === uid);
    if (!yo) throw new Error('no me veo en el equipo');
    ok('equipo', `${eq.length} miembros · yo ${yo.role} con ${yo.permisos.length} permisos · último acceso ${yo.ultimo_acceso ? 'sí' : 'no'}`);
  } catch (e) { falla('equipo', e); }
  try { await O.invitar(org.id, 'nadie-verificacion@aismartcontent.io', 'viewer'); falla('invitar sin cuenta', new Error('no rechazó')); } catch (e) { if (e.code === 'sin_cuenta') ok('invitar sin cuenta → con palabras', e.message.slice(0, 60) + '…'); else falla('invitar sin cuenta', e); }

  // Suscripción
  try {
    const f = await O.facturacion(org.id);
    if (!f) throw new Error('vacío');
    ok('facturacion', `plan ${f.plan?.name} · sub ${f.sub?.status} · saldo ${f.creditos?.disponibles} · facturas ${f.invoices.length} · pagos ${f.payments.length} · ficha ${f.fichaSinPermiso ? 'SIN PERMISO' : (f.ficha.legal_name || 'vacía')} · puede_facturar ${f.puedeFacturar.puede} falta ${f.puedeFacturar.falta.length}`);
  } catch (e) { falla('facturacion', e); }
  try {
    await O.guardarFicha(org.id, { legal_name: 'Prueba', tax_id: '900123456', tax_id_dv: '9', country: 'CO', taxpayer_kind: 'persona_juridica', billing_email: 'x@y.z', address_line: 'calle', city: 'Medellín' });
    falla('guardar_ficha DV inválido', new Error('la base aceptó un DV inválido'));
  } catch (e) { if (/dv|d[ií]gito|verificaci/i.test(e.message || '')) ok('guardar_ficha rechaza DV inválido con palabras', e.message.slice(0, 80)); else falla('guardar_ficha DV inválido', e); }

  // Uso
  try {
    const hasta = new Date(); const desde = new Date(hasta.getTime() - 29 * 86400000);
    const u = await O.uso(org.id, desde, hasta, 2262);
    if (u.pendiente) pendiente('uso (usage_records)', `${u.codigo}${u.sinPermiso ? ' sin ver_facturacion' : ''}`);
    else ok('uso 30 días', `${u.events} consumos · ${u.total.toFixed(2)} cr · áreas ${JSON.stringify(u.byArea)} · previo ${u.previo.toFixed(2)} · miembros ${u.porMiembro.length}`);
    const u2 = await O.uso(org.id, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'), 2262);
    ok('uso agosto', `${u2.events} consumos · ${u2.total.toFixed(2)} cr · top ${u2.topAreaKey}`);
  } catch (e) { falla('uso', e); }

  // Seguridad
  try { const n = await O.notificaciones(org.id, 5); ok('notificaciones (alerts)', `${n.length} · ${n[0] ? `${n[0].severity} «${n[0].title}»` : ''}`); } catch (e) { falla('notificaciones', e); }
  try { const a = await O.actividad(org.id, 5); if (a.pendiente) pendiente('historial_de_marca', `${a.codigo} ${a.mensaje} (190000 sin aplicar)`); else ok('historial_de_marca', `${a.eventos.length} eventos`); } catch (e) { falla('actividad', e); }
  return fin();
}
function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('PENDIENTE')} PENDIENTE (migración 190000)`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('inesperado', e); fin(); });
