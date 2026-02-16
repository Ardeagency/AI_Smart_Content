-- ==============================================================================
-- 0. LIMPIEZA TOTAL: DESTRUIR TODAS LAS POLÍTICAS ANTERIORES
-- Esto garantiza que no queden políticas duplicadas o basura de intentos previos
-- ==============================================================================
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ==============================================================================
-- SCRIPT MAESTRO DE SEGURIDAD (RLS & PERMISOS)
-- Idempotente: se puede ejecutar varias veces.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCIONES HELPER SEGURAS (El núcleo de la seguridad)
-- Usamos SECURITY DEFINER para evitar el error de "Infinite Recursion"
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.can_access_flow(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_flow_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_flow_collaborator(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, extensions, temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_developer = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, extensions, temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_flow(_flow_id uuid)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_developer() THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.content_flows WHERE id = _flow_id AND owner_id = auth.uid()) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.flow_collaborators WHERE flow_id = _flow_id AND developer_id = auth.uid()) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. ACTIVAR EL CANDADO (RLS) EN TODAS LAS TABLAS
-- ------------------------------------------------------------------------------

DO $$
DECLARE
    tables text[] := ARRAY[
        'ai_brand_vectors', 'ai_global_vectors', 'audiences', 'brand_assets',
        'brand_colors', 'brand_entities', 'brand_fonts', 'brand_places',
        'brand_profiles', 'brand_rules', 'brands', 'brand_containers',
        'campaign_entities', 'campaigns', 'content_categories', 'content_flows',
        'content_subcategories', 'credit_usage', 'developer_logs',
        'developer_notifications', 'developer_stats', 'flow_collaborators',
        'flow_modules', 'flow_runs', 'flow_technical_details',
        'organization_credits', 'organization_members', 'organizations',
        'product_images', 'products', 'runs_inputs', 'runs_outputs',
        'services', 'storage_usage', 'subscriptions',
        'ui_component_templates', 'user_flow_favorites', 'profiles',
        'visual_references'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. POLÍTICAS DE ACCESO (REPARTIR LAS LLAVES)
-- Nota: Usamos (select auth.uid()) en lugar de auth.uid() directo para máximo rendimiento
-- ------------------------------------------------------------------------------

-- A. ORGANIZACIONES Y MIEMBROS
CREATE POLICY "View my organizations" ON public.organizations
FOR SELECT TO authenticated
USING (owner_user_id = (select auth.uid()) OR public.is_org_member(id));

CREATE POLICY "Owner update organization" ON public.organizations
FOR UPDATE TO authenticated
USING (owner_user_id = (select auth.uid()))
WITH CHECK (owner_user_id = (select auth.uid()));

CREATE POLICY "View organization members" ON public.organization_members
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR public.is_org_member(organization_id));

CREATE POLICY "Org owner or admin insert members" ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (
    public.is_org_member(organization_id) AND (
        (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = (select auth.uid())
        OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_id AND om.user_id = (select auth.uid()) AND om.role IN ('owner', 'admin'))
    )
);

CREATE POLICY "Org owner or admin update members" ON public.organization_members
FOR UPDATE TO authenticated
USING (
    public.is_org_member(organization_id) AND (
        (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = (select auth.uid())
        OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_id AND om.user_id = (select auth.uid()) AND om.role IN ('owner', 'admin'))
    )
) WITH CHECK (true);

CREATE POLICY "Org owner or admin delete members" ON public.organization_members
FOR DELETE TO authenticated
USING (
    public.is_org_member(organization_id) AND (
        (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = (select auth.uid())
        OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_id AND om.user_id = (select auth.uid()) AND om.role IN ('owner', 'admin'))
    )
);

CREATE POLICY "View org credits" ON public.organization_credits
FOR ALL TO authenticated
USING (public.is_org_member(organization_id) OR (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = (select auth.uid()));

-- B. ÁREA TÉCNICA
CREATE POLICY "Devs only logs" ON public.developer_logs 
FOR ALL TO authenticated 
USING (public.is_developer() AND public.can_access_flow(flow_id))
WITH CHECK (public.is_developer() AND public.can_access_flow(flow_id));

CREATE POLICY "Devs only stats" ON public.developer_stats 
FOR ALL TO authenticated USING (user_id = (select auth.uid()) OR public.is_developer());

CREATE POLICY "Tech details" ON public.flow_technical_details 
FOR ALL TO authenticated USING (public.is_developer());

-- C. MARCAS Y ACTIVOS
CREATE POLICY "Access own brands" ON public.brand_containers
FOR ALL TO authenticated
USING (
    user_id = (select auth.uid()) OR (organization_id IS NOT NULL AND public.is_org_member(organization_id)) OR public.is_developer()
);

CREATE POLICY "Access brands by container" ON public.brands
FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.brand_containers bc WHERE bc.id = project_id AND (bc.user_id = (select auth.uid()) OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id)) OR public.is_developer())
));

CREATE POLICY "Access brand assets" ON public.brand_assets
FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.brand_containers bc WHERE bc.id = brand_container_id AND (bc.user_id = (select auth.uid()) OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id)) OR public.is_developer())
));

CREATE POLICY "Access campaigns by brand" ON public.campaigns
FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.brand_containers bc WHERE bc.id = brand_container_id AND (bc.user_id = (select auth.uid()) OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id)) OR public.is_developer())
));

CREATE POLICY "Access product images" ON public.product_images
FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.brand_containers bc ON bc.id = p.brand_container_id WHERE p.id = product_id AND (bc.user_id = (select auth.uid()) OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id)) OR public.is_developer())
));

-- Tablas hijas de marca (Productos, Colores, Fuentes, etc.)
DO $$
DECLARE
    brand_child_tables text[] := ARRAY[
        'products', 'audiences', 'brand_colors', 'brand_entities', 
        'brand_fonts', 'brand_places', 'brand_profiles', 'brand_rules', 
        'campaign_entities', 'services', 'visual_references'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY brand_child_tables LOOP
        EXECUTE format('CREATE POLICY "Read brand assets" ON public.%I FOR SELECT TO authenticated USING (true);', t);
        EXECUTE format('CREATE POLICY "Modify brand assets" ON public.%I FOR ALL TO authenticated USING (public.is_developer() OR (SELECT auth.uid()) IS NOT NULL);', t);
    END LOOP;
END $$;

-- D. FLUJOS DE IA (Flows)
CREATE POLICY "Flow Access" ON public.content_flows
FOR ALL TO authenticated
USING (public.can_access_flow(id));

CREATE POLICY "Flow Runs" ON public.flow_runs
FOR ALL TO authenticated
USING (user_id = (select auth.uid()) OR public.is_developer());

-- E. TABLAS PÚBLICAS/CONFIGURACIÓN
CREATE POLICY "Read Categories" ON public.content_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modify categories devs" ON public.content_categories FOR ALL TO authenticated USING (public.is_developer());

CREATE POLICY "Read Subcategories" ON public.content_subcategories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modify subcategories devs" ON public.content_subcategories FOR ALL TO authenticated USING (public.is_developer());

CREATE POLICY "Read Templates" ON public.ui_component_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modify templates devs" ON public.ui_component_templates FOR ALL TO authenticated USING (public.is_developer());

CREATE POLICY "Read Global Vectors" ON public.ai_global_vectors FOR SELECT TO authenticated USING (true);

-- F. PERFILES (tabla unificada de usuarios)
CREATE POLICY "Own user profile" ON public.profiles
FOR ALL TO authenticated USING (id = (select auth.uid()));

-- G. CRÉDITOS Y SUSCRIPCIONES
CREATE POLICY "Own credit usage" ON public.credit_usage
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR (organization_id IS NOT NULL AND public.is_org_member(organization_id)));

CREATE POLICY "Own subscriptions" ON public.subscriptions
FOR ALL TO authenticated USING (user_id = (select auth.uid()));

-- H. STORAGE USAGE
CREATE POLICY "View org storage" ON public.storage_usage
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = (select auth.uid()));

-- I. NOTIFICACIONES DE DESARROLLADOR
CREATE POLICY "Own dev notifications" ON public.developer_notifications
FOR ALL TO authenticated USING (recipient_user_id = (select auth.uid()) OR public.is_developer());

-- J. COLABORADORES Y MÓDULOS DE FLUJOS
CREATE POLICY "View flow collaborators" ON public.flow_collaborators
FOR SELECT TO authenticated USING (developer_id = (select auth.uid()) OR public.can_access_flow(flow_id));

CREATE POLICY "Access flow modules" ON public.flow_modules
FOR ALL TO authenticated USING (public.can_access_flow(content_flow_id));

-- K. RUNS INPUTS/OUTPUTS
CREATE POLICY "Access runs inputs" ON public.runs_inputs
FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.flow_runs fr WHERE fr.id = run_id AND (fr.user_id = (select auth.uid()) OR public.is_developer())));

CREATE POLICY "Access runs outputs" ON public.runs_outputs
FOR ALL TO authenticated USING (run_id IS NULL OR EXISTS (SELECT 1 FROM public.flow_runs fr WHERE fr.id = run_id AND (fr.user_id = (select auth.uid()) OR public.is_developer())));

-- L. VECTORES DE MARCA
CREATE POLICY "Read brand vectors" ON public.ai_brand_vectors
FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_developer());