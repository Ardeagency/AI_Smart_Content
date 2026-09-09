/**
 * EL MUNDO DE UNA CORRIDA — el grafo que el motor construye antes de simular.
 *
 * Portado de `lib/montaje/grafo.ts` del Simulador de accounts-arde. El grafo que
 * escribe el fork de MiroFish en `graph/graph.json` tiene la MISMA forma que el
 * que guarda aquel (uuid/name/labels/summary por nodo; extremos + fact por
 * arista), así que el cálculo se pudo traer entero.
 *
 * MiroFish no inventa a los agentes de la nada: de la semilla extrae ENTIDADES
 * —tipos de actor, organizaciones, categorías— las une con hechos, y de esos
 * nodos salen los agentes que después publican. El grafo es el REPARTO de la
 * predicción, y por eso vale mirarlo antes de leer el informe: si el mundo salió
 * pobre, el informe también.
 *
 * Aquí solo se lee, se mide y se TIENDE: colocar los nodos en el plano es un
 * cálculo, no un dibujo, y separarlo del componente permite que el mapa se pinte
 * igual en cualquier caja.
 *
 * EL TENDIDO ES DETERMINISTA A PROPÓSITO. Nada de `Math.random()`: el mismo
 * grafo ARRANCA siempre en el mismo sitio. Un mapa que se reparte de cero en
 * cada pintado no se puede leer dos veces ni señalar con el dedo — "el de arriba
 * a la izquierda" deja de significar algo.
 *
 * Y DESPUÉS FLOTA. `tender()` deja el mundo asentado; `crearMotor()` lo pone a
 * respirar: los mismos resortes, más una corriente lenta por nodo que nunca se
 * apaga. No es decoración — un mapa quieto se lee como una foto y uno pasa de
 * largo; uno que se mueve pide que lo toquen, y ahí es donde se descubre que la
 * mitad del reparto son cosas y no personas.
 */
(function () {
  'use strict';

  const LIENZO = 1000;

  /** Lo que se muestra cuando la ontología no le puso tipo al nodo. */
  const SIN_TIPO = 'Sin tipo';

  /**
   * Etiquetas que NO son un tipo de actor: las pone el motor en todos los nodos.
   *
   * Medido en un grafo real de este fork: los 19 nodos traen `labels` que
   * ARRANCAN con "Entity" y el tipo util viene detrás (`["Entity",
   * "EcommercePlatform"]`). Quedarse con la primera —como hacia el original,
   * cuyo motor las ordenaba al reves— colapsaba el mundo entero en un solo
   * grupo "Entity 19", que es exactamente no decir nada.
   */
  const GENERICAS = new Set(['Entity', 'Node']);

  /** El tipo que agrupa: la primera etiqueta que signifique algo. */
  function tipoDe(labels) {
    for (const l of labels || []) if (l && !GENERICAS.has(l)) return l;
    return SIN_TIPO;
  }

  /** Número estable a partir del uuid: la semilla del tendido. */
  function semilla(id) {
    let h = 2166136261;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  /**
   * Coloca el grafo en un lienzo de 1000×1000.
   *
   * Es un Fruchterman-Reingold corriente —repulsión entre todos, resorte por
   * arista, enfriamiento— con dos añadidos que importan para lo que se mira
   * aquí: una gravedad al centro (sin ella los nodos sueltos, que aquí son
   * muchos, se van al infinito) y un arranque en espiral por ángulo áureo en vez
   * de aleatorio, que reparte parejo y no depende del azar.
   */
  function tender(g) {
    const nodos = (g && g.nodes) || [];
    const n = nodos.length;
    const aristas = ((g && g.edges) || []).filter((e) => e.source !== e.target);

    const idx = new Map(nodos.map((nd, i) => [nd.uuid, i]));
    const grado = new Array(n).fill(0);
    for (const e of aristas) {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (a === undefined || b === undefined) continue;
      grado[a]++;
      grado[b]++;
    }

    // Arranque en espiral: radio por índice, ángulo áureo, y un empujón mínimo
    // derivado del uuid para que dos nodos gemelos no nazcan exactamente encima.
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const AUREO = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const rad = (LIENZO / 2.4) * Math.sqrt((i + 0.5) / Math.max(1, n));
      const ang = i * AUREO + semilla(nodos[i].uuid) * 0.6;
      x[i] = LIENZO / 2 + rad * Math.cos(ang);
      y[i] = LIENZO / 2 + rad * Math.sin(ang);
    }

    if (n > 1) {
      // El área por nodo fija la distancia natural entre dos vecinos.
      const k = Math.sqrt((LIENZO * LIENZO) / n);
      // El coste es O(vueltas · n²) y esto corre en el navegador al abrir la
      // corrida. Los mundos reales van de 12 a 50 nodos y ahí se puede iterar
      // hasta que asiente (~25 ms); de 150 para arriba se recorta a lo que
      // cuesta menos de un segundo, aceptando un tendido más crudo antes que una
      // pestaña congelada.
      const vueltas = n <= 60 ? 300 : n <= 150 ? 120 : 35;
      let paso0 = LIENZO / 12;

      const dx = new Float64Array(n);
      const dy = new Float64Array(n);

      for (let it = 0; it < vueltas; it++) {
        dx.fill(0);
        dy.fill(0);

        // repulsión: todos contra todos
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            let ux = x[i] - x[j];
            let uy = y[i] - y[j];
            let d2 = ux * ux + uy * uy;
            if (d2 < 0.01) {
              // Dos nodos superpuestos no tienen dirección en la que separarse:
              // se les inventa una, estable, a partir de sus índices.
              ux = (i - j) * 0.01 + 0.01;
              uy = (i + j) * 0.007 + 0.01;
              d2 = ux * ux + uy * uy;
            }
            const f = (k * k) / d2;
            dx[i] += ux * f;
            dy[i] += uy * f;
            dx[j] -= ux * f;
            dy[j] -= uy * f;
          }
        }

        // resorte: solo los unidos
        for (const e of aristas) {
          const a = idx.get(e.source);
          const b = idx.get(e.target);
          if (a === undefined || b === undefined) continue;
          const ux = x[a] - x[b];
          const uy = y[a] - y[b];
          const d = Math.sqrt(ux * ux + uy * uy) || 0.01;
          const f = (d * d) / k / d;
          dx[a] -= ux * f;
          dy[a] -= uy * f;
          dx[b] += ux * f;
          dy[b] += uy * f;
        }

        // gravedad: sin esto los nodos sin aristas —que en estos mundos son
        // varios— se van al infinito y el mapa queda vacío con el borde lleno.
        for (let i = 0; i < n; i++) {
          dx[i] += (LIENZO / 2 - x[i]) * 0.012;
          dy[i] += (LIENZO / 2 - y[i]) * 0.012;
        }

        for (let i = 0; i < n; i++) {
          const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1;
          const mueve = Math.min(d, paso0);
          x[i] += (dx[i] / d) * mueve;
          y[i] += (dy[i] / d) * mueve;
        }
        paso0 *= 0.975;
      }
    }

    // Encuadre: el resultado se estira hasta llenar el lienzo, con margen para
    // el radio del nodo más gordo y su nombre.
    const maxGrado = Math.max(1, ...grado);
    const radio = (g0) => 7 + 17 * Math.sqrt(g0 / maxGrado);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]);
      minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]);
    }
    const margen = 60;
    const anchoUtil = LIENZO - margen * 2;
    const escala = n > 1
      ? Math.min(anchoUtil / Math.max(1, maxX - minX), anchoUtil / Math.max(1, maxY - minY))
      : 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const colocados = nodos.map((nd, i) => ({
      uuid: nd.uuid,
      name: nd.name || '',
      labels: nd.labels || [],
      summary: nd.summary || '',
      x: n > 1 ? LIENZO / 2 + (x[i] - cx) * escala : LIENZO / 2,
      y: n > 1 ? LIENZO / 2 + (y[i] - cy) * escala : LIENZO / 2,
      grado: grado[i],
      r: radio(grado[i]),
      // La MITAD de los nodos de un mundo real no tiene tipo (medido: 24 de 47).
      // No son actores: son cosas que se nombraron —"la pieza", "calidad", "AI
      // films"—. Llamarlos "Actor" por defecto haría leer un reparto que no
      // existe, justo el error que este mapa está puesto a destapar.
      etiqueta: tipoDe(nd.labels),
    }));

    // DESCRUCE. El tendido separa por fuerza, no por tamaño: dos nodos gordos
    // pueden quedar tocándose y ahí el mapa se lee como una mancha. Unas pocas
    // vueltas empujando solo los pares que se pisan cuestan nada y es lo que
    // convierte el resultado en algo que se puede señalar con el dedo.
    const AIRE = 7;
    const vueltasDescruce = colocados.length <= 150 ? 24 : 8;
    for (let it = 0; it < vueltasDescruce; it++) {
      let movio = false;
      for (let i = 0; i < colocados.length; i++) {
        for (let j = i + 1; j < colocados.length; j++) {
          const a = colocados[i];
          const b = colocados[j];
          const minimo = a.r + b.r + AIRE;
          let ux = b.x - a.x;
          let uy = b.y - a.y;
          let d = Math.sqrt(ux * ux + uy * uy);
          if (d >= minimo) continue;
          if (d < 0.001) {
            ux = (i % 2 === 0 ? 1 : -1) * 0.5;
            uy = 0.5;
            d = Math.sqrt(ux * ux + uy * uy);
          }
          const empuje = (minimo - d) / 2;
          a.x -= (ux / d) * empuje;
          a.y -= (uy / d) * empuje;
          b.x += (ux / d) * empuje;
          b.y += (uy / d) * empuje;
          movio = true;
        }
      }
      if (!movio) break;
    }

    const porId = new Map(colocados.map((c) => [c.uuid, c]));
    const tendidas = [];
    for (const e of aristas) {
      const a = porId.get(e.source);
      const b = porId.get(e.target);
      if (!a || !b) continue;
      tendidas.push(Object.assign({}, e, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }

    const cuenta = new Map();
    for (const c of colocados) cuenta.set(c.etiqueta, (cuenta.get(c.etiqueta) || 0) + 1);

    return {
      nodos: colocados,
      aristas: tendidas,
      etiquetas: [...cuenta.entries()]
        .map(([nombre, cuantos]) => ({ nombre, cuantos }))
        .sort((a, b) => b.cuantos - a.cuantos || a.nombre.localeCompare(b.nombre)),
      ancho: LIENZO,
      alto: LIENZO,
    };
  }

  /** Los hechos que tocan a un actor, con el nombre del otro lado ya resuelto. */
  function hechosDe(g, uuid) {
    return ((g && g.edges) || [])
      .filter((e) => e.source === uuid || e.target === uuid)
      .map((e) => ({
        fact: e.fact,
        tipo: e.fact_type,
        otro: e.source === uuid ? e.target_name : e.source_name,
        sale: e.source === uuid,
      }));
  }

  // ══════════════════════════════════════════════════════════════════════
  // EL MOTOR — lo que hace que el mundo flote
  //
  // `tender()` deja las burbujas donde tienen que estar; esto las mantiene
  // vivas. Es la misma física del tendido a fuego lento —repulsión, resorte,
  // gravedad al centro— más dos cosas que solo tienen sentido en movimiento:
  //
  //   · una CORRIENTE por nodo (dos senos desfasados con la semilla del uuid)
  //     que nunca se apaga: sin ella el sistema encuentra su equilibrio en tres
  //     segundos y vuelve a ser una foto;
  //   · un choque duro que separa las burbujas que se pisan, para que la deriva
  //     no las amontone.
  //
  // El estado son arrays planos y se muta en sitio: esto corre 60 veces por
  // segundo y no puede reservar memoria en cada vuelta.
  // ══════════════════════════════════════════════════════════════════════

  const CENTRO = LIENZO / 2;
  const AIRE_M = 7;
  const AMORTIGUA = 0.9;

  /**
   * Los pesos de las cuatro fuerzas.
   *
   * NO SON INTUICIÓN: se midieron corriendo 20 segundos de simulación sobre un
   * mundo real (47 nodos) y mirando dos cosas —que la nube conserve el tamaño
   * del lienzo en vez de encogerse a un punto, y que ninguna burbuja se monte
   * sobre otra—. Con la gravedad alta que parecía razonable, el mundo se
   * contraía de 1000 a 210 de ancho en veinte segundos: se veía bien el primer
   * segundo y después era un nudo.
   */
  const ALIENTO = {
    gravedad: 0.02,
    repulsion: 1.2,
    resorte: 1.6,
    /** Cuánto empuja la corriente. Subirlo hace un mar; esto es una respiración. */
    corriente: 9,
  };

  /**
   * OJO AL ORDEN DE LAS ARISTAS: `ea`/`eb` salen de `t.aristas` en su mismo
   * orden, y el mapa cuenta con eso para escribir cada línea del SVG por su
   * índice. `tender()` ya devuelve solo las aristas con los dos extremos vivos,
   * así que ninguna se cae aquí y las dos listas miden lo mismo.
   */
  function crearMotor(t) {
    const n = t.nodos.length;
    const idx = new Map(t.nodos.map((nd, i) => [nd.uuid, i]));
    const pares = [];
    for (const a of t.aristas) {
      const i = idx.get(a.source);
      const j = idx.get(a.target);
      if (i !== undefined && j !== undefined) pares.push(i, j);
    }
    return Object.assign({
      n,
      x: Float64Array.from(t.nodos, (nd) => nd.x),
      y: Float64Array.from(t.nodos, (nd) => nd.y),
      vx: new Float64Array(n),
      vy: new Float64Array(n),
      r: Float64Array.from(t.nodos, (nd) => nd.r),
      /** El desfase de la corriente de cada burbuja. Del uuid, no del azar. */
      fase: Float64Array.from(t.nodos, (nd) => semilla(nd.uuid) * Math.PI * 2),
      ea: Int32Array.from(pares.filter((_, i) => i % 2 === 0)),
      eb: Int32Array.from(pares.filter((_, i) => i % 2 === 1)),
      k: Math.sqrt((LIENZO * LIENZO) / Math.max(1, n)),
      t: 0,
      /** El acumulador de fuerzas, reservado una vez: esto corre 60 veces/s. */
      fx: new Float64Array(n),
      fy: new Float64Array(n),
    }, ALIENTO);
  }

  /**
   * Un paso de la simulación. `dt` en segundos, ya limitado por quien llama: una
   * pestaña que vuelve de segundo plano entrega saltos de varios segundos y con
   * ellos el mundo explota.
   */
  function paso(m, dt) {
    const { n, x, y, vx, vy, r, fase, ea, eb, k, fx, fy } = m;
    m.t += dt;
    const t = m.t;
    fx.fill(0);
    fy.fill(0);

    // repulsión + choque, en la misma pasada de pares
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ux = x[i] - x[j];
        let uy = y[i] - y[j];
        let d2 = ux * ux + uy * uy;
        if (d2 < 0.01) {
          ux = (i - j) * 0.01 + 0.01;
          uy = (i + j) * 0.007 + 0.01;
          d2 = ux * ux + uy * uy;
        }
        const d = Math.sqrt(d2);
        // La repulsión se limita: dos burbujas casi pegadas darían una fuerza
        // enorme y un salto que se ve como un tirón.
        const f = Math.min(120, (k * k) / d2) * m.repulsion;
        fx[i] += (ux / d) * f;
        fy[i] += (uy / d) * f;
        fx[j] -= (ux / d) * f;
        fy[j] -= (uy / d) * f;

        const minimo = r[i] + r[j] + AIRE_M;
        if (d < minimo) {
          const empuje = (minimo - d) * 8;
          fx[i] += (ux / d) * empuje;
          fy[i] += (uy / d) * empuje;
          fx[j] -= (ux / d) * empuje;
          fy[j] -= (uy / d) * empuje;
        }
      }
    }

    // resorte: los unidos se buscan
    const reposo = k * 0.75;
    for (let e = 0; e < ea.length; e++) {
      const i = ea[e];
      const j = eb[e];
      const ux = x[j] - x[i];
      const uy = y[j] - y[i];
      const d = Math.sqrt(ux * ux + uy * uy) || 0.01;
      const f = (d - reposo) * m.resorte;
      fx[i] += (ux / d) * f;
      fy[i] += (uy / d) * f;
      fx[j] -= (ux / d) * f;
      fy[j] -= (uy / d) * f;
    }

    for (let i = 0; i < n; i++) {
      // gravedad al centro: sin esto los sueltos —que son muchos— se van del mapa
      fx[i] += (CENTRO - x[i]) * m.gravedad;
      fy[i] += (CENTRO - y[i]) * m.gravedad;

      // la corriente: dos senos lentos y desfasados, distintos en cada burbuja
      fx[i] += Math.cos(t * 0.55 + fase[i]) * m.corriente;
      fy[i] += Math.sin(t * 0.41 + fase[i] * 1.7) * m.corriente;

      vx[i] = (vx[i] + fx[i] * dt) * AMORTIGUA;
      vy[i] = (vy[i] + fy[i] * dt) * AMORTIGUA;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }
  }

  window.PredGrafo = { tender, crearMotor, paso, hechosDe, SIN_TIPO, LIENZO };
})();
