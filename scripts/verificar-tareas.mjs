#!/usr/bin/env node
/**
 * Verificación de TAREAS (/tasks, programaciones de flujos) contra la base nueva con un
 * JWT real: carga FlujosDataService y TareasDataService tal cual los usa la consola y
 * recorre leer → crear (EN PAUSA) → editar → vista previa de entradas → activar → pausar
 * → duplicar → borrar, y deja la base como estaba (borra lo que crea aunque algo falle).
 *
 * NO lanza corridas: pg_cron toma cada minuto las programaciones activas con next_run_at
 * vencido. La de prueba usa un cron que no vuelve hasta el 1 de enero a las 03:00, se
 * activa solo un instante y se comprueba que la próxima quedó en el futuro.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_PRUEBA_ORG=uuid] [AISC_PRUEBA_VIEWER_EMAIL=… AISC_PRUEBA_VIEWER_CLAVE=…] \
 *   node scripts/verificar-tareas.mjs
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
for (const f of ['FlujosDataService', 'TareasDataService']) new Function(readFileSync(new URL(`../js/services/${f}.js`, import.meta.url), 'utf8'))();
const F = globalThis.FlujosDatos; const T = globalThis.TareasDatos; const M = T.mapeo;
const opcionesSb = { auth: { persistSession: false, autoRefreshToken: false } };
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), opcionesSb);
F._inyectarCliente(sb); T._inyectarCliente(sb);
const WAKEUP = 'e2477719-d65e-422a-a5aa-3473d6536060';
const CRON_LEJANO = '0 3 1 1 *';
const creadas = [];

async function main() {
  let org; let userId;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO', env('AISC_PRUEBA_EMAIL')), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; userId = data.user.id; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG', WAKEUP));
    if (!org) throw new Error('la cuenta de prueba no está en la marca pedida');
    ok('mi_contexto', org.name);
  } catch (e) { falla('login/contexto', e); return fin(); }

  let antes;
  try { antes = await T.programaciones(org.id); ok('leer programaciones', `${antes.length} · activas ${antes.filter((p) => p.activa).length} · heredadas de v1 ${antes.filter((p) => p.heredada).length}`); }
  catch (e) { falla('leer programaciones', e); return fin(); }

  let flujo; let campos; let opciones;
  try {
    opciones = await T.opcionesDeMarca(org.id);
    ok('opciones de la marca', `${opciones.elementos.length} elementos · ${opciones.mercados.length} mercados`);
    const lista = await T.flujos(org.id);
    // El de imagen: entradas simples (prompt obligatorio, aspecto select, referencias de archivo).
    flujo = lista.find((f) => f.slug === 'imagen-directa') || lista[0];
    if (!flujo) throw new Error('catálogo vacío');
    campos = await T.entradasDelFlujo(flujo.id, { elementos: opciones.elementos, mercados: opciones.mercados });
    ok('flujo y entradas', `${flujo.slug} · ${campos.map((c) => `${c.key}:${c.kind}[${M.modosPara(c.kind).join('|')}]`).join(' ')}`);
  } catch (e) { falla('flujo/entradas', e); return fin(); }

  let p;
  try {
    const formularios = { prompt: { modo: 'rotar', valores: 'Un frasco sobre madera clara\nEl frasco en la mano, luz de mañana' } };
    if (campos.some((c) => c.key === 'aspecto')) formularios.aspecto = { modo: 'fijo', valor: '4:5' };
    const { entradas, errores } = M.componerEntradas({}, campos, formularios);
    if (errores.length) throw new Error(JSON.stringify(errores));
    p = await T.crear(org.id, userId, { flowId: flujo.id, nombre: 'Prueba verificar-tareas (borrar)', cron: CRON_LEJANO, zona: 'America/Bogota', entradas, marketId: opciones.mercados[0]?.value || null });
    creadas.push(p.id);
    if (p.activa) throw new Error('se creó ACTIVA');
    ok('crear en pausa', `${p.id} · ${p.flujo} · «${M.describirCron(p.cron)}» · próxima ${p.proxima}`);
  } catch (e) { falla('crear', e); return limpiar(); }

  try {
    const leida = await T.programacion(org.id, p.id);
    if (!leida || leida.nombre !== p.nombre) throw new Error('no se relee');
    ok('releer por id', `${leida.estado} · entradas ${Object.keys(leida.entradas).join(',')}`);
  } catch (e) { falla('releer', e); }

  try {
    const e2 = M.componerEntradas(p.entradas, campos, { prompt: { modo: 'fijo', valor: 'Un frasco sobre mármol' }, aspecto: { modo: 'por_defecto' } }).entradas;
    const g = await T.guardar(p.id, { nombre: 'Prueba verificar-tareas (editada)', cron: '30 4 1 1 *', entradas: e2, alNoPoder: 'omitir' });
    if (g.cron !== '30 4 1 1 *' || g.entradas.prompt?.modo !== 'fijo' || 'aspecto' in g.entradas) throw new Error('no guardó lo pedido');
    ok('editar nombre, cron y entradas', `«${g.nombre}» · ${g.cron} · ${JSON.stringify(g.entradas)}`);
  } catch (e) { falla('editar', e); }

  try {
    // La base solo valida el cron al calcular la próxima (trigger, solo si queda ACTIVA): en
    // pausa acepta cualquier cosa. El guardia es validarCron en la consola.
    await T.guardar(p.id, { cron: '0 9 * * 7' });
    await T.guardar(p.id, { cron: '30 4 1 1 *' });
    pendiente('la base NO valida el cron en pausa', 'acepta «0 9 * * 7» (domingo = 7); lo para validarCron en la consola');
  } catch (e) { ok('la base rechaza un cron inválido con palabras', `${e.code} ${e.message}`); }
  if (M.validarCron('0 9 * * 7') === '') falla('validarCron local', new Error('acepta 7 como día')); else ok('validarCron local coincide', M.validarCron('0 9 * * 7'));

  try {
    await T.guardar(p.id, { zona: 'GMT-5' });
    falla('zona inválida', new Error('la base la aceptó'));
  } catch (e) { (e.code === '22023' ? ok : falla)('la base rechaza una zona que no es IANA', e.message); }

  try {
    const v = await T.previa(p.id);
    ok('vista previa (resolver_entradas)', `puede ${v.puede} · valores ${JSON.stringify(v.valores)} · faltan ${JSON.stringify(v.faltan)}`);
  } catch (e) { falla('vista previa', e); }

  try {
    const a = await T.activar(p.id, true);
    const futuro = a.proxima && new Date(a.proxima).getTime() > Date.now() + 24 * 3600 * 1000;
    const b = await T.activar(p.id, false);
    if (!a.activa || !futuro) throw new Error(`activa ${a.activa} · próxima ${a.proxima}`);
    if (b.activa) throw new Error('no se pausó');
    ok('activar → próxima en el futuro → pausar', `próxima ${a.proxima} · pausada ${!b.activa}`);
  } catch (e) {
    if (e.code === 'sin_puerta') pendiente('activar', `${e.message} (${e.original?.message?.trim()})`);
    else falla('activar/pausar', e);
    try { const b = await T.activar(p.id, false); (b.activa ? falla : ok)('pausar', `activa ${b.activa}`); } catch (e2) { falla('pausar', e2); }
  }

  try {
    const leida = await T.programacion(org.id, p.id);
    const d = await T.duplicar(leida, userId);
    creadas.push(d.id);
    if (d.activa || d.flowId !== leida.flowId || JSON.stringify(d.entradas) !== JSON.stringify(leida.entradas)) throw new Error('la copia no es igual o no está en pausa');
    ok('duplicar (en pausa)', `«${d.nombre}»`);
  } catch (e) { falla('duplicar', e); }

  try {
    const corr = await T.corridasDelFlujo(org.id, flujo.id, 5);
    ok('corridas del flujo', `${corr.length} · ${corr.map((r) => M.estadoCorrida(r.status).etiqueta).join(', ')}`);
  } catch (e) { falla('corridas del flujo', e); }

  await visor(p.id);
  return limpiar();
}

/** Una persona SIN gestionar_flujos no ve ni cambia las tareas (RLS). */
async function visor(id) {
  if (!env('AISC_PRUEBA_VIEWER_EMAIL')) return salta('visor', 'sin AISC_PRUEBA_VIEWER_EMAIL');
  const v = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), opcionesSb);
  try {
    const { error } = await v.auth.signInWithPassword({ email: env('AISC_PRUEBA_VIEWER_EMAIL'), password: env('AISC_PRUEBA_VIEWER_CLAVE') });
    if (error) throw error;
    T._inyectarCliente(v);
    const lista = await T.programaciones(env('AISC_PRUEBA_ORG', WAKEUP));
    let cambio = 'no';
    try { await T.activar(id, true); cambio = 'SÍ'; } catch (e) { cambio = `no (${e.code})`; }
    (lista.some((x) => x.id === id) || cambio === 'SÍ' ? falla : ok)('el visor no ve ni activa', `ve ${lista.length} · activa: ${cambio}`);
  } catch (e) { falla('visor', e); } finally { T._inyectarCliente(sb); await v.auth.signOut({ scope: 'local' }).catch(() => {}); }
}

async function limpiar() {
  for (const id of creadas.reverse()) {
    try { await T.borrar(id); ok('borrar', id); } catch (e) { falla(`borrar ${id}`, e); }
  }
  try {
    const despues = await T.programaciones(env('AISC_PRUEBA_ORG', WAKEUP));
    const quedan = despues.filter((x) => creadas.includes(x.id));
    (quedan.length ? falla : ok)('la base quedó como estaba', `${despues.length} programaciones · de prueba ${quedan.length}`);
  } catch (e) { falla('releer al final', e); }
  try { await T.borrar('00000000-0000-0000-0000-000000000000'); falla('borrar lo que no existe', new Error('no falló')); }
  catch (e) { (e.code === 'sin_cambio' ? ok : falla)('borrar lo que no existe falla con palabras', e.message); }
  return fin();
}

function fin() {
  const n = (t) => pasos.filter((x) => x[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('PENDIENTE')} PENDIENTE · ${n('SALTA')} SALTA`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch(async (e) => { falla('inesperado', e); await limpiar(); });
