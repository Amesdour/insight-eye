-- ============ 1. CAMERA ACCESS ============
CREATE TABLE public.camera_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  camera_id uuid NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, camera_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.camera_access TO authenticated;
GRANT ALL ON public.camera_access TO service_role;
ALTER TABLE public.camera_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY camera_access_read ON public.camera_access FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY camera_access_manage ON public.camera_access FOR ALL TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()))
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()));

CREATE OR REPLACE FUNCTION public.can_access_camera(_camera_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR public.is_tenant_admin()
    OR _camera_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.camera_access WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.camera_access WHERE user_id = auth.uid() AND camera_id = _camera_id);
$$;

DROP POLICY IF EXISTS cameras_read ON public.cameras;
CREATE POLICY cameras_read ON public.cameras FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id() AND public.can_access_camera(id)) OR public.is_super_admin());

DROP POLICY IF EXISTS events_read ON public.events;
CREATE POLICY events_read ON public.events FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id() AND public.can_access_camera(camera_id)) OR public.is_super_admin());

DROP POLICY IF EXISTS footage_read ON public.footage;
CREATE POLICY footage_read ON public.footage FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id() AND public.can_access_camera(camera_id)) OR public.is_super_admin());

-- ============ 2. INVITATIONS ============
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_tenant_idx ON public.invitations (tenant_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_read ON public.invitations FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY invitations_manage ON public.invitations FOR ALL TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()))
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin() AND role <> 'super_admin'));

-- ============ 3. BILLING ============
CREATE TABLE public.plan_catalog (
  tier plan_tier PRIMARY KEY,
  label text NOT NULL,
  price_eur_month integer NOT NULL,
  camera_limit integer NOT NULL,
  storage_gb integer NOT NULL,
  seat_limit integer NOT NULL,
  rtsp_enabled boolean NOT NULL DEFAULT false,
  onprem_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.plan_catalog TO authenticated, anon;
GRANT ALL ON public.plan_catalog TO service_role;
ALTER TABLE public.plan_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_catalog_read ON public.plan_catalog FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.plan_catalog (tier, label, price_eur_month, camera_limit, storage_gb, seat_limit, rtsp_enabled, onprem_enabled, sort_order) VALUES
  ('starter',    'Starter',    99,   4,   25,  5,  false, false, 1),
  ('pro',        'Pro',        349,  20,  250, 25, true,  false, 2),
  ('enterprise', 'Enterprise', 1200, 100, 2000, 200, true, false, 3),
  ('on_prem',    'On-Premise', 2500, 500, 10000, 1000, true, true, 4);

ALTER TABLE public.tenants
  ADD COLUMN seat_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'trialing',
  ADD COLUMN billing_email text,
  ADD COLUMN trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  ADD COLUMN current_period_end timestamptz;

CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_tier plan_tier,
  to_tier plan_tier NOT NULL,
  amount_eur integer NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_events_read ON public.subscription_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY sub_events_insert ON public.subscription_events FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()));

-- ============ 4. RTSP LIVE FEEDS ============
ALTER TABLE public.cameras
  ADD COLUMN is_live boolean NOT NULL DEFAULT false,
  ADD COLUMN stream_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN poll_interval_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN last_error text;

CREATE TABLE public.camera_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  status text NOT NULL,
  latency_ms integer,
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX camera_health_camera_idx ON public.camera_health (camera_id, checked_at DESC);
GRANT SELECT, INSERT ON public.camera_health TO authenticated;
GRANT ALL ON public.camera_health TO service_role;
ALTER TABLE public.camera_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY camera_health_read ON public.camera_health FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id() AND public.can_access_camera(camera_id)) OR public.is_super_admin());
CREATE POLICY camera_health_insert ON public.camera_health FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

-- ============ 5. ALERT NOTIFICATIONS ============
ALTER TABLE public.alert_rules
  ADD COLUMN notify_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN notify_phones text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.alerts(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  channel text NOT NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_tenant_idx ON public.notifications (tenant_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY notifications_write ON public.notifications FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

-- ============ 6. TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 7. SIGNUP: JOIN VIA INVITE ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org text;
  v_slug text;
  v_tenant uuid;
  v_invite public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.invitations
   WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id, full_name, email, locale)
    VALUES (NEW.id, v_invite.tenant_id, NEW.raw_user_meta_data->>'full_name', NEW.email,
            COALESCE(NULLIF(NEW.raw_user_meta_data->>'locale',''),'fr'));
    INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, v_invite.tenant_id, v_invite.role);
    UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = v_invite.id;
    RETURN NEW;
  END IF;

  v_org := COALESCE(NULLIF(NEW.raw_user_meta_data->>'org_name',''), split_part(NEW.email,'@',1) || ' Org');
  v_slug := regexp_replace(lower(v_org), '[^a-z0-9]+', '-', 'g') || '-' || substr(NEW.id::text, 1, 6);

  INSERT INTO public.tenants (name, slug, billing_email) VALUES (v_org, v_slug, NEW.email) RETURNING id INTO v_tenant;

  INSERT INTO public.profiles (id, tenant_id, full_name, email, locale)
  VALUES (NEW.id, v_tenant, NEW.raw_user_meta_data->>'full_name', NEW.email,
          COALESCE(NULLIF(NEW.raw_user_meta_data->>'locale',''),'fr'));

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, v_tenant, 'admin');
  RETURN NEW;
END;
$$;