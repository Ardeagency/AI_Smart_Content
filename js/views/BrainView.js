/**
 * BrainView (AIChatPage) - Chat conversacional con Vera
 *
 * Ruta: /org/:orgIdShort/:orgNameSlug/brain o /brain
 * Estado: organization_id, brand_container_id, conversation_id, messages, isLoading
 * El frontend NUNCA habla con OpenClaw; siempre Frontend → Backend API → OpenClaw.
 */

const BRAIN_BG = '#0F1115';
const BRAIN_BUBBLE = '#1B1F26';
const BRAIN_TEXT = '#FFFFFF';
const BRAIN_ACCENT = '#4e4ad9';

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

function formatConversationDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  if (diff < 86400000 * 2) return 'Ayer';
  return d.toLocaleDateString();
}

function groupConversationsByDate(conversations) {
  const groups = { Hoy: [], Ayer: [], Antes: [] };
  const today = new Date().toDateString();
  conversations.forEach((c) => {
    const key = new Date(c.created_at).toDateString();
    if (key === today) groups.Hoy.push(c);
    else if (new Date() - new Date(c.created_at) < 86400000 * 2) groups.Ayer.push(c);
    else groups.Antes.push(c);
  });
  return groups;
}

class BrainView extends (window.BaseView || class {}) {
  constructor() {
    super();
    this.templatePath = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.brandName = '';
    this.conversationId = null;
    this.conversations = [];
    this.messages = [];
    this.isLoading = false;
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
    this.organizationId =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (!this.organizationId) {
      const url =
        window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
          ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
          : '/settings';
      if (window.router) window.router.navigate(url, true);
      return;
    }
    if (window.appState) window.appState.set('selectedOrganizationId', this.organizationId, true);
    localStorage.setItem('selectedOrganizationId', this.organizationId);

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

    this.brandContainerId = await this.getBrandContainerId();
    this.brandName = await this.loadBrandName();
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      if (this.organizationId) {
        const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) return data.id;
      }
      if (this.userId) {
        const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) return data.id;
      }
    } catch (e) {
      console.warn('BrainView getBrandContainerId:', e);
    }
    return null;
  }

  async loadBrandName() {
    if (!this.supabase || !this.brandContainerId) return 'Marca';
    const { data } = await this.supabase
      .from('brand_containers')
      .select('nombre_marca')
      .eq('id', this.brandContainerId)
      .maybeSingle();
    return (data && data.nombre_marca) || 'Marca';
  }

  renderHTML() {
    return `
      <div class="brain-page" data-brain-root>
        <aside class="brain-sidebar" id="brainSidebar">
          <button type="button" class="btn brain-sidebar-new" id="brainNewConversation">
            <i class="fas fa-plus"></i> Nueva conversación
          </button>
          <div class="brain-sidebar-list" id="brainConversationList"></div>
        </aside>
        <main class="brain-main">
          <header class="brain-header" id="brainHeader">Vera — ${escapeHtml(this.brandName)}</header>
          <div class="brain-messages-wrap" id="brainMessagesWrap">
            <div class="brain-message-list" id="brainMessageList"></div>
            <div class="brain-action-cards" id="brainActionCards"></div>
          </div>
          <div class="brain-input-wrap">
            <div class="brain-input-inner">
              <textarea
                class="brain-input"
                id="brainInput"
                placeholder="Escribe tu mensaje... (Enter enviar, Shift+Enter nueva línea)"
                rows="1"
              ></textarea>
              <button type="button" class="btn btn-icon brain-send" id="brainSend" aria-label="Enviar">
                <i class="fas fa-arrow-up"></i>
              </button>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  async init() {
    if (!this.container) return;
    const root = this.container.querySelector('[data-brain-root]');
    if (!root) return;

    await this.ensureConversation();
    await this.loadConversations();
    this.renderConversationList();
    this.renderMessages();
    this.bindInput();
    this.bindSidebar();
    this.updateHeaderContext('Vera', null, this.brandName);
  }

  async ensureConversation() {
    if (this.conversationId) return;
    if (!this.supabase || !this.brandContainerId || !this.userId) return;
    const { data: existing } = await this.supabase
      .from('ai_conversations')
      .select('id, title')
      .eq('brand_container_id', this.brandContainerId)
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      this.conversationId = existing.id;
      return;
    }
    const { data: created, error } = await this.supabase
      .from('ai_conversations')
      .insert({
        brand_container_id: this.brandContainerId,
        user_id: this.userId,
        title: 'Nueva conversación'
      })
      .select('id')
      .single();
    if (error) {
      console.error('BrainView create conversation:', error);
      return;
    }
    this.conversationId = created.id;
    this.conversations.unshift({ id: created.id, title: 'Nueva conversación', created_at: new Date().toISOString() });
  }

  async loadConversations() {
    if (!this.supabase || !this.brandContainerId) {
      this.conversations = [];
      return;
    }
    const { data, error } = await this.supabase
      .from('ai_conversations')
      .select('id, title, created_at')
      .eq('brand_container_id', this.brandContainerId)
      .order('created_at', { ascending: false });
    if (!error && data) this.conversations = data;
    else this.conversations = [];
  }

  renderConversationList() {
    const list = document.getElementById('brainConversationList');
    if (!list) return;
    const groups = groupConversationsByDate(this.conversations);
    let html = '';
    ['Hoy', 'Ayer', 'Antes'].forEach((label) => {
      const items = groups[label];
      if (!items || items.length === 0) return;
      html += `<div class="brain-sidebar-group"><span class="brain-sidebar-group-label">${escapeHtml(label)}</span>`;
      items.forEach((c) => {
        const active = c.id === this.conversationId ? ' brain-conv-active' : '';
        html += `<button type="button" class="brain-conv-item${active}" data-conversation-id="${escapeHtml(c.id)}">${escapeHtml(c.title || 'Sin título')}</button>`;
      });
      html += '</div>';
    });
    if (!html) html = '<p class="brain-sidebar-empty">No hay conversaciones</p>';
    list.innerHTML = html;
  }

  async loadMessages() {
    if (!this.supabase || !this.conversationId) {
      this.messages = [];
      return;
    }
    const { data, error } = await this.supabase
      .from('ai_messages')
      .select('id, role, content, attachments, created_at')
      .eq('conversation_id', this.conversationId)
      .order('created_at', { ascending: true });
    if (!error && data) this.messages = data;
    else this.messages = [];
  }

  renderMessages() {
    const list = document.getElementById('brainMessageList');
    const cards = document.getElementById('brainActionCards');
    if (!list) return;
    if (cards) cards.innerHTML = '';

    if (this.messages.length === 0) {
      list.innerHTML = `
        <div class="brain-message brain-message-assistant">
          <div class="brain-bubble brain-bubble-assistant">
            <div class="brain-bubble-content">${WELCOME_MESSAGE.replace(/\n/g, '<br>')}</div>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = this.messages
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
    list.scrollTop = list.scrollHeight;
  }

  renderActionCards(actions) {
    if (!actions || actions.length === 0) return;
    const wrap = document.getElementById('brainActionCards');
    if (!wrap) return;
    wrap.innerHTML = actions
      .map(
        (a) => `
        <button type="button" class="brain-action-card" data-action-type="${escapeHtml(a.action_type)}" data-payload="${escapeHtml(JSON.stringify(a.payload || {}))}">
          ${a.label ? escapeHtml(a.label) : a.action_type}
        </button>
      `
      )
      .join('');
  }

  bindInput() {
    const input = document.getElementById('brainInput');
    const sendBtn = document.getElementById('brainSend');
    if (!input || !sendBtn) return;

    const send = () => {
      const text = (input.value || '').trim();
      if (!text || this.isLoading) return;
      this.sendMessage(text);
      input.value = '';
      input.style.height = 'auto';
    };

    this.addEventListener(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    this.addEventListener(sendBtn, 'click', send);
  }

  bindSidebar() {
    const newBtn = document.getElementById('brainNewConversation');
    const list = document.getElementById('brainConversationList');
    if (newBtn) this.addEventListener(newBtn, 'click', () => this.createNewConversation());
    if (list) {
      list.addEventListener('click', (e) => {
        const id = e.target.closest('[data-conversation-id]')?.getAttribute('data-conversation-id');
        if (id) this.selectConversation(id);
      });
    }
  }

  async createNewConversation() {
    if (!this.supabase || !this.brandContainerId || !this.userId) return;
    const { data, error } = await this.supabase
      .from('ai_conversations')
      .insert({
        brand_container_id: this.brandContainerId,
        user_id: this.userId,
        title: 'Nueva conversación'
      })
      .select('id, title, created_at')
      .single();
    if (error) {
      console.error('BrainView create conversation:', error);
      return;
    }
    this.conversationId = data.id;
    this.conversations.unshift(data);
    this.messages = [];
    this.renderConversationList();
    this.renderMessages();
    const cards = document.getElementById('brainActionCards');
    if (cards) cards.innerHTML = '';
  }

  async selectConversation(id) {
    this.conversationId = id;
    await this.loadMessages();
    this.renderConversationList();
    this.renderMessages();
    const cards = document.getElementById('brainActionCards');
    if (cards) cards.innerHTML = '';
  }

  async sendMessage(text) {
    if (!this.organizationId || !this.conversationId || !this.supabase || this.isLoading) return;
    this.isLoading = true;
    const wrap = document.getElementById('brainMessagesWrap');
    const sendBtn = document.getElementById('brainSend');
    if (wrap) wrap.classList.add('brain-loading');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const { data: userMsg, error: insertErr } = await this.supabase
        .from('ai_messages')
        .insert({
          conversation_id: this.conversationId,
          role: 'user',
          content: text
        })
        .select('id, content, created_at')
        .single();
      if (insertErr) throw insertErr;

      this.messages.push({ ...userMsg, role: 'user' });
      this.renderMessages();

      const apiBase = window.location.origin;
      const res = await fetch(`${apiBase}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: this.organizationId,
          brand_container_id: this.brandContainerId || undefined,
          conversation_id: this.conversationId,
          message: text
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const assistant = json.assistant_message || {};
      const content = assistant.content || 'No pude generar una respuesta.';

      const { data: assistantRow, error: assistantErr } = await this.supabase
        .from('ai_messages')
        .insert({
          conversation_id: this.conversationId,
          role: 'assistant',
          content
        })
        .select('id, content, created_at')
        .single();
      if (assistantErr) throw assistantErr;

      this.messages.push({ ...assistantRow, role: 'assistant' });
      this.renderMessages();
      this.renderActionCards(assistant.actions || []);

      const list = document.getElementById('brainMessageList');
      if (list) list.scrollTop = list.scrollHeight;
    } catch (err) {
      console.error('BrainView sendMessage:', err);
      this.messages.push({
        id: null,
        role: 'assistant',
        content: 'Lo siento, hubo un error. Vuelve a intentarlo.',
        created_at: new Date().toISOString()
      });
      this.renderMessages();
    } finally {
      this.isLoading = false;
      if (wrap) wrap.classList.remove('brain-loading');
      const btn = document.getElementById('brainSend');
      if (btn) btn.disabled = false;
    }
  }
}

window.BrainView = BrainView;
