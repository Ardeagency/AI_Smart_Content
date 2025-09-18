-- =====================================================
-- MIGRACIÓN: AGREGAR COLUMNA ASPECT_RATIO A UGC_PREFERENCES
-- =====================================================

-- Agregar columna aspect_ratio a la tabla ugc_preferences
ALTER TABLE ugc_preferences 
ADD COLUMN aspect_ratio VARCHAR(20) CHECK (aspect_ratio IN ('1:1', '16:9', '9:16', '4:5', '1.91:1', 'personalizado'));

-- Agregar comentario a la columna
COMMENT ON COLUMN ugc_preferences.aspect_ratio IS 'Relación de aspecto para el contenido: 1:1 (cuadrado), 16:9 (landscape), 9:16 (vertical), 4:5 (Instagram post), 1.91:1 (Facebook), personalizado';

-- Crear índice para la nueva columna
CREATE INDEX idx_ugc_preferences_aspect_ratio ON ugc_preferences(aspect_ratio);

-- Actualizar la vista ugc_preferences_complete para incluir la nueva columna
DROP VIEW IF EXISTS ugc_preferences_complete;

CREATE VIEW ugc_preferences_complete AS
SELECT 
    up.id,
    up.plataforma_principal,
    up.estilo_contenido,
    up.filtros_preferidos,
    up.iluminacion,
    up.tipo_avatar,
    up.genero_avatar,
    up.edad_avatar,
    up.etnia_avatar,
    up.caracteristicas_avatar,
    up.tipos_escenarios,
    up.estilo_escenario,
    up.hora_dia,
    up.tono_copy,
    up.longitud_texto,
    up.idioma_contenido,
    up.incluir_hashtags,
    up.mensaje_clave,
    up.call_to_action,
    up.aspect_ratio,
    up.estado,
    up.creado_en,
    u.nombre as usuario_nombre,
    b.nombre_marca,
    p.nombre_producto
FROM ugc_preferences up
LEFT JOIN users u ON up.user_id = u.id
LEFT JOIN brands b ON up.brand_id = b.id
LEFT JOIN products p ON up.product_id = p.id
WHERE up.activo = true;

-- Verificar que la columna se agregó correctamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ugc_preferences' 
        AND column_name = 'aspect_ratio'
    ) THEN
        RAISE NOTICE '✅ Columna aspect_ratio agregada exitosamente a ugc_preferences';
    ELSE
        RAISE NOTICE '❌ Error: No se pudo agregar la columna aspect_ratio';
    END IF;
END $$;
