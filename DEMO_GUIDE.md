# Morning Lane (`Line`) — 2-Minute Demo & Stage Guide

**Grok Bot Real Estate Hackathon London · Track 4: Asset & Property Management**

Read this in 2 minutes right before going on stage or hitting record.

---

## 1. How It Works (Plain English — 4 Simple Steps)

1. **Tenant calls the AI line (Vapi)**
   You click **Call the line** in the browser (or a tenant phones in after hours). The Morning Lane voice assistant runs basic safety checks (gas smell, electrics), asks for the property address, and reads back the callback number.
2. **Grok reads the transcript & pulls proof (xAI `grok-4.20-0309-non-reasoning`)**
   As soon as the call ends, our webhook sends the transcript to Grok. Grok extracts the property, urgency (`Urgent` / `Today` / `This week`), safety status, next action, a short reason, and **word-for-word quotes** copied straight from what the caller said.
3. **Supabase saves it live**
   The call, structured record, and checklist action are saved in Postgres and pushed straight to the open **Inbox** over Realtime—no page refresh needed.
4. **Property manager reviews & acts in one click**
   Click any record to inspect the **Source Evidence** quotes (click a quote to highlight the exact line in the transcript), check **Similar Dwelly Cases** returned live from **Cognee Cloud**, click **Draft with Grok** for a contractor/caller/handover message, and hit **Mark done**.

---

## 2. Exact 2-Minute Demo Script (Word-for-Word)

> **Judging criteria to hit naturally:** real estate problem, execution quality, effective use of Grok & Cursor, **traceable data**, and **practical usefulness** (for judges **Kate Liapun** from Dwelly and **Shéa McDevitt** from Cortile).

### `0:00 – 0:20` · The Problem & Hook
*Keep the app open on the main Inbox screen (`https://grok-realestate-hackathon.vercel.app`).*

> "Property managers wake up to a mess of out-of-hours voicemails and half-written notes—and one missed boiler leak or gas risk becomes an emergency. We built **Morning Lane Line** using Cursor, Vapi, xAI Grok, Supabase, and Cognee: an AI property-line inbox that answers the call, triages it with **verifiable transcript proof**, matches real Dwelly case history, and drafts the contractor dispatch in one click."

---

### `0:20 – 0:55` · Live Call (`Call the line` + `Demo scripts`)
*Click **Demo scripts** in the top-right so judges see the prompt cards, then click **Start call now** (or **Call the line**).*

> "Let's test a real urgent maintenance call right now."

*When the Morning Lane assistant greets you, read the **Boiler & active leak** script clearly:*

> "Hi, my boiler has stopped working and water is dripping onto the hallway carpet at Flat 3, 14 Chatsworth Road. My name is Priya Patel — P-A-T-E-L — and my number is 07700 900 412. No gas smell, and the water is away from the sockets."

*Let the assistant confirm safety + read back digits (takes ~15 seconds), then click **Hang up call**. Watch the **Post-call Triage** banner—within ~5–10 seconds, the new record lands in the **Inbox** and auto-selects.*

> "Live captions streamed as we spoke. Now our Supabase webhook sends the transcript to Grok—and there it is, live in the Inbox, tagged **Urgent** with the safety check cleared."

> **Instant Backup (if venue mic/Wi-Fi hiccups):** Inside **Demo scripts**, click **Simulate call** on any card (next to **Copy script**)—it sends the realistic multi-turn transcript through the exact same Grok triage pipeline and pops it live into the Inbox via Realtime. Or click **Dwelly** / **Urgent** in the left Inbox and select the top case.

---

### `0:55 – 1:30` · Traceable Data (Grok Evidence + Similar Dwelly Cases)
*Point to the **Structured Record** section, **Grok Triage Rationale**, and **Source Evidence** quote cards.*

> "Property managers can't trust black-box AI summaries. Every field Grok extracts—priority, property, safety check—is backed by **Source Evidence** verified word-for-word against the transcript. Watch: when I click this quote, it jumps straight to that turn and highlights the exact words the caller said."

*Click one **Source Evidence** quote card so the transcript scrolls and highlights in yellow/green.*

*Now point to the **Similar Dwelly Cases** section powered by **Cognee Cloud** right below the evidence cards.*

> "We also indexed all 50 real-world **Dwelly** property cases in **Cognee Cloud**, with 8 Grok-triaged Dwelly sample cases live in this Inbox—so for every record, **Similar Dwelly Cases** automatically surfaces matching historical precedents and outcomes before the manager decides what to do."

---

### `1:30 – 2:00` · Action (`Draft with Grok` -> `Mark done`)
*Look at the **Dispatch & Reply** panel on the bottom-right. Keep **Contractor** selected and click **Draft with Grok**.*

> "Finally, we turn triage into action. Clicking **Draft with Grok** generates a grounded contractor work order—complete with safety checks and evidence links back to the transcript—plus **Caller SMS** and **Handover** tabs."

*Click **Copy message** (toast confirms copied), then click **Mark done (d)** at the top-right of the dark banner.*

> "Copy to send, hit **Mark done**, and the ticket clears in real time. Zero missed emergencies, zero hallucinations—built end-to-end with Cursor and Grok."

---

## 3. Judge Q&A Cheat Sheet (1-Sentence Answers)

* **How is Grok used?**
  `grok-4.20-0309-non-reasoning` runs post-call triage (extracting structured fields, rationale, and verbatim quotes from the transcript) and powers on-demand **Draft with Grok** messages for contractors, callers, and team handovers.
* **How do you prevent hallucinations / trace data?**
  Every extracted claim is checked server-side so only exact, word-for-word `evidence_quotes` found inside the caller's transcript are saved, and clicking any quote highlights the matching line in the transcript.
* **How does Dwelly / real estate data fit in?**
  We loaded 8 Grok-triaged **Dwelly** sample cases live into the Inbox (filterable via the **Dwelly** chip) and indexed all 50 Dwelly cases in **Cognee Cloud** so managers get instant historical precedents for every incoming issue.
* **What happens if a caller hangs up at the greeting?**
  The webhook detects there is no caller speech and fast-paths cleanly as `"Hung up at greeting"` (`No action`) without wasting an LLM call.
* **What about caller privacy / PII?**
  We strip phone numbers and call recording URLs from stored webhook payloads and store caller names as initials only (e.g., `P. P.`).

---

## 4. Live URLs, Public IDs & Pre-Deadline Checklist

* **Live App:** https://grok-realestate-hackathon.vercel.app
* **GitHub Repo:** https://github.com/grok-bot-realestate/grok-realestate-hackathon
* **Vapi Assistant ID:** `49706505-1c69-43ce-95ed-a31626602abc`
* *(No API keys or secrets are stored here—all keys live securely in Supabase runtime secrets & Vercel env vars.)*

### Quick Pre-Submission Checklist (Before 23:00 Freeze)
- [ ] **23:00 Code Freeze:** Confirm final `main` commit is pushed to GitHub and production deploy on Vercel is green.
- [ ] **Vercel Access Note:** Check if Vercel Deployment Protection / SSO is turned off (or share a Vercel bypass/share link if protected) so judges opening `https://grok-realestate-hackathon.vercel.app` can view the app without hitting a login wall.
- [ ] **Mic Check:** Test **Call the line** once in Chrome before recording or going on stage to confirm browser mic permission is granted.
- [ ] **2-Minute Video:** Record the exact script in Section 2 (`1080p`, clear mic audio, show **Demo scripts** -> **Call the line** (or **Simulate call** backup) -> **Source Evidence** click highlight -> **Similar Dwelly Cases** -> **Draft with Grok** -> **Mark done**), keeping it at **1:50–2:00**.
