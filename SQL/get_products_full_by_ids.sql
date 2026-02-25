-- Función para obtener TODOS los datos de uno o más productos por ID (para envío al webhook).
-- Usada por StudioView al producir: reemplaza el UUID del selector por el objeto completo (con imágenes).
-- RLS se aplica (SECURITY INVOKER): el usuario solo puede obtener productos de sus marcas.

CREATE OR REPLACE FUNCTION public.get_products_full_by_ids(p_product_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', p.id,
    'brand_container_id', p.brand_container_id,
    'tipo_producto', p.tipo_producto,
    'nombre_producto', p.nombre_producto,
    'descripcion_producto', p.descripcion_producto,
    'precio_producto', p.precio_producto,
    'moneda', COALESCE(p.moneda, 'USD'),
    'entity_id', p.entity_id,
    'beneficios_principales', COALESCE(p.beneficios_principales, ARRAY[]::text[]),
    'diferenciadores', COALESCE(p.diferenciadores, ARRAY[]::text[]),
    'casos_de_uso', COALESCE(p.casos_de_uso, ARRAY[]::text[]),
    'caracteristicas_visuales', COALESCE(p.caracteristicas_visuales, ARRAY[]::text[]),
    'materiales_composicion', COALESCE(p.materiales_composicion, ARRAY[]::text[]),
    'variantes', COALESCE(p.variantes, ARRAY[]::text[]),
    'url_producto', p.url_producto,
    'created_at', p.created_at,
    'images', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'image_url', pi.image_url,
            'image_type', pi.image_type,
            'image_order', pi.image_order
          ) ORDER BY pi.image_order ASC NULLS LAST
        )
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      ),
      '[]'::jsonb
    )
  )
  FROM public.products p
  WHERE p.id = ANY(p_product_ids);
END;
$$;

COMMENT ON FUNCTION public.get_products_full_by_ids(uuid[]) IS
  'Devuelve los productos completos (con imágenes) para los IDs dados. Usado por Studio para enviar datos completos al webhook en lugar de solo el UUID.';
