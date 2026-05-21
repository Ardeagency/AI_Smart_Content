/**
 * VeraVoice — sesión de voz en tiempo real con el agente ElevenLabs Conversational AI.
 *
 * Flujo:
 *   1. Pide permiso de micrófono (getUserMedia audio).
 *   2. Fetch /api/ai/voice-session → ai-engine → ElevenLabs signed URL.
 *   3. Carga el SDK @elevenlabs/client desde ESM CDN (lazy, primera vez).
 *   4. Conversation.startSession({ signedUrl, dynamicVariables, callbacks }).
 *   5. El SDK maneja captura PCM, VAD, turn-taking, playback de audio sintetizado.
 *   6. Eventos a la UI (mode change, message, error) via callbacks.
 *
 * No expone la API key — el signed URL ya viene autenticado al agente Vera.
 *
 * Uso:
 *   const voice = new window.VeraVoice({ supabase, organizationId, onState, onMessage });
 *   voice.toggle();
 */
(function () {
  const SDK_URL = "https://esm.sh/@elevenlabs/client@1.8.0";
  const SESSION_ENDPOINT = "/api/ai/voice-session";

  let _sdkPromise = null;
  async function _loadSDK() {
    if (!_sdkPromise) _sdkPromise = import(/* @vite-ignore */ SDK_URL);
    return _sdkPromise;
  }

  class VeraVoice {
    constructor({ supabase, organizationId, onState, onMessage, onError }) {
      this.supabase = supabase;
      this.organizationId = organizationId;
      this.onState = onState || (() => {});
      this.onMessage = onMessage || (() => {});
      this.onError = onError || (() => {});
      this._conversation = null;
      this._active = false;
    }

    isActive() {
      return this._active;
    }

    async start() {
      if (this._active) return;
      this.onState("connecting");

      // 1) Permiso de micrófono — pedimos y soltamos (el SDK luego abre su propio stream).
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (_) {
        const err = new Error(
          "No se pudo acceder al micrófono. Revisa los permisos del navegador."
        );
        this.onState("error", { message: err.message });
        this.onError(err);
        return;
      }

      // 2) Signed URL desde nuestro backend (auth via Supabase JWT)
      let session;
      try {
        const token = this.supabase
          ? (await this.supabase.auth.getSession())?.data?.session?.access_token
          : null;
        if (!token) throw new Error("Sesión no válida. Inicia sesión de nuevo.");

        const res = await fetch(SESSION_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ organization_id: this.organizationId }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`No se pudo iniciar la sesión de voz: ${txt.slice(0, 160)}`);
        }
        session = await res.json();
      } catch (e) {
        this.onState("error", { message: e.message });
        this.onError(e);
        return;
      }

      // 3) Cargar SDK ElevenLabs (cacheado tras primer llamada)
      let SDK;
      try {
        SDK = await _loadSDK();
      } catch (_) {
        const err = new Error("No se pudo cargar el SDK de voz. Verifica tu conexión.");
        this.onState("error", { message: err.message });
        this.onError(err);
        return;
      }

      // 4) Abrir conversación
      try {
        this._conversation = await SDK.Conversation.startSession({
          signedUrl: session.signed_url,
          dynamicVariables: session.dynamic_variables || {},

          onConnect: (props) => {
            console.log("[VeraVoice] connected", props);
            this._active = true;
            this.onState("listening");
          },
          onDisconnect: (details) => {
            console.warn("[VeraVoice] disconnected", JSON.stringify(details, null, 2));
            this._active = false;
            this._conversation = null;
            const closeCode = details?.closeCode;
            const closeReason = details?.closeReason || details?.context?.reason;
            const reason = details?.reason;
            if (reason === "error" || closeCode >= 4000) {
              this.onState("error", {
                message: `Conexión cerrada (${closeCode || reason}): ${closeReason || details?.message || "sin detalle"}`,
              });
            } else {
              this.onState("idle");
            }
          },
          onError: (msg, context) => {
            console.error("[VeraVoice] error", msg, context);
            const err = new Error(typeof msg === "string" ? msg : "Error en sesión de voz");
            this.onState("error", { message: err.message });
            this.onError(err);
          },
          onModeChange: ({ mode }) => {
            this.onState(mode === "speaking" ? "speaking" : "listening");
          },
          onMessage: ({ message, source }) => {
            const role = source === "user" ? "user" : "agent";
            this.onMessage(role, message);
          },
        });
      } catch (e) {
        this._active = false;
        this.onState("error", { message: e.message });
        this.onError(e);
      }
    }

    async stop() {
      if (!this._conversation) {
        this._active = false;
        this.onState("idle");
        return;
      }
      try {
        await this._conversation.endSession();
      } catch (_) {}
      this._conversation = null;
      this._active = false;
      this.onState("idle");
    }

    async toggle() {
      if (this._active) await this.stop();
      else await this.start();
    }
  }

  window.VeraVoice = VeraVoice;
})();
