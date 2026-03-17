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

function actionLabel(actionType) {
  const map = {
    trigger_flow: 'Ejecutar flujo',
    update_brand_voice: 'Actualizar brand voice',
    generate_image: 'Generar imagen',
    analyze_competitor: 'Analizar competencia'
  };
  return map[actionType] || actionType;
}

function contextLabel(entityType) {
  const map = {
    product: 'Producto',
    service: 'Servicio',
    campaign: 'Campaña',
    audience: 'Audiencia',
    intelligence_signal: 'Señal',
    intelligence_entity: 'Competidor'
  };
  return map[entityType] || entityType;
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
    this.brandContainerIds = []; // opcional: para alimentar Context Selector (productos/campañas/audiencias)
    this.contextItems = [];
    this.actionsByMessageId = {};
    this.supabase = null;
    this.userId = null;
    this._inputOverlayRO = null;
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

  async getBrandContainerIdsForOrg() {
    if (!this.supabase) return null;
    try {
      const orgId = this.aiState.organization_id;
      if (!orgId) return [];
      const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: true });
      if (error) return [];
      return (data || []).map((x) => x.id).filter(Boolean);
    } catch (e) {
      console.warn('BrainView getBrandContainerIdsForOrg:', e);
    }
    return [];
  }

  renderHTML() {
    return `
      <div class="brain-page brain-stage-initial" data-brain-root id="brainRoot">
        <div class="brain-minimal-hero" id="brainHero">
          <div class="brain-minimal-title">¿En qué estás trabajando?</div>
        </div>

        <div class="brain-chat" id="brainChat" aria-hidden="true">
          <div class="brain-messages-wrap" id="brainMessagesWrap">
            <div class="brain-message-list" id="brainMessageList"></div>
          </div>
        </div>

        <div class="brain-input-overlay" id="brainInputOverlay" aria-label="Input Vera">
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
      </div>
    `;
  }

  async init() {
    if (!this.container) return;
    const root = this.container.querySelector('[data-brain-root]');
    if (!root) return;

    await this.loadActiveConversation();
    this.bindInput();
    this.syncInputOverlaySpace();

    // Si ya existe conversación con mensajes, arrancar en modo chat.
    if (this.aiState.active_conversation_id) {
      await this.loadMessages();
      if (this.aiState.messages.length > 0) {
        this.renderMessages();
        this.showChatStage();
      }
    }
  }

  syncInputOverlaySpace() {
    const root = document.getElementById('brainRoot');
    const overlay = document.getElementById('brainInputOverlay');
    if (!root || !overlay) return;

    const apply = () => {
      const h = Math.ceil(overlay.getBoundingClientRect().height || 0);
      if (h > 0) root.style.setProperty('--brain-input-overlay-space', `${h}px`);
    };
    apply();

    try {
      if (this._inputOverlayRO) this._inputOverlayRO.disconnect();
      this._inputOverlayRO = new ResizeObserver(() => apply());
      this._inputOverlayRO.observe(overlay);
      window.addEventListener('resize', apply, { passive: true });
      this._inputOverlayRO._brainApply = apply;
    } catch (_) {}
  }

  ensureFooter() {
    // Deprecated: el input ahora vive dentro del BrainView como overlay.
  }

  destroy() {
    try {
      if (this._inputOverlayRO) {
        const apply = this._inputOverlayRO._brainApply;
        if (apply) window.removeEventListener('resize', apply);
        this._inputOverlayRO.disconnect();
      }
    } catch (_) {}
    super.destroy();
  }

  showChatStage() {
    const root = document.getElementById('brainRoot');
    if (root) root.classList.add('brain-has-chat');
    const chat = document.getElementById('brainChat');
    if (chat) chat.setAttribute('aria-hidden', 'false');
    const hero = document.getElementById('brainHero');
    if (hero) hero.style.display = 'none';
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

  async loadContext() {
    this.contextItems = [];
    if (!this.supabase || !this.aiState.active_conversation_id) return;

    const { data, error } = await this.supabase
      .from('ai_chat_context')
      .select('id, entity_type, entity_id, importance_weight, created_at')
      .eq('conversation_id', this.aiState.active_conversation_id)
      .order('created_at', { ascending: false });
    if (error || !data) return;

    // Resolver nombres por tipo (best-effort).
    const resolved = [];
    for (const row of data) {
      const label = contextLabel(row.entity_type);
      let name = null;
      try {
        if (row.entity_type === 'product') {
          const { data: p } = await this.supabase.from('products').select('nombre_producto').eq('id', row.entity_id).maybeSingle();
          name = p?.nombre_producto || null;
        } else if (row.entity_type === 'service') {
          const { data: s } = await this.supabase.from('services').select('nombre_servicio').eq('id', row.entity_id).maybeSingle();
          name = s?.nombre_servicio || null;
        } else if (row.entity_type === 'campaign') {
          const { data: c } = await this.supabase.from('campaigns').select('nombre_campana').eq('id', row.entity_id).maybeSingle();
          name = c?.nombre_campana || null;
        } else if (row.entity_type === 'audience') {
          const { data: a } = await this.supabase.from('audiences').select('name').eq('id', row.entity_id).maybeSingle();
          name = a?.name || null;
        } else if (row.entity_type === 'intelligence_entity') {
          const { data: ie } = await this.supabase.from('intelligence_entities').select('name').eq('id', row.entity_id).maybeSingle();
          name = ie?.name || null;
        } else if (row.entity_type === 'intelligence_signal') {
          const { data: isg } = await this.supabase.from('intelligence_signals').select('signal_type').eq('id', row.entity_id).maybeSingle();
          name = isg?.signal_type || null;
        }
      } catch (_) {}

      resolved.push({
        id: row.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        label,
        name: name || String(row.entity_id).slice(0, 8)
      });
    }
    // Dedupe: solo mostrar 1 por (type,id) (la más reciente)
    const seen = new Set();
    this.contextItems = resolved.filter((x) => {
      const k = `${x.entity_type}:${x.entity_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 6);
  }

  async loadActionsForLastAssistant() {
    const last = [...this.aiState.messages].reverse().find((m) => m.role === 'assistant' && m.id);
    if (!last?.id) return;
    if (this.actionsByMessageId[last.id]) return;
    if (!this.supabase) return;
    const { data, error } = await this.supabase
      .from('ai_chat_actions')
      .select('id, action_type, status, related_flow_run_id')
      .eq('message_id', last.id)
      .order('id');
    if (!error && data) this.actionsByMessageId[last.id] = data;
  }

  renderMessages() {
    const list = document.getElementById('brainMessageList');
    const wrap = document.getElementById('brainMessagesWrap');
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
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  renderContextChips() {
    const wrap = document.getElementById('brainContextChips');
    if (!wrap) return;
    if (!this.contextItems || this.contextItems.length === 0) {
      wrap.innerHTML = `<span class="brain-context-empty">Sin contexto seleccionado</span>`;
      return;
    }
    wrap.innerHTML = this.contextItems
      .map((c) => `<span class="brain-context-chip"><span class="brain-context-chip-type">${escapeHtml(c.label)}:</span> ${escapeHtml(c.name)}</span>`)
      .join('');
  }

  renderActionLayerForLastAssistant() {
    const wrap = document.getElementById('brainActionCards');
    if (!wrap) return;
    const last = [...this.aiState.messages].reverse().find((m) => m.role === 'assistant' && m.id);
    if (!last?.id) {
      wrap.innerHTML = '';
      return;
    }
    const actions = this.actionsByMessageId[last.id] || [];
    if (!actions.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = actions
      .map((a) => `<button type="button" class="brain-action-card" data-action-type="${escapeHtml(a.action_type)}" data-message-id="${escapeHtml(last.id)}">${escapeHtml(actionLabel(a.action_type))}</button>`)
      .join('');
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

  bindQuickActions() {
    const root = this.container;
    if (!root) return;
    root.querySelectorAll('[data-quick]').forEach((btn) => {
      this.addEventListener(btn, 'click', () => {
        const key = btn.getAttribute('data-quick');
        const prompts = {
          campaign: 'Crea una campaña para esta organización. Pregúntame lo mínimo necesario y luego propón 3 opciones.',
          content: 'Genera un plan de contenido para esta semana (ideas + formatos + hooks).',
          competitor: 'Analiza la competencia: ¿qué están haciendo y qué oportunidades ves?',
          insights: 'Dame un resumen de insights accionables para hoy.'
        };
        const msg = prompts[key] || '¿Qué puedes hacer hoy?';
        this.sendMessage(msg);
      });
    });
  }

  bindContextPanel() {
    const toggle = document.getElementById('brainContextToggle');
    const panel = document.getElementById('brainContextPanel');
    const close = document.getElementById('brainContextClose');
    if (!panel) return;

    const open = () => {
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.add('brain-context-panel-open');
    };
    const hide = () => {
      panel.setAttribute('aria-hidden', 'true');
      panel.classList.remove('brain-context-panel-open');
    };
    if (toggle) this.addEventListener(toggle, 'click', open);
    if (close) this.addEventListener(close, 'click', hide);

    // Poblar selects (best-effort)
    this.populateContextSelector().catch(() => {});

    const onSelect = async (entityType, elId) => {
      const el = document.getElementById(elId);
      if (!el) return;
      this.addEventListener(el, 'change', async () => {
        const entityId = el.value;
        if (!entityId) return;
        await this.addContext(entityType, entityId);
        await this.loadContext();
        this.renderContextChips();
      });
    };
    onSelect('product', 'brainSelectProduct');
    onSelect('campaign', 'brainSelectCampaign');
    onSelect('audience', 'brainSelectAudience');
  }

  async populateContextSelector() {
    if (!this.supabase) return;
    const productSel = document.getElementById('brainSelectProduct');
    const campaignSel = document.getElementById('brainSelectCampaign');
    const audienceSel = document.getElementById('brainSelectAudience');
    if (!productSel || !campaignSel || !audienceSel) return;

    const containerIds = Array.isArray(this.brandContainerIds) ? this.brandContainerIds : [];
    // Productos / campañas: directos por brand_container_id (si hay containers)
    if (containerIds.length > 0) {
      const [{ data: products }, { data: campaigns }] = await Promise.all([
        this.supabase.from('products').select('id, nombre_producto, brand_container_id').in('brand_container_id', containerIds).order('created_at', { ascending: false }).limit(200),
        this.supabase.from('campaigns').select('id, nombre_campana, brand_container_id').in('brand_container_id', containerIds).order('created_at', { ascending: false }).limit(200)
      ]);
      (products || []).forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre_producto || p.id;
        productSel.appendChild(opt);
      });
      (campaigns || []).forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nombre_campana || c.id;
        campaignSel.appendChild(opt);
      });

      // Audiencias: brands.project_id -> brand_container_id; audiences.brand_id -> brands.id
      const { data: brands } = await this.supabase.from('brands').select('id, project_id').in('project_id', containerIds).limit(200);
      const brandIds = (brands || []).map((b) => b.id).filter(Boolean);
      if (brandIds.length > 0) {
        const { data: audiences } = await this.supabase.from('audiences').select('id, name, brand_id').in('brand_id', brandIds).order('created_at', { ascending: false }).limit(200);
        (audiences || []).forEach((a) => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = a.name || a.id;
          audienceSel.appendChild(opt);
        });
      }
    }
  }

  async addContext(entityType, entityId) {
    if (!this.aiState.organization_id || !this.aiState.active_conversation_id) return;
    try {
      const token = (await this.supabase?.auth?.getSession?.())?.data?.session?.access_token;
      await fetch(`${window.location.origin}/api/ai/context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          organization_id: this.aiState.organization_id,
          conversation_id: this.aiState.active_conversation_id,
          entity_type: entityType,
          entity_id: entityId,
          importance_weight: 1.0
        })
      });
    } catch (e) {
      console.warn('BrainView addContext (backend):', e);
    }
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

      const wrap = document.getElementById('brainMessagesWrap');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
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
