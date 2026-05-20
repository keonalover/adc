# AGENTS.md

This is the Codex/agent-facing guide for the repo. Read `CLAUDE.md` for the fuller routing map before making broad claims.

## Current Shape

- Static site repo with no root `package.json` and no app-wide build command.
- Public domain: `https://adc-ops.com/`.
- Active public surfaces are the marketing pages and reporting/product pages.
- The former CRM/outreach workspace has been removed from the committed repo.

## Archived CRM

The old CRM/outreach materials are preserved locally at `.local-archive/crm-outreach-2026-05-20/` and ignored by Git. That archive contains the former `crm.html`, `crm.css`, `crm.js`, `outreach-run/`, `build-crm-template/`, workbook templates, and CRM export data.

Do not restore, recommit, or deploy those files unless the user explicitly asks for that. If the CRM is revived, redesign API-key handling and access control first; do not put provider keys in browser code or localStorage.

## Security Defaults

- Do not add secrets to committed files.
- Public Supabase anon keys are acceptable only with verified row-level security.
- Do not publish database schema/policy SQL unless the user explicitly wants it public.
- Avoid adding public admin/tool pages without access control.
- Do not send emails or trigger outreach automatically.

## Working Notes

Use the lightest local check that fits the task:

```powershell
python -m http.server 8080
```

For page work, edit the owning HTML/CSS/JS surface directly and verify with a targeted browser or file check.
