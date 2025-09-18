// ===== API DE SUPABASE - OPERACIONES DE BASE DE DATOS =====

class SupabaseAPI {
    constructor() {
        this.client = null;
        this.init();
    }

    init() {
        // Esperar a que Supabase esté disponible
        if (window.supabase) {
            this.client = window.supabase.createClient(
                'https://wxrptuuhmumgikpbfbcn.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cnB0dXVobXVtZ2lrcGJmYmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMzIzMTAsImV4cCI6MjA3MzcwODMxMH0.l_D-HRA4h5VUbY_I7f2l9sN0-wH6dQD_mA2UUMqhPpU'
            );
            console.log('✅ Supabase API inicializada');
        } else {
            console.error('❌ Supabase no está disponible');
        }
    }

    // ===== OPERACIONES DE USUARIOS =====
    
    async createUser(userData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            // Primero crear el usuario en Supabase Auth
            const { data: authData, error: authError } = await this.client.auth.signUp({
                email: userData.correo,
                password: userData.contrasena,
                options: {
                    data: {
                        nombre: userData.nombre,
                        apellido: userData.apellido
                    }
                }
            });
            
            if (authError) throw authError;
            
            // Luego crear el registro en la tabla users
            const userRecord = {
                user_id: authData.user.id,
                nombre: userData.nombre,
                apellido: userData.apellido,
                correo: userData.correo,
                contrasena: userData.contrasena, // En producción, esto debería ser hasheado
                acceso: userData.acceso,
                activo: userData.activo,
                email_verificado: userData.email_verificado,
                creado_en: userData.creado_en,
                actualizado_en: userData.actualizado_en
            };
            
            const { data, error } = await this.client
                .from('users')
                .insert([userRecord])
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: {
                    auth: authData,
                    user: data
                },
                message: 'Usuario creado exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'crear usuario');
        }
    }

    async getUserByEmail(email) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('users')
                .select('*')
                .eq('correo', email)
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data
            };
        } catch (error) {
            return this.handleError(error, 'obtener usuario');
        }
    }

    async updateUser(userId, updateData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('users')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Usuario actualizado exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'actualizar usuario');
        }
    }

    // ===== OPERACIONES DE MARCAS =====
    
    async createBrand(brandData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('brands')
                .insert([brandData])
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Marca creada exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'crear marca');
        }
    }

    async getBrandsByUser(userId) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('brands')
                .select('*')
                .eq('user_id', userId)
                .eq('activo', true);
                
            if (error) throw error;
            
            return {
                success: true,
                data: data
            };
        } catch (error) {
            return this.handleError(error, 'obtener marcas');
        }
    }

    async updateBrand(brandId, updateData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('brands')
                .update(updateData)
                .eq('id', brandId)
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Marca actualizada exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'actualizar marca');
        }
    }

    // ===== OPERACIONES DE PRODUCTOS =====
    
    async createProduct(productData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('products')
                .insert([productData])
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Producto creado exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'crear producto');
        }
    }

    async getProductsByUser(userId) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('products')
                .select('*')
                .eq('user_id', userId)
                .eq('activo', true);
                
            if (error) throw error;
            
            return {
                success: true,
                data: data
            };
        } catch (error) {
            return this.handleError(error, 'obtener productos');
        }
    }

    async updateProduct(productId, updateData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('products')
                .update(updateData)
                .eq('id', productId)
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Producto actualizado exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'actualizar producto');
        }
    }

    // ===== OPERACIONES DE PREFERENCIAS UGC =====
    
    async createUgcPreferences(preferencesData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('ugc_preferences')
                .insert([preferencesData])
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Preferencias UGC creadas exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'crear preferencias UGC');
        }
    }

    async getUgcPreferencesByUser(userId) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('ugc_preferences')
                .select('*')
                .eq('user_id', userId)
                .eq('activo', true);
                
            if (error) throw error;
            
            return {
                success: true,
                data: data
            };
        } catch (error) {
            return this.handleError(error, 'obtener preferencias UGC');
        }
    }

    async updateUgcPreferences(preferencesId, updateData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client
                .from('ugc_preferences')
                .update(updateData)
                .eq('id', preferencesId)
                .select()
                .single();
                
            if (error) throw error;
            
            return {
                success: true,
                data: data,
                message: 'Preferencias UGC actualizadas exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'actualizar preferencias UGC');
        }
    }

    // ===== OPERACIONES DE AUTENTICACIÓN =====
    
    async signUp(email, password, userData) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            // Crear usuario en Supabase Auth
            const { data: authData, error: authError } = await this.client.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        nombre: userData.nombre,
                        apellido: userData.apellido
                    }
                }
            });
            
            if (authError) throw authError;
            
            // Crear registro en tabla users
            const userRecord = {
                user_id: authData.user.id,
                nombre: userData.nombre,
                apellido: userData.apellido,
                correo: email,
                contrasena: password, // En producción, esto debería ser hasheado
                acceso: 'usuario',
                activo: true,
                email_verificado: false,
                creado_en: new Date().toISOString(),
                actualizado_en: new Date().toISOString()
            };
            
            const userResult = await this.createUser(userRecord);
            
            if (!userResult.success) {
                throw new Error('Error al crear registro de usuario');
            }
            
            return {
                success: true,
                data: {
                    auth: authData,
                    user: userResult.data
                },
                message: 'Usuario registrado exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'registrar usuario');
        }
    }

    async signIn(email, password) {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { data, error } = await this.client.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            // Obtener datos del usuario de la tabla users
            const userResult = await this.getUserByEmail(email);
            
            return {
                success: true,
                data: {
                    auth: data,
                    user: userResult.data
                },
                message: 'Inicio de sesión exitoso'
            };
        } catch (error) {
            return this.handleError(error, 'iniciar sesión');
        }
    }

    async signOut() {
        try {
            if (!this.client) throw new Error('Cliente de Supabase no disponible');
            
            const { error } = await this.client.auth.signOut();
            
            if (error) throw error;
            
            return {
                success: true,
                message: 'Sesión cerrada exitosamente'
            };
        } catch (error) {
            return this.handleError(error, 'cerrar sesión');
        }
    }

    // ===== FUNCIONES AUXILIARES =====
    
    handleError(error, operation) {
        console.error(`Error en ${operation}:`, error);
        
        let message = 'Error de conexión con la base de datos';
        
        if (error.message) {
            if (error.message.includes('duplicate key')) {
                message = 'Este registro ya existe en la base de datos';
            } else if (error.message.includes('foreign key')) {
                message = 'Error de referencia en la base de datos';
            } else if (error.message.includes('not null')) {
                message = 'Faltan campos obligatorios';
            } else if (error.message.includes('invalid credentials')) {
                message = 'Credenciales inválidas';
            } else if (error.message.includes('email not confirmed')) {
                message = 'Email no confirmado. Revisa tu correo.';
            } else {
                message = error.message;
            }
        }
        
        return {
            success: false,
            message: message,
            error: error
        };
    }

    showNotification(message, type = 'info') {
        // Crear notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Estilos
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Remover después de 4 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
}

// Crear instancia global
window.supabaseAPI = new SupabaseAPI();

// Exportar para uso en otros archivos
window.SupabaseAPI = SupabaseAPI;
