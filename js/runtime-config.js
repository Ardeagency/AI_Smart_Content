/**
 * Configuración en tiempo de ejecución (sin build).
 *
 * Para que Vera (BrainView) hable con tu servidor ai-engine en lugar de
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
  if (window.AI_ENGINE_BASE_URL === undefined) {
    const stored = (() => {
      try { return localStorage.getItem("AI_ENGINE_BASE_URL") || ""; } catch (_) { return ""; }
    })();
    window.AI_ENGINE_BASE_URL = stored;
  }
})();
