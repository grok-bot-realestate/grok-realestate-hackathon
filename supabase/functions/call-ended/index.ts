import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TYPES = ["maintenance", "viewing", "let", "arrears", "general"] as const;
const PRIORITIES = ["urgent", "today", "week"] as const;
const SAFETY = ["asked, clear", "asked, concern", "not asked", "n/a"] as const;

type CaseType = (typeof TYPES)[number];
type Priority = (typeof PRIORITIES)[number];
type Safety = (typeof SAFETY)[number];

type EvidenceQuote = {
  field: string;
  quote: string;
};

type Structured = {
  type: CaseType;
  priority: Priority;
  property: string | null;
  issue: string;
  callback_confirmed: boolean;
  safety_check: Safety;
  summary: string;
  action: string;
  caller_initials: string | null;
  grok_reasoning: string | null;
  evidence_quotes: EvidenceQuote[];
  draft_reply: string | null;
};

const TRIAGE_SYSTEM = `You are the triage AI for Morning Lane, a UK lettings branch. Read the call transcript and return JSON only (no prose) matching this exact schema:
{
  "type": "maintenance" | "viewing" | "let" | "arrears" | "general",
  "priority": "urgent" | "today" | "week",
  "property": string | null,
  "issue": string,
  "callback_confirmed": boolean,
  "safety_check": "asked, clear" | "asked, concern" | "not asked" | "n/a",
  "caller_initials": string | null,
  "summary": string,
  "action": string,
  "grok_reasoning": string,
  "evidence_quotes": [{"field": "priority" | "property" | "issue" | "safety_check" | "callback_confirmed", "quote": string}],
  "draft_reply": string
}

Rules:
- Priority "urgent": no heat/heating, no hot water, no power, no water, lock or external door that won't secure, active leak/flood, gas smell, safety concern, or rent arrears/dispute.
- Priority "today": viewing requests, landlord/valuation enquiries, sole blocked toilet, broken oven/essential appliance.
- Priority "week": routine maintenance (garden, window handle, minor fixtures), check-out/inspection follow-ups, general enquiries.
- "summary": concise one-line summary under 100 chars.
- "action": one specific imperative next step a UK lettings property manager should take next.
- "grok_reasoning": 1-2 short sentences explaining why this priority, type, and action were chosen.
- "evidence_quotes": 1-4 EXACT verbatim substrings copied word-for-word from the transcript proving the extracted priority, property, issue, or safety check. Never alter or invent quote wording.
- "draft_reply": a crisp, ready-to-send callback SMS / contractor instruction grounded strictly in the transcript. Use caller initials only (never include full names or phone numbers).
- "caller_initials": if the caller gave their name, return initials only (e.g. "J. S."), never a full name or phone number; otherwise null.
- Never invent facts not in the transcript.`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function messageOf(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const nested = asRecord(root.message);
  if (nested && typeof nested.type === "string") return nested;
  if (typeof root.type === "string") return root;
  return nested ?? root;
}

const DROP_KEY = /recording|phone|e164|customer|destination|caller.?number/i;

function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  const rec = asRecord(value);
  if (!rec) {
    if (typeof value === "string" && /^https?:\/\//i.test(value) && /recording|vapi\.ai\/storage/i.test(value)) {
      return undefined;
    }
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(rec)) {
    if (DROP_KEY.test(key)) continue;
    const cleaned = stripSensitive(child);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

function londonParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function ymdToUtc(y: number, m: number, d: number, hour: number, minute: number): Date {
  let utc = Date.UTC(y, m - 1, d, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const got = londonParts(new Date(utc));
    const gotAsUtc = Date.UTC(got.y, got.m - 1, got.d, got.hour, got.minute, 0);
    const want = Date.UTC(y, m - 1, d, hour, minute, 0);
    const delta = want - gotAsUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

function addDays(y: number, m: number, d: number, n: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function isWeekend(y: number, m: number, d: number): boolean {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

function nextWorking(y: number, m: number, d: number) {
  let cur = addDays(y, m, d, 1);
  while (isWeekend(cur.y, cur.m, cur.d)) cur = addDays(cur.y, cur.m, cur.d, 1);
  return cur;
}

function plusWorkingDays(y: number, m: number, d: number, n: number) {
  let cur = { y, m, d };
  let left = n;
  while (left > 0) {
    cur = addDays(cur.y, cur.m, cur.d, 1);
    if (!isWeekend(cur.y, cur.m, cur.d)) left -= 1;
  }
  return cur;
}

function dueFor(priority: Priority, startedAt: Date): string {
  const p = londonParts(startedAt);
  if (priority === "urgent") {
    const n = nextWorking(p.y, p.m, p.d);
    return ymdToUtc(n.y, n.m, n.d, 10, 0).toISOString();
  }
  if (priority === "today") {
    const n = nextWorking(p.y, p.m, p.d);
    return ymdToUtc(n.y, n.m, n.d, 18, 0).toISOString();
  }
  const n = plusWorkingDays(p.y, p.m, p.d, 5);
  return ymdToUtc(n.y, n.m, n.d, 18, 0).toISOString();
}

function outOfHours(startedAt: Date): { out: boolean; weekday: string } {
  const p = londonParts(startedAt);
  const weekend = p.weekday === "Saturday" || p.weekday === "Sunday";
  const inHours = !weekend && p.hour >= 9 && p.hour < 18;
  return { out: !inHours, weekday: p.weekday };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

function sanitizeInitials(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(null|none|n\/a|unknown)$/i.test(trimmed)) return null;
  const parts = trimmed.split(/[\s.]+/).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return null;
  return parts.map((p) => `${p[0].toUpperCase()}.`).join(" ").slice(0, 12);
}

function normalizeWs(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function sanitizeQuotes(raw: unknown, transcript: string): EvidenceQuote[] {
  if (!Array.isArray(raw)) return [];
  const normTranscript = normalizeWs(transcript);
  const out: EvidenceQuote[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const field = typeof rec.field === "string" ? rec.field.trim() : "";
    const quote = typeof rec.quote === "string" ? rec.quote.trim() : "";
    if (!field || !quote || quote.length < 4) continue;
    // Verify verbatim grounding against transcript
    const normQuote = normalizeWs(quote);
    if (normTranscript.includes(normQuote)) {
      out.push({ field, quote: quote.slice(0, 220) });
    }
    if (out.length >= 5) break;
  }
  return out;
}

function parseStructured(input: unknown, transcript: string): Structured | null {
  const o = asRecord(input);
  if (!o) return null;
  const type = oneOf(o.type, TYPES);
  const priority = oneOf(o.priority, PRIORITIES);
  const safety = oneOf(o.safety_check, SAFETY);
  if (!type || !priority || !safety) return null;
  if (typeof o.summary !== "string" || !o.summary.trim()) return null;
  if (typeof o.action !== "string" || !o.action.trim()) return null;
  const issue = typeof o.issue === "string" ? o.issue.trim() : "";
  const property = typeof o.property === "string" && o.property.trim() ? o.property.trim() : null;
  const callback = o.callback_confirmed === true || o.callback_confirmed === "true";
  const grok_reasoning = typeof o.grok_reasoning === "string" && o.grok_reasoning.trim()
    ? o.grok_reasoning.trim().slice(0, 400)
    : null;
  const draft_reply = typeof o.draft_reply === "string" && o.draft_reply.trim()
    ? o.draft_reply.trim().slice(0, 600)
    : null;
  return {
    type,
    priority,
    property,
    issue,
    callback_confirmed: callback,
    safety_check: safety,
    summary: o.summary.trim().slice(0, 100),
    action: o.action.trim(),
    caller_initials: sanitizeInitials(o.caller_initials),
    grok_reasoning,
    evidence_quotes: sanitizeQuotes(o.evidence_quotes, transcript),
    draft_reply,
  };
}

function regexFallback(transcript: string): Structured {
  const lower = transcript.toLowerCase();
  const urgent = /(no heat|no hot water|no power|no water|active leak|water leaking|burst pipe|gas smell|smell of gas|lock.*broken|won't lock|arrears)/i.test(lower);
  const viewing = /\b(viewing|view the flat|view the property)\b/i.test(lower);
  const valuation = /\b(valuation|landlord|let my property)\b/i.test(lower);
  const arrears = /\b(arrears|rent payment|missed rent)\b/i.test(lower);
  const maintenance = /(boiler|leak|pipe|tap|toilet|shower|heating|radiator|lock|door|window|oven|dishwasher|washing machine|damp|mould)/i.test(lower);

  const type: CaseType = arrears ? "arrears" : viewing ? "viewing" : valuation ? "let" : maintenance ? "maintenance" : "general";
  const priority: Priority = urgent || arrears ? "urgent" : viewing || valuation ? "today" : "week";
  const safety: Safety = type === "maintenance"
    ? (/gas|electrics|risk/i.test(lower) ? (/no gas|no smell|clear|safe/i.test(lower) ? "asked, clear" : "asked, concern") : "not asked")
    : "n/a";

  const callerLine = transcript.split(/\n+/).find((l) => /^(Caller|User|Human|Customer):/i.test(l)) ?? transcript;
  const cleanLine = callerLine.replace(/^(Caller|User|Human|Customer):\s*/i, "").trim();

  return {
    type,
    priority,
    property: null,
    issue: cleanLine.slice(0, 140) || "Caller enquiry",
    callback_confirmed: /confirm|call.*back|number/i.test(lower),
    safety_check: safety,
    summary: (cleanLine || "After-hours call logged").slice(0, 100),
    action: priority === "urgent"
      ? "Review urgent transcript immediately and dispatch emergency contractor."
      : "Call the caller back on the next working day and log next steps.",
    caller_initials: null,
    grok_reasoning: "Deterministic fallback rules applied because LLM triage was unavailable.",
    evidence_quotes: cleanLine ? [{ field: "issue", quote: cleanLine.slice(0, 200) }] : [],
    draft_reply: null,
  };
}

function messagesToTranscript(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const lines: string[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const role = typeof rec.role === "string" ? rec.role.toLowerCase().trim() : "";
    if (role === "system" || role === "tool" || role === "tool_calls" || role === "tool_call_result") continue;
    const text = [rec.message, rec.content, rec.text, rec.transcript]
      .find((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (!text) continue;
    const clean = text.trim();
    if (role === "assistant" || role === "bot" || role === "ai") {
      lines.push(`AI: ${clean}`);
    } else if (role === "user" || role === "caller" || role === "human" || role === "customer") {
      lines.push(`Caller: ${clean}`);
    } else {
      lines.push(clean);
    }
  }
  return lines.join("\n");
}

function transcriptOf(obj: Record<string, unknown>): string {
  if (typeof obj.transcript === "string" && obj.transcript.trim()) return obj.transcript;
  const artifact = asRecord(obj.artifact);
  if (artifact) {
    if (typeof artifact.transcript === "string" && artifact.transcript.trim()) return artifact.transcript;
    const fromArtifactMsgs = messagesToTranscript(artifact.messages);
    if (fromArtifactMsgs) return fromArtifactMsgs;
  }
  const fromMsgs = messagesToTranscript(obj.messages);
  if (fromMsgs) return fromMsgs;
  const call = asRecord(obj.call);
  if (call) {
    if (typeof call.transcript === "string" && call.transcript.trim()) return call.transcript;
    const callArtifact = asRecord(call.artifact);
    if (callArtifact) {
      if (typeof callArtifact.transcript === "string" && callArtifact.transcript.trim()) return callArtifact.transcript;
      const fromCallArtifactMsgs = messagesToTranscript(callArtifact.messages);
      if (fromCallArtifactMsgs) return fromCallArtifactMsgs;
    }
    const fromCallMsgs = messagesToTranscript(call.messages);
    if (fromCallMsgs) return fromCallMsgs;
  }
  return "";
}

async function fetchVapiCall(callId: string): Promise<Record<string, unknown> | null> {
  const apiKey = Deno.env.get("VAPI_PRIVATE_KEY")?.trim();
  if (!apiKey || callId.startsWith("demo-")) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      console.log(JSON.stringify({ event: "vapi_call_fetch_failed", call_id: `ph-${callId}`, status: res.status }));
      return null;
    }
    const data = await res.json().catch(() => null);
    return asRecord(data);
  } catch (err) {
    console.log(JSON.stringify({
      event: "vapi_call_fetch_error",
      call_id: `ph-${callId}`,
      error: err instanceof Error ? err.message : String(err),
    }));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hasCallerSpeech(transcript: string): boolean {
  const lines = transcript.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const callerLines = lines.filter((l) => /^(Caller|User|Human|Customer):/i.test(l));
  if (callerLines.length > 0) {
    return callerLines.some((l) => l.replace(/^(Caller|User|Human|Customer):\s*/i, "").trim().length > 0);
  }
  const nonAi = lines.filter((l) => !/^(AI|Assistant|Bot):/i.test(l));
  return nonAi.length > 0;
}

function callIdOf(message: Record<string, unknown>): string | null {
  const call = asRecord(message.call);
  const id = call?.id ?? message.callId ?? message.call_id;
  if (typeof id !== "string" || !id.trim()) return null;
  return id.trim();
}

function startedAtOf(message: Record<string, unknown>): Date {
  const call = asRecord(message.call);
  const raw = message.startedAt ?? message.started_at ?? call?.startedAt ?? call?.started_at;
  const date = typeof raw === "string" ? new Date(raw) : new Date(NaN);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function durationOf(message: Record<string, unknown>, started: Date): number | null {
  const call = asRecord(message.call);
  const raw = message.endedAt ?? message.ended_at ?? call?.endedAt ?? call?.ended_at;
  if (typeof message.durationSeconds === "number") return Math.max(0, Math.round(message.durationSeconds));
  if (typeof raw !== "string") return null;
  const ended = new Date(raw);
  if (Number.isNaN(ended.getTime())) return null;
  return Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));
}

async function insertRecord(
  supabase: ReturnType<typeof createClient>,
  callId: string,
  recordId: string,
  structured: Structured,
  started: Date,
  meta: { triage_source: string; grok_model: string | null; grok_latency_ms: number | null },
): Promise<{ ok: boolean; created: boolean }> {
  if (structured.caller_initials) {
    await supabase
      .from("calls")
      .update({ caller_initials: structured.caller_initials })
      .eq("id", callId);
  }

  const { data: existing, error: readError } = await supabase
    .from("records")
    .select("id")
    .eq("id", recordId)
    .maybeSingle();
  if (readError) {
    console.log(JSON.stringify({ event: "record_read_failed", call_id: callId, code: readError.code }));
    return { ok: false, created: false };
  }
  if (existing) return { ok: true, created: false };

  const { error: recordError } = await supabase.from("records").insert({
    id: recordId,
    call_id: callId,
    type: structured.type,
    priority: structured.priority,
    property: structured.property,
    issue: structured.issue,
    callback_confirmed: structured.callback_confirmed,
    safety_check: structured.safety_check,
    summary: structured.summary,
    triage_source: meta.triage_source,
    grok_model: meta.grok_model,
    grok_latency_ms: meta.grok_latency_ms,
    grok_reasoning: structured.grok_reasoning,
    evidence_quotes: structured.evidence_quotes,
    draft_reply: structured.draft_reply,
  });
  if (recordError) {
    if (recordError.code === "23505") return { ok: true, created: false };
    console.log(JSON.stringify({ event: "record_insert_failed", call_id: callId, code: recordError.code, msg: recordError.message }));
    return { ok: false, created: false };
  }

  const { error: actionError } = await supabase.from("actions").insert({
    record_id: recordId,
    action: structured.action,
    due: dueFor(structured.priority, started),
    done: false,
  });
  if (actionError && actionError.code !== "23505") {
    console.log(JSON.stringify({ event: "action_insert_failed", call_id: callId, code: actionError.code }));
    return { ok: false, created: true };
  }
  return { ok: true, created: true };
}

async function runtimeSecret(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("line_runtime_secret", { secret_name: name });
  if (!error && typeof data === "string" && data.length > 0) return data;
  return Deno.env.get(name) ?? "";
}

async function triageWithGrok(
  supabase: ReturnType<typeof createClient>,
  callId: string,
  transcript: string,
): Promise<{ structured: Structured; model: string; latencyMs: number } | null> {
  const key = await runtimeSecret(supabase, "XAI_API_KEY") || await runtimeSecret(supabase, "LLM_API_KEY");
  if (!key) {
    console.log(JSON.stringify({ event: "llm_skipped", call_id: callId, reason: "no_key" }));
    return null;
  }
  const base = ((await runtimeSecret(supabase, "LLM_BASE_URL")) || "https://api.x.ai/v1").replace(/\/$/, "");
  const model = (await runtimeSecret(supabase, "LLM_MODEL")) || "grok-4.20-0309-non-reasoning";
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TRIAGE_SYSTEM },
          { role: "user", content: transcript },
        ],
      }),
    });
    const latency = Date.now() - started;
    const payload = await res.json().catch(() => null);
    const usage = asRecord(asRecord(payload)?.usage);
    const resolvedModel = typeof asRecord(payload)?.model === "string" ? String(asRecord(payload)?.model) : model;
    console.log(JSON.stringify({
      event: "llm",
      provider: "xai",
      call_id: callId,
      model: resolvedModel,
      status: res.status,
      latency_ms: latency,
      tokens: usage?.total_tokens ?? null,
    }));
    if (!res.ok) return null;
    const choices = asRecord(payload)?.choices;
    const first = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const message = asRecord(first?.message);
    const content = message?.content;
    if (typeof content !== "string") return null;
    const parsed = parseStructured(JSON.parse(content), transcript);
    if (!parsed) return null;
    return { structured: parsed, model: resolvedModel, latencyMs: latency };
  } catch (err) {
    console.log(JSON.stringify({
      event: "llm_error",
      call_id: callId,
      model,
      error: err instanceof Error ? err.message : String(err),
    }));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server misconfigured" }, 500);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expected = await runtimeSecret(supabase, "VAPI_WEBHOOK_SECRET");
  const provided = req.headers.get("x-vapi-secret") ?? "";
  if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") return json({ ok: true });

  let body: unknown = null;
  const text = await req.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ ok: true, ignored: "invalid json" });
    }
  }

  const root = asRecord(body);
  const message = messageOf(body);
  const type = typeof message?.type === "string" ? message.type : null;
  if (!message || type !== "end-of-call-report") {
    return json({ ok: true, ignored: type ?? "empty" });
  }

  const vapiCallId = callIdOf(message);
  if (!vapiCallId) return json({ ok: false, error: "missing call id" }, 400);

  const started = startedAtOf(message);
  const hours = outOfHours(started);
  const callId = `ph-${vapiCallId}`;
  const recordId = `r-ph-${vapiCallId}`;
  let transcript = transcriptOf(message);
  if (!transcript.trim() && root && root !== message) {
    transcript = transcriptOf(root);
  }
  let fetchedCall: Record<string, unknown> | null = null;
  if (!transcript.trim() && vapiCallId) {
    fetchedCall = await fetchVapiCall(vapiCallId);
    if (fetchedCall) {
      transcript = transcriptOf(fetchedCall);
    }
  }

  const { error: callError } = await supabase.from("calls").upsert({
    id: callId,
    source: "phone",
    started_at: started.toISOString(),
    duration_s: durationOf(message, started),
    out_of_hours: hours.out,
    weekday: hours.weekday,
    caller_initials: null,
    transcript,
    raw: stripSensitive(message),
  }, { onConflict: "id" });

  if (callError) {
    console.log(JSON.stringify({ event: "call_upsert_failed", call_id: callId, code: callError.code }));
    return json({ error: "insert failed" }, 500);
  }

  if (!transcript.trim() || !hasCallerSpeech(transcript)) {
    const saved = await insertRecord(supabase, callId, recordId, {
      type: "general",
      priority: "week",
      property: null,
      issue: "",
      callback_confirmed: false,
      safety_check: "n/a",
      summary: "Hung up at greeting",
      action: "No action",
      caller_initials: null,
      grok_reasoning: "Caller disconnected before speaking after the AI greeting.",
      evidence_quotes: [],
      draft_reply: null,
    }, started, { triage_source: "empty", grok_model: null, grok_latency_ms: null });
    if (!saved.ok) return json({ error: "insert failed" }, 500);
    return json({ ok: true, call_id: callId, record_id: recordId, triage_source: "empty" });
  }

  const grok = await triageWithGrok(supabase, callId, transcript);
  if (grok) {
    const saved = await insertRecord(supabase, callId, recordId, grok.structured, started, {
      triage_source: "grok",
      grok_model: grok.model,
      grok_latency_ms: grok.latencyMs,
    });
    if (!saved.ok) return json({ error: "insert failed" }, 500);
    return json({
      ok: true,
      call_id: callId,
      record_id: recordId,
      triage_source: "grok",
      grok_model: grok.model,
      grok_latency_ms: grok.latencyMs,
      evidence_count: grok.structured.evidence_quotes.length,
    });
  }

  const analysis =
    asRecord(message.analysis) ??
    asRecord(root?.analysis) ??
    asRecord(fetchedCall?.analysis);
  const vapiStructured = parseStructured(analysis?.structuredData ?? analysis?.structured_data, transcript);
  if (vapiStructured) {
    const saved = await insertRecord(supabase, callId, recordId, vapiStructured, started, {
      triage_source: "fallback",
      grok_model: null,
      grok_latency_ms: null,
    });
    if (!saved.ok) return json({ error: "insert failed" }, 500);
    return json({ ok: true, call_id: callId, record_id: recordId, triage_source: "fallback" });
  }

  const fallback = regexFallback(transcript);
  const saved = await insertRecord(supabase, callId, recordId, fallback, started, {
    triage_source: "fallback",
    grok_model: null,
    grok_latency_ms: null,
  });
  if (!saved.ok) return json({ error: "insert failed" }, 500);
  return json({ ok: true, call_id: callId, record_id: recordId, triage_source: "fallback" });
});
