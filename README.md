# Line Inbox — Morning Lane

**Live Demo:** [https://grok-realestate-hackathon.vercel.app](https://grok-realestate-hackathon.vercel.app)  
**Track:** **Track 4 — Asset and Property Management** (Grok Bot Real Estate Hackathon London)  
**Built with:** Cursor, xAI Grok, Vapi, Supabase, Cognee Cloud, React, TypeScript, Tailwind CSS, and Vercel

---

## The Problem & Solution

### The Problem
UK residential lettings and property management teams (such as Morning Lane and Dwelly workflows) wake up to fragmented out-of-hours voicemails, incomplete call notes, and high-volume inbound enquiries. When a tenant reports an active boiler leak, loss of heat, gas smell, lock failure, or urgent rent arrears outside office hours, a missed detail or slow triage quickly escalates into property damage, compliance risk, or lost tenancies—and black-box AI summaries cannot be trusted without proof.

### The Solution
**Line Inbox — Morning Lane** is an AI property-line front desk and real-time triage workbench:

1. **AI Voice Front Desk (`Vapi`)** answers inbound tenant, landlord, and applicant calls 24/7, runs UK safety checks (gas smell, electrics clearance), captures the property address, spells back surnames, and reads back callback digits.
2. **Traceable xAI Grok Triage** converts each completed call transcript into a structured operational record backed by **word-for-word `evidence_quotes`** verified server-side against the transcript.
3. **Real-Time Property Inbox** streams new calls, records, and checklist actions into the workbench via **Supabase Realtime** with zero page reloads.
4. **Dwelly Case Precedents (`Cognee Cloud`)** automatically surfaces **Similar Dwelly Cases** from 50 indexed property-management records inside each ticket.
5. **One-Click Grounded Dispatch** drafts ready-to-send **Contractor Work Orders**, **Caller Callback SMS**, and **Shift Handover** notes anchored directly to the transcript.

---

## How It Works (Architecture)

```text
Caller / Browser Mic (@vapi-ai/web) ──or──▶ Demo Scripts ("Simulate call" -> demo-call)
        │                                              │
        └──────────────▶ end-of-call-report ───────────┘
                                │
                                ▼
             supabase/functions/call-ended/index.ts
        (strips PII/recordings · verifies webhook secret)
                                │
                                ▼
          xAI Grok (grok-4.20-0309-non-reasoning)
    (priority, type, property, initials, safety, reasoning,
         word-for-word verified evidence_quotes)
                                │
                                ▼
       Supabase Postgres (calls, records, actions, kpi view)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
      Supabase Realtime               On-Demand Edge Functions
   (live Inbox & KPI sync)         ├── cognee-search (50 Dwelly cases)
                                   └── grok-dispatch (Contractor / Caller / Handover)
```

### 1. Vapi Voice Front Desk
- **Browser Call Client (`src/lib/lineCall.ts`, `src/components/LiveCallDock.tsx`)**: Powered by `@vapi-ai/web` using Deepgram `nova-3` (`en-GB`) transcription, OpenAI `gpt-4.1` conversation orchestration, and an ElevenLabs British voice, with live streaming captions, caller/assistant volume levels, mute, and hang-up controls.
- **No-Mic Simulation Fallback (`supabase/functions/demo-call/index.ts`, `src/components/DemoPromptsPopover.tsx`)**: Lets judges and operators trigger realistic multi-turn UK lettings scenarios (`boiler`, `viewing`, `arrears`) through the exact same `call-ended` webhook and Grok triage pipeline.
- **Clean Hang-Up Fast-Path**: Calls where the caller disconnects at the greeting without speaking are logged cleanly as `"Hung up at greeting"` (`No action`) without incurring an LLM call.

### 2. xAI Grok Triage & Verbatim Traceability (`supabase/functions/call-ended/index.ts`)
- **Model**: Calls xAI `grok-4.20-0309-non-reasoning` with structured JSON output.
- **Structured Extraction**: Classifies `type` (`maintenance`, `viewing`, `let`, `arrears`, `general`), `priority` (`urgent`, `today`, `week` with `Europe/London` working-day SLA due dates), `property`, `issue`, `callback_confirmed`, `safety_check` (`asked, clear`, `asked, concern`, `not asked`, `n/a`), `summary`, `action`, `grok_reasoning`, and `draft_reply`.
- **Verbatim Quote Verification**: Server-side `sanitizeQuotes` checks every returned `evidence_quotes` entry against the normalised transcript so only exact word-for-word substrings are stored. In `src/components/RecordWorkbench.tsx`, clicking any **Source Evidence** quote scrolls to and highlights the exact line in the transcript.
- **PII & Payload Hygiene**: Strips phone numbers, customer objects, and recording URLs from stored webhook payloads (`stripSensitive`) and stores caller names as initials only (`caller_initials`, e.g., `P. P.`).
- **Deterministic Fallback**: Falls back to structured data or deterministic UK lettings regex rules (`regexFallback`) if LLM triage is unavailable.

### 3. Live Dispatch Drafting (`supabase/functions/grok-dispatch/index.ts`)
- Generates grounded operational messages in three modes from the record, actions, and transcript (with optional custom instructions):
  - **Contractor**: UK trade work order (e.g., Gas Safe engineer, plumber, locksmith) with safety status and access notes.
  - **Caller**: Reassuring UK English callback SMS/script without inventing unconfirmed appointment times.
  - **Handover**: Branch manager / landlord summary with urgency, safety status, and recommended next step.
- Returns a pre-send operational `checklist` plus transcript-verified `evidence_quotes`, and persists the generated draft to `records.draft_reply`.

### 4. Cognee Cloud Dwelly Memory (`supabase/functions/cognee-search/index.ts`)
- Queries 50 indexed Dwelly property-management cases in the `morning_lane_dwelly` Cognee Cloud dataset (`CHUNKS` search with `SUMMARIES` fallback).
- Surfaces **Similar Dwelly Cases** with case ID, property, status, excerpt, and outcome directly inside each record workbench (`src/components/RecordWorkbench.tsx`, `src/lib/cognee.ts`).

### 5. Supabase & Vercel Infrastructure
- **Postgres Schema (`supabase/migrations/`)**:
  - `calls`: call metadata (`source` in `phone | dwelly | synthetic`, `started_at`, `duration_s`, `out_of_hours`, `weekday`, `caller_initials`, `transcript`, scrubbed `raw` JSONB).
  - `records`: triaged case fields plus Grok traceability columns (`triage_source`, `grok_model`, `grok_latency_ms`, `grok_reasoning`, `evidence_quotes`, `draft_reply`).
  - `actions`: follow-up checklist items (`action`, `due`, `done`).
  - `kpi` view: live call volume, out-of-hours percentage, open urgent items, and estimated hours saved.
- **Supabase Realtime (`src/lib/inbox.ts`)**: Subscribes to `postgres_changes` on `calls`, `records`, and `actions` so newly triaged calls and completed actions sync across open sessions immediately.
- **Vault Runtime Secrets**: Edge Functions retrieve runtime credentials (`XAI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `COGNEE_API_KEY`, `COGNEE_BASE_URL`) via the `line_runtime_secret` Postgres RPC (with environment variable fallback).
- **Frontend & Hosting**: Vite + React 19 + TypeScript + Tailwind CSS v4 SPA deployed on Vercel (`https://grok-realestate-hackathon.vercel.app`). Built with **Cursor**.

---

## Repository Structure

```text
.
├── DEMO_GUIDE.md                         # 2-minute stage script, demo flow & judge Q&A
├── index.html                            # App shell entry
├── package.json                          # Vite, React 19, Tailwind v4, @vapi-ai/web, @supabase/supabase-js
├── .env.example                          # Template for local/deploy environment variables
├── src/
│   ├── App.tsx                           # Main Line Inbox layout, shortcuts (j/k, /, d, m, ?), live call state
│   ├── types.ts                          # TypeScript models for calls, records, actions, Grok & Cognee responses
│   ├── components/
│   │   ├── InboxPane.tsx                 # Searchable, filterable, sortable call & Dwelly case list
│   │   ├── RecordWorkbench.tsx           # Structured triage, Source Evidence highlighter, Cognee precedents, Dispatch & Reply
│   │   ├── LiveCallDock.tsx              # Active Vapi call controls, volume meters & live streaming captions
│   │   ├── DemoPromptsPopover.tsx        # Caller test scripts & one-click "Simulate call" triggers
│   │   ├── TelemetryStrip.tsx            # KPI strip & Realtime connection status
│   │   └── ShortcutsModal.tsx            # Keyboard shortcut reference
│   └── lib/
│       ├── inbox.ts                      # Supabase queries, Realtime subscriptions & optimistic action/priority updates
│       ├── lineCall.ts                   # @vapi-ai/web call lifecycle & live transcript hook
│       ├── demoCall.ts                   # Client helper for simulated Grok triage calls
│       ├── grok.ts                       # Client helper for grok-dispatch Edge Function
│       ├── cognee.ts                     # Client helper & cache for cognee-search Edge Function
│       ├── format.ts                     # Transcript parser, quote highlighter regex & SLA formatters
│       └── supabase.ts                   # Supabase browser client
└── supabase/
    ├── config.toml                       # Supabase project & Edge Function JWT settings
    ├── migrations/
    │   ├── 0001_init.sql                 # Core calls, records, actions tables, kpi view & Realtime publication
    │   └── 0003_grok_traceability.sql    # Grok model, latency, reasoning, evidence_quotes & draft_reply columns
    └── functions/
        ├── call-ended/index.ts           # Vapi webhook -> PII scrub -> Grok triage -> verified evidence_quotes -> Postgres
        ├── grok-dispatch/index.ts        # On-demand Contractor / Caller / Handover message drafting with Grok
        ├── cognee-search/index.ts        # Cognee Cloud semantic search over morning_lane_dwelly (50 cases)
        └── demo-call/index.ts            # Simulated multi-turn UK lettings call routed through call-ended
```

---

## Local Setup

1. **Configure environment variables** (never commit `.env`):
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and optional Vapi (`VITE_VAPI_PUBLIC_KEY`, `VITE_VAPI_ASSISTANT_ID`) values for the frontend, plus backend secrets in Supabase Vault / Edge Function secrets (`XAI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `COGNEE_API_KEY`, `COGNEE_BASE_URL`).

2. **Install dependencies and start the dev server**:
   ```bash
   npm install
   npm run dev
   ```

3. **Type-check, build, or lint**:
   ```bash
   npm run build
   npm run lint
   ```

For the live walkthrough and stage script, see [`DEMO_GUIDE.md`](./DEMO_GUIDE.md).
