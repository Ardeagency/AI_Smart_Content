/**
 * AI Smart Content - Storage Buckets
 * Configuración de buckets de almacenamiento en Supabase Storage
 */

-- ============================================
-- BUCKETS
-- ============================================

-- Bucket para logos de marca
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brand-logos',
    'brand-logos',
    true,
    5242880, -- 5MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket para archivos de identidad de marca
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brand-files',
    'brand-files',
    true,
    10485760, -- 10MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket para imágenes de productos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket para contenido generado por IA (producción automatizada)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'production-outputs',
    'production-outputs',
    true,
    10485760, -- 10MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- POLÍTICAS DE STORAGE
-- ============================================

-- Políticas para brand-logos
CREATE POLICY "Users can upload own brand logos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'brand-logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own brand logos"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'brand-logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own brand logos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'brand-logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Políticas para brand-files
CREATE POLICY "Users can upload own brand files"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'brand-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own brand files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'brand-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own brand files"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'brand-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Políticas para product-images
CREATE POLICY "Users can upload own product images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'product-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own product images"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'product-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own product images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'product-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Políticas para production-outputs
CREATE POLICY "Users can upload to production-outputs"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'production-outputs'
);

CREATE POLICY "Users can view production-outputs"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'production-outputs'
);

CREATE POLICY "Users can delete from production-outputs"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'production-outputs'
);
