/**
 * DashboardView - Dashboard de análisis para org (datos falsos / demo).
 * Sigue el mismo patrón que OrganizationView: BaseView + templatePath, onEnter con auth/orgId.
 * Todos los datos son estáticos para demo.
 */
class DashboardView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'dashboard.html';
    this.orgId = null;
    this.orgName = null;
    this.chartInstances = [];
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.orgId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (!this.orgId) {
      const url = window.authService?.getDefaultUserRoute && window.authService.getCurrentUser()?.id
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
        : '/settings';
      if (window.router) window.router.navigate(url, true);
      return;
    }
    if (window.appState) window.appState.set('selectedOrganizationId', this.orgId, true);
    localStorage.setItem('selectedOrganizationId', this.orgId);
    this.orgName = window.currentOrgName || 'Mi Organización';
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Dashboard', null, this.orgName);
  }

  async init() {
    this.fillStaticSections();
    await this.loadCharts();
  }

  destroy() {
    this.chartInstances.forEach(chart => chart?.destroy());
    this.chartInstances = [];
    super.destroy();
  }

  loadCharts() {
    if (window.Chart) {
      this.initAllCharts();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = () => {
        this.initAllCharts();
        resolve();
      };
      s.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
      document.head.appendChild(s);
    });
  }

  fillStaticSections() {
    // Estado Estratégico Actual
    const estadoEl = document.getElementById('dashboardEstadoTexto');
    if (estadoEl) estadoEl.textContent = 'Tu perfil mantiene una percepción positiva y un engagement estable, pero está subutilizando oportunidades de publicación frente al ecosistema. El contenido en video funciona, aunque la frecuencia actual limita el crecimiento.';

    // Indicadores Clave (labels/valores ya en HTML, opcional rellenar por JS)
    // Tabla "Qué está funcionando"
    const tableBody = document.getElementById('dashboardTablaEcosistemaBody');
    if (tableBody) {
      const rows = [
        { variable: 'Tema con más engagement', ecosistema: 'politica', tuPerfil: 'social' },
        { variable: 'Hashtag más viral', ecosistema: '#oposiciondemocratica', tuPerfil: '#medellin' },
        { variable: 'Tono dominante', ecosistema: 'institucional', tuPerfil: 'agradecimiento' },
        { variable: 'Formato dominante', ecosistema: 'Video', tuPerfil: 'Video' }
      ];
      tableBody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.variable}</td>
          <td class="dashboard-ecosistema">${r.ecosistema}</td>
          <td class="dashboard-tu-perfil">${r.tuPerfil}</td>
        </tr>
      `).join('');
    }

    // Oportunidades (contenido ya en HTML)
    // Estrategia Sugerida (MANTÉN, AJUSTA, PRUEBA) ya en HTML
    // Mapa de Contenido Sugerido
    const mapaBody = document.getElementById('dashboardMapaBody');
    if (mapaBody) {
      const mapaRows = [
        { tipo: 'Post', tema: 'politica', tono: 'agresivo', formato: 'Video', cta: '¿Qué opinas sobre este tema?' },
        { tipo: 'Hilo', tema: 'social', tono: 'agresivo', formato: 'Video', cta: '¿Qué opinas sobre este tema?' },
        { tipo: 'Imagen', tema: 'seguridad', tono: 'agresivo', formato: 'Video', cta: '¿Qué opinas sobre este tema?' }
      ];
      mapaBody.innerHTML = mapaRows.map(r => `
        <tr>
          <td>${r.tipo}</td>
          <td>${r.tema}</td>
          <td><span class="dashboard-badge dashboard-badge-tono">${r.tono}</span></td>
          <td><span class="dashboard-badge dashboard-badge-formato">${r.formato}</span></td>
          <td><span class="dashboard-badge dashboard-badge-cta">${r.cta}</span></td>
        </tr>
      `).join('');
    }

    // Radar Estratégico cards
    const radarGrid = document.getElementById('dashboardRadarGrid');
    if (radarGrid) {
      const temas = [
        { nombre: 'politica', sentimiento: '32% Negativo', crecimiento: 'Alto', perfiles: '10+', potencial: 'Medio', engagement: '14.6K' },
        { nombre: 'social', sentimiento: '40% Neutral', crecimiento: 'Alto', perfiles: '10+', potencial: 'Medio', engagement: '17.9K' },
        { nombre: 'seguridad', sentimiento: '29% Negativo', crecimiento: 'Alto', perfiles: '10+', potencial: 'Medio', engagement: '12.8K' },
        { nombre: 'general', sentimiento: '35% Neutral', crecimiento: 'Medio', perfiles: '8+', potencial: 'Alto', engagement: '11.2K' },
        { nombre: 'deporte', sentimiento: '22% Positivo', crecimiento: 'Medio', perfiles: '6+', potencial: 'Medio', engagement: '9.4K' },
        { nombre: 'infraestructura', sentimiento: '31% Negativo', crecimiento: 'Bajo', perfiles: '5+', potencial: 'Bajo', engagement: '8.1K' }
      ];
      const sentimentClass = s => s.includes('Negativo') ? 'dashboard-sentimiento-negativo' : s.includes('Neutral') ? 'dashboard-sentimiento-neutral' : 'dashboard-sentimiento-positivo';
      radarGrid.innerHTML = temas.map(t => `
        <div class="dashboard-radar-card card glass">
          <div class="dashboard-radar-card-title">${t.nombre}</div>
          <span class="dashboard-badge ${sentimentClass(t.sentimiento)}">${t.sentimiento}</span>
          <ul class="dashboard-radar-metrics">
            <li>Crecimiento: ${t.crecimiento}</li>
            <li>Perfiles usando: ${t.perfiles}</li>
            <li>Potencial: ${t.potencial}</li>
            <li>Engagement promedio: ${t.engagement}</li>
          </ul>
        </div>
      `).join('');
    }

    // Evolución del Perfil (timeline + mejor período)
    const evolucionList = document.getElementById('dashboardEvolucionList');
    if (evolucionList) {
      const periodos = [
        { label: 'Último mes', tono: 'neutral', engagement: '0', sentimiento: 'Sentimiento neutral.', publicaciones: '0' },
        { label: 'Hace 2-3 meses', tono: 'agradecimiento', engagement: '625', sentimiento: 'Sentimiento positivo: 100%.', publicaciones: '5' },
        { label: 'Hace 4-6 meses', tono: 'neutro', engagement: '1.0K', sentimiento: 'Sentimiento positivo: 100%.', publicaciones: '12' }
      ];
      evolucionList.innerHTML = periodos.map(p => `
        <li class="dashboard-evolucion-item">
          <span class="dashboard-evolucion-dot"></span>
          <span>${p.label}: Tono dominante: <mark>${p.tono}</mark>. Engagement promedio: <mark>${p.engagement}</mark>. ${p.sentimiento} ${p.publicaciones} publicaciones.</span>
        </li>
      `).join('');
    }
    const mejorPeriodoEl = document.getElementById('dashboardMejorPeriodoTexto');
    if (mejorPeriodoEl) mejorPeriodoEl.textContent = 'Hace 4-6 meses fue tu mejor momento con un engagement promedio de 1.0K. El tono neutro y el sentimiento positivo fueron clave en este período.';
  }

  initAllCharts() {
    const Chart = window.Chart;
    if (!Chart) return;

    const fechas = ['23 Feb 2026', '24 Feb 2026', '25 Feb 2026', '26 Feb 2026', '27 Feb 2026', '28 Feb 2026', '01 Mar 2026', '02 Mar 2026'];
    const fechasShort = ['23/02', '24/02', '25/02', '26/02', '27/02', '28/02', '01/03', '02/03'];
    const perfiles = ['Andrés Guerra', 'Andrés Tobón', 'Anibal Gaviria', 'Daniel Quintero Calle', 'Fico Gutiérrez', 'Manuel Villa Mejia', 'Sebastián López', 'David Escobar'];
    const colores = ['#1e3a5f', '#2c5f8d', '#3d7ab5', '#5a9bd5', '#7eb8e8', '#a3d0f0', '#6b7b8a', '#9ca3af'];

    // 1. Historial de Actividades (line/area, Y 0-12)
    const c1 = document.getElementById('chartActividades');
    if (c1) {
      const datasets = perfiles.map((p, i) => ({
        label: p,
        data: [2, 4, 3, 6, 5, 8, 7, 10],
        borderColor: colores[i],
        backgroundColor: colores[i] + '40',
        fill: true,
        tension: 0.3
      }));
      this.chartInstances.push(new Chart(c1, {
        type: 'line',
        data: { labels: fechas, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { min: 0, max: 12 }, x: { grid: { display: false } } }
        }
      }));
    }

    // 2. Tendencia de Engagement (Y 0-300K)
    const c2 = document.getElementById('chartEngagement');
    if (c2) {
      const datasets = perfiles.map((p, i) => ({
        label: p,
        data: [40e3, 80e3, 120e3, 180e3, 220e3, 250e3, 270e3, 290e3].map((v, j) => v + (j * 1e3 * (i + 1)) % 30e3),
        borderColor: colores[i],
        backgroundColor: colores[i] + '40',
        fill: true,
        tension: 0.3
      }));
      this.chartInstances.push(new Chart(c2, {
        type: 'line',
        data: { labels: fechasShort, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: { min: 0, max: 300000, ticks: { callback: v => (v / 1000).toFixed(0) + 'K' } },
            x: { grid: { display: false } }
          }
        }
      }));
    }

    // 3. Patrón de Horas (stacked bar, 12am-11pm, Y 0-30)
    const c3 = document.getElementById('chartHoras');
    if (c3) {
      const horas = ['12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM', '4:00 AM', '5:00 AM', '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'];
      const stackData = perfiles.map((p, i) => ({
        label: p,
        data: horas.map((_, h) => (h >= 8 && h <= 12 ? 2 : h >= 18 && h <= 21 ? 3 : 1) + (i % 2)),
        backgroundColor: colores[i]
      }));
      this.chartInstances.push(new Chart(c3, {
        type: 'bar',
        data: { labels: horas, datasets: stackData },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, max: 30 } }
        }
      }));
    }

    // 4. Actividad de Sentimientos (Positivo, Negativo, Neutro)
    const c4 = document.getElementById('chartSentimientos');
    if (c4) {
      this.chartInstances.push(new Chart(c4, {
        type: 'line',
        data: {
          labels: fechasShort,
          datasets: [
            { label: 'Positivo', data: [6, 8, 10, 14, 12, 10, 11, 9], borderColor: '#5a9bd5', backgroundColor: '#5a9bd540', fill: true, tension: 0.3 },
            { label: 'Neutro', data: [4, 5, 4, 5, 5, 6, 5, 5], borderColor: '#6bbf9a', backgroundColor: '#6bbf9a40', fill: true, tension: 0.3 },
            { label: 'Negativo', data: [0.5, 0.2, 0.3, 0.1, 0.2, 0.4, 0.2, 0.3], borderColor: '#1e3a5f', backgroundColor: '#1e3a5f40', fill: true, tension: 0.3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { min: 0, max: 14 }, x: { grid: { display: false } } }
        }
      }));
    }

    // 5. Crecimiento (%)
    const c5 = document.getElementById('chartCrecimiento');
    if (c5) {
      const nombresCrec = ['Daniel Quintero Calle', 'Fico Gutiérrez', 'Andrés Tobón', 'Aníbal Gaviria', 'Andrés Guerra', 'Manuel Villa Mejía', 'Sebastián López'];
      const coloresCrec = ['#1e3a5f', '#3d7ab5', '#5a9bd5', '#7eb8e8', '#9ca3af', '#2c5f8d', '#6b7b8a'];
      const datasets = nombresCrec.map((n, i) => ({
        label: n,
        data: [50, 200, 150, 100, 80, 400, 300].map((b, j) => b + (i * 20) + (j * 10)),
        borderColor: coloresCrec[i],
        backgroundColor: coloresCrec[i] + '30',
        fill: true,
        tension: 0.3
      }));
      this.chartInstances.push(new Chart(c5, {
        type: 'line',
        data: { labels: fechasShort, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { min: -100, max: 500, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
        }
      }));
    }

    // 6. Comparación de Perfiles (grouped bar: Cantidad Contenido + % Engagement en eje derecho)
    const c6 = document.getElementById('chartComparacionPerfiles');
    if (c6) {
      const perfilesC = ['Fico', 'Daniel Q.', 'Andrés T.', 'Sebastián L.', 'Anibal G.', 'Manuel V.', 'Andrés G.', 'David E.'];
      this.chartInstances.push(new Chart(c6, {
        type: 'bar',
        data: {
          labels: perfilesC,
          datasets: [
            { label: 'Cantidad de Contenido', data: [55, 38, 38, 38, 38, 38, 38, 35], backgroundColor: '#5a9bd5', yAxisID: 'y' },
            { label: '% Engagement', data: [52, 48, 65, 58, 45, 50, 72, 40], backgroundColor: '#1e3a5f', yAxisID: 'y1' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: { min: 0, max: 60, title: { display: true, text: 'Cantidad de Contenido' } },
            y1: { position: 'right', min: 40, max: 100, ticks: { callback: v => v + '%' }, title: { display: true, text: '% Engagement' }, grid: { drawOnChartArea: false } }
          }
        }
      }));
    }

    // 7. Temas Dominantes (horizontal bar)
    const c7 = document.getElementById('chartTemasDominantes');
    if (c7) {
      const temas = ['politica', 'seguridad', 'social', 'justicia', 'riesgo', 'general', 'salud', 'movilidad', 'tecnologia', 'liderazgo'];
      const valores = [125, 65, 55, 15, 20, 50, 20, 25, 20, 30];
      this.chartInstances.push(new Chart(c7, {
        type: 'bar',
        data: {
          labels: temas,
          datasets: [{ label: 'Frecuencia', data: valores, backgroundColor: '#2c5f8d' }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { max: 140 }, y: { grid: { display: false } } }
        }
      }));
    }

    // 8. Top Hashtags
    const c8 = document.getElementById('chartTopHashtags');
    if (c8) {
      const tags = ['#lagranconsulta', '#anibalpresidente', '#medellín', '#unidosporcolombia', '#debate', '#oposiciondemocratica', '#niuntintoconpetro', '#unidos', '#petro', '#108'];
      const vals = [8.5, 4, 3, 3, 2.8, 2.5, 2, 2, 1.5, 1.2];
      this.chartInstances.push(new Chart(c8, {
        type: 'bar',
        data: {
          labels: tags,
          datasets: [{ label: 'Frecuencia', data: vals, backgroundColor: '#2c5f8d' }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { max: 9 }, y: { grid: { display: false } } }
        }
      }));
    }

    // 9. Índice de Presencia Digital
    const c9 = document.getElementById('chartIndicePresencia');
    if (c9) {
      const nombres = ['Fico Gutiérrez', 'Daniel Quintero Calle', 'Sebastián López', 'Andrés Tobón', 'Anibal Gaviria', 'Andrés Guerra', 'Manuel Villa Mejía', 'David Escobar'];
      const vals = [85, 40, 25, 25, 22, 20, 18, 5];
      this.chartInstances.push(new Chart(c9, {
        type: 'bar',
        data: {
          labels: nombres,
          datasets: [{ label: '%', data: vals, backgroundColor: ['#3d7ab5', '#5a9bd5', '#3d7ab5', '#5a9bd5', '#3d7ab5', '#5a9bd5', '#3d7ab5', '#5a9bd5'] }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }
        }
      }));
    }

    // 10. Comparación de Plataformas
    const c10 = document.getElementById('chartPlataformas');
    if (c10) {
      this.chartInstances.push(new Chart(c10, {
        type: 'bar',
        data: {
          labels: ['X/Twitter', 'Instagram'],
          datasets: [{ label: 'Puntuación de Calidad', data: [72, 55], backgroundColor: '#2c5f8d' }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { min: 0, max: 80 }, y: { grid: { display: false } } }
        }
      }));
    }

    // 11. Tonos
    const c11 = document.getElementById('chartTonos');
    if (c11) {
      const tonos = ['urgente', 'celebratorio', 'informativo', 'motivacional', 'reflexivo'];
      const vals = [68, 62, 58, 38, 22];
      this.chartInstances.push(new Chart(c11, {
        type: 'bar',
        data: {
          labels: tonos,
          datasets: [{ label: 'Puntuación de Tono', data: vals, backgroundColor: '#1e3a5f' }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { min: 0, max: 70 }, y: { grid: { display: false } } }
        }
      }));
    }

    // 12. Sentimientos por Perfiles (stacked bar)
    const c12 = document.getElementById('chartSentimientosPerfiles');
    if (c12) {
      const perfilesS = ['Fico Gutiérrez', 'Daniel Quintero Calle', 'Andrés Tobón', 'Sebastián López', 'Anibal Gaviria', 'Manuel Vila Mejía', 'Andrés Guerra', 'David Escobar'];
      this.chartInstances.push(new Chart(c12, {
        type: 'bar',
        data: {
          labels: perfilesS,
          datasets: [
            { label: 'Positivo', data: [9, 6, 8, 10, 7, 9, 13, 0], backgroundColor: '#2c5f8d' },
            { label: 'Neutro', data: [0, 8, 2, 3, 5, 2, 5, 0], backgroundColor: '#9ca3af' },
            { label: 'Negativo', data: [0, 0, 0, 0, 0, 0, 0, 0], backgroundColor: '#1e3a5f' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { x: { stacked: true }, y: { stacked: true, max: 20 } }
        }
      }));
    }
  }
}

window.DashboardView = DashboardView;
