# Sales Campaign Lessons

A running log of what each outreach campaign taught us. Read this before launching or retargeting a segment.

## The four levers (in order of what to check first)

1. **Deliverability (gate, not a persuasion lever).** If you are in spam, nothing else matters. Rule it out before debating the others.
   - Read it from reply *type* and bounce *trend*, not open rates (opens are unreliable with privacy protection).
   - Any out-of-office (OOO) auto-reply is proof of inbox placement: a server does not OOO something it spam-filed.
   - A bounce rate trending down (early bad-data tail clearing) is healthy. A flat or rising one is not.
2. **Targeting.** Right people. We section this by segment: multi's vs. singletons.
3. **Offer.** What we promise, and the risk reversal attached to it.
4. **Copy.** How we frame and ask.

Judge early results on *matured at-bats* (contacts that reached step 3+), not total sequences started. Positive replies on high-ticket cold usually land on steps 3 to 5.

Track three reply numbers separately, do not blend them:
- **Total reply rate** (includes machine replies)
- **Human reply rate** (excludes OOO and "no longer in use")
- **Positive/interested reply rate**

---

## Campaign 1 — Multi-location ("multi's"), first campaign

**Status as of 2026-06-11:** live, first campaign for the segment.

**Volume:** ~380 sequences started, 66 reached step 3. Last 3 days sent 370+ emails.

**Replies:** 4 total (~1.3%), all machine: 1 "email no longer in use," 3 OOO. **Zero human replies.**

**Bounces:** 27 total (high against the rate early on), but only 3 of the last 370+ sent (~0.8% recent). The early tail was bad-list data clearing out.

**Diagnosis:**
- Deliverability ruled out. OOO replies prove inbox placement; bounce trend is healthy and falling.
- Emails are landing, humans are seeing them, no human has engaged. That points at message-market resonance, not a technical problem. Still partly a volume/maturity question at only 66 matured at-bats.
- **Leading hypothesis: under-offered.** The multi sequence never *mentions* the free health check, even though we would send it. We are eating the cost of the offer without getting the conversion lift from naming it.

**Lessons for the next multi campaign / retarget:**
1. **Name the free health check** in the multi sequence (mirror where the singleton campaign places it, step 3). Higher-ticket, more-skeptical, more-to-lose buyers need *more* risk reversal, not less.
2. Re-run the four-lever check above before concluding anything. Confirm deliverability first via reply-type + bounce trend.
3. Let matured volume build before judging. 66 at-bats is unlucky-zero territory, not broken.
4. The singleton campaign launched 2026-06-11 *does* name the free health check on step 3. Treat the two as a natural A/B (free-check-named vs. not) and watch which segment breaks the zero first.

**To revisit when retargeting multi's:** pull current total / human / positive reply rates and the bounce trend, then compare against this baseline before changing the offer or copy again.

---

## Campaign 2 — Singletons, launched 2026-06-11

**Status as of 2026-06-11:** launched today.

**Offer note:** this sequence *does* name the free health check on step 3 (the variable being tested against Campaign 1's omission).

*Results pending. Update once matured at-bats accumulate.*

### A/B test design of record (added 2026-06-12)

Variants written after the interactive health-check tool shipped (adc-ops.com/health-check.html). Each B variant tests one lever against the original (A = control, unchanged). All steps 3 days apart, unchanged.

**Subject test (step 1 only; follow-ups thread under it):**
- A: `quick question` (control; ask-flavored, generic-familiar)
- B: `cost reports` (topic-flavored, operational register; chosen over `costs at {{companyName}}` because long company names truncate on mobile)
- Expectation: B trades raw opens for better-qualified opens. Judge on reply quality, not open rate.

**Step 1B — tests peer relevance vs pure credibility.** Bridges the multi-location case study to the singleton's own reality (why this matters to them).

**Step 2B — tests labor-specific angle vs generic "cost drift."** Labor chosen over vendor creep (operators believe they're already checking invoices) and voids (which accuses staff). Uses {{state}} to tie the benchmark to their wage market.

**Step 3B — the strategic test: instant self-serve tool vs send-me-your-files.** B links the 90-second health check; eliminates the friction of "email me three reports and wait."

**Step 4B — (not live; control is strong enough).**

**Step 5B — tests parting value vs plain breakup.** Reminds the prospect of the tool's availability on retreat, vs a flat "good luck."

**Operational notes:**
1. **Subject test:** "quick question" (control) vs "cost reports" (B).
2. **Links:** all through `adc-ops.com/check`, which forwards to the tool with campaign UTMs baked in. Turn Instantly click-tracking OFF for this campaign (the shared tracking domain is the real deliverability risk, not your own URL).
3. **Steps 1–2:** linkless (deliverability). Links appear at steps 3 and 5 only.
4. **Singleton-specific:** send singletons the Birchwood brief (red-flag-audit-s.html), not the Ember multi dashboard, so the benchmark figures in the email match what they receive.
5. **Personalization:** 2B and 3B use {{state}} (full state names; Instantly fallback: "your state").
6. **Activation:** if volume is modest, activate 1B and 3B first (top of funnel + strategic offer test). Rotate 2B/5B in after. Don't run five variants at once on a small list.
7. **Multi campaign:** separate test design logged below.

---

## Campaign 1 Retarget — Multi-location, variant test (added 2026-06-12)

**Status:** test design of record, ready to load into Instantly.

**Diagnosis from Campaign 1:** the sequence never *named* the free health check, so it ate the cost of the offer without getting the conversion lift from risk reversal.

**Strategy:** test the fix (name the offer) with a revised sequence, keeping the core lesson from the diagnosis. Each B variant tests one lever.

**Subject test:**
- A: `quick question` (control)
- B: `store-level costs` (multi-specific, operational framing)

**Variants:**
1. **Step 1B — tests: problem-first vs tool-announcement.** Opens inside their pain (report multiplication, store drift) rather than credentialing yourself or announcing a tool.
2. **Step 2B — tests: deliver the sample unasked vs ask permission.** The diagnosed failure was asking permission twice; B just hands them the Ember dashboard with a concrete finding ($0.66/lb gap on Sysco beef, Store C).
3. **Step 3B — the strategic test: named free health check vs case-study call ask.** Names the manual free health check (diagnosis fix), describing exactly what it delivers (store-vs-store benchmarking + segment positioning). Removes call ask friction.
4. **Step 4B — (not live; control is strong enough).**
5. **Step 5B — tests: parting value vs plain breakup.** Reminds prospect of the dashboard on retreat.

**Operational notes:**
1. Subject test: same pair as singletons ("quick question" vs "cost reports"), so results read across both segments.
2. Link strategy: plain text, own domain. Disable Instantly click-tracking.
3. Step 2B: links to Ember dashboard (`red-flags-dashboard.html`). Cite the $0.66/lb Sysco gap to show the multi-specific value (store-vs-store, not single-location benchmarks).
4. Step 3B: describes the manual free health check ("send one month of reports, benchmark each location against the others and against your segment"). No link — the conversion event is the email reply.
5. Steps 1–2: linkless (deliverability). Link appears at step 2 only (the dashboard).
6. Fallback: if the manual health check in 3B yields silence after maturity, the next retarget should introduce the multi-mode health-check tool (site mode toggle: single vs multiple locations) as 3B alternative. That tool doesn't exist yet (see [#future] below).
7. Attribution: replies are the primary conversion metric; no Cal.com booking in this sequence (unlike singletons).

**[#future] Multi-mode health-check tool (spec on record for retarget trigger):** when either campaign's results suggest self-serve converts better than manual, build a mode toggle on health-check.html: "single location" → existing tool; "multiple locations" → 2–6 location input block, outputs store-vs-store comparisons (each store vs own best + vs industry range). Scope: 1 day. Trigger: rerun four-lever check on first matured Campaign 1 retarget batch, and if 3B manual offer still underperforms, activate this tool for the next multi retarget.
