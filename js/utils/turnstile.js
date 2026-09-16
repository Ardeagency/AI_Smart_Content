/**
 * Turnstile — captcha de Cloudflare en login, registro y recuperación (lista de
 * cierre del corte: JC crea el widget para console.aismartcontent.io y enciende
 * `security_captcha_enabled` + `provider = turnstile` en Supabase Auth).
 *
 * Se enciende con `window.AISC_TURNSTILE_SITE_KEY` (runtime-config / snippet /
 * localStorage). VACÍO = no hay widget y no se manda `captchaToken`: el camino de
 * hoy. Con clave: el script oficial se carga UNA vez, el widget se pinta en el
 * contenedor que le pasa la vista y `token(id)` devuelve la respuesta para
 * supabase-js (`options.captchaToken`). Tras usarla se resetea: un token vale una vez.
 * CSP: script-src y frame-src https://challenges.cloudflare.com (netlify.toml).
 */
(function () {
  'use strict';

  const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  let carga = null;
  const widgets = new Map(); // id del contenedor → widgetId de Turnstile

  function clave() { return String(window.AISC_TURNSTILE_SITE_KEY || '').trim(); }
  function activo() { return !!clave(); }

  function cargar() {
    if (!activo()) return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (carga) return carga;
    carga = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SCRIPT; s.async = true; s.defer = true;
      s.onload = () => res(window.turnstile || null);
      s.onerror = () => { carga = null; rej(new Error('No se pudo cargar la verificación de Cloudflare.')); };
      document.head.appendChild(s);
    });
    return carga;
  }

  /**
   * Pinta el widget dentro del contenedor (`el` o id). Idempotente: si ya está,
   * lo resetea. Sin clave no hace nada (el contenedor queda vacío y oculto).
   */
  async function pintar(el, { accion = 'login', tema = 'dark' } = {}) {
    const host = typeof el === 'string' ? document.getElementById(el) : el;
    if (!host) return null;
    if (!activo()) { host.hidden = true; return null; }
    host.hidden = false;
    const ts = await cargar();
    if (!ts) return null;
    const previo = widgets.get(host);
    if (previo != null) { try { ts.reset(previo); } catch (_) { /* nada */ } return previo; }
    const id = ts.render(host, { sitekey: clave(), action: accion, theme: tema, language: (document.documentElement.lang || 'es').slice(0, 2), 'refresh-expired': 'auto' });
    widgets.set(host, id);
    return id;
  }

  /** El token para supabase-js. Sin clave → null (no se manda). Con clave y sin respuesta → error con palabras. */
  function token(el) {
    if (!activo()) return null;
    const host = typeof el === 'string' ? document.getElementById(el) : el;
    const id = host ? widgets.get(host) : null;
    const t = (id != null && window.turnstile) ? window.turnstile.getResponse(id) : '';
    if (!t) throw Object.assign(new Error('Completa la verificación «no soy un robot» antes de continuar.'), { code: 'captcha_pendiente' });
    return t;
  }

  /** Un token vale una vez: tras usarlo (con éxito o error del servidor) se pide otro. */
  function reiniciar(el) {
    const host = typeof el === 'string' ? document.getElementById(el) : el;
    const id = host ? widgets.get(host) : null;
    if (id != null && window.turnstile) { try { window.turnstile.reset(id); } catch (_) { /* nada */ } }
  }

  window.Turnstile = Object.freeze({ activo, cargar, pintar, token, reiniciar });
})();
