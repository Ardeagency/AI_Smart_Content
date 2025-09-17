-- =====================================================
-- MIGRACIÓN COMPLETA A SUPABASE
-- Sistema UGC - Estructura de Base de Datos
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. TABLA USERS
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100),
    correo VARCHAR(255) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    telefono VARCHAR(20),
    acceso VARCHAR(20) DEFAULT 'usuario' CHECK (acceso IN ('admin', 'moderador', 'usuario', 'invitado')),
    activo BOOLEAN DEFAULT true,
    email_verificado BOOLEAN DEFAULT false,
    ultimo_acceso TIMESTAMP,
    marca VARCHAR(100),
    avatar_url VARCHAR(500),
    biografia TEXT,
    sitio_web VARCHAR(255),
    pais VARCHAR(100),
    ciudad VARCHAR(100),
    zona_horaria VARCHAR(50) DEFAULT 'UTC',
    idioma VARCHAR(10) DEFAULT 'es',
    tema VARCHAR(10) DEFAULT 'claro' CHECK (tema IN ('claro', 'oscuro', 'auto')),
    notificaciones_email BOOLEAN DEFAULT true,
    notificaciones_push BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    creado_por VARCHAR(50),
    actualizado_por VARCHAR(50)
);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_correo ON users(correo);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_acceso ON users(acceso);
CREATE INDEX IF NOT EXISTS idx_users_activo ON users(activo);
CREATE INDEX IF NOT EXISTS idx_users_marca ON users(marca);
CREATE INDEX IF NOT EXISTS idx_users_creado_en ON users(creado_en);

-- =====================================================
-- 2. TABLA BRANDS
-- =====================================================
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nombre_marca VARCHAR(200) NOT NULL,
    nicho_principal VARCHAR(100) NOT NULL,
    subnicho VARCHAR(100),
    categorias_asociadas TEXT[],
    publico_objetivo TEXT,
    mercado_sector VARCHAR(100),
    logo_url VARCHAR(500),
    eslogan TEXT,
    paleta_colores JSONB,
    tipografias JSONB,
    identidad_proposito TEXT,
    personalidad_atributos TEXT[],
    tono_comunicacion VARCHAR(50),
    storytelling_filosofia TEXT,
    archivos_adicionales JSONB DEFAULT '[]',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para brands
CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_brands_nicho ON brands(nicho_principal);
CREATE INDEX IF NOT EXISTS idx_brands_mercado ON brands(mercado_sector);
CREATE INDEX IF NOT EXISTS idx_brands_activo ON brands(activo);
CREATE INDEX IF NOT EXISTS idx_brands_creado_en ON brands(creado_en);

-- =====================================================
-- 3. TABLA PRODUCTS
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion_corta TEXT,
    descripcion_larga TEXT,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('producto', 'servicio')),
    categoria VARCHAR(100) NOT NULL,
    imagen_principal_url VARCHAR(500),
    galeria_imagenes JSONB DEFAULT '[]',
    archivos_asociados JSONB DEFAULT '[]',
    atributos_clave JSONB DEFAULT '{}',
    precio DECIMAL(10,2),
    moneda VARCHAR(3) DEFAULT 'MXN',
    stock INTEGER,
    sku VARCHAR(100),
    tags TEXT[],
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    destacado BOOLEAN DEFAULT false,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para products
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_tipo ON products(tipo);
CREATE INDEX IF NOT EXISTS idx_products_categoria ON products(categoria);
CREATE INDEX IF NOT EXISTS idx_products_estado ON products(estado);
CREATE INDEX IF NOT EXISTS idx_products_activo ON products(activo);
CREATE INDEX IF NOT EXISTS idx_products_destacado ON products(destacado);
CREATE INDEX IF NOT EXISTS idx_products_creado_en ON products(creado_en);
CREATE INDEX IF NOT EXISTS idx_products_tags_gin ON products USING GIN(tags);

-- =====================================================
-- 4. TABLA AVATARS
-- =====================================================
CREATE TABLE IF NOT EXISTS avatars (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion_personalidad TEXT,
    descripcion_estilo TEXT,
    imagen_referencia_url VARCHAR(500),
    imagen_referencia_alt TEXT,
    estilo_visual VARCHAR(50) NOT NULL,
    genero VARCHAR(20) CHECK (genero IN ('masculino', 'femenino', 'no_binario', 'otro')),
    edad_aparente INTEGER CHECK (edad_aparente > 0 AND edad_aparente < 100),
    etnia VARCHAR(50),
    roles TEXT[],
    especializaciones TEXT[],
    personalidad_atributos TEXT[],
    configuracion_generacion JSONB DEFAULT '{}',
    prompts_sugeridos TEXT[],
    tags TEXT[],
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para avatars
CREATE INDEX IF NOT EXISTS idx_avatars_user_id ON avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_avatars_brand_id ON avatars(brand_id);
CREATE INDEX IF NOT EXISTS idx_avatars_estilo_visual ON avatars(estilo_visual);
CREATE INDEX IF NOT EXISTS idx_avatars_genero ON avatars(genero);
CREATE INDEX IF NOT EXISTS idx_avatars_estado ON avatars(estado);
CREATE INDEX IF NOT EXISTS idx_avatars_activo ON avatars(activo);
CREATE INDEX IF NOT EXISTS idx_avatars_favorito ON avatars(favorito);
CREATE INDEX IF NOT EXISTS idx_avatars_uso_frecuente ON avatars(uso_frecuente);
CREATE INDEX IF NOT EXISTS idx_avatars_creado_en ON avatars(creado_en);
CREATE INDEX IF NOT EXISTS idx_avatars_roles_gin ON avatars USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_avatars_tags_gin ON avatars USING GIN(tags);

-- =====================================================
-- 5. TABLA VISUAL_RESOURCES
-- =====================================================
CREATE TABLE IF NOT EXISTS visual_resources (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    tipo VARCHAR(50) NOT NULL,
    archivos JSONB DEFAULT '[]',
    urls_externas TEXT[],
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    estilo_grafico VARCHAR(100),
    colores_principales TEXT[],
    emociones TEXT[],
    marcas_referencia TEXT[],
    estilos_aplicados TEXT[],
    duracion_segundos INTEGER,
    resolucion VARCHAR(20),
    formato_archivo VARCHAR(20),
    carpeta VARCHAR(200),
    proyecto VARCHAR(200),
    version VARCHAR(20),
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para visual_resources
CREATE INDEX IF NOT EXISTS idx_visual_resources_user_id ON visual_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_visual_resources_brand_id ON visual_resources(brand_id);
CREATE INDEX IF NOT EXISTS idx_visual_resources_tipo ON visual_resources(tipo);
CREATE INDEX IF NOT EXISTS idx_visual_resources_estilo_grafico ON visual_resources(estilo_grafico);
CREATE INDEX IF NOT EXISTS idx_visual_resources_estado ON visual_resources(estado);
CREATE INDEX IF NOT EXISTS idx_visual_resources_activo ON visual_resources(activo);
CREATE INDEX IF NOT EXISTS idx_visual_resources_favorito ON visual_resources(favorito);
CREATE INDEX IF NOT EXISTS idx_visual_resources_carpeta ON visual_resources(carpeta);
CREATE INDEX IF NOT EXISTS idx_visual_resources_proyecto ON visual_resources(proyecto);
CREATE INDEX IF NOT EXISTS idx_visual_resources_creado_en ON visual_resources(creado_en);
CREATE INDEX IF NOT EXISTS idx_visual_resources_tags_gin ON visual_resources USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_visual_resources_colores_gin ON visual_resources USING GIN(colores_principales);
CREATE INDEX IF NOT EXISTS idx_visual_resources_emociones_gin ON visual_resources USING GIN(emociones);
CREATE INDEX IF NOT EXISTS idx_visual_resources_marcas_gin ON visual_resources USING GIN(marcas_referencia);

-- =====================================================
-- 6. TABLA GENERATION_CONFIGS
-- =====================================================
CREATE TABLE IF NOT EXISTS generation_configs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    tipos_ugc TEXT[] NOT NULL,
    estilos_preferidos TEXT[],
    estilos_personalizados JSONB DEFAULT '{}',
    formatos_salida JSONB NOT NULL DEFAULT '{}',
    idiomas TEXT[] DEFAULT '{"es"}',
    region VARCHAR(50) DEFAULT 'MX',
    plataformas_objetivo TEXT[] NOT NULL,
    config_videos JSONB DEFAULT '{}',
    config_imagenes JSONB DEFAULT '{}',
    config_copies JSONB DEFAULT '{}',
    config_guiones JSONB DEFAULT '{}',
    modelo_ia VARCHAR(100) DEFAULT 'gpt-4',
    prompts_base TEXT[],
    configuracion_ia JSONB DEFAULT '{}',
    filtros_contenido JSONB DEFAULT '{}',
    restricciones_etica JSONB DEFAULT '{}',
    palabras_clave_evitar TEXT[],
    aplicar_identidad_marca BOOLEAN DEFAULT true,
    incluir_logo BOOLEAN DEFAULT true,
    usar_paleta_colores BOOLEAN DEFAULT true,
    usar_tipografias BOOLEAN DEFAULT true,
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    es_plantilla BOOLEAN DEFAULT false,
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para generation_configs
CREATE INDEX IF NOT EXISTS idx_generation_configs_user_id ON generation_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_configs_brand_id ON generation_configs(brand_id);
CREATE INDEX IF NOT EXISTS idx_generation_configs_estado ON generation_configs(estado);
CREATE INDEX IF NOT EXISTS idx_generation_configs_activo ON generation_configs(activo);
CREATE INDEX IF NOT EXISTS idx_generation_configs_es_plantilla ON generation_configs(es_plantilla);
CREATE INDEX IF NOT EXISTS idx_generation_configs_favorito ON generation_configs(favorito);
CREATE INDEX IF NOT EXISTS idx_generation_configs_creado_en ON generation_configs(creado_en);
CREATE INDEX IF NOT EXISTS idx_generation_configs_tipos_ugc_gin ON generation_configs USING GIN(tipos_ugc);
CREATE INDEX IF NOT EXISTS idx_generation_configs_estilos_gin ON generation_configs USING GIN(estilos_preferidos);
CREATE INDEX IF NOT EXISTS idx_generation_configs_idiomas_gin ON generation_configs USING GIN(idiomas);
CREATE INDEX IF NOT EXISTS idx_generation_configs_plataformas_gin ON generation_configs USING GIN(plataformas_objetivo);

-- =====================================================
-- 7. TABLA GENERATION_RESULTS
-- =====================================================
CREATE TABLE IF NOT EXISTS generation_results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
    generation_config_id INTEGER REFERENCES generation_configs(id) ON DELETE SET NULL,
    request_id VARCHAR(100) UNIQUE NOT NULL,
    tipo_resultado VARCHAR(50) NOT NULL,
    subtipo VARCHAR(50),
    titulo VARCHAR(200),
    descripcion TEXT,
    contenido_texto TEXT,
    contenido_metadata JSONB DEFAULT '{}',
    archivos_generados JSONB DEFAULT '[]',
    archivos_originales JSONB DEFAULT '[]',
    archivos_procesados JSONB DEFAULT '[]',
    resolucion VARCHAR(20),
    duracion_segundos INTEGER,
    tamaño_archivo BIGINT,
    formato VARCHAR(20),
    calidad VARCHAR(20),
    estilo_aplicado VARCHAR(100),
    configuracion_usada JSONB DEFAULT '{}',
    prompts_usados TEXT[],
    plataformas_destino TEXT[],
    idioma VARCHAR(10) DEFAULT 'es',
    region VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'generado' CHECK (estado IN ('generando', 'generado', 'error', 'procesando')),
    calificacion INTEGER CHECK (calificacion >= 1 AND calificacion <= 5),
    favorito BOOLEAN DEFAULT false,
    descartado BOOLEAN DEFAULT false,
    feedback TEXT,
    veces_usado INTEGER DEFAULT 0,
    veces_compartido INTEGER DEFAULT 0,
    veces_descargado INTEGER DEFAULT 0,
    modelo_ia_usado VARCHAR(100),
    tiempo_generacion_segundos INTEGER,
    costo_generacion DECIMAL(10,4),
    tokens_usados INTEGER,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_uso TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para generation_results
CREATE INDEX IF NOT EXISTS idx_generation_results_user_id ON generation_results(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_brand_id ON generation_results(brand_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_product_id ON generation_results(product_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_avatar_id ON generation_results(avatar_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_config_id ON generation_results(generation_config_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_request_id ON generation_results(request_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_tipo ON generation_results(tipo_resultado);
CREATE INDEX IF NOT EXISTS idx_generation_results_estado ON generation_results(estado);
CREATE INDEX IF NOT EXISTS idx_generation_results_activo ON generation_results(activo);
CREATE INDEX IF NOT EXISTS idx_generation_results_favorito ON generation_results(favorito);
CREATE INDEX IF NOT EXISTS idx_generation_results_descartado ON generation_results(descartado);
CREATE INDEX IF NOT EXISTS idx_generation_results_calificacion ON generation_results(calificacion);
CREATE INDEX IF NOT EXISTS idx_generation_results_creado_en ON generation_results(creado_en);
CREATE INDEX IF NOT EXISTS idx_generation_results_plataformas_gin ON generation_results USING GIN(plataformas_destino);
CREATE INDEX IF NOT EXISTS idx_generation_results_prompts_gin ON generation_results USING GIN(prompts_usados);

-- =====================================================
-- 8. FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar automáticamente el campo actualizado_en
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar automáticamente actualizado_en
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brands_updated_at 
    BEFORE UPDATE ON brands 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_avatars_updated_at 
    BEFORE UPDATE ON avatars 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visual_resources_updated_at 
    BEFORE UPDATE ON visual_resources 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generation_configs_updated_at 
    BEFORE UPDATE ON generation_configs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generation_results_updated_at 
    BEFORE UPDATE ON generation_results 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 9. COMENTARIOS EN TABLAS Y COLUMNAS
-- =====================================================

-- Comentarios para tabla users
COMMENT ON TABLE users IS 'Tabla principal para almacenar perfiles de usuario del sistema UGC';
COMMENT ON COLUMN users.user_id IS 'Identificador único del usuario (UUID o string personalizado)';
COMMENT ON COLUMN users.nombre IS 'Nombre del usuario';
COMMENT ON COLUMN users.correo IS 'Correo electrónico único del usuario';
COMMENT ON COLUMN users.contrasena IS 'Hash de la contraseña del usuario';
COMMENT ON COLUMN users.acceso IS 'Nivel de acceso del usuario en el sistema';
COMMENT ON COLUMN users.marca IS 'Marca asociada al usuario';
COMMENT ON COLUMN users.ultimo_acceso IS 'Timestamp del último acceso del usuario';

-- Comentarios para tabla brands
COMMENT ON TABLE brands IS 'Tabla para almacenar información completa de marcas del sistema UGC';
COMMENT ON COLUMN brands.user_id IS 'ID del usuario propietario de la marca';
COMMENT ON COLUMN brands.nombre_marca IS 'Nombre de la marca';
COMMENT ON COLUMN brands.nicho_principal IS 'Nicho principal de la marca (salud, fitness, moda, etc.)';
COMMENT ON COLUMN brands.subnicho IS 'Subnicho o vertical específico';
COMMENT ON COLUMN brands.categorias_asociadas IS 'Array de categorías asociadas (B2C, B2B, retail, etc.)';
COMMENT ON COLUMN brands.publico_objetivo IS 'Descripción del público objetivo';
COMMENT ON COLUMN brands.mercado_sector IS 'Mercado o sector (lujo, masivo, nicho especializado)';
COMMENT ON COLUMN brands.paleta_colores IS 'Paleta de colores en formato JSON';
COMMENT ON COLUMN brands.tipografias IS 'Tipografías oficiales en formato JSON';
COMMENT ON COLUMN brands.personalidad_atributos IS 'Array de atributos de personalidad de la marca';
COMMENT ON COLUMN brands.archivos_adicionales IS 'Array de archivos adicionales (manuales, guidelines, etc.)';

-- Comentarios para tabla products
COMMENT ON TABLE products IS 'Tabla para almacenar biblioteca de productos y servicios';
COMMENT ON COLUMN products.user_id IS 'ID del usuario propietario del producto';
COMMENT ON COLUMN products.brand_id IS 'ID de la marca asociada al producto';
COMMENT ON COLUMN products.nombre IS 'Nombre del producto o servicio';
COMMENT ON COLUMN products.tipo IS 'Tipo: producto o servicio';
COMMENT ON COLUMN products.categoria IS 'Categoría del producto (alimentación, moda, tecnología, etc.)';
COMMENT ON COLUMN products.galeria_imagenes IS 'Array de URLs de imágenes del producto';
COMMENT ON COLUMN products.archivos_asociados IS 'Array de archivos asociados (PDF, fichas técnicas, etc.)';
COMMENT ON COLUMN products.atributos_clave IS 'Atributos clave del producto en formato JSON';
COMMENT ON COLUMN products.tags IS 'Array de tags para búsqueda y filtrado';

-- Comentarios para tabla avatars
COMMENT ON TABLE avatars IS 'Tabla para almacenar avatares digitales y modelos IA';
COMMENT ON COLUMN avatars.user_id IS 'ID del usuario propietario del avatar';
COMMENT ON COLUMN avatars.brand_id IS 'ID de la marca asociada al avatar';
COMMENT ON COLUMN avatars.nombre IS 'Nombre del avatar';
COMMENT ON COLUMN avatars.descripcion_personalidad IS 'Descripción de la personalidad del avatar';
COMMENT ON COLUMN avatars.estilo_visual IS 'Estilo visual del avatar (realista, cartoon, 3D, etc.)';
COMMENT ON COLUMN avatars.roles IS 'Array de roles que puede representar el avatar';
COMMENT ON COLUMN avatars.especializaciones IS 'Array de especializaciones del avatar';
COMMENT ON COLUMN avatars.configuracion_generacion IS 'Configuraciones específicas para generación con IA';
COMMENT ON COLUMN avatars.prompts_sugeridos IS 'Array de prompts sugeridos para este avatar';
COMMENT ON COLUMN avatars.uso_frecuente IS 'Contador de veces que se ha usado este avatar';

-- Comentarios para tabla visual_resources
COMMENT ON TABLE visual_resources IS 'Tabla para almacenar recursos y referencias visuales';
COMMENT ON COLUMN visual_resources.user_id IS 'ID del usuario propietario del recurso';
COMMENT ON COLUMN visual_resources.brand_id IS 'ID de la marca asociada al recurso';
COMMENT ON COLUMN visual_resources.tipo IS 'Tipo de recurso (moodboard, carpeta_ejemplos, referencia_estilo, multimedia)';
COMMENT ON COLUMN visual_resources.archivos IS 'Array de archivos del recurso';
COMMENT ON COLUMN visual_resources.estilo_grafico IS 'Estilo gráfico del recurso';
COMMENT ON COLUMN visual_resources.colores_principales IS 'Array de colores principales del recurso';
COMMENT ON COLUMN visual_resources.emociones IS 'Array de emociones que evoca el recurso';
COMMENT ON COLUMN visual_resources.marcas_referencia IS 'Array de marcas de referencia';
COMMENT ON COLUMN visual_resources.uso_frecuente IS 'Contador de veces que se ha usado este recurso';

-- Comentarios para tabla generation_configs
COMMENT ON TABLE generation_configs IS 'Tabla para configuraciones de generación automática de UGC';
COMMENT ON COLUMN generation_configs.user_id IS 'ID del usuario propietario de la configuración';
COMMENT ON COLUMN generation_configs.brand_id IS 'ID de la marca asociada a la configuración';
COMMENT ON COLUMN generation_configs.tipos_ugc IS 'Array de tipos de UGC a generar';
COMMENT ON COLUMN generation_configs.estilos_preferidos IS 'Array de estilos preferidos (Nike, Apple, etc.)';
COMMENT ON COLUMN generation_configs.formatos_salida IS 'Formatos de salida en formato JSON';
COMMENT ON COLUMN generation_configs.plataformas_objetivo IS 'Array de plataformas objetivo';
COMMENT ON COLUMN generation_configs.config_videos IS 'Configuraciones específicas para videos';
COMMENT ON COLUMN generation_configs.config_imagenes IS 'Configuraciones específicas para imágenes';
COMMENT ON COLUMN generation_configs.config_copies IS 'Configuraciones específicas para copies';
COMMENT ON COLUMN generation_configs.config_guiones IS 'Configuraciones específicas para guiones';
COMMENT ON COLUMN generation_configs.es_plantilla IS 'Indica si es una plantilla reutilizable';

-- Comentarios para tabla generation_results
COMMENT ON TABLE generation_results IS 'Tabla para almacenar historial de resultados generados';
COMMENT ON COLUMN generation_results.user_id IS 'ID del usuario propietario del resultado';
COMMENT ON COLUMN generation_results.brand_id IS 'ID de la marca asociada al resultado';
COMMENT ON COLUMN generation_results.product_id IS 'ID del producto/servicio asociado';
COMMENT ON COLUMN generation_results.avatar_id IS 'ID del avatar utilizado';
COMMENT ON COLUMN generation_results.generation_config_id IS 'ID de la configuración utilizada';
COMMENT ON COLUMN generation_results.request_id IS 'ID único del request de generación';
COMMENT ON COLUMN generation_results.tipo_resultado IS 'Tipo de resultado generado';
COMMENT ON COLUMN generation_results.archivos_generados IS 'Array de archivos generados';
COMMENT ON COLUMN generation_results.estilo_aplicado IS 'Estilo aplicado en la generación';
COMMENT ON COLUMN generation_results.configuracion_usada IS 'Configuración específica utilizada';
COMMENT ON COLUMN generation_results.prompts_usados IS 'Array de prompts utilizados';
COMMENT ON COLUMN generation_results.calificacion IS 'Calificación del usuario (1-5 estrellas)';
COMMENT ON COLUMN generation_results.veces_usado IS 'Contador de veces que se ha usado';
COMMENT ON COLUMN generation_results.costo_generacion IS 'Costo de la generación';
COMMENT ON COLUMN generation_results.tokens_usados IS 'Número de tokens de IA utilizados';

-- =====================================================
-- 10. POLÍTICAS RLS (ROW LEVEL SECURITY) PARA SUPABASE
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_results ENABLE ROW LEVEL SECURITY;

-- Políticas para users (solo el usuario puede ver/editar sus propios datos)
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own profile" ON users
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Políticas para brands (solo el propietario puede ver/editar sus marcas)
CREATE POLICY "Users can view own brands" ON brands
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can insert own brands" ON brands
    FOR INSERT WITH CHECK (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update own brands" ON brands
    FOR UPDATE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete own brands" ON brands
    FOR DELETE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

-- Políticas para products (solo el propietario puede ver/editar sus productos)
CREATE POLICY "Users can view own products" ON products
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can insert own products" ON products
    FOR INSERT WITH CHECK (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update own products" ON products
    FOR UPDATE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete own products" ON products
    FOR DELETE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

-- Políticas para avatars (solo el propietario puede ver/editar sus avatares)
CREATE POLICY "Users can view own avatars" ON avatars
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can insert own avatars" ON avatars
    FOR INSERT WITH CHECK (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update own avatars" ON avatars
    FOR UPDATE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete own avatars" ON avatars
    FOR DELETE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

-- Políticas para visual_resources (solo el propietario puede ver/editar sus recursos)
CREATE POLICY "Users can view own visual resources" ON visual_resources
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can insert own visual resources" ON visual_resources
    FOR INSERT WITH CHECK (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update own visual resources" ON visual_resources
    FOR UPDATE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete own visual resources" ON visual_resources
    FOR DELETE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

-- Políticas para generation_configs (solo el propietario puede ver/editar sus configuraciones)
CREATE POLICY "Users can view own generation configs" ON generation_configs
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can insert own generation configs" ON generation_configs
    FOR INSERT WITH CHECK (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update own generation configs" ON generation_configs
    FOR UPDATE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete own generation configs" ON generation_configs
    FOR DELETE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

-- Políticas para generation_results (solo el propietario puede ver/editar sus resultados)
CREATE POLICY "Users can view own generation results" ON generation_results
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can insert own generation results" ON generation_results
    FOR INSERT WITH CHECK (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update own generation results" ON generation_results
    FOR UPDATE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete own generation results" ON generation_results
    FOR DELETE USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));

-- =====================================================
-- 11. FUNCIONES AUXILIARES PARA SUPABASE
-- =====================================================

-- Función para obtener estadísticas de usuario
CREATE OR REPLACE FUNCTION get_user_stats(user_uuid TEXT)
RETURNS JSON AS $$
DECLARE
    user_id INTEGER;
    stats JSON;
BEGIN
    -- Obtener el ID del usuario
    SELECT id INTO user_id FROM users WHERE users.user_id = user_uuid;
    
    IF user_id IS NULL THEN
        RETURN '{"error": "Usuario no encontrado"}'::JSON;
    END IF;
    
    -- Calcular estadísticas
    SELECT json_build_object(
        'total_brands', (SELECT COUNT(*) FROM brands WHERE brands.user_id = user_id AND activo = true),
        'total_products', (SELECT COUNT(*) FROM products WHERE products.user_id = user_id AND activo = true),
        'total_avatars', (SELECT COUNT(*) FROM avatars WHERE avatars.user_id = user_id AND activo = true),
        'total_visual_resources', (SELECT COUNT(*) FROM visual_resources WHERE visual_resources.user_id = user_id AND activo = true),
        'total_generation_configs', (SELECT COUNT(*) FROM generation_configs WHERE generation_configs.user_id = user_id AND activo = true),
        'total_generation_results', (SELECT COUNT(*) FROM generation_results WHERE generation_results.user_id = user_id AND activo = true)
    ) INTO stats;
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para buscar productos por tags
CREATE OR REPLACE FUNCTION search_products_by_tags(tags_array TEXT[], user_uuid TEXT)
RETURNS TABLE(
    id INTEGER,
    nombre VARCHAR(200),
    descripcion_corta TEXT,
    tipo VARCHAR(20),
    categoria VARCHAR(100),
    tags TEXT[],
    creado_en TIMESTAMP
) AS $$
DECLARE
    user_id INTEGER;
BEGIN
    -- Obtener el ID del usuario
    SELECT id INTO user_id FROM users WHERE users.user_id = user_uuid;
    
    IF user_id IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        p.id,
        p.nombre,
        p.descripcion_corta,
        p.tipo,
        p.categoria,
        p.tags,
        p.creado_en
    FROM products p
    WHERE p.user_id = user_id 
    AND p.activo = true
    AND p.tags && tags_array
    ORDER BY p.creado_en DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 12. VISTAS ÚTILES PARA SUPABASE
-- =====================================================

-- Vista para dashboard del usuario
CREATE OR REPLACE VIEW user_dashboard AS
SELECT 
    u.id as user_id,
    u.nombre,
    u.apellido,
    u.correo,
    u.marca,
    COUNT(DISTINCT b.id) as total_brands,
    COUNT(DISTINCT p.id) as total_products,
    COUNT(DISTINCT a.id) as total_avatars,
    COUNT(DISTINCT vr.id) as total_visual_resources,
    COUNT(DISTINCT gc.id) as total_generation_configs,
    COUNT(DISTINCT gr.id) as total_generation_results
FROM users u
LEFT JOIN brands b ON u.id = b.user_id AND b.activo = true
LEFT JOIN products p ON u.id = p.user_id AND p.activo = true
LEFT JOIN avatars a ON u.id = a.user_id AND a.activo = true
LEFT JOIN visual_resources vr ON u.id = vr.user_id AND vr.activo = true
LEFT JOIN generation_configs gc ON u.id = gc.user_id AND gc.activo = true
LEFT JOIN generation_results gr ON u.id = gr.user_id AND gr.activo = true
WHERE u.activo = true
GROUP BY u.id, u.nombre, u.apellido, u.correo, u.marca;

-- Vista para estadísticas de generación
CREATE OR REPLACE VIEW generation_stats AS
SELECT 
    u.id as user_id,
    u.nombre,
    COUNT(gr.id) as total_generations,
    COUNT(CASE WHEN gr.estado = 'generado' THEN 1 END) as successful_generations,
    COUNT(CASE WHEN gr.estado = 'error' THEN 1 END) as failed_generations,
    AVG(gr.calificacion) as average_rating,
    SUM(gr.veces_usado) as total_usage,
    SUM(gr.costo_generacion) as total_cost
FROM users u
LEFT JOIN generation_results gr ON u.id = gr.user_id AND gr.activo = true
WHERE u.activo = true
GROUP BY u.id, u.nombre;

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Migración a Supabase completada exitosamente';
    RAISE NOTICE '📊 Tablas creadas: 7';
    RAISE NOTICE '🔍 Índices creados: 50+';
    RAISE NOTICE '🔒 Políticas RLS: Habilitadas';
    RAISE NOTICE '⚡ Triggers: Configurados';
    RAISE NOTICE '📋 Vistas: Creadas';
    RAISE NOTICE '🔧 Funciones: Disponibles';
END $$;
