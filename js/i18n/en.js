/**
 * Catalogo de traducciones EN (modelo "espanol como clave").
 *
 * Formato: { "<texto en espanol>": "<english>" }.
 *   - La clave es el texto espanol literal que aparece en la UI.
 *   - Un valor "" o ausente hace que t() caiga al espanol (la propia clave).
 *
 * Este archivo se mantiene con scripts/i18n-extract.mjs:
 *   - el extractor agrega claves nuevas (con valor "") sin tocar las traducidas.
 *   - NO edites fuera de los marcadores I18N:BEGIN / I18N:END.
 *
 * Para anadir otro idioma: crea js/i18n/<locale>.js con el mismo patron y
 * registra el locale en SUPPORTED dentro de js/services/I18n.js.
 */
window.__I18N_CATALOGS = window.__I18N_CATALOGS || {};
window.__I18N_CATALOGS.en = /* I18N:BEGIN */{
  "¿A qué correo enviamos el enlace?": "Which email should we send the link to?",
  "¿No te llega? Revisa la carpeta de spam o promociones.": "Didn't get it? Check your spam or promotions folder.",
  "¿Olvidaste tu contraseña?": "Forgot your password?",
  "Abre tu app autenticadora ({app}) e ingresa el código de 6 dígitos.": "Open your authenticator app ({app}) and enter the 6-digit code.",
  "Cambiar contraseña": "Change password",
  "Cerrar": "Close",
  "Código inválido. Intenta de nuevo.": "Invalid code. Please try again.",
  "Conexión restablecida": "Connection restored",
  "Configuración": "Settings",
  "Confirmar contraseña": "Confirm password",
  "Contacto": "Contact",
  "Contraseña actualizada. Inicia sesión con tu nueva contraseña.": "Password updated. Sign in with your new password.",
  "Correo": "Email",
  "Correo electrónico": "Email address",
  "Correo reenviado a {email}. Revisa tu bandeja.": "Email resent to {email}. Check your inbox.",
  "Cuenta": "Account",
  "Editar correo": "Edit email",
  "El código debe ser de 6 dígitos.": "The code must be 6 digits.",
  "Email Address": "Email Address",
  "Email o contraseña incorrectos.": "Incorrect email or password.",
  "Enlace inválido o expirado": "Invalid or expired link",
  "Enviando...": "Sending...",
  "Enviar enlace": "Send link",
  "Error": "Error",
  "Error al actualizar la contraseña.": "Could not update the password.",
  "Error al enviar el correo. Intenta de nuevo.": "Could not send the email. Please try again.",
  "Error al iniciar sesión.": "Sign-in failed.",
  "Error al iniciar sesión. Intenta de nuevo.": "Sign-in failed. Please try again.",
  "Error cargando la página. Por favor, recarga.": "Error loading the page. Please reload.",
  "Error inesperado verificando código.": "Unexpected error verifying the code.",
  "Error reenviando el correo. Intenta de nuevo en un momento.": "Error resending the email. Please try again in a moment.",
  "Error: servicio de autenticación no disponible.": "Error: authentication service unavailable.",
  "Este enlace ya no es válido. Solicita uno nuevo desde la página de inicio de sesión.": "This link is no longer valid. Request a new one from the sign-in page.",
  "General": "General",
  "Guardando...": "Saving...",
  "Idioma": "Language",
  "Iniciando sesión...": "Signing in...",
  "Introduce email y contraseña.": "Enter your email and password.",
  "Introduce tu nueva contraseña. Debe tener al menos 8 caracteres.": "Enter your new password. It must be at least 8 characters.",
  "Ir a iniciar sesión": "Go to sign in",
  "La contraseña debe tener al menos 8 caracteres.": "The password must be at least 8 characters.",
  "La edición de correo estará disponible pronto.": "Email editing will be available soon.",
  "Las contraseñas no coinciden.": "The passwords don't match.",
  "Login": "Login",
  "No se pudo reenviar el correo.": "Could not resend the email.",
  "Nombre": "Name",
  "Notificaciones": "Notifications",
  "Nueva contraseña": "New password",
  "Nueva versión disponible — recarga la página": "New version available — reload the page",
  "Organización": "Organization",
  "Password": "Password",
  "Privacidad": "Privacy",
  "Recargar Página": "Reload Page",
  "Recuperar contraseña": "Recover password",
  "Reenviar correo de verificación": "Resend verification email",
  "Reenviar en {n}s": "Resend in {n}s",
  "Seguridad": "Security",
  "Servicio no disponible.": "Service unavailable.",
  "Si existe una cuenta con ese correo, recibirás un enlace en unos minutos. Revisa también la carpeta de spam.": "If an account exists for that email, you'll get a link within a few minutes. Check your spam folder too.",
  "Sin conexión a internet": "No internet connection",
  "Sin organización": "No organization",
  "Te enviamos un enlace de verificación. Abre tu bandeja de entrada y haz click en el enlace para activar tu cuenta y continuar el proceso.": "We sent you a verification link. Open your inbox and click the link to activate your account and continue.",
  "Te enviaremos un enlace a tu correo para restablecer la contraseña. Debes hacer clic en el enlace para verificar que eres tú.": "We'll email you a link to reset your password. You must click the link to verify it's you.",
  "Términos": "Terms",
  "Todos los derechos reservados.": "All rights reserved.",
  "Tu organización requiere 2FA. Te llevamos al flujo de activación.": "Your organization requires 2FA. We'll take you to the setup flow.",
  "Usuario": "User",
  "Verifica tu correo": "Verify your email",
  "Verificación de 2 pasos": "Two-step verification",
  "Verificando enlace...": "Verifying link...",
  "Verificando...": "Verifying...",
  "Verificar": "Verify",
  "Volver": "Back",
  "Volver al inicio de sesión": "Back to sign in"
}/* I18N:END */;
