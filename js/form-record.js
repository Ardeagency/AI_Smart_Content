/**
 * Form Record - Onboarding de organización + disparo de webhook para el super scraping.
 */

class FormRecord {
    constructor(options = {}) {
        this.supabase = options.supabase || null;
        this.userId = null;
        this.currentStep = 1;
        this.totalSteps = 4;
        this.formData = {};
        this.flowConfig = null;
        this.statusEl = null;
        this.submitBtn = null;
        this.environment = 'test';
        this.listenersAttached = false;
    }

    async init() {
        await this.ensureSupabase();
        await this.loadFlowConfig();
        this.cacheDom();
        this.setupEventListeners();
        this.showStep(1);
        this.setStatus('info', 'Completa los campos para disparar automáticamente el scraping inteligente.');
    }

    cacheDom() {
        this.statusEl = document.getElementById('formStatus');
        this.submitBtn = document.getElementById('btnSubmit');
    }

    async ensureSupabase() {
        if (this.supabase && typeof this.supabase.from === 'function') {
            await this.setUserId();
            return;
        }
        if (window.supabaseService?.getClient) {
            this.supabase = await window.supabaseService.getClient();
        } else if (window.appLoader?.waitFor) {
            try {
                this.supabase = await window.appLoader.waitFor();
            } catch {
                this.supabase = null;
            }
        } else if (window.supabase && typeof window.supabase.from === 'function') {
            this.supabase = window.supabase;
        }
        if (!this.supabase) {
            throw new Error('No se pudo inicializar Supabase. Por favor, recarga la página.');
        }
        await this.setUserId();
    }

    async setUserId() {
        const { data: { session }, error } = await this.supabase.auth.getSession();
        if (error?.message?.includes('session')) {
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            if (userError || !user) {
                window.location.href = 'login.html';
                return;
            }
            this.userId = user.id;
            await this.ensureUserExists(user);
            return;
        }
        if (session?.user) {
            this.userId = session.user.id;
            await this.ensureUserExists(session.user);
            return;
        }
        const { data: { user }, error: userError } = await this.supabase.auth.getUser();
        if (userError || !user) {
            window.location.href = 'login.html';
            return;
        }
        this.userId = user.id;
        await this.ensureUserExists(user);
    }

    async ensureUserExists(authUser) {
        const { data: existing } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('id', authUser.id)
            .maybeSingle();
        if (!existing) {
            await this.supabase.from('profiles').insert({
                id: authUser.id,
                email: authUser.email || '',
                full_name: authUser.user_metadata?.full_name || authUser.email,
                plan_type: authUser.user_metadata?.plan_type || 'basico',
                form_verified: false
            });
        }
    }

    async loadFlowConfig() {
        try {
            const { data: flow } = await this.supabase
                .from('content_flows')
                .select('id, name, slug')
                .eq('slug', 'org-intel-onboarding')
                .maybeSingle();
            if (!flow) {
                this.setStatus('error', 'No se encontró el flujo de onboarding. Contacta al equipo.');
                this.disableSubmit();
                return;
            }
            const { data: module } = await this.supabase
                .from('flow_modules')
                .select('id, step_order, webhook_url_test, webhook_url_prod')
                .eq('content_flow_id', flow.id)
                .order('step_order')
                .limit(1)
                .maybeSingle();
            if (!module) {
                this.setStatus('error', 'El flujo no tiene módulos configurados.');
                this.disableSubmit();
                return;
            }
            const { data: tech } = await this.supabase
                .from('flow_technical_details')
                .select('webhook_method')
                .eq('flow_module_id', module.id)
                .maybeSingle();
            const webhookUrl = module.webhook_url_test || module.webhook_url_prod || null;
            if (!webhookUrl) {
                this.setStatus('error', 'No hay webhook configurado para este flujo.');
                this.disableSubmit();
                return;
            }
            this.flowConfig = {
                flowId: flow.id,
                moduleId: module.id,
                webhookUrl,
                webhookMethod: tech?.webhook_method || 'POST'
            };
        } catch (err) {
            console.error('Error cargando flujo de onboarding', err);
            this.setStatus('error', 'No se pudo preparar el flujo de scraping.');
            this.disableSubmit();
        }
    }

    disableSubmit() {
        if (this.submitBtn) {
            this.submitBtn.disabled = true;
        }
    }

    setupEventListeners() {
        if (this.listenersAttached) return;
        const form = document.getElementById('form_org');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
        form.addEventListener('click', (e) => {
            if (e.target.closest('.btn-next')) {
                e.preventDefault();
                this.nextStep();
            } else if (e.target.closest('.btn-back')) {
                e.preventDefault();
                this.prevStep();
            }
        });
        this.listenersAttached = true;
    }

    showStep(step) {
        this.currentStep = step;
        document.querySelectorAll('#form_org .form-step').forEach(el => {
            el.classList.toggle('active', parseInt(el.getAttribute('data-step'), 10) === step);
        });
    }

    nextStep() {
        if (this.currentStep === 1) {
            const plan = document.getElementById('plan_organizacion');
            if (!plan?.value) {
                alert('Por favor selecciona un plan.');
                return;
            }
        } else if (this.currentStep === 2) {
            const nombre = document.getElementById('nombre_organizacion');
            if (!nombre?.value.trim()) {
                alert('Ingresa el nombre de la organización.');
                return;
            }
        } else if (this.currentStep === 3) {
            const nicho = document.getElementById('nicho_organizacion');
            if (!nicho?.value.trim()) {
                alert('Describe el nicho o industria principal.');
                return;
            }
        }
        if (this.currentStep < this.totalSteps) {
            this.showStep(this.currentStep + 1);
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.showStep(this.currentStep - 1);
        }
    }

    collectFormData() {
        const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
        this.formData = {
            plan: getVal('plan_organizacion'),
            nombre: getVal('nombre_organizacion'),
            nicho: getVal('nicho_organizacion'),
            website: getVal('url_web'),
            socials: {
                instagram: getVal('instagram_url'),
                tiktok: getVal('tiktok_url'),
                youtube: getVal('youtube_url'),
                facebook: getVal('facebook_url'),
                linkedin: getVal('linkedin_url'),
                twitter: getVal('twitter_url'),
                pinterest: getVal('pinterest_url'),
                others: getVal('otros_canales')
            }
        };
    }

    normalizeUrl(url) {
        if (!url) return '';
        if (!/^https?:\/\//i.test(url)) {
            return `https://${url}`;
        }
        return url;
    }

    buildPayload() {
        this.collectFormData();
        const { plan, nombre, nicho, website, socials } = this.formData;
        if (!plan || !nombre || !nicho || !website) {
            throw new Error('Faltan campos obligatorios.');
        }
        const socialLinks = {
            instagram: this.normalizeUrl(socials.instagram),
            tiktok: this.normalizeUrl(socials.tiktok),
            youtube: this.normalizeUrl(socials.youtube),
            facebook: this.normalizeUrl(socials.facebook),
            linkedin: this.normalizeUrl(socials.linkedin),
            twitter: this.normalizeUrl(socials.twitter),
            pinterest: this.normalizeUrl(socials.pinterest)
        };
        const otherLinks = (socials.others || '')
            .split(',')
            .map(s => this.normalizeUrl(s.trim()))
            .filter(Boolean);
        const atLeastOneSocial = Object.values(socialLinks).some(Boolean) || otherLinks.length > 0;
        if (!atLeastOneSocial) {
            throw new Error('Agrega al menos una red social o canal digital.');
        }
        return {
            plan_type: plan,
            organization: {
                name: nombre,
                niche: nicho,
                website: this.normalizeUrl(website),
                social_links: { ...socialLinks, others: otherLinks }
            },
            submitted_by: this.userId,
            context: {
                source: 'form_org',
                environment: this.environment,
                form_version: '2026.03.10'
            }
        };
    }

    async handleSubmit() {
        if (!this.flowConfig?.webhookUrl) {
            this.setStatus('error', 'Webhook no disponible.');
            return;
        }
        if (!window.FlowWebhookService) {
            this.setStatus('error', 'Servicio de webhooks no inicializado.');
            return;
        }
        let payload;
        try {
            payload = this.buildPayload();
        } catch (err) {
            this.setStatus('error', err.message || 'Formulario incompleto.');
            return;
        }
        try {
            this.setStatus('loading', 'Enviando datos al scraper inteligente...');
            if (this.submitBtn) this.submitBtn.disabled = true;
            const result = await window.FlowWebhookService.executeWebhook({
                url: this.flowConfig.webhookUrl,
                method: this.flowConfig.webhookMethod || 'POST',
                body: payload,
                timeoutMs: 180000
            });
            if (result.ok) {
                this.setStatus('success', '¡Listo! Estamos creando la organización y detectando competencia. Recibirás una notificación cuando finalice.');
                document.getElementById('form_org')?.reset();
                this.showStep(1);
            } else {
                const errMsg = result.error || 'El webhook respondió con un error.';
                this.setStatus('error', errMsg);
            }
        } catch (err) {
            console.error('Error enviando webhook', err);
            this.setStatus('error', err.message || 'No se pudo contactar el scraper.');
        } finally {
            if (this.submitBtn) this.submitBtn.disabled = false;
        }
    }

    setStatus(type, message) {
        if (!this.statusEl) return;
        this.statusEl.className = `form-status ${type ? type : ''} ${message ? 'show' : ''}`.trim();
        this.statusEl.textContent = message || '';
    }
}

window.FormRecord = FormRecord;

let formRecordInstance;
document.addEventListener('DOMContentLoaded', async () => {
    formRecordInstance = new FormRecord();
    window.formRecordInstance = formRecordInstance;
    try {
        await formRecordInstance.init();
    } catch (err) {
        console.error('No se pudo iniciar el formulario', err);
        formRecordInstance?.setStatus?.('error', 'No se pudo inicializar el formulario.');
    }
});
