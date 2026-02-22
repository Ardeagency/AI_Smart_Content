/**
 * Labels para chips de FlowCard (content_flows).
 */
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
