# Working on this repository

Use Node.js 22.18 or later. Run `npm run setup` once from the repository root,
configure each app's local environment file, then run `npm run dev`.

## Where changes belong

| Change | Location |
| --- | --- |
| Pages, components, presentation, browser state | `frontend/src/` |
| API behavior, auth, AI, persistence | `backend/src/` |
| System prompts and user payload builders | `backend/src/prompts/<task>/` |
| Shared domain and HTTP types | `packages/contracts/src/` |
| Schema or permission changes | New numbered file in `database/migrations/` |
| Initial reproducible records | `database/seeds/` |
| Architecture and operational explanation | `docs/` or the owning app's README |

Organize code around features. Keep HTTP transport, business behavior, external
providers, and repositories separate where they have distinct responsibilities.
Share types across apps, not implementation. Avoid creating empty directories
or additional abstraction layers for features that do not exist yet.

Follow `.editorconfig` and the surrounding code style. Use descriptive file names
such as `*.handler.ts`, `*.repository.ts`, `*.provider.ts`, and `*.validation.ts`.
Backend imports use ESM `.js` extensions so compiled code runs directly in Node.
Do not change supplied `tasks/` or `data/` to make an implementation test pass.

## Before review

Run `npm run check` and `npm run build` from the root. Changes to database/API
behavior also need relevant integration checks (`test:listings`, `test:business`).
Live AI checks are opt-in and spend credits; report separately whether real model
quality was tested. UI changes should be checked in a browser at desktop/mobile
widths and in loading, empty, and error states where relevant.

Describe the user-visible change, validation, and remaining limitations in review.
Update the owning README when commands, configuration, APIs, or behavior change.
Keep both application lockfiles updated when their dependencies change.

Never commit `.env.local` or credentials. Add configuration names and safe examples
to the owning `.env.example`. Do not expose private backend keys through
`NEXT_PUBLIC_` variables, responses, logs, fixtures, or screenshots.

Existing databases are changed through explicit numbered SQL changes; editing a
previous bootstrap file does not update a live table. Record manual execution
requirements in `database/README.md`. Never reset a database as part of a routine
code reorganization.
