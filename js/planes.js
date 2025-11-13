/**
 * AI Smart Content - Suscribirse Page
 * Manejo de selección de planes con checkboxes y registro
 */

class PlanesManager {
    constructor() {
        this.selectedPlan = null;
        this.supabase = null;
        this.init();
    }

    async init() {
        await this.initSupabase();
        this.setupPlanSelection();
        this.setupForm();
        this.setupPasswordToggle();
    }

    async initSupabase() {
        try {
            if (typeof waitForSupabase === 'function') {
                this.supabase = await waitForSupabase();
            } else if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
            } else if (typeof initSupabase === 'function') {
                this.supabase = await initSupabase();
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
        }
    }

    setupPlanSelection() {
        const planCards = document.querySelectorAll('.plan-card-small');
        
        planCards.forEach(card => {
            card.addEventListener('click', () => {
                this.selectPlan(card);
            });
        });
    }

    selectPlan(cardElement) {
        // Deseleccionar todas las cards
        document.querySelectorAll('.plan-card-small').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Seleccionar la card actual
        cardElement.classList.add('selected');
        
        // Guardar plan seleccionado
        this.selectedPlan = {
            name: cardElement.dataset.plan,
            credits: parseInt(cardElement.dataset.credits),
            price: parseFloat(cardElement.dataset.price)
        };
        
        console.log('Plan seleccionado:', this.selectedPlan);
    }

    setupPasswordToggle() {
        const passwordToggle = document.getElementById('passwordToggle');
        const passwordInput = document.getElementById('regPassword');
        
        if (passwordToggle && passwordInput) {
            passwordToggle.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                
                // Cambiar icono
                passwordToggle.classList.toggle('fa-eye');
                passwordToggle.classList.toggle('fa-eye-slash');
            });
        }
    }

    setupForm() {
        const form = document.getElementById('registrationForm');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Validación de contraseñas en tiempo real
        const password = document.getElementById('regPassword');
        if (password) {
            password.addEventListener('input', () => {
                this.validatePassword(password);
            });
        }
    }

    validatePassword(passwordInput) {
        const password = passwordInput.value;
        if (password.length > 0 && password.length < 8) {
            passwordInput.setCustomValidity('La contraseña debe tener al menos 8 caracteres');
        } else {
            passwordInput.setCustomValidity('');
        }
    }

    async handleSubmit() {
        const form = document.getElementById('registrationForm');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Validar que se haya seleccionado un plan
        if (!this.selectedPlan) {
            alert('Por favor, selecciona un plan de suscripción');
            return;
        }

        const firstName = document.getElementById('regFirstName').value.trim();
        const lastName = document.getElementById('regLastName').value.trim();
        const email = document.getElementById('regEmail').value.trim().toLowerCase();
        const password = document.getElementById('regPassword').value;

        // Validaciones
        if (password.length < 8) {
            alert('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        // Inicializar Supabase
        if (!this.supabase) {
            await this.initSupabase();
        }

        if (!this.supabase) {
            alert('Error: No se pudo conectar con el servidor. Por favor, recarga la página.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creando cuenta...';
        }

        try {
            const fullName = `${firstName} ${lastName}`.trim() || email;

            // Registrar usuario en Supabase Auth
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName,
                        first_name: firstName,
                        last_name: lastName
                    }
                }
            });

            if (error) {
                throw error;
            }

            if (data.user) {
                // Mostrar mensaje de éxito
                alert('¡Cuenta creada exitosamente! Redirigiendo...');
                
                // Redirigir al formulario de registro de datos
                setTimeout(() => {
                    window.location.href = 'form-record.html';
                }, 1500);
            }
        } catch (error) {
            console.error('Error en registro:', error);
            
            let errorMessage = 'Error al crear la cuenta. Intenta nuevamente.';
            
            if (error.message) {
                if (error.message.includes('already registered') || error.message.includes('already exists')) {
                    errorMessage = 'Este email ya está registrado. Por favor, inicia sesión.';
                } else if (error.message.includes('Password')) {
                    errorMessage = 'La contraseña no cumple con los requisitos de seguridad';
                } else if (error.message.includes('Email')) {
                    errorMessage = 'El email no es válido';
                } else {
                    errorMessage = error.message;
                }
            }
            
            alert(errorMessage);
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Crear cuenta';
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PlanesManager();
});
