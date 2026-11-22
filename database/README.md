# Database setup

SQL assets for Supabase PostgreSQL live here. These files are run manually in
Supabase SQL Editor; this directory is not a configured Supabase CLI project.
Files under `migrations/` are the existing bootstrap scripts, not a migration
history that has been applied by a CLI. Do not assume `IF NOT EXISTS` updates an
existing table when its definition changes.

## New database

Open the Supabase dashboard → SQL Editor, paste each entire file and run it, in this order:

1. [migrations/001-listings.sql](migrations/001-listings.sql)
2. [seeds/001-listings.sql](seeds/001-listings.sql)
3. [migrations/002-business-profile.sql](migrations/002-business-profile.sql)
4. [migrations/003-conversations.sql](migrations/003-conversations.sql)
5. [migrations/004-chat-runtime.sql](migrations/004-chat-runtime.sql)
6. [migrations/005-chat-read-receipts.sql](migrations/005-chat-read-receipts.sql)
7. [migrations/006-leads.sql](migrations/006-leads.sql) (Task 3 lead automation)
8. [migrations/007-lead-reason-th.sql](migrations/007-lead-reason-th.sql) (Task 3: Thai version of the AI reason)
9. [migrations/008-lead-processing-lease.sql](migrations/008-lead-processing-lease.sql) (Task 3: score each message once)
10. [migrations/009-lead-keep-customer-details.sql](migrations/009-lead-keep-customer-details.sql) (Task 3: a repeat message cannot change the customer's name or contacts)

The business-profile bootstrap retains its original combined schema/seed
transaction. Listings are publicly readable; business profiles and conversations
are private. The backend checks conversation ownership itself, because the service role it uses bypasses RLS.

## Existing database

For chat persistence, run migration 004 after 003, then 005 (read receipts). No reset is required.
Migration 005 adds two nullable columns and replaces the chat RPCs; existing messages
are not marked read retroactively. For Task 3, run migration 006; it only adds the
lead tables and functions and does not touch existing data.
Then run migration 007; it adds one nullable column for the Thai reason and replaces
`lead_record`. Existing leads keep their English reason. Then run migration 008; it adds one nullable
column (`processing_until`) and replaces `lead_intake`. Then run migration 009; it replaces `lead_intake` again
so a repeat message no longer changes the stored customer's name or contact details.

No SQL needs to run again solely for the folder reorganization. SQL statements and table
names are unchanged; only file paths and a setup comment changed. The original files moved as follows:

| Previous location | Current location |
| --- | --- |
| `supabase/schema.sql` | `database/migrations/001-listings.sql` |
| `supabase/seed.sql` | `database/seeds/001-listings.sql` |
| `supabase/02-business-profile.sql` | `database/migrations/002-business-profile.sql` |
| `supabase/03-conversations.sql` | `database/migrations/003-conversations.sql` |

For future schema changes, add a new numbered SQL file with explicit `ALTER`
statements rather than editing an already-applied definition and expecting it to
update the database. Keep seed data separate where practical, and never put
credentials or real customer conversations in seed files.

Original assignment JSON remains in `../data/` for reproducibility and tests.
The application reads live property/business data through backend repositories.
Creating the conversation tables alone does not connect chat persistence.

## Task 2 runtime storage

The runtime uses Supabase conversations, messages and chat_requests, including
pins and handover metadata. Migration 004 supplies private transactional RPCs;
migration 005 adds admin/customer read cursors to them.
