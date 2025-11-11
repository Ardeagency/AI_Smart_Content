/**
 * SQL Script: Agregar columna form_verified a public.users
 * 
 * Esta columna indica si el usuario ha completado el formulario de registro.
 * Si form_verified = false o NULL, el usuario debe ser redirigido al formulario.
 * 
 * Ejecutar este script en el SQL Editor de Supabase si la columna no existe.
 */

-- Agregar columna form_verified si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'form_verified'
    ) THEN
        ALTER TABLE public.users
        ADD COLUMN form_verified BOOLEAN DEFAULT FALSE NOT NULL;
        
        -- Comentario para documentación
        COMMENT ON COLUMN public.users.form_verified IS 'Indica si el usuario ha completado el formulario de registro de datos (form-record.html). Si es false, el usuario debe ser redirigido al formulario.';
        
        RAISE NOTICE 'Columna form_verified agregada exitosamente';
    ELSE
        RAISE NOTICE 'La columna form_verified ya existe';
    END IF;
END $$;

-- Actualizar usuarios existentes que ya tienen proyectos (asumimos que completaron el formulario)
UPDATE public.users
SET form_verified = TRUE
WHERE id IN (
    SELECT DISTINCT user_id 
    FROM public.projects
)
AND (form_verified IS NULL OR form_verified = FALSE);

-- Crear índice para mejorar rendimiento en consultas
CREATE INDEX IF NOT EXISTS idx_users_form_verified 
ON public.users(form_verified) 
WHERE form_verified = FALSE;

