/**
 * SignInView - Vista de inicio de sesión y registro (Sign In / Sign Up).
 * Estilo tipo lexaboard: formulario centrado con toggle entre estados.
 */
class SignInView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'signin.html';
    this.form = null;
    this.stateSignIn = null;
    this.stateSignUp = null;
    this.btnToggle = null;
    this.toggleText = null;
    this.currentState = 'signin'; // 'signin' | 'signup'
  }

  async onEnter() {
    // Sin redirección automática: siempre se muestra la página de login/registro
  }

  async init() {
    this.form = this.querySelector('#form_signin');
    this.stateSignIn = this.querySelector('.auth-state[data-state="signin"]');
    this.stateSignUp = this.querySelector('.auth-state[data-state="signup"]');
    this.btnToggle = this.querySelector('#btnToggleAuth');
    this.toggleText = this.querySelector('#toggleSignInText');
    const linkForgot = this.querySelector('#linkForgotPassword');

    if (!this.form || !this.stateSignIn || !this.stateSignUp) {
      console.error('SignInView: elementos del formulario no encontrados');
      return;
    }

    // Toggle entre Sign In y Sign Up
    if (this.btnToggle) {
      this.addEventListener(this.btnToggle, 'click', () => this.toggleState());
    }

    // Envío del formulario (según estado activo)
    this.addEventListener(this.form, 'submit', (e) => {
      e.preventDefault();
      if (this.currentState === 'signin') {
        this.handleSignIn();
      } else {
        this.handleSignUp();
      }
    });

    // Olvidaste tu contraseña
    if (linkForgot) {
      this.addEventListener(linkForgot, 'click', (e) => {
        e.preventDefault();
        this.handleForgotPassword();
      });
    }

    // Iniciar sesión / Registrarse con Google
    const btnGoogle = this.querySelector('#btnGoogle');
    if (btnGoogle) {
      this.addEventListener(btnGoogle, 'click', () => this.handleGoogleLogin());
    }
  }

  async handleGoogleLogin() {
    if (!window.authService) {
      alert('Servicio de autenticación no disponible.');
      return;
    }
    const result = await window.authService.socialLogin('google');
    if (!result.success) {
      alert(result.error || 'Error al conectar con Google.');
    }
    // Si success, el navegador redirige a Google y luego a redirectTo
  }

  toggleState() {
    this.currentState = this.currentState === 'signin' ? 'signup' : 'signin';
    this.stateSignIn.classList.toggle('active', this.currentState === 'signin');
    this.stateSignUp.classList.toggle('active', this.currentState === 'signup');
    if (this.toggleText) {
      this.toggleText.textContent = this.currentState === 'signin' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? ';
    }
    if (this.btnToggle) {
      this.btnToggle.textContent = this.currentState === 'signin' ? 'Regístrate' : 'Iniciar sesión';
    }
    this.form.reset();
  }

  async handleSignIn() {
    const email = this.querySelector('#signinEmail')?.value?.trim();
    const password = this.querySelector('#signinPassword')?.value;
    const btn = this.querySelector('#btnSignIn');

    if (!email || !password) {
      alert('Introduce email y contraseña.');
      return;
    }

    if (!window.authService) {
      alert('Error: servicio de autenticación no disponible.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Iniciando sesión...';
    }

    try {
      const result = await window.authService.login(email, password);

      if (result.success && result.redirectRoute) {
        if (window.router) {
          window.router.navigate(result.redirectRoute, true);
        } else {
          window.location.href = `/#${result.redirectRoute}`;
        }
        return;
      }

      if (result.error === 'EMAIL_NOT_VERIFIED' || (result.message && result.message.includes('verifica'))) {
        alert('Por favor verifica tu email antes de iniciar sesión. Revisa tu bandeja de entrada.');
        return;
      }

      const msg = result.error && result.error.includes('Invalid') ? 'Email o contraseña incorrectos.' : (result.error || 'Error al iniciar sesión.');
      alert(msg);
    } catch (err) {
      console.error('Error en login:', err);
      alert('Error al iniciar sesión. Intenta de nuevo.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    }
  }

  async handleSignUp() {
    const fullName = this.querySelector('#signupFullName')?.value?.trim();
    const email = this.querySelector('#signupEmail')?.value?.trim();
    const password = this.querySelector('#signupPassword')?.value;
    const passwordConfirm = this.querySelector('#signupPasswordConfirm')?.value;
    const btn = this.querySelector('#btnSignUp');

    if (!fullName || !email || !password || !passwordConfirm) {
      alert('Completa todos los campos.');
      return;
    }

    if (password.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== passwordConfirm) {
      alert('Las contraseñas no coinciden.');
      return;
    }

    const supabase = await this.getSupabaseClient();
    if (!supabase) {
      alert('Error: no se pudo conectar. Recarga la página.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando cuenta...';
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: { data: { full_name: fullName } }
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          alert('Este email ya está registrado. Inicia sesión en su lugar.');
        } else if (error.message.includes('Password')) {
          alert('La contraseña no cumple los requisitos de seguridad.');
        } else {
          alert(error.message || 'Error al crear la cuenta.');
        }
        return;
      }

      if (data?.user) {
        alert('Cuenta creada. Revisa tu correo para verificar tu email.');
        this.toggleState(); // Cambiar a Sign In
      }
    } catch (err) {
      console.error('Error en registro:', err);
      alert('Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Registrarse';
      }
    }
  }

  handleForgotPassword() {
    const email = this.querySelector('#signinEmail')?.value?.trim();
    const promptEmail = email || window.prompt('Introduce tu email para restablecer la contraseña:');
    if (!promptEmail?.trim()) return;

    if (!window.authService) {
      alert('Servicio no disponible.');
      return;
    }

    window.authService.resetPassword(promptEmail.trim()).then((result) => {
      if (result.success) {
        alert('Revisa tu correo: te hemos enviado un enlace para restablecer la contraseña.');
      } else {
        alert(result.error || 'Error al enviar el email.');
      }
    });
  }

  async getSupabaseClient() {
    if (window.supabaseService?.getClient) {
      return await window.supabaseService.getClient();
    }
    if (window.appLoader?.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch {
        return null;
      }
    }
    return window.supabase || null;
  }
}

window.SignInView = SignInView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignInView;
}
