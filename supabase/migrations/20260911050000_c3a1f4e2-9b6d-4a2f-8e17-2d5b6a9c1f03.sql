-- Universal drawing reader (ported from UZA Blueprint): DXF/IFC/STEP are now
-- parsed into a structured digest and proprietary CAD/BIM binaries (DWG, RVT,
-- RFA, SKP, NWD) have their layer/room/schedule labels salvaged, instead of
-- being rejected outright. Track how a drawing's AI draft was actually
-- produced so a QS can see a lossy salvage for what it is without unpacking
-- the extraction jsonb blob.
ALTER TABLE public.drawings
  ADD COLUMN read_method text,
  ADD COLUMN degraded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.drawings.read_method IS
  'How the AI draft was produced: a native vision read of a PDF/image, or the method the universal drawing reader used to recover a text digest (DXF/IFC entity parse, or ASCII/UTF-16LE label salvage from a proprietary binary).';
COMMENT ON COLUMN public.drawings.degraded IS
  'True when read_method is a lossy salvage/parsed digest rather than a native read of the actual sheet. Degraded reads are always routed to requires_human_takeoff regardless of scale_note, on top of the existing no-printed-scale rule.';
