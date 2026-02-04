/**
 * Workspace Context - Carga y validación del contexto de organización
 * Principio Workspace First: toda página funcional vive bajo /org/:orgId
 *
 * - Valida que el usuario pertenezca a la org
 * - Valida que la org exista
 * - Actualiza AppState.currentOrganization
 * - Si falla → redirect /home
 */

(async function workspaceContextFactory() {
  'use strict';

  async function getSupabase() {
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    if (window.appLoader && window.appLoader.waitFor) {
      return await window.appLoader.waitFor();
    }
    return window.supabase || null;
  }

  /**
   * Cargar y validar contexto de organización.
   * Debe ejecutarse al entrar a cualquier ruta /org/:orgId/*
   *
   * @param {string} orgId - UUID de la organización
   * @returns {Promise<boolean>} true si el contexto se cargó correctamente, false si falla (y redirige a /home)
   */
  async function loadOrganizationContext(orgId) {
    if (!orgId) {
      if (window.router) window.router.navigate('/home', true);
      return false;
    }

    const supabase = await getSupabase();
    if (!supabase) {
      console.error('Workspace context: Supabase no disponible');
      if (window.router) window.router.navigate('/home', true);
      return false;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      if (window.router) window.router.navigate('/login', true);
      return false;
    }

    try {
      // 1) Verificar que la organización existe
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, owner_user_id, created_at')
        .eq('id', orgId)
        .maybeSingle();

      if (orgError || !org) {
        console.warn('Workspace context: organización no encontrada o error', orgId, orgError);
        if (window.router) window.router.navigate('/home', true);
        return false;
      }

      // 2) Verificar que el usuario pertenece a la org (owner o member)
      const isOwner = org.owner_user_id === user.id;
      let isMember = false;

      if (!isOwner) {
        const { data: member } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', orgId)
          .eq('user_id', user.id)
          .maybeSingle();
        isMember = !!member;
      }

      if (!isOwner && !isMember) {
        console.warn('Workspace context: usuario no tiene acceso a la organización', orgId);
        if (window.router) window.router.navigate('/home', true);
        return false;
      }

      // 3) Actualizar estado global
      if (window.appState) {
        window.appState.setCurrentUser(user);
        window.appState.setCurrentOrganization({
          id: org.id,
          name: org.name,
          owner_user_id: org.owner_user_id,
          created_at: org.created_at
        });
      }

      return true;
    } catch (err) {
      console.error('Workspace context: error cargando organización', err);
      if (window.router) window.router.navigate('/home', true);
      return false;
    }
  }

  /**
   * Navegar a un módulo del workspace actual (usa orgId del estado).
   * Regla: todas las navegaciones internas deben recibir orgId.
   *
   * @param {string} module - Nombre del módulo: living, brand, entities, production, audiences, marketing, settings
   * @param {string} [orgId] - Si no se pasa, usa appState.getCurrentOrgId()
   */
  function navigateToModule(module, orgId) {
    const id = orgId || (window.appState && window.appState.getCurrentOrgId());
    if (!id) {
      if (window.router) window.router.navigate('/home', true);
      return;
    }
    const path = `/org/${id}/${module}`;
    if (window.router) {
      window.router.navigate(path);
    } else {
      window.location.href = path;
    }
  }

  window.workspaceContext = {
    loadOrganizationContext,
    navigateToModule,
    getSupabase
  };
})();
