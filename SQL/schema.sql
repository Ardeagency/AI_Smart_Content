/**
 * AI Smart Content - Database Schema
 * Esquema completo de base de datos para Supabase
 * 
 * Este archivo contiene todas las tablas, tipos, funciones y políticas
 * necesarias para la plataforma AI Smart Content
 */

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

-- Tipo de producto
CREATE TYPE tipo_producto_enum AS ENUM (
    'bebida', 'bebida_alcoholica', 'agua', 'energetica', 'alimento', 'snack', 'suplemento_alimenticio',
    'cosmetico', 'skincare', 'maquillaje', 'perfume', 'cuidado_cabello', 'cuidado_personal', 'higiene',
    'app', 'electronico', 'smartphone', 'tablet', 'accesorio_tech', 'gadget',
    'ropa', 'calzado', 'accesorio_moda', 'reloj', 'joyeria',
    'suplemento', 'vitamina', 'fitness', 'bienestar', 'salud',
    'hogar', 'decoracion', 'mueble', 'electrodomestico',
    'servicio', 'educacion', 'financiero', 'salud_servicio', 'entretenimiento',
    'libro', 'juego', 'juguete', 'automotriz', 'deportivo', 'otro'
);

-- Tono de voz
CREATE TYPE tono_voz_enum AS ENUM (
    'amigable', 'premium', 'tecnico', 'irreverente', 'divertido', 'profesional',
    'casual', 'inspirador', 'autoritario', 'empatico', 'humoristico', 'serio',
    'joven', 'tradicional', 'innovador', 'calido', 'directo', 'poetico',
    'energico', 'tranquilo'
);

-- Plan de suscripción
CREATE TYPE plan_tipo_enum AS ENUM ('basico', 'pro', 'enterprise');

-- Estado de suscripción
CREATE TYPE subscription_status_enum AS ENUM ('active', 'cancelled', 'expired', 'pending');

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

-- Tabla de usuarios (extiende auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    plan_type plan_tipo_enum DEFAULT 'basico',
    credits_available INTEGER DEFAULT 0,
    credits_total INTEGER DEFAULT 0
);

-- Tabla de proyectos/marcas
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    nombre_marca TEXT NOT NULL,
    sitio_web TEXT,
    instagram_url TEXT,
    tiktok_url TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Tabla de mercados objetivo (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS public.project_markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    market_code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, market_code)
);

-- Tabla de idiomas (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS public.project_languages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, language_code)
);

-- Tabla de lineamientos de marca
CREATE TABLE IF NOT EXISTS public.brand_guidelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tono_voz tono_voz_enum NOT NULL,
    palabras_usar TEXT,
    reglas_creativas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id)
);

-- Tabla de palabras a evitar (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS public.brand_words_to_avoid (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_guideline_id UUID NOT NULL REFERENCES public.brand_guidelines(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_guideline_id, word)
);

-- Tabla de archivos de identidad de marca
CREATE TABLE IF NOT EXISTS public.brand_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tipo_producto tipo_producto_enum NOT NULL,
    nombre_producto TEXT NOT NULL,
    descripcion_producto TEXT NOT NULL,
    beneficio_1 TEXT,
    beneficio_2 TEXT,
    beneficio_3 TEXT,
    diferenciacion TEXT,
    modo_uso TEXT,
    ingredientes TEXT,
    precio_producto DECIMAL(10, 2),
    moneda TEXT DEFAULT 'USD',
    variantes_producto TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de imágenes de producto
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type TEXT NOT NULL, -- 'principal', 'secundaria', 'detalle', 'contexto'
    image_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de campañas
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    oferta_desc TEXT,
    audiencia_desc TEXT NOT NULL,
    intenciones TEXT,
    objetivo_principal TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de suscripciones
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_type plan_tipo_enum NOT NULL,
    status subscription_status_enum DEFAULT 'pending',
    credits_included INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de uso de créditos
CREATE TABLE IF NOT EXISTS public.credit_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credits_used INTEGER NOT NULL,
    operation_type TEXT NOT NULL, -- 'generation', 'export', 'premium_feature'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_markets_project_id ON public.project_markets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_languages_project_id ON public.project_languages(project_id);
CREATE INDEX IF NOT EXISTS idx_brand_guidelines_project_id ON public.brand_guidelines(project_id);
CREATE INDEX IF NOT EXISTS idx_brand_files_project_id ON public.brand_files(project_id);
CREATE INDEX IF NOT EXISTS idx_products_project_id ON public.products(project_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_project_id ON public.campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_usage_user_id ON public.credit_usage(user_id);

-- ============================================
-- FUNCIONES
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brand_guidelines_updated_at BEFORE UPDATE ON public.brand_guidelines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para crear usuario en public.users cuando se crea en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear usuario automáticamente
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función para verificar y descontar créditos
CREATE OR REPLACE FUNCTION use_credits(
    p_user_id UUID,
    p_credits_needed INTEGER,
    p_operation_type TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available_credits INTEGER;
BEGIN
    -- Obtener créditos disponibles
    SELECT credits_available INTO v_available_credits
    FROM public.users
    WHERE id = p_user_id;

    -- Verificar si hay suficientes créditos
    IF v_available_credits < p_credits_needed THEN
        RETURN FALSE;
    END IF;

    -- Descontar créditos
    UPDATE public.users
    SET credits_available = credits_available - p_credits_needed
    WHERE id = p_user_id;

    -- Registrar uso
    INSERT INTO public.credit_usage (user_id, credits_used, operation_type, description)
    VALUES (p_user_id, p_credits_needed, p_operation_type, p_description);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_words_to_avoid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;

-- Políticas para users
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Políticas para projects
CREATE POLICY "Users can view own projects"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);

-- Políticas para project_markets
CREATE POLICY "Users can manage own project markets"
    ON public.project_markets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_markets.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para project_languages
CREATE POLICY "Users can manage own project languages"
    ON public.project_languages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_languages.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para brand_guidelines
CREATE POLICY "Users can manage own brand guidelines"
    ON public.brand_guidelines FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = brand_guidelines.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para brand_words_to_avoid
CREATE POLICY "Users can manage own brand words to avoid"
    ON public.brand_words_to_avoid FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.brand_guidelines
            JOIN public.projects ON projects.id = brand_guidelines.project_id
            WHERE brand_guidelines.id = brand_words_to_avoid.brand_guideline_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para brand_files
CREATE POLICY "Users can manage own brand files"
    ON public.brand_files FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = brand_files.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para products
CREATE POLICY "Users can manage own products"
    ON public.products FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = products.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para product_images
CREATE POLICY "Users can manage own product images"
    ON public.product_images FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.products
            JOIN public.projects ON projects.id = products.project_id
            WHERE products.id = product_images.product_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para campaigns
CREATE POLICY "Users can manage own campaigns"
    ON public.campaigns FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = campaigns.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Políticas para subscriptions
CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subscriptions"
    ON public.subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Políticas para credit_usage
CREATE POLICY "Users can view own credit usage"
    ON public.credit_usage FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================
-- COMENTARIOS
-- ============================================

COMMENT ON TABLE public.users IS 'Usuarios de la plataforma (extiende auth.users)';
COMMENT ON TABLE public.projects IS 'Proyectos/Marcas de los usuarios';
COMMENT ON TABLE public.project_markets IS 'Mercados objetivo de cada proyecto';
COMMENT ON TABLE public.project_languages IS 'Idiomas para contenido de cada proyecto';
COMMENT ON TABLE public.brand_guidelines IS 'Lineamientos de marca';
COMMENT ON TABLE public.brand_words_to_avoid IS 'Palabras a evitar en la comunicación';
COMMENT ON TABLE public.brand_files IS 'Archivos de identidad de marca';
COMMENT ON TABLE public.products IS 'Productos principales de cada proyecto';
COMMENT ON TABLE public.product_images IS 'Imágenes de productos';
COMMENT ON TABLE public.campaigns IS 'Campañas de marketing';
COMMENT ON TABLE public.subscriptions IS 'Suscripciones y planes de los usuarios';
COMMENT ON TABLE public.credit_usage IS 'Registro de uso de créditos';

