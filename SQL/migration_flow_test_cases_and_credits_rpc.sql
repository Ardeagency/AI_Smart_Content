-- Migration: flow_test_cases + RPCs para deducción atómica de créditos
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New query) después de revisar.
-- Requerido para: Studio (créditos atómicos), DevTest (test cases en BD).

-- 1) Tabla flow_test_cases (test cases persistentes por usuario/flujo)
CREATE TABLE IF NOT EXISTS public.flow_test_cases (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  flow_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  environment text NOT NULL DEFAULT 'test'::text CHECK (environment IN ('test', 'prod')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flow_test_cases_pkey PRIMARY KEY (id),
  CONSTRAINT flow_test_cases_flow_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id) ON DELETE CASCADE,
  CONSTRAINT flow_test_cases_user_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_flow_test_cases_flow_user ON public.flow_test_cases(flow_id, user_id);

COMMENT ON TABLE public.flow_test_cases IS 'Casos de prueba guardados por desarrolladores para flujos (reemplazo de localStorage).';

-- RLS
ALTER TABLE public.flow_test_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own test cases" ON public.flow_test_cases
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) RPC: Deducción atómica de créditos y creación de run (para Studio)
-- Retorna run_id y new_available; si no hay créditos suficientes, no modifica nada y retorna success=false.
CREATE OR REPLACE FUNCTION public.deduct_credits_and_create_run(
  p_organization_id uuid,
  p_user_id uuid,
  p_flow_id uuid,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_available integer;
  v_run_id uuid;
  v_current integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid_amount');
  END IF;

  -- Bloquear fila y descontar solo si hay saldo suficiente
  UPDATE public.organization_credits
  SET
    credits_available = credits_available - p_amount,
    updated_at = now()
  WHERE organization_id = p_organization_id
    AND credits_available >= p_amount
  RETURNING credits_available INTO v_new_available;

  IF NOT FOUND THEN
    SELECT credits_available INTO v_current
    FROM public.organization_credits
    WHERE organization_id = p_organization_id;
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'insufficient_credits',
      'credits_available', COALESCE(v_current, 0)
    );
  END IF;

  -- Crear run en estado pending (el webhook se ejecuta después)
  INSERT INTO public.flow_runs (flow_id, user_id, status)
  VALUES (p_flow_id, p_user_id, 'pending')
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'new_available', v_new_available
  );
END;
$$;

COMMENT ON FUNCTION public.deduct_credits_and_create_run IS 'Deduce créditos y crea flow_run en una transacción. Usar antes de llamar al webhook; si el webhook falla, llamar refund_credits_for_run.';

-- 3) RPC: Devolución de créditos cuando el webhook falla después de deduct
CREATE OR REPLACE FUNCTION public.refund_credits_for_run(
  p_organization_id uuid,
  p_run_id uuid,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid_amount');
  END IF;

  UPDATE public.organization_credits
  SET
    credits_available = credits_available + p_amount,
    updated_at = now()
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'organization_not_found');
  END IF;

  UPDATE public.flow_runs
  SET status = 'failed'
  WHERE id = p_run_id AND status = 'pending';

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.refund_credits_for_run IS 'Devuelve créditos al fallar el webhook después de deduct_credits_and_create_run.';

-- Grant execute a authenticated
GRANT EXECUTE ON FUNCTION public.deduct_credits_and_create_run(uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits_for_run(uuid, uuid, integer) TO authenticated;
