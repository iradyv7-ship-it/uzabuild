/**
 * Automated confidentiality verification for text THIS SYSTEM GENERATES
 * ITSELF — a proforma, a translated BOQ. Reliable here because the system
 * controls every string in the output, unlike an arbitrary uploaded file
 * (see the migration comment on `drawings.client_visible` for why that case
 * is handled differently — a human decision, not a scan).
 *
 * Pure and dependency-free on purpose: the list of names to check against
 * comes from real data (suppliers/manufacturers, Cecilia's own contact
 * details — see `verifyNoForeignBranding` in confidentiality.functions.ts,
 * which queries it), but the matching logic itself is testable on its own.
 */

export type ForeignBrandingCheck = {
  clean: boolean;
  /** The known non-UZA identifiers actually found in the text, de-duplicated. */
  matches: string[];
};

/**
 * UZA's own names are never a match, even though "Ltd" or "Build" are short
 * and generic enough to otherwise collide with something in a supplier list.
 * Checked before a candidate name is even considered, so UZA's own letterhead
 * can never flag itself.
 */
const UZA_SAFE_PATTERNS: RegExp[] = [
  /uza solutions/i,
  /uza finishing solutions/i,
  /uza build/i,
  /unify house/i,
  /uzasolutions\.com/i,
];

function isUzaOwnName(candidate: string): boolean {
  return UZA_SAFE_PATTERNS.some((p) => p.test(candidate));
}

/**
 * Scan `text` for any of `knownNames` (case-insensitive substring match).
 * Names shorter than 3 characters are skipped — too noisy to check safely
 * (e.g. a two-letter abbreviation would match constantly). Never invents a
 * verdict beyond "this literal string appears" — no fuzzy matching, because
 * a false sense of a clean pass is worse than a name it cannot catch.
 */
export function checkForForeignBranding(
  text: string,
  knownNames: readonly (string | null | undefined)[],
): ForeignBrandingCheck {
  const hay = text.toLowerCase();
  const matches = new Set<string>();

  for (const raw of knownNames) {
    const name = (raw ?? "").trim();
    if (name.length < 3) continue;
    if (isUzaOwnName(name)) continue;
    if (hay.includes(name.toLowerCase())) matches.add(name);
  }

  return { clean: matches.size === 0, matches: Array.from(matches) };
}
