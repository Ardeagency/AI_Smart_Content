-- =====================================================
-- NUEVO ESQUEMA SUPABASE - SISTEMA UGC SIMPLIFICADO
-- Basado en formularios ultra simplificados
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. TABLA USERS (ULTRA SIMPLIFICADA)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100),
    correo VARCHAR(255) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    acceso VARCHAR(20) DEFAULT 'usuario' CHECK (acceso IN ('admin', 'moderador', 'usuario', 'invitado')),
    activo BOOLEAN DEFAULT true,
    email_verificado BOOLEAN DEFAULT false,
    ultimo_acceso TIMESTAMP,
    avatar_url VARCHAR(500),
    zona_horaria VARCHAR(50) DEFAULT 'UTC',
    idioma VARCHAR(10) DEFAULT 'es',
    tema VARCHAR(10) DEFAULT 'claro' CHECK (tema IN ('claro', 'oscuro', 'auto')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    creado_por VARCHAR(50),
    actualizado_por VARCHAR(50)
);

-- Índices para users
CREATE INDEX idx_users_correo ON users(correo);
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_acceso ON users(acceso);
CREATE INDEX idx_users_activo ON users(activo);
CREATE INDEX idx_users_creado_en ON users(creado_en);

-- =====================================================
-- 2. TABLA BRANDS (SIMPLIFICADA)
-- =====================================================
CREATE TABLE brands (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nombre_marca VARCHAR(200) NOT NULL,
    nicho_principal VARCHAR(100) NOT NULL,
    subnicho VARCHAR(100),
    categorias_asociadas TEXT[],
    publico_objetivo TEXT NOT NULL,
    mercado_sector VARCHAR(100),
    logo_url VARCHAR(500),
    eslogan TEXT,
    paleta_colores JSONB, -- {color1: "#FD624F", color2: "#000000", color3: "#FFFFFF", color4: "#808080"}
    identidad_proposito TEXT NOT NULL,
    personalidad_atributos TEXT[],
    tono_comunicacion VARCHAR(50),
    storytelling_filosofia TEXT,
    archivos_adicionales JSONB DEFAULT '[]',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para brands
CREATE INDEX idx_brands_user_id ON brands(user_id);
CREATE INDEX idx_brands_nicho ON brands(nicho_principal);
CREATE INDEX idx_brands_mercado ON brands(mercado_sector);
CREATE INDEX idx_brands_activo ON brands(activo);
CREATE INDEX idx_brands_creado_en ON brands(creado_en);

-- =====================================================
-- 3. TABLA PRODUCTS (ULTRA SIMPLIFICADA)
-- =====================================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    nombre_producto VARCHAR(200) NOT NULL,
    tipo_producto VARCHAR(50) NOT NULL CHECK (tipo_producto IN ('producto_fisico', 'producto_digital', 'servicio', 'curso', 'software', 'evento', 'otro')),
    categoria VARCHAR(100) NOT NULL,
    subcategoria VARCHAR(100),
    descripcion TEXT NOT NULL,
    caracteristicas_principales TEXT[],
    beneficios TEXT[],
    imagenes_producto JSONB DEFAULT '[]', -- Array de URLs de las 4 imágenes obligatorias
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    destacado BOOLEAN DEFAULT false,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para products
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_brand_id ON products(brand_id);
CREATE INDEX idx_products_tipo ON products(tipo_producto);
CREATE INDEX idx_products_categoria ON products(categoria);
CREATE INDEX idx_products_estado ON products(estado);
CREATE INDEX idx_products_activo ON products(activo);
CREATE INDEX idx_products_destacado ON products(destacado);
CREATE INDEX idx_products_creado_en ON products(creado_en);

-- =====================================================
-- 4. TABLA UGC_PREFERENCES (NUEVA)
-- =====================================================
CREATE TABLE ugc_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    
    -- Configuración General
    tipo_contenido VARCHAR(50) NOT NULL CHECK (tipo_contenido IN ('video', 'imagen', 'carousel', 'story', 'reel', 'post', 'mixto')),
    plataforma_principal VARCHAR(50) NOT NULL CHECK (plataforma_principal IN ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'linkedin', 'pinterest', 'snapchat', 'otro')),
    frecuencia_generacion VARCHAR(20) DEFAULT 'semanal' CHECK (frecuencia_generacion IN ('diaria', 'semanal', 'quincenal', 'mensual', 'personalizada')),
    cantidad_contenido INTEGER DEFAULT 5 CHECK (cantidad_contenido > 0 AND cantidad_contenido <= 100),
    
    -- Estilo Visual
    estilo_contenido TEXT[], -- profesional, casual, minimalista, colorido, vintage, moderno, elegante, divertido
    filtros_preferidos VARCHAR(50) CHECK (filtros_preferidos IN ('ninguno', 'suaves', 'vibrantes', 'blanco_negro', 'sepia', 'vintage', 'dramatico', 'personalizado')),
    iluminacion VARCHAR(50) CHECK (iluminacion IN ('natural', 'artificial', 'mixta', 'dramatica', 'suave', 'intensa')),
    
    -- Configuración de Avatares
    tipo_avatar VARCHAR(50) NOT NULL CHECK (tipo_avatar IN ('realista', 'anime', 'cartoon', '3d', 'ilustracion', 'fotorealista', 'abstracto')),
    genero_avatar VARCHAR(20) CHECK (genero_avatar IN ('masculino', 'femenino', 'no_binario', 'mixto', 'sin_preferencia')),
    edad_avatar VARCHAR(20) CHECK (edad_avatar IN ('18-25', '26-35', '36-45', '46-55', '55+', 'mixto')),
    etnia_avatar VARCHAR(50) CHECK (etnia_avatar IN ('latino', 'caucasico', 'afroamericano', 'asiatico', 'indigena', 'mixto', 'sin_preferencia')),
    caracteristicas_avatar TEXT,
    
    -- Configuración de Escenarios
    tipos_escenarios TEXT[], -- hogar, oficina, exterior, gym, cocina, estudio, playa, montana, ciudad, abstracto
    estilo_escenario VARCHAR(50) CHECK (estilo_escenario IN ('moderno', 'clasico', 'minimalista', 'rustico', 'industrial', 'bohemio', 'elegante', 'colorido')),
    hora_dia VARCHAR(50) CHECK (hora_dia IN ('amanecer', 'manana', 'mediodia', 'tarde', 'atardecer', 'noche', 'mixto')),
    
    -- Configuración de Texto y Copy
    tono_copy VARCHAR(50) NOT NULL CHECK (tono_copy IN ('profesional', 'amigable', 'divertido', 'inspirador', 'urgente', 'educativo', 'emocional', 'directo')),
    longitud_texto VARCHAR(20) CHECK (longitud_texto IN ('corto', 'medio', 'largo', 'mixto')),
    idioma_contenido VARCHAR(10) DEFAULT 'es' CHECK (idioma_contenido IN ('es', 'en', 'fr', 'pt', 'mixto')),
    incluir_hashtags VARCHAR(20) CHECK (incluir_hashtags IN ('si', 'no', 'opcional')),
    mensaje_clave TEXT,
    call_to_action VARCHAR(200),
    
    -- Metadatos
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    es_plantilla BOOLEAN DEFAULT false,
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para ugc_preferences
CREATE INDEX idx_ugc_preferences_user_id ON ugc_preferences(user_id);
CREATE INDEX idx_ugc_preferences_brand_id ON ugc_preferences(brand_id);
CREATE INDEX idx_ugc_preferences_product_id ON ugc_preferences(product_id);
CREATE INDEX idx_ugc_preferences_tipo_contenido ON ugc_preferences(tipo_contenido);
CREATE INDEX idx_ugc_preferences_plataforma ON ugc_preferences(plataforma_principal);
CREATE INDEX idx_ugc_preferences_estado ON ugc_preferences(estado);
CREATE INDEX idx_ugc_preferences_activo ON ugc_preferences(activo);
CREATE INDEX idx_ugc_preferences_creado_en ON ugc_preferences(creado_en);
CREATE INDEX idx_ugc_preferences_estilo_gin ON ugc_preferences USING GIN(estilo_contenido);
CREATE INDEX idx_ugc_preferences_escenarios_gin ON ugc_preferences USING GIN(tipos_escenarios);

-- =====================================================
-- 5. TABLA GENERATION_RESULTS
-- =====================================================
CREATE TABLE generation_results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    ugc_preferences_id INTEGER REFERENCES ugc_preferences(id) ON DELETE SET NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    tipo_contenido VARCHAR(50) NOT NULL,
    plataforma_destino VARCHAR(50) NOT NULL,
    archivos_generados JSONB DEFAULT '[]',
    prompts_utilizados TEXT[],
    configuracion_aplicada JSONB DEFAULT '{}',
    metadatos_generacion JSONB DEFAULT '{}',
    calidad_score DECIMAL(3,2) CHECK (calidad_score >= 0 AND calidad_score <= 10),
    feedback_usuario JSONB DEFAULT '{}',
    estado VARCHAR(20) DEFAULT 'generado' CHECK (estado IN ('generado', 'revisando', 'aprobado', 'rechazado', 'publicado')),
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para generation_results
CREATE INDEX idx_generation_results_user_id ON generation_results(user_id);
CREATE INDEX idx_generation_results_brand_id ON generation_results(brand_id);
CREATE INDEX idx_generation_results_product_id ON generation_results(product_id);
CREATE INDEX idx_generation_results_ugc_preferences_id ON generation_results(ugc_preferences_id);
CREATE INDEX idx_generation_results_tipo ON generation_results(tipo_contenido);
CREATE INDEX idx_generation_results_plataforma ON generation_results(plataforma_destino);
CREATE INDEX idx_generation_results_estado ON generation_results(estado);
CREATE INDEX idx_generation_results_activo ON generation_results(activo);
CREATE INDEX idx_generation_results_creado_en ON generation_results(creado_en);

-- =====================================================
-- 6. FUNCIONES DE ACTUALIZACIÓN AUTOMÁTICA
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brands_updated_at 
    BEFORE UPDATE ON brands 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ugc_preferences_updated_at 
    BEFORE UPDATE ON ugc_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generation_results_updated_at 
    BEFORE UPDATE ON generation_results 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. VISTAS ÚTILES
-- =====================================================

-- Vista para datos completos del usuario
CREATE VIEW user_complete_data AS
SELECT 
    u.id,
    u.user_id,
    u.nombre,
    u.apellido,
    u.correo,
    u.activo,
    u.creado_en,
    b.nombre_marca,
    b.nicho_principal,
    b.publico_objetivo,
    COUNT(p.id) as total_productos,
    COUNT(up.id) as total_preferencias
FROM users u
LEFT JOIN brands b ON u.id = b.user_id AND b.activo = true
LEFT JOIN products p ON u.id = p.user_id AND p.activo = true
LEFT JOIN ugc_preferences up ON u.id = up.user_id AND up.activo = true
WHERE u.activo = true
GROUP BY u.id, u.user_id, u.nombre, u.apellido, u.correo, u.activo, u.creado_en, b.nombre_marca, b.nicho_principal, b.publico_objetivo;

-- Vista para productos con marca
CREATE VIEW products_with_brand AS
SELECT 
    p.id,
    p.nombre_producto,
    p.tipo_producto,
    p.categoria,
    p.subcategoria,
    p.descripcion,
    p.caracteristicas_principales,
    p.beneficios,
    p.imagenes_producto,
    p.estado,
    p.creado_en,
    b.nombre_marca,
    b.nicho_principal,
    u.nombre as usuario_nombre,
    u.correo as usuario_correo
FROM products p
LEFT JOIN brands b ON p.brand_id = b.id
LEFT JOIN users u ON p.user_id = u.id
WHERE p.activo = true;

-- Vista para preferencias UGC completas
CREATE VIEW ugc_preferences_complete AS
SELECT 
    up.id,
    up.tipo_contenido,
    up.plataforma_principal,
    up.frecuencia_generacion,
    up.cantidad_contenido,
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

-- =====================================================
-- 8. COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON TABLE users IS 'Usuarios del sistema UGC - versión ultra simplificada (solo nombre, apellido, correo)';
COMMENT ON TABLE brands IS 'Marcas de los usuarios - datos de identidad visual (sin tipografías)';
COMMENT ON TABLE products IS 'Productos/servicios - versión ultra simplificada con exactamente 4 imágenes obligatorias';
COMMENT ON TABLE ugc_preferences IS 'Preferencias de generación UGC - configuración completa sin campos avanzados';
COMMENT ON TABLE generation_results IS 'Resultados de generación de contenido UGC';

COMMENT ON COLUMN products.imagenes_producto IS 'Array JSON con exactamente 4 URLs de imágenes del producto';
COMMENT ON COLUMN products.tipo_producto IS 'Tipo de producto: producto_fisico, producto_digital, servicio, curso, software, evento, otro';
COMMENT ON COLUMN ugc_preferences.tipo_contenido IS 'Tipo principal de contenido a generar: video, imagen, carousel, story, reel, post, mixto';
COMMENT ON COLUMN ugc_preferences.plataforma_principal IS 'Plataforma objetivo: instagram, tiktok, youtube, facebook, twitter, linkedin, pinterest, snapchat, otro';
COMMENT ON COLUMN ugc_preferences.estilo_contenido IS 'Array de estilos visuales: profesional, casual, minimalista, colorido, vintage, moderno, elegante, divertido';
COMMENT ON COLUMN ugc_preferences.tipos_escenarios IS 'Array de escenarios: hogar, oficina, exterior, gym, cocina, estudio, playa, montana, ciudad, abstracto';

-- =====================================================
-- 9. VERIFICACIÓN DE CREACIÓN
-- =====================================================
DO $$
DECLARE
    table_count INTEGER;
    view_count INTEGER;
    function_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Contar tablas creadas
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    -- Contar vistas creadas
    SELECT COUNT(*) INTO view_count 
    FROM information_schema.views 
    WHERE table_schema = 'public';
    
    -- Contar funciones creadas
    SELECT COUNT(*) INTO function_count 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_type = 'FUNCTION';
    
    -- Contar triggers creados
    SELECT COUNT(*) INTO trigger_count 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public';
    
    RAISE NOTICE 'Creación completada:';
    RAISE NOTICE '- Tablas creadas: %', table_count;
    RAISE NOTICE '- Vistas creadas: %', view_count;
    RAISE NOTICE '- Funciones creadas: %', function_count;
    RAISE NOTICE '- Triggers creados: %', trigger_count;
    
    RAISE NOTICE '✅ Nuevo esquema UGC creado exitosamente';
END $$;

-- =====================================================
-- 10. MENSAJE FINAL
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '🚀 NUEVO ESQUEMA UGC CREADO';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Estructura optimizada para formularios simplificados:';
    RAISE NOTICE '- Users: Solo 3 campos esenciales';
    RAISE NOTICE '- Brands: Sin tipografías, enfoque en identidad visual';
    RAISE NOTICE '- Products: Ultra simplificado, 4 imágenes obligatorias';
    RAISE NOTICE '- UGC Preferences: Configuración completa sin avanzados';
    RAISE NOTICE '- Generation Results: Resultados de generación';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Base de datos lista para usar con los formularios';
    RAISE NOTICE '=====================================================';
END $$;
