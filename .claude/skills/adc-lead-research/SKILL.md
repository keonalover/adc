---
name: adc-lead-research
description: >-
  Research and qualify independent multi-location F&B operators from a search
  criteria string + US State, then produce an Instantly-ready lead list
  (xlsx/CSV) deduped against a persistent master. Use when the owner asks to
  "find leads", "research operators", "build a lead list", or gives a prospecting
  brief like "Asian cuisine, 3+ locations, 4.0+ rating, 200+ Google reviews in
  CA". Not for sending email or building client reports.
---

# ADC Lead Research & Qualifier

Turn a prospecting brief into a qualified, deduped, Instantly-importable lead
list for ADC's F&B outreach.

> **Dual-runtime skill.** The canonical copy is `.claude/skills/adc-lead-research/`.
> The repo-root `AGENTS.md` and `.codex/skills/adc-lead-research/SKILL.md` are
> generated copies. **Never hand-edit a copy.** Edit this file, then run
> `scripts/sync-skills.ps1` and commit all three together.

## Input

The owner provides a free-text criteria string **and a US State**, e.g.:

> "Asian cuisine, 3+ locations, 4.0+ rating, 200+ Google reviews — State: CA"

Parse into: cuisine/category, min location count, min Google rating, min Google
review count, and the State (State scopes the entire search).

## Methodology (follow exactly)

You (the model) do the web research with WebSearch/WebFetch. The bundled script
only consumes the structured rows you produce — it never browses.

### 1. Discover candidates

Find independent (non-franchise) F&B operators in the given State whose Google
rating and review count meet the thresholds and whose cuisine matches.

### 2. Location count — from the operator's own website only

`Locations` = the number of **distinct, currently-operating street addresses
listed on the operator's own website** (locations / contact page). Rules:

- Do **not** infer the count from Google/Yelp.
- **Exclude** HQ / corporate / catering-only / office addresses, permanently
  closed locations, and "coming soon" addresses. Exclude franchise locations.
- Normalize each address (case/punctuation/suite/abbreviation-insensitive)
  before counting so variants of the same address don't double-count; keep the
  raw address text for the audit trail.
- Attribute an address to a concept only where the site ties that address to
  that brand.
- If the site uses a JS store locator, only trust an embedded JSON blob or a
  locator API you can actually read. If you cannot confirm the full statewide
  count from the site, set `Locations Confidence = low` and flag the row for
  manual check. **Never guess a number.**
- Record the `Locations Source` URL.

### 3. Contact person + email

Find the **owner or owner-equivalent** (founder, principal, managing partner).
Record **First Name** and **Last Name** separately.

Email resolution:

- **Public email found** → one row, `Email Type = public`.
- **No public email** → emit **one row per permutation pattern** at the
  operator's domain, in this exact order:
  1. `[firstname]@[domain]`
  2. `[firstinitial][lastname]@[domain]`
  3. `[firstname].[lastname]@[domain]`
  4. `[firstname][lastname]@[domain]`

  All four rows are identical in **every column except `Email`**. Set
  `Email Type = permutation-guess` and `Email Pattern` to which of the four.
  Lowercase the local part and domain.

> Permutation-guessed rows are **excluded from any live Instantly campaign by
> default** until verified. They are research output, not send-ready contacts.
> Say this to the owner whenever guessed rows are produced.

### 4. Sister-concept expansion

On the operator's website, look for other F&B concepts/brands the same owner
runs. If none are listed, Google the **owner's name** to find other F&B
businesses tied to them.

Each sister concept becomes **its own row set**, researched with the same rules
(its own addresses → Locations, its own website, reviews, Personalization Note;
it itself expands into permutation rows if it has no public email). First/Last
Name and the guessed email pattern may repeat across an owner's concepts.

### 5. Personalization Note — ADC voice

One specific sentence, in ADC's established tone: humble, hands-on, data-aware,
never generic flattery. Match the voice of `generateDraft()` / `introTemplate()`
in `crm.js` (e.g. references a real, concrete signal — a new location, a strong
review standard worth protecting before expanding — tied to the free
diagnostic / red-flag value prop). One sentence, ≤ 170 chars, no hype.

### 6. Hand structured rows to the script

For every researched concept, produce a row object with these fields plus the
internal metadata, then run the writer (it does dedupe + permutation expansion
validation + file output + master append):

```
python .claude/skills/adc-lead-research/scripts/build-instantly-list.py <rows.json> outreach-run
```

The script reads `rows.json` (the list you assembled), dedupes against
`outreach-run/lead-master.csv`, writes
`outreach-run/instantly-lead-list-<YYYY-MM-DD>.xlsx` (CSV fallback if `openpyxl`
is unavailable — it prints a clear message), and appends newly accepted concepts
to the master. It **never overwrites** an existing same-day list (adds a `-2`,
`-3`… suffix) and writes **no file at all** when a run yields zero new concepts.

## Output schema (exactly these 11 columns, in order)

`Business Name, First Name, Last Name, Email, City, State, Website, Locations,
Personalization Note, Review Rating, Review Count`

- `Review Rating` numeric, `Review Count` integer. All reviews are Google by
  definition of the criteria, so there is **no** Review Platform column.

Internal-only columns kept in `lead-master.csv` (never in the Instantly export):
`Concept Key, Owner Key, Email Type, Email Patterns Emitted,
Locations Confidence, Researched Date, Source`.

## Dedupe model (per concept, not per row)

- `Concept Key` = `slug(business name) | slug(website domain or "no-domain") | state`.
  Canonicalize the domain **after following redirects**; store domain aliases.
- `Owner Key` = `slug(owner name) | state`. This is a **review/grouping signal,
  not a hard merge primitive** — it stops re-mining the same owner every run and
  flags likely dupes for manual review; common names / initials / nicknames /
  cofounders must not silently merge.
- A concept is a duplicate if its `Concept Key` already exists in the master,
  **or** it shares an `Owner Key` *and* a matching normalized business name.
  Email is **never** a dedupe key.
- The up-to-4 permutation rows of one new concept are **not** dupes of each
  other. The master records the concept **once** with the list of emitted
  permutation patterns; a later run that re-finds that concept skips it whole.
- `no-domain` concepts require manual-review status with city + source URL as
  tie-breakers.

## Reuse

- Tone: `crm.js` `generateDraft()` / `introTemplate()` / `personalizationLine()`.
- xlsx writer pattern: `outreach-run/convert-lead-list.py` (openpyxl).

## Verify

Run with a sample brief + State, then confirm: the export has exactly the 11
columns and opens in Excel; an operator with no public email yields exactly 4
rows differing only in `Email`; sister concepts appear as their own row sets;
`lead-master.csv` records each concept once; a re-run with overlapping criteria
adds only genuinely new concepts. Always tell the owner which rows are
`permutation-guess` (hold-back-by-default).
