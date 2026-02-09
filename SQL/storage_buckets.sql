/**
 * AI Smart Content - Storage Buckets
 * Referencia de los buckets ya creados en Supabase (alineado con la UI).
 * visual-references, production-outputs, production-inputs, ai-knowledge, brand-core, brand-logos, product-images
 */

-- ============================================
-- BUCKETS (ON CONFLICT DO NOTHING por si ya existen)
-- ============================================

-- Logos de marca (PUBLIC)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brand-logos',
    'brand-logos',
    true,
    5242880, -- 5 MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Archivos e identidad de marca (brand-core en UI)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brand-core',
    'brand-core',
    false,
    52428800, -- 50 MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Imágenes de productos (PUBLIC)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5 MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Salidas de producción / contenido generado (PUBLIC)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'production-outputs',
    'production-outputs',
    true,
    52428800, -- 50 MB
    NULL  -- Any (según UI)
)
ON CONFLICT (id) DO NOTHING;

-- Entradas de producción (inputs para flujos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'production-inputs',
    'production-inputs',
    false,
    52428800, -- 50 MB
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- Referencias visuales (PUBLIC, tabla visual_references)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'visual-references',
    'visual-references',
    true,
    52428800, -- 50 MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Conocimiento IA
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ai-knowledge',
    'ai-knowledge',
    false,
    20971520, -- 20 MB
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- POLÍTICAS DE STORAGE (ajustar según auth.uid() o organization)
-- ============================================

-- brand-logos: path = {brand_container_id}/{filename}; solo dueño del brand_container (brand_containers.user_id)
-- Ver también SQL/storage-policies-brand-logos.sql para aplicar solo estas políticas.
CREATE POLICY "brand_logos_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'brand-logos' AND
    EXISTS (
        SELECT 1 FROM public.brand_containers bc
        WHERE bc.id::text = (storage.foldername(name))[1] AND bc.user_id = auth.uid()
    )
);

CREATE POLICY "brand_logos_select"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'brand-logos' AND
    EXISTS (
        SELECT 1 FROM public.brand_containers bc
        WHERE bc.id::text = (storage.foldername(name))[1] AND bc.user_id = auth.uid()
    )
);

CREATE POLICY "brand_logos_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-logos' AND EXISTS (SELECT 1 FROM public.brand_containers bc WHERE bc.id::text = (storage.foldername(name))[1] AND bc.user_id = auth.uid()))
WITH CHECK (bucket_id = 'brand-logos' AND EXISTS (SELECT 1 FROM public.brand_containers bc WHERE bc.id::text = (storage.foldername(name))[1] AND bc.user_id = auth.uid()));

CREATE POLICY "brand_logos_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'brand-logos' AND
    EXISTS (
        SELECT 1 FROM public.brand_containers bc
        WHERE bc.id::text = (storage.foldername(name))[1] AND bc.user_id = auth.uid()
    )
);

-- brand-core: archivos de marca por usuario/org
CREATE POLICY "Users can upload to brand-core"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'brand-core');

CREATE POLICY "Users can view brand-core"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-core');

CREATE POLICY "Users can delete from brand-core"
ON storage.objects FOR DELETE
USING (bucket_id = 'brand-core');

-- product-images
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

-- production-outputs
CREATE POLICY "Users can upload to production-outputs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'production-outputs');

CREATE POLICY "Users can view production-outputs"
ON storage.objects FOR SELECT
USING (bucket_id = 'production-outputs');

CREATE POLICY "Users can delete from production-outputs"
ON storage.objects FOR DELETE
USING (bucket_id = 'production-outputs');

-- production-inputs (imágenes de flujos, etc.)
CREATE POLICY "Users can upload to production-inputs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'production-inputs');

CREATE POLICY "Users can view production-inputs"
ON storage.objects FOR SELECT
USING (bucket_id = 'production-inputs');

CREATE POLICY "Users can delete from production-inputs"
ON storage.objects FOR DELETE
USING (bucket_id = 'production-inputs');

-- ai-knowledge: archivos para base de conocimientos IA (gestión Lead en /dev/lead/ai-vectors)
CREATE POLICY "Users can upload to ai-knowledge"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ai-knowledge');

CREATE POLICY "Users can view ai-knowledge"
ON storage.objects FOR SELECT
USING (bucket_id = 'ai-knowledge');

CREATE POLICY "Users can update ai-knowledge"
ON storage.objects FOR UPDATE
USING (bucket_id = 'ai-knowledge')
WITH CHECK (bucket_id = 'ai-knowledge');

CREATE POLICY "Users can delete from ai-knowledge"
ON storage.objects FOR DELETE
USING (bucket_id = 'ai-knowledge');
