-- ============================================
-- FUNCIONES SQL - SECCIÓN 3: TRÁFICO Y CONTROL DE PRODUCCIÓN
-- Living Dashboard (usuario consumidor)
-- ============================================
--
-- IMPORTANTE: Ejecutar este archivo en Supabase (SQL Editor) para crear/actualizar
-- las funciones. Si no, living.js seguirá recibiendo 400 (column fo.metadata,
-- aggregate function calls cannot be nested) porque la base usará versiones viejas.
--
-- CONTEXTO: Solo usuario consumidor (Living). No incluye lógica PaaS.
-- Tablas: flow_runs, runs_outputs, brands, brand_containers, brand_entities,
--   campaigns, organizations, organization_members, users
-- ============================================

-- ============================================
-- 1️⃣ ESTADO DEL ESTUDIO
-- ============================================
CREATE OR REPLACE FUNCTION get_studio_activity_status(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_activity TIMESTAMP WITH TIME ZONE;
    v_status TEXT;
    v_hours_since_activity NUMERIC;
BEGIN
    -- Buscar la última actividad (flow_run o flow_output)
    SELECT GREATEST(
        COALESCE(MAX(fr.created_at), '1970-01-01'::TIMESTAMP WITH TIME ZONE),
        COALESCE(MAX(fo.created_at), '1970-01-01'::TIMESTAMP WITH TIME ZONE)
    )
    INTO v_last_activity
    FROM flow_runs fr
    LEFT JOIN runs_outputs fo ON fo.run_id = fr.id
    WHERE fr.brand_id = p_brand_id;

    -- Si no hay actividad, retornar inactive
    IF v_last_activity IS NULL OR v_last_activity = '1970-01-01'::TIMESTAMP WITH TIME ZONE THEN
        RETURN jsonb_build_object(
            'status', 'inactive',
            'last_activity', NULL,
            'message', 'Sin actividad reciente'
        );
    END IF;

    -- Calcular horas desde última actividad
    v_hours_since_activity := EXTRACT(EPOCH FROM (NOW() - v_last_activity)) / 3600;

    -- Determinar estado según tiempo transcurrido
    IF v_hours_since_activity < 24 THEN
        v_status := 'active';
    ELSIF v_hours_since_activity < 168 THEN -- 7 días
        v_status := 'paused';
    ELSE
        v_status := 'inactive';
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'last_activity', v_last_activity,
        'hours_since_activity', v_hours_since_activity,
        'message', CASE
            WHEN v_status = 'active' THEN 'Activo hoy'
            WHEN v_status = 'paused' THEN 'Producción en pausa'
            ELSE 'Sin actividad reciente'
        END
    );
END;
$$;

-- ============================================
-- 2️⃣ ENTIDAD MÁS PRODUCIDA
-- ============================================
CREATE OR REPLACE FUNCTION get_top_produced_entity(p_brand_container_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'entity_id', be.id,
        'entity_name', be.name,
        'entity_type', be.entity_type,
        'total_productions', COUNT(DISTINCT fo.id),
        'total_runs', COUNT(DISTINCT fr.id)
    )
    INTO v_result
    FROM flow_runs fr
    INNER JOIN runs_outputs fo ON fo.run_id = fr.id
    INNER JOIN brand_entities be ON be.id = fr.entity_id
    WHERE be.brand_container_id = p_brand_container_id
        AND fr.entity_id IS NOT NULL
    GROUP BY be.id, be.name, be.entity_type
    ORDER BY COUNT(DISTINCT fo.id) DESC
    LIMIT 1;

    RETURN COALESCE(v_result, jsonb_build_object(
        'entity_id', NULL,
        'entity_name', NULL,
        'entity_type', NULL,
        'total_productions', 0,
        'total_runs', 0
    ));
END;
$$;

-- ============================================
-- 3️⃣ FORMATO DE PRODUCCIÓN DOMINANTE
-- ============================================
CREATE OR REPLACE FUNCTION get_production_format_distribution(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total INTEGER;
    v_result JSONB;
BEGIN
    -- Contar total de outputs
    SELECT COUNT(*) INTO v_total
    FROM runs_outputs fo
    INNER JOIN flow_runs fr ON fr.id = fo.run_id
    WHERE fr.brand_id = p_brand_id;

    -- Si no hay outputs, retornar vacío
    IF v_total = 0 THEN
        RETURN jsonb_build_object(
            'total', 0,
            'formats', jsonb_build_array()
        );
    END IF;

    -- Agrupar por output_type y calcular porcentajes
    SELECT jsonb_build_object(
        'total', v_total,
        'formats', jsonb_agg(
            jsonb_build_object(
                'type', output_type,
                'count', format_count,
                'percentage', ROUND((format_count::NUMERIC / v_total::NUMERIC) * 100, 1)
            )
            ORDER BY format_count DESC
        )
    )
    INTO v_result
    FROM (
        SELECT 
            fo.output_type,
            COUNT(*) as format_count
        FROM runs_outputs fo
        INNER JOIN flow_runs fr ON fr.id = fo.run_id
        WHERE fr.brand_id = p_brand_id
        GROUP BY fo.output_type
        ORDER BY format_count DESC
        LIMIT 5 -- Top 5 formatos
    ) format_stats;

    RETURN v_result;
END;
$$;

-- ============================================
-- 4️⃣ HISTORIAL DE ACTIVIDAD (TIMELINE)
-- Un día por entrada; días sin actividad con count 0 (alineado con schema: flow_runs)
-- ============================================
CREATE OR REPLACE FUNCTION get_activity_timeline(
    p_brand_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_start_date DATE;
BEGIN
    v_start_date := CURRENT_DATE - (p_days - 1);

    -- Base: un día por cada fecha en el rango; LEFT JOIN con conteo real por día
    SELECT jsonb_build_object(
        'days', p_days,
        'start_date', v_start_date,
        'end_date', CURRENT_DATE,
        'timeline', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'date', d.activity_date,
                        'count', COALESCE(agg.run_count, 0)
                    )
                    ORDER BY d.activity_date
                )
                FROM (
                    SELECT CAST(gs AS DATE) AS activity_date
                    FROM generate_series(v_start_date, CURRENT_DATE, CAST('1 day' AS INTERVAL)) AS gs
                ) d
                LEFT JOIN (
                    SELECT DATE(fr.created_at) AS activity_date,
                           CAST(COUNT(*) AS INTEGER) AS run_count
                    FROM flow_runs fr
                    WHERE fr.brand_id = p_brand_id
                      AND DATE(fr.created_at) >= v_start_date
                      AND DATE(fr.created_at) <= CURRENT_DATE
                    GROUP BY DATE(fr.created_at)
                ) agg ON agg.activity_date = d.activity_date
            ),
            jsonb_build_array()
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================
-- 5️⃣ CAMPAÑA ACTIVA
-- ============================================
CREATE OR REPLACE FUNCTION get_active_campaign_summary(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_campaign_id UUID;
    v_output_count INTEGER;
    v_last_output TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Obtener la campaña más reciente
    SELECT c.id
    INTO v_campaign_id
    FROM campaigns c
    WHERE c.brand_id = p_brand_id
    ORDER BY c.updated_at DESC, c.created_at DESC
    LIMIT 1;

    -- Si no hay campaña, retornar estado vacío
    IF v_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'has_active_campaign', false,
            'campaign_id', NULL,
            'campaign_name', NULL,
            'total_productions', 0,
            'last_production', NULL,
            'message', 'No hay campaña activa, pero el estudio sigue produciendo'
        );
    END IF;

    -- Contar outputs asociados a la campaña (a través de flow_runs)
    SELECT 
        COUNT(DISTINCT fo.id),
        MAX(fo.created_at)
    INTO v_output_count, v_last_output
    FROM runs_outputs fo
    INNER JOIN flow_runs fr ON fr.id = fo.run_id
    INNER JOIN campaigns c ON c.brand_id = fr.brand_id
    WHERE c.id = v_campaign_id;

    -- Construir resultado
    SELECT jsonb_build_object(
        'has_active_campaign', true,
        'campaign_id', c.id,
        'campaign_name', COALESCE(c.objetivo_principal, 'Campaña sin nombre'),
        'total_productions', COALESCE(v_output_count, 0),
        'last_production', v_last_output,
        'updated_at', c.updated_at
    )
    INTO v_result
    FROM campaigns c
    WHERE c.id = v_campaign_id;

    RETURN v_result;
END;
$$;

-- ============================================
-- 6️⃣ PRODUCCIONES DESTACADAS
-- ============================================
CREATE OR REPLACE FUNCTION get_key_productions(
    p_brand_id UUID,
    p_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Subconsulta ordenada y limitada; luego agregar a JSONB (evita errores GROUP BY / agregados)
    SELECT jsonb_agg(
        jsonb_build_object(
            'output_id', row.id,
            'run_id', row.run_id,
            'output_type', row.output_type,
            'storage_path', row.storage_path,
            'created_at', row.created_at,
            'prompt_used', row.prompt_used,
            'status', COALESCE(row.meta_status, 'draft'),
            'download_count', COALESCE(row.meta_download_count, 0),
            'is_final', COALESCE(row.meta_status = 'final', false)
        )
        ORDER BY row.ord_created_at DESC
    )
    INTO v_result
    FROM (
        SELECT
            fo.id,
            fo.run_id,
            fo.output_type,
            fo.storage_path,
            fo.created_at,
            fo.prompt_used,
            (fo.metadata->>'status') AS meta_status,
            CAST(fo.metadata->>'download_count' AS INTEGER) AS meta_download_count,
            fo.created_at AS ord_created_at
        FROM runs_outputs fo
        INNER JOIN flow_runs fr ON fr.id = fo.run_id
        WHERE fr.brand_id = p_brand_id
        ORDER BY
            CAST(fo.metadata->>'download_count' AS INTEGER) DESC NULLS LAST,
            CASE WHEN (fo.metadata->>'status') = 'final' THEN 1 ELSE 2 END,
            fo.created_at DESC
        LIMIT p_limit
    ) row;

    RETURN COALESCE(v_result, jsonb_build_array());
END;
$$;

-- ============================================
-- 7️⃣ USO PRODUCTIVO DEL SISTEMA (EFICIENCIA)
-- ============================================
CREATE OR REPLACE FUNCTION get_production_efficiency(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_runs INTEGER;
    v_total_outputs INTEGER;
    v_efficiency NUMERIC;
    v_result JSONB;
BEGIN
    -- Contar total de runs
    SELECT COUNT(*)
    INTO v_total_runs
    FROM flow_runs
    WHERE brand_id = p_brand_id;

    -- Contar total de outputs
    SELECT COUNT(*)
    INTO v_total_outputs
    FROM runs_outputs fo
    INNER JOIN flow_runs fr ON fr.id = fo.run_id
    WHERE fr.brand_id = p_brand_id;

    -- Calcular eficiencia (outputs por run)
    IF v_total_runs > 0 THEN
        v_efficiency := ROUND((v_total_outputs::NUMERIC / v_total_runs::NUMERIC), 2);
    ELSE
        v_efficiency := 0;
    END IF;

    RETURN jsonb_build_object(
        'total_runs', v_total_runs,
        'total_outputs', v_total_outputs,
        'efficiency', v_efficiency,
        'efficiency_percentage', ROUND(v_efficiency * 100, 1)
    );
END;
$$;

-- ============================================
-- 8️⃣ ACTIVIDAD DEL EQUIPO - RESUMEN
-- ============================================
CREATE OR REPLACE FUNCTION get_team_activity_summary(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', u.id,
            'user_name', COALESCE(u.full_name, u.email),
            'user_email', u.email,
            'total_productions', COUNT(DISTINCT fo.id),
            'total_runs', COUNT(DISTINCT fr.id),
            'last_activity', MAX(GREATEST(fr.created_at, fo.created_at))
        )
        ORDER BY COUNT(DISTINCT fo.id) DESC
    )
    INTO v_result
    FROM organization_members om
    INNER JOIN users u ON u.id = om.user_id
    LEFT JOIN flow_runs fr ON fr.user_id = u.id
    LEFT JOIN runs_outputs fo ON fo.run_id = fr.id
    WHERE om.organization_id = p_organization_id
    GROUP BY u.id, u.full_name, u.email;

    RETURN COALESCE(v_result, jsonb_build_array());
END;
$$;

-- ============================================
-- 9️⃣ DISTRIBUCIÓN DE PRODUCCIÓN POR USUARIO
-- ============================================
CREATE OR REPLACE FUNCTION get_production_by_user(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', user_data.user_id,
            'user_name', user_data.user_name,
            'total_outputs', user_data.total_outputs
        )
        ORDER BY user_data.total_outputs DESC
    )
    INTO v_result
    FROM (
        SELECT 
            u.id as user_id,
            COALESCE(u.full_name, u.email) as user_name,
            COUNT(DISTINCT fo.id) as total_outputs
        FROM organization_members om
        INNER JOIN users u ON u.id = om.user_id
        LEFT JOIN flow_runs fr ON fr.user_id = u.id
        LEFT JOIN runs_outputs fo ON fo.run_id = fr.id
        WHERE om.organization_id = p_organization_id
        GROUP BY u.id, u.full_name, u.email
        HAVING COUNT(DISTINCT fo.id) > 0
        ORDER BY COUNT(DISTINCT fo.id) DESC
        LIMIT 5
    ) user_data;

    RETURN COALESCE(v_result, jsonb_build_array());
END;
$$;

-- ============================================
-- 🔟 ESPECIALIZACIÓN DE CONTENIDO POR USUARIO
-- ============================================
CREATE OR REPLACE FUNCTION get_user_content_specialization(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Evitar agregados anidados: subconsulta por usuario con su jsonb, luego un solo jsonb_agg
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', sub.user_id,
            'user_name', sub.user_name,
            'specialization', sub.spec
        )
    )
    INTO v_result
    FROM (
        SELECT
            u.id AS user_id,
            COALESCE(u.full_name, u.email) AS user_name,
            (
                SELECT jsonb_agg(
                    jsonb_build_object('output_type', spec_row.output_type, 'count', spec_row.cnt)
                    ORDER BY spec_row.cnt DESC
                )
                FROM (
                    SELECT fo.output_type, COUNT(*)::INTEGER AS cnt
                    FROM flow_runs fr2
                    INNER JOIN runs_outputs fo ON fo.run_id = fr2.id
                    WHERE fr2.user_id = u.id
                    GROUP BY fo.output_type
                ) spec_row
            ) AS spec
        FROM organization_members om
        INNER JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = p_organization_id
    ) sub
    WHERE sub.spec IS NOT NULL;

    RETURN COALESCE(v_result, jsonb_build_array());
END;
$$;

-- ============================================
-- 1️⃣1️⃣ USO DE FLUJOS POR USUARIO
-- ============================================
CREATE OR REPLACE FUNCTION get_user_flow_usage(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Evitar agregados anidados: subconsulta por usuario con su jsonb de flows, luego un solo jsonb_agg
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', sub.user_id,
            'user_name', sub.user_name,
            'flows', sub.flows_json
        )
    )
    INTO v_result
    FROM (
        SELECT
            u.id AS user_id,
            COALESCE(u.full_name, u.email) AS user_name,
            (
                SELECT jsonb_agg(
                    jsonb_build_object('flow_id', fl.row_flow_id, 'flow_name', fl.row_flow_name, 'usage_count', fl.row_cnt)
                    ORDER BY fl.row_cnt DESC
                )
                FROM (
                    SELECT cf.id AS row_flow_id, cf.name AS row_flow_name, COUNT(*)::INTEGER AS row_cnt
                    FROM flow_runs fr2
                    INNER JOIN content_flows cf ON cf.id = fr2.flow_id
                    WHERE fr2.user_id = u.id
                    GROUP BY cf.id, cf.name
                ) fl
            ) AS flows_json
        FROM organization_members om
        INNER JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = p_organization_id
    ) sub
    WHERE sub.flows_json IS NOT NULL;

    RETURN COALESCE(v_result, jsonb_build_array());
END;
$$;

-- ============================================
-- 1️⃣2️⃣ ESTADO DE ACTIVIDAD DEL EQUIPO
-- ============================================
CREATE OR REPLACE FUNCTION get_team_activity_status(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_today INTEGER;
    v_active_week INTEGER;
    v_inactive INTEGER;
    v_total_members INTEGER;
BEGIN
    -- Contar miembros totales
    SELECT COUNT(*)
    INTO v_total_members
    FROM organization_members
    WHERE organization_id = p_organization_id;

    -- Activos hoy (última actividad < 24h)
    SELECT COUNT(DISTINCT om.user_id)
    INTO v_active_today
    FROM organization_members om
    INNER JOIN flow_runs fr ON fr.user_id = om.user_id
    WHERE om.organization_id = p_organization_id
        AND fr.created_at >= NOW() - INTERVAL '24 hours';

    -- Activos esta semana (última actividad < 7 días)
    SELECT COUNT(DISTINCT om.user_id)
    INTO v_active_week
    FROM organization_members om
    INNER JOIN flow_runs fr ON fr.user_id = om.user_id
    WHERE om.organization_id = p_organization_id
        AND fr.created_at >= NOW() - INTERVAL '7 days';

    -- Inactivos (sin actividad en 7 días)
    v_inactive := v_total_members - v_active_week;

    RETURN jsonb_build_object(
        'total_members', v_total_members,
        'active_today', COALESCE(v_active_today, 0),
        'active_this_week', COALESCE(v_active_week, 0),
        'inactive', COALESCE(v_inactive, 0)
    );
END;
$$;

-- ============================================
-- 1️⃣3️⃣ OVERVIEW COMPLETO DEL EQUIPO (FUNCIÓN AGREGADA)
-- ============================================
CREATE OR REPLACE FUNCTION get_team_living_overview(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'team_summary', get_team_activity_summary(p_organization_id),
        'production_distribution', get_production_by_user(p_organization_id),
        'content_specialization', get_user_content_specialization(p_organization_id),
        'flow_usage', get_user_flow_usage(p_organization_id),
        'activity_status', get_team_activity_status(p_organization_id)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================
-- COMENTARIOS Y NOTAS
-- ============================================
COMMENT ON FUNCTION get_studio_activity_status IS 'Retorna el estado de actividad del estudio (active/paused/inactive) basado en la última ejecución';
COMMENT ON FUNCTION get_top_produced_entity IS 'Retorna la entidad (producto/servicio) más producida en el brand_container';
COMMENT ON FUNCTION get_production_format_distribution IS 'Retorna la distribución de formatos de producción (imagen/video/texto)';
COMMENT ON FUNCTION get_activity_timeline IS 'Retorna una línea temporal de actividad por día para el período especificado';
COMMENT ON FUNCTION get_active_campaign_summary IS 'Retorna el resumen de la campaña activa más reciente';
COMMENT ON FUNCTION get_key_productions IS 'Retorna las producciones más destacadas (por descargas y estado final)';
COMMENT ON FUNCTION get_production_efficiency IS 'Retorna métricas de eficiencia: total runs, outputs y ratio';
COMMENT ON FUNCTION get_team_activity_summary IS 'Retorna resumen de actividad de todos los miembros del equipo';
COMMENT ON FUNCTION get_production_by_user IS 'Retorna distribución de producción por usuario (top 5)';
COMMENT ON FUNCTION get_user_content_specialization IS 'Retorna especialización de contenido por usuario (qué tipo produce cada uno)';
COMMENT ON FUNCTION get_user_flow_usage IS 'Retorna uso de flujos/herramientas por usuario';
COMMENT ON FUNCTION get_team_activity_status IS 'Retorna estado de actividad del equipo (activos hoy/semana/inactivos)';
COMMENT ON FUNCTION get_team_living_overview IS 'Función agregada que retorna overview completo del equipo para Living dashboard (usuario consumidor)';

-- ============================================
-- NOTA: Parámetros de marca
-- ============================================
-- Las funciones que reciben p_brand_id esperan brands.id (FK en flow_runs, campaigns).
-- get_top_produced_entity recibe p_brand_container_id (brand_containers.id).
-- El frontend (living.js) obtiene ambos: brandId desde brands.id, brandContainerId desde brand_containers.id.
