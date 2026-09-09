/**
 * DIRECCION — la gramática que comparten los paneles que dirigen al modelo.
 *
 * Portada del Studio de accounts-arde (`lib/studio/direccion.ts`), que a su vez
 * sigue el patrón del Cinema Studio de Open Generative AI (MIT).
 *
 * LA REGLA DE LA CASA: una opción NO es una selección, es una VARIABLE DE
 * PROMPT. Cada una lleva tres cosas:
 *
 *   valor   la etiqueta corta que se ve en el tile ("Slow Push In", "f/1.8")
 *   prompt  la frase que viaja al modelo ("The camera slowly pushes in…")
 *   desc    qué hace, para quien no es del oficio (tooltip)
 *
 * Mandar la etiqueta cruda sería desperdiciar el control: "Rim light" es una
 * pista, "A rim light traces the subject's edge, separating it from the
 * background" es una instrucción. El modelo produce con lo segundo.
 *
 * ── LAS VARIABLES DENTRO DEL PROMPT ─────────────────────────────────────────
 *
 * Elegir una opción no prende un botón: ESCRIBE una variable en el prompt,
 * donde esté el cursor. El texto es la única verdad — lo que se ve escrito es
 * exactamente lo que se va a pedir, y se borra como se borra una palabra.
 *
 *   Forma: [Etiqueta: Valor]   ->   [Lente: 85mm (Portrait)]
 *
 * Lleva la ETIQUETA y no solo el valor porque los valores se repiten entre
 * campos: "Warm" existe en Temperatura y en Color grade, y sin el campo no hay
 * forma de saber cuál frase toca. Con la etiqueta, además, el prompt se lee.
 *
 * Eso resuelve de raíz el problema de tener la decisión en dos sitios: con
 * selects aparte, el panel decía una cosa y el prompt otra, y solo al producir
 * se sabía cuál mandó.
 */
(function () {
  'use strict';

  /** Cómo se escribe una variable. Un solo sitio, para que nadie la arme a mano. */
  function variable(etiqueta, valor) {
    return `[${etiqueta}: ${valor}]`;
  }

  /**
   * Reconoce una variable escrita. Se construye nueva en cada uso porque una
   * regex con /g guarda `lastIndex`: compartir la instancia hace que la segunda
   * llamada empiece a mitad del texto y se salte variables.
   */
  function reVariable() {
    return /\[([^[\]:]+):\s*([^[\]]+)\]/g;
  }

  /** Etiqueta visible -> campo interno. Sale de las pestañas, no se duplica. */
  function indicePorEtiqueta(catalogo) {
    const m = new Map();
    (catalogo.pestanas || []).forEach((p) => {
      (p.bloques || []).forEach((b) => m.set(String(b.etiqueta).trim().toLowerCase(), b.campo));
    });
    return m;
  }

  /**
   * Cambia cada `[Etiqueta: Valor]` por la FRASE de esa opción, en el sitio
   * donde quedó escrita. Ese sitio importa: una dirección de lente puesta junto
   * al sujeto pesa distinto que la misma al final del prompt.
   *
   * Lo que no resuelve se deja TAL CUAL. Unos corchetes que el usuario escribió
   * a mano son texto suyo, y borrárselos sería editarle el prompt por detrás.
   */
  function expandirVariables(catalogo, texto) {
    if (!catalogo || typeof texto !== 'string') return texto || '';
    const idx = indicePorEtiqueta(catalogo);
    return texto.replace(reVariable(), (crudo, et, val) => {
      const campo = idx.get(String(et).trim().toLowerCase());
      if (!campo) return crudo;
      const o = (catalogo.opciones[campo] || []).find((x) => x.valor === String(val).trim());
      return o && o.prompt ? o.prompt : crudo;
    });
  }

  /** Las variables escritas en un texto, en el orden en que aparecen. */
  function leerVariables(texto) {
    const salida = [];
    if (typeof texto !== 'string') return salida;
    for (const m of texto.matchAll(reVariable())) {
      salida.push({ etiqueta: m[1].trim(), valor: m[2].trim() });
    }
    return salida;
  }

  /** La etiqueta visible de un campo, buscándola en las pestañas del catálogo. */
  function etiquetaDeCampo(catalogo, campo) {
    for (const p of catalogo.pestanas || []) {
      const b = (p.bloques || []).find((x) => x.campo === campo);
      if (b) return b.etiqueta;
    }
    return campo;
  }

  /**
   * Las variables de una RECETA, listas para escribirse de golpe.
   *
   * En el orden del catálogo, que no es un detalle: un plano se describe en
   * orden —sujeto, encuadre, óptica, luz, acabado— y así el prompt se lee como
   * lo leería un fotógrafo, no como una lista de ajustes.
   */
  function variablesDeReceta(catalogo, valores) {
    if (!catalogo || !valores) return [];
    return (catalogo.orden || [])
      .filter((campo) => valores[campo])
      .map((campo) => {
        const valor = valores[campo];
        const o = (catalogo.opciones[campo] || []).find((x) => x.valor === valor);
        return {
          etiqueta: etiquetaDeCampo(catalogo, campo),
          valor,
          prompt: (o && o.prompt) || valor
        };
      });
  }

  /**
   * Deriva `orden` y `pestanas` de una descripción compacta y valida que cada
   * campo citado tenga opciones. Un bloque que apunta a un campo inexistente
   * pinta una rejilla vacía sin avisar: el panel se ve completo y no lo está.
   */
  function armarCatalogo({ titulo, opciones, presets, pestanas }) {
    const campos = [];
    (pestanas || []).forEach((p) => {
      (p.bloques || []).forEach((b) => {
        if (!opciones[b.campo]) {
          throw new Error(`Catálogo "${titulo}": el bloque "${b.etiqueta}" apunta a un campo sin opciones (${b.campo})`);
        }
        campos.push(b.campo);
      });
    });
    return { titulo, orden: campos, opciones, presets: presets || [], pestanas: pestanas || [] };
  }

  window.StudioDireccion = {
    variable,
    reVariable,
    expandirVariables,
    leerVariables,
    variablesDeReceta,
    etiquetaDeCampo,
    armarCatalogo
  };
})();
