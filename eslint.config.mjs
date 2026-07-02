// ESLint (flat config) — AI Smart Content
//
// Filosofía: RATCHET, no big-bang. La deuda existente queda como warnings con
// un tope (--max-warnings en lint:ci fijado al conteo actual). Si un cambio
// AGREGA violaciones, el lint falla; si las reduce, se baja el tope.
//
// Las dos reglas de oro (auditoría 2026-07-02):
//   1. Las vistas NO llaman supabase.from() directo → usar apiClient/*DataService.
//   2. Las vistas NO cuelgan listeners crudos de document/window → usar
//      this.addEventListener de BaseView (se limpian solos en destroy()).

import js from '@eslint/js';

// Globals compartidos del SPA (sin bundler todo vive en window; los que las
// reglas realmente necesitan conocer se declaran aquí, el resto lo cubre
// no-undef:off en el bloque browser).
const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  CustomEvent: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  AbortController: 'readonly',
  crypto: 'readonly',
  history: 'readonly',
  location: 'readonly',
};

const NODE_GLOBALS = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  AbortController: 'readonly',
  Blob: 'readonly',
  FormData: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'recursos/**',
      'css/**',
      'docs/**',
      'SQL/**',
      '.netlify/**',
      '.claude/**',
      'supabase/**', // edge functions en TS (Deno) — fuera del alcance de este lint
      '**/*.min.js',
      'package-lock.json',
      // Copias accidentales de Finder (git ya las ignora; el linter también).
      '**/* 2.js',
      '**/* 2.mjs',
    ],
  },

  // ── Frontend SPA (browser, sin módulos: todo script global) ──────────────
  {
    files: ['js/**/*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: BROWSER_GLOBALS,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Sin módulos ES, las clases/servicios se comparten vía window.* entre
      // 118 archivos: no-undef daría miles de falsos positivos. Off a propósito.
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      // 155 catch vacíos existentes son mayormente cleanup intencional.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      // Reglas nuevas de ESLint 10: deuda existente → warning (entra al ratchet).
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
    },
  },

  // ── Reglas de oro: solo en la capa de vistas/componentes ─────────────────
  {
    files: ['js/views/**/*.js', 'js/components/**/*.js', 'js/living.js', 'js/products.js', 'js/input-registry.js'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'CallExpression[callee.property.name="from"][callee.object.property.name="supabase"]',
          message:
            'Vista llamando supabase.from() directo. Usa apiClient.fetch()/los *DataService: centralizan cache, errores y cambios de esquema (auditoría 2026-07-02).',
        },
        {
          selector: 'CallExpression[callee.property.name="from"][callee.object.name="supabase"]',
          message:
            'Vista llamando supabase.from() directo. Usa apiClient.fetch()/los *DataService: centralizan cache, errores y cambios de esquema (auditoría 2026-07-02).',
        },
        {
          selector: 'CallExpression[callee.object.name="document"][callee.property.name="addEventListener"]',
          message:
            'Listener crudo sobre document: sobrevive al destroy() de la vista y fuga memoria/comportamiento. Usa this.addEventListener(document, ...) de BaseView.',
        },
        {
          selector: 'CallExpression[callee.object.name="window"][callee.property.name="addEventListener"]',
          message:
            'Listener crudo sobre window: sobrevive al destroy() de la vista y fuga memoria/comportamiento. Usa this.addEventListener(window, ...) de BaseView.',
        },
      ],
    },
  },

  // ── Netlify Functions + scripts (Node, CommonJS) ──────────────────────────
  {
    files: ['functions/**/*.js', 'netlify/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: NODE_GLOBALS,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
    },
  },

  // ── Scripts ESM (.mjs) y tests ────────────────────────────────────────────
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js', 'vitest.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
    },
  },
];
