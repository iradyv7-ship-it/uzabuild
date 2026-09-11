ALTER TABLE public.product_packages
  ADD COLUMN IF NOT EXISTS phase integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS phase_note text;

ALTER TABLE public.package_manufacturers
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS deposit_currency public.currency_code NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS production_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_ship_date date;

CREATE INDEX IF NOT EXISTS product_packages_phase_idx ON public.product_packages (project_id, phase, priority);