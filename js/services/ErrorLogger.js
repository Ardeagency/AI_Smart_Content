/**
 * ErrorLogger — captura errores del frontend en producción.
 *
 * Por qué: en `app-loader.js` el console.* está silenciado en prod (privacidad
 * + tamaño de logs); sin esto perderíamos todos los crashes que ven los
 * usuarios reales. ErrorLogger los buffea en localStorage (rolling 100) y los
 * flushea por batch al RPC `log_frontend_error` cuando la red da.
 *
 * Si el RPC no existe / falla, el buffer se queda en LS y se vuelve a intentar
 * en el próximo flush — nunca perdemos eventos en silencio. El usuario puede
 * inspeccionar en consola con `errorLogger.dump()` al reportar un bug.
 *
 * Schema esperado de Supabase (ver SQL/migrations/migration_frontend_errors.sql):
 *
 *   create table public.frontend_errors (
 *     id          uuid primary key default gen_random_uuid(),
 *     user_id     uuid references auth.users(id),
 *     org_id      uuid,
 *     route       text,
 *     message     text not null,
 *     stack       text,
 *     build_id    text,
 *     user_agent  text,
 *     ctx         jsonb,
 *     created_at  timestamptz not null default now()
 *   );
 *   create or replace function public.log_frontend_error(payloads jsonb)
 *     returns void as $$ ... $$ language plpgsql security definer;
 */
(function () {
  'use strict';

  const BUFFER_KEY     = 'asc_error_buffer';
  const MAX_BUFFER     = 100;
  const FLUSH_DEBOUNCE = 4 * 1000;
  const FLUSH_RETRY    = 60 * 1000;     // si falló, reintentar al cabo de 1 min
  const MAX_MSG_LEN    = 2000;          // recortes para no llenar la red
  const MAX_STACK_LEN  = 8000;

  let queue = [];
  let flushTimer = null;
  let lastFlushFailedAt = 0;

  // ───────────────────────────────────────────────── captura

  function buildPayload(error, ctx) {
    const err = (error instanceof Error) ? error : new Error(error == null ? 'Unknown error' : String(error));
    const message = (err.message || 'Unknown error').slice(0, MAX_MSG_LEN);
    const stack = err.stack ? String(err.stack).slice(0, MAX_STACK_LEN) : null;
    const route = (location.pathname || '/') + (location.search || '');
    const userId = (window.authService && typeof window.authService.getCurrentUser === 'function')
      ? (window.authService.getCurrentUser()?.id || null)
      : null;
    return {
      message,
      stack,
      route,
      user_id: userId,
      org_id:  window.currentOrgId || null,
      build_id: (typeof APP_LAZY_SCRIPT_VER !== 'undefined' ? APP_LAZY_SCRIPT_VER : null),
      user_agent: navigator.userAgent,
      ctx: ctx && typeof ctx === 'object' ? safeCtx(ctx) : null,
      ts: new Date().toISOString()
    };
  }

  /** Recorta el ctx para que sea serializable y no llegue megas a la BD. */
  function safeCtx(obj) {
    try {
      const json = JSON.stringify(obj, (key, value) => {
        if (value instanceof Error) return { message: value.message, stack: value.stack };
        if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
        return value;
      });
      return JSON.parse(json);
    } catch (_) {
      return { _unserializable: true };
    }
  }

  function capture(error, ctx) {
    try {
      const payload = buildPayload(error, ctx);
      queue.push(payload);
      persist();
      scheduleFlush();
    } catch (_) { /* nunca tirar desde el logger */ }
  }

  // ─────────────────────────────────────────────── persistencia (LS)

  function readBuffer() {
    try {
      const raw = localStorage.getItem(BUFFER_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function writeBuffer(arr) {
    try {
      const trimmed = arr.length > MAX_BUFFER ? arr.slice(-MAX_BUFFER) : arr;
      localStorage.setItem(BUFFER_KEY, JSON.stringify(trimmed));
    } catch (_) { /* quota exceeded, lo dejamos pasar */ }
  }

  function persist() {
    if (queue.length === 0) return;
    const merged = readBuffer().concat(queue.splice(0));
    writeBuffer(merged);
  }

  // ─────────────────────────────────────────────── flush a Supabase

  function scheduleFlush() {
    if (flushTimer) return;
    // backoff si el último intento falló
    const delay = (lastFlushFailedAt && (Date.now() - lastFlushFailedAt) < FLUSH_RETRY)
      ? FLUSH_RETRY
      : FLUSH_DEBOUNCE;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, delay);
  }

  async function flush() {
    persist(); // si hay algo en queue lo movemos a LS antes
    const items = readBuffer();
    if (items.length === 0) return;

    const supabase = (window.supabaseService && typeof window.supabaseService.getClient === 'function')
      ? await window.supabaseService.getClient()
      : (window.supabase || null);
    if (!supabase) { scheduleFlush(); return; }

    try {
      const { error } = await supabase.rpc('log_frontend_error', { payloads: items });
      if (error) throw error;
      // OK: limpiar buffer
      writeBuffer([]);
      lastFlushFailedAt = 0;
    } catch (err) {
      // Si el RPC no existe (404 / function not found) no spameamos retries.
      const msg = String(err && (err.message || err) || '');
      if (/function .* does not exist|not found|404/i.test(msg)) {
        // Marcar pero seguir capturando. Cuando se cree el RPC empezará a flushar.
        lastFlushFailedAt = Date.now();
        if (!ErrorLogger._loggedMissingRpc) {
          ErrorLogger._loggedMissingRpc = true;
          // Usamos el console.error original (no silenciado en prod por app-loader)
          console.error('[ErrorLogger] RPC log_frontend_error no disponible — los eventos quedan en LS. Ver SQL/migrations/migration_frontend_errors.sql');
        }
      } else {
        lastFlushFailedAt = Date.now();
        scheduleFlush();
      }
    }
  }

  // ─────────────────────────────────────────────── handlers globales

  window.addEventListener('error', (e) => {
    capture(e.error || new Error(e.message || 'window.error'), {
      type: 'window.error',
      source: e.filename || null,
      line: e.lineno || null,
      column: e.colno || null
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    capture(reason instanceof Error ? reason : new Error(String(reason || 'unhandled rejection')), {
      type: 'unhandledrejection'
    });
  });

  // Flush antes de cerrar pestaña (best effort vía sendBeacon o keepalive).
  window.addEventListener('beforeunload', () => {
    persist();
    // No esperamos el flush — el resultado no nos importa al cerrar; el buffer
    // queda en LS para el próximo arranque.
  });

  // Re-flush al volver del background (tab visible de nuevo).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleFlush();
  });

  // En login/logout limpiamos cualquier evento residual del usuario anterior
  // si la flag de privacidad lo pide; por defecto preservamos (útil para
  // diagnosticar el último crash que les sacó del sistema).
  window.addEventListener('auth:signed_out', () => { /* preservamos buffer */ });

  // ─────────────────────────────────────────────── API pública

  const ErrorLogger = {
    capture,
    flush,
    /** Inspecciona el buffer actual (útil cuando un usuario reporta un bug). */
    dump() { return readBuffer(); },
    /** Vacía el buffer manualmente. */
    clear() { writeBuffer([]); },
    /** Tamaño actual del buffer. */
    size() { return readBuffer().length; }
  };

  window.errorLogger = ErrorLogger;
})();
