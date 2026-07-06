/**
 * DevLeadOrgsView - Organizaciones (solo Lead)
 *
 * CRUD lite de organizaciones:
 *  - Listar: name, plan activo, creditos, owner, fecha creacion
 *  - Crear: modal con name + owner_user_id (default = lead actual)
 *  - Editar: modal con name, brand_name_oficial, brand_slogan, logo_url
 *  - Borrar: soft delete via UPDATE deleted_at = now()
 *
 * Filtra deleted_at IS NULL en la lista. El delete actual es soft.
 */
class DevLeadOrgsView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.orgs = [];
    this._editingId = null;
    this._modalClose = null;
    this._loading = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-orgs">
        <header class="dev-lead-header">
          <div class="dev-lead-toolbar" id="headerToolbar">
            <input type="search" id="orgsSearch" class="form-control" placeholder="Buscar por nombre..." autocomplete="off">
            <button type="button" class="btn btn-primary" id="orgsCreate"><i class="aisc-ico aisc-ico--add"></i> Nueva organizacion</button>
          </div>
        </header>

        <section class="dev-lead-content">
          <div class="dev-org-grid" id="orgsGrid">
            <div class="dev-org-grid-state"><i class="aisc-ico fa-spin aisc-ico--loader"></i> Cargando...</div>
          </div>
        </section>
      </div>
    `;
  }

  // Cuerpo del modal de org (FEAT-028: migrado a window.Modal). Mantiene los
  // mismos IDs de campos para no tocar setFormValues/saveOrg.
  _modalBodyHtml(showOwner) {
    return `
      <div class="form-group">
        <label for="orgFieldName">Nombre <span class="form-required">*</span></label>
        <input type="text" id="orgFieldName" class="form-control" maxlength="120" required>
      </div>
      <div class="form-group">
        <label for="orgFieldBrandName">Brand name oficial</label>
        <input type="text" id="orgFieldBrandName" class="form-control" maxlength="120">
      </div>
      <div class="form-group">
        <label for="orgFieldSlogan">Slogan</label>
        <input type="text" id="orgFieldSlogan" class="form-control" maxlength="200">
      </div>
      <div class="form-group">
        <label for="orgFieldLogoUrl">Logo URL</label>
        <input type="url" id="orgFieldLogoUrl" class="form-control" placeholder="https://...">
      </div>
      <div class="form-group" id="orgFieldOwnerGroup"${showOwner ? '' : ' style="display:none"'}>
        <label for="orgFieldOwner">Owner user_id</label>
        <input type="text" id="orgFieldOwner" class="form-control" placeholder="UUID del usuario propietario">
        <p class="form-hint">Si lo dejas vacio, se asigna a tu user_id actual.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="orgsModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="orgsModalSave"><i class="aisc-ico aisc-ico--check"></i> Guardar</button>
      </div>
    `;
  }

  _openModal(title, showOwner) {
    const { modal, close } = window.Modal.show({
      title,
      body: this._modalBodyHtml(showOwner),
      className: 'dev-lead-modal-content',
      onClose: () => { this._modalClose = null; this._editingId = null; }
    });
    this._modalClose = close;
    modal.querySelector('#orgsModalCancel')?.addEventListener('click', () => this.closeModal());
    modal.querySelector('#orgsModalSave')?.addEventListener('click', () => this.saveOrg());
  }

  async init() {
    document.getElementById('orgsCreate')?.addEventListener('click', () => this.openCreateModal());

    document.getElementById('orgsSearch')?.addEventListener('input', (e) => {
      this.renderRows((e.target?.value || '').trim().toLowerCase());
    });

    document.getElementById('orgsGrid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'enter') this.enterOrg(id);
      else if (action === 'health') this.openHealthModal(id);
      else if (action === 'delete') this.openDeleteModal(id);
    });

    try {
      this.supabase = await this.getSupabaseClient();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) { this.userId = user.id; this.userEmail = user.email || null; }
      }
      await this.loadOrgs();
    } catch (err) {
      console.error('Orgs init:', err);
      this.renderError(err?.message || 'Error al cargar');
    }
  }

  async loadOrgs() {
    if (this._loading) return;
    this._loading = true;
    const grid = document.getElementById('orgsGrid');
    if (grid) grid.innerHTML = '<div class="dev-org-grid-state"><i class="aisc-ico fa-spin aisc-ico--loader"></i> Cargando...</div>';

    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      if (!this.supabase) throw new Error('Sin conexion');

      const { data: orgs, error } = await this.supabase
        .from('organizations')
        .select(`
          id, name, brand_name_oficial, brand_slogan, logo_url,
          level_of_autonomy, owner_user_id, created_at, deleted_at,
          organization_credits (credits_available, credits_total),
          subscriptions (status, current_period_end, plans (name))
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      this.orgs = Array.isArray(orgs) ? orgs : [];

      // Estado del agente Vera por org. openclaw_instances es service-only (RLS),
      // así que vamos por el RPC list_org_vera_status (SECURITY DEFINER, solo Lead).
      try {
        const ids = this.orgs.map(o => o.id);
        if (ids.length) {
          const { data: insts, error: vErr } = await this.supabase
            .rpc('list_org_vera_status', { p_org_ids: ids });
          if (vErr) throw vErr;
          const byOrg = {};
          (insts || []).forEach(i => { byOrg[i.organization_id] = i; });
          this.orgs.forEach(o => { o._agent = byOrg[o.id] || null; });
        }
      } catch (e) { console.warn('[orgs] vera status:', e?.message || e); /* degrada a "Sin Vera" */ }

      this.renderRows('');
    } catch (err) {
      console.error('loadOrgs:', err);
      this.renderError(err?.message || 'Error al cargar');
    } finally {
      this._loading = false;
    }
  }

  renderRows(filter) {
    const grid = document.getElementById('orgsGrid');
    if (!grid) return;
    const filtered = filter
      ? this.orgs.filter(o => (o.name || '').toLowerCase().includes(filter)
        || (o.brand_name_oficial || '').toLowerCase().includes(filter))
      : this.orgs;

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="dev-org-grid-state">${filter ? 'Sin coincidencias.' : 'Aun no hay organizaciones.'}</div>`;
      return;
    }

    grid.innerHTML = filtered.map(o => this.renderRow(o)).join('');
  }

  renderRow(org) {
    const id = this.escapeHtml(org.id);
    const sub = this.activeSubscription(org.subscriptions);
    const planLabel = sub ? this.escapeHtml((sub.plans && sub.plans.name) || 'Sin plan') : 'Sin plan';
    const credits = org.organization_credits;
    const cAvail = credits ? Math.round(credits.credits_available ?? 0) : 0;
    const cTotal = credits ? Math.round(credits.credits_total ?? 0) : 0;
    const cPct = cTotal > 0 ? Math.min(100, Math.max(0, Math.round((cAvail / cTotal) * 100))) : 0;
    const creditsLabel = credits ? `${cAvail.toLocaleString('es')} / ${cTotal.toLocaleString('es')}` : 'Sin creditos';
    const created = org.created_at
      ? new Date(org.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const name = this.escapeHtml(org.name || '—');

    // Estado de Vera (org-server OpenClaw) — solo indicador (pill), sin botón.
    const agent = org._agent;
    const agentActive = agent && ['healthy', 'provisioning', 'starting'].includes(agent.status);
    const veraPill = agentActive
      ? `<span class="dev-org-card-pill dev-org-card-pill--vera-on" title="Vera ${this.escapeHtml(agent.status)}"><i class="aisc-ico aisc-ico--bot"></i> Vera ${this.escapeHtml(agent.status)}</span>`
      : `<span class="dev-org-card-pill dev-org-card-pill--vera-off" title="Sin agente Vera"><i class="aisc-ico aisc-ico--bot"></i> Sin Vera</span>`;

    const media = org.logo_url
      ? `<img src="${this.escapeHtml(org.logo_url)}" alt="${name}" class="dev-org-card-img" loading="lazy" onerror="this.outerHTML='&lt;div class=&quot;dev-org-card-placeholder&quot;&gt;&lt;i class=&quot;fas fa-building&quot;&gt;&lt;/i&gt;&lt;/div&gt;'">`
      : `<div class="dev-org-card-placeholder"><i class="aisc-ico aisc-ico--organization"></i></div>`;

    return `
      <article class="dev-org-card" data-id="${id}">
        <div class="dev-org-card-media">
          ${media}
          <div class="dev-org-card-gradient" aria-hidden="true"></div>
          <div class="dev-org-card-actions">
            <button type="button" class="dev-org-card-icon-btn" data-action="enter" data-id="${id}" title="Entrar como consumidor" aria-label="Entrar"><i class="aisc-ico aisc-ico--logout"></i></button>
            <button type="button" class="dev-org-card-icon-btn" data-action="health" data-id="${id}" title="Salud / Insight" aria-label="Salud"><i class="aisc-ico aisc-ico--monitoring"></i></button>
            <button type="button" class="dev-org-card-icon-btn dev-org-card-icon-btn--danger" data-action="delete" data-id="${id}" title="Eliminar" aria-label="Eliminar"><i class="aisc-ico aisc-ico--delete"></i></button>
          </div>
          <div class="dev-org-card-info">
            <h3 class="dev-org-card-title">${name}</h3>
            ${org.brand_slogan ? `<span class="dev-org-card-subtitle">${this.escapeHtml(org.brand_slogan)}</span>` : ''}
            <div class="dev-org-card-meta">
              <span class="dev-org-card-pill dev-org-card-pill--plan">${planLabel}</span>
              <span class="dev-org-card-pill"><i class="aisc-ico aisc-ico--clock"></i> ${created}</span>
              ${veraPill}
            </div>
            <div class="dev-org-card-credits">
              <div class="dev-org-card-credits-head">
                <span class="dev-org-card-credits-label"><i class="aisc-ico aisc-ico--zap"></i> Creditos</span>
                <span class="dev-org-card-credits-value">${creditsLabel}</span>
              </div>
              <div class="dev-org-card-credits-track"><span style="width:${cPct}%"></span></div>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  // Provisión MANUAL de Vera (org-server OpenClaw). La auto-creación fue eliminada
  // por riesgosa: cada provisión levanta una VM Hetzner de pago + API key Anthropic
  // facturable por org. Por eso va con modal de confirmación explícito.
  /** Entrar a la org como consumidor: navega a su dashboard (/org/.../dashboard). */
  async enterOrg(id) {
    const org = this.orgs.find(o => o.id === id);
    if (!org) return;
    if (typeof window.getOrgPathPrefix !== 'function') {
      this.showNotification('No se pudo construir la ruta de la organización.', 'error');
      return;
    }
    const prefix = window.getOrgPathPrefix(org.id, org.name || '');
    if (!prefix) {
      this.showNotification('La organización no tiene nombre para construir la ruta.', 'warning');
      return;
    }
    const url = `${prefix}/dashboard`;
    if (window.router?.navigate) window.router.navigate(url);
    else window.location.href = url;
  }

  /** Mini-dashboard de salud/insight de la marca (data sana + errores del ecosistema). */
  async openHealthModal(id) {
    const org = this.orgs.find(o => o.id === id);
    if (!org) return;
    const { modal, close } = window.Modal.show({
      title: `Salud · ${org.name || ''}`,
      className: 'dev-lead-modal-content dev-lead-modal-wide org-health-modal',
      body: `
        <div class="org-health-body" id="orgHealthBody">
          <div class="dev-org-grid-state"><i class="aisc-ico fa-spin aisc-ico--loader"></i> Analizando…</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="orgHealthClose">Cerrar</button>
        </div>
      `,
    });
    modal.querySelector('#orgHealthClose')?.addEventListener('click', () => close());
    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      const { data, error } = await this.supabase.rpc('org_health_summary', { p_org_id: id });
      if (error) throw error;
      const body = modal.querySelector('#orgHealthBody');
      if (body) body.innerHTML = this._renderHealth(data || {});
    } catch (err) {
      console.error('org health:', err);
      const body = modal.querySelector('#orgHealthBody');
      if (body) body.innerHTML = `<div class="dev-org-grid-state"><i class="aisc-ico aisc-ico--alert-warning"></i> ${this.escapeHtml(err?.message || 'No se pudo cargar la salud')}</div>`;
    }
  }

  _renderHealth(h) {
    const num = (v) => Number(v || 0);
    const products = num(h.products), entities = num(h.entities), services = num(h.services), containers = num(h.containers);
    const runs7 = num(h.runs_7d), errors7 = num(h.runs_errors_7d), runsTotal = num(h.runs_total);
    const hasData = (products + entities + services) > 0;
    const lastAct = h.last_activity ? new Date(h.last_activity).toLocaleString('es') : '—';
    const veraOk = !!h.vera_status && ['healthy', 'starting', 'provisioning'].includes(h.vera_status);

    const issues = [];
    if (!hasData) issues.push('Sin datos de marca cargados');
    if (errors7 > 0) issues.push(`${errors7} error(es) en ejecuciones (7d)`);
    if (!veraOk) issues.push('Vera no activa');
    const healthy = issues.length === 0;

    const stat = (label, value, ok, icon) => `
      <div class="org-health-stat ${ok ? 'is-ok' : 'is-warn'}">
        <span class="org-health-stat-icon"><i class="fas ${icon}"></i></span>
        <span class="org-health-stat-value">${this.escapeHtml(String(value))}</span>
        <span class="org-health-stat-label">${this.escapeHtml(label)}</span>
      </div>`;

    return `
      <div class="org-health-verdict ${healthy ? 'is-ok' : 'is-warn'}">
        <i class="aisc-ico ${healthy ? 'aisc-ico--check' : 'aisc-ico--alert-warning'}"></i>
        <div>
          <strong>${healthy ? 'Marca sana' : 'Requiere atención'}</strong>
          <p>${healthy ? 'Datos presentes y sin errores recientes en el ecosistema.' : issues.map(i => this.escapeHtml(i)).join(' · ')}</p>
        </div>
      </div>
      <h4 class="org-health-section-title">Datos de la marca</h4>
      <div class="org-health-grid">
        ${stat('Productos', products, products > 0, 'fa-box')}
        ${stat('Entidades', entities, entities > 0, 'fa-shapes')}
        ${stat('Servicios', services, services > 0, 'fa-screwdriver-wrench')}
        ${stat('Sub-marcas', containers, true, 'fa-sitemap')}
      </div>
      <h4 class="org-health-section-title">Ecosistema</h4>
      <div class="org-health-grid">
        ${stat('Runs (7d)', runs7, true, 'fa-play')}
        ${stat('Errores (7d)', errors7, errors7 === 0, 'fa-bug')}
        ${stat('Runs totales', runsTotal, true, 'fa-database')}
        ${stat('Vera', veraOk ? h.vera_status : 'off', veraOk, 'fa-robot')}
      </div>
      <p class="org-health-foot"><i class="aisc-ico aisc-ico--clock"></i> Última actividad: ${this.escapeHtml(lastAct)}</p>
    `;
  }

  activeSubscription(subs) {
    if (!Array.isArray(subs) || subs.length === 0) return null;
    const active = subs.find(s => s && (s.status === 'active' || s.status === 'trialing'));
    return active || subs[0];
  }

  openCreateModal() {
    this._editingId = null;
    this._openModal('Nueva organizacion', true);
    this.setFormValues({});
  }

  setFormValues(v) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('orgFieldName', v.name);
    set('orgFieldBrandName', v.brand_name_oficial);
    set('orgFieldSlogan', v.brand_slogan);
    set('orgFieldLogoUrl', v.logo_url);
    set('orgFieldOwner', v.owner_user_id);
  }

  closeModal() {
    if (this._modalClose) this._modalClose();
    this._editingId = null;
  }

  async saveOrg() {
    const name = (document.getElementById('orgFieldName')?.value || '').trim();
    if (!name) { this.showNotification('El nombre es obligatorio.', 'warning'); return; }

    const payload = {
      name,
      brand_name_oficial: (document.getElementById('orgFieldBrandName')?.value || '').trim() || null,
      brand_slogan: (document.getElementById('orgFieldSlogan')?.value || '').trim() || null,
      logo_url: (document.getElementById('orgFieldLogoUrl')?.value || '').trim() || null
    };

    const saveBtn = document.getElementById('orgsModalSave');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="aisc-ico fa-spin aisc-ico--loader"></i> Guardando...'; }

    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      if (this._editingId) {
        const { error } = await this.supabase
          .from('organizations')
          .update(payload)
          .eq('id', this._editingId);
        if (error) throw error;
        this.showNotification('Organizacion actualizada.', 'success');
      } else {
        const ownerInput = (document.getElementById('orgFieldOwner')?.value || '').trim();
        payload.owner_user_id = ownerInput || this.userId || null;
        if (!payload.owner_user_id) { this.showNotification('Falta owner_user_id.', 'warning'); return; }
        const { error } = await this.supabase
          .from('organizations')
          .insert(payload);
        if (error) throw error;
        this.showNotification('Organizacion creada.', 'success');
      }
      this.closeModal();
      await this.loadOrgs();
    } catch (err) {
      console.error('saveOrg:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al guardar'), 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="aisc-ico aisc-ico--check"></i> Guardar'; }
    }
  }

  /**
   * Eliminación segura de una org: advertencia crítica + doble verificación de
   * identidad (contraseña + código de verificación enviado al correo del usuario).
   *
   * NOTA DE SEGURIDAD: esta es una barrera de UX en el cliente. El borrado real
   * sigue siendo un UPDATE directo a `organizations`. Para una garantía dura
   * (no evadible desde consola) la verificación debe moverse a un RPC/Edge
   * Function server-side que exija reautenticación. Pendiente documentado.
   */
  async openDeleteModal(id) {
    const org = this.orgs.find(o => o.id === id);
    if (!org) return;
    if (!this.supabase) this.supabase = await this.getSupabaseClient();
    if (!this.supabase) { this.showNotification('Sin conexión.', 'error'); return; }

    // Email del usuario actual (destino del código de verificación).
    let email = this.userEmail || '';
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      email = user?.email || email;
    } catch { /* noop */ }
    if (!email) { this.showNotification('No se pudo determinar tu correo para verificar.', 'error'); return; }

    this._delEmail = email;
    this._delCodeSent = false;

    const { modal, close } = window.Modal.show({
      title: 'Eliminar organización',
      body: this._deleteModalHtml(org, email),
      className: 'dev-lead-modal-content org-delete-modal',
      onClose: () => { this._delModalClose = null; this._delCodeSent = false; }
    });
    this._delModalClose = close;

    modal.querySelector('#orgDelCancel')?.addEventListener('click', () => this._delModalClose && this._delModalClose());
    modal.querySelector('#orgDelSendCode')?.addEventListener('click', () => this._sendDeleteCode(modal));
    modal.querySelector('#orgDelConfirm')?.addEventListener('click', () => this._confirmDelete(modal, org));
  }

  _deleteModalHtml(org, email) {
    const name = this.escapeHtml(org.name || '—');
    const safeEmail = this.escapeHtml(email);
    return `
      <div class="org-delete-warn" role="alert">
        <i class="aisc-ico aisc-ico--alert-warning"></i>
        <div>
          <strong>Acción crítica e irreversible</strong>
          <p>Vas a eliminar la organización <b>${name}</b> junto con sus marcas, contenido y datos asociados. Por la seguridad de nuestros usuarios, confirma tu identidad antes de continuar.</p>
        </div>
      </div>
      <div class="form-group">
        <label for="orgDelPassword">Tu contraseña <span class="form-required">*</span></label>
        <input type="password" id="orgDelPassword" class="form-control" autocomplete="current-password" placeholder="Confirma tu contraseña">
      </div>
      <div class="form-group">
        <label for="orgDelCode">Código de verificación por correo <span class="form-required">*</span></label>
        <div class="org-delete-code-row">
          <input type="text" id="orgDelCode" class="form-control" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Código de 6 dígitos" disabled>
          <button type="button" class="btn btn-secondary" id="orgDelSendCode">Enviar código</button>
        </div>
        <p class="form-hint">Enviaremos un código a <b>${safeEmail}</b> para confirmar que eres tú.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="orgDelCancel">Cancelar</button>
        <button type="button" class="btn btn-danger" id="orgDelConfirm"><i class="aisc-ico aisc-ico--delete"></i> Eliminar definitivamente</button>
      </div>
    `;
  }

  async _sendDeleteCode(modal) {
    const btn = modal.querySelector('#orgDelSendCode');
    const codeInput = modal.querySelector('#orgDelCode');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    try {
      const { error } = await this.supabase.auth.signInWithOtp({
        email: this._delEmail,
        options: { shouldCreateUser: false }
      });
      if (error) throw error;
      this._delCodeSent = true;
      if (codeInput) { codeInput.disabled = false; codeInput.focus(); }
      this.showNotification('Código enviado a tu correo.', 'success');
      // Cooldown de reenvío (45s).
      let s = 45;
      const tick = () => {
        if (!btn) return;
        if (s <= 0) { btn.disabled = false; btn.textContent = 'Reenviar código'; return; }
        btn.textContent = `Reenviar (${s}s)`; s -= 1; setTimeout(tick, 1000);
      };
      tick();
    } catch (err) {
      console.error('_sendDeleteCode:', err);
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar código'; }
      this.showNotification('No se pudo enviar el código: ' + (err?.message || 'error'), 'error');
    }
  }

  async _confirmDelete(modal, org) {
    const password = modal.querySelector('#orgDelPassword')?.value || '';
    const code = (modal.querySelector('#orgDelCode')?.value || '').trim();
    const btn = modal.querySelector('#orgDelConfirm');

    if (!password) { this.showNotification('Ingresa tu contraseña.', 'warning'); return; }
    if (!this._delCodeSent || !code) { this.showNotification('Solicita y escribe el código de verificación.', 'warning'); return; }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="aisc-ico fa-spin aisc-ico--loader"></i> Verificando…'; }
    try {
      // 1) Verificar contraseña (antes del código, para no consumir el OTP si falla).
      const { error: pwErr } = await this.supabase.auth.signInWithPassword({ email: this._delEmail, password });
      if (pwErr) throw new Error('Contraseña incorrecta.');

      // 2) Verificar el código de correo.
      const { error: otpErr } = await this.supabase.auth.verifyOtp({ email: this._delEmail, token: code, type: 'email' });
      if (otpErr) throw new Error('Código de verificación inválido o expirado.');

      // 3) Soft delete vía RPC server-side (Lead-only, auditado). El UPDATE
      //    directo de deleted_at está bloqueado por trigger; esta es la única vía.
      const { error: delErr } = await this.supabase.rpc('soft_delete_organization', { p_org_id: org.id });
      if (delErr) throw delErr;

      this.showNotification(`Organización "${org.name}" eliminada.`, 'success');
      if (this._delModalClose) this._delModalClose();
      await this.loadOrgs();
    } catch (err) {
      console.error('_confirmDelete:', err);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="aisc-ico aisc-ico--delete"></i> Eliminar definitivamente'; }
      this.showNotification('Error: ' + (err?.message || 'no se pudo eliminar'), 'error');
    }
  }

  renderError(message) {
    const grid = document.getElementById('orgsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="dev-org-grid-state"><i class="aisc-ico aisc-ico--alert-warning"></i> ${this.escapeHtml(message)}</div>`;
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.DevLeadOrgsView = DevLeadOrgsView;
