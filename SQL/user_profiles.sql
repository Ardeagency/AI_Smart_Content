/**
 * AI Smart Content - User Profiles Table
 * Tabla user_profiles para compatibilidad con el sistema de autenticación
 * 
 * Esta tabla extiende auth.users con información adicional del perfil
 */

-- Crear tabla user_profiles si no existe
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone_number TEXT,
    email_verified BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar foreign key a auth.users si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_profiles_id_fkey'
    ) THEN
        ALTER TABLE public.user_profiles
        ADD CONSTRAINT user_profiles_id_fkey 
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Habilitar RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
    ON public.user_profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Índice para búsquedas por email
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Función para actualizar updated_at automáticamente
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentario
COMMENT ON TABLE public.user_profiles IS 'Perfiles extendidos de usuarios (compatibilidad con sistema de autenticación)';

