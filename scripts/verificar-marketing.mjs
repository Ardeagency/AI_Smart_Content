#!/usr/bin/env node
/**
 * Verificación de MARKETING (/command-center, el lienzo de campañas) contra la base nueva con
 * un JWT real: carga MarketingDataService (y CatalogoDataService, del que toma los elementos)
 * tal cual los usa la consola y mide tableros, audiencias, campañas, vínculos, el lienzo
 * (board_view + board_edges) y las entregas de una campaña. Luego, en la org de prueba,
 * crea → edita → borra un nodo (nota), una arista (nota → campaña) y un vínculo
 * audiencia ↔ campaña, y comprueba que la base queda EXACTAMENTE como estaba (mismos
 * conteos). Nada gasta créditos ni publica.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_PRUEBA_ORG=e2477719-…] node scripts/verificar-marketing.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (p, d = '') => { pasos.push(['OK', p]); console.log(`OK     ${p}${d ? ' — ' + d : ''}`); };
const falla = (p, e) => { pasos.push(['FALLA', p]); console.log(`FALLA  ${p} — ${e?.code || ''} ${e?.message || e}`); };
const salta = (p, d) => { pasos.push(['SALTA', p]); console.log(`SALTA  ${p} — ${d}`); };
globalThis.window = globalThis;
for (const f of ['CatalogoDataService', 'MarketingDataService']) new Function(readFileSync(new URL(`../js/services/${f}.js`, import.meta.url), 'utf8'))();
const M = globalThis.MarketingDatos; const C = globalThis.CatalogoDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
M._inyectarCliente(sb); C._inyectarCliente(sb);
const WAKEUP = 'e2477719-d65e-422a-a5aa-3473d6536060';

async function conteos(orgId, boardId) {
  const n = async (q) => { const r = await q; if (r.error) throw r.error; return r.count; };
  const m = sb.schema('marketing');
  return {
    nodos: await n(m.from('board_nodes').select('id', { count: 'exact', head: true }).eq('board_id', boardId)),
    aristas: await n(m.from('board_edges').select('id', { count: 'exact', head: true }).eq('board_id', boardId)),
    vinculos: await n(m.from('campaign_audiences').select('campaign_id', { count: 'exact', head: true }).eq('organization_id', orgId)),
    audiencias: await n(m.from('audiences').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
    campanas: await n(m.from('campaigns').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
  };
}

async function main() {
  let org;
  try {
    const { error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error; ok('login');
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    const id = env('AISC_PRUEBA_ORG', WAKEUP);
    org = (ctx.data?.organizations || []).find((o) => o.id === id);
    if (!org) throw new Error(`la persona de prueba no es miembro de ${id}`);
    ok('mi_contexto', `${org.name} · ver_campanas ${org.permissions?.includes('ver_campanas')} · editar_campanas ${org.permissions?.includes('editar_campanas')}`);
  } catch (e) { falla('login/contexto', e); return fin(); }

  let b;
  try {
    b = await M.base(org.id);
    ok('tableros', `${b.tableros.length} · «${b.tableros[0]?.nombre || '—'}» · viewport ${JSON.stringify(b.tableros[0]?.viewport || null)}`);
    ok('audiencias', `${b.audiencias.length} · con dolores ${b.audiencias.filter((a) => a.dolores.length).length} · con edades ${b.audiencias.filter((a) => a.edad_min != null).length}`);
    ok('campañas (campaigns_view)', `${b.campanas.length} · estados ${[...new Set(b.campanas.map((c) => c.estado))].join(',')} · con entregas ${b.campanas.filter((c) => c.entregas).length}`);
    ok('vínculos audiencia↔campaña', `${b.vinculos.length}`);
  } catch (e) { falla('base', e); return fin(); }

  const tablero = b.tableros[0];
  if (!tablero) { salta('lienzo', 'la org no tiene tablero'); return fin(); }
  let l;
  try {
    l = await M.lienzo(tablero.id);
    ok('lienzo (board_view + board_edges)', `${l.nodos.length} nodos (${[...new Set(l.nodos.map((n) => n.kind))].join(',') || '—'}) · ${l.aristas.length} aristas · visibles ${M.mapeo.aristasVisibles(l.nodos, l.aristas, b.vinculos).length}`);
  } catch (e) { falla('lienzo', e); return fin(); }

  try {
    const prods = await M.elementos(org.id, 'product');
    ok('elementos (CatalogoDatos)', `${prods.length} productos · con imagen ${prods.filter((p) => p.imagen).length}`);
  } catch (e) { falla('elementos', e); }

  // La campaña con más gasto medido (performance → deliveries.campaign_id); si no hay, la primera con entregas.
  let conEntregas = null; let x = null;
  try {
    const p = await sb.schema('marketing').from('performance').select('delivery_id, spend').eq('organization_id', org.id).order('spend', { ascending: false }).limit(1);
    const d = p.data?.[0] ? await sb.schema('marketing').from('deliveries').select('campaign_id').eq('id', p.data[0].delivery_id).maybeSingle() : { data: null };
    conEntregas = b.campanas.find((c) => c.id === d.data?.campaign_id) || b.campanas.find((c) => c.entregas > 0) || null;
    if (conEntregas) x = await M.entregas(conEntregas.id);
  } catch (e) { falla('entregas', e); }
  if (conEntregas && x) {
    try {
      const r = x.rendimiento;
      ok('entregas de una campaña', `«${conEntregas.nombre.slice(0, 40)}» · ${x.entregas.length} entregas · ${x.entregas.reduce((n, d) => n + d.conjuntos.length, 0)} conjuntos · ${x.entregas.reduce((n, d) => n + d.conjuntos.reduce((m, s) => m + s.anuncios.length, 0), 0)} anuncios · gasto ${Math.round(r.gasto)} ${r.moneda || ''} en ${r.dias} días`);
      try { await M.borrarCampana(conEntregas.id); falla('borrar campaña con entregas', new Error('no se negó')); }
      catch (e) { if (e.code === 'con_entregas') ok('borrar campaña con entregas → se niega con palabras', e.message); else falla('borrar campaña con entregas', e); }
    } catch (e) { falla('entregas', e); }
  } else salta('entregas', 'ninguna campaña con entregas');

  if (!org.permissions?.includes('editar_campanas')) { salta('escrituras', 'sin editar_campanas'); return fin(); }
  if (org.id !== WAKEUP) { salta('escrituras', 'solo se escribe en WAKEUP'); return fin(); }

  const antes = await conteos(org.id, tablero.id);
  ok('conteos antes', JSON.stringify(antes));
  const creados = { nodos: [], arista: null, vinculo: null };
  try {
    const campana = b.campanas[0];
    // Una audiencia SIN vínculo con esa campaña (para no pisar uno real).
    const audiencia = b.audiencias.find((a) => !b.vinculos.some((v) => v.audience_id === a.id && v.campaign_id === campana.id));
    if (!campana || !audiencia) throw new Error('faltan campaña o audiencia para probar');

    const nota = await M.crearNodo(org.id, tablero.id, { kind: 'note', x: -900, y: -900, cuerpo: 'verificar-marketing.mjs (se borra sola)' });
    creados.nodos.push(nota.id);
    if (nota.kind !== 'note' || nota.cuerpo.indexOf('verificar') !== 0) throw new Error('la nota no volvió como se creó');
    ok('crear nodo (nota)', `${nota.id} · título «${nota.titulo}»`);
    await M.editarNodo(nota.id, { cuerpo: 'verificar-marketing.mjs · editada' });
    await M.moverNodos([{ id: nota.id, x: -880, y: -870 }]);
    const nota2 = await M.nodo(nota.id);
    if (nota2.cuerpo !== 'verificar-marketing.mjs · editada' || nota2.x !== -880) throw new Error('editar/mover no se guardó');
    ok('editar y mover nodo', `x ${nota2.x} · y ${nota2.y}`);

    const nc = await M.crearNodo(org.id, tablero.id, { kind: 'campaign', sujeto_id: campana.id, x: -600, y: -900 });
    creados.nodos.push(nc.id);
    const na = await M.crearNodo(org.id, tablero.id, { kind: 'audience', sujeto_id: audiencia.id, x: -1200, y: -900 });
    creados.nodos.push(na.id);
    ok('poner campaña y audiencia en el lienzo', `«${nc.titulo.slice(0, 30)}» (${nc.subtitulo}) · «${na.titulo.slice(0, 30)}»`);

    if (M.mapeo.tipoDeConexion(nota, nc) !== 'arista') throw new Error('nota→campaña debería ser arista');
    creados.arista = await M.crearArista(org.id, tablero.id, nota.id, nc.id, 'prueba');
    ok('crear arista (nota → campaña)', creados.arista.id);
    try { await M.crearArista(org.id, tablero.id, nota.id, nc.id); falla('arista duplicada', new Error('la base la aceptó')); }
    catch (e) { ok('arista duplicada → la base la rechaza', `${e.code}`); }
    await M.quitarArista(creados.arista.id); creados.arista = null;
    ok('quitar arista');

    if (M.mapeo.tipoDeConexion(na, nc) !== 'vinculo') throw new Error('audiencia→campaña debería ser vínculo');
    const par = M.mapeo.parVinculo(na, nc);
    creados.vinculo = await M.vincular(org.id, par.campaign_id, par.audience_id);
    const vs = await M.vinculos(org.id);
    const vis = M.mapeo.aristasVisibles((await M.lienzo(tablero.id)).nodos, [], vs).filter((e) => e.tipo === 'vinculo' && e.desde === na.id && e.hasta === nc.id);
    if (vis.length !== 1) throw new Error('el vínculo no se dibuja entre los dos nodos');
    ok('vincular audiencia ↔ campaña', `principal ${creados.vinculo.is_primary} · se dibuja como arista`);
    await M.desvincular(par.campaign_id, par.audience_id); creados.vinculo = null;
    ok('desvincular');

    for (const id of creados.nodos.splice(0)) await M.quitarNodo(id);
    ok('quitar los 3 nodos de prueba');
  } catch (e) { falla('escrituras', e); }
  finally {
    // Limpieza pase lo que pase.
    if (creados.vinculo) await M.desvincular(creados.vinculo.campaign_id, creados.vinculo.audience_id).catch(() => null);
    if (creados.arista) await M.quitarArista(creados.arista.id).catch(() => null);
    for (const id of creados.nodos) await M.quitarNodo(id).catch(() => null);
  }
  const despues = await conteos(org.id, tablero.id);
  if (JSON.stringify(antes) === JSON.stringify(despues)) ok('la base quedó como estaba', JSON.stringify(despues));
  else falla('la base quedó como estaba', new Error(`antes ${JSON.stringify(antes)} · después ${JSON.stringify(despues)}`));
  fin();
}
function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('SALTA')} SALTA`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('inesperado', e); fin(); });
