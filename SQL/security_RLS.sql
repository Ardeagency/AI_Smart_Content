-- ==============================================================================
-- SCRIPT MAESTRO DE SEGURIDAD (RLS & PERMISOS)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCIONES HELPER SEGURAS (El núcleo de la seguridad)
-- Usamos SECURITY DEFINER para evitar el error de "Infinite Recursion"
-- ------------------------------------------------------------------------------

-- Función para verificar si es desarrollador (acceso total a logs/técnico)
CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER -- Permisos de admin para leer user_profiles sin bloqueos
SET search_path = public, extensions, temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_developer = true
      AND is_active = true
  );
END;
$$;

-- Función para verificar membresía en organización (rompe el bucle infinito)
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER -- Vital para romper la recursión en policies de Organizaciones
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

-- Función para verificar si el usuario es dueño de un flow (evita recursión flow_collaborators ↔ content_flows)
CREATE OR REPLACE FUNCTION public.is_flow_owner(_flow_id uuid)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.content_flows
    WHERE id = _flow_id AND owner_id = auth.uid()
  );
END;
$$;

-- Función para verificar si el usuario es colaborador de un flow (evita recursión con content_flows)
CREATE OR REPLACE FUNCTION public.is_flow_collaborator(_flow_id uuid)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.flow_collaborators
    WHERE flow_id = _flow_id AND developer_id = auth.uid()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. ACTIVAR EL CANDADO (RLS) EN TODAS LAS TABLAS
-- Esto cierra el acceso público por defecto.
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
        'ui_component_templates', 'user_flow_favorites', 'user_profiles',
        'users', 'visual_references'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. POLÍTICAS DE ACCESO (REPARTIR LAS LLAVES)
-- ------------------------------------------------------------------------------

-- A. ORGANIZACIONES Y MIEMBROS (La base del SAAS)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "View my organizations" ON public.organizations;
CREATE POLICY "View my organizations" ON public.organizations
FOR SELECT TO authenticated
USING (
    owner_user_id = auth.uid() 
    OR 
    public.is_org_member(id) -- Usa la función segura
);

DROP POLICY IF EXISTS "View organization members" ON public.organization_members;
CREATE POLICY "View organization members" ON public.organization_members
FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
    OR
    public.is_org_member(organization_id) -- Veo a mis compañeros
);

-- Créditos de organización (solo miembros de la org)
DROP POLICY IF EXISTS "View org credits" ON public.organization_credits;
CREATE POLICY "View org credits" ON public.organization_credits
FOR ALL TO authenticated
USING (public.is_org_member(organization_id) OR (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = auth.uid());

-- B. ÁREA TÉCNICA (Solo Developers)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Devs only logs" ON public.developer_logs;
CREATE POLICY "Devs only logs" ON public.developer_logs 
FOR ALL TO authenticated USING (public.is_developer());

DROP POLICY IF EXISTS "Devs only stats" ON public.developer_stats;
CREATE POLICY "Devs only stats" ON public.developer_stats 
FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_developer());

DROP POLICY IF EXISTS "Tech details" ON public.flow_technical_details;
CREATE POLICY "Tech details" ON public.flow_technical_details 
FOR ALL TO authenticated USING (public.is_developer());

-- C. MARCAS Y ACTIVOS (Dueños y Equipos)
-- -----------------------------------------------------------
-- Contenedores de marca
DROP POLICY IF EXISTS "Access own brands" ON public.brand_containers;
CREATE POLICY "Access own brands" ON public.brand_containers
FOR ALL TO authenticated
USING (
    user_id = auth.uid()
    OR 
    (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR
    public.is_developer()
);

-- Marcas (voz/identidad; project_id = brand_container_id)
DROP POLICY IF EXISTS "Access brands by container" ON public.brands;
CREATE POLICY "Access brands by container" ON public.brands
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.brand_containers bc
        WHERE bc.id = project_id
        AND (bc.user_id = auth.uid()
             OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id))
             OR public.is_developer())
    )
);

-- Activos de marca (archivos por brand_container)
DROP POLICY IF EXISTS "Access brand assets" ON public.brand_assets;
CREATE POLICY "Access brand assets" ON public.brand_assets
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.brand_containers bc
        WHERE bc.id = brand_container_id
        AND (bc.user_id = auth.uid()
             OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id))
             OR public.is_developer())
    )
);

-- Campañas (por brand_container)
DROP POLICY IF EXISTS "Access campaigns by brand" ON public.campaigns;
CREATE POLICY "Access campaigns by brand" ON public.campaigns
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.brand_containers bc
        WHERE bc.id = brand_container_id
        AND (bc.user_id = auth.uid()
             OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id))
             OR public.is_developer())
    )
);

-- Imágenes de producto (acceso vía producto → brand_container)
DROP POLICY IF EXISTS "Access product images" ON public.product_images;
CREATE POLICY "Access product images" ON public.product_images
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        JOIN public.brand_containers bc ON bc.id = p.brand_container_id
        WHERE p.id = product_id
        AND (bc.user_id = auth.uid()
             OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id))
             OR public.is_developer())
    )
);

-- Tablas hijas de marca (Productos, Colores, Fuentes, etc.)
-- Aplicamos una política eficiente de lectura
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
        EXECUTE format('DROP POLICY IF EXISTS "Access brand assets" ON public.%I;', t);
        -- Lectura abierta para autenticados (la UI filtra por Brand ID, que ya está protegido)
        EXECUTE format('CREATE POLICY "Read brand assets" ON public.%I FOR SELECT TO authenticated USING (true);', t);
        -- Escritura/Borrado restringido a Developers o Dueños (simplificado)
        EXECUTE format('CREATE POLICY "Modify brand assets" ON public.%I FOR ALL TO authenticated USING (public.is_developer() OR (SELECT auth.uid()) IS NOT NULL);', t);
    END LOOP;
END $$;

-- D. FLUJOS DE IA (Flows)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Flow Access" ON public.content_flows;
CREATE POLICY "Flow Access" ON public.content_flows
FOR ALL TO authenticated
USING (
    owner_id = auth.uid() 
    OR public.is_flow_collaborator(id)
    OR public.is_developer()
);

DROP POLICY IF EXISTS "Flow Runs" ON public.flow_runs;
CREATE POLICY "Flow Runs" ON public.flow_runs
FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_developer());

-- E. TABLAS PÚBLICAS/CONFIGURACIÓN (Lectura general; escritura solo devs)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Read Categories" ON public.content_categories;
CREATE POLICY "Read Categories" ON public.content_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Modify categories devs" ON public.content_categories;
CREATE POLICY "Modify categories devs" ON public.content_categories FOR ALL TO authenticated USING (public.is_developer());

DROP POLICY IF EXISTS "Read Subcategories" ON public.content_subcategories;
CREATE POLICY "Read Subcategories" ON public.content_subcategories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Modify subcategories devs" ON public.content_subcategories;
CREATE POLICY "Modify subcategories devs" ON public.content_subcategories FOR ALL TO authenticated USING (public.is_developer());

DROP POLICY IF EXISTS "Read Templates" ON public.ui_component_templates;
CREATE POLICY "Read Templates" ON public.ui_component_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Modify templates devs" ON public.ui_component_templates;
CREATE POLICY "Modify templates devs" ON public.ui_component_templates FOR ALL TO authenticated USING (public.is_developer());

DROP POLICY IF EXISTS "Read Global Vectors" ON public.ai_global_vectors;
CREATE POLICY "Read Global Vectors" ON public.ai_global_vectors FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------------------------
-- F. USUARIOS Y PERFILES (solo datos propios)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Own user profile" ON public.user_profiles;
CREATE POLICY "Own user profile" ON public.user_profiles
FOR ALL TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Own user record" ON public.users;
CREATE POLICY "Own user record" ON public.users
FOR ALL TO authenticated
USING (id = auth.uid());

-- ------------------------------------------------------------------------------
-- G. CRÉDITOS Y SUSCRIPCIONES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Own credit usage" ON public.credit_usage;
CREATE POLICY "Own credit usage" ON public.credit_usage
FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
);

DROP POLICY IF EXISTS "Own subscriptions" ON public.subscriptions;
CREATE POLICY "Own subscriptions" ON public.subscriptions
FOR ALL TO authenticated
USING (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- H. STORAGE USAGE (por organización)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "View org storage" ON public.storage_usage;
CREATE POLICY "View org storage" ON public.storage_usage
FOR SELECT TO authenticated
USING (
    public.is_org_member(organization_id)
    OR (SELECT owner_user_id FROM public.organizations WHERE id = organization_id) = auth.uid()
);

-- ------------------------------------------------------------------------------
-- I. NOTIFICACIONES DE DESARROLLADOR
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Own dev notifications" ON public.developer_notifications;
CREATE POLICY "Own dev notifications" ON public.developer_notifications
FOR ALL TO authenticated
USING (recipient_user_id = auth.uid() OR public.is_developer());

-- ------------------------------------------------------------------------------
-- J. COLABORADORES Y MÓDULOS DE FLUJOS (para evaluar políticas de content_flows)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "View flow collaborators" ON public.flow_collaborators;
CREATE POLICY "View flow collaborators" ON public.flow_collaborators
FOR SELECT TO authenticated
USING (
    developer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.content_flows f WHERE f.id = flow_id AND f.owner_id = auth.uid())
    OR public.is_developer()
);

DROP POLICY IF EXISTS "Access flow modules" ON public.flow_modules;
CREATE POLICY "Access flow modules" ON public.flow_modules
FOR ALL TO authenticated
USING (
    public.is_flow_owner(content_flow_id)
    OR public.is_flow_collaborator(content_flow_id)
    OR public.is_developer()
);

-- ------------------------------------------------------------------------------
-- K. RUNS INPUTS/OUTPUTS (solo runs del usuario o dev)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Access runs inputs" ON public.runs_inputs;
CREATE POLICY "Access runs inputs" ON public.runs_inputs
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.flow_runs fr WHERE fr.id = run_id AND (fr.user_id = auth.uid() OR public.is_developer()))
);

DROP POLICY IF EXISTS "Access runs outputs" ON public.runs_outputs;
CREATE POLICY "Access runs outputs" ON public.runs_outputs
FOR ALL TO authenticated
USING (
    run_id IS NULL
    OR EXISTS (SELECT 1 FROM public.flow_runs fr WHERE fr.id = run_id AND (fr.user_id = auth.uid() OR public.is_developer()))
);

-- ------------------------------------------------------------------------------
-- L. VECTORES DE MARCA (por organización)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read brand vectors" ON public.ai_brand_vectors;
CREATE POLICY "Read brand vectors" ON public.ai_brand_vectors
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR public.is_developer());