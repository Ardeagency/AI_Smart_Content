/**
 * Datos para el contenedor Flags: idiomas, países, etnia/región.
 * Permite personalización masiva (personaje, idioma, rasgos, etc.) a nivel internacional.
 */
(function (global) {
  'use strict';

  /** Convierte código ISO 3166-1 alpha-2 (ej. "ES") a emoji de bandera (ej. 🇪🇸) */
  function countryCodeToFlag(code) {
    if (!code || code.length !== 2) return '';
    var a = code.toUpperCase();
    return String.fromCodePoint.apply(null, a.split('').map(function (c) { return 127397 + c.charCodeAt(0); }));
  }

  /** Idiomas: value = código ISO 639-1, label = nombre, flag = código país representativo para emoji */
  var FLAGS_LANGUAGES = [
    { value: 'es', label: 'Español', flag: 'ES' },
    { value: 'en', label: 'English', flag: 'US' },
    { value: 'pt', label: 'Português', flag: 'BR' },
    { value: 'fr', label: 'Français', flag: 'FR' },
    { value: 'de', label: 'Deutsch', flag: 'DE' },
    { value: 'it', label: 'Italiano', flag: 'IT' },
    { value: 'ja', label: '日本語', flag: 'JP' },
    { value: 'zh', label: '中文', flag: 'CN' },
    { value: 'ko', label: '한국어', flag: 'KR' },
    { value: 'ar', label: 'العربية', flag: 'SA' },
    { value: 'hi', label: 'हिन्दी', flag: 'IN' },
    { value: 'ru', label: 'Русский', flag: 'RU' },
    { value: 'nl', label: 'Nederlands', flag: 'NL' },
    { value: 'pl', label: 'Polski', flag: 'PL' },
    { value: 'tr', label: 'Türkçe', flag: 'TR' },
    { value: 'vi', label: 'Tiếng Việt', flag: 'VN' },
    { value: 'th', label: 'ไทย', flag: 'TH' },
    { value: 'id', label: 'Bahasa Indonesia', flag: 'ID' },
    { value: 'ms', label: 'Bahasa Melayu', flag: 'MY' },
    { value: 'sv', label: 'Svenska', flag: 'SE' },
    { value: 'no', label: 'Norsk', flag: 'NO' },
    { value: 'da', label: 'Dansk', flag: 'DK' },
    { value: 'fi', label: 'Suomi', flag: 'FI' },
    { value: 'el', label: 'Ελληνικά', flag: 'GR' },
    { value: 'he', label: 'עברית', flag: 'IL' },
    { value: 'cs', label: 'Čeština', flag: 'CZ' },
    { value: 'ro', label: 'Română', flag: 'RO' },
    { value: 'hu', label: 'Magyar', flag: 'HU' },
    { value: 'uk', label: 'Українська', flag: 'UA' },
    { value: 'ca', label: 'Català', flag: 'ES' },
    { value: 'eu', label: 'Euskara', flag: 'ES' },
    { value: 'gl', label: 'Galego', flag: 'ES' }
  ];

  /** Países/regiones: ISO 3166-1 alpha-2 + nombre */
  var FLAGS_COUNTRIES = [
    { value: 'US', label: 'Estados Unidos', flag: 'US' },
    { value: 'MX', label: 'México', flag: 'MX' },
    { value: 'AR', label: 'Argentina', flag: 'AR' },
    { value: 'CO', label: 'Colombia', flag: 'CO' },
    { value: 'ES', label: 'España', flag: 'ES' },
    { value: 'BR', label: 'Brasil', flag: 'BR' },
    { value: 'CL', label: 'Chile', flag: 'CL' },
    { value: 'PE', label: 'Perú', flag: 'PE' },
    { value: 'EC', label: 'Ecuador', flag: 'EC' },
    { value: 'VE', label: 'Venezuela', flag: 'VE' },
    { value: 'GT', label: 'Guatemala', flag: 'GT' },
    { value: 'CU', label: 'Cuba', flag: 'CU' },
    { value: 'BO', label: 'Bolivia', flag: 'BO' },
    { value: 'DO', label: 'Rep. Dominicana', flag: 'DO' },
    { value: 'HN', label: 'Honduras', flag: 'HN' },
    { value: 'PY', label: 'Paraguay', flag: 'PY' },
    { value: 'SV', label: 'El Salvador', flag: 'SV' },
    { value: 'NI', label: 'Nicaragua', flag: 'NI' },
    { value: 'CR', label: 'Costa Rica', flag: 'CR' },
    { value: 'PA', label: 'Panamá', flag: 'PA' },
    { value: 'UY', label: 'Uruguay', flag: 'UY' },
    { value: 'PR', label: 'Puerto Rico', flag: 'PR' },
    { value: 'CA', label: 'Canadá', flag: 'CA' },
    { value: 'GB', label: 'Reino Unido', flag: 'GB' },
    { value: 'FR', label: 'Francia', flag: 'FR' },
    { value: 'DE', label: 'Alemania', flag: 'DE' },
    { value: 'IT', label: 'Italia', flag: 'IT' },
    { value: 'CN', label: 'China', flag: 'CN' },
    { value: 'JP', label: 'Japón', flag: 'JP' },
    { value: 'KR', label: 'Corea del Sur', flag: 'KR' },
    { value: 'IN', label: 'India', flag: 'IN' },
    { value: 'RU', label: 'Rusia', flag: 'RU' },
    { value: 'SA', label: 'Arabia Saudita', flag: 'SA' },
    { value: 'AE', label: 'Emiratos Árabes', flag: 'AE' },
    { value: 'IL', label: 'Israel', flag: 'IL' },
    { value: 'TR', label: 'Turquía', flag: 'TR' },
    { value: 'ZA', label: 'Sudáfrica', flag: 'ZA' },
    { value: 'EG', label: 'Egipto', flag: 'EG' },
    { value: 'NG', label: 'Nigeria', flag: 'NG' },
    { value: 'AU', label: 'Australia', flag: 'AU' },
    { value: 'NL', label: 'Países Bajos', flag: 'NL' },
    { value: 'SE', label: 'Suecia', flag: 'SE' },
    { value: 'PL', label: 'Polonia', flag: 'PL' },
    { value: 'BE', label: 'Bélgica', flag: 'BE' },
    { value: 'CH', label: 'Suiza', flag: 'CH' },
    { value: 'AT', label: 'Austria', flag: 'AT' },
    { value: 'PT', label: 'Portugal', flag: 'PT' },
    { value: 'GR', label: 'Grecia', flag: 'GR' },
    { value: 'VN', label: 'Vietnam', flag: 'VN' },
    { value: 'TH', label: 'Tailandia', flag: 'TH' },
    { value: 'ID', label: 'Indonesia', flag: 'ID' },
    { value: 'MY', label: 'Malasia', flag: 'MY' },
    { value: 'PH', label: 'Filipinas', flag: 'PH' }
  ];

  /** Etnia / origen / rasgos (para personaje, locución, etc.): valor semántico + bandera representativa */
  var FLAGS_ETHNICITY_REGION = [
    { value: 'latino', label: 'Latino', flag: 'MX', description: 'Personaje o voz latina' },
    { value: 'latam', label: 'Latinoamericano', flag: 'AR', description: 'Origen latinoamericano' },
    { value: 'spain', label: 'Español (España)', flag: 'ES', description: 'España / castellano' },
    { value: 'us_american', label: 'Estadounidense', flag: 'US', description: 'US / americano' },
    { value: 'european', label: 'Europeo', flag: 'DE', description: 'Rasgos europeos' },
    { value: 'asian', label: 'Asiático', flag: 'JP', description: 'Rasgos asiáticos' },
    { value: 'south_asian', label: 'Sur de Asia', flag: 'IN', description: 'India / sur de Asia' },
    { value: 'east_asian', label: 'Asia oriental', flag: 'CN', description: 'China / Asia oriental' },
    { value: 'middle_eastern', label: 'Medio Oriente', flag: 'SA', description: 'Medio Oriente / árabe' },
    { value: 'african', label: 'Africano', flag: 'NG', description: 'Origen africano' },
    { value: 'caribbean', label: 'Caribeño', flag: 'CU', description: 'Caribe' },
    { value: 'brazilian', label: 'Brasileño', flag: 'BR', description: 'Brasil' },
    { value: 'british', label: 'Británico', flag: 'GB', description: 'Reino Unido' },
    { value: 'neutral', label: 'Neutral / diverso', flag: 'UN', description: 'Sin rasgo específico' }
  ];

  /** Devuelve opciones con emoji ya aplicado para una categoría. flag_code puede ser 'UN' (no hay emoji estándar, usamos un ícono). */
  function getFlagsOptionsByCategory(category) {
    var list = [];
    var raw = category === 'language' ? FLAGS_LANGUAGES : (category === 'country' ? FLAGS_COUNTRIES : (category === 'ethnicity_region' ? FLAGS_ETHNICITY_REGION : []));
    for (var i = 0; i < raw.length; i++) {
      var o = raw[i];
      var code = o.flag || o.value;
      var emoji = code && code.length === 2 ? countryCodeToFlag(code) : '';
      if (code === 'UN') emoji = '🌐';
      list.push({ value: o.value, label: o.label, flag: emoji, description: o.description });
    }
    return list;
  }

  function getFlagsCategories() {
    return [
      { value: 'language', label: 'Idioma', description: 'Idioma del contenido o del personaje' },
      { value: 'country', label: 'País / Región', description: 'País o región' },
      { value: 'ethnicity_region', label: 'Etnia / Origen', description: 'Rasgos, origen o locución (personaje, voz)' },
      { value: 'custom', label: 'Personalizado', description: 'Lista de opciones propia' }
    ];
  }

  global.FlagsData = {
    countryCodeToFlag: countryCodeToFlag,
    FLAGS_LANGUAGES: FLAGS_LANGUAGES,
    FLAGS_COUNTRIES: FLAGS_COUNTRIES,
    FLAGS_ETHNICITY_REGION: FLAGS_ETHNICITY_REGION,
    getFlagsOptionsByCategory: getFlagsOptionsByCategory,
    getFlagsCategories: getFlagsCategories
  };
})(typeof window !== 'undefined' ? window : this);
