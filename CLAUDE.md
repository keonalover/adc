# CLAUDE.md

This file is a shared working guide for Claude Code, Codex, and future agents operating in this repository.

Its purpose is to reduce hallucinations, improve token efficiency, and keep edits aligned with the real codebase.

## Operating goals

- Prefer repository facts over assumptions.
- Read the smallest set of files needed before editing.
- Treat this document as a routing map, not as the source of truth.
- If this file conflicts with code, trust the code and update this file.
- Avoid broad architectural claims unless they were verified in the repo.

## Quick reality check

This is a static-site repository with multiple independent surfaces and no app-wide build system.

- No `package.json` at repo root.
- Pages can be opened directly as static files or served from the repo root.
- Some tools/scripts use Node or Python ad hoc, but there is no single bundled app runtime.
- Public domain: `https://adc-ops.com/`
- The former CRM/outreach workspace is intentionally not part of the committed public repo.

## Core positioning

ADC Operations turns scattered restaurant reports into a short owner-facing red-flag brief.

ADC is not a generic dashboard, POS replacement, ERP, or broad consulting agency. It is an operational clarity layer for independent multi-location F&B owners.

ADC helps owners quickly see:

- what may be costing them money
- which location is drifting
- which reports are missing or inconsistent
- what changed this week
- what to ask managers

Core idea:

`"Your POS shows what happened. ADC shows what needs attention."`

Messaging guardrail:

ADC should not promise to save money or fix the business. ADC should surface what deserves attention so owners can decide what action to take.

## What lives where

### Marketing / public pages

- `index.html` + `index.css` + `index.js`: main public landing page
- `index-packages.html` + `index-packages.css` + `index-packages.js`: alternate landing page variant

### Archived CRM / outreach workspace

**`crm.html` is dormant and not maintained — likely for a long time.** Lead work currently stops at the qualified domain list (the `adc-lead-research` skill → Instantly/Apollo enrichment). The CRM, its Gmail OAuth integration, and the `crm.html`-dependent steps of the outreach-run / populate-from-crm flows are **not in active use**. The sections are kept for context and easy revival; do not invest in CRM changes or treat CRM breakage as in-scope unless explicitly reviving it.

The former CRM/outreach workspace is stored locally at `.local-archive/crm-outreach-2026-05-20/` and ignored by Git. It includes the old `crm.html`, `crm.css`, `crm.js`, `outreach-run/`, `build-crm-template/`, workbook templates, and CRM export data.

Do not restore, recommit, or deploy those files unless the user explicitly asks for the CRM to come back.

### Dashboard / reporting product

- `dashboard.html`, `upload.html`, `inventory.html`, `red-flags-report.html`: platform/reporting pages
- `js/main.js`: dashboard entry point
- `js/features/`: feature modules (`sales`, `labor`, `inventory`, `breakRisk`, `weeklyActions`)
- `js/config.js`: Supabase URL, anon key, and demo context constants
- `css/site.css`: dashboard styles
- `normalizer/`: transformation pipeline utilities for report data shaping

### Data / infra support

- Supabase schema/policy references should not be published casually; verify current database shape from Supabase or from user-provided SQL, not from old public files.
- `assets/`: images and preview assets used by the static pages

## Source-of-truth map

Use the code file that owns the behavior instead of scanning the whole repo.

### If the task is copywriting

Start with:

- the `Core positioning` section in this file
- the target page content (`index.html`, `index-packages.html`, `red-flags-report.html`, or `dashboard.html`)
- nearby headline, CTA, and section context before editing isolated lines

Copy objectives:

- emphasize operational clarity over software complexity
- write for independent multi-location F&B owners, not technical teams
- keep language concrete, short, and owner-facing
- frame ADC as attention guidance, not an autopilot decision-maker

Do:

- use direct outcomes like "what changed", "what is drifting", "what needs attention"
- keep claims observable and verifiable from reports
- preserve the core idea: `"Your POS shows what happened. ADC shows what needs attention."`
- make CTAs specific to the page intent (report request, sample review, or reporting workflow step)

Do not:

- position ADC as a POS replacement, ERP, or broad consulting firm
- promise savings, guaranteed profit improvement, or "business fixes"
- use generic AI/SaaS buzzwords that weaken operational credibility
- overstate automation beyond what the current product actually does

### If the task is about CRM behavior

The CRM is archived outside the committed repo. Start with `.local-archive/crm-outreach-2026-05-20/` only if the user explicitly asks to revisit or restore it. Keep it out of the public site until auth, API-key handling, and deployment boundaries are redesigned.

### If the task is about dashboard/report pages

Start with:

- `dashboard.html`, `upload.html`, `inventory.html`, or `red-flags-report.html` for the page shell
- `js/main.js` for orchestration
- `js/features/<feature>.js` for feature-specific logic
- `js/utils/formatters.js` for shared formatting helpers
- `js/config.js` for environment constants
- `css/site.css` for shared dashboard styling

### If the task is about the landing page

Start with:

- `index.html` for structure/content
- `index.css` for visual system
- `index.js` for interactions

Use the `index-packages.*` files only if the user explicitly mentions the packages variant or the change clearly belongs there too.

### If the task is about lead imports or workbook generation

The lead import and workbook generation tools were archived with the CRM. Start with `.local-archive/crm-outreach-2026-05-20/outreach-run/` or `.local-archive/crm-outreach-2026-05-20/build-crm-template/` only when the user explicitly asks to revisit that workflow.

## Token-efficient working style

Use this sequence unless the task clearly requires something else:

1. Read this file.
2. Identify the single surface involved.
3. Read only the entry HTML/JS/CSS for that surface.
4. Search for the exact function, selector, storage key, or page id involved.
5. Edit the smallest responsible file set.
6. Verify with a targeted read or local test instead of re-reading everything.

Good search anchors in this repo:

- page ids like `#sales-feature`, `#hero`, and report section ids
- feature mount ids like `labor-feature`, `inventory-feature`, `weekly-actions-feature`

Do not:

- assume archived CRM/outreach files are active
- assume the dashboard uses the same architecture as the marketing pages
- assume a file is unused because there is no bundler
- restore archived CRM/outreach files without explicit user approval
- scan every HTML file before making a narrow change

## Known current architecture facts

These are verified from the repo and are safe to rely on unless the code changes again.

- The CRM/outreach workspace has been removed from the committed repo and archived locally.
- `dashboard.html` loads `js/main.js` as a module and uses `css/site.css`.
- Dashboard/reporting logic is split across `js/features/` modules, not embedded inline in the HTML pages.
- The committed repo now focuses on static marketing pages and reporting/product pages.

## Archived CRM-specific guidance

The archived CRM previously included browser-side Supabase auth/sync, Gmail workflow logic, and Anthropic API-key handling. If the user asks to revive it:

- review the archived files before making claims
- do not put LLM provider keys in browser code or localStorage
- do not expose the CRM on the public domain without explicit access control
- preserve the no-automatic-email boundary unless the user explicitly changes it

## Approval and safety boundaries

Treat these as hard boundaries unless the user explicitly asks otherwise.

- Do not send emails automatically.
- Do not claim a batch is ready to send without checking the current workflow and filters.
- Do not move secrets or keys around casually; this repo currently contains public client-side config that should be handled carefully and described accurately.
- Do not invent backend behavior. If you cannot find the implementation, say it is not confirmed.

## Local running notes

There is no single canonical dev command. Use the lightest option that matches the task.

Examples:

```powershell
python -m http.server 8080
```

```powershell
npx serve .
```

Archived CRM/outreach tooling lives in `.local-archive/crm-outreach-2026-05-20/` and is not part of normal repo operation.

## When updating this file

Update `CLAUDE.md` whenever any of the following changes:

- page/file ownership
- major architecture shape
- workflow approval boundaries
- canonical entry points
- storage keys or integration patterns that agents are likely to reference repeatedly

<<<<<<< HEAD
Keep it short, specific, and biased toward navigation and verification. If a detail is likely to drift quickly, point to the owning file instead of copying the detail here.
=======
Outputs `ADC Outreach Lead List Template (blank).xlsx`. Requires Codex runtime (`@oai/artifact-tool`).

To reconstruct a populated workbook from current CRM state:
1. In `crm.html`, click Export JSON and save as `crm-export.json` at the repo root
2. Run: `python outreach-run/populate-from-crm.py crm-export.json`
3. The populated workbook lands at `ADC Outreach Lead List Template.xlsx`

## Architecture: CRM (`crm.html`)

> **Dormant — not in active use.** Retained for context and possible future
> revival. Treat the rest of this section as reference only.

Single-file vanilla JS app. Key design decisions:

- **State**: `leads` array persisted to `localStorage` under key `adc-crm-leads-v1`. Starter data seeds on first load.
- **Rendering**: Fully imperative — `render()` calls all sub-renderers on every state change. No virtual DOM or framework.
- **Import normalization**: `normalizeLead()` maps many field name variants so both the Excel converter output and hand-crafted JSON import cleanly.
- **Export**: JSON-only. Import accepts JSON or CSV.
- **Outreach sequence**: Six-step array (`sequence`) drives the Automation view. `markSent()` advances `sequenceStep`, sets the next due date, and appends a note. The last step (`monthly`) has `repeat: true` and loops.
- **Email drafts**: `generateDraft(lead, type)` returns template strings. `personalizationLine()` filters and normalizes the `personalization` field before inserting it.
- **Gmail integration**: Client-side OAuth using Google Identity Services (GIS) token flow. OAuth token stored in memory only (never localStorage). `lastGmailMessageId` and `threadId` are stored per lead after send for reply threading.

## Gmail OAuth setup (one-time)

1. Create a project at console.cloud.google.com
2. Enable Gmail API
3. OAuth consent screen → External → add your Google account as a Test User
4. Credentials → OAuth 2.0 Client ID → Web application
5. Authorized JavaScript origins: `https://adc-ops.com` and `http://localhost:8080`
6. No redirect URIs needed (GIS token popup flow)
7. Paste the Client ID into `GMAIL_CLIENT_ID` at the top of the `<script>` block in `crm.html`

## Architecture: marketing pages (`index.html` / `index-packages.html`)

Static HTML with embedded CSS and vanilla JS. Fonts loaded async via Google Fonts (Playfair Display + DM Sans). CSS custom properties under `/* CSS CUSTOM PROPERTIES — Edit colors here */` at the top of `<style>` are the single place to change the palette. CTAs link to Google Forms and Cal.com; there is no host-specific form handling.

Image assets required by each page:
- `index.html`: `adc-new-logo-header-optimized.jpg`, `chopsticks_logo_300x300px-1.jpg`, `ninemax-media.jpg`, `curate logo.jpeg`, `mahaaya_logo.jpeg`, `davien logo.avif`
- `index-packages.html`: `ADC CONSULTING TRANSPARENT LOGO WIDE.png`, `chopsticks_logo_300x300px-1.jpg`
- `crm.html`: `adc-new-logo-white-bg-header.png`

## Lead data model

| Field | Notes |
|---|---|
| `sequenceStep` | Index into `sequence[]`; advances on `markSent()` |
| `touches` / `touchCount` | Kept in sync (dual fields for import compatibility) |
| `nextDate` / `nextDueAt` | Kept in sync; source of truth for scheduling |
| `active`, `paused`, `replied`, `bounced`, `doNotContact` | `isStopped()` checks all five to gate automation |
| `lastGmailMessageId` / `threadId` | Stored after Gmail send; used for reply threading |
| `replyMessageId`, `repliedAt`, `replySnippet` | Stored when reply detected |
| `bounceMessageId`, `bouncedAt` | Stored when bounce detected |
| `temperature` | Cold / Warm / Hot / Client — drives card border color |
| `stage` | Research → Contacted → Engaged → Report Sent → Won |

## Sending and automation rules

- Only leads with `active=true`, `replied=false`, `bounced=false`, `paused=false`, `doNotContact=false`, and a valid email belong in a send batch.
- Before each batch, the CRM checks Gmail for replies and bounces and auto-updates lead status.
- Follow-up emails include `In-Reply-To` and `References` headers using the stored `threadId` so they thread correctly in Gmail.
- Gmail reply/bounce monitoring described in `outreach-run/README.md` is the manual predecessor to the built-in CRM polling.
>>>>>>> claude/jolly-wiles-3e226f
