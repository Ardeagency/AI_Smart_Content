-- ============================================
-- Script de Limpieza: Dashboard, Catalog y Library
-- UGC Studio - Eliminación de funciones y políticas obsoletas
-- ============================================
-- 
-- Este script elimina todas las funciones, triggers, políticas RLS
-- y otros elementos relacionados con las páginas eliminadas:
-- - main-dashboard.html
-- - catalog.html  
-- - library.html
--
-- IMPORTANTE: Revisa y ejecuta este script con cuidado.
-- Se recomienda hacer un backup antes de ejecutar.
-- ============================================

BEGIN;

-- ============================================
-- 1. ELIMINAR FUNCIONES RPC RELACIONADAS
-- ============================================

-- Eliminar funciones relacionadas con dashboard
DROP FUNCTION IF EXISTS public.get_dashboard_stats(uuid);
DROP FUNCTION IF EXISTS public.get_user_dashboard_data(uuid);
DROP FUNCTION IF EXISTS public.refresh_dashboard(uuid);
DROP FUNCTION IF EXISTS public.get_dashboard_metrics(uuid);

-- Eliminar funciones relacionadas con catalog
DROP FUNCTION IF EXISTS public.get_catalog_styles(uuid);
DROP FUNCTION IF EXISTS public.get_style_catalog(uuid);
DROP FUNCTION IF EXISTS public.search_catalog_styles(text, text);
DROP FUNCTION IF EXISTS public.filter_catalog_styles(text[], text);
DROP FUNCTION IF EXISTS public.get_catalog_categories();
DROP FUNCTION IF EXISTS public.favorite_style(uuid, uuid);
DROP FUNCTION IF EXISTS public.unfavorite_style(uuid, uuid);

-- Eliminar funciones relacionadas con library
DROP FUNCTION IF EXISTS public.get_library_files(uuid);
DROP FUNCTION IF EXISTS public.get_user_library(uuid);
DROP FUNCTION IF EXISTS public.search_library_files(uuid, text);
DROP FUNCTION IF EXISTS public.get_library_folders(uuid);
DROP FUNCTION IF EXISTS public.create_library_folder(uuid, text);
DROP FUNCTION IF EXISTS public.move_library_file(uuid, uuid, uuid);

-- Eliminar funciones genéricas que puedan estar relacionadas
DROP FUNCTION IF EXISTS public.get_user_activity(uuid, integer);
DROP FUNCTION IF EXISTS public.get_recent_activity(uuid);
DROP FUNCTION IF EXISTS public.get_user_metrics(uuid);

-- ============================================
-- 2. ELIMINAR TRIGGERS RELACIONADOS
-- ============================================

-- Eliminar triggers de style_catalog si existen
DROP TRIGGER IF EXISTS update_style_catalog_updated_at ON public.style_catalog;
DROP TRIGGER IF EXISTS log_style_catalog_changes ON public.style_catalog;
DROP TRIGGER IF EXISTS update_catalog_popularity ON public.style_catalog;

-- Eliminar triggers de dashboard/metrics si existen
DROP TRIGGER IF EXISTS update_dashboard_cache ON public.projects;
DROP TRIGGER IF EXISTS update_user_stats ON public.files;
DROP TRIGGER IF EXISTS update_activity_log ON public.usage_logs;

-- ============================================
-- 3. ELIMINAR POLÍTICAS RLS ESPECÍFICAS
-- ============================================

-- Eliminar políticas de style_catalog (si se crearon específicas)
DROP POLICY IF EXISTS "Users can view style catalog" ON public.style_catalog;
DROP POLICY IF EXISTS "Users can manage own style catalog" ON public.style_catalog;
DROP POLICY IF EXISTS "Users can insert style catalog" ON public.style_catalog;
DROP POLICY IF EXISTS "Users can update style catalog" ON public.style_catalog;
DROP POLICY IF EXISTS "Users can delete style catalog" ON public.style_catalog;

-- Eliminar políticas específicas de dashboard si existen
DROP POLICY IF EXISTS "Users can view dashboard" ON public.projects;
DROP POLICY IF EXISTS "Users can view dashboard stats" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view dashboard metrics" ON public.usage_logs;

-- Eliminar políticas específicas de library si existen
DROP POLICY IF EXISTS "Users can view library" ON public.files;
DROP POLICY IF EXISTS "Users can manage library" ON public.files;
DROP POLICY IF EXISTS "Users can organize library" ON public.files;

-- ============================================
-- 4. ELIMINAR VISTAS RELACIONADAS
-- ============================================

DROP VIEW IF EXISTS public.dashboard_view;
DROP VIEW IF EXISTS public.dashboard_stats_view;
DROP VIEW IF EXISTS public.user_dashboard_summary;
DROP VIEW IF EXISTS public.catalog_view;
DROP VIEW IF EXISTS public.style_catalog_view;
DROP VIEW IF EXISTS public.library_view;
DROP VIEW IF EXISTS public.user_library_summary;

-- ============================================
-- 5. LIMPIAR TABLA style_catalog (OPCIONAL)
-- ============================================
-- 
-- NOTA: Descomenta las siguientes líneas si quieres eliminar
-- completamente la tabla style_catalog y todos sus datos.
-- Por defecto, solo se limpian las funciones y políticas.
--
-- Si la tabla style_catalog ya no se usa, puedes eliminarla:
-- DROP TABLE IF EXISTS public.style_catalog CASCADE;
--
-- O si prefieres mantener la tabla pero vaciarla:
-- TRUNCATE TABLE public.style_catalog;

-- ============================================
-- 6. ELIMINAR ÍNDICES ESPECÍFICOS (OPCIONAL)
-- ============================================

-- Eliminar índices relacionados con catalog si existen
DROP INDEX IF EXISTS idx_style_catalog_category;
DROP INDEX IF EXISTS idx_style_catalog_project;
DROP INDEX IF EXISTS idx_style_catalog_popularity;
DROP INDEX IF EXISTS idx_style_catalog_created_at;

-- ============================================
-- 7. LIMPIAR SECUENCIAS O EXTENSIONES (OPCIONAL)
-- ============================================

-- Si se crearon secuencias específicas para catalog/dashboard
DROP SEQUENCE IF EXISTS catalog_id_seq;
DROP SEQUENCE IF EXISTS dashboard_metrics_id_seq;

-- ============================================
-- 8. VERIFICACIÓN Y REPORTE
-- ============================================

-- Verificar funciones restantes relacionadas (para debugging)
DO $$
DECLARE
    func_count integer;
BEGIN
    SELECT COUNT(*) INTO func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND (
        p.proname LIKE '%dashboard%' OR
        p.proname LIKE '%catalog%' OR
        p.proname LIKE '%library%'
    );
    
    IF func_count > 0 THEN
        RAISE NOTICE '⚠️  Aún existen % funciones relacionadas. Revisa manualmente.', func_count;
    ELSE
        RAISE NOTICE '✅ Todas las funciones relacionadas han sido eliminadas.';
    END IF;
END $$;

-- Verificar políticas restantes relacionadas
DO $$
DECLARE
    policy_count integer;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND (
        policyname LIKE '%dashboard%' OR
        policyname LIKE '%catalog%' OR
        policyname LIKE '%library%'
    );
    
    IF policy_count > 0 THEN
        RAISE NOTICE '⚠️  Aún existen % políticas relacionadas. Revisa manualmente.', policy_count;
    ELSE
        RAISE NOTICE '✅ Todas las políticas relacionadas han sido eliminadas.';
    END IF;
END $$;

COMMIT;

-- ============================================
-- NOTAS FINALES
-- ============================================
-- 
-- Después de ejecutar este script:
-- 1. Verifica que no haya errores en la consola
-- 2. Revisa manualmente en Supabase Dashboard:
--    - Database > Functions
--    - Database > Policies  
--    - Database > Triggers
-- 3. Si encuentras elementos adicionales, elimínalos manualmente
-- 4. La tabla style_catalog se mantiene por defecto (comenta/descomenta según necesites)
--
-- ============================================

