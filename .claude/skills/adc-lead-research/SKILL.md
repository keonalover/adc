---
name: adc-lead-research
description: >-
  Pure scraper that discovers independent multi-location F&B operators from an
  Apify Google Maps export (or Google Places API) and outputs a domain list for
  Apollo/Instantly enrichment; NOT for email, owner-name, or personalization
  research.
---

# ADC Lead Research

Discover independent multi-location F&B operators and produce a deduped domain
list. This skill stops at business/domain qualification. It does not research
owners, collect emails, generate email permutations, or write personalization.

## Dual Runtime Warning

The canonical copy is `.claude/skills/adc-lead-research/`. Generated copies may
exist at `.codex/skills/adc-lead-research/SKILL.md` and in `AGENTS.md`. Edit the
canonical skill first, then run:

```powershell
pwsh -File .claude/skills/adc-lead-research/scripts/sync-skills.ps1
pwsh -File .claude/skills/adc-lead-research/scripts/sync-skills.ps1 -Check
```

## Discovery Sources

Two interchangeable front ends feed the same clustering/qualification logic in
`cluster.py` (`build_outputs()`):

- **Apify Google Maps export (active default).** `apify-ingest.py` reads a JSON
  dataset exported from an Apify Google Maps / Google Places crawler. No API key
  and no per-request budget on our side — cost is the Apify run itself. This is
  the active path because the Google Places API billing is unavailable.
- **Google Places API (retained, currently blocked).** `places-discover.py`
  uses Google Places Text Search with a `maxApiCalls` hard cap from `brief.json`
  (default `400`); budget ~`$5/1k` requests. Requires `GOOGLE_PLACES_API_KEY`.
  Kept for when Places billing is restored; do not delete.

Both write identical `candidates.json` / `candidates-skipped.json` contracts and
tag rows with `source` (`apify` or `google_places`).

## Workflow

1. Discover raw candidates.

   Active path — from an Apify Google Maps export:

```bash
python .claude/skills/adc-lead-research/scripts/apify-ingest.py <apify-export.json> outreach-run [--state XX] [--min-rating R] [--min-review-count N]
```

   Alternate path (only when Places billing is available):

```bash
python .claude/skills/adc-lead-research/scripts/places-discover.py <brief.json> outreach-run
```

   Either writes `candidates.json` and `candidates-skipped.json`.

2. Model-qualify candidates:

Review `candidates.json`, reject franchises/chains, and confirm independent
multi-location F&B operators. Write `qualified.json` using the contract below.
Use `candidates-skipped.json` only for manual review when a brand appears
multi-location but lacks a reliable own-site domain.

While reviewing, also identify **sister concepts** — distinct candidate brands
that are under common ownership (a shared parent/restaurant group, the same
owner named across the sites, or sibling concepts cross-linked from each other's
sites). Assign every brand you believe shares ownership the same
`ownershipGroup` slug (e.g. `"acme-hospitality"`); leave it blank/omitted for
standalone operators. Treat detected groups as **suggestions for the user to
confirm** — surface them for review, do not silently merge or drop members.

3. Build the deduped export:

python .claude/skills/adc-lead-research/scripts/build-lead-list.py <qualified.json> outreach-run

The build step appends new concepts to `outreach-run/lead-master.csv` and writes
an Instantly/Apollo-ready domain list only when new concepts exist.

## brief.json Schema

```json
{
  "state": "TX",
  "categoryKeywords": ["ramen", "thai restaurant"],
  "cities": ["Houston", "Dallas"],
  "minRating": 4.0,
  "minReviewCount": 200,
  "maxApiCalls": 400,
  "locationPreCount": false
}
```

`state` is required when `cities` is omitted. Without `cities`, discovery uses
`scripts/state-cities.json`. `minReviewCount` is enforced client-side.
`locationPreCount: true` makes a best-effort own-site pre-count by fetching the
root page plus `/locations`, `/our-locations`, `/contact`, and `/find-us`.

## qualified.json Contract

```json
[
  {
    "businessName": "Example Kitchen Group",
    "website": "https://examplekitchen.com",
    "domain": "examplekitchen.com",
    "city": "Houston",
    "state": "TX",
    "locations": 3,
    "reviewRating": 4.4,
    "reviewCount": 1250,
    "source": "apify",
    "locationsConfidence": "ok",
    "ownershipGroup": "example-hospitality"
  }
]
```

`source` is `apify` or `google_places` (carry through whatever the candidate
row had). `locationsConfidence` must be `ok` or `low`; use `low` when the
own-site count is incomplete, JavaScript-gated, or otherwise needs manual
confirmation.

`ownershipGroup` is optional (omit or leave empty for standalone operators). It
is a **qualify-stage manual-review aid only and is intentionally not exported**
— `build-lead-list.py` drops unknown keys, so the slug informs the user's
keep/drop decision while reviewing candidates but does not persist into
`lead-master.csv` or the Instantly/Apollo export. This is deliberate, not data
loss; adding it to the export schema is out of scope.

## Franchise Rejection Checklist

Reject brands that show any of these signals:

- National or regional franchise pages, franchise disclosure, or "own a
  franchise" calls to action.
- Corporate location finders listing many states beyond the target operator.
- Public brand ownership by a large restaurant group, hotel group, airport
  concessionaire, or private-equity rollup.
- Google results that are unrelated same-name operators rather than one
  state-scoped concept.
- Aggregator-only web presence without a real own-site domain.

## Export Schema

The export has exactly 9 columns:

`Business Name, Website, Domain, City, State, Locations, Review Rating, Review Count, Source`

No owner names, contact names, emails, email patterns, or personalization notes
belong in the export.

## Dedupe Model

The persistent master is `outreach-run/lead-master.csv`. New dedupe uses:

`slug(businessName) + "|" + domain + "|" + state.lower()`

Legacy rows are migrated idempotently by adding a `Domain` column when missing
and back-filling it from `Website`. Existing rows are never dropped. Owner-key
dedupe is removed; owner/contact columns remain only as blank legacy columns in
the master for compatibility.

## Verify

For script changes, verify offline before live API use:

- Run `build-lead-list.py` against a temp copy of `lead-master.csv`; confirm
  `Domain` is added/back-filled, legacy rows remain intact, duplicate concepts
  are skipped, new legacy contact columns stay blank, and the xlsx export has
  exactly 9 columns.
- Run `places-discover.py <brief.json> <out_dir> --fixture <responses.json>`
  (the `brief.json` and output-dir positionals are required by argparse before
  `--fixture` is honored); confirm a 2+ location own-site brand appears in
  `candidates.json`, one-location and aggregator-only brands do not, and
  same-name brands are grouped only within the same state.
- Run `apify-ingest.py <apify-export.json> <out_dir>` against a sample export;
  confirm candidates carry `placeCount >= 2` and `source: "apify"`,
  aggregator-only brands fall to `candidates-skipped.json` as `no-own-site`,
  and the printed counts reconcile with the input record count.
- Run `sync-skills.ps1`, then `sync-skills.ps1 -Check`; `-Check` must exit `0`.
