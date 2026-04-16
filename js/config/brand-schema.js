/**
 * BrandSchema — catálogos y esquema de `public.brands` usados por las vistas de marca.
 *
 * Antes estos valores vivían duplicados en BrandstorageView + BrandOrganizationView
 * (mismo array, misma lista, con riesgo de divergir). Fuente única ahora expuesta
 * en `window.BrandSchema`.
 *
 * Si agregas un campo al schema de la DB, añadirlo aquí una sola vez y ambas vistas
 * lo recogen.
 */
(function () {
  'use strict';

  /** Nicho principal de la marca (dropdown `nicho_core`). */
  const NICHO_CORE_OPTIONS = [
    { value: '', label: 'Seleccionar nicho' },
    { value: 'tecnologia_saas', label: 'Tecnología / SaaS' },
    { value: 'ecommerce_retail', label: 'E-commerce / Retail' },
    { value: 'salud_bienestar', label: 'Salud y bienestar' },
    { value: 'fitness_deporte', label: 'Fitness y deporte' },
    { value: 'alimentacion', label: 'Alimentación y gastronomía' },
    { value: 'educacion', label: 'Educación y formación' },
    { value: 'inmobiliaria', label: 'Inmobiliaria' },
    { value: 'servicios_profesionales', label: 'Servicios profesionales' },
    { value: 'marketing_agencia', label: 'Marketing y agencias' },
    { value: 'entretenimiento', label: 'Entretenimiento y medios' },
    { value: 'moda_belleza', label: 'Moda y belleza' },
    { value: 'turismo', label: 'Turismo y hospitalidad' },
    { value: 'finanzas', label: 'Finanzas y seguros' },
    { value: 'industrial_b2b', label: 'Industrial / B2B' },
    { value: 'sostenibilidad', label: 'Sostenibilidad e impacto' },
    { value: 'arte_cultura', label: 'Arte y cultura' },
    { value: 'hogar_lifestyle', label: 'Hogar y lifestyle' },
    { value: 'otro', label: 'Otro' }
  ];

  function getNichoCoreLabel(storedValue) {
    const v = storedValue == null ? '' : String(storedValue);
    const row = NICHO_CORE_OPTIONS.find((o) => o.value === v);
    if (row) return row.label;
    return v.trim() ? v : 'Seleccionar nicho';
  }

  /**
   * Schema del panel INFO de sub-marca (BrandstorageView). Incluye campos de
   * `idiomas_contenido` y `mercado_objetivo` — NO aplican en el panel INFO de
   * organización (BrandOrganizationView), que usa la variante ORG abajo.
   */
  const BRAND_SCHEMA_BLOCKS_CONTAINER = [
    { field: 'idiomas_contenido',     label: 'Idiomas de contenido',     type: 'array' },
    { field: 'mercado_objetivo',      label: 'Mercado objetivo',         type: 'array' },
    { field: 'nicho_core',            label: 'Nicho core',               type: 'select' },
    { field: 'sub_nichos',            label: 'Sub-nichos',               type: 'array' },
    { field: 'arquetipo',             label: 'Arquetipo',                type: 'text' },
    { field: 'propuesta_valor',       label: 'Propuesta de valor',       type: 'textarea' },
    { field: 'mision_vision',         label: 'Misión y visión',          type: 'textarea' },
    { field: 'verbal_dna',            label: 'ADN verbal (JSON)',        type: 'json' },
    { field: 'visual_dna',            label: 'ADN visual (JSON)',        type: 'json' },
    { field: 'palabras_clave',        label: 'Palabras clave',           type: 'array' },
    { field: 'palabras_prohibidas',   label: 'Palabras prohibidas',      type: 'array' },
    { field: 'objetivos_estrategicos', label: 'Objetivos estratégicos',  type: 'array' }
  ];

  /** Variante para panel INFO de organización: sin `idiomas_contenido`/`mercado_objetivo`. */
  const BRAND_SCHEMA_BLOCKS_ORG = BRAND_SCHEMA_BLOCKS_CONTAINER.filter(
    (b) => !['idiomas_contenido', 'mercado_objetivo'].includes(b.field)
  );

  /** Utilidad para extraer nombres de campos por tipo de editor. */
  function fieldsByType(schema, type) {
    return schema.filter((b) => b.type === type).map((b) => b.field);
  }

  const BRAND_IDIOMAS_OPTIONS = [
    { value: 'es', label: 'es - Spanish' },
    { value: 'en', label: 'en - English' },
    { value: 'pt', label: 'pt - Portuguese' },
    { value: 'fr', label: 'fr - French' },
    { value: 'de', label: 'de - German' },
    { value: 'it', label: 'it - Italian' }
  ];

  /** Input libre (ej. "español") normalizado a código ISO ("es"). */
  const BRAND_IDIOMAS_ALIASES = {
    es: 'es', espanol: 'es', 'español': 'es', spanish: 'es',
    en: 'en', ingles: 'en', 'inglés': 'en', english: 'en',
    pt: 'pt', portugues: 'pt', 'portugués': 'pt', portuguese: 'pt',
    fr: 'fr', frances: 'fr', 'francés': 'fr', french: 'fr',
    de: 'de', aleman: 'de', 'alemán': 'de', german: 'de',
    it: 'it', italiano: 'it', italian: 'it'
  };

  const BRAND_MERCADO_OPTIONS = [
    'Colombia', 'México', 'Estados Unidos', 'Argentina', 'Chile',
    'Perú', 'Ecuador', 'Venezuela', 'España', 'Brasil'
  ];

  const BRAND_SUB_NICHOS_OPTIONS = [
    'E-commerce', 'Retail', 'Salud', 'Bienestar', 'Fitness', 'Educación',
    'SaaS', 'Servicios profesionales', 'Finanzas', 'Inmobiliaria',
    'Turismo', 'B2B Industrial'
  ];

  /** Fuentes disponibles para tipografía en imágenes (dropdown en Visual de marca). */
  const TYPOGRAPHY_FONTS = [
    { value: 'Inter',            label: 'Inter' },
    { value: 'Roboto',           label: 'Roboto' },
    { value: 'Open Sans',        label: 'Open Sans' },
    { value: 'Lato',             label: 'Lato' },
    { value: 'Montserrat',       label: 'Montserrat' },
    { value: 'Poppins',          label: 'Poppins' },
    { value: 'Playfair Display', label: 'Playfair Display' },
    { value: 'Oswald',           label: 'Oswald' },
    { value: 'Raleway',          label: 'Raleway' },
    { value: 'Bebas Neue',       label: 'Bebas Neue' },
    { value: 'Source Sans 3',    label: 'Source Sans 3' },
    { value: 'Nunito',           label: 'Nunito' },
    { value: 'Work Sans',        label: 'Work Sans' },
    { value: 'DM Sans',          label: 'DM Sans' }
  ];

  window.BrandSchema = {
    NICHO_CORE_OPTIONS,
    getNichoCoreLabel,
    BRAND_SCHEMA_BLOCKS_CONTAINER,
    BRAND_SCHEMA_BLOCKS_ORG,
    fieldsByType,
    BRAND_IDIOMAS_OPTIONS,
    BRAND_IDIOMAS_ALIASES,
    BRAND_MERCADO_OPTIONS,
    BRAND_SUB_NICHOS_OPTIONS,
    TYPOGRAPHY_FONTS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.BrandSchema;
  }
})();
