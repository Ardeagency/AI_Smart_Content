/**
 * PlanesView - Vista de selección de planes y registro
 * Maneja la selección de planes y el registro de nuevos usuarios
 */
class PlanesView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'planes.html';
    this.selectedPlan = null;
    this.supabase = null;
    this.registrationForm = null;
    this.billingPeriod = 'monthly'; // 'monthly' | 'annual'
  }

  /**
   * Hook llamado al entrar a la vista
   */
  async onEnter() {
    // Inicializar Supabase
    await this.initSupabase();
  }

  /**
   * Inicializar la vista
   */
  async init() {
    this.registrationForm = this.querySelector('#registrationForm');
    const plansContainer = this.querySelector('#planesList');
    const passwordToggle = this.querySelector('#passwordToggle');
    const passwordInput = this.querySelector('#regPassword');
    const btnResendEmail = this.querySelector('#btnResendEmail');

    // Un solo listener delegado para las cards de planes
    if (plansContainer) {
      this.addEventListener(plansContainer, 'click', (e) => {
        const card = e.target.closest('.plan-card-small');
        if (card) this.selectPlan(card);
      });
    }

    // Setup password toggle
    if (passwordToggle && passwordInput) {
      this.addEventListener(passwordToggle, 'click', () => {
        this.togglePasswordVisibility(passwordInput, passwordToggle);
      });
    }

    // Setup form submission
    if (this.registrationForm) {
      this.addEventListener(this.registrationForm, 'submit', async (e) => {
        e.preventDefault();
        await this.handleSubmit();
      });
    }

    // Validación de contraseña en tiempo real
    if (passwordInput) {
      this.addEventListener(passwordInput, 'input', () => {
        this.validatePassword(passwordInput);
      });
    }

    // Resend email
    if (btnResendEmail) {
      this.addEventListener(btnResendEmail, 'click', async () => {
        await this.resendConfirmationEmail();
      });
    }

    // Toggle Mensual / Anual
    const toggleMonthly = this.querySelector('#toggleMonthly');
    const toggleAnnual = this.querySelector('#toggleAnnual');
    const hero = this.querySelector('.planes-hero');
    const billingTitle = this.querySelector('#planesBillingTitle');
    if (toggleMonthly && toggleAnnual && hero) {
      this.addEventListener(toggleMonthly, 'click', () => {
        this.setBillingPeriod('monthly', hero, toggleMonthly, toggleAnnual, billingTitle);
      });
      this.addEventListener(toggleAnnual, 'click', () => {
        this.setBillingPeriod('annual', hero, toggleMonthly, toggleAnnual, billingTitle);
      });
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
    const sel = this.querySelector('.plan-card-small.selected');
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
    // Deseleccionar todas las cards
    const allCards = this.querySelectorAll('.plan-card-small');
    allCards.forEach(card => {
      card.classList.remove('selected');
    });
    
    // Seleccionar la card actual
    cardElement.classList.add('selected');
    
    // Guardar plan seleccionado (precio según periodo mensual o anual)
    const priceKey = this.billingPeriod === 'annual' ? 'priceAnnual' : 'price';
    const price = cardElement.dataset[priceKey] != null
      ? parseFloat(cardElement.dataset[priceKey])
      : parseFloat(cardElement.dataset.price);
    this.selectedPlan = {
      name: cardElement.dataset.plan,
      credits: parseInt(cardElement.dataset.credits),
      price: price,
      billing: this.billingPeriod
    };
    
    console.log('Plan seleccionado:', this.selectedPlan);
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

    // Validar que se haya seleccionado un plan
    if (!this.selectedPlan) {
      alert('Por favor, selecciona un plan de suscripción');
      return;
    }

    const fullNameInput = this.querySelector('#regFullName');
    const emailInput = this.querySelector('#regEmail');
    const passwordInput = this.querySelector('#regPassword');
    const submitBtn = this.registrationForm.querySelector('button[type="submit"]');

    if (!fullNameInput || !emailInput || !passwordInput) {
      alert('Error: Campos no encontrados');
      return;
    }

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // Validaciones
    if (!fullName) {
      alert('Por favor, ingresa tu nombre completo');
      return;
    }

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
    const emailConfirmationScreen = this.querySelector('#emailConfirmationScreen');
    const confirmationEmail = this.querySelector('#confirmationEmail');
    
    if (emailConfirmationScreen && confirmationEmail) {
      confirmationEmail.textContent = email;
      emailConfirmationScreen.style.display = 'flex';
      
      // Ocultar formulario principal
      const planesMain = this.querySelector('.planes-main');
      if (planesMain) {
        planesMain.style.display = 'none';
      }
    }
  }

  /**
   * Reenviar email de confirmación
   */
  async resendConfirmationEmail() {
    const confirmationEmail = this.querySelector('#confirmationEmail');
    const email = confirmationEmail?.textContent;

    if (!email) {
      alert('Error: No se pudo obtener el email');
      return;
    }

    if (!this.supabase) {
      await this.initSupabase();
    }

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

