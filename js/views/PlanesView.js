/**
 * PlanesView - Vista de planes y registro (pública, ligera).
 * Supabase solo se inicializa al enviar formulario o reenviar email.
 */
class PlanesView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'planes.html';
    this.selectedPlan = null;
    this.supabase = null;
    this.registrationForm = null;
    this.billingPeriod = 'monthly';
  }

  async onEnter() {
    // Sin trabajo en entrada; Supabase se inicializa al enviar
  }

  async updateHeader() {
    // Página pública: no tocar header ni añadir listeners globales
  }

  init() {
    const container = this.container;
    if (!container) return;

    this.registrationForm = container.querySelector('#registrationForm');
    const plansContainer = container.querySelector('#planesList');
    const passwordToggle = container.querySelector('#passwordToggle');
    const passwordInput = container.querySelector('#regPassword');
    const btnResendEmail = container.querySelector('#btnResendEmail');
    const toggleMonthly = container.querySelector('#toggleMonthly');
    const toggleAnnual = container.querySelector('#toggleAnnual');
    const hero = container.querySelector('.planes-hero');
    const billingTitle = container.querySelector('#planesBillingTitle');

    if (plansContainer) {
      this.addEventListener(plansContainer, 'click', (e) => {
        const card = e.target.closest('.plan-card-small');
        if (card) this.selectPlan(card);
      });
    }
    if (passwordToggle && passwordInput) {
      this.addEventListener(passwordToggle, 'click', () => this.togglePasswordVisibility(passwordInput, passwordToggle));
    }
    if (this.registrationForm) {
      this.addEventListener(this.registrationForm, 'submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }
    if (passwordInput) {
      this.addEventListener(passwordInput, 'input', () => this.validatePassword(passwordInput));
    }
    if (btnResendEmail) {
      this.addEventListener(btnResendEmail, 'click', () => this.resendConfirmationEmail());
    }
    if (toggleMonthly && toggleAnnual && hero && billingTitle) {
      this.addEventListener(toggleMonthly, 'click', () => this.setBillingPeriod('monthly', hero, toggleMonthly, toggleAnnual, billingTitle));
      this.addEventListener(toggleAnnual, 'click', () => this.setBillingPeriod('annual', hero, toggleMonthly, toggleAnnual, billingTitle));
    }
  }

  /**
   * Cambiar periodo de facturación (mensual/anual)
   */
  setBillingPeriod(period, hero, btnMonthly, btnAnnual, titleEl) {
    this.billingPeriod = period;
    if (period === 'annual') {
      hero.classList.add('billing-annual');
      if (btnMonthly) btnMonthly.classList.remove('active');
      if (btnAnnual) btnAnnual.classList.add('active');
      if (titleEl) titleEl.textContent = 'Planes anuales';
    } else {
      hero.classList.remove('billing-annual');
      if (btnMonthly) btnMonthly.classList.add('active');
      if (btnAnnual) btnAnnual.classList.remove('active');
      if (titleEl) titleEl.textContent = 'Planes mensuales';
    }
    const sel = this.container?.querySelector('.plan-card-small.selected');
    if (sel) this.selectPlan(sel);
  }

  /**
   * Inicializar Supabase
   */
  async initSupabase() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
      return;
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        this.supabase = await window.appLoader.waitFor();
      } catch (error) {
        console.error('Error inicializando Supabase:', error);
      }
    } else if (window.supabase) {
      this.supabase = window.supabase;
    }
  }

  /**
   * Seleccionar plan
   */
  selectPlan(cardElement) {
    const allCards = this.container?.querySelectorAll('.plan-card-small') || [];
    allCards.forEach(card => card.classList.remove('selected'));
    
    // Seleccionar la card actual
    cardElement.classList.add('selected');
    
    // Guardar plan seleccionado (precio según periodo mensual o anual)
    const priceKey = this.billingPeriod === 'annual' ? 'priceAnnual' : 'price';
    const price = cardElement.dataset[priceKey] != null
      ? parseFloat(cardElement.dataset[priceKey])
      : parseFloat(cardElement.dataset.price);
    this.selectedPlan = {
      name: cardElement.dataset.plan,
      credits: parseInt(cardElement.dataset.credits, 10) || 0,
      price: price,
      billing: this.billingPeriod
    };
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(passwordInput, passwordToggle) {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    
    // Cambiar icono
    passwordToggle.classList.toggle('fa-eye');
    passwordToggle.classList.toggle('fa-eye-slash');
  }

  /**
   * Validar contraseña
   */
  validatePassword(passwordInput) {
    const password = passwordInput.value;
    if (password.length > 0 && password.length < 8) {
      passwordInput.setCustomValidity('La contraseña debe tener al menos 8 caracteres');
    } else {
      passwordInput.setCustomValidity('');
    }
  }

  /**
   * Manejar envío del formulario
   */
  async handleSubmit() {
    if (!this.registrationForm || !this.registrationForm.checkValidity()) {
      this.registrationForm.reportValidity();
      return;
    }
    if (!this.selectedPlan) {
      alert('Por favor, selecciona un plan de suscripción');
      return;
    }

    const fullNameInput = this.container?.querySelector('#regFullName');
    const emailInput = this.container?.querySelector('#regEmail');
    const passwordInput = this.container?.querySelector('#regPassword');
    const submitBtn = this.registrationForm.querySelector('button[type="submit"]');
    if (!fullNameInput || !emailInput || !passwordInput) return;

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!fullName || password.length < 8) {
      if (!fullName) alert('Por favor, ingresa tu nombre completo');
      else alert('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (!this.supabase) await this.initSupabase();
    if (!this.supabase) {
      alert('Error: No se pudo conectar con el servidor. Por favor, recarga la página.');
      return;
    }

    // Deshabilitar botón y mostrar loading
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando cuenta...';
    }

    try {
      // Registrar usuario en Supabase Auth
      const { data, error } = await this.supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName,
            plan: this.selectedPlan.name,
            credits: this.selectedPlan.credits
          }
        }
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        // Mostrar pantalla de confirmación de email
        this.showEmailConfirmation(email);
      }
    } catch (error) {
      console.error('Error en registro:', error);
      
      let errorMessage = 'Error al crear la cuenta. Intenta nuevamente.';
      if (error.message && error.message.includes('User already registered')) {
        errorMessage = 'Este email ya está registrado. Inicia sesión en su lugar.';
      } else if (error.message && error.message.includes('Password')) {
        errorMessage = 'La contraseña no cumple con los requisitos de seguridad';
      } else if (error.message && error.message.includes('Email')) {
        errorMessage = 'El email no es válido';
      }
      
      alert(errorMessage);
    } finally {
      // Rehabilitar botón
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear cuenta';
      }
    }
  }

  /**
   * Mostrar pantalla de confirmación de email
   */
  showEmailConfirmation(email) {
    const screen = this.container?.querySelector('#emailConfirmationScreen');
    const el = this.container?.querySelector('#confirmationEmail');
    const main = this.container?.querySelector('.planes-main');
    if (el) el.textContent = email;
    if (screen) screen.style.display = 'flex';
    if (main) main.style.display = 'none';
  }

  /**
   * Reenviar email de confirmación
   */
  async resendConfirmationEmail() {
    const el = this.container?.querySelector('#confirmationEmail');
    const email = el?.textContent?.trim();
    if (!email) { alert('Error: No se pudo obtener el email'); return; }
    if (!this.supabase) await this.initSupabase();
    if (!this.supabase) {
      alert('Error: Supabase no está disponible');
      return;
    }

    try {
      const { error } = await this.supabase.auth.resend({
        type: 'signup',
        email: email
      });

      if (error) {
        throw error;
      }

      alert('Email de confirmación reenviado. Por favor, revisa tu bandeja de entrada.');
    } catch (error) {
      console.error('Error reenviando email:', error);
      alert('Error al reenviar el email. Intenta nuevamente.');
    }
  }
}

// Hacer disponible globalmente
window.PlanesView = PlanesView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlanesView;
}

