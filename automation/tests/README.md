# Task 3 tests

Run these from the repository root. All of them use synthetic names and phone numbers; the ones that write to the database delete what they create, even when a check fails.

| Command | Needs | What it checks |
| --- | --- | --- |
| `npm run test:automation` (also part of `npm run check`) | Nothing: offline | [workflow-structure.test.mjs](workflow-structure.test.mjs) checks the workflow file against the brief: which path each kind of lead takes, retry and time-limit settings, every path ending in an answer, no secrets in the file, and the guide's required sections. [workflow-nodes.test.mjs](workflow-nodes.test.mjs) runs every Code step with sample data: spam, fake and empty entries, phone, email and budget formats, duplicate fingerprints, the processing lease, the AI request, untrusted AI answers, the fallback rules, the replies in both languages, and the contact form's example buttons in English and Thai. |
| `npm run check --prefix backend` (also part of `npm run check`) | Nothing: offline | [backend/tests/unit/leads.test.ts](../../backend/tests/unit/leads.test.ts): the website's `/leads` endpoints (shape and size limits, honeypot passed on, admin-only list, rate limit, wrong origin), what is forwarded to n8n and relayed back, and how a database row becomes a lead card. |
| `npm run test:automation:db` | Supabase keys in `backend/.env.local` | [database.test.mjs](database.test.mjs): the database functions (migrations 006–009): new lead, resend, processing lease, repeat contact by phone or email, a repeat that cannot change the customer's details, rate limit, invalid input, saving the category with both reasons, notification retries, and that the public key cannot read leads. |
| `npm run test:automation:ai` | `GEMINI_API_KEY` | [ai-scoring-live.mjs](ai-scoring-live.mjs): nine sample leads sent straight to Gemini with the exact prompt in `workflow.json`. Use it after changing the prompt and before publishing it in n8n. A sample of model behaviour, not a guarantee. |
| `npm run test:automation:live` | Published n8n workflow, `N8N_LEAD_WEBHOOK_URL`, `N8N_LEAD_WEBHOOK_SECRET`, Supabase keys | [webhook-live.test.mjs](webhook-live.test.mjs): the whole flow through n8n Cloud, Gemini and Supabase. About 10 AI calls. |
| `node --env-file=backend/.env.local frontend/tests/browser/leads.mjs` | Running app, Chrome | [leads.mjs](../../frontend/tests/browser/leads.mjs): the contact form (including the example buttons following the site language) and the lead list in a real browser with mocked answers (nothing reaches n8n or the database). |

The live webhook test needs the published workflow to match `workflow.json`: after editing the file, paste the changed steps into n8n and publish first.

## Brief requirement → test

| Brief | Proved by |
| --- | --- |
| **1. Receive** the lead by webhook (name, phone, email, message, budget, area) | Structure test 1 (POST webhook reads all six fields); backend unit tests (all six fields kept, size limits); live test (every case posts to the real webhook) |
| **2. Validate**: reject spam, empty and fake entries | Structure test 2 (invalid leads go to "rejected", never to the save step); node tests 1, 12, 13 (16 spam/fake/empty cases, contact rules, name and length rules); database test 7 (the database also refuses invalid input); live test 12 (8 bad posts → 400, nothing stored); browser test 2 (too short, no contact) |
| **3. Save** to a store | Structure test 3 (save in Supabase, "try again" if it fails); database tests 1, 9; live test 1 (row exists after the post) |
| **4. AI classifies hot / warm / cold** from message and budget | Structure test 4; node tests 5–9, 15 (prompt and rules sent, AI answer used, untrusted answers rejected, fallback rules); AI scoring test (9 samples incl. "next year", rent, low budget, prompt injection); live tests 1–6 |
| **5. Hot → notify the team; warm / cold → no urgent notify** | Structure test 5 (only the hot branch reaches the alert); node test 14 (alert content); live tests 1 (hot: alert logged) and 2–4 (warm, cold: no alert) |
| **6. Auto-reply** to the lead | Structure test 6 (hot, warm and cold all pass the auto-reply); node tests 10, 14 (Thai and English wording); live tests 1, 5 (reply logged and returned); browser test 3 (reply shown to the customer) |
| **Handles bad or spam input** | Same as 2, plus backend unit tests (wrong shape, wrong origin, honeypot) |
| **AI scoring is sensible** | AI scoring test; live tests 2–6; the scoring rules and the changes made after testing are in [automation/README.md](../README.md#how-the-ai-scores-a-lead) |
| **Failures** | Structure tests 3, 4, 8 (retries, time limits, "try again", AI failure continues); node test 8 (AI down, unsure or cut off → rules); backend unit tests (n8n down or odd answer → "unavailable"); database test 3 (a stopped run is finished later); browser test 5 (customer keeps what they typed) |
| **Duplicates** | Node tests 3, 4 (fingerprint, lease); database tests 2, 3; live tests 7 (exact resend) and 10 (three identical posts at once → handled once) |
| **Bonus: same phone / email = one lead** | Database tests 4, 5 (+66 format, upper-case email); live test 8 |
| **Bonus: rate limit** | Database test 6; live test 9 (4th message in 10 minutes → 429); backend unit test (30 posts a minute per server) |
| **Deliverables**: `workflow.json`, explanation, README a non-developer can follow | Structure tests 10 (file safe to publish) and 11 (guide covers why n8n, each step, scoring, retries, failures, duplicates, setup, tests) |
