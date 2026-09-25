#!/usr/bin/env node
/**
 * Verificación del DASHBOARD de 4 pestañas contra la base nueva con un JWT real: carga
 * DashboardDataService tal cual lo usa la consola y recorre cada lectura de la marca de prueba
 * (WAKEUP): cuánto trae, qué queda vacío y si la vista de la que sale ya existe (P1 20260925170000,
 * P2 20260925171000, P3 20260925172000). SOLO LECTURA: no escribe nada.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_PRUEBA_ORG=uuid] node scripts/verificar-dashboard.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const linea = (estado, paso, detalle = '') => { pasos.push([estado, paso]); console.log(`${estado.padEnd(11)}${paso}${detalle ? ' — ' + detalle : ''}`); };

globalThis.window = globalThis; globalThis.document = { hidden: false };
new Function(readFileSync(new URL('../js/services/DashboardDataService.js', import.meta.url), 'utf8'))();
const D = globalThis.DashboardDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
D._inyectarCliente(sb);
const WAKEUP = 'e2477719-d65e-422a-a5aa-3473d6536060';

/** Una línea por vista: si ya existe (o qué falta) y cuántas filas trae. */
const VISTAS = [
  ['social', 'posts_view', 'P1', 'id, interacciones, media'],
  ['social', 'actividad_diaria', 'P1', 'fecha'],
  ['marketing', 'lecturas_tablero', 'P1', 'id'],
  ['marketing', 'anuncios_rendimiento', 'P2', 'id'],
  ['marketing', 'campanas_rendimiento', 'P2', 'id'],
  ['intel', 'anuncios_competencia', 'P2', 'id'],
  ['ingest', 'frescura', 'P3', 'organization_id'],
  ['ai', 'bitacora', 'P3', 'cuando'],
  ['ai', 'pulso', 'P3', 'activa'],
  ['intel', 'fechas_proximas', 'P3', 'id'],
];

function resumen(r, cuenta) {
  if (r.falta === 'vista') return ['PEND.', `${r.vista} todavía no existe (migración sin aplicar) → «todavía no»`];
  if (r.falta === 'permiso') return ['PERMISO', `${r.vista}: la RLS no deja leer`];
  if (r.falta) return ['FALLA', `${r.vista}: error`];
  const n = cuenta(r.datos);
  return [n ? 'OK' : 'VACÍO', `${r.vista}: ${n || 'nada'}${n ? '' : ' → «todavía no»'}`];
}

async function main() {
  let org;
  try {
    const { error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO', env('AISC_PRUEBA_EMAIL')), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error;
    const ctx = await sb.rpc('mi_contexto'); if (ctx.error) throw ctx.error;
    org = (ctx.data?.organizations || []).find((o) => o.id === env('AISC_PRUEBA_ORG', WAKEUP));
    if (!org) throw new Error('la cuenta de prueba no está en la marca pedida');
    linea('OK', 'login y mi_contexto', org.name);
  } catch (e) { linea('FALLA', 'login/contexto', `${e?.code || ''} ${e?.message || e}`); return fin(); }
  const id = org.id;

  console.log('\n— Vistas del contrato (una línea por vista) —');
  for (const [esquema, vista, p, col] of VISTAS) {
    const r = await sb.schema(esquema).from(vista).select(col, { count: 'exact' }).eq('organization_id', id).limit(1);
    const falta = D.mapeo.faltaDe(r.error);
    if (!r.error) linea('EXISTE', `${esquema}.${vista} (${p})`, `${r.count ?? '?'} filas de la marca`);
    else if (falta === 'vista') linea('NO EXISTE', `${esquema}.${vista} (${p})`, `${r.error.code} — la migración no está aplicada`);
    else linea('FALLA', `${esquema}.${vista} (${p})`, `${r.error.code} ${r.error.message}`);
  }

  console.log('\n— Lecturas del servicio (lo que pinta cada pestaña) —');
  const hero = await D.marca(id);
  linea(hero.falta ? 'FALLA' : 'OK', 'Hero · marca', `logo ${hero.datos.logo_url ? 'sí' : 'no'} · ${hero.datos.colores.length} colores`);
  const integ = await D.integraciones(id);
  linea(...resumen(integ, (d) => d.length && `${d.join(', ')}`));
  const fr = await D.frescura(id);
  linea(...resumen(fr, (d) => d && `propios ${d.own_posts?.slice(0, 10) || '—'} · rivales ${d.competitor_posts?.slice(0, 10) || '—'} · agendas activas ${d.agendas_activas}`));
  const pu = await D.pulso(id);
  linea(...resumen(pu, (d) => d && `${d.activa ? 'activa' : 'en reposo'}${d.ultimo ? ` · lo último ${d.ultimo.cuando}` : ''}`));
  const bi = await D.bitacora(id);
  linea(...resumen(bi, (d) => d.length && `${d.length} entradas en 24 h`));

  console.log('\nMi Marca');
  for (const periodo of ['week', 'month', 'year', 'all']) {
    const v2 = await D.lectura(id, { scope: 'mi_marca', versiones: [2], periodo });
    linea(...resumen(v2, (d) => d && `cards.v2 ${periodo}: ${(d.reading.cards || []).map((c) => c.type).join(', ')} (periodo ${d.periodo}, ${d.created_at?.slice(0, 10)})`));
    const v4 = await D.lectura(id, { scope: 'mi_marca', versiones: [4], periodo });
    linea(...resumen(v4, (d) => d && `cards.vera4 ${periodo}: ${(d.reading.cards || []).map((c) => c.type).join(', ')}`));
  }
  const ult = await D.ultimaFecha(id, 'own');
  linea(...resumen(ult, (d) => d && `última publicación propia ${d}`));
  const rango = D.rangoDeVentana('month', { ultima: ult.datos });
  const tr = await D.trafico(id, rango);
  linea(...resumen(tr, (d) => d.activity.total && `Tráfico ${rango.desde}…${rango.hasta}: ${d.activity.total} publicaciones en ${d.activity.series.length} barras · Interacciones ${d.impact.length} barras`));
  const top = await D.publicacionDestacada(id, { source: 'own', ...rango });
  linea(...resumen(top, (d) => d && `Publicación destacada: ${d.post.network} · ${d.post.engagement_total} interacciones · media ${d.post.media_assets.archived_url ? 'archivada' : 'sin archivo'} · ${d.comentarios.length} comentarios`));
  const camp = await D.campanasActivas(id);
  linea(...resumen(camp, (d) => d.length && `Campañas activas: ${d.map((c) => c.nombre_campana).join(' · ')}`));
  const ads = await D.anuncios(id);
  linea(...resumen(ads, (d) => d.length && `Anuncios: ${d.length} (activos ${d.filter((a) => a.status === 'ACTIVE').length}, con gasto ${d.filter((a) => a.perf?.gasto > 0).length})`));
  linea('PEND.', 'Salud de marca (arco + modal)', 'P4: la fórmula la decide JC → «todavía no»');
  linea('PEND.', 'Producto destacado', 'P4: social.presencia_producto sin decidir → «todavía no»');

  console.log('\nCompetencia');
  const mon = await D.lectura(id, { scope: 'monitoreo', versiones: [1, 4] });
  linea(...resumen(mon, (d) => d && `lectura ${d.schema_version === 4 ? 'cards.vera4' : 'narrative v1'} (${d.created_at?.slice(0, 10)}): ${(d.reading.narrative || d.reading.cards || []).map((b) => b.type).join(', ')}`));
  const v4m = await D.lectura(id, { scope: 'monitoreo', versiones: [4] });
  linea(...resumen(v4m, (d) => d && `cards.vera4: ${(d.reading.cards || []).length}`));
  const ultC = await D.ultimaFecha(id, 'competitor');
  const rC = D.rangoDeVentana('month', { ultima: ultC.datos });
  const marcas = await D.marcasCompetencia(id, rC);
  linea(...resumen(marcas, (d) => d.length && `Influencia digital ${rC.desde}…${rC.hasta}: ${d.map((m) => `${m.brand_name} ${m.total_engagement}`).join(' · ')}`));
  if (!marcas.falta && marcas.datos.length) {
    const det = await D.detalleMarcaCompetencia(id, { perfiles: marcas.datos[0].entity_ids, ...rC });
    linea(...resumen(det, (d) => d && `Panel de ${marcas.datos[0].brand_name}: ${d.totals.posts} publicaciones · ${d.by_platform.length} redes · ${d.posts.length} piezas`));
  }
  const topC = await D.publicacionDestacada(id, { source: 'competitor', ...rC });
  linea(...resumen(topC, (d) => d && `Publicación con mayor tráfico: ${d.post.competitor_name || d.post.profile_handle} · ${d.post.engagement_total}`));
  const adsC = await D.anunciosCompetencia(id);
  linea(...resumen(adsC, (d) => d.length && `Lo que están pautando: ${d.length} anuncios · ${d.filter((a) => a.sigue_corriendo).length} siguen corriendo`));
  const bib = await D.audienciasBiblioteca(id);
  linea(...resumen(bib, (d) => d.length && `Biblioteca de audiencias: ${d.length}`));

  console.log('\nTendencias');
  const oc = await D.oceanos(id);
  linea(...resumen(oc, (d) => d.length && `Océanos azules: ${d.length} (${d.map((o) => o.intent).join(', ')})`));
  const fe = await D.fechasProximas(id);
  linea(...resumen(fe, (d) => d.length && `Próximas fechas: ${d.length} · con veredicto ${d.filter((f) => f.raw_data.verdict).length}`));
  const tend = await D.lectura(id, { scope: 'tendencias', versiones: [4] });
  linea(...resumen(tend, (d) => d && `cards.vera4: ${(d.reading.cards || []).length}`));

  console.log('\nEstrategia');
  const est = await D.lectura(id, { scope: 'estrategia', versiones: [4] });
  linea(...resumen(est, (d) => d && `cards.vera4: ${(d.reading.cards || []).length}`));
  return fin();
}

function fin() {
  const c = (e) => pasos.filter(([x]) => x === e).length;
  console.log(`\n${c('OK') + c('EXISTE')} bien · ${c('VACÍO')} vacías · ${c('PEND.') + c('NO EXISTE')} pendientes · ${c('FALLA') + c('PERMISO')} fallas`);
  process.exit(c('FALLA') ? 1 : 0);
}

main().catch((e) => { linea('FALLA', 'inesperado', e?.message || e); fin(); });
