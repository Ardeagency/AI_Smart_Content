-- Migration: Execution graph en flow_modules (grafo dirigido, no solo step_order lineal)
-- Objetivo: soportar single_step, multi_step lineal, sequential con decisiones.
-- flow_technical_details sigue enlazado por flow_module_id.

-- execution_type: desacopla plataforma (webhook, python, make, internal, ai_direct, aggregator)
ALTER TABLE public.flow_modules
  ADD COLUMN IF NOT EXISTS execution_type text DEFAULT 'webhook'
  CHECK (execution_type IN ('webhook', 'python', 'make', 'internal', 'ai_direct', 'aggregator'));

-- next_module_id: para encadenar módulos (lineal o ramas)
ALTER TABLE public.flow_modules
  ADD COLUMN IF NOT EXISTS next_module_id uuid REFERENCES public.flow_modules(id);

-- routing_rules: condiciones para ir a un módulo u otro (ej. user_choice → module_video | module_image)
ALTER TABLE public.flow_modules
  ADD COLUMN IF NOT EXISTS routing_rules jsonb DEFAULT NULL;

COMMENT ON COLUMN public.flow_modules.execution_type IS 'Tipo de ejecución: webhook, python, make, internal, ai_direct, aggregator. Desacopla de n8n.';
COMMENT ON COLUMN public.flow_modules.next_module_id IS 'Módulo siguiente en el grafo (lineal o rama).';
COMMENT ON COLUMN public.flow_modules.routing_rules IS 'Reglas condicionales: { conditions: [{ field, equals, go_to }], default }';
