# Task 2 — Graspia sales agent

The `/graspia` route now uses real backend conversations. `/admin` is an authenticated
sales inbox with takeover, human reply and close actions. Existing Task 1 routes
and matching configuration are unchanged.

## Scope and assignment deviation

The original task asks for Claude or OpenAI. **The user explicitly selected Gemini
for now.** Gemini is the current default and was live-tested. An independent
OpenAI Responses adapter is included, but has not been live-tested; do not claim
full compliance with the assignment's named-provider requirement until it is
configured and verified. No silent provider fallback occurs.

Chat conversations, messages, pins and handover metadata now use private Supabase
PostgreSQL tables. Apply `database/migrations/004-chat-runtime.sql` after migration
003, then `005-chat-read-receipts.sql`, before starting chat. Business knowledge uses the private `business_profiles`
record. Missing database setup returns an error; there is no SQLite fallback.

## Run

Node.js **22.18 or later** is required: it runs built-in `node:sqlite` without a flag and loads TypeScript files directly in the tests.
Some supported Node releases print an experimental SQLite warning.

Configure `backend/.env.local` (never commit it):

```dotenv
CHAT_AI_PROVIDER=gemini
GEMINI_API_KEY=your-own-key
# Optional CHAT_MODEL overrides GEMINI_MODEL for chat only.
# Existing SUPABASE_URL, SUPABASE_SECRET_KEY and admin settings are also needed.
```

For OpenAI, set `CHAT_AI_PROVIDER=openai` and `OPENAI_API_KEY` (default model `gpt-4.1-mini`); for Claude,
`CHAT_AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (default model `claude-haiku-4-5`). `CHAT_MODEL` takes
precedence over the provider's model variable. Task 1's `AI_PROVIDER` is independent; see
[Switching AI providers](../backend/README.md#switching-ai-providers). Restart the backend after editing environment files.

From the repository root: `npm run setup`, then `npm run dev`.
Open `/graspia`, start a conversation, and send a question. Use another tab at
`/admin` to sign in, review a handover, take over, reply, and close it.
The browser polls every four seconds while visible; no external notification,
LINE/WhatsApp, calendar booking, or payment operation is performed.

## Behavior

- The trusted SunPro profile is supplied separately from untrusted customer turns.
  Answers must stay within its products, service area, payment and warranty terms.
- The model classifies human requests, anger, missing knowledge, buying/booking
  commitment, uncertainty, and unresolved loops using the full saved bot context.
  Asking about prices or payment options alone must not trigger a close.
- Handover responses contain `handover: true`, `reason`, `summary`, and
  `status: awaiting_human`. No model-generated sales reply is emitted on that turn.
  The server adds a fixed system notice, so the user knows the bot has stopped.
- Handover briefs start with key details copied from customer messages: packages or
  system sizes they named (e.g. "Home Plus 5kW", "20kW"), email addresses, Thai phone
  numbers and the number of customer messages. Assistant text is never mined.
- Handover briefs group customer-provided details, product/need excerpts and recent
  requests under readable labels in Thai or English. Contact-bearing turns are
  preserved up to the 2,000-character input limit; other excerpts are explicitly
  marked when shortened. Up to three earlier customer turns that match neither
  group (for example a repeated question before a loop handover) are listed
  separately so context is not lost. These are attributed quotations, not inferred facts.
  Admin displays the persisted brief and full transcript. The brief is rebuilt
  (without an AI call) each time the customer sends a message after handover, so a phone
  number or email sent later appears in its key details; the handover reason stays the one
  recorded at handover, and the full transcript remains below.
- Contact details volunteered by customers are saved as part of their messages.
  Handover never waits for a contact form. Customers may leave follow-up messages
  while waiting; these are saved without invoking AI.
- Confidence below 0.65 triggers `uncertain`; it is a model self-assessment, not
  a calibrated probability. **Why 0.65:** a wrong price, saving or warranty told to a customer costs more than an
  early handover, so the bar is well above a coin flip (0.5). It is not higher because the brief also checks that
  handover is not too early: in live tests normal product questions scored 0.95–1, so 0.65 leaves room for ordinary
  answers while catching answers the model itself doubts. The value was set by judgment on those tests, not tuned on a
  labelled dataset. Confidence is one signal among several: the fact checks, the handover reasons and the loop checks
  hand over on their own whatever the score. The value lives in `backend/src/chat/handover-threshold.ts` and is shown
  to the model in its instructions. `/admin` shows the latest AI answer's confidence in the
  handover brief, highlighted when below 0.65 (admin only; customers never see it).
  A reply that repeats one of the last two assistant replies (character-pair similarity
  ≥ 0.7 and no new numbers) is not sent; the conversation is handed over as
  `conversation_loop` (`backend/src/chat/repeated-reply.ts`).
  After 30 user turns the bot hands over rather than
  truncating away context. A conversation accepts at most 200 messages.
- A provider HTTP 503 ("model overloaded") is retried twice (after 1 s and 3 s)
  within the turn's time budget. Quota (429), auth and other errors are not retried.
  Each provider failure logs one `[chat]` warning with provider, model, HTTP status
  and attempt count only, never keys, prompts or customer text.
- Provider/profile errors or invalid structured outputs safely queue
  `service_unavailable`, keeping the user turn. This technical reason is distinct
  from a genuine unknown-product answer. A configuration problem therefore does
  not look like a successful AI answer.
- Admin lifecycle: `awaiting_human → human_active → closed`. Closed conversations
  are read-only; AI never resumes on them. A fresh conversation is explicit.

## Persistence, privacy and concurrency

Runtime storage is Supabase: `conversations`, `messages` and `chat_requests`.
Only the backend service role may access the chat RPC; browser roles are denied.
Revision-checked PostgreSQL transactions persist each customer turn **before**
calling AI. A 60-second
lease prevents concurrent turns; late replies cannot overwrite an admin/handover
state. A crashed/expired turn is moved to human review when next read or written.
Model requests time out at 35 seconds; profile reads at 10 seconds. The database
transaction is never held open across these network calls.

Each send/admin action has a UUID `requestId`; retries do not append another turn
or make another model call. Reusing an ID with different content returns 409.
A retry while the original request is in flight returns the saved conversation;
polling receives the eventual response. Concurrent new sends return 409.

A random HttpOnly, SameSite=Strict visitor cookie identifies the visitor. Only its
SHA-256 hash is stored. All customer reads/writes enforce ownership; another
visitor receives 404 even with a valid conversation ID. Admin access requires the
existing signed admin session. In production cookies are Secure. JSON origin/size
checks are enforced by the existing HTTP layer; content is rendered as text,
never as HTML. Client input cannot supply message roles, business IDs, or status.

### Limits and why

| Limit | Value | Why |
| --- | --- | --- |
| Customer turns before handover | 30 messages from the customer | A chat that long is not converging on an answer or a booking, so a person is the better next step. Every turn sends the whole conversation to the AI; handing over keeps each call within a predictable size and cost without cutting old messages, which would drop details the customer already gave. Handover reason: `conversation_loop`. |
| Messages per conversation | 200 (`MESSAGE_LIMIT`) | A hard storage cap. After handover the customer and staff can keep writing, so it is higher than the turn limit; it stops one conversation growing without bound. |
| Conversations per visitor | 30 (`CONVERSATION_LIMIT`) | Visitors are anonymous (a signed browser cookie, no account), so this caps how many conversations one browser can create. The customer's list shows the newest 30, so nothing is hidden; to start another, the customer deletes an older one, as the on-screen message says. |
| Conversations in `/admin` | Newest 100 | No pagination yet; older conversations stay in the database. |
| New conversations | 30 a minute in total, 5 per visitor, 10 per client address | Stops scripted creation of empty conversations. |
| Chat writes (messages and actions) | 120 a minute in total, 20 per visitor, 30 per client address; staff share one bucket of 20 | Each customer message can trigger an AI call, which costs money and quota. The per-address limit stops one client using many cookies to get around the per-visitor limit. |
| Session requests | 60 a minute in total, 10 per client address | Stops mass creation of visitor cookies. |
| AI calls in progress | 3 at once | Protects provider quota. A turn that cannot start is saved and handed to a person (`service_unavailable`), never lost. |

Going over a per-minute limit returns 429; the customer can try again a minute later. These limits live in the server's
memory, so they reset on restart and count per server; several servers would need a shared store (for example Redis).
Production pagination, retention/deletion tooling and distributed quotas are follow-up work.

**Changing a limit.** Each value is a single number in the code, chosen for this demo; none is a technical maximum.

- Customer turns before handover (30): `backend/src/chat/supabase-chat.repository.ts` (the app) and
  `backend/src/chat/chat.repository.ts` (offline tests). No database change.
- Messages per conversation (200): the same two files (`MESSAGE_LIMIT`).
- Conversations per visitor (30): enforced by the database function `graspia_chat_store`, so a new numbered migration that
  replaces the function from `database/migrations/005-chat-read-receipts.sql` with the new number, run in Supabase; also
  update `chat.repository.ts` for the offline tests.
- Per-minute limits: the `limit(...)` calls in `backend/src/chat/chat.handler.ts`. AI calls at once: `chat.service.ts`.

Restart the backend and run `npm run check` afterwards; raising the turn limit also makes each AI call larger and costlier. Clearing cookies loses customer access to earlier chats;
the admin retains them. This is a single-business take-home app, not a full identity system.

Use Supabase backups and define a retention policy before collecting real customer
data. Distributed rate limits remain follow-up work for multiple backend hosts.

SQLite is used only by the offline unit tests; the app stores every conversation in Supabase.

## API

Browser requests use `/api` before these backend paths. All writes use JSON.

| Endpoint | Access / behavior |
| --- | --- |
| POST `/chat/session` | Creates/renews visitor cookie; `{}` |
| GET `/chat/conversations` | Own conversation summaries |
| POST `/chat/conversations` | Create own conversation; `{}` |
| GET `/chat/conversations/:id` | Own transcript and handover state |
| POST `/chat/conversations/:id/messages` | `{ "requestId": "UUID", "message": "text" }` |
| POST `/chat/conversations/:id/handover` | `{ "requestId": "UUID" }`; explicit human request, no AI call |
| GET `/chat/admin/conversations` | Admin-only summaries |
| GET `/chat/admin/conversations/:id` | Admin-only transcript |
| POST `/chat/admin/conversations/:id/takeover` | Admin-only; `{ "requestId": "UUID" }` |
| POST `/chat/admin/conversations/:id/reply` | Admin-only; `{ "requestId": "UUID", "message": "text" }` |
| POST `/chat/admin/conversations/:id/close` | Admin-only; `{ "requestId": "UUID" }` |

Messages are 1–2,000 characters. Error responses contain safe codes only.
Successful mutations return the saved conversation, including `messages`,
`handover`, `reason`, `summary`, `confidence`, and `status`. Owner hashes and
internal leases are never returned. All responses are `Cache-Control: no-store`.

## Verification

```sh
npm run check
npm run build
npm run test:listings
npm run test:business
# Chrome installed; dev server running. Mock chat API, real SSR admin gate:
node --env-file=backend/.env.local frontend/tests/browser/chat.mjs
# Real provider calls, opt-in, consume quota. In-memory test database only:
cd backend
CHAT_LIVE_TEST=1 node --env-file=.env.local --import tsx tests/integration/check-chat-live.mjs
```

Offline tests exercise ownership, idempotency, persistence across reopen, every
handover state, in-flight cancellation, expired leases, bad model output, outages,
low confidence, admin lifecycle, cookie settings, invalid requests and quotas.
Browser tests exercise errors with preserved drafts, retry, handover/reload,
desktop/mobile layout, and admin takeover/reply/close. Browser chat replies are
fixtures and are not evidence of model quality.

The six recorded real Gemini scenarios and full wording are in
[live conversations](task2-live-conversations.md). These are sampled evaluations,
not proof against all prompt injections or hallucinations. Structured schema
validation prevents malformed output; semantic grounding still relies on the
prompt, model and evaluation. The agent has no execution tools or access to
secrets, and all state/authorization decisions are enforced separately on the server.

References: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Node SQLite](https://nodejs.org/api/sqlite.html).

### Recorded validation on 2026-10-25

- Root check passed (backend unit checks, TypeScript, ESLint, architectural boundaries).
- Production backend/frontend build passed; used `NEXT_DIST_DIR=.next-task2-build` to avoid disrupting the dev server.
- Supabase listings integration passed; business profile equals the supplied source and public access is denied.
- Six live Gemini scenarios passed, using seven model calls; recorded above. OpenAI was not live-tested.
- Desktop/mobile browser checks passed with a mocked chat API and real SSR admin authorization.

### User history deletion
Users can permanently delete their selected conversation after confirmation. The owner-scoped `POST /chat/conversations/:id/delete` removes the conversation and its request records in one transaction, including the sales inbox copy. Pending model responses cannot recreate deleted conversations. This does not claim erasure of provider logs or external backups.

### Verification after Supabase migration — 2026-10-26

- Backend: 38 unit tests passed, plus matching checks; frontend TypeScript, ESLint
  and server/client boundary checks passed.
- 2026-11-14: 41 live scenarios through the running app's HTTP API (Gemini +
  Supabase), covering every Task 2 requirement and profile rule: product answers in
  Thai/English, not-too-early handover for price/payment/interest questions, each
  handover reason, booking and payment commitments, after-handover messages,
  admin takeover/reply/close, ownership isolation, duplicate request IDs, jailbreaks
  (prompt leak, fake manager/system prices, role-play, false memory, forged payment),
  tax/legal, service area, competitor, off-topic, and language switching. All reached
  the expected outcome; an admin check confirmed every conversation was logged with
  its handover flag, reason and brief. Transient Gemini HTTP 503 responses were
  retried in a fresh conversation by the test driver.
- 2026-11-15, after adding provider 503 retries, key details in the brief and the
  "ครับ" rule: the same suite gave 38/41 expected outcomes. Two scenarios failed
  every attempt with fast non-503 provider errors (the status was not logged at the
  time; provider failures are now logged), and one loop scenario escalated as
  `uncertain` instead of `conversation_loop`. All three passed when rerun over
  HTTP, and B7/B8/E9 passed 2/2 again through ChatService. All 19 Thai replies used "ครับ".
  Afterwards the recorded synthetic test chats were deleted through the app's own
  delete RPC, except the five used as README examples.
- 2026-11-15, later: 12 more live edge scenarios (mild or negated frustration,
  anger plus a human request, jailbreak plus a genuine human request, purchase with an
  unsupported brand, a fake "50% policy" followed by a price question, instructions
  hidden in contact text, two-turn role-play, and a 7-turn cooperative lead). The
  long lead first escalated as `uncertain` after a partial answer; the prompt now
  treats partial answers as progress, and all 12 then passed. Two further full runs
  (53 scenarios each) had no wrong decisions; every failure was `service_unavailable`
  during a Gemini HTTP 503 outage (2 scenarios in run 1, 23 in run 2).
- Browser (Playwright, real Gemini + Supabase): 60/60 checks on desktop and 390 px,
  including the 8-second minimum thinking time, handover cards, admin brief
  localization and collapse, read receipts, takeover/reply/close, pin/delete, owner
  isolation and draft retention. On widths up to 1050 px the conversation details
  panel no longer opens over the reply by default. The repository browser tests
  (`chat`, `chat-live`, `chat-sidebar`, `chat-delete`) pass against the current UI.
- Limits verified: the 30th customer message hands over as `conversation_loop`
  without an AI call; message 201 returns `MESSAGE_LIMIT`; a visitor's 21st write in a
  minute and 6th new chat in a minute return 429. The admin inbox lists the newest
  100 conversations (customers see their newest 30); older ones stay in the database.
- Six real Gemini scenarios ran through ChatService and Supabase (seven AI calls).
  Synthetic chats were removed afterwards. See [recorded conversations](task2-live-conversations.md).
- Seven additional real-provider evaluations covered payment questions, loops,
  ambiguous compatibility, missing brands, tax advice and prompt injection.
  See [current results](task2-live-edge-cases.md). Multi-turn inputs in this file
  are synthetic fixtures, not claimed live-generated conversation histories.
- The first brand test failed: Gemini invented Tier-1 equipment. The
  [baseline](task2-live-edge-baseline.md) is retained. Explicit missing-fact
  instructions were added and the complete edge suite passed afterwards.
  Prompt guidance reduces risk; these samples do not guarantee zero hallucinations.
- The ambiguity fixture escalated as `unknown_answer`, not `uncertain`. The exact
  low-confidence threshold is covered by deterministic unit tests.
- A separate browser test used actual HTTP routes, Gemini, Supabase and admin login:
  normal reply, lead handover, saved summary display, reload, ownership isolation,
  follow-up with the bot stopped, human takeover/reply, close and mobile width.
  It removes only its own isolated test visitor's data after finishing.
- OpenAI remains untested live; Gemini remains the explicit provider deviation.

Reproduce from the repository root with the dev server running:

```sh
# These commands consume AI quota and create/remove isolated synthetic test chats.
cd backend
CHAT_LIVE_TEST=1 CHAT_LIVE_SUPABASE=1 node --env-file=.env.local --import tsx tests/integration/check-chat-live.mjs
CHAT_LIVE_TEST=1 node --env-file=.env.local --import tsx tests/integration/check-chat-edge-live.mjs
cd ..
CHAT_LIVE_TEST=1 node --env-file=backend/.env.local frontend/tests/browser/chat-live.mjs
```

### Catalog checks before publishing sales replies

The chat service checks explicit named-product prices, monthly savings ranges and
warranty claims against the same trusted profile passed to the model. It also
checks that explicitly named products in comparison requests are not omitted.
Savings ranges are recognized whether the monthly wording comes before or after
the numbers ("ประหยัดต่อเดือน 3,000-4,500 บาท", "3,000-4,500 บาทต่อเดือน"); durations
such as "1-2 วัน" are not treated as savings. A savings range that is not attached to a
package name must still equal one package's published range, so a merged range such as
"1,500-9,000 บาทต่อเดือน" (Home Starter's minimum plus Business 10kW's maximum) is rejected;
a range describing the customer's own bill ("ถ้าค่าไฟ 3,000-4,000 บาทต่อเดือน") is not a
savings claim. Replies may not promise that solar is "very" or "definitely" worth it
("คุ้มค่ามาก", "คุ้มแน่นอน"). A failed check gets one corrected draft; a second failure hands over
as `uncertain`.

The reply language is also checked. The server detects the language of the
customer's latest question (Thai or English; quoted text and product names do not
count, and a number-only turn continues the previous language), tells the model
which language is required, and rejects a draft written in the other language.

A failed check triggers at most one fresh model decision with server-generated
error codes; the invalid draft is never stored as an assistant message. A second
failure queues `uncertain`. Provider errors still queue `service_unavailable`.
The retry uses the remaining request budget (up to 20 seconds) within the turn lease.

These are conservative Thai/English text checks, not a general semantic verifier.
Unrecognized phrasing, unsupported nonnumeric claims and completeness beyond
explicit product comparisons still require model instructions and live evaluation.
