# DESIGN.md — Graspia and What The Property at scale

Starting point: today's app already tags conversations with a `business_id`, saves each customer message before calling
the AI, and checks AI replies against the business's facts on the server. Changes from today are marked **(change)**.

## 1. Graspia at scale

**Knowledge per business**
- Facts the AI must never get wrong (products, prices, warranties, savings ranges, rules, tone) are structured rows per
  `business_id`; the server checks every number in a reply against them. Long material (FAQ, policies) is stored as
  searchable text chunks per `business_id`.
- Each prompt is built from one business only: its rules, its products and the few chunks matching the question.

**No leaks between businesses**
- The server decides the business from the channel (website widget key, LINE account), never from the request body.
- Every table carries `business_id`, filtered by database policies (RLS) and required by every knowledge search, so a
  forgotten filter cannot cross businesses. Automated tests try to read another business's data and must fail.
- **(change)** Per-person staff accounts, each limited to their own business, replace today's shared access code.
- Customer phone numbers and emails are kept for a set period (e.g. 12 months), then deleted; staff can delete a
  customer's data on request.

**AI cost as conversations grow**
- Send the last ~10 messages plus a short saved summary of older facts (name, phone, package), not the whole history.
- A low-cost model by default, provider prompt caching for the fixed per-business part, and tokens tracked per
  business with a monthly budget alert. Long chats are handed to a person (30 customer messages today).

## 2. Reliability

**AI down or slow during a live chat**
- **(change)** 15-second limit per AI call instead of today's 35 seconds, one retry on "overloaded", then stop calling
  the failing provider for a minute.
- The client sees their message marked as sent, a typing indicator, then — if the AI fails — "Our team has your message
  and will reply shortly." The chat goes to a person. Never an error screen, never a guessed answer. We keep today's
  choice of no automatic switch to another provider: a second provider is another prompt to test and maintain.

**No lead or message is ever lost**
- Save first, then process: every message and lead is written in a transaction before any AI call or alert (as today).
- A client-generated ID per message makes retries and double clicks safe.
- **(change)** Follow-up work (AI reply, scoring, alerts) runs from a queue with retries; items that keep failing alert
  the team, and a scheduled job finishes anything stuck half-way. Backups are restored once a month to prove they work.

## 3. Human handover in the real world

**Nobody picks up for 10 minutes**
- 0 min: alert on-duty staff (LINE); 5 min: alert everyone on duty; 10 min: alert the manager and tell the customer
  honestly, "Our specialists are busy; we will call you by HH:MM." The AI still does not answer product questions.
- Outside working hours: state the expected reply time at once and create a call-back task.

**Tracking what needs a human**
- One status per conversation: `bot` → `needs_human` (reason, since) → `claimed` (staff member, time) → `resolved`.
  One owner at a time; this needs the per-person accounts above.
- The inbox puts the longest-waiting first, `ready_to_buy` and `angry_customer` on top. Measured: time to claim, time
  to resolve, missed 10-minute targets.

## 4. My first 2 weeks

| Project | Build or fix | Why first |
| --- | --- | --- |
| Graspia | LINE alerts for handovers, with the 10-minute escalation | A handover nobody sees is a lost sale; today staff must watch the inbox |
| What The Property | Real lead delivery (LINE / email) instead of the simulated alert | Scoring is useless if the team never receives the lead |
| Both | Failure alerts (backend errors, failed n8n runs) and cost / speed tracking | Problems must reach us before customers do; fix what the numbers show |
| Graspia | Per-person staff accounts, business isolation and cross-business tests | Must exist before a second business goes live |
| What The Property | Track whether matched listings lead to a viewing request | Shows whether AI matching earns its cost, and what to improve |
| Both | ~50 real conversations and leads re-run before every prompt or model change | Prompt changes are the riskiest releases |

Priority: no lost leads or messages, then no data leaks, then cost, then new features.
