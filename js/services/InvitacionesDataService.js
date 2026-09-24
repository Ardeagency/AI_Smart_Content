/**
 * InvitacionesDataService — la ÚNICA puerta de entrada al SaaS cerrado (ADR-0048,
 * contrato Git-AISC-DB 6d1c421 + backend 5953f12). window.InvitacionesDatos.
 *
 *   aceptar(token)                          rpc aceptar_invitacion → { organization_id, name, short, slug, role, … }
 *   alta(token, password, nombre)           POST /v1/invitaciones/alta (pública) → { creada, email, siguiente }
 *   pendientes(orgId)                       vista invitaciones_pendientes
 *   invitar(orgId, email, rol, permisos)    rpc invitar_por_correo
 *   reenviar(id) · revocar(id, motivo)      rpc reenviar_invitacion / revocar_invitacion
 *
 *   todaviaNo(e)  la RPC/vista aún no existe en la base viva (PGRST202/PGRST205/42883/42P01)
 *                 o el borde no la tiene (404 de ruta / 503 alta_no_configurada): la
 *                 pantalla lo dice con palabras, no como fallo.
 *
 * El token nunca va a logs: los errores se registran sin él.
 */
(function () {
  'use strict';

  const TOKEN = /^[0-9a-f]{64}$/;

  async function cliente() {
    if (window.supabaseService?.getClient) {
      try { return await window.supabaseService.getClient(); } catch (_) { /* cae al global */ }
    }
    return window.supabase || null;
  }

  function todaviaNo(e) {
    const c = String(e?.code || e?.codigo || '');
    return ['PGRST202', 'PGRST205', '42883', '42P01', 'alta_no_configurada', 'proveedor_caido', 'sin_api'].includes(c)
      || (e?.http === 404 && c !== 'invitacion_no_valida');
  }

  async function rpc(nombre, args) {
    const sb = await cliente();
    if (!sb) throw Object.assign(new Error('Sin conexión con la base.'), { code: 'sin_cliente' });
    const { data, error } = await sb.rpc(nombre, args);
    if (error) throw error;
    return data;
  }

  const tokenValido = (t) => TOKEN.test(String(t || ''));

  async function aceptar(token) {
    if (!tokenValido(token)) throw Object.assign(new Error('Enlace no válido.'), { code: 'P0002' });
    return rpc('aceptar_invitacion', { p_token: token });
  }

  async function alta(token, password, nombre) {
    const api = window.apiV2?.api;
    if (!api?.altaPorInvitacion) throw Object.assign(new Error('sin_api'), { codigo: 'sin_api' });
    return api.altaPorInvitacion(token, password, nombre);
  }

  /** La contraseña que acepta el alta: 12–72, al menos una letra y un dígito. Devuelve el motivo o ''. */
  function motivoContrasena(p) {
    const s = String(p || '');
    if (s.length < 12) return 'corta';
    if (s.length > 72) return 'larga';
    if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'mezcla';
    return '';
  }

  async function pendientes(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const { data, error } = await sb.from('invitaciones_pendientes')
      .select('id, email, role, permissions, estado, expires_at, sent_at, send_attempts, invitada_por, created_at')
      .eq('organization_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  const invitar = (orgId, email, rol = 'viewer', permisos = []) => rpc('invitar_por_correo', { p_org: orgId, p_email: email, p_role: rol, p_permisos: permisos });
  const reenviar = (id) => rpc('reenviar_invitacion', { p_id: id });
  const revocar = (id, motivo = null) => rpc('revocar_invitacion', { p_id: id, p_motivo: motivo });

  window.InvitacionesDatos = Object.freeze({ aceptar, alta, pendientes, invitar, reenviar, revocar, todaviaNo, tokenValido, motivoContrasena });
})();
