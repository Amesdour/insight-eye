-- 1. Pipeline health + cost log
CREATE TABLE public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES public.cameras(id) ON DELETE SET NULL,
  footage_id uuid REFERENCES public.footage(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'upload',
  provider text NOT NULL DEFAULT 'unknown',
  frame_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  detections integer NOT NULL DEFAULT 0,
  raw_excerpt text,
  error text,
  latency_ms integer,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pipeline_runs TO authenticated;
GRANT ALL ON public.pipeline_runs TO service_role;

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_runs_read ON public.pipeline_runs FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id()) OR public.is_super_admin());
CREATE POLICY pipeline_runs_insert ON public.pipeline_runs FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = public.current_tenant_id()) OR public.is_super_admin());

CREATE INDEX pipeline_runs_tenant_created_idx ON public.pipeline_runs (tenant_id, created_at DESC);

-- 2. Incident merging fields on events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS false_positive boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS events_dedup_idx
  ON public.events (tenant_id, camera_id, entity, subtype, occurred_at DESC);

-- 3. Plan limit enforcement at creation time
CREATE OR REPLACE FUNCTION public.enforce_camera_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  SELECT camera_limit INTO v_limit FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_limit IS NULL OR v_limit <= 0 THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.cameras WHERE tenant_id = NEW.tenant_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Plan camera limit reached (% cameras). Upgrade the plan to add more.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cameras_enforce_limit
  BEFORE INSERT ON public.cameras
  FOR EACH ROW EXECUTE FUNCTION public.enforce_camera_limit();

CREATE OR REPLACE FUNCTION public.enforce_storage_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gb integer;
  v_used bigint;
BEGIN
  SELECT storage_gb INTO v_gb FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_gb IS NULL OR v_gb <= 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(size_bytes), 0) INTO v_used FROM public.footage WHERE tenant_id = NEW.tenant_id;
  IF v_used + COALESCE(NEW.size_bytes, 0) > v_gb::bigint * 1073741824 THEN
    RAISE EXCEPTION 'Plan storage limit reached (% GB). Upgrade the plan or delete old footage.', v_gb
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER footage_enforce_storage
  BEFORE INSERT ON public.footage
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_limit();

-- 4. Stale live-camera reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_stale_cameras(_minutes integer DEFAULT 5, _tenant uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.cameras c
     SET is_live = false,
         stream_status = 'offline',
         status = 'offline',
         last_error = 'heartbeat timeout'
   WHERE c.is_live = true
     AND (c.last_seen_at IS NULL OR c.last_seen_at < now() - make_interval(mins => GREATEST(_minutes, 1)))
     AND (
       (_tenant IS NOT NULL AND c.tenant_id = _tenant)
       OR (_tenant IS NULL AND (c.tenant_id = public.current_tenant_id() OR public.is_super_admin()))
     );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stale_cameras(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_cameras(integer, uuid) TO authenticated, service_role;