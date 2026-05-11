# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

ADC Consulting outreach toolkit for independent multi-location F&B operators. Deployed on Netlify at `https://adc-consulting.netlify.app/` as a static site — no `netlify.toml`, `_redirects`, `package.json`, or build command. Netlify deploy settings are configured in the Netlify dashboard.

Five areas:
- **`index.html`** — Public marketing/landing page
- **`index-packages.html`** — Alternate landing page variant (slightly different color tokens, synchronous font loading)
- **`crm.html`** — Local-first outreach CRM (single HTML file, all state in `localStorage`)
- **`outreach-run/`** — Excel → JSON draft/review pipeline for Gmail outreach
- **`build-crm-template/`** — Codex script to regenerate the `.xlsx` lead list template

## Running locally

No build system. Open HTML files directly in a browser or serve from the repo root:

```bash
npx serve .
# or
python -m http.server 8080
```

For Gmail OAuth to work locally, `http://localhost:8080` (or your port) must be added as an authorized JavaScript origin in Google Cloud Console alongside `https://adc-consulting.netlify.app`.

## Outreach run workflow

When a filled `ADC Outreach Lead List Template.xlsx` comes back:

```powershell
# Python converter — produces all four output types including batch-review.json
# Requires: pip install openpyxl (no requirements.txt in repo)
& 'C:\Users\phama\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' outreach-run\convert-lead-list.py '.\ADC Outreach Lead List Template.xlsx' outreach-run

# Node/Codex converter — Codex-runtime-based, produces fewer output types (no batch-review)
node outreach-run/convert-lead-list.mjs '.\ADC Outreach Lead List Template.xlsx' outreach-run
```

Outputs land in `outreach-run/`:
- `*-crm-import.json` — import into `crm.html` via the Import Leads button
- `*-summary.json` — validation summary (missing emails, duplicates, skipped rows)
- `*-draft-preview.json` — subject/body preview for approval
- `*-batch-review.json` — sendable, skipped, and manual-contact buckets (Python only)

## Rebuilding the Excel template

The template builder produces a blank structural template only — it never overwrites the populated working file.

```bash
node build-crm-template/build-template.mjs
```

Outputs `ADC Outreach Lead List Template (blank).xlsx`. Requires Codex runtime (`@oai/artifact-tool`).

To reconstruct a populated workbook from current CRM state:
1. In `crm.html`, click Export JSON and save as `crm-export.json` at the repo root
2. Run: `python outreach-run/populate-from-crm.py crm-export.json`
3. The populated workbook lands at `ADC Outreach Lead List Template.xlsx`

## Architecture: CRM (`crm.html`)

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
5. Authorized JavaScript origins: `https://adc-consulting.netlify.app` and `http://localhost:8080`
6. No redirect URIs needed (GIS token popup flow)
7. Paste the Client ID into `GMAIL_CLIENT_ID` at the top of the `<script>` block in `crm.html`

## Architecture: marketing pages (`index.html` / `index-packages.html`)

Static HTML with embedded CSS and vanilla JS. Fonts loaded async via Google Fonts (Playfair Display + DM Sans). CSS custom properties under `/* CSS CUSTOM PROPERTIES — Edit colors here */` at the top of `<style>` are the single place to change the palette. CTAs link to Google Forms and Cal.com — there is no Netlify Forms handling.

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
