-- ============================================================
-- RAG chunks — Vocabulario Arde de movement/action para video
-- ============================================================
-- Estos chunks se insertan en ai_global_vectors (la misma tabla
-- que usa el creative_knowledge_retriever de Product Feature Ads).
--
-- El Motion Director del flow Hero Cinematografico va a consultar
-- estos chunks via semantic search cuando construya el prompt Kling.
--
-- IMPORTANTE: Los embeddings los genera n8n o el ai-engine al insertar.
-- Aqui solo va el `content`, el embedding se calcula on-insert via
-- pg_net + OpenAI api o desde n8n.
--
-- Si insertas via Management API + UPSERT, dejas embedding NULL y
-- el cron de re-embedding lo procesa.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. CAMERA MOVEMENTS (5 chunks)
-- ──────────────────────────────────────────────────────────

INSERT INTO ai_global_vectors (source_path, source_type, chunk_index, content, metadata)
VALUES
(
  'arde/movement-vocabulary/camera-moves.md',
  'creative_knowledge',
  1,
  'CAMERA MOVE: push-in. Acercamiento intenso del lente hacia el producto, recorrido 5-10% del frame. Lens recomendado: 50mm. Velocidad: lenta y constante, NO snap-zoom. Mood: energia, urgencia, impacto. Foco SIEMPRE en el producto, jamas en el fondo. El producto NO rota durante el push. Ejemplo de prompt: "slow cinematic push-in on a 50mm lens toward the product label, very subtle (5% frame), smooth and steady". Marcas que prefieren: energy drinks, productos de impulso, lanzamientos. Evitar para: productos de lujo contemplativo (usar dolly in en su lugar).',
  '{"category": "movement", "movement_name": "push-in", "lens": "50mm", "intensity_pct": 5, "personality_match": ["energia", "urgencia", "impacto"]}'::jsonb
),
(
  'arde/movement-vocabulary/camera-moves.md',
  'creative_knowledge',
  2,
  'CAMERA MOVE: dolly in. Acercamiento elegante ultra-lento hacia el producto, recorrido 3-5% del frame. Lens recomendado: 85mm. Velocidad: muy lenta, casi imperceptible. Mood: poder, autoridad, elegancia, sofisticacion. Foco en el detalle del producto (logo, label, surface). El producto NO se mueve. Ejemplo de prompt: "extremely slow dolly in on 85mm lens, 3% frame movement, focus locking onto product logo". Marcas que prefieren: bebidas premium, skincare luxury, fragancias. Evitar para: productos masivos rapidos (usar push-in en su lugar).',
  '{"category": "movement", "movement_name": "dolly in", "lens": "85mm", "intensity_pct": 3, "personality_match": ["poder", "elegancia", "autoridad"]}'::jsonb
),
(
  'arde/movement-vocabulary/camera-moves.md',
  'creative_knowledge',
  3,
  'CAMERA MOVE: orbit-arc. Rotacion parcial de la camara alrededor del producto, arc de 10-20 grados maximo. Lens recomendado: 50mm o 85mm. Velocidad: media constante. Mood: velocidad, dinamismo, descubrimiento de superficie. El producto se mantiene centrado en el frame, lo que se mueve es la camara. NO confundir con producto rotando (prohibido). Ejemplo de prompt: "smooth orbit-arc 15 degrees around the product, camera maintains center on label, slow and continuous". Marcas que prefieren: productos con superficie multi-faceta (metalico, vidrio, brushed), automoviles, electronicos. Evitar para: productos planos sin variation lateral.',
  '{"category": "movement", "movement_name": "orbit-arc", "lens_options": ["50mm", "85mm"], "arc_degrees": 15, "personality_match": ["velocidad", "dinamismo", "descubrimiento"]}'::jsonb
),
(
  'arde/movement-vocabulary/camera-moves.md',
  'creative_knowledge',
  4,
  'CAMERA MOVE: static + micro-movement. Camara COMPLETAMENTE FIJA, sin movimiento de lente. Toda la vida visual proviene del producto y su entorno: condensation rolling, vapor, light shifts, fruit shimmer. Mood: minimal, premium contemplativo, editorial photography. La quietud es premium. Ejemplo de prompt: "static camera lockoff, no camera movement. Micro-life elements: condensation droplet slowly rolls down can, gentle vapor wisps rise from ice base, light catches on metallic surface in subtle shift". Marcas que prefieren: editorial premium, perfumes, joyas, productos minimal. Evitar para: productos energy / accion / impacto.',
  '{"category": "movement", "movement_name": "static + micro-mov", "lens_static": true, "personality_match": ["minimal", "premium", "elegancia", "contemplativo"]}'::jsonb
),
(
  'arde/movement-vocabulary/camera-moves.md',
  'creative_knowledge',
  5,
  'CAMERA MOVE: crane up. Movimiento ascendente de la camara desde nivel ojo del producto hasta angulo elevado o cenital parcial. Recorrido: 20-30% del frame en altura. Lens: 35mm o 50mm. Mood: revelacion dramatica, awe, escala grandiosa. Reveal el contexto completo del producto. Ejemplo de prompt: "slow crane up from eye-level of product to high-angle reveal, 35mm lens, revealing the full surface and surrounding elements". Marcas que prefieren: lanzamientos heroicos, productos aspiracionales, campaigns con escala. Evitar para: productos contenidos en frame cerrado.',
  '{"category": "movement", "movement_name": "crane up", "lens_options": ["35mm", "50mm"], "movement_pct": 25, "personality_match": ["dramatico", "aspiracional", "escala", "reveal"]}'::jsonb
),

-- ──────────────────────────────────────────────────────────
-- 2. ACTION PALETTE (5 chunks)
-- ──────────────────────────────────────────────────────────

(
  'arde/movement-vocabulary/action-palette.md',
  'creative_knowledge',
  10,
  'ACTION: condensation drop rolling. Una unica gota de condensacion se forma en la parte alta del producto (bebida fria, packaging metal/vidrio) y rueda lentamente hacia abajo durante los 5 segundos del video. Catching light de side rim como pasa. Trail wet visible behind. Categoria producto: bebidas frias, cervezas, refrescos, energy drinks, glass containers. Ejemplo prompt fragment: "a single condensation droplet slowly rolls down the can surface catching the side light as it travels, leaving a wet trail". Pareja natural con: ice glistening, cold vapor, dark moody lighting.',
  '{"category": "action", "action_name": "condensation drop rolling", "product_types": ["energy_drink", "beverage_cold", "beer", "glass_container"], "duration_match_sec": [3, 5, 8]}'::jsonb
),
(
  'arde/movement-vocabulary/action-palette.md',
  'creative_knowledge',
  11,
  'ACTION: cold vapor rising. Vapor frio sutil que sube desde la base del producto, ice fragments, o surface frio. Movimiento ascendente lento, dispersion gradual hacia arriba. NUNCA humo denso, NUNCA fog. Categoria: bebidas heladas, productos con cadena de frio, ice cream, conservacion. Ejemplo prompt fragment: "subtle cold vapor wisps rise gently from crushed ice around the base, dispersing softly upward, creating cinematic atmosphere". Pareja natural con: condensation drops, ice glistening, dark backgrounds que ressalten el vapor.',
  '{"category": "action", "action_name": "cold vapor rising", "product_types": ["beverage_cold", "ice_cream", "frozen_product"], "intensity": "subtle"}'::jsonb
),
(
  'arde/movement-vocabulary/action-palette.md',
  'creative_knowledge',
  12,
  'ACTION: ice fragments glistening. Pequenos fragmentos de hielo dispersos alrededor del producto que reflejan light shifts durante el push de camara. Brillos micro que aparecen y desaparecen segun el angulo. Static positions, no movement. Solo cambio de brillos. Categoria: bebidas, productos premium con cold-display. Ejemplo prompt fragment: "small ice fragments scattered around the base catch light beautifully, micro-sparkles appearing as camera moves, contact shadows visible". Pareja natural con: condensation, vapor, side rim lighting.',
  '{"category": "action", "action_name": "ice fragments glistening", "product_types": ["energy_drink", "beverage_cold", "beer", "cocktail"], "static_positions": true}'::jsonb
),
(
  'arde/movement-vocabulary/action-palette.md',
  'creative_knowledge',
  13,
  'ACTION: metallic shimmer. Surface metalica del producto (silver, chrome, brushed) muestra cambio sutil de specular highlights durante el camera move. NO es reflection cambiando completa, es solo brillo bailando 5-10% intensidad. Categoria: packaging metal/chrome, joyas, electronicos, automoviles. Ejemplo prompt fragment: "metallic surface reflections shift subtly as camera moves, specular highlights dancing gently on brushed silver finish, never overwhelming the product details". Pareja natural con: orbit-arc, soft beauty light, white-warm backgrounds.',
  '{"category": "action", "action_name": "metallic shimmer", "product_types": ["energy_drink_metal", "jewelry", "electronics", "automotive", "premium_packaging"], "intensity_pct": 8}'::jsonb
),
(
  'arde/movement-vocabulary/action-palette.md',
  'creative_knowledge',
  14,
  'ACTION: light reflection dancing. Reflejos de luz que se mueven suavemente sobre superficies reflectantes (vidrio, metal, surfaces brillantes) o liquidos. Movimiento organico, no patron repetitivo. Genera vida cinematografica sin mover el producto. Categoria: cosmetica luxury, perfumes, bebidas con vidrio, jewelry. Ejemplo prompt fragment: "light reflections dance softly across the glass surface, organic movement that suggests living light, never harsh or mechanical". Pareja natural con: static camera, soft beauty lighting, premium dark backgrounds.',
  '{"category": "action", "action_name": "light reflection dancing", "product_types": ["luxury_cosmetics", "perfume", "glass_beverage", "jewelry"], "organic_motion": true}'::jsonb
),

-- ──────────────────────────────────────────────────────────
-- 3. FIRST FRAME ANCHOR PATTERN (1 chunk)
-- ──────────────────────────────────────────────────────────

(
  'arde/video-patterns/first-frame-anchor.md',
  'creative_knowledge',
  20,
  'VIDEO PATTERN: first-frame IMMUTABLE anchor. Cuando se genera un video con kling-3.0/video usando una imagen hero como first_frame, el prompt DEBE explicitamente preservar la imagen como anchor inmutable. Reglas absolutas: (1) Producto NO se mueve, NO rota, NO cambia geometria/label/logo. (2) Background ESTATICO al 100%. (3) Solo micro-acciones del action_palette son permitidas. (4) Camera move maximo 5-10% del frame. Sin esta clausula, kling tipicamente "morphea" el producto, distorsiona labels, o cambia composicion. Ejemplo de seccion obligatoria en el prompt: "Use the provided first frame as IMMUTABLE visual anchor: preserve EXACTLY the [product name], its label, logo, condensation, [props], [bg], lighting and composition. The product does NOT move, rotate or change in any way. Background completely static, no changes."',
  '{"category": "video_pattern", "pattern_name": "first_frame_anchor", "applies_to_models": ["kling-3.0/video", "kling-3.0", "seedance-2", "runway-gen3"], "mandatory_clause": true}'::jsonb
),

-- ──────────────────────────────────────────────────────────
-- 4. NEGATIVE PATTERNS PARA VIDEO (1 chunk)
-- ──────────────────────────────────────────────────────────

(
  'arde/video-patterns/negative-patterns.md',
  'creative_knowledge',
  21,
  'VIDEO NEGATIVE PATTERNS: la lista de defectos comunes en video generativo que el prompt debe explicitamente prohibir en la seccion Technical/Negative. Lista canonica Arde: morphing AI look, warping geometry, plastic skin, waxy texture, label changes mid-video, logo distorting, color shift between frames, extra objects appearing, hands appearing, text artifacts, watermarks, generic orange-teal color grading, oversaturated neon colors, anatomical errors, flat lighting without direction, CGI appearance, artificial feel. Ejemplo de seccion obligatoria: "Technical: 24fps, natural motion blur, no morphing, no warping, no plastic textures, no extra objects appearing, no text changes, no label distortion. The product geometry and branding remain identical to first frame at every moment."',
  '{"category": "video_pattern", "pattern_name": "negative_list", "applies_to_models": ["kling-3.0/video", "seedance-2", "runway-gen3"], "mandatory_clause": true}'::jsonb
),

-- ──────────────────────────────────────────────────────────
-- 5. PERSONALITY → MOVEMENT MAPPING (1 chunk meta)
-- ──────────────────────────────────────────────────────────

(
  'arde/video-patterns/personality-mapping.md',
  'creative_knowledge',
  22,
  'PERSONALITY MAPPING para Motion Director. Mapeo entre el "keyword de personalidad" del producto/variante y el movement+action canonico Arde. Energia → push-in 50mm + condensation drop rolling + ice glistening. Poder → dolly in 85mm ultra lento + dark vapor + red light pulse. Velocidad → orbit-arc 15deg + metallic shimmer + reflections dancing. Elegancia → static + micro-mov + soft light dance. Frescura → dolly in suave + mint shimmer + condensation. Aventura → crane up + dust particles + light flares. Lujo → static + micro-mov + sparkle suave + reflection slow dance. Cuando un brand_container especifica variant_personalities, usa esos mapeos. Cuando no, usa este default. Cuando ambos faltan, default a "elegancia".',
  '{"category": "video_pattern", "pattern_name": "personality_mapping", "default_keyword": "elegancia", "mappings": ["energia", "poder", "velocidad", "elegancia", "frescura", "aventura", "lujo"]}'::jsonb
),

-- ──────────────────────────────────────────────────────────
-- 6. KLING 3.0 PRO SETTINGS (1 chunk tecnico)
-- ──────────────────────────────────────────────────────────

(
  'arde/video-patterns/kling-settings.md',
  'creative_knowledge',
  23,
  'KLING 3.0 PRO settings canonicos Arde. mode: "pro" (NO usar "std" para hero, perdida de calidad). sound: false (audio se agrega en post). duration: 5 (sweet spot calidad/costo; 10s aumenta costo 2x sin ganancia narrativa para hero). aspect_ratio: match al de la imagen hero (1:1 default, 9:16 stories, 16:9 anuncios horizontales). cfg_scale: default (no manual override). multi_shots: false (un solo shot por video, no multi-clip). image_urls: array con UNA imagen (el first_frame). Body de la llamada: {"model":"kling-3.0/video","input":{"mode":"pro","sound":false,"duration":"5","aspect_ratio":"1:1","prompt":"<motion_director_output>","image_urls":["<image_url>"],"multi_shots":false}}. Costo aprox: ~$0.20 por video Pro 5s.',
  '{"category": "video_technical", "model": "kling-3.0/video", "mode": "pro", "duration_default": 5, "cost_usd": 0.20}'::jsonb
);

-- ============================================================
-- VERIFICACION POST-INSERT
-- ============================================================
-- SELECT source_path, COUNT(*) FROM ai_global_vectors
-- WHERE source_path LIKE 'arde/movement-vocabulary/%'
--    OR source_path LIKE 'arde/video-patterns/%'
-- GROUP BY source_path
-- ORDER BY source_path;
--
-- Esperado: 13 rows total (5 camera moves + 5 actions + 3 video patterns)
-- ============================================================
