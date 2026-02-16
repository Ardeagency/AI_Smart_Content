# SECCIÓN 3 · TRÁFICO Y CONTROL DE PRODUCCIÓN
## Plan de Implementación - Data Layer

---

## 📋 RESUMEN EJECUTIVO

La Sección 3 del dashboard Living es el **panel de control estratégico** que transforma datos en decisiones creativas. No es decorativa, es operativa y profesional.

---

## 🎯 BLOQUES DE MÉTRICAS

### **BLOQUE 1: ESTADO DEL ESTUDIO**

**Función SQL:** `get_studio_activity_status(brand_id)`

**Métricas:**
- Estado: `active` | `paused` | `inactive`
- Última actividad (timestamp)
- Horas desde última actividad
- Mensaje contextual

**Lógica:**
- `< 24h` → `active` ("Activo hoy")
- `24h - 7d` → `paused` ("Producción en pausa")
- `> 7d` → `inactive` ("Sin actividad reciente")

**Fuentes:**
- `flow_runs.created_at`
- `flow_outputs.created_at`

**Nota:** Esta es una lectura de pulso, no una métrica dura. Debe calcularse rápido y cachearse.

---

### **BLOQUE 2: ENTIDAD MÁS PRODUCIDA**

**Función SQL:** `get_top_produced_entity(brand_container_id)`

**Métricas:**
- Nombre de la entidad
- Tipo de entidad (producto/servicio/sede)
- Total de producciones
- Total de runs

**Fuentes:**
- `brand_entities`
- `flow_runs.entity_id`
- `flow_outputs`

**Nota:** Esto revela el sesgo creativo del usuario. Es una métrica estratégica, no decorativa.

---

### **BLOQUE 3: FORMATO DE PRODUCCIÓN DOMINANTE**

**Función SQL:** `get_production_format_distribution(brand_id)`

**Métricas:**
- Distribución por `output_type` (imagen/video/texto)
- Conteo por formato
- Porcentaje relativo
- Total de outputs

**Fuentes:**
- `flow_outputs.output_type`

**Visualización:**
- Mini gráfica donut o barra
- Máximo 3 formatos visibles + "otros"

**Nota:** No mostrar demasiadas categorías. Máx. 3 visibles + "otros".

---

### **BLOQUE 4: HISTORIAL DE ACTIVIDAD**

**Función SQL:** `get_activity_timeline(brand_id, days)`

**Métricas:**
- Time series por día
- Conteo de ejecuciones por día
- Días activos vs inactivos

**Fuentes:**
- `flow_runs.created_at`

**Parámetros:**
- `days` (default: 30)

**Lógica:**
- Agrupar por día
- Contar ejecuciones
- Rellenar días sin actividad con 0

**Nota:** Esto NO es para juzgar, es para ritmo creativo. Ideal para vista semanal/mensual.

---

### **BLOQUE 5: CAMPAÑA ACTIVA**

**Función SQL:** `get_active_campaign_summary(brand_id)`

**Métricas:**
- Nombre de la campaña
- Total de producciones asociadas
- Última producción generada
- Fecha de actualización

**Fuentes:**
- `campaigns`
- `flow_runs`
- `flow_outputs`

**Lógica:**
- Campaña más reciente con `updated_at`
- Contar outputs asociados
- Obtener último output

**Nota:** Si no hay campaña → estado vacío inteligente: "No hay campaña activa, pero el estudio sigue produciendo".

---

### **BLOQUE 6: PRODUCCIONES DESTACADAS**

**Función SQL:** `get_key_productions(brand_id, limit)`

**Métricas:**
- Outputs más descargados/usados
- Estado: `draft` | `final`
- Conteo de descargas (desde metadata)
- Información del output

**Fuentes:**
- `flow_outputs`
- `flow_outputs.metadata` (download_count, status)

**Lógica:**
- Ordenar por:
  1. Descargas (download_count)
  2. Reuso
  3. Status = final
- Limitar (3-5)

**Nota:** Esto enseña al usuario qué realmente importa, no todo.

---

### **BLOQUE 7: USO PRODUCTIVO DEL SISTEMA**

**Función SQL:** `get_production_efficiency(brand_id)`

**Métricas:**
- Total de ejecuciones (runs)
- Total de producciones (outputs)
- Eficiencia: `outputs / runs`
- Porcentaje de eficiencia

**Fuentes:**
- `flow_runs`
- `flow_outputs`
- `credit_usage` (opcional)

**Lógica:**
- `total_runs`
- `total_outputs`
- `efficiency = outputs / runs`

**Nota:** No hablar de tokens aquí. Hablar de producción real.

---

## 👥 BLOQUE 8: ACTIVIDAD DEL EQUIPO

**Este bloque solo aparece si la organización tiene más de 1 miembro.**

No es social. No es gamificado. Es operativo y profesional.

---

### **8.1 Miembros Más Activos**

**Función SQL:** `get_team_activity_summary(organization_id)`

**Métricas:**
- Nombre del usuario
- Total de producciones
- Total de runs
- Última actividad

**Fuentes:**
- `organization_members`
- `profiles`
- `flow_runs`
- `flow_outputs`

**Visualización:**
- Lista ordenada
- Avatar + nombre
- Números claros

---

### **8.2 Distribución de Producción por Usuario**

**Función SQL:** `get_production_by_user(organization_id)`

**Métricas:**
- Usuario → Total outputs

**Visualización:**
- Gráfica de barras horizontal
- Máximo 5 usuarios visibles

**Nota:** No mostrar porcentajes complejos. Barras claras.

---

### **8.3 Tipos de Contenido por Miembro**

**Función SQL:** `get_user_content_specialization(organization_id)`

**Métricas:**
- Qué tipo de contenido produce cada persona
- Imagen / Video / Texto

**Visualización:**
- Stacked bar / mini donut por usuario
- Categorías simples

**Valor real:**
- Quién es más visual
- Quién hace más video
- Quién trabaja más copy/texto

---

### **8.4 Flujos / Herramientas Más Usadas por Usuario**

**Función SQL:** `get_user_flow_usage(organization_id)`

**Métricas:**
- Flujos más ejecutados por cada miembro
- Flow name + count

**Fuentes:**
- `flow_runs`
- `content_flows`

**Nota:** Aquí NO se muestran prompts. Solo comportamiento operativo.

---

### **8.5 Estado de Actividad del Equipo**

**Función SQL:** `get_team_activity_status(organization_id)`

**Métricas:**
- Activos hoy
- Activos esta semana
- Inactivos

**Visualización:**
- Números simples
- Badges de estado

**Lógica:**
- `today`: última actividad < 24h
- `last_7_days`: última actividad < 7 días
- `inactive`: sin actividad en 7 días

---

### **8.6 Función Agregada: Overview del Equipo**

**Función SQL:** `get_team_living_overview(organization_id)`

**Retorna:**
- Resumen de equipo
- Top usuarios
- Especialización
- Actividad

**Nota:** Cache 5-10 min para performance.

---

## 🎨 DISEÑO MENTAL DEL BLOQUE

Este bloque debe sentirse como:

✅ **"Así se está moviendo tu estudio hoy"**

NO como:
❌ Ranking
❌ Leaderboard
❌ Red social

**Por eso:**
- Sin emojis
- Sin colores llamativos
- Sin celebraciones
- Todo sobrio, técnico y claro

---

## 🔑 CONCLUSIÓN CLAVE

Con este bloque, Living se convierte en:

📽️ **Estudio audiovisual**
🧠 **Centro de decisiones creativas**
🧩 **Panel de control de equipo**

**Y muy importante:**
👉 **Ninguna otra plataforma de generación de contenido hace esto bien.**

**Esto es una ventaja brutal de AI Smart Content.**

---

## 📊 ESTRUCTURA DE DATOS

### Respuesta Típica de `get_studio_activity_status`:
```json
{
  "status": "active",
  "last_activity": "2024-01-15T10:30:00Z",
  "hours_since_activity": 2.5,
  "message": "Activo hoy"
}
```

### Respuesta Típica de `get_top_produced_entity`:
```json
{
  "entity_id": "uuid",
  "entity_name": "Blender Oster Pro",
  "entity_type": "producto",
  "total_productions": 45,
  "total_runs": 30
}
```

### Respuesta Típica de `get_production_format_distribution`:
```json
{
  "total": 120,
  "formats": [
    {
      "type": "image",
      "count": 80,
      "percentage": 66.7
    },
    {
      "type": "video",
      "count": 30,
      "percentage": 25.0
    },
    {
      "type": "text",
      "count": 10,
      "percentage": 8.3
    }
  ]
}
```

---

## 🚀 PRÓXIMOS PASOS

1. ✅ Funciones SQL creadas
2. ⏳ Implementar llamadas desde `living.js`
3. ⏳ Crear componentes de visualización
4. ⏳ Implementar caché (5-10 min)
5. ⏳ Testing y optimización

---

## 📝 NOTAS TÉCNICAS

- Todas las funciones usan `SECURITY DEFINER` para acceso controlado
- Las funciones retornan `JSONB` para fácil consumo desde JavaScript
- Se recomienda implementar caché en el frontend (5-10 minutos)
- Las funciones están optimizadas para performance con índices apropiados
