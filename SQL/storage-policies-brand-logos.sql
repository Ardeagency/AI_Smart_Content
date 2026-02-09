/**
 * Políticas RLS solo para el bucket brand-logos
 * La app sube con path: {brand_container_id}/{filename}
 * El usuario debe ser dueño del brand_container (brand_containers.user_id = auth.uid())
 *
 * Ejecutar en el SQL Editor de Supabase si falla "new row violates row-level security policy".
 */

-- Eliminar políticas antiguas y actuales (idempotente)
DROP POLICY IF EXISTS "Users can upload own brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own brand logos" ON storage.objects;
DROP POLICY IF EXISTS "brand_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "brand_logos_select" ON storage.objects;
DROP POLICY IF EXISTS "brand_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "brand_logos_delete" ON storage.objects;

-- INSERT: solo si la primera carpeta del path es un brand_container del usuario
CREATE POLICY "brand_logos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'brand-logos'
  AND EXISTS (
    SELECT 1 FROM public.brand_containers bc
    WHERE bc.id::text = (storage.foldername(name))[1]
    AND bc.user_id = auth.uid()
  )
);

-- SELECT: mismo criterio (lectura vía API; URLs públicas siguen funcionando si el bucket es público)
CREATE POLICY "brand_logos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND EXISTS (
    SELECT 1 FROM public.brand_containers bc
    WHERE bc.id::text = (storage.foldername(name))[1]
    AND bc.user_id = auth.uid()
  )
);

-- UPDATE: necesario para upsert (reemplazar logo)
CREATE POLICY "brand_logos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND EXISTS (
    SELECT 1 FROM public.brand_containers bc
    WHERE bc.id::text = (storage.foldername(name))[1]
    AND bc.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'brand-logos'
  AND EXISTS (
    SELECT 1 FROM public.brand_containers bc
    WHERE bc.id::text = (storage.foldername(name))[1]
    AND bc.user_id = auth.uid()
  )
);

-- DELETE: mismo criterio
CREATE POLICY "brand_logos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND EXISTS (
    SELECT 1 FROM public.brand_containers bc
    WHERE bc.id::text = (storage.foldername(name))[1]
    AND bc.user_id = auth.uid()
  )
);
