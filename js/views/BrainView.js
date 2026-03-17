/**
 * BrainView — Vera (AI Brain Interface)
 *
 * Layout: ChatGPT-style
 *  - Sidebar izquierdo: lista de sesiones/conversaciones + info de org
 *  - Main: topbar + mensajes + composer
 *
 * Principio: 1 org → 1 cerebro (OpenClaw) → múltiples contextos → UI simple.
 * El frontend NUNCA habla con OpenClaw: Frontend → Backend API → OpenClaw.
 */

/* ─── Helpers ─────────────────────────────────────────── */
function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function renderMarkdown(text) {
  let h = escapeHtml(text);

  // Bloques de código (``` ... ```)
  h = h.replace(/```(?:[a-z]*)\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );
  // Código inline
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Listas (bullet y numeradas), procesando línea a línea
  const lines = h.split('\n');
  const out = [];
  let listType = null;

  for (const line of lines) {
    const bullet = line.match(/^[•\-\*] (.+)$/);
    const numbered = line.match(/^\d+\. (.+)$/);
    if (bullet) {
      if (listType !== 'ul') {
        if (listType) out.push(`</${listType}>`);
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${bullet[1]}</li>`);
    } else if (numbered) {
      if (listType !== 'ol') {
        if (listType) out.push(`</${listType}>`);
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${numbered[1]}</li>`);
    } else {
      if (listType) { out.push(`</${listType}>`); listType = null; }
      out.push(line);
    }
  }
  if (listType) out.push(`</${listType}>`);

  // Párrafos (doble salto de línea)
  return out.join('\n').split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^<(ul|ol|pre|blockquote)/.test(p)) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('');
}

function groupConvsByDate(convs) {
  const now = Date.now();
  const DAY = 86400000;
  const start = (offset) => new Date(new Date().setHours(0, 0, 0, 0) - offset * DAY).getTime();
  const today = start(0), yesterday = start(1), week = start(6), month = start(29);
  const g = { today: [], yesterday: [], week: [], month: [], older: [] };
  for (const c of convs) {
    const t = new Date(c.updated_at || c.created_at).getTime();
    if (t >= today)         g.today.push(c);
    else if (t >= yesterday) g.yesterday.push(c);
    else if (t >= week)      g.week.push(c);
    else if (t >= month)     g.month.push(c);
    else                     g.older.push(c);
  }
  return g;
}

/* ─── View ─────────────────────────────────────────────── */
class BrainView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.aiState = {
      organization_id: null,
      active_conversation_id: null,
      messages: [],
      conversations: [],
      isLoading: false
    };
    this.organizationName = '';
    this.supabase = null;
    this.userId = null;
    this._sidebarOpen = true;
  }

  /* ── onEnter: auth + org data ────────────────────────── */
  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) {
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
      console.warn('BrainView supabase:', e);
    }

    this.organizationName = (window.currentOrgName || '').trim();
    if (!this.organizationName && this.supabase && this.aiState.organization_id) {
      try {
        const { data } = await this.supabase
          .from('organizations')
          .select('name')
          .eq('id', this.aiState.organization_id)
          .maybeSingle();
        this.organizationName = data?.name ? String(data.name) : '';
      } catch (_) {}
    }
    if (!this.organizationName) this.organizationName = 'Organización';

    const saved = localStorage.getItem('brain_sidebar_open');
    this._sidebarOpen = saved !== 'false';
  }

  /* ── HTML skeleton ───────────────────────────────────── */
  renderHTML() {
    const sidebarClass = this._sidebarOpen ? 'gpt-sidebar' : 'gpt-sidebar gpt-sidebar--collapsed';
    return `
      <div id="chatcontainer" class="gpt-layout">

        <!-- ══ SIDEBAR ══ -->
        <aside class="${sidebarClass}" id="gptSidebar">
          <div class="gpt-sidebar-head">
            <button class="gpt-icon-btn" id="gptToggleBtn" title="Alternar sidebar">
              <i class="fas fa-bars"></i>
            </button>
            <button class="gpt-icon-btn" id="brainNewChat" title="Nueva sesión">
              <i class="fas fa-pen-to-square"></i>
            </button>
          </div>

          <nav class="gpt-conv-list" id="gptConvList">
            <div class="gpt-conv-loading">
              <i class="fas fa-circle-notch fa-spin"></i>
            </div>
          </nav>

          <div class="gpt-sidebar-footer">
            <div class="gpt-org-row">
              <div class="gpt-org-avatar" id="gptOrgAvatar">O</div>
              <span class="gpt-org-name" id="gptOrgName">Organización</span>
            </div>
          </div>
        </aside>

        <!-- ══ MAIN ══ -->
        <div class="gpt-main" id="gptMain">

          <!-- Top bar -->
          <header class="gpt-topbar">
            <button class="gpt-icon-btn" id="gptToggleBtnMain" title="Alternar sidebar">
              <i class="fas fa-bars"></i>
            </button>
            <span class="gpt-topbar-label" id="gptTopbarLabel">Vera</span>
            <div class="gpt-topbar-right">
              <button class="gpt-icon-btn" id="brainNewChatTop" title="Nueva sesión">
                <i class="fas fa-pen-to-square"></i>
              </button>
            </div>
          </header>

          <!-- Messages area -->
          <div class="gpt-messages-scroll" id="brainMessagesWrap">
            <div class="gpt-messages-inner" id="brainMessageList"></div>
          </div>

          <!-- Composer -->
          <div class="gpt-composer-wrap" id="chatInputOverlay">
            <div class="gpt-composer" id="brainInputWrap">
              <textarea
                class="gpt-composer-textarea"
                id="brainInput"
                placeholder="Pregunta lo que quieras"
                rows="1"
              ></textarea>
              <div class="gpt-composer-row">
                <div class="gpt-composer-btns">
                  <button class="gpt-composer-icon" id="brainPlus" title="Adjuntar">
                    <i class="fas fa-paperclip"></i>
                  </button>
                </div>
                <button class="gpt-send-btn" id="brainSend" title="Enviar" disabled>
                  <i class="fas fa-arrow-up"></i>
                </button>
              </div>
            </div>
            <p class="gpt-composer-hint">Vera puede cometer errores. Verifica la información importante.</p>
          </div>

        </div><!-- /gpt-main -->
      </div><!-- /gpt-layout -->
    `;
  }

  /* ── init: wire up everything ────────────────────────── */
  async init() {
    if (!this.container) return;

    // Org info in sidebar
    const orgAvatar = document.getElementById('gptOrgAvatar');
    const orgName = document.getElementById('gptOrgName');
    if (orgAvatar) orgAvatar.textContent = (this.organizationName || 'O').charAt(0).toUpperCase();
    if (orgName) orgName.textContent = this.organizationName;

    // Sidebar toggle (both buttons do the same)
    const bindToggle = (id) => {
      const btn = document.getElementById(id);
      if (btn) this.addEventListener(btn, 'click', () => this.toggleSidebar());
    };
    bindToggle('gptToggleBtn');
    bindToggle('gptToggleBtnMain');

    // New chat buttons
    const bindNewChat = (id) => {
      const btn = document.getElementById(id);
      if (btn) this.addEventListener(btn, 'click', () => this.newConversation());
    };
    bindNewChat('brainNewChat');
    bindNewChat('brainNewChatTop');

    // Input
    this.bindInput();

    // Load conversations list
    await this.loadConversations();
    this.renderSidebar();

    // Pick latest conversation
    if (!this.aiState.active_conversation_id && this.aiState.conversations.length > 0) {
      this.aiState.active_conversation_id = this.aiState.conversations[0].id;
    }

    if (this.aiState.active_conversation_id) {
      await this.loadMessages();
      this.renderMessages();
    } else {
      this.renderWelcome();
    }

    this.updateTopbarTitle();
    this._syncSidebarUI();
  }

  /* ── Sidebar toggle ──────────────────────────────────── */
  toggleSidebar() {
    this._sidebarOpen = !this._sidebarOpen;
    localStorage.setItem('brain_sidebar_open', String(this._sidebarOpen));
    this._syncSidebarUI();
  }

  _syncSidebarUI() {
    const sidebar = document.getElementById('gptSidebar');
    if (!sidebar) return;
    if (this._sidebarOpen) {
      sidebar.classList.remove('gpt-sidebar--collapsed');
    } else {
      sidebar.classList.add('gpt-sidebar--collapsed');
    }
  }

  /* ── Conversations ───────────────────────────────────── */
  async loadConversations() {
    if (!this.supabase || !this.aiState.organization_id || !this.userId) {
      this.aiState.conversations = [];
      return;
    }
    try {
      const { data, error } = await this.supabase
        .from('ai_conversations')
        .select('id, title, updated_at, created_at')
        .eq('organization_id', this.aiState.organization_id)
        .eq('user_id', this.userId)
        .order('updated_at', { ascending: false })
        .limit(60);
      this.aiState.conversations = (!error && data) ? data : [];
    } catch (_) {
      this.aiState.conversations = [];
    }
  }

  renderSidebar() {
    const list = document.getElementById('gptConvList');
    if (!list) return;

    if (!this.aiState.conversations.length) {
      list.innerHTML = `<p class="gpt-conv-empty">Sin sesiones aún.<br>Empieza una conversación.</p>`;
      return;
    }

    const groups = groupConvsByDate(this.aiState.conversations);
    const labels = {
      today:     'Hoy',
      yesterday: 'Ayer',
      week:      'Últimos 7 días',
      month:     'Últimos 30 días',
      older:     'Anteriores'
    };

    let html = '';
    for (const [key, convs] of Object.entries(groups)) {
      if (!convs.length) continue;
      html += `<div class="gpt-conv-group-label">${labels[key]}</div>`;
      for (const c of convs) {
        const active = c.id === this.aiState.active_conversation_id ? ' gpt-conv-item--active' : '';
        const title = escapeHtml(c.title || 'Sesión sin título');
        html += `<div class="gpt-conv-item${active}" data-conv-id="${escapeHtml(c.id)}">${title}</div>`;
      }
    }

    list.innerHTML = html;

    list.querySelectorAll('.gpt-conv-item[data-conv-id]').forEach(el => {
      this.addEventListener(el, 'click', () => {
        const id = el.getAttribute('data-conv-id');
        if (id && id !== this.aiState.active_conversation_id) {
          this.switchConversation(id);
        }
      });
    });
  }

  async switchConversation(id) {
    this.aiState.active_conversation_id = id;
    this.aiState.messages = [];
    this.renderSidebar();
    this.updateTopbarTitle();
    await this.loadMessages();
    this.renderMessages();
  }

  updateTopbarTitle() {
    const label = document.getElementById('gptTopbarLabel');
    if (!label) return;
    if (this.aiState.active_conversation_id) {
      const conv = this.aiState.conversations.find(c => c.id === this.aiState.active_conversation_id);
      label.textContent = conv?.title || 'Vera';
    } else {
      label.textContent = 'Vera';
    }
  }

  async newConversation() {
    this.aiState.active_conversation_id = null;
    this.aiState.messages = [];
    this.renderSidebar();
    this.updateTopbarTitle();
    this.renderWelcome();
    const input = document.getElementById('brainInput');
    if (input) { input.value = ''; input.style.height = 'auto'; input.focus(); }
    const sendBtn = document.getElementById('brainSend');
    if (sendBtn) sendBtn.disabled = true;
  }

  /* ── Messages ────────────────────────────────────────── */
  async loadMessages() {
    if (!this.supabase || !this.aiState.active_conversation_id) {
      this.aiState.messages = [];
      return;
    }
    try {
      const { data, error } = await this.supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', this.aiState.active_conversation_id)
        .order('created_at', { ascending: true });
      this.aiState.messages = (!error && data) ? data : [];
    } catch (_) {
      this.aiState.messages = [];
    }
  }

  renderWelcome() {
    const list = document.getElementById('brainMessageList');
    if (!list) return;
    list.innerHTML = `
      <div class="gpt-welcome">
        <h1 class="gpt-welcome-title">¿En qué puedo ayudarte?</h1>
        <div class="gpt-quick-grid">
          <button class="gpt-quick-btn" data-prompt="Analiza el estado actual de mi marca y dame un resumen">
            <span class="gpt-quick-icon"><i class="fas fa-chart-line"></i></span>
            <span>Analizar mi marca</span>
          </button>
          <button class="gpt-quick-btn" data-prompt="Ayúdame a crear una nueva campaña de marketing desde cero">
            <span class="gpt-quick-icon"><i class="fas fa-bullhorn"></i></span>
            <span>Crear una campaña</span>
          </button>
          <button class="gpt-quick-btn" data-prompt="Genera contenido para mis redes sociales esta semana">
            <span class="gpt-quick-icon"><i class="fas fa-pen-nib"></i></span>
            <span>Generar contenido</span>
          </button>
          <button class="gpt-quick-btn" data-prompt="¿Qué flows tengo disponibles y cuál me recomiendas ejecutar?">
            <span class="gpt-quick-icon"><i class="fas fa-bolt"></i></span>
            <span>Ejecutar un flow</span>
          </button>
        </div>
      </div>
    `;
    list.querySelectorAll('.gpt-quick-btn[data-prompt]').forEach(btn => {
      this.addEventListener(btn, 'click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) this.sendMessage(prompt);
      });
    });
  }

  renderMessages() {
    const list = document.getElementById('brainMessageList');
    const scroll = document.getElementById('brainMessagesWrap');
    if (!list) return;

    if (!this.aiState.messages.length) {
      this.renderWelcome();
      return;
    }

    list.innerHTML = this.aiState.messages.map(m => this._msgHTML(m)).join('');
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);
  }

  _msgHTML(m) {
    const id = escapeHtml(m.id || '');
    const isUser = m.role === 'user';
    const isError = m.role === 'error';

    if (isUser) {
      return `
        <div class="gpt-msg gpt-msg--user" data-message-id="${id}">
          <div class="gpt-msg-bubble">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
        </div>`;
    }

    return `
      <div class="gpt-msg gpt-msg--assistant${isError ? ' gpt-msg--error' : ''}" data-message-id="${id}">
        <div class="gpt-msg-avatar">V</div>
        <div class="gpt-msg-content">${renderMarkdown(m.content)}</div>
      </div>`;
  }

  appendMessage(msg) {
    const list = document.getElementById('brainMessageList');
    const scroll = document.getElementById('brainMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    list.insertAdjacentHTML('beforeend', this._msgHTML(msg));
    if (scroll) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 20);
  }

  /* ── Typing indicator ────────────────────────────────── */
  showTypingIndicator() {
    const list = document.getElementById('brainMessageList');
    const scroll = document.getElementById('brainMessagesWrap');
    if (!list) return;
    const welcome = list.querySelector('.gpt-welcome');
    if (welcome) welcome.remove();
    document.getElementById('gptTyping')?.remove();
    list.insertAdjacentHTML('beforeend', `
      <div id="gptTyping" class="gpt-msg gpt-msg--assistant gpt-msg--typing">
        <div class="gpt-msg-avatar">V</div>
        <div class="gpt-msg-content">
          <div class="gpt-typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    `);
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  hideTypingIndicator() {
    document.getElementById('gptTyping')?.remove();
  }

  /* ── Input binding ───────────────────────────────────── */
  bindInput() {
    const input = document.getElementById('brainInput');
    const sendBtn = document.getElementById('brainSend');
    if (!input) return;

    const autoResize = () => {
      input.style.height = 'auto';
      const next = Math.min(180, input.scrollHeight || 0);
      if (next > 0) input.style.height = `${next}px`;
    };

    const syncSendBtn = () => {
      if (sendBtn) sendBtn.disabled = !(input.value || '').trim() || this.aiState.isLoading;
    };

    this.addEventListener(input, 'input', () => { autoResize(); syncSendBtn(); });
    autoResize();
    syncSendBtn();

    const send = () => {
      const text = (input.value || '').trim();
      if (!text || this.aiState.isLoading) return;
      this.sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
      syncSendBtn();
    };

    this.addEventListener(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    if (sendBtn) this.addEventListener(sendBtn, 'click', send);

    // Plus / mic — placeholder
    const plusBtn = document.getElementById('brainPlus');
    if (plusBtn) this.addEventListener(plusBtn, 'click', () => {});
  }

  /* ── Send message ────────────────────────────────────── */
  async sendMessage(text) {
    if (!this.aiState.organization_id || this.aiState.isLoading) return;
    this.aiState.isLoading = true;

    const sendBtn = document.getElementById('brainSend');
    const input = document.getElementById('brainInput');
    if (sendBtn) sendBtn.disabled = true;

    // Optimistic: append user message immediately
    const userMsg = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    this.aiState.messages.push(userMsg);
    this.appendMessage(userMsg);
    this.showTypingIndicator();

    try {
      const token = this.supabase
        ? (await this.supabase.auth.getSession())?.data?.session?.access_token
        : null;

      const res = await fetch(`${window.location.origin}/api/ai/chat`, {
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

      // New conversation created by backend
      if (json?.conversation_id && !this.aiState.active_conversation_id) {
        this.aiState.active_conversation_id = json.conversation_id;
        await this.loadConversations();
        this.renderSidebar();
        this.updateTopbarTitle();
      }

      this.hideTypingIndicator();

      if (json?.message) {
        const assistantMsg = {
          id: `local-assistant-${Date.now()}`,
          role: 'assistant',
          content: json.message,
          created_at: new Date().toISOString()
        };
        this.aiState.messages.push(assistantMsg);
        this.appendMessage(assistantMsg);
      }
    } catch (err) {
      console.error('BrainView sendMessage:', err);
      this.hideTypingIndicator();
      const errMsg = {
        id: `local-error-${Date.now()}`,
        role: 'error',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Inténtalo de nuevo.',
        created_at: new Date().toISOString()
      };
      this.aiState.messages.push(errMsg);
      this.appendMessage(errMsg);
    } finally {
      this.aiState.isLoading = false;
      if (sendBtn) sendBtn.disabled = !(input?.value || '').trim();
    }
  }
}

window.BrainView = BrainView;
