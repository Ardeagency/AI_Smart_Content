create or replace function get_brand_products_with_images(
  p_brand_container_id uuid
)
returns table (
  id uuid,
  name text,
  description text,
  price numeric,
  currency text,
  benefits text, -- Concatenamos los beneficios para la IA
  ingredients text,
  usage_mode text,
  images jsonb -- ¡Aquí está la magia! Las imágenes vienen anidadas
)
language plpgsql
as $$
begin
  return query
  select 
    p.id,
    p.nombre_producto as name,
    p.descripcion_producto as description,
    p.precio_producto as price,
    p.moneda as currency,
    -- Concatenamos beneficios para que la IA lo lea como un solo párrafo
    concat_ws('. ', p.beneficio_1, p.beneficio_2, p.beneficio_3) as benefits,
    p.ingredientes as ingredients,
    p.modo_uso as usage_mode,
    -- Subconsulta para traer las imágenes como un array JSON
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('url', pi.image_url, 'type', pi.image_type))
        from public.product_images pi
        where pi.product_id = p.id
        order by pi.image_order asc
      ),
      '[]'::jsonb
    ) as images
  from public.products p
  where p.brand_container_id = p_brand_container_id
  order by p.nombre_producto asc;
end;
$$;

-- 1. FUNCIÓN PARA OBTENER CAMPAÑAS (Dropdown)
-- Como la tabla campaigns no tiene columna "name", usamos "objetivo_principal" como etiqueta.
create or replace function get_brand_campaigns_dropdown(
  p_brand_container_id uuid
)
returns table (
  id uuid,
  name text, -- Esto será lo que ve el usuario en el Dropdown
  objective text,
  cta text,
  cta_url text,
  offer_description text
)
language plpgsql
as $$
begin
  return query
  select 
    c.id,
    -- Usamos el objetivo como nombre, truncado si es muy largo
    substring(c.objetivo_principal from 1 for 50) || '...' as name, 
    c.objetivo_principal as objective,
    c.cta,
    c.cta_url,
    c.oferta_desc as offer_description
  from public.campaigns c
  where c.brand_container_id = p_brand_container_id
  order by c.created_at desc;
end;
$$;

-- 2. FUNCIÓN PARA OBTENER AUDIENCIAS (Dropdown)
-- Aquí sí tenemos columna "name".
create or replace function get_brand_audiences_dropdown(
  p_brand_id uuid -- Ojo: Audiencias usa brand_id, no brand_container_id (según tu schema)
)
returns table (
  id uuid,
  name text,
  pains jsonb,
  desires jsonb,
  tone text
)
language plpgsql
as $$
begin
  return query
  select 
    a.id,
    a.name,
    a.pains,
    a.desires,
    a.language_style as tone
  from public.audiences a
  where a.brand_id = p_brand_id
  order by a.name asc;
end;
$$;
create or replace function get_smart_visual_references(
  p_search_term text, -- Ej: 'repostería', 'tech', 'moda'
  p_limit integer default 20
)
returns table (
  id uuid,
  image_url text,
  thumbnail_url text,
  style_prompt jsonb, -- Esto es lo valioso: los detalles técnicos del prompt
  category text
)
language plpgsql
as $$
begin
  return query
  select 
    vr.id,
    vr.image_url,
    coalesce(vr.thumbnail_url, vr.image_url) as thumbnail_url,
    vr.prompt_details as style_prompt,
    vr.category
  from public.visual_references vr
  where 
    vr.usable_for_generation = true
    and (
      -- Búsqueda flexible: si p_search_term es 'repostería', busca coincidencias
      vr.category ilike '%' || p_search_term || '%'
      or
      vr.visual_type ilike '%' || p_search_term || '%'
      or
      -- Si mandas NULL, trae referencias generales/populares
      p_search_term is null
    )
  order by vr.priority desc, vr.created_at desc
  limit p_limit;
end;
$$;