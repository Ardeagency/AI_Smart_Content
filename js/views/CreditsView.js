/**
 * CreditsView - Redirige a la vista donde se ven los créditos.
 * Con org en contexto: /org/:id/organization (configuración incluye créditos).
 * Sin org: redirige a organización por defecto o /settings.
 */
class CreditsView extends BaseView {
  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    const orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (orgId && window.router) {
      window.router.navigate(`/org/${orgId}/organization`, true);
      return;
    }
    const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
      ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
      : '/settings';
    if (window.router) window.router.navigate(url, true);
  }

  async render() {
    if (!this.container) return;
    await this.onEnter();
    if (this.container) {
      this.container.innerHTML = '<div class="page-content"><p class="text-muted">Redirigiendo...</p></div>';
    }
  }
}

window.CreditsView = CreditsView;
