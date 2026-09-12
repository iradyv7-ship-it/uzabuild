-- Invite-path audit finding (see Task 3 report): handle_new_user() hardcodes
-- the set of self-supplied sign-up roles it will honour (added in
-- 20260908124906_5871bd09-990e-412b-aa3b-660a0aab41d9.sql to stop a sign-up
-- from claiming 'admin' for itself). That whitelist was never extended when
-- china_sourcing was added to the app_role enum, so a china_sourcing account
-- created with `role` in its sign-up metadata would silently get no
-- user_roles row from this trigger -- the metadata is simply ignored, no
-- error. In practice the two real paths that set this metadata today are
-- covered another way (InvitePanel's own explicit user_roles upsert in
-- src/lib/invitations.functions.ts for an invited seat, and
-- role_bootstrap_emails for Cecilia's named seat, added in
-- 20260912121000_d97ec679-ff5f-4e3a-b7aa-d56185a5b02d.sql), so this was
-- latent rather than a live bug -- but the trigger itself must not fall
-- through on a role the type system allows, so it is fixed here too.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  bootstrap_name text;
BEGIN
  SELECT full_name INTO bootstrap_name
  FROM public.role_bootstrap_emails
  WHERE lower(email) = lower(NEW.email)
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), bootstrap_name, ''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  IF requested IS NOT NULL AND requested <> 'admin'
     AND requested IN ('architect','qs','interior_designer','mep_engineer','client','procurement','project_manager','china_sourcing') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, requested::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, b.role
  FROM public.role_bootstrap_emails b
  WHERE lower(b.email) = lower(NEW.email)
  ON CONFLICT DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.admin_bootstrap_emails b
    WHERE lower(b.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
