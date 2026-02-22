/**
 * Utilidades para FlowCard: badges, labels y detección de estado.
 * Compatible con public.content_flows (Supabase).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NEW_DAYS = 7;
const TRENDING_MIN_RUNS = 50;

/**
 * Calcula badges para la card (máximo 2).
 * Prioridad: NUEVO (< 7 días) > TRENDING (run_count alto) > DRAFT (si draft y user es owner/admin).
 * @param {Object} flow - content_flows row
 * @param {{ isOwner?: boolean, isAdmin?: boolean }} [userState]
 * @returns {{ id: string, text: string }[]} Máximo 2 badges
 */
export function getFlowCardBadges(flow, userState = {}) {
  const badges = [];
  const created = flow.created_at ? new Date(flow.created_at).getTime() : 0;
  const now = Date.now();
  const daysSinceCreation = (now - created) / ONE_DAY_MS;
  const runCount = flow.run_count ?? 0;
  const status = (flow.status || '').toLowerCase();

  if (daysSinceCreation < NEW_DAYS && daysSinceCreation >= 0) {
    badges.push({ id: 'new', text: 'NUEVO' });
  }
  if (badges.length < 2 && runCount >= TRENDING_MIN_RUNS) {
    badges.push({ id: 'trending', text: 'TRENDING' });
  }
  if (badges.length < 2 && status === 'draft' && (userState.isOwner || userState.isAdmin)) {
    badges.push({ id: 'draft', text: 'DRAFT' });
  }
  return badges.slice(0, 2);
}

export function getOutputTypeLabel(outputType) {
  const t = (outputType || 'text').toLowerCase();
  const labels = { text: 'Texto', image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento', mixed: 'Mixto' };
  return labels[t] || t;
}

export function getExecutionModeLabel(mode) {
  const m = (mode || '').toLowerCase();
  if (m === 'multi_step') return 'Multi-paso';
  if (m === 'sequential') return 'Secuencial';
  return 'Un paso';
}

export function getFlowCategoryTypeLabel(type) {
  const t = (type || 'manual').toLowerCase();
  return t === 'automated' ? 'Automático' : 'Manual';
}

export function isNewFlow(flow) {
  const created = flow.created_at ? new Date(flow.created_at).getTime() : 0;
  return (Date.now() - created) / ONE_DAY_MS < NEW_DAYS && created > 0;
}
