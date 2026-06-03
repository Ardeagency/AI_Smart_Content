# Extension de `brand_containers.visual_dna` y `verbal_dna` — Vocabulario Arde de movement/action

**Status:** Spec. NO requiere migracion DDL (visual_dna ya es JSONB). Solo seeds + chunks RAG.

## Por que esta extension

Hoy `brand_containers.visual_dna` contiene los campos que usa el flow PFA (`signature_elements`, `default_scene_anchor`, `trend_compatibility`). Para el flow nuevo "Hero Cinematografico" necesitamos 3 campos nuevos opcionales que el Motion Director va a consultar:

- `movement_pool` — vocabulario Arde de movimientos de camara que esta marca PREFIERE
- `action_palette` — micro-acciones que esta marca usa (condensation rolling, vapor rising, etc)
- `variant_personalities` — mapeo `variant_name → personality_keyword` para que el Motion Director sepa que movimiento aplicar por variante

## Shape extendido

```jsonc
{
  "visual_dna": {
    // ─── CAMPOS EXISTENTES (usados por PFA) ───
    "signature_elements": [
      "matte black surface", "red rim light", "real shadow under product"
    ],
    "default_scene_anchor": {
      "surface_options": ["honed marble", "matte graphite"],
      "backdrop": "deep charcoal gradient",
      "lighting_default": "side hard light + thin red rim",
      "mood_default": "moody low-key cinematic"
    },
    "trend_compatibility": {
      "preferred": ["architectural-still-life", "macro"],
      "ok_with_caution": ["lifestyle"],
      "forbidden": ["data-driven", "colorblock"]
    },

    // ─── CAMPOS NUEVOS (Motion Director) ───
    "movement_pool": [
      "push-in", "dolly in", "static + micro-mov"
    ],
    "action_palette": [
      "condensation drop rolling",
      "cold vapor rising",
      "ice fragments glistening",
      "light reflection dancing"
    ],
    "variant_personalities": {
      "AFTERBURN": {
        "keyword": "energia",
        "preferred_movement": "push-in",
        "preferred_actions": ["drop rolling", "ice glistening"],
        "lighting_modifier": "intense rim red"
      },
      "BLACK CORE": {
        "keyword": "poder",
        "preferred_movement": "dolly in",
        "preferred_actions": ["dark vapor", "red light pulse"],
        "lighting_modifier": "moody low-key Rembrandt"
      },
      "OVERDRIVE": {
        "keyword": "velocidad",
        "preferred_movement": "orbit-arc",
        "preferred_actions": ["metallic shimmer", "reflections dancing"],
        "lighting_modifier": "soft beauty + chrome reflections"
      }
    }
  }
}
```

## Vocabulario Arde — referencia para el Motion Director

### Movements (camera moves)

| Movement | Definicion | Cuando usar |
|---|---|---|
| `push-in` | Acercamiento intenso, ~5% del frame, foco fijo en producto | Energia, urgencia, impacto |
| `dolly in` | Acercamiento suave, ultra lento, ~3% del frame | Poder, autoridad, elegancia |
| `orbit-arc` | Rotacion parcial 15deg alrededor del producto | Velocidad, dinamismo, descubrimiento |
| `static + micro-mov` | Camara fija + micro-vida en el producto | Minimal, premium contemplativo |
| `crane up` | Movimiento ascendente desde nivel ojo | Revelacion dramatica, awe |

### Action palette (micro-vida)

| Action | Donde se aplica |
|---|---|
| `condensation drop rolling` | Bebidas frias, packaging metalico/vidrio |
| `cold vapor rising` | Bebidas heladas, conservacion |
| `ice fragments glistening` | Bebidas con hielo, frescura |
| `fruit surface shimmer` | Producto con ingredientes frescos |
| `mint leaf micro-movement` | Bebidas con herbs, frescura organica |
| `light reflection dancing` | Productos brillantes, metal, vidrio |
| `red light pulse` | Marcas con accent rojo, energy mood |
| `dark vapor` | Marcas dark/moody, mystery |
| `metallic shimmer` | Packaging metal, premium |
| `liquid surface ripple` | Bebidas dentro de vaso, dinamica |

### Personality → Movement mapping (referencia)

| Personality | Default movement | Default actions |
|---|---|---|
| `energia` | push-in 50mm | drop rolling + ice glistening |
| `poder` | dolly in 85mm ultra lento | dark vapor + red pulse |
| `velocidad` | orbit-arc 15deg | metallic shimmer + reflections dancing |
| `elegancia` | static + micro-mov | soft light dance |
| `frescura` | dolly in suave | mint shimmer + condensation |
| `aventura` | crane up | dust particles + light flares |

## Aplicacion al flow

Cuando el Motion Director recibe un producto, hace este algoritmo:

```
1. Mira product.name en brand.visual_dna.variant_personalities
   ├─ Si esta: usa preferred_movement + preferred_actions
   └─ Si no esta: deduce personality_keyword del campaign tone o usa "elegancia"
2. Verifica que movement esta en brand.visual_dna.movement_pool
   ├─ Si: ok
   └─ No: cae al primero de movement_pool
3. Toma action_palette del brand y filtra por contexto producto
4. Genera prompt Kling con first-frame IMMUTABLE + movement + actions
```

## Backward compatibility

Los campos nuevos son **opcionales**. Si un brand_container NO los tiene, el Motion Director usa defaults:

- `movement_pool` default: `["static + micro-mov"]`
- `action_palette` default: `["light reflection dancing"]`
- `variant_personalities` default: `{}` (cada producto cae al keyword "elegancia")

Esto garantiza que el flow corre para CUALQUIER brand_container, no solo IGNIS.
