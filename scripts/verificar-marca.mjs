#!/usr/bin/env node
/**
 * Verificación de la página MI MARCA contra la base nueva con un JWT real:
 * carga MarcaDataService tal cual lo usa la consola y recorre lo que la vista
 * hace — leer todo, crear/editar/borrar un color, guardar la tipografía (y
 * dejarla como estaba), renombrar el mercado (y dejarlo como estaba). Ninguna
 * escritura deja rastro. Anota OK/FALLA con el error exacto.
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… \
 *   [AISC_PRUEBA_ORG=<uuid>] [AISC_API_URL=…] node scripts/verificar-marca.mjs
 *
 * Nunca imprime la clave ni el JWT.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = (k, d = '') => process.env[k] || d;
const pasos = [];
const ok = (paso, detalle = '') => { pasos.push(['OK', paso, detalle]); console.log(`OK     ${paso}${detalle ? ' — ' + detalle : ''}`); };
const falla = (paso, e) => { const m = e?.message || e?.error || String(e); pasos.push(['FALLA', paso, `${e?.code ? e.code + ' ' : ''}${m}`]); console.log(`FALLA  ${paso} — ${e?.code || ''} ${m}`); };
const salta = (paso, por) => { pasos.push(['SALTA', paso, por]); console.log(`SALTA  ${paso} — ${por}`); };

globalThis.window = globalThis;
globalThis.document = { hidden: false };
new Function(readFileSync(new URL('../js/services/ApiV2.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/services/MarcaDataService.js', import.meta.url), 'utf8'))();
const M = globalThis.MarcaDatos;
const sb = createClient(env('AISC_SUPABASE_URL'), env('AISC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
M._inyectarCliente(sb);
globalThis.AISC_API_URL = env('AISC_API_URL');
let sesion = null;
globalThis.apiV2.configurar({ sesion: { actual: async () => sesion, refrescar: async () => sesion } });

async function main() {
  let uid;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: env('AISC_PRUEBA_USUARIO'), password: env('AISC_PRUEBA_CLAVE') });
    if (error) throw error;
    sesion = data.session; uid = data.user.id;
    ok('login', `uid ${uid.slice(0, 8)}…`);
  } catch (e) { falla('login', e); return fin(); }

  let org;
  try {
    const { data, error } = await sb.rpc('mi_contexto');
    if (error) throw error;
    const orgs = data?.organizations || [];
    org = orgs.find((o) => o.id === env('AISC_PRUEBA_ORG')) || orgs[0];
    if (!org) throw new Error('sin marcas');
    ok('mi_contexto', `${org.name} · rol ${org.role}`);
  } catch (e) { falla('mi_contexto', e); return fin(); }

  // Lectura: lo que la vista pinta
  let datos;
  try {
    datos = await M.cargar(org.id);
    if (!datos?.organizationRow) throw new Error('cargar() sin organizationRow');
    const o = datos.organizationRow;
    ok('cargar()', `nombre «${o.brand_name_oficial}» · slogan ${o.brand_slogan ? 'sí' : 'no'} · logo ${o.logo_url ? 'sí' : 'no'} · colores ${datos.brandColors.length} · fuentes ${datos.brandFonts.length} · assets ${datos.brandAssets.length} · mercados ${datos.brandContainers.length} · conexiones ${datos.brandIntegrations.length}`);
    for (const c of datos.brandColors) if (!/^#[0-9a-f]{6}$/.test(c.hex_value)) throw new Error(`color con hex raro: ${c.hex_value}`);
    if (datos.brandColors.length) ok('colores en forma v1', datos.brandColors.map((c) => `${c.color_role}=${c.hex_value}`).join(' '));
    if (datos.brandContainers.length) ok('mercado en forma v1', `«${datos.brandContainers[0].nombre_marca}» · países ${JSON.stringify(datos.brandContainers[0].mercado_objetivo)} · idiomas ${JSON.stringify(datos.brandContainers[0].idiomas_contenido)}`);
  } catch (e) { falla('cargar()', e); return fin(); }

  // Escritura: color (crear → editar → borrar), sin rastro
  if (datos.brandColors.length >= 4) salta('color crear/editar/borrar', 'la marca ya tiene 4 colores');
  else {
    let creado = null;
    try {
      creado = await M.crearColor(org.id, '#0A0B0C');
      ok('crearColor', `${creado.color_role} ${creado.hex_value} (id ${creado.id.slice(0, 8)}…)`);
      const editado = await M.actualizarColor(creado.id, '#FFFFFE');
      if (editado.hex_value !== '#fffffe') throw new Error(`esperaba #fffffe, vino ${editado.hex_value}`);
      ok('actualizarColor', editado.hex_value);
    } catch (e) { falla('color crear/editar', e); }
    if (creado) {
      try { const b = await M.borrarColor(creado.id); if (!b) throw new Error('borrarColor devolvió false'); ok('borrarColor'); } catch (e) { falla('borrarColor', e); }
    }
  }

  // Escritura: tipografía (dejarla como estaba)
  try {
    const antes = datos.brandFonts.find((f) => f.font_usage === 'images');
    const g = await M.guardarTipografiaImagenes(org.id, antes?.font_family || 'Inter');
    if (g.font_usage !== 'images') throw new Error(`rol devuelto ${g.role}`);
    ok('guardarTipografiaImagenes (upsert, sin cambio)', g.font_family);
    if (!antes) { const { error } = await sb.from('brand_fonts').delete().eq('id', g.id); if (error) throw error; ok('tipografía de prueba retirada'); }
  } catch (e) { falla('guardarTipografiaImagenes', e); }

  // Escritura: mercado (renombrar y volver)
  const m = datos.brandContainers[0];
  if (!m) salta('actualizarMercado', 'la marca no tiene mercados');
  else {
    try {
      const rep = await M.nombreDeMercadoRepetido(org.id, m.nombre_marca, m.id);
      ok('nombreDeMercadoRepetido (propio excluido)', String(rep));
      const r1 = await M.actualizarMercado(m.id, 'nombre_marca', `${m.nombre_marca} ·verif`);
      if (!r1.nombre_marca.endsWith('·verif')) throw new Error('el nombre no cambió');
      const r2 = await M.actualizarMercado(m.id, 'nombre_marca', m.nombre_marca);
      if (r2.nombre_marca !== m.nombre_marca) throw new Error('no volvió al nombre original');
      ok('actualizarMercado (nombre, ida y vuelta)');
      const r3 = await M.actualizarMercado(m.id, 'palabras_clave', m.palabras_clave || []);
      ok('actualizarMercado (palabras_clave → keywords)', JSON.stringify(r3.palabras_clave));
      try { await M.actualizarMercado(m.id, 'marketing_budget', 1); falla('campo inexistente', new Error('no rechazó marketing_budget')); } catch (e) { if (e.code === 'campo_inexistente') ok('campo inexistente rechazado con palabras', e.message); else throw e; }
    } catch (e) { falla('actualizarMercado', e); }
  }

  // Organización: slogan ida y vuelta
  try {
    const o = datos.organizationRow;
    const r1 = await M.actualizarOrganizacion(org.id, { brand_slogan: `${o.brand_slogan || ''}·verif` });
    if (!String(r1.brand_slogan).endsWith('·verif')) throw new Error('el slogan no cambió');
    const r2 = await M.actualizarOrganizacion(org.id, { brand_slogan: o.brand_slogan });
    if ((r2.brand_slogan || null) !== (o.brand_slogan || null)) throw new Error('no volvió');
    ok('actualizarOrganizacion (tagline, ida y vuelta)');
  } catch (e) { falla('actualizarOrganizacion', e); }

  // Borde (solo si hay AISC_API_URL): lista de archivos para las URLs de galería
  if (!env('AISC_API_URL')) salta('GET /v1/archivos', 'sin AISC_API_URL');
  else { try { const r = await globalThis.apiV2.api.archivos(org.id); ok('GET /v1/archivos', `${(r?.archivos || []).length} archivos`); } catch (e) { falla('GET /v1/archivos', e); } }

  return fin();
}

function fin() {
  const n = (t) => pasos.filter((p) => p[0] === t).length;
  console.log(`\n${n('OK')} OK · ${n('FALLA')} FALLA · ${n('SALTA')} SALTA`);
  process.exit(n('FALLA') ? 1 : 0);
}
main().catch((e) => { falla('inesperado', e); fin(); });
