/**
 * Form Record - Formulario form_org: Plan → Tarjeta (desactivado) → Nombre organización → URL web.
 */

class FormRecord {
    constructor(options = {}) {
        this.formData = {};
        this.supabase = options.supabase || null;
        this.userId = null;
        this.currentStep = 1;
        this.totalSteps = 4;
    }

    async init() {
        await this.ensureSupabase();
        this.setupEventListeners();
        this.showStep(1);
    }

    async ensureSupabase() {
        if (this.supabase && typeof this.supabase.from === 'function') {
            await this.setUserId();
            return;
        }
        if (window.supabaseService && typeof window.supabaseService.getClient === 'function') {
            this.supabase = await window.supabaseService.getClient();
        }
        if (!this.supabase && window.appLoader && typeof window.appLoader.waitFor === 'function') {
            this.supabase = await window.appLoader.waitFor();
        }
        if (!this.supabase && window.supabase && typeof window.supabase.from === 'function') {
            this.supabase = window.supabase;
        }
        if (!this.supabase) {
            throw new Error('No se pudo inicializar Supabase. Por favor, recarga la página.');
        }
        await this.setUserId();
    }

    async setUserId() {
        const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
        if (sessionError && sessionError.message && sessionError.message.includes('session')) {
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            if (userError || !user) {
                if (userError?.message?.includes('session')) {
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error(userError ? userError.message : 'No hay usuario autenticado.');
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
            if (userError?.message?.includes('session')) {
                window.location.href = 'login.html';
                return;
            }
            throw new Error(userError ? userError.message : 'No hay usuario autenticado.');
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
            if (!plan || !(plan.value || '').trim()) {
                alert('Por favor selecciona un plan.');
                return;
            }
        }
        if (this.currentStep === 3) {
            const nombre = document.getElementById('nombre_organizacion');
            if (!nombre || !(nombre.value || '').trim()) {
                alert('Por favor escribe el nombre de la organización.');
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
        const plan = document.getElementById('plan_organizacion');
        const nombre = document.getElementById('nombre_organizacion');
        const url = document.getElementById('url_web');
        this.formData.plan_organizacion = (plan?.value || '').trim();
        this.formData.nombre_organizacion = (nombre?.value || '').trim();
        this.formData.url_web = (url?.value || '').trim();
    }

    handleSubmit() {
        this.collectFormData();
        if (!this.formData.plan_organizacion) {
            alert('Por favor selecciona un plan.');
            return;
        }
        if (!this.formData.nombre_organizacion) {
            alert('Por favor escribe el nombre de la organización.');
            return;
        }
        if (!this.formData.url_web) {
            alert('Por favor escribe la URL de la web oficial.');
            return;
        }
        // Al finalizar no se ejecuta ninguna acción (sin guardado ni redirección)
    }
}

window.FormRecord = FormRecord;

let formRecordInstance;
document.addEventListener('DOMContentLoaded', () => {
    formRecordInstance = new FormRecord();
    window.formRecordInstance = formRecordInstance;
});
