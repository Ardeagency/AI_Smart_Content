/**
 * Ejemplo FlowCard según referencia: imagen limpia, zona inferior sólida, chips + título + descripción.
 */
import React from 'react';
import { FlowCard } from './FlowCard';

const MOCK_FLOW = {
  id: 'a1b2c3d4-e5f6-7890-abcd-111111111111',
  name: 'Generador de Reels Virales',
  description: 'Crea reels optimizados para TikTok e Instagram con hooks potentes y CTAs que convierten.',
  flow_image_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=680&h=520&fit=crop',
  output_type: 'video',
  token_cost: 3,
  flow_category_type: 'manual',
  execution_mode: 'multi_step',
  status: 'published',
  created_at: new Date().toISOString(),
  likes_count: 124,
  saves_count: 89,
  run_count: 512,
  version: '1.2.0',
  slug: 'reels-virales',
};

export function FlowCardExample() {
  return (
    <div style={{ padding: '24px', background: 'var(--bg-primary)' }}>
      <FlowCard
        flow={MOCK_FLOW}
        userState={{ isLoggedIn: true, likedFlowIds: [], savedFlowIds: [] }}
        onRun={(id) => console.log('Run', id)}
        onLike={(id, active) => console.log('Like', id, active)}
        onSave={(id, active) => console.log('Save', id, active)}
        onOpenDetails={(id) => console.log('Details', id)}
      />
    </div>
  );
}

export default FlowCardExample;
