# Application architecture

The repository contains two independently running applications. Next.js owns the
UI and rendering; the Node.js backend owns authentication, database queries, and
AI calls. Database scripts are versioned separately. This split is a project
choice, not a requirement imposed by Next.js. Task 3 adds a third piece outside
this repository's runtime: an n8n Cloud workflow, versioned here as `automation/workflow.json`.

```text
frontend/                 Next.js app, own package.json and lockfile
  src/app/                Pages and layouts
  src/features/           Home, properties, chat, sales, admin, leads, knowledge UI
  src/api/                Browser HTTP helpers
  src/server/             HTTP client for server-rendered pages; no DB logic
  src/shell/              Shared navigation and UI state
  src/ui/                 Visual primitives
  src/styles/             Styling; globals.css imports the ordered parts in global/ (order matters)
  src/demo/               Explicit demo scenarios
  tests/unit/             Import-boundary checks
  tests/browser/          Chrome tests with mocked APIs (Task 1, 2, 3 and layout)
backend/                  Node.js HTTP API, own package.json and lockfile
  src/server.ts           HTTP listener, request size limit, shutdown
  src/app.ts              Routing and HTTP middleware
  src/auth/               Auth handlers, signed sessions and access-code verification
  src/http/               Shared HTTP response helpers
  src/properties/         Listings handlers and DB repository
  src/matching/           Validation, matching, cache, Gemini/Claude/OpenAI providers
  src/business/           Profile repository and validation
  src/chat/               Task 2 sales agent: HTTP, provider, repository, service
  src/leads/              Task 3: form validation, n8n webhook provider, lead repository
  src/prompts/
    property-matching/    Shared system instructions and user payload builder
    sales/                Task 2 sales-agent instructions
  tests/unit/             Offline matching, chat, leads and HTTP/auth checks
  tests/integration/      Database/API and opt-in paid AI checks
database/
  migrations/             Schemas, permissions, business profile, chat (003–005), leads (006–009)
  seeds/                  Initial listing data
automation/               Task 3: n8n workflow.json, guide and workflow tests
packages/contracts/src/   Shared TypeScript domain and HTTP types only
data/                     Original assignment inputs
tasks/                    Original requirements
docs/                     Architecture documentation
scripts/dev.mjs           Starts and stops both development processes
scripts/check-architecture.mjs  Dependency and contract rules (part of npm run check)
```

## Request flow and boundaries

The browser calls Next.js on port 3100. Next.js proxies `/api/:path*` to the
backend on port 4000; `/listings` and `/match` remain compatibility aliases.
Admin and Knowledge Server Components use the backend HTTP client and forward
the session cookie. The backend checks authorization before reading private
business data. Cookie login/logout travel through the same-origin proxy.

Task 3 leads: `/contact` posts to `POST /api/leads`; the backend forwards the lead
to the n8n webhook (`N8N_LEAD_WEBHOOK_URL`) and relays the answer. n8n checks,
stores (Supabase RPCs from migrations 006–009), scores with Gemini and replies;
it talks to Supabase and Gemini directly, never to this backend. `/leads` reads
the stored leads through `GET /api/leads` with the admin session.

Next.js contains no database repository or AI provider. The frontend must not
import backend implementation files or Supabase. Browser modules cannot import
`src/server/`; ESLint and boundary tests enforce these restrictions. A root architecture check also verifies backend dependencies and that contracts
contain only types. Both apps
may import shared types from `packages/contracts`, which has no runtime service
code. Backend modules use relative ESM imports and do not depend on Next.js.

Repositories own persistence; providers own external API calls; handlers own
HTTP input/output. Add code beside its feature. Keep demo chat data visibly
separate from persisted data, and do not use fixtures as an API failure fallback.

## Configuration and local use

Use Node.js 22.18 or later. On a fresh checkout, copy each application's
`.env.example` to its `.env.local` and fill in configuration locally. Existing
local credentials have been moved to the backend during this refactor.

- `frontend/.env.local`: `BACKEND_URL` only for the API connection.
- `backend/.env.local`: Supabase, AI and admin credentials; port, host and frontend origin; the n8n webhook URL for Task 3.
- n8n: the Supabase key, Gemini key and webhook secret are n8n credentials, never in `workflow.json`.
- `database/`: SQL only; no credentials or running database process.

From the repository root:

```sh
npm run setup
npm run dev
npm run check
npm run build
npm run test:listings
npm run test:business
```

The development launcher defaults to ports 3100/4000 and sets their connection
configuration consistently. Override with `FRONTEND_PORT` and `BACKEND_PORT`.
Ctrl+C stops both child process groups. Each app can also run separately using
`npm run dev --prefix frontend` and `npm run dev --prefix backend`.

`check` is offline and does not spend AI credits. Integration checks require the
configured database. Live matching is opt-in and paid:
`npm run test:matching:live --prefix backend -- --live`.

## Production

Build from the repository root so both apps can resolve shared contract sources.
Run the backend with `npm start --prefix backend`, and the frontend with
`npm start --prefix frontend`. They can deploy separately; configure `BACKEND_URL`
for the reachable backend when building/running Next.js and `FRONTEND_ORIGIN` for
the exact public frontend origin. The backend needs `NODE_ENV=production`, an
HTTPS frontend origin, and `HOST=0.0.0.0` if exposed inside a container.

Backend build output includes `dist/backend/src` and shared contract output;
keep the dist tree intact with the backend package and production dependencies.
Next.js builds download Google Fonts. The proxy timeout is 65 seconds to allow
the database lookup and the provider's 45-second timeout to complete; hosting
request limits must also permit this duration. Backend cache and rate guards
are process-local, and the shared-code admin gate is a demo authentication scheme.

## Database and feature status

The move from `web/` to `frontend/` and the backend extraction do not change SQL
or existing Supabase data. No database reset or rerun is required. See
[database setup](../database/README.md) for script order and old path mappings.

Task 1 Gemini live smoke checks passed on 2026-10-18 with real Supabase data
and the backend application handler in process. Broader quality review and
Claude live validation remain outstanding.
Task 3 runs in n8n Cloud and was tested live end to end (n8n, Gemini, Supabase); results and setup are in [automation/README.md](../automation/README.md). Notifications and auto-replies are simulated (logged), as the brief allows.
Task 2 implements real AI sales chat, Supabase persistence (`conversations`, `messages`, `chat_requests` through private RPCs from migrations 003–005), owner-scoped history, durable handover, read receipts and authenticated human replies. Gemini is used by explicit user choice; the original Claude/OpenAI requirement remains a documented deviation. The SQLite repository is used only by the offline unit tests. See [Task 2](task2-graspia.md).

See [team conventions](../CONTRIBUTING.md) for review and change guidelines.

## Prompt ownership

`backend/src/prompts/property-matching/system.ts` owns system instructions and
`MATCH_PROMPT_VERSION`. `user.ts` serializes the buyer request and catalog as data.
Both providers reuse these builders; provider-specific HTTP envelopes stay in
`matching/`. The output JSON schema lives in `matching/match.schema.ts`, and
runtime validation stays in `matching/match.service.ts`.

Bump the prompt version when either builder changes behavior, so cached rankings
cannot survive a prompt change. This extraction preserves the existing prompt
text and version. Add a separate task directory when implementing sales prompts;
no empty sales-agent scaffolding is needed now.

Task 2 system instructions live in `backend/src/prompts/sales/system.ts`; chat HTTP, provider, repository and service are separated under `backend/src/chat/`. Shared chat types are in `packages/contracts/src/contracts/chat.ts`; the live frontend is under `frontend/src/features/chat/`.
