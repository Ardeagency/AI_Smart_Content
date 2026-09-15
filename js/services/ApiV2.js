/**
 * ApiV2 — el BORDE del backend v2 (Fastify) desde la consola.
 *
 * Port mecánico de Git-AISC-Frontend/src/datos/api.ts (d43e948, congelado) al
 * runtime de v1: sin módulos ni tipos, global `window.apiV2`, sesión del
 * `window.supabase` que ya arma SupabaseService. El contrato (peticiones puras)
 * es el mismo que prueba el backend contra `app.inject` (26/26).
 *
 * Contrato: Git-AISC-Docs/backend/borde-http.md (medido contra backend afc0307 /
 * 564a8ef). La API va bajo /v1; quedan sin versión /salud, /webhooks/*, /mcp.
 *
 *   - Cada petición lleva `Authorization: Bearer <JWT de Supabase>`. El borde
 *     lo verifica contra el JWKS del proyecto, SIN estado de sesión → un JWT
 *     recién refrescado vale sin más: 401 = refrescar y reintentar UNA vez.
 *   - `x-request-id` correlaciona logs; se genera aquí y vuelve en los errores
 *     (JSON y cabecera).
 *   - Errores: `{error, mensaje, request_id}` en TODOS los caminos (404 de
 *     ruta inexistente y JSON malformado incluidos). Códigos estables:
 *     no_autenticado 401 · sin_permiso 403 · no_encontrado 404 (lo que no te
 *     toca ver es 404, nunca 403) · entrada_invalida 422 · sin_saldo /
 *     sin_espacio 402 · proveedor_caido 503 · demasiadas_peticiones 429 ·
 *     no_se_pudo_lanzar 409 · cuerpo_demasiado_grande 413.
 *   - Topes: JSON 2 MB · archivo multipart 200 MB (un archivo; sin lista
 *     blanca de MIME: el borde NEUTRALIZA a application/octet-stream lo que no
 *     sea imagen/video/audio/pdf o cuyos bytes no coincidan, ADR-0045).
 *     Se comprueban ANTES de salir a la red.
 *   - Descarga del original SIEMPRE por /v1/archivos/:id/descarga (URL
 *     prefirmada 300 s); galería por cookie + URL estable; nunca R2 directo.
 *   - La API no piensa: valida, autoriza y ENCOLA. Lo lento vuelve por
 *     Realtime sobre la tabla, no por HTTP.
 *   - STUDIO (/image, /video; backend 260f742): una producción ES una corrida
 *     de flujo, no hay /v1/producir. Dos flujos de PLATAFORMA sembrados por BD
 *     (slugs `imagen-directa` y `video-directo`; la consola resuelve el uuid
 *     leyendo flows.flows). `lanzarFlujo(id, org, entradas, idCliente)` con
 *     entradas {prompt, aspecto, resolucion, referencia_1..3} (imagen) o
 *     {prompt, aspecto, resolucion, duracion, con_audio, referencia_1..2}
 *     (video); las referencias son URLs (subir antes con subirArchivo y pasar
 *     la url de descarga o de galería). `corrida(id, org)` sondea: `running`
 *     (1–2 min imagen, ~4 video) → `succeeded` con salidas [{key, kind, url,
 *     storage_path, metadata:{file_id, prompt, creditos_kie, costo_usd}}] o
 *     `failed` con el motivo en palabras. Pintar con `url` (galería) o
 *     `metadata.file_id` → urlDescarga. `esperarCorrida()` hace el sondeo.
 *   - GALERÍA (backend 260f742): `salidas[].url` = https://media-v2.aismartcontent.io/out/<org>/<clave>
 *     y EXIGE la cookie de `POST /v1/sesion/galeria` (HttpOnly, Secure,
 *     Domain=.aismartcontent.io, 10 min; sin ella 401, marca ajena 404). Por eso
 *     la consola vive en console.aismartcontent.io: desde el Netlify
 *     provisional la cookie NO viaja y la galería no se ve — camino alterno:
 *     `metadata.file_id` → urlDescarga (prefirmada 5 min). /pub/* va sin cookie.
 *     Patrón: al abrir /image o /video, `mantenerSesionGaleria(org)` pide la
 *     cookie una vez y la renueva cada ~8 min mientras la vista esté abierta;
 *     si una <img> de /out/ da 401, renovar y reintentar.
 *
 * URL del borde: `window.AISC_API_URL` (runtime-config.js). Vacía = `sin_api`:
 * las vistas dicen que el borde no está configurado, no fallan en silencio.
 */
(function () {
  'use strict';

  const TOPE_JSON_BYTES = 2 * 1024 * 1024;
  const TOPE_ARCHIVO_BYTES = 200 * 1024 * 1024;
  /** Se enciende cuando los paquetes estén reprecificados (ADR-0042 en rojo). */
  const PAGOS_HABILITADOS = false;

  class ErrorApi extends Error {
    constructor(codigo, mensaje, http, requestId, detalles, retryAfter) {
      super(mensaje);
      this.name = 'ErrorApi';
      this.codigo = codigo; this.http = http; this.requestId = requestId; this.detalles = detalles; this.retryAfter = retryAfter;
    }
    get sinSaldo() { return this.codigo === 'sin_saldo'; }
    get sinSesion() { return this.codigo === 'no_autenticado'; }
  }

  const uid = () => (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // ── Peticiones: constructores PUROS (sin fetch) — es lo que prueba el contrato ─
  const peticiones = {
    salud: () => ({ method: 'GET', path: '/salud', publica: true }),
    aprobaciones: (org) => ({ method: 'GET', path: '/v1/aprobaciones', query: { org } }),
    /** `aprobar: boolean`; al RECHAZAR la nota es obligatoria (la BASE exige motivo, 5+ caracteres). */
    decidirAprobacion: (id, org, decision, nota) => {
      const aprobar = decision === 'aprobar';
      if (!aprobar && String(nota || '').trim().length < 5) throw new ErrorApi('entrada_invalida', 'Para rechazar hace falta un motivo de al menos 5 caracteres.', 422);
      return { method: 'POST', path: `/v1/aprobaciones/${id}`, body: Object.assign({ org, aprobar }, nota ? { nota } : {}) };
    },
    enviarMensaje: (conversacion, texto, idCliente) => ({ method: 'POST', path: `/v1/conversaciones/${conversacion}/mensajes`, body: { texto, id_cliente: idCliente } }),
    cancelarTurno: (turno) => ({ method: 'POST', path: `/v1/turnos/${turno}/cancelar`, body: {} }),
    /** org y proposito en la QUERY (se autoriza antes de leer el cuerpo); un solo campo multipart `archivo`. */
    subirArchivo: (org, archivo, proposito = 'subida') => {
      if (archivo && archivo.size > TOPE_ARCHIVO_BYTES) throw new ErrorApi('cuerpo_demasiado_grande', `El archivo pesa ${Math.round(archivo.size / 1048576)} MB; el tope es 200 MB.`, 413);
      const form = new FormData(); form.set('archivo', archivo);
      return { method: 'POST', path: '/v1/archivos', query: { org, proposito }, form };
    },
    archivos: (org) => ({ method: 'GET', path: '/v1/archivos', query: { org } }),
    urlDescarga: (id, org) => ({ method: 'GET', path: `/v1/archivos/${id}/descarga`, query: { org } }),
    borrarArchivo: (id, org) => ({ method: 'DELETE', path: `/v1/archivos/${id}`, query: { org } }),
    sesionGaleria: (org) => ({ method: 'POST', path: '/v1/sesion/galeria', body: { org } }),
    /** id_cliente OBLIGATORIO y del cliente (dos toques = una corrida). `market_id`, no `market`. */
    lanzarFlujo: (flujo, org, entradas, idCliente, marketId) => ({ method: 'POST', path: `/v1/flujos/${flujo}/lanzar`, body: Object.assign({ org, entradas }, marketId ? { market_id: marketId } : {}, { id_cliente: idCliente }) }),
    corrida: (id, org) => ({ method: 'GET', path: `/v1/corridas/${id}`, query: { org } }),
    integraciones: (org) => ({ method: 'GET', path: '/v1/integraciones', query: { org } }),
    conectar: (plataforma, org, extra = {}) => ({ method: 'POST', path: `/v1/integraciones/${plataforma}/conectar`, body: Object.assign({ org }, extra) }),
    desconectar: (id, org) => ({ method: 'POST', path: `/v1/integraciones/${id}/desconectar`, body: { org } }),
    /** Pagos: el borde arma el checkout de Wompi (firma incluida); el frontend solo abre el widget. */
    iniciarPago: (org, paquete) => ({ method: 'POST', path: '/v1/pagos/iniciar', body: { org, paquete } }),
    mcp: (org, metodo, params = {}) => ({ method: 'POST', path: '/mcp', query: { org }, body: { jsonrpc: '2.0', id: uid(), method: metodo, params } }),
  };

  // ── Ejecución ─────────────────────────────────────────────────────────────
  let fetchInyectado = null;
  let sesionInyectada = null;
  /** Para pruebas: inyecta un fetch (p. ej. app.inject del backend) y/o la sesión. */
  function configurar(opciones) {
    if ('fetch' in opciones) fetchInyectado = opciones.fetch || null;
    if ('sesion' in opciones) sesionInyectada = opciones.sesion || null;
  }

  const sesionDeSupabase = {
    async actual() {
      const sb = window.supabase || (window.supabaseService && await window.supabaseService.getClient());
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session : null;
    },
    async refrescar() {
      const sb = window.supabase || (window.supabaseService && await window.supabaseService.getClient());
      if (!sb) return null;
      const { data, error } = await sb.auth.refreshSession();
      return error ? null : (data && data.session) || null;
    },
  };
  const sesion = () => sesionInyectada || sesionDeSupabase;
  const urlApi = () => String(window.AISC_API_URL || '').replace(/\/$/, '');

  async function ejecutar(p) {
    const base = urlApi();
    if (!base && !fetchInyectado) throw new ErrorApi('sin_api', 'Falta AISC_API_URL: el borde no está configurado.', 0);
    const url = new URL((base || 'http://127.0.0.1') + p.path);
    for (const [k, v] of Object.entries(p.query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const requestId = uid();
    let body = null;
    let contentType = null;
    if (p.form) body = p.form;
    else if (p.body !== undefined) {
      const json = JSON.stringify(p.body);
      if (json.length > TOPE_JSON_BYTES) throw new ErrorApi('cuerpo_demasiado_grande', 'La petición supera los 2 MB que admite el borde.', 413, requestId);
      contentType = 'application/json'; body = json;
    }

    let token = null;
    if (!p.publica) {
      const s = await sesion().actual();
      token = s && s.access_token ? s.access_token : null;
      if (!token) throw new ErrorApi('no_autenticado', 'Sin sesión.', 401, requestId);
    }

    const enviar = async (jwt) => {
      const cabeceras = { 'x-request-id': requestId };
      if (jwt) cabeceras['authorization'] = `Bearer ${jwt}`;
      if (contentType) cabeceras['content-type'] = contentType;
      try { return await (fetchInyectado || fetch)(url, { method: p.method, headers: cabeceras, body, credentials: 'omit' }); }
      catch (e) { throw new ErrorApi('red', 'No se pudo hablar con el borde.', 0, requestId, e); }
    };

    let res = await enviar(token);
    // 401 con sesión: el JWT caducó entre el getSession y el borde. Refrescar y reintentar UNA vez.
    if (res.status === 401 && token && !p.form) {
      const nueva = await sesion().refrescar();
      const jwt = nueva && nueva.access_token ? nueva.access_token : null;
      if (jwt) res = await enviar(jwt);
    }
    if (res.status === 204) return undefined;
    const datos = await res.json().catch(() => null);
    if (!res.ok) {
      const d = datos || {};
      throw new ErrorApi(d.error || `http_${res.status}`, d.mensaje || res.statusText, res.status, d.request_id || res.headers.get('x-request-id') || requestId, d.detalles, Number(res.headers.get('retry-after')) || undefined);
    }
    return datos;
  }

  /**
   * Cómo se muestra un archivo según el `mime_type` de la FICHA (no el subido):
   * inline solo imagen/video/audio; lo demás (pdf incluido) es «descargar»,
   * nunca en iframe (ADR-0045).
   */
  function modoDeMuestra(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.startsWith('image/')) return 'imagen';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'descarga';
  }

  function normalizarCorrida(r) {
    const c = (r && r.corrida && r.corrida.corrida) ? r.corrida : (r || {});
    const cabeza = c.corrida || c;
    const pasos = Array.isArray(c.pasos) ? c.pasos : [];
    let status = cabeza.estado || cabeza.status || 'unknown';
    // Un paso fallido con la corrida aún «running» es un fallo: no esperar 6 minutos a nada.
    if (status === 'running' && pasos.some((p) => p.estado === 'failed' || p.status === 'failed')) status = 'failed';
    const pasoFallido = pasos.find((p) => p.estado === 'failed' || p.status === 'failed');
    return {
      id: cabeza.id, status, error: cabeza.error || (pasoFallido ? `${pasoFallido.nombre || 'paso'}: ${pasoFallido.error || 'falló'}` : null),
      salidas: Array.isArray(c.salidas) ? c.salidas : [], pasos, entradas: c.entradas || {}, corrida: cabeza, raw: r,
    };
  }

  /** Una función por ruta: construye la petición pura y la ejecuta. */
  const api = {
    salud: () => ejecutar(peticiones.salud()),
    aprobaciones: (org) => ejecutar(peticiones.aprobaciones(org)),
    decidirAprobacion: (id, org, decision, nota) => ejecutar(peticiones.decidirAprobacion(id, org, decision, nota)),
    enviarMensaje: (conversacion, texto, idCliente = uid()) => ejecutar(peticiones.enviarMensaje(conversacion, texto, idCliente)),
    cancelarTurno: (turno) => ejecutar(peticiones.cancelarTurno(turno)),
    subirArchivo: (org, archivo, proposito = 'subida') => ejecutar(peticiones.subirArchivo(org, archivo, proposito)),
    archivos: (org) => ejecutar(peticiones.archivos(org)),
    urlDescarga: (id, org) => ejecutar(peticiones.urlDescarga(id, org)),
    borrarArchivo: (id, org) => ejecutar(peticiones.borrarArchivo(id, org)),
    sesionGaleria: (org) => ejecutar(peticiones.sesionGaleria(org)),
    /** Forma REAL del borde (medida 15/09 20:40 UTC): `{corrida: <run_id>, reintento, primer_paso}`. Se expone también `run_id`. */
    lanzarFlujo: async (flujo, org, entradas, idCliente, marketId) => {
      const r = await ejecutar(peticiones.lanzarFlujo(flujo, org, entradas, idCliente, marketId));
      return Object.assign({ run_id: r && (r.run_id || r.corrida) }, r);
    },
    /**
     * Forma REAL: `{corrida: {corrida: {id, estado, flujo, error, creditos…}, pasos: [{nombre, estado, error…}],
     * salidas: [...], entradas, movimientos, aprobaciones}}`. Se normaliza a
     * `{status, salidas, pasos, entradas, corrida, raw}` para que la consola no dependa del anidado.
     */
    corrida: async (id, org) => normalizarCorrida(await ejecutar(peticiones.corrida(id, org))),
    integraciones: (org) => ejecutar(peticiones.integraciones(org)),
    conectar: (plataforma, org, extra = {}) => ejecutar(peticiones.conectar(plataforma, org, extra)),
    desconectar: (id, org) => ejecutar(peticiones.desconectar(id, org)),
    /**
     * EN ROJO (ADR-0042): billing.credit_packages sigue con precios de v1 (COP,
     * 0,12 USD/crédito) contra «1 crédito = 1 USD». Nadie cobra desde la consola
     * hasta que un ADR lo sustituya con los paquetes reprecificados.
     */
    iniciarPago: (org, paquete) => {
      if (!PAGOS_HABILITADOS) return Promise.reject(new ErrorApi('pagos_no_habilitados', 'Los paquetes de créditos aún no están reprecificados (ADR-0042).', 0));
      return ejecutar(peticiones.iniciarPago(org, paquete));
    },
    mcp: (org, metodo, params = {}) => ejecutar(peticiones.mcp(org, metodo, params)),
    /**
     * Mantiene viva la cookie de galería mientras una vista esté abierta:
     * la pide ya y la renueva cada `cadaMs` (8 min < 10 de vida). Devuelve
     * `parar()` para el destroy() de la vista. Un fallo al renovar no tumba
     * nada: la siguiente imagen dará 401 y la vista renueva y reintenta.
     */
    mantenerSesionGaleria: (org, { cadaMs = 8 * 60 * 1000, alFallar = null } = {}) => {
      let parado = false;
      const pedir = () => ejecutar(peticiones.sesionGaleria(org)).catch((e) => { if (typeof alFallar === 'function') alFallar(e); });
      void pedir();
      const timer = setInterval(() => { if (!parado && !document.hidden) void pedir(); }, cadaMs);
      return { parar: () => { parado = true; clearInterval(timer); }, renovar: pedir };
    },
    /**
     * Sondea una corrida hasta que termine. Resuelve con la corrida final
     * (`succeeded` | `failed`); rechaza con `tiempo_agotado` si pasa el tope.
     * `alCambiar(corrida)` se llama en cada sondeo para pintar el estado.
     */
    esperarCorrida: async (id, org, { intervaloMs = 4000, topeMs = 6 * 60 * 1000, alCambiar = null, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) => {
      const inicio = Date.now();
      for (;;) {
        const c = normalizarCorrida(await ejecutar(peticiones.corrida(id, org)));
        if (typeof alCambiar === 'function') { try { alCambiar(c); } catch (_) { /* pintar no puede tumbar el sondeo */ } }
        const estado = c && c.status;
        if (estado === 'succeeded' || estado === 'failed' || estado === 'canceled') return c;
        if (Date.now() - inicio > topeMs) throw new ErrorApi('tiempo_agotado', 'La corrida sigue en marcha; vuelve a mirar en un rato.', 0, undefined, { id, ultimo: c });
        await dormir(intervaloMs);
      }
    },
  };

  window.apiV2 = Object.freeze({
    api, peticiones, ejecutar, configurar, ErrorApi, modoDeMuestra, nuevoIdCliente: uid, urlApi,
    TOPE_JSON_BYTES, TOPE_ARCHIVO_BYTES, PAGOS_HABILITADOS,
  });
})();
