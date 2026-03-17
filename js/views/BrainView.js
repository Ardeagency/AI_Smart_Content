/**
 * BrainView (AI Brain Interface) - Vera
 *
 * Ruta: /org/:orgIdShort/:orgNameSlug/brain o /brain
 *
 * PRINCIPIO: el frontend NO es “un chat”, es una interfaz de cerebro:
 * - 1 organización → 1 cerebro (OpenClaw) → múltiples contextos invisibles → UI simple.
 *
 * Estado mínimo (frontend):
 * aiState = { organization_id, active_conversation_id, messages: [], isLoading: false }
 *
 * Tablas (frontend):
 * - ai_conversations (core): solo 1 activa (última); no sidebar tipo ChatGPT
 * - ai_messages (core): chat visible
 * - ai_chat_actions (producto): cards de acción por message_id
 * - ai_chat_context (invisible): chips de contexto + selector (POST)
 *
 * El frontend NUNCA habla con OpenClaw: Frontend → Backend API → OpenClaw.
 */

const WELCOME_MESSAGE = `Hola, soy Vera, el AI Brain de tu organización.

Puedo ayudarte a:

• analizar tu marca
• crear campañas
• generar contenido
• analizar competidores
• ejecutar flows

¿Qué quieres hacer hoy?`;

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

class BrainView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.aiState = {
      organization_id: null,
      active_conversation_id: null,
      messages: [],
      isLoading: false
    };
    this.organizationName = '';
    this.supabase = null;
    this.userId = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.aiState.organization_id =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (!this.aiState.organization_id) {
      const url =
        window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
          ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
          : '/settings';
      if (window.router) window.router.navigate(url, true);
      return;
    }
    if (window.appState) window.appState.set('selectedOrganizationId', this.aiState.organization_id, true);
    localStorage.setItem('selectedOrganizationId', this.aiState.organization_id);

    try {
      this.supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
      const user = window.authService?.getCurrentUser();
      if (!user?.id && this.supabase) {
        const { data: { user: u } } = await this.supabase.auth.getUser();
        this.userId = u?.id;
      } else {
        this.userId = user?.id;
      }
    } catch (e) {
      console.warn('BrainView onEnter supabase:', e);
    }

    this.organizationName = (window.currentOrgName || '').trim();
    if (!this.organizationName && this.supabase && this.aiState.organization_id) {
      try {
        const { data } = await this.supabase
          .from('organizations')
          .select('name')
          .eq('id', this.aiState.organization_id)
          .maybeSingle();
        this.organizationName = (data && data.name) ? String(data.name) : '';
      } catch (_) {}
    }
    if (!this.organizationName) this.organizationName = 'Organización';
  }

  renderHTML() {
    return `
      <div class="brain-page brain-has-chat" id="chatcontainer">
        <div class="brain-chat" id="veraChat" aria-hidden="false">
          <div class="brain-messages-wrap" id="brainMessagesWrap">
            <div class="brain-message-list" id="brainMessageList"></div>
            <div id="space" aria-hidden="true"></div>
          </div>
        </div>
      </div>

      <div class="brain-input-overlay" id="chatInputOverlay" aria-label="Input Vera">
        <div class="brain-input-wrap brain-input-wrap--solo" id="brainInputWrap">
          <div class="brain-prompt-bar glass-black" role="group" aria-label="Input Vera">
            <button type="button" class="brain-prompt-icon" id="brainPlus" aria-label="Adjuntar">
              <i class="fas fa-plus"></i>
            </button>
            <textarea
              class="brain-prompt-input"
              id="brainInput"
              placeholder="Pregunta lo que quieras"
              rows="1"
            ></textarea>
            <button type="button" class="brain-prompt-icon" id="brainMic" aria-label="Voz (próximamente)">
              <i class="fas fa-microphone"></i>
            </button>
            <button type="button" class="brain-prompt-send" id="brainSend" aria-label="Enviar">
              <i class="fas fa-arrow-up"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    if (!this.container) return;
    const root = this.container.querySelector('#chatcontainer');
    if (!root) return;

    await this.loadActiveConversation();
    this.bindInput();
    this.syncInputOverlaySpace();

    // Si ya existe conversación con mensajes, renderizarlos.
    if (this.aiState.active_conversation_id) {
      await this.loadMessages();
      if (this.aiState.messages.length > 0) {
        this.renderMessages();
      }
    }
    // Sin mensajes: mostrar welcome
    if (!this.aiState.active_conversation_id || this.aiState.messages.length === 0) {
      this.renderMessages();
    }
  }

  syncInputOverlaySpace() {
    const space = document.getElementById('space');
    if (!space) return;
    // Espacio fijo al final del chat; no depende de la altura del footer.
    space.style.height = '140px';
  }

  destroy() {
    // No hay observers activos para el espacio del footer actualmente.
    super.destroy();
  }

  showChatStage() {
    const chat = document.getElementById('veraChat');
    if (chat) chat.setAttribute('aria-hidden', 'false');
  }

  async loadActiveConversation() {
    if (this.aiState.active_conversation_id) return;
    if (!this.supabase || !this.aiState.organization_id || !this.userId) return;

    // Última conversación “activa” para la organización (no mostramos listado).
    const { data: existing } = await this.supabase
      .from('ai_conversations')
      .select('id, updated_at, created_at')
      .eq('organization_id', this.aiState.organization_id)
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      this.aiState.active_conversation_id = existing.id;
      return;
    }
    // Importante: NO crear conversación en estado vacío.
    // La conversación se crea automáticamente al enviar el primer mensaje (backend).
  }

  async loadMessages() {
    if (!this.supabase || !this.aiState.active_conversation_id) {
      this.aiState.messages = [];
      return;
    }
    const { data, error } = await this.supabase
      .from('ai_messages')
      .select('id, role, content, attachments, created_at')
      .eq('conversation_id', this.aiState.active_conversation_id)
      .order('created_at', { ascending: true });
    if (!error && data) this.aiState.messages = data;
    else this.aiState.messages = [];
  }

  renderMessages() {
    const list = document.getElementById('brainMessageList');
    const scrollEl = document.getElementById('chatcontainer') || document.getElementById('brainMessagesWrap');
    if (!list) return;

    if (this.aiState.messages.length === 0) {
      list.innerHTML = `
        <div class="brain-message brain-message-assistant">
          <div class="brain-bubble brain-bubble-assistant">
            <div class="brain-bubble-content">${WELCOME_MESSAGE.replace(/\n/g, '<br>')}</div>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = this.aiState.messages
      .map((m) => {
        const isUser = m.role === 'user';
        return `
          <div class="brain-message brain-message-${isUser ? 'user' : 'assistant'}" data-message-id="${escapeHtml(m.id)}">
            <div class="brain-bubble brain-bubble-${isUser ? 'user' : 'assistant'}">
              <div class="brain-bubble-content">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
            </div>
          </div>
        `;
      })
      .join('');
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  bindInput() {
    const input = document.getElementById('brainInput');
    if (!input) return;
    const sendBtn = document.getElementById('brainSend');
    const plusBtn = document.getElementById('brainPlus');
    const micBtn = document.getElementById('brainMic');

    const autoResize = () => {
      input.style.height = 'auto';
      const max = 140;
      const next = Math.min(max, input.scrollHeight || 0);
      if (next > 0) {
        input.style.height = `${next}px`;
      }
    };

    const send = () => {
      const text = (input.value || '').trim();
      if (!text || this.aiState.isLoading) return;
      this.sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
    };

    this.addEventListener(input, 'input', autoResize);
    autoResize();

    this.addEventListener(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    if (sendBtn) this.addEventListener(sendBtn, 'click', send);
    if (plusBtn) this.addEventListener(plusBtn, 'click', () => {});
    if (micBtn) this.addEventListener(micBtn, 'click', () => {});
  }

  async sendMessage(text) {
    if (!this.aiState.organization_id || !this.supabase || this.aiState.isLoading) return;
    this.aiState.isLoading = true;
    const sendBtn = document.getElementById('brainSend');
    if (sendBtn) sendBtn.disabled = true;

    try {
      // Optimistic UI: mostrar chat y el mensaje del usuario inmediatamente (sin depender de RLS/SELECT).
      if (!this.aiState.active_conversation_id) {
        // Primera interacción: activar el modo chat visual aunque aún no haya conversation_id.
        this.showChatStage();
      } else {
        this.showChatStage();
      }
      this.aiState.messages.push({
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString()
      });
      this.renderMessages();

      const token = (await this.supabase.auth.getSession())?.data?.session?.access_token;
      const apiBase = window.location.origin;
      const res = await fetch(`${apiBase}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          organization_id: this.aiState.organization_id,
          conversation_id: this.aiState.active_conversation_id || undefined,
          message: text
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (json?.conversation_id && !this.aiState.active_conversation_id) {
        this.aiState.active_conversation_id = json.conversation_id;
      }

      // Renderizar respuesta del assistant directamente desde backend (sin SELECT).
      if (json?.message) {
        this.aiState.messages.push({
          id: `local-assistant-${Date.now()}`,
          role: 'assistant',
          content: json.message,
          created_at: new Date().toISOString()
        });
        this.renderMessages();
      }

      const scrollEl = document.getElementById('chatcontainer') || document.getElementById('brainMessagesWrap');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    } catch (err) {
      console.error('BrainView sendMessage:', err);
      // Feedback mínimo en UI (sin romper el diseño)
      this.aiState.messages.push({
        id: `local-error-${Date.now()}`,
        role: 'assistant',
        content: 'Lo siento, no pude enviar el mensaje. Revisa tu sesión o inténtalo de nuevo.',
        created_at: new Date().toISOString()
      });
      this.renderMessages();
    } finally {
      this.aiState.isLoading = false;
      const btn = document.getElementById('brainSend');
      if (btn) btn.disabled = false;
    }
  }
}

window.BrainView = BrainView;
