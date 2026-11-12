import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TYPES = ["maintenance", "viewing", "let", "arrears", "general"] as const;
const PRIORITIES = ["urgent", "today", "week"] as const;
const SAFETY = ["asked, clear", "asked, concern", "not asked", "n/a"] as const;

type CaseType = (typeof TYPES)[number];
type Priority = (typeof PRIORITIES)[number];
type Safety = (typeof SAFETY)[number];

type Structured = {
  type: CaseType;
  priority: Priority;
  property: string | null;
  issue: string;
  callback_confirmed: boolean;
  safety_check: Safety;
  summary: string;
  action: string;
};

const TRIAGE_SYSTEM = `You are a lettings property manager's assistant. Read the call transcript or case and return JSON only, no prose, matching this schema:
{type: "maintenance"|"viewing"|"let"|"arrears"|"general", priority: "urgent"|"today"|"week", property: string|null, issue: string, callback_confirmed: boolean, safety_check: "asked, clear"|"asked, concern"|"not asked"|"n/a", summary: string (one line, under 100 chars), action: string (one imperative sentence a property manager would do next), due: ISO timestamp}
Priority rules: no heat, no hot water, no power, no water, lock or door security, active leak, gas smell, arrears = urgent. Viewings and landlord enquiries = today. Everything else = week. Due: urgent = next working day 10:00; today = end of next working day; week = 5 working days. Never invent facts not in the transcript. If the caller hung up before giving anything, type general, priority week, summary "Hung up at greeting", action "No action".`;

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

function parseStructured(input: unknown): Structured | null {
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
  return {
    type,
    priority,
    property,
    issue,
    callback_confirmed: callback,
    safety_check: safety,
    summary: o.summary.trim().slice(0, 100),
    action: o.action.trim(),
  };
}

function transcriptOf(message: Record<string, unknown>): string {
  if (typeof message.transcript === "string" && message.transcript.trim()) return message.transcript;
  const artifact = asRecord(message.artifact);
  if (artifact && typeof artifact.transcript === "string") return artifact.transcript;
  return "";
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
): Promise<{ ok: boolean; created: boolean }> {
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
  });
  if (recordError) {
    if (recordError.code === "23505") return { ok: true, created: false };
    console.log(JSON.stringify({ event: "record_insert_failed", call_id: callId, code: recordError.code }));
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

async function triageInline(
  supabase: ReturnType<typeof createClient>,
  callId: string,
  transcript: string,
): Promise<Structured | null> {
  const key = await runtimeSecret(supabase, "LLM_API_KEY") || await runtimeSecret(supabase, "XAI_API_KEY");
  if (!key) {
    console.log(JSON.stringify({ event: "llm_skipped", call_id: callId, reason: "no_key" }));
    return null;
  }
  const base = ((await runtimeSecret(supabase, "LLM_BASE_URL")) || "https://api.x.ai/v1").replace(/\/$/, "");
  const model = (await runtimeSecret(supabase, "LLM_MODEL")) || "grok-4-fast";
  const started = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
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
        { role: "user", content: transcript || "(empty transcript)" },
      ],
    }),
  });
  const latency = Date.now() - started;
  const payload = await res.json().catch(() => null);
  const usage = asRecord(asRecord(payload)?.usage);
  console.log(JSON.stringify({
    event: "llm",
    call_id: callId,
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
  try {
    return parseStructured(JSON.parse(content));
  } catch {
    return null;
  }
}

async function triageFunction(callId: string): Promise<"ok" | "missing" | "failed"> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return "missing";
  const res = await fetch(`${base}/functions/v1/triage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ call_id: callId }),
  });
  if (res.status === 404) return "missing";
  return res.ok ? "ok" : "failed";
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
  const transcript = transcriptOf(message);

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

  const analysis = asRecord(message.analysis);
  const structured = parseStructured(analysis?.structuredData ?? analysis?.structured_data);
  if (structured) {
    const saved = await insertRecord(supabase, callId, recordId, structured, started);
    if (!saved.ok) return json({ error: "insert failed" }, 500);
    return json({ ok: true, call_id: callId, record_id: recordId, source: "structured" });
  }

  if (!transcript.trim()) {
    const saved = await insertRecord(supabase, callId, recordId, {
      type: "general",
      priority: "week",
      property: null,
      issue: "",
      callback_confirmed: false,
      safety_check: "n/a",
      summary: "Hung up at greeting",
      action: "No action",
    }, started);
    if (!saved.ok) return json({ error: "insert failed" }, 500);
    return json({ ok: true, call_id: callId, record_id: recordId, source: "empty" });
  }

  const delegated = await triageFunction(callId);
  if (delegated === "ok") {
    return json({ ok: true, call_id: callId, source: "triage" });
  }

  const inferred = await triageInline(supabase, callId, transcript);
  if (!inferred) {
    console.log(JSON.stringify({ event: "triage_failed", call_id: callId, delegated }));
    return json({ ok: true, call_id: callId, record: false });
  }
  const saved = await insertRecord(supabase, callId, recordId, inferred, started);
  if (!saved.ok) return json({ error: "insert failed" }, 500);
  return json({ ok: true, call_id: callId, record_id: recordId, source: "llm" });
});
