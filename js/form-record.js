/**
 * Form Record - Formulario de registro: nombre de la organización y URL web oficial.
 * Solo dos campos. Supabase se obtiene por appLoader/supabaseService (misma fuente que el resto de la app).
 */

class FormRecord {
    constructor(options = {}) {
        this.formData = {};
        this.supabase = options.supabase || null;
        this.userId = null;
        this.currentStep = 1;
        this.totalSteps = 2;
    }

    async init() {
        await this.ensureSupabase();
        this.setupEventListeners();
        this.showStep(1);
    }

    /** Obtener Supabase igual que el resto de la app (appLoader, supabaseService, window.supabase). */
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
        const btnNext = document.getElementById('btnNext');
        if (btnNext) btnNext.addEventListener('click', () => this.nextStep());
        const btnBack = document.getElementById('btnBack');
        if (btnBack) btnBack.addEventListener('click', () => this.prevStep());
    }

    showStep(step) {
        this.currentStep = step;
        document.querySelectorAll('#form_org .form-step').forEach(el => {
            el.classList.toggle('active', parseInt(el.getAttribute('data-step'), 10) === step);
        });
    }

    nextStep() {
        const nombre = document.getElementById('nombre_organizacion');
        if (!nombre || !(nombre.value || '').trim()) {
            alert('Por favor escribe el nombre de la organización.');
            return;
        }
        this.showStep(2);
    }

    prevStep() {
        this.showStep(1);
    }

    collectFormData() {
        const nombre = document.getElementById('nombre_organizacion');
        const url = document.getElementById('url_web');
        this.formData.nombre_organizacion = (nombre?.value || '').trim();
        this.formData.url_web = (url?.value || '').trim();
    }

    async handleSubmit() {
        this.collectFormData();
        if (!this.formData.nombre_organizacion) {
            alert('Por favor escribe el nombre de la organización.');
            return;
        }
        if (!this.formData.url_web) {
            alert('Por favor escribe la URL de la web oficial.');
            return;
        }

        const btn = document.getElementById('btnSubmit');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }

        try {
            if (!this.supabase || !this.userId) await this.ensureSupabase();
            if (!this.supabase || !this.userId) {
                throw new Error('No se pudo inicializar Supabase o no hay usuario autenticado');
            }
            await this.saveToSupabase();
            if (window.router?.navigate) {
                window.router.navigate('/living');
            } else {
                window.location.href = 'living.html';
            }
        } catch (err) {
            console.error('Error guardando:', err);
            alert(err.message || 'Error al guardar. Intenta de nuevo.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Guardar';
            }
        }
    }

    async saveToSupabase() {
        if (!this.supabase || !this.userId) {
            throw new Error('Supabase no está inicializado o no hay usuario autenticado');
        }

        const nombreOrg = this.formData.nombre_organizacion || '';
        const urlWeb = this.formData.url_web || '';

        const { data: profileCheck } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('id', this.userId)
            .maybeSingle();

        if (!profileCheck) {
            const { data: { user: authUser } } = await this.supabase.auth.getUser();
            if (authUser) await this.ensureUserExists(authUser);
            else throw new Error('Usuario no encontrado. Inicia sesión nuevamente.');
        }

        const { data: members } = await this.supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', this.userId)
            .limit(1);

        let organizationId, brandContainerId;

        if (members?.length > 0) {
            organizationId = members[0].organization_id;
            await this.supabase.from('organizations').update({ name: nombreOrg }).eq('id', organizationId);

            const { data: containers } = await this.supabase
                .from('brand_containers')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('user_id', this.userId)
                .limit(1);

            if (containers?.length > 0) {
                brandContainerId = containers[0].id;
            } else {
                const { data: newContainer, error: containerError } = await this.supabase
                    .from('brand_containers')
                    .insert({
                        organization_id: organizationId,
                        user_id: this.userId,
                        nombre_marca: nombreOrg
                    })
                    .select('id')
                    .single();
                if (containerError) throw new Error(`Error al crear marca: ${containerError.message}`);
                brandContainerId = newContainer.id;
            }
        } else {
            const { data: newOrg, error: orgError } = await this.supabase
                .from('organizations')
                .insert({ name: nombreOrg, owner_user_id: this.userId })
                .select('id')
                .single();
            if (orgError) throw new Error(`Error al crear organización: ${orgError.message}`);
            organizationId = newOrg.id;

            await this.supabase.from('organization_credits').insert({
                organization_id: organizationId,
                credits_available: 0,
                credits_total: 0
            });
            await this.supabase.from('organization_members').insert({
                organization_id: organizationId,
                user_id: this.userId,
                role: 'owner'
            });

            const { data: newContainer, error: containerError } = await this.supabase
                .from('brand_containers')
                .insert({
                    organization_id: organizationId,
                    user_id: this.userId,
                    nombre_marca: nombreOrg
                })
                .select('id')
                .single();
            if (containerError) throw new Error(`Error al crear marca: ${containerError.message}`);
            brandContainerId = newContainer.id;
        }

        if (brandContainerId && urlWeb) {
            await this.supabase
                .from('brand_social_links')
                .delete()
                .eq('brand_container_id', brandContainerId)
                .eq('platform', 'website');
            await this.supabase.from('brand_social_links').insert({
                brand_container_id: brandContainerId,
                platform: 'website',
                url: urlWeb,
                is_primary: false
            });
        }

        const { error: updateError } = await this.supabase
            .from('profiles')
            .update({ form_verified: true })
            .eq('id', this.userId);
        if (updateError) throw new Error(`Error al marcar formulario como completado: ${updateError.message}`);
    }
}

window.FormRecord = FormRecord;

let formRecordInstance;
document.addEventListener('DOMContentLoaded', () => {
    formRecordInstance = new FormRecord();
    window.formRecordInstance = formRecordInstance;
});
