/**
 * Configuración en tiempo de ejecución (sin build).
 *
 * Para que Vera (VeraView) hable con tu servidor ai-engine en lugar de
 * /api/ai/chat (Netlify), define la URL base del motor, sin barra final:
 *
 *   window.AI_ENGINE_BASE_URL = 'https://tu-dominio-o-ip:3000';
 *
 * En Netlify puedes inyectar un snippet antes de este script con el valor real.
 * Si queda vacío, se usa el backend de la misma web (/api/ai/chat).
 */
(function () {
  if (typeof window === "undefined") return;
  // Permite configurar sin rebuild:
  // 1) define window.AI_ENGINE_BASE_URL desde un snippet en el HTML
  // 2) o guarda/consulta en localStorage bajo la misma key
  // Borde HTTP del backend v2 (Fastify, ADR-0043/0052): la API va bajo /v1 y
  // ApiV2.js lo agrega. Vacía = `sin_api` (el borde aún no tiene host).
  //   window.AISC_API_URL = 'https://api-v2.aismartcontent.io';
  // Base de datos (corte ADR-0052, paso 1.5): con estas dos fijas, app-loader
  // NO llama a la function supabase-config (que en el corte esta en 503).
  // Vacias = comportamiento de siempre (la function decide). La anon key es
  // publica por diseno; la seguridad vive en RLS + privilegios cerrados.
  //   window.AISC_SUPABASE_URL = 'https://aqblperqrcwumiztmjnw.supabase.co';
  //   window.AISC_SUPABASE_ANON_KEY = '<anon key del proyecto nuevo>';
  for (const k of ['AISC_SUPABASE_URL', 'AISC_SUPABASE_ANON_KEY', 'AISC_META_APP_ID']) {
    if (window[k] === undefined) {
      window[k] = (() => { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } })();
    }
  }
  // Video del login (corte 0.9, VERIFICADO 16/09 13:38 UTC: 200, video/mp4,
  // cache-control immutable): la copia con hash en media-v2 es el valor por
  // defecto de esta rama; localStorage o un snippet pueden cambiarlo sin build.
  if (window.AISC_LOGIN_VIDEO_URL === undefined) {
    window.AISC_LOGIN_VIDEO_URL = (() => { try { return localStorage.getItem("AISC_LOGIN_VIDEO_URL") || ""; } catch (_) { return ""; } })()
      || 'https://media-v2.aismartcontent.io/pub/web-assets/home-banner-web.3bb070f1d072.mp4';
  }
  // Banner de mantenimiento (corte, pasos 1.2/1.9): un texto = se ve; vacio = no.
  //   window.AISC_MANTENIMIENTO = 'hasta las 17:30';
  if (window.AISC_MANTENIMIENTO === undefined) {
    window.AISC_MANTENIMIENTO = (() => { try { return localStorage.getItem("AISC_MANTENIMIENTO") || ""; } catch (_) { return ""; } })();
  }
  if (window.AISC_API_URL === undefined) {
    window.AISC_API_URL = (() => {
      try { return localStorage.getItem("AISC_API_URL") || ""; } catch (_) { return ""; }
    })();
  }
  if (window.AI_ENGINE_BASE_URL === undefined) {
    const stored = (() => {
      try { return localStorage.getItem("AI_ENGINE_BASE_URL") || ""; } catch (_) { return ""; }
    })();
    window.AI_ENGINE_BASE_URL = stored;
  }
})();
