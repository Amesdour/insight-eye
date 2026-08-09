
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','agent','viewer');
CREATE TYPE public.plan_tier AS ENUM ('starter','pro','enterprise','on_prem');
CREATE TYPE public.entity_type AS ENUM ('person','vehicle','animal','object');
CREATE TYPE public.severity AS ENUM ('info','warning','critical');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan plan_tier NOT NULL DEFAULT 'starter',
  camera_limit int NOT NULL DEFAULT 4,
  storage_gb int NOT NULL DEFAULT 25,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name text,
  email text,
  locale text NOT NULL DEFAULT 'fr',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE public.cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone text,
  location text,
  source_type text NOT NULL DEFAULT 'upload',
  rtsp_url text,
  status text NOT NULL DEFAULT 'online',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.footage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES public.cameras(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  duration_seconds numeric,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'uploaded',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES public.cameras(id) ON DELETE SET NULL,
  footage_id uuid REFERENCES public.footage(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  offset_seconds numeric,
  entity entity_type NOT NULL,
  subtype text,
  confidence numeric NOT NULL DEFAULT 0,
  severity severity NOT NULL DEFAULT 'info',
  description text,
  snapshot_path text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_tenant_time_idx ON public.events (tenant_id, occurred_at DESC);

CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  entity entity_type,
  subtype text,
  min_confidence numeric NOT NULL DEFAULT 0.7,
  camera_id uuid REFERENCES public.cameras(id) ON DELETE CASCADE,
  channels text[] NOT NULL DEFAULT ARRAY['dashboard'],
  severity severity NOT NULL DEFAULT 'warning',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.profiles, public.user_roles, public.cameras, public.footage, public.events, public.alert_rules, public.alerts TO authenticated;
GRANT ALL ON public.tenants, public.profiles, public.user_roles, public.cameras, public.footage, public.events, public.alert_rules, public.alerts TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.footage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_read" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenants_write" ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (id = public.current_tenant_id() AND public.is_tenant_admin()));
CREATE POLICY "tenants_insert" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY "tenants_delete" ON public.tenants FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin()) WITH CHECK (id = auth.uid() OR public.is_super_admin());

CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "roles_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.is_tenant_admin() AND tenant_id = public.current_tenant_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_tenant_admin() AND tenant_id = public.current_tenant_id() AND role <> 'super_admin'));

CREATE POLICY "cameras_read" ON public.cameras FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "cameras_manage" ON public.cameras FOR ALL TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()))
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()));

CREATE POLICY "footage_read" ON public.footage FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "footage_write" ON public.footage FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY "events_read" ON public.events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "events_write" ON public.events FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY "rules_read" ON public.alert_rules FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "rules_manage" ON public.alert_rules FOR ALL TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()))
  WITH CHECK (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_admin()));

CREATE POLICY "alerts_read" ON public.alerts FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "alerts_write" ON public.alerts FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org text;
  v_slug text;
  v_tenant uuid;
BEGIN
  v_org := COALESCE(NULLIF(NEW.raw_user_meta_data->>'org_name',''), split_part(NEW.email,'@',1) || ' Org');
  v_slug := regexp_replace(lower(v_org), '[^a-z0-9]+', '-', 'g') || '-' || substr(NEW.id::text, 1, 6);

  INSERT INTO public.tenants (name, slug) VALUES (v_org, v_slug) RETURNING id INTO v_tenant;

  INSERT INTO public.profiles (id, tenant_id, full_name, email, locale)
  VALUES (NEW.id, v_tenant, NEW.raw_user_meta_data->>'full_name', NEW.email,
          COALESCE(NULLIF(NEW.raw_user_meta_data->>'locale',''),'fr'));

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, v_tenant, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
