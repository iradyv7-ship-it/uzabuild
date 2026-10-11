# UZA Build — roadmap

## Done
- [x] Policy constants (`src/config/policy.ts`) + pure money maths (`src/lib/pricing.ts`) with 15 unit tests
- [x] UZA design tokens, dark mode, tabular numerals
- [x] Full data model: clients, stage machine, elements, suppliers, takeoff lines + corrections, BOQ versions, proposals, requisitions, RFQs, POs, deliveries, project invitations
- [x] RLS + GRANTs on every new table; clients are cost-blind; price history append-only; anon cannot execute helper functions
- [x] Roles extended: client, procurement, project_manager
- [x] AuthProvider mounted app-wide (was missing — /auth was crashing)
- [x] Project workspace tabs: Overview (stage machine), Drawings, Takeoff review, BOQ, Solar, Proposal, Procurement
- [x] Human takeoff queue on unreadable uploads (no silent failure)
- [x] Takeoff accuracy view from real corrections
- [x] Shared loading (skeleton) / empty / error states

- [x] Guided client brief (fixed questionnaire, client answer + internal note, blocks-procurement list, engagement protocol, site/branding standard)
- [x] Project discussions: scoped threads (internal / factory / client engineer / joint), per-thread participants, attachments, EN<->ZH translation, no private inboxes

## Remaining
- [x] Proforma builder: paste a factory RMB quote, translate to English, convert at the pinned RMB/USD rate, print on the UZA letterhead with the client's registered identity
- [ ] Guided client registration wizard writing the new client identity fields (code, TIN, decision maker, language)
- [ ] Invite factory/client-engineer participants by email so they can actually sign in
- [ ] BOQ versioning UI: create a version, pin rates, explicit re-price showing the delta
- [ ] Write BOQ lines in integer minor units (`unit_rate_minor`/`amount_minor`) instead of the legacy numeric columns
- [ ] XLSX and PDF export (CSV + print-to-PDF only today)
- [ ] Clients screen and supplier management screen (tables exist, no UI)
- [ ] Invite external specialist by email (table + RLS exist, no UI, no email send)
- [ ] Sequential approval enforcement against `APPROVAL_SEQUENCE` (sign-off is currently unordered)
- [ ] AI takeoff extraction itself (drawings are stored and queued; no reader wired yet)
- [ ] Password reset flow
- [ ] Solar option cost implications priced from catalog items
- [ ] Responsive pass at 360 / 768 / 1440 and dark-mode pass on new panels

## Done this pass
- Guided client registration wizard + /clients screen, linked to project creation and the proforma letterhead.
- Drawing reader: read a PDF or image drawing into draft takeoff lines with confidence and source; failures go to the human queue with a reason.
- Live USD/RMB rate from a published feed, cached, with "reprice at today's rate" showing the delta. No hardcoded 6.
- Stage gate: one stage forward at a time, only when every required seat has signed, with name and timestamp. Enforced in the database too.

## Still open
- XLSX/PDF BOQ export (CSV only today).
- External specialist invitations by email (records exist, no email is sent yet).
- Password reset flow.
- Pre-existing SECURITY DEFINER linter warnings on helper functions.

## Done — Excel export, invitations, password reset (this pass)
- BOQ tab exports a real .xlsx (BOQ sheet with full house/floor/room hierarchy, catalog item, supplier, base quantity, wastage %, billable quantity, catalog rate, applied rate, amount; Summary sheet with per-house/floor/room rollups). CSV kept.
- Project "Team" tab: invite an architect, engineer, factory contact or client-side person by email into one project with one role. Sends a Supabase sign-in invitation, records project_invitations, project_members and user_roles server-side; resend and remove supported.
- Password reset: "Forgot password?" on /auth and a /auth/reset page to set a new password.

## Still open
- Auth emails send from the default platform sender until a UZA email domain is connected.
- PDF export of the BOQ (Excel + print are available today).
- 8 pre-existing Supabase SECURITY DEFINER linter warnings.

## Done — client portal walkthrough (this pass)
- Client dashboard at /portal: projects with stage, issued/signed proformas, recent sign-offs, live USD/RMB rate with source and date. No catalog, rate or supplier data reachable (verified by direct probes: 0 rows / permission denied).
- Invitation → account: inviting an email creates the account with its role immediately; first sign-in confirms the seat and marks the invitation "Signed in".
- Issued-but-unsigned proformas can now be signed; UZA-PF-2609-0002 signed by Yves (CEO). Chinese unit words spelled out in English on the document and PDF.
- Clients can read the company record attached to their project so the letterhead shows who the proforma is issued to.

## Open (blocked on input)
- Real Rwandan catalog rates + suppliers → reprice hall BOQ. Blocked: no supplier rate list supplied (material, unit, rate, currency, supplier, contact, lead time).
- Admin account walk with uzasolutionsrda@gmail.com. Blocked: that email must sign up itself; admin seat is granted automatically on signup.
- Invitation emails send from the default platform sender until a UZA email domain is connected.
- Decomax contact details (Attn, email, phone) on the client record were entered during testing and must be replaced with the real ones.

## Architecture pass (engineering standards) — area by area
Standard asks for separate frontend/backend apps; hosting runs one app, so the split is
logical: pages/components/services in the interface, all data access and rules server-side.
Documented in README.

- [x] Area 1 — Auth + client portal: `src/constants/roles.ts`, `src/context/AuthContext.tsx`,
      `src/hooks/useAuth.ts`, `src/services/{authService,portalService}.ts`,
      `src/pages/{Auth,Portal}/`, reusable `AuthLayout`, `StatCard`, `StageTimeline`,
      `ProformaViewerDialog`; route files reduced to title + component. `.env.example` + README.
- [ ] Area 2 — Projects: projectService, `src/pages/Projects/`, split the project workspace tabs.
- [ ] Area 3 — Catalog, clients, suppliers: catalogService + `src/pages/Catalog/`, `src/pages/Clients/`.
- [ ] Area 4 — BOQ, takeoff, proforma panels: move remaining queries into services, split large panels.
- [ ] Area 5 — Shared form/table/dialog primitives; responsive pass 320→1920; dark-mode pass.

## Sourcing packages (Cecilia brief)
- [x] Package model, 10-point sourcing checklist, attachments, quality tiers, budget/delivery/priority
- [x] Packages tab in the project workspace
- [x] Manufacturers screen: factories + coverage by product family and quality level
- [ ] Seed real factory coverage (2-3 per family) — needs the real factory list
- [ ] BOQ preparation fee is policy only (ASSUMED), not billed anywhere yet
- [x] Phases + factory commitment tracking (confirmed, deposit paid, in production, shipping)
- [x] Cross-project Sourcing Board and copyable "what we still need" request list

## Client workspace — drawings, progress, access grants, design board (9 Oct 2026)
- [x] Clients submit technical drawings from their portal (PDF, DWG, DXF, IFC, RVT, SKP, images, Excel, Word); each one is a restricted client submission with status "Received", set by the database.
- [x] Clients follow the work on each document: status (received → being reviewed → in progress → needs revision → accepted), team updates marked client-visible, and their own comments.
- [x] Per-document access grants: a project lead (owner, project manager, admin) routes a client submission to a discipline seat (architect, QS, interior designer, MEP, procurement, China sourcing) or a named person. Nobody else, and no assistant, reads it until then.
- [x] Discipline assistant (architect / QS / interior designer / MEP) on the Drawings tab: reads the PDFs, images and CAD digests the asker can access, plus rooms and the design board. Advises only.
- [x] Client design board: browse showcase products (picture, 3D link, swatch — never price), propose products, colours, reference pictures and ideas per room; the team accepts, customises with an alternative, or declines with a reason. Team side is the "Client board" tab.
- [x] Catalog: "Shown to clients" setting per item with picture link, 3D link and swatch.
- [x] Security fixes: the FOR ALL "team write" policies also granted SELECT, so clients could read every internal drawing and write houses/floors/rooms/solar/Speckle rows; the China-sourcing drawings policy also covered client members; storage read was folder-wide. All closed and tested against a local Supabase Postgres (34 checks).
- [ ] Picture upload for showcase items (links only today).
- [ ] Notify the client (email/WhatsApp) when a status or answer changes.
- [ ] Move the five Claude call sites to the Anthropic SDK and one model constant.

## Audit fixes — formats, BOQ, manufacturer RFQs, ease of use (10 Oct 2026)
- [x] SECURITY: public sign-up could grant itself any staff seat (QS, architect, PM…) and read every client record and the priced catalog. Self sign-up is now client-only; staff seats come only from invitations/bootstrap/admin (migration 20261010090000, tested).
- [x] Proforma FX now starts from the UZA basis (6 RMB/USD, founder policy) instead of the live ~7.1 market rate; "Reprice" applies the basis; the live rate is shown for reference only.
- [x] Proposal price was 100× too high for USD/CNY (minor units converted twice); re-seeded from the BOQ each time the dialog opens.
- [x] Dashboard crash on China-sourcing landing (hooks after an early return); no staff menu flash for clients while roles load.
- [x] Each seat opens a project on its own tab (QS → Takeoff, architect/MEP → Drawings, designer → Client board, sourcing → Packages); tab kept in the URL (?tab=).
- [x] Real readers: XLSX/XLSM/XLS/ODS/CSV/TSV (SheetJS, rows and numbers kept), DOCX/PPTX text; HEIC/TIFF/BMP routed to people with a clear reason; images over 5 MB refused with advice. Spreadsheets no longer stick in "processing".
- [x] readDrawing: every failure marks the drawing failed with a reason; "Read again" replaces draft lines instead of duplicating; truncation and refusals detected.
- [x] Import an existing BOQ spreadsheet (client's or factory's): AI structures rows, preview + edit, writes houses/floors/rooms and BOQ lines (blank-rate BOQs supported).
- [x] Takeoff → BOQ bridge: reviewed takeoff lines go into the BOQ with their room and quantity, no retyping; idempotent; reviews also write training_records.
- [x] Unpriced BOQ lines get a catalog-item picker; deactivated catalog items no longer zero a line's price.
- [x] Manufacturer RFQ per package: "Draft RFQ (EN + 中文)" builds the spec, quantity schedule from the BOQ and category-specific questions (tiles, lighting, aluminium…), with client, project, budget and price removed; copy + mark sent.

### Still open from the audit
- [ ] Notifications (email/WhatsApp) on client uploads, status changes, RFQ replies.
- [ ] BOQ versioning (pin rates per issued version), integer minor-unit money columns, FX on mixed-currency BOQ lines, BOQ PDF.
- [ ] Interface translation (French, Kinyarwanda, Chinese); mobile navigation.
- [ ] Large drawing sets: page splitting + background reading instead of one request.
- [ ] Review existing user_roles in production for staff seats created through the old sign-up hole.

## Factory workspace, quote comparison, confidentiality walls (11 Oct 2026)
- [x] /supplier workspace for factories (EN + 中文): their RFQs, released files, submit a quote (PDF/Excel/CSV/Word/photo), correct the read lines, withdraw, message UZA with stored translations.
- [x] Quotes read by AI into lines matched to the RFQ schedule; Chinese originals kept; never invents prices or quantities.
- [x] Staff: "Factory quotes · 报价对比" per package — side-by-side matrix in USD at the 6 RMB/USD basis, missing items and quantity mismatches flagged, coverage, lead time; review/shortlist/select/reject; quotes received by email can be entered; start a client proforma from the selected quote.
- [x] Every RFQ sent is recorded with its exact text and schedule (package_rfqs).
- [x] Walls, enforced in the database and tested (migration 20261011090000):
  - factories: no package title, budget, client, project name/location, internal notes or checklist; nothing until an RFQ is sent; only files a person released; never another factory's quote, files or messages;
  - anything UZA sends a factory (RFQs, messages, translations) is refused if it names the client, contact, project or site;
  - anything UZA writes for a client (design-board answers, progress updates, showcase products) is refused if it names a factory; proformas already were;
  - business settings (wastage, coverage, solar factors) were readable by every account incl. clients and factories — staff only now; client menu no longer links to Settings.
- [ ] Staff-only notes on a quote (today a factory can read its own quote's notes field).
