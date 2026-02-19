/**
 * AI Smart Content - Form Record
 * Formulario simplificado: nombre de la organización y URL web oficial
 */

class FormRecord {
    constructor() {
        this.formData = {};
        this.supabase = null;
        this.userId = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initSupabase();
    }

    async initSupabase() {
        if (typeof waitForSupabase === 'function') {
            this.supabase = await waitForSupabase(15000);
        } else if (window.supabaseClient) {
            this.supabase = window.supabaseClient;
        } else if (typeof initSupabase === 'function') {
            this.supabase = await initSupabase();
        }

        if (!this.supabase) {
            throw new Error('No se pudo inicializar Supabase. Por favor, recarga la página.');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();

        if (sessionError) {
            console.error('Error obteniendo sesión:', sessionError);
            if (sessionError.message && sessionError.message.includes('session')) {
                const { data: { user }, error: userError } = await this.supabase.auth.getUser();
                if (userError) {
                    console.error('Error obteniendo usuario:', userError);
                    throw new Error(`Error de autenticación: ${userError.message}`);
                }
                if (!user) {
                    throw new Error('No hay usuario autenticado. Por favor, inicia sesión nuevamente.');
                }
                this.userId = user.id;
                await this.ensureUserExists(user);
                return;
            }
            throw new Error(`Error de autenticación: ${sessionError.message}`);
        }

        if (!session || !session.user) {
            const { data: { user }, error: userError } = await this.supabase.auth.getUser();
            if (userError) {
                console.error('Error obteniendo usuario:', userError);
                if (userError.message && userError.message.includes('session')) {
                    console.warn('⚠️ No hay sesión activa. Redirigiendo al login...');
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error(`Error de autenticación: ${userError.message}`);
            }
            if (!user) {
                console.warn('⚠️ No hay usuario autenticado. Redirigiendo al login...');
                window.location.href = 'login.html';
                return;
            }
            this.userId = user.id;
            await this.ensureUserExists(user);
        } else {
            this.userId = session.user.id;
            await this.ensureUserExists(session.user);
        }
    }

    setupEventListeners() {
        const form = document.getElementById('recordForm');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    collectFormData() {
        const nombre = document.getElementById('nombre_organizacion');
        const url = document.getElementById('url_web');
        this.formData.nombre_organizacion = (nombre && nombre.value) ? nombre.value.trim() : '';
        this.formData.url_web = (url && url.value) ? url.value.trim() : '';
    }

    async handleSubmit() {
        this.collectFormData();

        if (!this.formData.nombre_organizacion) {
            alert('Por favor escribe el nombre de la organización.');
            return;
        }

        const btnSubmit = document.getElementById('btnSubmit');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Guardando...';
        }

        try {
            if (!this.supabase || !this.userId) {
                await this.initSupabase();
                if (!this.supabase || !this.userId) {
                    throw new Error('No se pudo inicializar Supabase o no hay usuario autenticado');
                }
            }

            await this.saveToSupabase();

            // Redirigir al Living
            if (window.router && typeof window.router.navigate === 'function') {
                window.router.navigate('/living');
            } else {
                window.location.href = 'living.html';
            }
        } catch (err) {
            console.error('Error guardando:', err);
            alert(err.message || 'Error al guardar. Intenta de nuevo.');
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Guardar';
            }
        }
    }

    async ensureUserExists(authUser) {
        const { data: existingProfile, error: checkError } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('id', authUser.id)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.warn('Error verificando perfil:', checkError);
        }

        if (!existingProfile) {
            const { error: createError } = await this.supabase
                .from('profiles')
                .insert({
                    id: authUser.id,
                    email: authUser.email || '',
                    full_name: authUser.user_metadata?.full_name || authUser.email,
                    plan_type: authUser.user_metadata?.plan_type || 'basico',
                    form_verified: false
                });
            if (createError) {
                console.error('Error creando perfil:', createError);
            }
        }
    }

    async saveToSupabase() {
        if (!this.supabase || !this.userId) {
            throw new Error('Supabase no está inicializado o no hay usuario autenticado');
        }

        const { data: profileCheck } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('id', this.userId)
            .maybeSingle();

        if (!profileCheck) {
            const { data: { user: authUser } } = await this.supabase.auth.getUser();
            if (authUser) {
                await this.ensureUserExists(authUser);
            } else {
                throw new Error('Usuario no encontrado. Inicia sesión nuevamente.');
            }
        }

        const nombreOrg = this.formData.nombre_organizacion || '';
        const urlWeb = this.formData.url_web || '';

        // ¿El usuario ya tiene alguna organización?
        const { data: members } = await this.supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', this.userId)
            .limit(1);

        let organizationId;
        let brandContainerId;

        if (members && members.length > 0) {
            organizationId = members[0].organization_id;

            // Actualizar nombre de la organización
            await this.supabase
                .from('organizations')
                .update({ name: nombreOrg })
                .eq('id', organizationId);

            // Obtener o crear brand_container para esta org
            const { data: containers } = await this.supabase
                .from('brand_containers')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('user_id', this.userId)
                .limit(1);

            if (containers && containers.length > 0) {
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
            // Crear organización nueva
            const { data: newOrg, error: orgError } = await this.supabase
                .from('organizations')
                .insert({
                    name: nombreOrg,
                    owner_user_id: this.userId
                })
                .select('id')
                .single();

            if (orgError) throw new Error(`Error al crear organización: ${orgError.message}`);
            organizationId = newOrg.id;

            await this.supabase
                .from('organization_credits')
                .insert({
                    organization_id: organizationId,
                    credits_available: 0,
                    credits_total: 0
                });

            await this.supabase
                .from('organization_members')
                .insert({
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

        // Guardar URL web en brand_social_links (solo si hay URL)
        if (brandContainerId && urlWeb) {
            await this.supabase
                .from('brand_social_links')
                .delete()
                .eq('brand_container_id', brandContainerId)
                .eq('platform', 'website');

            await this.supabase
                .from('brand_social_links')
                .insert({
                    brand_container_id: brandContainerId,
                    platform: 'website',
                    url: urlWeb,
                    is_primary: false
                });
        }

        // Marcar formulario como completado
        const { error: updateError } = await this.supabase
            .from('profiles')
            .update({ form_verified: true })
            .eq('id', this.userId);

        if (updateError) {
            throw new Error(`Error al marcar formulario como completado: ${updateError.message}`);
        }
    }
}

let formRecordInstance;
document.addEventListener('DOMContentLoaded', () => {
    formRecordInstance = new FormRecord();
    window.formRecordInstance = formRecordInstance;
});
