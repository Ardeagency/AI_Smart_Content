/**
 * Form Record - Onboarding de organización + integración directa con el servicio de super scraping.
 */

class FormRecord {
    constructor(options = {}) {
        this.supabase = options.supabase || null;
        this.userId = null;
        this.currentStep = 1;
        this.totalSteps = 4;
        this.formData = {};
        this.environment = 'test';
        this.listenersAttached = false;
        this.statusEl = null;
        this.submitBtn = null;
        this.lastScraperResponse = null;
        this.scraperEndpoint = null;
    }

    async init() {
        await this.ensureSupabase();
        this.cacheDom();
        this.setupEventListeners();
        this.showStep(1);
        this.setStatus('info', 'Completa los campos y enviaremos los datos al scraper inteligente.');
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
                alert('Selecciona un plan para continuar.');
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
                alert('Describe el nicho o mercado principal.');
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
        const websiteRaw = getVal('url_web');
        this.formData = {
            plan: getVal('plan_organizacion'),
            nombre: getVal('nombre_organizacion'),
            nicho: getVal('nicho_organizacion'),
            website: websiteRaw,
            websiteNormalized: this.normalizeUrl(websiteRaw),
            socials: {
                instagram: this.normalizeUrl(getVal('instagram_url')),
                tiktok: this.normalizeUrl(getVal('tiktok_url')),
                youtube: this.normalizeUrl(getVal('youtube_url')),
                facebook: this.normalizeUrl(getVal('facebook_url')),
                linkedin: this.normalizeUrl(getVal('linkedin_url')),
                twitter: this.normalizeUrl(getVal('twitter_url')),
                pinterest: this.normalizeUrl(getVal('pinterest_url')),
                others: getVal('otros_canales').split(',').map(s => this.normalizeUrl(s.trim())).filter(Boolean)
            }
        };
    }

    normalizeUrl(url) {
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url;
        return `https://${url}`;
    }

    ensureValidForm() {
        const { plan, nombre, websiteNormalized, socials } = this.formData;
        if (!plan) throw new Error('Selecciona un plan.');
        if (!nombre) throw new Error('Ingresa el nombre de la organización.');
        if (!websiteNormalized) throw new Error('Incluye la URL principal de la organización.');
        const hasSocial = Object.values(socials).some(value => {
            if (Array.isArray(value)) return value.length > 0;
            return Boolean(value);
        });
        if (!hasSocial) throw new Error('Agrega al menos una red social o canal digital.');
    }

    buildRequestPayload() {
        this.collectFormData();
        this.ensureValidForm();
        return {
            url: this.formData.websiteNormalized,
            userId: this.userId,
            organizationName: this.formData.nombre,
            plan: this.formData.plan,
            environment: this.environment,
            organizationInput: {
                niche: this.formData.nicho,
                socials: this.formData.socials,
                originalWebsite: this.formData.website,
                normalizedWebsite: this.formData.websiteNormalized
            }
        };
    }

    getScraperEndpoint() {
        if (this.scraperEndpoint) return this.scraperEndpoint;
        const fromWindow = window.SCRAPER_API_URL || window.SCRAPER_SERVER_URL || (window.ENV && window.ENV.SCRAPER_API_URL);
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('SCRAPER_API_URL') : '';
        this.scraperEndpoint = fromWindow || stored || '/api/scrape';
        return this.scraperEndpoint;
    }

    async handleSubmit() {
        if (!this.userId) {
            this.setStatus('error', 'No se encontró el usuario autenticado.');
            return;
        }
        let requestBody;
        try {
            requestBody = this.buildRequestPayload();
        } catch (err) {
            this.setStatus('error', err.message || 'Formulario incompleto.');
            return;
        }

        const endpoint = this.getScraperEndpoint();
        if (!endpoint) {
            this.setStatus('error', 'No hay endpoint configurado para el super scraper.');
            return;
        }

        try {
            this.setStatus('loading', 'Enviando datos al scraper inteligente...');
            if (this.submitBtn) this.submitBtn.disabled = true;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'El servidor devolvió un error.');
            }

            this.lastScraperResponse = data;
            this.handleScraperOutcome(data);
        } catch (error) {
            console.error('Error enviando al scraper:', error);
            this.setStatus('error', error.message || 'No se pudo contactar el scraper.');
        } finally {
            if (this.submitBtn) this.submitBtn.disabled = false;
        }
    }

    handleScraperOutcome(data) {
        const competitorCount = Array.isArray(data?.competitors) ? data.competitors.length : 0;
        if (data.status === 'needs_confirmation' && competitorCount > 0) {
            this.setStatus('success', `Scraping completado. Detectamos ${competitorCount} posibles competidores. Pronto podrás confirmarlos.`);
            return;
        }
        if (data.status === 'saved_without_competitors') {
            this.setStatus('success', 'Scraping completado. No detectamos competencia directa todavía.');
            return;
        }
        if (data.status === 'error') {
            const msg = data.errors?.join(', ') || 'El scraper reportó un error.';
            this.setStatus('error', msg);
            return;
        }
        this.setStatus('success', 'Scraping completado correctamente.');
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
