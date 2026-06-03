-- ============================================================
-- Seed IGNIS — Extension de visual_dna con movement_pool,
-- action_palette y variant_personalities
-- ============================================================
-- Aplicar SOLO despues de validar que el flow nuevo funciona.
-- Esto deja IGNIS lista para ejecutar el flow Hero Cinematografico
-- con su DNA de movimiento codificado.
-- ============================================================

-- 1. Localizar el brand_container de IGNIS
-- (asumiendo que IGNIS es la org piloto a1000000-...0001)
-- SELECT id, name, organization_id, visual_dna
-- FROM brand_containers
-- WHERE name ILIKE 'IGNIS%' OR organization_id = 'a1000000-0000-0000-0000-000000000001';

-- 2. Merge de los campos nuevos en visual_dna
-- Usamos jsonb_set + jsonb_build_object para no perder data existente
UPDATE brand_containers
SET visual_dna = COALESCE(visual_dna, '{}'::jsonb) || jsonb_build_object(
  'movement_pool', jsonb_build_array(
    'push-in',
    'dolly in',
    'orbit-arc'
  ),
  'action_palette', jsonb_build_array(
    'condensation drop rolling',
    'cold vapor rising',
    'ice fragments glistening',
    'metallic shimmer',
    'light reflection dancing',
    'red light pulse',
    'dark vapor'
  ),
  'variant_personalities', jsonb_build_object(
    'AFTERBURN', jsonb_build_object(
      'keyword', 'energia',
      'preferred_movement', 'push-in',
      'preferred_actions', jsonb_build_array(
        'condensation drop rolling',
        'ice fragments glistening'
      ),
      'lighting_modifier', 'intense rim red',
      'color_dominant', 'red'
    ),
    'BLACK CORE', jsonb_build_object(
      'keyword', 'poder',
      'preferred_movement', 'dolly in',
      'preferred_actions', jsonb_build_array(
        'dark vapor',
        'red light pulse'
      ),
      'lighting_modifier', 'moody low-key Rembrandt',
      'color_dominant', 'matte black with red accent'
    ),
    'OVERDRIVE', jsonb_build_object(
      'keyword', 'velocidad',
      'preferred_movement', 'orbit-arc',
      'preferred_actions', jsonb_build_array(
        'metallic shimmer',
        'light reflection dancing'
      ),
      'lighting_modifier', 'soft beauty + chrome reflections',
      'color_dominant', 'metallic silver'
    )
  )
)
WHERE name ILIKE 'IGNIS%';

-- 3. Verificacion post-update
-- SELECT id, name,
--   visual_dna->'movement_pool' AS movement_pool,
--   visual_dna->'action_palette' AS action_palette,
--   visual_dna->'variant_personalities'->'AFTERBURN' AS afterburn_personality
-- FROM brand_containers
-- WHERE name ILIKE 'IGNIS%';
