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

  // i18n: helper local. Las etiquetas se traducen en cada acceso (getters),
  // no en la definicion, para respetar el cambio de idioma en caliente.
  const _t = (s) => (window.__ ? window.__(s) : s);

  /** Nicho principal de la marca (dropdown `nicho_core`). Los `value` son datos
   *  (se guardan en BD); solo se traduce el `label`. */
  function nichoCoreOptions() {
    return [
      { value: '', label: _t('Seleccionar nicho') },
      { value: 'tecnologia_saas', label: _t('Tecnología / SaaS') },
      { value: 'ecommerce_retail', label: _t('E-commerce / Retail') },
      { value: 'salud_bienestar', label: _t('Salud y bienestar') },
      { value: 'fitness_deporte', label: _t('Fitness y deporte') },
      { value: 'alimentacion', label: _t('Alimentación y gastronomía') },
      { value: 'educacion', label: _t('Educación y formación') },
      { value: 'inmobiliaria', label: _t('Inmobiliaria') },
      { value: 'servicios_profesionales', label: _t('Servicios profesionales') },
      { value: 'marketing_agencia', label: _t('Marketing y agencias') },
      { value: 'entretenimiento', label: _t('Entretenimiento y medios') },
      { value: 'moda_belleza', label: _t('Moda y belleza') },
      { value: 'turismo', label: _t('Turismo y hospitalidad') },
      { value: 'finanzas', label: _t('Finanzas y seguros') },
      { value: 'industrial_b2b', label: _t('Industrial / B2B') },
      { value: 'sostenibilidad', label: _t('Sostenibilidad e impacto') },
      { value: 'arte_cultura', label: _t('Arte y cultura') },
      { value: 'hogar_lifestyle', label: _t('Hogar y lifestyle') },
      { value: 'otro', label: _t('Otro') }
    ];
  }

  function getNichoCoreLabel(storedValue) {
    const v = storedValue == null ? '' : String(storedValue);
    const row = nichoCoreOptions().find((o) => o.value === v);
    if (row) return row.label;
    return v.trim() ? v : _t('Seleccionar nicho');
  }

  /**
   * Schema del panel INFO de sub-marca (BrandstorageView). Incluye campos de
   * `idiomas_contenido` y `mercado_objetivo` — NO aplican en el panel INFO de
   * organización (BrandOrganizationView), que usa la variante ORG abajo.
   *
   * Limites (maxChars / maxItems): elegidos para evitar sobre-saturacion del
   * payload que se entrega al LLM creativo (ver FEAT-029 Fase 1). Cuando un
   * field excede su limite, los LLM tienden a tomar el contenido literal,
   * matando la creatividad de la generacion. Los limites son sugeridos
   * (warning visual), no bloqueantes: el usuario puede pasarse, pero ve
   * counter en rojo + advertencia.
   */
  function brandSchemaBlocksContainer() {
    return [
      { field: 'creative_brief',        label: _t('Sintesis creativa'),        type: 'textarea', maxChars: 200 },
      { field: 'idiomas_contenido',     label: _t('Idiomas de contenido'),     type: 'array',    maxItems: 3 },
      { field: 'mercado_objetivo',      label: _t('Mercado objetivo'),         type: 'array',    maxItems: 4 },
      { field: 'nicho_core',            label: _t('Nicho core'),               type: 'select' },
      { field: 'sub_nichos',            label: _t('Sub-nichos'),               type: 'array',    maxItems: 3 },
      { field: 'arquetipo',             label: _t('Arquetipo'),                type: 'text',     maxChars: 40 },
      { field: 'propuesta_valor',       label: _t('Propuesta de valor'),       type: 'textarea', maxChars: 200 },
      { field: 'mision_vision',         label: _t('Misión y visión'),          type: 'textarea', maxChars: 250 },
      { field: 'verbal_dna',            label: _t('ADN verbal'),               type: 'json' },
      { field: 'visual_dna',            label: _t('ADN visual'),               type: 'json' },
      { field: 'palabras_clave',        label: _t('Palabras clave'),           type: 'array',    maxItems: 6 },
      { field: 'palabras_prohibidas',   label: _t('Palabras prohibidas'),      type: 'array',    maxItems: 6 },
      { field: 'objetivos_estrategicos', label: _t('Objetivos estratégicos'),  type: 'array',    maxItems: 3 }
    ];
  }

  /** Variante para panel INFO de organización: sin `idiomas_contenido`/`mercado_objetivo`. */
  function brandSchemaBlocksOrg() {
    return brandSchemaBlocksContainer().filter(
      (b) => !['idiomas_contenido', 'mercado_objetivo'].includes(b.field)
    );
  }

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
    // Getters: re-evaluan __() en cada acceso para reflejar el idioma activo.
    get NICHO_CORE_OPTIONS() { return nichoCoreOptions(); },
    getNichoCoreLabel,
    get BRAND_SCHEMA_BLOCKS_CONTAINER() { return brandSchemaBlocksContainer(); },
    get BRAND_SCHEMA_BLOCKS_ORG() { return brandSchemaBlocksOrg(); },
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
