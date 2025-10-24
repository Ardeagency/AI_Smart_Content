-- Script para configurar el bucket de imágenes UGC en Supabase Storage
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Crear el bucket 'ugc' si no existe (privado para usuarios autenticados)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ugc',
    'ugc',
    false, -- Bucket privado (no público)
    52428800, -- Límite de 50MB por archivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

-- 2. Crear política RLS para permitir lectura a usuarios autenticados
CREATE POLICY "Authenticated users can view" ON storage.objects
FOR SELECT USING (
    bucket_id = 'ugc' 
    AND auth.role() = 'authenticated'
);

-- 3. Crear política para permitir subida de archivos a usuarios autenticados
CREATE POLICY "Authenticated users can upload" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'ugc' 
    AND auth.role() = 'authenticated'
);

-- 4. Crear política para permitir actualización de archivos a usuarios autenticados
CREATE POLICY "Authenticated users can update" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'ugc' 
    AND auth.role() = 'authenticated'
);

-- 5. Crear política para permitir eliminación de archivos a usuarios autenticados
CREATE POLICY "Authenticated users can delete" ON storage.objects
FOR DELETE USING (
    bucket_id = 'ugc' 
    AND auth.role() = 'authenticated'
);

-- Verificar que el bucket se creó correctamente
SELECT * FROM storage.buckets WHERE id = 'ugc';
