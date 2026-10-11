-- Manufacturer workspace, factory quotes and the confidentiality walls
-- between the four parties: UZA staff, the client, and each factory.
--
--   client   never sees: any factory, any factory quote or message, catalog
--            cost, margin.                      (no policy grants it anything here)
--   factory  never sees: the client, the project's name or location, the
--            budget, UZA's selling price, internal notes, another factory's
--            quote, messages or files, or a package it has not been sent an
--            RFQ for.
--   staff    see everything on projects they can access.
--
-- Leaks closed (verified by reading 20260913140500, not assumed):
--   * product_packages was readable row-wise by an invited factory, which
--     exposed target_budget_minor (the client's budget), title and notes.
--   * package_manufacturers exposed UZA's internal shortlist note.
--   * package_requirements exposed the checklist notes.
--   * every general attachment went to every invited factory; drawings,
--     renderings and file names can carry the client's name or title block.
--     Attachments now reach a factory only once a person releases them.
-- A factory now reads its packages only through supplier_packages(), which
-- returns the fields needed to quote and nothing else.

-- ---------------------------------------------------------------------------
-- 1. Narrow the existing manufacturer policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manufacturer reads its own invited package" ON public.product_packages;
DROP POLICY IF EXISTS "Manufacturer reads its own shortlist row" ON public.package_manufacturers;
DROP POLICY IF EXISTS "Manufacturer reads its own package requirements" ON public.package_requirements;

ALTER TABLE public.package_attachments
  ADD COLUMN IF NOT EXISTS shared_with_manufacturers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;
COMMENT ON COLUMN public.package_attachments.shared_with_manufacturers IS
  'False until a staff member has checked the file (title block, logo, file name) and released it to the factories on this package. Never set by a factory.';

-- ---------------------------------------------------------------------------
-- 2. RFQs actually sent — the record of exactly what each factory was asked
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.package_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  reference text NOT NULL,
  english text NOT NULL,
  chinese text,
  -- The quantity schedule as sent: [{item, description, unit, quantity}] (src/lib/rfq.ts RfqScheduleRow).
  -- Quote lines point back at `item` through factory_quote_lines.schedule_key.
  schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  sent_by_name text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS package_rfqs_package ON public.package_rfqs (package_id, supplier_id, sent_at);

CREATE OR REPLACE FUNCTION public.manufacturer_can_quote(_package_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'manufacturer')
     AND NOT public.is_internal_user(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.package_rfqs r
       WHERE r.package_id = _package_id
         AND r.supplier_id = public.manufacturer_supplier_id(_user_id)
     );
$$;
COMMENT ON FUNCTION public.manufacturer_can_quote(uuid, uuid) IS
  'A factory account is in scope for a package once UZA has sent it an RFQ for that package. Being shortlisted is not enough.';

-- Attachments: released general files + the factory''s own uploads, and only
-- for packages it has been sent an RFQ for.
DROP POLICY IF EXISTS "Manufacturer reads RFQ docs and its own submissions" ON public.package_attachments;
CREATE POLICY "Manufacturer reads released RFQ docs and its own submissions" ON public.package_attachments
  FOR SELECT TO authenticated
  USING (
    public.manufacturer_can_quote(package_id, auth.uid())
    AND (
      (uploaded_for_supplier_id IS NULL AND shared_with_manufacturers)
      OR uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    )
  );
DROP POLICY IF EXISTS "Manufacturer uploads its own quote/drawing/spec" ON public.package_attachments;
CREATE POLICY "Manufacturer uploads its own quote/drawing/spec" ON public.package_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.manufacturer_can_quote(package_id, auth.uid())
    AND uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    AND uploaded_by = auth.uid()
    AND NOT shared_with_manufacturers
  );

CREATE OR REPLACE FUNCTION public.stamp_attachment_sharing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT public.is_internal_user(auth.uid()) THEN
    NEW.shared_with_manufacturers := false;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.shared_with_manufacturers IS DISTINCT FROM OLD.shared_with_manufacturers THEN
    IF NOT public.is_internal_user(auth.uid()) THEN
      RAISE EXCEPTION 'Only UZA staff can release a file to factories.';
    END IF;
    IF NEW.uploaded_for_supplier_id IS NOT NULL AND NEW.shared_with_manufacturers THEN
      RAISE EXCEPTION 'A factory''s own submission cannot be shared with other factories.';
    END IF;
    NEW.shared_by := auth.uid();
    NEW.shared_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS package_attachments_sharing ON public.package_attachments;
CREATE TRIGGER package_attachments_sharing BEFORE INSERT OR UPDATE ON public.package_attachments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_attachment_sharing();

-- ---------------------------------------------------------------------------
-- 3. The confidentiality check on anything UZA sends a factory
-- ---------------------------------------------------------------------------
-- Raises if the text names the project's client (company or contact), the
-- project itself, or its site location. Deliberately conservative: names
-- shorter than 4 characters are skipped to avoid false matches.
CREATE OR REPLACE FUNCTION public.assert_factory_safe(_project_id uuid, _text text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hay text := lower(coalesce(_text, ''));
  term text;
BEGIN
  FOR term IN
    SELECT lower(trim(t)) FROM (
      SELECT p.name AS t FROM public.projects p WHERE p.id = _project_id
      UNION ALL SELECT p.client_name FROM public.projects p WHERE p.id = _project_id
      UNION ALL SELECT p.location FROM public.projects p WHERE p.id = _project_id
      UNION ALL SELECT c.name FROM public.projects p JOIN public.clients c ON c.id = p.client_id WHERE p.id = _project_id
      UNION ALL SELECT c.contact_name FROM public.projects p JOIN public.clients c ON c.id = p.client_id WHERE p.id = _project_id
    ) names
    WHERE t IS NOT NULL AND length(trim(t)) >= 4
      -- The delivery city is meant to be in every RFQ (src/lib/rfq.ts RFQ_DESTINATION).
      AND position(lower(trim(t)) IN 'kigali, rwanda') = 0
  LOOP
    IF position(term IN hay) > 0 THEN
      RAISE EXCEPTION 'This text names the client, the project or its location ("%"). Remove it before it goes to a factory.', term
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Factory quotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factory_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  rfq_id uuid REFERENCES public.package_rfqs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','parsed','withdrawn','under_review','shortlisted','selected','rejected')),
  currency public.currency_code NOT NULL DEFAULT 'CNY',
  incoterm text,
  lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  moq_note text,
  valid_until date,
  payment_terms text,
  sample_available boolean,
  notes text,
  file_name text,
  attachment_path text,
  total_minor bigint,
  parse_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  parsed_at timestamptz,
  submitted_side text NOT NULL DEFAULT 'factory' CHECK (submitted_side IN ('factory','uza')),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS factory_quotes_package ON public.factory_quotes (package_id, supplier_id);
CREATE TRIGGER factory_quotes_updated BEFORE UPDATE ON public.factory_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.factory_quotes IS
  'One factory''s quotation for one package. A factory sees only its own; staff compare them per package; clients never see any.';

CREATE TABLE IF NOT EXISTS public.factory_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.factory_quotes(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 0,
  schedule_key text,
  description text NOT NULL,
  specification text,
  unit text,
  quantity numeric(16,4),
  unit_price_minor bigint,
  currency public.currency_code NOT NULL DEFAULT 'CNY',
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS factory_quote_lines_quote ON public.factory_quote_lines (quote_id, line_no);
COMMENT ON COLUMN public.factory_quote_lines.schedule_key IS
  'The RFQ schedule row this line answers (so quotes compare like for like). NULL = an extra item the factory added.';

CREATE OR REPLACE FUNCTION public.can_read_quote(_quote_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.factory_quotes q
    WHERE q.id = _quote_id
      AND (
        (public.is_internal_user(_user_id) AND public.can_access_project_sourcing(q.project_id, _user_id))
        OR (public.manufacturer_can_quote(q.package_id, _user_id)
            AND q.supplier_id = public.manufacturer_supplier_id(_user_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_quote(_quote_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.factory_quotes q
    WHERE q.id = _quote_id
      AND (
        (public.is_internal_user(_user_id) AND public.can_access_project_sourcing(q.project_id, _user_id))
        OR (public.manufacturer_can_quote(q.package_id, _user_id)
            AND q.supplier_id = public.manufacturer_supplier_id(_user_id)
            AND q.status IN ('submitted','parsed'))
      )
  );
$$;

-- The factory side can only ever be its own supplier, can only move its quote
-- between submitted / parsed / withdrawn, and cannot touch the decision.
CREATE OR REPLACE FUNCTION public.guard_factory_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  internal boolean := public.is_internal_user(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.project_id INTO NEW.project_id FROM public.product_packages p WHERE p.id = NEW.package_id;
    NEW.submitted_by := auth.uid();
    IF internal THEN
      NEW.submitted_side := 'uza';
    ELSE
      NEW.submitted_side := 'factory';
      NEW.supplier_id := public.manufacturer_supplier_id(auth.uid());
      NEW.status := 'submitted';
      NEW.decided_by := NULL;
      NEW.decided_at := NULL;
      SELECT r.id INTO NEW.rfq_id FROM public.package_rfqs r
        WHERE r.package_id = NEW.package_id AND r.supplier_id = NEW.supplier_id
        ORDER BY r.sent_at DESC LIMIT 1;
    END IF;
  ELSE
    NEW.package_id := OLD.package_id;
    NEW.project_id := OLD.project_id;
    NEW.supplier_id := OLD.supplier_id;
    NEW.submitted_side := OLD.submitted_side;
    NEW.submitted_by := OLD.submitted_by;
    IF NOT internal THEN
      IF NEW.status NOT IN ('submitted','parsed','withdrawn') THEN
        RAISE EXCEPTION 'Only UZA can review, shortlist, select or reject a quote.';
      END IF;
      NEW.decided_by := OLD.decided_by;
      NEW.decided_at := OLD.decided_at;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('under_review','shortlisted','selected','rejected') THEN
      NEW.decided_by := auth.uid();
      NEW.decided_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER factory_quotes_guard BEFORE INSERT OR UPDATE ON public.factory_quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_factory_quote();

CREATE OR REPLACE FUNCTION public.prepare_quote_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT q.package_id INTO NEW.package_id FROM public.factory_quotes q WHERE q.id = NEW.quote_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER factory_quote_lines_prepare BEFORE INSERT ON public.factory_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.prepare_quote_line();

-- ---------------------------------------------------------------------------
-- 5. Messages between UZA and one factory, per package
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  author_name text,
  author_side text NOT NULL CHECK (author_side IN ('uza','factory')),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  translated_body text,
  translated_lang text CHECK (translated_lang IS NULL OR translated_lang IN ('en','zh')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_messages_thread ON public.supplier_messages (package_id, supplier_id, created_at);

CREATE OR REPLACE FUNCTION public.guard_supplier_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.project_id INTO NEW.project_id FROM public.product_packages p WHERE p.id = NEW.package_id;
    NEW.author_id := auth.uid();
    IF public.is_internal_user(auth.uid()) THEN
      NEW.author_side := 'uza';
      -- UZA staff appear to factories as "UZA Sourcing" plus their first name only.
      NEW.author_name := coalesce('UZA · ' || nullif(split_part(public.profile_name(auth.uid()), ' ', 1), ''), 'UZA Sourcing');
      PERFORM public.assert_factory_safe(NEW.project_id, NEW.body);
      PERFORM public.assert_factory_safe(NEW.project_id, NEW.translated_body);
    ELSE
      NEW.author_side := 'factory';
      NEW.supplier_id := public.manufacturer_supplier_id(auth.uid());
      NEW.author_name := (SELECT s.name FROM public.suppliers s WHERE s.id = NEW.supplier_id);
    END IF;
  ELSE
    -- Only the stored translation may change after posting.
    NEW.body := OLD.body;
    NEW.author_id := OLD.author_id;
    NEW.author_name := OLD.author_name;
    NEW.author_side := OLD.author_side;
    NEW.package_id := OLD.package_id;
    NEW.project_id := OLD.project_id;
    NEW.supplier_id := OLD.supplier_id;
    NEW.created_at := OLD.created_at;
    IF OLD.author_side = 'uza' THEN
      PERFORM public.assert_factory_safe(NEW.project_id, NEW.translated_body);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_messages_guard BEFORE INSERT OR UPDATE ON public.supplier_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_message();

CREATE OR REPLACE FUNCTION public.guard_package_rfq()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT p.project_id INTO NEW.project_id FROM public.product_packages p WHERE p.id = NEW.package_id;
  NEW.sent_by := auth.uid();
  NEW.sent_by_name := public.profile_name(auth.uid());
  PERFORM public.assert_factory_safe(NEW.project_id, NEW.english);
  PERFORM public.assert_factory_safe(NEW.project_id, NEW.chinese);
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_rfqs_guard BEFORE INSERT ON public.package_rfqs
  FOR EACH ROW EXECUTE FUNCTION public.guard_package_rfq();

-- ---------------------------------------------------------------------------
-- 6. The factory's view of its work
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_packages()
RETURNS TABLE (
  package_id uuid, project_id uuid, package_code text, category text, quality_tier text,
  required_delivery_date date, shortlist_status text,
  rfq_id uuid, rfq_reference text, rfq_english text, rfq_chinese text, rfq_sent_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id)
         p.id, p.project_id, p.package_code, p.category, p.quality_tier, p.required_delivery_date,
         CASE pm.status WHEN 'selected' THEN 'selected' WHEN 'rejected' THEN 'closed' ELSE 'open' END,
         r.id, r.reference, r.english, r.chinese, r.sent_at
  FROM public.package_rfqs r
  JOIN public.product_packages p ON p.id = r.package_id
  LEFT JOIN public.package_manufacturers pm ON pm.package_id = p.id AND pm.supplier_id = r.supplier_id
  WHERE r.supplier_id = public.manufacturer_supplier_id(auth.uid())
    AND public.has_role(auth.uid(), 'manufacturer')
  ORDER BY p.id, r.sent_at DESC;
$$;
COMMENT ON FUNCTION public.supplier_packages() IS
  'Everything a factory sees about its packages: code, opaque project id (for its upload folder), product family, tier, delivery date, its own status and the latest RFQ UZA sent it. No title, budget, client, project name, location or notes.';

CREATE OR REPLACE FUNCTION public.supplier_me()
RETURNS TABLE (supplier_id uuid, supplier_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name FROM public.suppliers s
  WHERE s.id = public.manufacturer_supplier_id(auth.uid()) AND public.has_role(auth.uid(), 'manufacturer');
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.package_rfqs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_quotes, public.factory_quote_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_messages TO authenticated;
GRANT ALL ON public.package_rfqs, public.factory_quotes, public.factory_quote_lines, public.supplier_messages TO service_role;
ALTER TABLE public.package_rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read RFQs sent" ON public.package_rfqs FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()));
CREATE POLICY "Factory reads RFQs sent to it" ON public.package_rfqs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manufacturer') AND supplier_id = public.manufacturer_supplier_id(auth.uid()));
CREATE POLICY "Staff record RFQs sent" ON public.package_rfqs FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid())
              AND EXISTS (SELECT 1 FROM public.product_packages p
                          WHERE p.id = package_id AND public.can_access_project_sourcing(p.project_id, auth.uid())));

CREATE POLICY "Read quotes you may read" ON public.factory_quotes FOR SELECT TO authenticated
  USING (public.can_read_quote(id, auth.uid()));
CREATE POLICY "Staff or the invited factory add a quote" ON public.factory_quotes FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()))
    OR (public.manufacturer_can_quote(package_id, auth.uid())
        AND supplier_id = public.manufacturer_supplier_id(auth.uid()))
  );
CREATE POLICY "Edit quotes you may edit" ON public.factory_quotes FOR UPDATE TO authenticated
  USING (public.can_edit_quote(id, auth.uid()))
  WITH CHECK (public.can_read_quote(id, auth.uid()));
CREATE POLICY "Delete quotes you may edit" ON public.factory_quotes FOR DELETE TO authenticated
  USING (public.can_edit_quote(id, auth.uid()));

CREATE POLICY "Read lines of quotes you may read" ON public.factory_quote_lines FOR SELECT TO authenticated
  USING (public.can_read_quote(quote_id, auth.uid()));
CREATE POLICY "Write lines of quotes you may edit" ON public.factory_quote_lines FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_quote(quote_id, auth.uid()));
CREATE POLICY "Update lines of quotes you may edit" ON public.factory_quote_lines FOR UPDATE TO authenticated
  USING (public.can_edit_quote(quote_id, auth.uid())) WITH CHECK (public.can_edit_quote(quote_id, auth.uid()));
CREATE POLICY "Delete lines of quotes you may edit" ON public.factory_quote_lines FOR DELETE TO authenticated
  USING (public.can_edit_quote(quote_id, auth.uid()));

CREATE POLICY "Staff read factory threads" ON public.supplier_messages FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()));
CREATE POLICY "Factory reads its own thread" ON public.supplier_messages FOR SELECT TO authenticated
  USING (public.manufacturer_can_quote(package_id, auth.uid())
         AND supplier_id = public.manufacturer_supplier_id(auth.uid()));
CREATE POLICY "Staff post to factory threads" ON public.supplier_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid())
              AND EXISTS (SELECT 1 FROM public.package_rfqs r
                          WHERE r.package_id = supplier_messages.package_id
                            AND r.supplier_id = supplier_messages.supplier_id)
              AND public.can_access_project_sourcing(project_id, auth.uid()));
CREATE POLICY "Factory posts to its own thread" ON public.supplier_messages FOR INSERT TO authenticated
  WITH CHECK (public.manufacturer_can_quote(package_id, auth.uid())
              AND supplier_id = public.manufacturer_supplier_id(auth.uid()));
CREATE POLICY "Store a translation on a thread you can read" ON public.supplier_messages FOR UPDATE TO authenticated
  USING (
    (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()))
    OR (public.manufacturer_can_quote(package_id, auth.uid())
        AND supplier_id = public.manufacturer_supplier_id(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 8. Storage: factory files live under <project>/packages/<package>/supplier-<supplier>/
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_storage_object(_name text, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  folder uuid;
BEGIN
  -- A factory account: released package files, its own uploads and its own quote files only.
  IF public.has_role(_user_id, 'manufacturer') AND NOT public.is_internal_user(_user_id) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.package_attachments pa
      WHERE pa.storage_path = _name
        AND public.manufacturer_can_quote(pa.package_id, _user_id)
        AND ((pa.uploaded_for_supplier_id IS NULL AND pa.shared_with_manufacturers)
             OR pa.uploaded_for_supplier_id = public.manufacturer_supplier_id(_user_id))
    ) OR EXISTS (
      SELECT 1 FROM public.factory_quotes q
      WHERE q.attachment_path = _name
        AND q.supplier_id = public.manufacturer_supplier_id(_user_id)
    );
  END IF;
  -- A file that belongs to a document follows that document's rule exactly.
  IF EXISTS (SELECT 1 FROM public.drawings d WHERE d.storage_path = _name) THEN
    RETURN EXISTS (SELECT 1 FROM public.drawings d
                   WHERE d.storage_path = _name AND public.can_read_drawing(d.id, _user_id));
  END IF;
  -- A client sees only attachments on their own project's design board.
  IF public.is_client_user(_user_id) THEN
    RETURN EXISTS (SELECT 1 FROM public.client_selections s
                   WHERE s.attachment_path = _name AND public.can_access_project(s.project_id, _user_id));
  END IF;
  -- Internal seats keep project-folder access to coordination, package and quote files.
  BEGIN
    folder := ((storage.foldername(_name))[1])::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN public.is_internal_user(_user_id)
     AND (public.can_access_project(folder, _user_id) OR public.can_access_project_sourcing(folder, _user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.factory_may_upload(_name text, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[] := storage.foldername(_name);
  pkg uuid;
BEGIN
  IF array_length(parts, 1) IS DISTINCT FROM 4 OR parts[2] <> 'packages'
     OR parts[4] <> 'supplier-' || public.manufacturer_supplier_id(_user_id)::text THEN
    RETURN false;
  END IF;
  BEGIN
    pkg := parts[3]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN public.manufacturer_can_quote(pkg, _user_id)
     AND EXISTS (SELECT 1 FROM public.product_packages p WHERE p.id = pkg AND p.project_id::text = parts[1]);
END;
$$;

DROP POLICY IF EXISTS "factories upload their own files" ON storage.objects;
CREATE POLICY "factories upload their own files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'drawings' AND public.factory_may_upload(name, auth.uid()));
DROP POLICY IF EXISTS "factories delete their own files" ON storage.objects;
CREATE POLICY "factories delete their own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'drawings' AND public.has_role(auth.uid(), 'manufacturer')
         AND NOT public.is_internal_user(auth.uid()) AND owner = auth.uid());

-- "team upload drawings" (20260802153950) used can_access_project only, which a
-- factory never satisfies; it stays for staff and clients.

-- ---------------------------------------------------------------------------
-- 9. Function grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.manufacturer_can_quote(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assert_factory_safe(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_read_quote(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_quote(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.supplier_packages() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.supplier_me() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.factory_may_upload(text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.manufacturer_can_quote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_factory_safe(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_quote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_quote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supplier_packages() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supplier_me() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.factory_may_upload(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. The other direction: nothing UZA writes for the client names a factory
-- ---------------------------------------------------------------------------
-- Proformas were already blocked at issue time (20260913150000). The same rule
-- now covers every other text a client can read: the team's answers on the
-- design board, client-visible progress updates on documents, and showcase
-- products (name/description) on the design board.
CREATE OR REPLACE FUNCTION public.assert_client_safe(_text text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hay text := lower(coalesce(_text, ''));
  bad text;
BEGIN
  IF hay = '' THEN RETURN; END IF;
  SELECT s.name INTO bad
  FROM public.suppliers s
  WHERE length(trim(s.name)) >= 4 AND position(lower(trim(s.name)) IN hay) > 0
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'This text names a factory or supplier ("%"). Clients never see who makes their products.', bad
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_client_safe(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.assert_client_safe(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_client_selection_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_internal_user(auth.uid()) THEN
    PERFORM public.assert_client_safe(NEW.team_response);
    PERFORM public.assert_client_safe(NEW.alternative_title);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS client_selections_client_safe ON public.client_selections;
CREATE TRIGGER client_selections_client_safe BEFORE INSERT OR UPDATE ON public.client_selections
  FOR EACH ROW EXECUTE FUNCTION public.check_client_selection_text();

CREATE OR REPLACE FUNCTION public.check_document_activity_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_visible AND public.is_internal_user(auth.uid()) THEN
    PERFORM public.assert_client_safe(NEW.body);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS document_activity_client_safe ON public.document_activity;
CREATE TRIGGER document_activity_client_safe BEFORE INSERT ON public.document_activity
  FOR EACH ROW EXECUTE FUNCTION public.check_document_activity_text();

CREATE OR REPLACE FUNCTION public.check_showcase_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_showcase AND (
       TG_OP = 'INSERT'
       OR NOT OLD.client_showcase
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
     ) THEN
    PERFORM public.assert_client_safe(NEW.name);
    PERFORM public.assert_client_safe(NEW.description);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS catalog_items_client_safe ON public.catalog_items;
CREATE TRIGGER catalog_items_client_safe BEFORE INSERT OR UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.check_showcase_text();

-- ---------------------------------------------------------------------------
-- 11. Business settings are internal
-- ---------------------------------------------------------------------------
-- "settings readable" (20260802153919) was USING (true): every signed-in
-- account — clients and factories included — could read UZA's wastage,
-- coverage and solar assumptions. Staff only.
DROP POLICY IF EXISTS "settings readable" ON public.business_settings;
CREATE POLICY "Internal users read settings" ON public.business_settings FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));
