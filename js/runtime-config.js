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
