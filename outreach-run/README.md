# ADC Outreach Run Workflow

Use this folder when the filled `ADC Outreach Lead List Template.xlsx` comes back.

## Convert Excel to CRM JSON

```powershell
& 'C:\Users\phama\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' convert-lead-list.py '..\ADC Outreach Lead List Template.xlsx' .
```

Outputs:
- `*-crm-import.json`: import into `crm.html` with the `Import Leads` button.
- `*-summary.json`: validation summary for missing emails, duplicates, and skipped rows.
- `*-draft-preview.json`: recipient, subject, and body preview for approval before Gmail sending.
- `*-batch-review.json`: sendable, skipped, manual-contact, and same-company review buckets.

## Approval Boundary

Gmail sending happens only after the user approves the batch summary. The CRM can prepare and track outreach, but real sends require explicit approval.

## Cadence

After a send is marked complete, the CRM queues:
- follow-up 1 after 3 business days
- follow-up 2 after 3 business days
- two weekly follow-ups
- monthly long-tail follow-ups

Any reply or bounce should pause the lead before the next batch. Gmail monitoring is handled before each approved batch by checking for replies/bounces, then updating CRM fields (`replied`, `bounced`, `active`, `threadId`, `lastGmailMessageId`) before sending.

## Gmail Monitoring Before Each Batch

Before creating or sending a due batch, run these checks through the connected Gmail account:
- Replies: search recent inbox mail from each sent lead or stored thread id. Any reply marks `replied=true`, `active=false`.
- Bounces: search for delivery failure, undelivered mail, mailer-daemon, and failed recipient messages matching sent lead emails. Any hit marks `bounced=true`, `active=false`.
- Manual review: if the match is ambiguous, mark `paused=true` and keep it out of the sendable queue until reviewed.

Only leads with `active=true`, `replied=false`, `bounced=false`, `paused=false`, `doNotContact=false`, and a valid email belong in an approved Gmail send batch.
