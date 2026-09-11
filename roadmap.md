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
