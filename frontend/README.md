# What The Property + Graspia

A bilingual (English / Thai) interface for the two take-home tasks. Property data
and knowledge use Supabase. Task 1 AI matching supports Gemini, Claude and OpenAI. Gemini live smoke checks passed
on 2026-10-18; broader wording/quality review remains necessary. Graspia now uses real AI chat, durable transcripts and human handover; see [Task 2](../docs/task2-graspia.md). The contact form and lead list for Task 3 talk to an n8n workflow through the backend; see [Task 3](../automation/README.md).

## Run

```sh
npm run setup
npm run dev
```

Run these commands from the repository root (Node.js 22.18+). The launcher starts Next.js on port 3100 and the independent backend on port 4000. Configure each app using its own `.env.example`. Open http://localhost:3100.

| Page | What it is |
| --- | --- |
| `/` | Home page: photo hero, entry cards (condos, houses, ask the AI), filter search, how matching works, ways we help, featured listings, FAQ |
| `/properties` | Task 1: property browser and AI matching |
| `/graspia` | Task 2: customer chat with the Graspia sales agent |
| `/admin` | Task 2: sales inbox for human handover (access code) |
| `/contact` | Task 3: contact form that sends a lead to the n8n workflow |
| `/leads` | Task 3: lead list for the sales team, hot / warm / cold (access code) |
| `/knowledge` | Business profile used by the agent (access code, not in the navigation) |

## Available features

- Responsive property browser loading the 10 original records from Supabase through `GET /listings`.
- City, maximum price, exact bedroom count (including studio), property type, and furnished filters.
- Sorting, selecting a property, and saving favorites in browser localStorage. Only listing IDs are stored; bookmarks persist across refreshes in the same browser and origin.
- English / Thai UI switch shared across both routes, including translated sample property descriptions and sample conversations. Freeform user messages retain the language entered.
- Poppins for Latin text and Noto Sans Thai for Thai text, via `next/font`.
- Graspia live sales chat backed by Supabase, with authenticated admin takeover and human replies.
- Durable handover state: bot replies stop; customers can leave follow-up details for the human team.
- Home page with entry cards, a filter search and an AI card; filters open `/properties` with those filters applied, and the AI card opens it with the request already typed in (`?request=`; the visitor still presses Match). Featured listings come from the live listing data; photos are illustrative.
- Task 3 contact form (`/contact`): checks in the browser before sending, a honeypot field, example buttons in English or Thai, and a clear result screen (received, already received, rejected, too many, unavailable). The auto-reply shown is written by the workflow.
- Task 3 lead list (`/leads`): hot / warm / cold filters, search, property type, repeat-contact badge, the AI or rule-based reason in the viewer's language, and a details popup. Notifications and auto-replies are simulated and labelled so.

## Explicit demo boundaries

- Property matching calls `POST /match`; without an API key it reports that AI is not configured. It never substitutes fixture rankings for a failed AI request.
- Chat uses Gemini by explicit user request; the assignment originally names Claude/OpenAI. OpenAI and Claude are supported but not live-verified.
- Handover appears in the real Admin inbox; no external push notification or messaging channel is connected.
- Listings and business knowledge use Supabase; chat transcripts and volunteered lead details persist in private Supabase tables. Messaging channels are not integrated.
- Favorites are local to this browser/origin, not an account or cross-device sync. Clearing browser storage removes them. If storage is blocked or full, saving falls back to memory for the current page session. Language remains in memory and resets on refresh; chat history survives reloads while the visitor cookie is retained.
- Unsplash images are illustrative stock photos, labeled as such. Original listing data and placeholder URLs are unchanged. Images require network access and have a fallback when loading fails.
- `next/font/google` downloads fonts during compilation. Building requires access to Google Fonts.

## Structure

See [architecture and dependency rules](../docs/architecture.md) for the full
directory tree. This folder owns Next.js pages and UI; `../backend/` is an independent HTTP service and `../database/` owns SQL assets.

- `src/app/`: pages and layouts.
- `src/features/`: home, properties (Task 1), chat, sales and admin (Task 2), leads (Task 3) and knowledge UI.
- `src/shell/`, `src/ui/`, `src/styles/`: shared presentation.
- `src/api/`: browser HTTP helpers.
- `src/server/backend.ts`: server-rendered pages' HTTP client, with no DB access.
- `../packages/contracts/src/`: shared request/response and domain types.

Frontend `.env.local` contains only `BACKEND_URL` for the API connection. DB, AI,
and admin credentials belong in `../backend/.env.local`. Browser calls use the
Next.js proxy; no backend source is imported into this app.

## Supabase setup

In Supabase SQL Editor, run `../database/migrations/001-listings.sql`, then `../database/seeds/001-listings.sql`.
These reproduce the manual setup and original `../data/listings.json` fixtures.
The seed preserves existing IDs. RLS and grants allow public reads only.

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in
`backend/.env.local` (see `../backend/.env.example`). Listings need no secret/service-role key.
Restart the development server after configuration changes.

`GET /listings` returns a JSON array. Optional filters: `city` (exact name, case-insensitive),
`maxPrice` (inclusive non-negative integer), `bedrooms` (exact non-negative
integer; 0 means studio). For example:
`/listings?city=Bangkok&maxPrice=6000000&bedrooms=2`.
Invalid filters return 400; database/configuration failures return 503 without
exposing credentials. The UI shows loading/error/retry states and never silently
falls back to fixture data. UI filters operate on the fetched records locally.

With the development server running, verify source fidelity and API filters:

```sh
TEST_BASE_URL=http://localhost:3100 npm run test:listings --prefix backend
```

## Task 1 — AI matching

Configure the selected provider in `backend/.env.local`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-own-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Alternatively set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and optionally
`ANTHROPIC_MODEL` (default `claude-haiku-4-5`). Restart the backend after changing
configuration. If `AI_PROVIDER` is omitted, a configured Gemini key selects
Gemini; otherwise Anthropic is selected. Invalid provider values fail closed.
There is no automatic fallback or retry with another provider's credentials.
Reviewers supply their own keys; none are committed. Never use `NEXT_PUBLIC_`
for AI keys. Free-tier model availability and project quotas can change; check
[Google's pricing](https://ai.google.dev/gemini-api/docs/pricing) and AI Studio.
Do not enable billing if you intend to stay on the free tier.

`POST /match` accepts JSON `{ "request": "A condo near BTS under 6 million baht",
"locale": "en" }`. `request` must contain 1–1000 trimmed characters; `locale` is
optional (`en` or `th`). Without locale, Thai characters select Thai output. The browser omits locale
so AI answers follow the query language rather than the UI language.
Tab badges count results under the current filters; Explore uses the AI result
count while an AI search is active.
The response is `{ matches: [{ property, reason, alternative }], summary, clarification, cached, cacheStatus }`.
Properties contain original DB fields. The selected AI provider proposes IDs,
reasons and ordering; the backend then compares all eligible records by verified
mismatch count, retaining model order for ties. Server-added records receive
record-based reasons, and unsafe rail explanations are replaced with record facts.
The text search searches the whole catalog and resets sidebar filters explicitly.
Changing filters, text, sorting or tabs cancels the current search and clears its result.

The server reads the current DB catalog, calls the selected provider with a shared prompt and JSON
schema, validates IDs/uniqueness/output lengths, and checks selected listings
against the model-extracted city/budget/exact or minimum/maximum bedrooms/type/furniture/transit constraints, including a requested BTS or MRT network.
Card property fields always come from the database; free-text reasons are not
fully fact-checked. Ordinary property requests are instructed to return three
ranked records (or the entire catalog if fewer than three exist). If the model
returns fewer, the server fills the remaining places from the eligible catalog and
labels them as alternatives with their unmet criteria.
An explicit budget prohibition such as `ห้ามเกินงบ` or `do not show anything over
budget` sets `strict_budget`: only listings within the stated ceiling are eligible,
and the response contains min(3, number of budget-eligible listings), including
zero if none qualify. Task 1 asks for the top three but does not specify behavior
when an explicit budget prohibition leaves fewer than three eligible records.
We choose to honor that prohibition instead of adding excluded listings merely
to fill three places. This is a documented design decision for that edge case,
not an exception explicitly authorized by the assignment. An ordinary
maximum budget alone still permits clearly disclosed over-budget alternatives.
For zero strict-budget results, the UI invites a new full search with a revised
budget; it never silently increases the ceiling.
User-run browser checks confirmed strict-budget counts of zero (THB 1 million),
one (THB 2 million), two (THB 2.5 million), and three in-budget type-mismatch
alternatives for a house request under THB 5 million. These are observed cases,
not guarantees for every request or a full live-suite rerun.
See [budget examples and validation limits](../backend/README.md#explicit-budget-prohibitions).
Exact matches precede alternatives. For Bangkok + 2-bedroom condo + BTS + under
6M, P001 is the exact match; the other two are explicitly presented as alternatives.
The server adds unmet city, budget, bedroom, type, furniture and transit-availability facts
to alternative reasons, independently of the model's prose. The server also flags the wrong BTS/MRT network and violations of explicit bedroom bounds. The backend checks explicit maximum listed rail distances since v19; extracting the requested distance and other subtler preferences still depends on model reasoning.
Vague requests prioritize lower catalog prices without inventing a budget, state assumptions and ask one short follow-up covering at most two missing preferences. The UI directs users to add those details to the original search; it does not retain conversational context. If no listing meets all
requirements, ordinary searches still offer three alternatives with their limitations;
strict-budget searches remain restricted to the eligible records described above;
unrelated/injection-only requests may return none. The API includes an
`alternative` boolean based on the validated extracted constraints. Constraint
extraction and subtler preferences still depend on the model.
The model is instructed to treat user/catalog instructions as untrusted, remain
on property matching, and avoid unsupported facts. Constraint extraction and
free-text explanations remain model-dependent and require live evaluation.

Errors: 400 invalid JSON/input, 413 body over 8 KiB, 415 non-JSON content type,
429 throttled, 502 invalid/refused/truncated model output, 503 missing credentials
or unavailable DB/provider, 504 model timeout (45 seconds). The client keeps the
request for retry and shows ordinary listings as ordinary listings on failure.
Provider error bodies and credentials are never returned to the browser.

Cache: LRU eviction with a fixed five-minute TTL and up to 100 results in server memory by default, keyed by the trimmed,
NFC-normalized request, output language, current catalog, provider, model, and prompt
version. Catalog order is canonicalized by listing ID. Identical in-flight requests share a call; failures are not cached.
`cacheStatus` distinguishes `hit`, `miss`, `coalesced` and `bypass`; `cached` remains compatible.
See [backend cache configuration and telemetry](../backend/README.md#matching-cache-and-observability) for configuration, counters and validation.
Catalog changes invalidate old results. Restart/deployment clears the cache;
instances do not share it. A per-process guard limits new model calls to 20/minute
and three concurrent calls. This is a demo cost guard, not distributed abuse
protection. Add a shared limiter/cache and provider spending limits before a
public deployment. There are no automatic paid retries.

Run offline checks from the repository root (no network, no credentials, no AI charges):

```sh
npm test --prefix backend
```

After configuring a key and available quota, opt into live smoke checks (consumes
provider quota and may cost money on a billed project):

```sh
TEST_BASE_URL=http://localhost:3100 npm run test:matching:live --prefix backend -- --live
```

The live script checks English/Thai matching, a repeated query/cache hit, vague
preferences, impossible requirements with disclosed alternatives, an injection
attempt, unfurnished alternative selection, and strict-budget house alternatives.
Read the reasons manually too; offline tests do not establish real model quality.
Historical Gemini smoke tests and targeted calls predate the latest prompt.
User-run browser checks of v18 have since confirmed the English multi-constraint
and vague-request cases. The complete automated live suite has not been rerun on
v18. See [current evidence and remaining work](../backend/README.md#current-task-1-validation-and-remaining-work)
for the distinction between automated checks, manual observations and unverified work.

The backend compares all price-eligible records by structured mismatch count;
AI order breaks ties, followed by catalog order for records the model did not
select. It can replace an omitted better candidate but does not guarantee the
best ranking for arbitrary unstructured preferences. Earlier responses failed
city-evidence validation; invalid output still fails closed with diagnostic labels
and without logging raw responses or credentials. The rail guard is not a
complete fact-checker for every sentence. v19 rejects empty property_search responses when eligible records exist.
Non-property empty responses require explicit intent, neutral constraints and
a clarification; model intent classification itself is not independently proven. Only strict budget has a hard-exclusion rule.

Gemini is the current choice to work within the free-tier budget. Task 1 explicitly
asks for Claude or OpenAI; having their adapters available does not establish
live compliance with that provider requirement.

`next.config.ts` sets the Turbopack root to the repository directory so both pages can import the supplied `data` folder without duplicating the source records.

## Validation

```sh
npm run check
npm run build
```

From the repository root, `check` runs both apps’ TypeScript checks, frontend lint, backend HTTP/auth and offline matching tests, the offline Task 3 workflow tests, and import-boundary tests.

Browser tests (Chrome, running app; AI and lead APIs are mocked) live in `tests/browser/`: `sort-matches` (Task 1), `chat`, `chat-sidebar`, `chat-delete` (Task 2), `leads` (Task 3), `heading-actions` and `home-page` (layout). The main README lists how to run each one.
It does not contact AI providers. Read-only integrations are available as
`npm run test:listings` and `npm run test:business`. The live matching check
requires `npm run test:matching:live --prefix backend -- --live` and consumes provider quota (potentially paid).

## Admin workspace

### Business knowledge database

After the listings setup, run `../database/migrations/002-business-profile.sql` in Supabase
SQL Editor. It creates a private `business_profiles` table and seeds the complete
original SunPro Solar JSON profile under `sunpro-solar`, preserving existing rows
when rerun. Keep the source JSON for reproducibility.

Add `SUPABASE_SECRET_KEY` to `backend/.env.local` using the Supabase secret key. This is
server-only: never use a `NEXT_PUBLIC_` prefix or put this key in client code.
The database denies table access to `anon` and `authenticated`; the server reads
using `service_role`. The `/knowledge` page checks the shared workspace session
before reading and passing the profile to the UI. The business ID is controlled
by the server. This is a single-business demo, not multi-tenant authorization.

Knowledge now reads Supabase rather than importing the profile JSON at runtime.
Missing configuration, missing rows, malformed profiles, and connection errors
display a retry state rather than silently falling back to the source fixture.
Chat/Admin now uses the live backend and persistent Supabase storage. See [Task 2](../docs/task2-graspia.md).

### Conversation persistence

Task 2 uses private Supabase storage. Apply migrations 003, 004 and 005 before using
chat. See [storage and ownership details](../docs/task2-graspia.md).

After SQL and environment setup, verify the stored fixture and public denial:

```sh
npm run test:business --prefix backend
```

Visit `/admin` or use its navigation tab. The optional `/knowledge` page is retained for direct access, but its navigation tab and Admin link are removed to keep the take-home UI focused on the required tasks. Both pages share the same access code and session; direct Knowledge base login returns to that page. Set `ADMIN_ACCESS_CODE` (exactly 8 characters) and `ADMIN_SESSION_SECRET` (at least 32 characters) in `backend/.env.local`; see `../backend/.env.example`. Restart the server after changing these values. Configure the same variables in your hosting environment for deployment.

The access code is checked by the backend login API through the same-origin Next.js proxy. Access uses a signed HttpOnly session cookie with an eight-hour server-side expiry; Lock workspace on either page clears it for both routes. This is a shared-code demo gate, not a production multi-user authentication system.

The inbox loads saved conversations from the backend. Review handover summaries, take over, send human replies and close conversations. Changes persist across reloads. Closed conversations cannot be reopened into bot mode. See [Task 2 behavior and API](../docs/task2-graspia.md).

## Switching AI providers

Task 1 (`AI_PROVIDER`) and Task 2 (`CHAT_AI_PROVIDER`) each choose `gemini`, `openai` or `anthropic` in
`backend/.env.local`, with that provider's key and optionally a model; restart the backend afterwards. The full table,
defaults, an example and the n8n steps for Task 3 are in [backend/README.md](../backend/README.md#switching-ai-providers).
The OpenAI and Claude adapters are covered by offline tests and have not been run against the live APIs.

Furniture requirements use a nullable boolean extracted by the model: `true`
requires furnished listings, `false` requires unfurnished listings, and `null`
means unspecified or either is acceptable. The backend compares this with the
stored `furnished` value and includes mismatches in notices, alternative flags,
exact-first ordering of returned listings, and summary counts. Natural-language
extraction still depends on the model; v18 also compares candidates across the catalog. Furniture
alone does not establish renovation or move-in readiness. Offline checks cover
both requirements, no preference, invalid values, and a strict-budget combination
in English and Thai. Targeted live/browser checks of all three furniture preferences
passed as described in the validation history above; this does not guarantee every
future model response or substitute for the full live suite.

## Strict-budget count clarification (v17)

Previous prompt: `property-match-v17-budget-eligible-count`. Count eligibility by
price only, then rank within that set using the remaining preferences. A house
request under THB 5 million with an explicit budget prohibition can return three
in-budget condos as disclosed type-mismatch alternatives when no house is in
budget. It must not return an over-budget house or zero solely because the type
does not match. This does not introduce a separate hard property-type exclusion.

A targeted real Gemini call passed this case with P002, P004 and P007, all within
budget and flagged as alternatives. Offline regression checks cover the type
mismatch, incorrect result counts, and the existing zero/one/two eligible-record
cases. The full live suite has not been rerun on v17. For count failures, backend
logs now include `expectedCount` and `actualCount`, without raw model output.
Earlier v16 results above remain historical, not a claim of full v17 coverage.


## Catalog comparison and rail grounding (v18)

Historical v18 prompt: `property-match-v18-grounded-rail-catalog-ranking`.
The current prompt is `property-match-v20-country-city`.
The model still interprets the request and proposes ranked IDs and explanations.
After validating those IDs and counts, the backend compares every price-eligible
record by the number of unmet structured constraints. Fewer mismatches win;
model order is retained for ties, followed by catalog order for unselected records.
Server-added candidates receive factual explanations from their own database
record. This is not a fallback for provider failures or malformed responses.
Strict-budget eligibility and the zero/one/two-result exception are unchanged.
This comparison covers the existing city, price, type, bedrooms, furniture and
rail/network checks (v18); v19 additionally checks an explicit maximum listed rail distance. Arbitrary amenities remain model-interpreted.

A conservative rail guard checks model prose against the selected record's
station/network and stated distance. Missing rail data, a different station or
network, or an inconsistent distance causes the whole reason to be replaced by
that record's factual description. Missing data is described as unlisted rail
information, not absence of service. This replacement deliberately drops unsafe
free-form prose; it may also omit an unstructured-preference explanation from
that prose. This is a targeted rail guard, not a general factual verifier of every
possible natural-language claim. Valid model reasons remain intact.
English notices and summaries now handle singular bedroom/match/alternative.

Offline regressions reproduce the Chiang Mai/Asok fact leakage, incorrect rail
network and distance, catalog-wide alternative replacement, AI tie ordering,
and strict-budget counts 0–3. Root `npm run check` passed after this change.
User-run browser checks of v18 now cover English multi-constraint and vague
requests, including the corrected Chiang Mai reason. The full automated live
suite has not been rerun. See the [current validation record](../backend/README.md#current-task-1-validation-and-remaining-work).

The user subsequently ran the root `npm run build` successfully after the cache
changes: backend TypeScript compilation and frontend Next.js production build
both completed. Screenshots also confirmed the backend running its compiled
`dist` entry point and frontend running `next start --port 3100`. Earlier sandbox
font-fetch and worker-port errors are superseded by this successful local build.
Production matching and repeated-request cache checks passed in the Gemini
workflow; this is a local production smoke test, not a hosted deployment test.


## Visible matching status

AI result cards and the selected property's detail panel display a bilingual
status badge from the API's `alternative` flag: “Recommended” / “รายการแนะนำ”
or “Alternative · unmet criteria” / “ตัวเลือกใกล้เคียง · มีข้อไม่ตรง”. Labels
use both text and color. Ordinary listings and responses without a status flag
show no badge. “Recommended” does not claim every possible preference was
verified, and also works for vague requests. Detailed mismatch reasons remain
available below the card and in the explanation dialog.


User screenshots confirmed the badges on result cards and the selected detail
panel. Badges use borderless green/amber backgrounds and text, with dark-mode
colors. The sale-status dot uses the same green as the header preview indicator.
Secondary text in Light and Rainbow now uses a darker palette; frontend checks
passed and the generated stylesheet was checked. This is not a full visual
accessibility audit across every screen and viewport.

## Task 1 remaining work

- Use and live-test either Claude or OpenAI to satisfy the named-provider requirement;
  this remains deferred in the current Gemini workflow.

Root production build and local production matching/cache smoke checks have
passed. The listings integration suite also passed through the running production
frontend proxy, including combined filters and source-data fidelity. See the
backend validation record for exact scope and observed timings.

The matching status badges are implemented, and strict-budget behavior remains
intentional and documented. A full automated live-suite rerun on the final
provider is still outstanding; recent user browser checks cover specific cases.
See the [backend validation record](../backend/README.md#current-task-1-validation-and-remaining-work)
for current evidence and known matching limitations. No application behavior was
changed during this documentation update.


## v19: rail-distance limits and request intent

The provider schema now requires `intent` (`property_search` or `non_property`)
and `constraints.max_transit_distance_m` (inclusive integer metres or null).
The prompt converts kilometre limits to metres and does not infer a numeric
limit from "near BTS", floor area, or distance to non-rail amenities.
The server compares the extracted limit with each listing's rail distance,
including m/km conversion, when ranking the full eligible catalog. Over-limit
or unknown distances are disclosed in Thai/English reasons and included in
summary counts. Network and distance remain separate requirements. Distances
come from listing data, not verified walking routes.

Property searches, including vague housing requests, must return exactly
min(3, eligible records). An unexpected empty response returns
INVALID_AI_RESPONSE (502), is not cached and is not automatically retried.
Explicit non-property requests require empty matches, neutral constraints and a
clarification. Strict-budget zero/one/two-result behavior is unchanged. Model
intent/constraint extraction can still be wrong; these guards enforce the
classified output contract rather than independently understanding all prose.

The prompt version was bumped, invalidating older cached rankings. These changes
have offline regression coverage; the earlier production/browser evidence above
is for v18 plus the cache improvements, not a live validation of v19. Rebuild
and restart the compiled backend before testing v19 in production mode.

## Sorting AI results

Price sorting now reorders only the displayed AI result set without clearing its
summary, reasons, status badges or selected property. Featured restores the
original match order; sorting works on a copy and makes no new AI request.
Ordinary listing and Saved sorting retain their existing behavior.

Validation: frontend typecheck, lint and boundary checks passed. Headless Chrome
checks with mocked listings/match responses passed against both a temporary dev
server and the rebuilt local production frontend. The user also confirmed all
three sort options with real AI results. These checks cover result preservation,
not the quality of the AI ranking.

The regression is now stored at `tests/browser/sort-matches.mjs`. Start the frontend
(dev or production), then run from the repository root:

```sh
npm run test:browser --prefix frontend
```

The default URL is `http://localhost:3100`, and the default browser is installed
Google Chrome. Override `TEST_BASE_URL` or `PLAYWRIGHT_CHANNEL` as needed. To use
Playwright Chromium instead, run `npx playwright install chromium` from `frontend`
and set `PLAYWRIGHT_CHANNEL=chromium`. Dependencies are installed by `npm run setup`.
The test mocks listings and matching; it needs no backend credentials and makes
no AI calls. It checks ascending/descending/Featured order, retained cards,
per-property reasons/status, summary, selection, and one total match request.
It remains separate from the offline `npm run check` because it requires a running
frontend and a browser.

## Latest Task 1 evidence (v20)

Root `npm run check` passed on 2026-10-20, including 21 backend unit tests plus
standalone matching checks, frontend typecheck/lint and import boundaries.
The listings integration passed through localhost:3100, checking original data,
combined filters, studio, empty results and invalid inputs. User screenshots for
Thailand strict-budget searches confirmed 0/1/2 results at THB 1/2/2.5 million,
without the earlier country/city mismatch. Explicit rail-distance and non-property
cases have the v19 manual evidence recorded in the backend README.
The full automated live suite has not been rerun on v20. The named-provider
requirement remains deferred; the existing Gemini observations do not satisfy it.
