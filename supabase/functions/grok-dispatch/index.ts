import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODES = ["contractor", "caller", "handover"] as const;
type DispatchMode = (typeof MODES)[number];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeWs(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function verifyQuotes(raw: unknown, transcript: string): Array<{ field: string; quote: string }> {
  if (!Array.isArray(raw) || !transcript.trim()) return [];
  const norm = normalizeWs(transcript);
  const out: Array<{ field: string; quote: string }> = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const field = typeof r.field === "string" ? r.field.trim() : "evidence";
    const quote = typeof r.quote === "string" ? r.quote.trim() : "";
    if (!quote || quote.length < 4) continue;
    if (norm.includes(normalizeWs(quote))) {
      out.push({ field, quote: quote.slice(0, 220) });
    }
    if (out.length >= 4) break;
  }
  return out;
}

async function runtimeSecret(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("line_runtime_secret", { secret_name: name });
  if (!error && typeof data === "string" && data.length > 0) return data;
  return Deno.env.get(name) ?? "";
}

const SYSTEM_PROMPT = `You are Grok, the Morning Lane UK lettings operations copilot.
Given a call record, transcript, and dispatch mode ("contractor", "caller", or "handover"), return JSON only matching this schema:
{
  "subject": string (concise subject line under 80 chars),
  "recipient_role": string (e.g. "Gas Safe Heating Engineer", "Tenant / Caller", "Morning Lane Branch Manager & Landlord"),
  "message": string (ready-to-send UK English message/work-order/update, strictly grounded in the transcript; refer to the caller by initials only and never include full names, phone numbers, invented prices, or unconfirmed appointment slots),
  "checklist": string[] (2-4 concrete operational checks before sending or attending),
  "evidence_quotes": [{"field": string, "quote": string}] (1-3 exact verbatim substrings copied word-for-word from the transcript)
}

Mode guidance:
- "contractor": Crisp work-order dispatch for the appropriate UK trade (Gas Safe engineer, emergency plumber, locksmith, appliance engineer) noting access/safety status and asking for ETA + quote approval if over threshold.
- "caller": Polite, reassuring UK English callback script / SMS confirming Morning Lane has logged the issue, next step, and callback expectation without promising unconfirmed times.
- "handover": Structured morning shift handover / landlord update summarizing urgency, safety check, property, caller status, and recommended approval/action.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server misconfigured" }, 500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const modeRaw = typeof body.mode === "string" ? body.mode.trim() : "contractor";
  const mode: DispatchMode = (MODES as readonly string[]).includes(modeRaw)
    ? (modeRaw as DispatchMode)
    : "contractor";
  const recordId = typeof body.record_id === "string" ? body.record_id.trim() : "";
  const customInstruction = typeof body.custom_instruction === "string"
    ? body.custom_instruction.trim().slice(0, 300)
    : "";
  const saveDraft = body.save !== false;

  let recordData: Record<string, unknown> | null = null;
  let callData: Record<string, unknown> | null = null;
  let actionsData: Array<Record<string, unknown>> = [];

  if (recordId) {
    const { data: rec, error: recErr } = await supabase
      .from("records")
      .select("id, call_id, type, priority, property, issue, callback_confirmed, safety_check, summary, grok_reasoning")
      .eq("id", recordId)
      .maybeSingle();

    if (recErr) return json({ error: "Database read failed" }, 500);
    if (!rec) return json({ error: "Record not found" }, 404);
    recordData = rec as Record<string, unknown>;

    const [callRes, actionsRes] = await Promise.all([
      rec.call_id
        ? supabase
            .from("calls")
            .select("id, source, started_at, out_of_hours, weekday, caller_initials, transcript")
            .eq("id", rec.call_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("actions")
        .select("id, action, due, done")
        .eq("record_id", recordId),
    ]);
    callData = (callRes.data as Record<string, unknown> | null) ?? null;
    actionsData = (actionsRes.data as Array<Record<string, unknown>> | null) ?? [];
  }

  const transcript = typeof callData?.transcript === "string"
    ? callData.transcript
    : typeof body.transcript === "string"
    ? body.transcript
    : "";

  if (!recordData && !transcript.trim()) {
    return json({ error: "Provide record_id or transcript" }, 400);
  }

  const xaiKey = await runtimeSecret(supabase, "XAI_API_KEY") || await runtimeSecret(supabase, "LLM_API_KEY");
  if (!xaiKey) return json({ error: "XAI_API_KEY not configured" }, 500);

  const base = ((await runtimeSecret(supabase, "LLM_BASE_URL")) || "https://api.x.ai/v1").replace(/\/$/, "");
  const model = (await runtimeSecret(supabase, "LLM_MODEL")) || "grok-4.20-0309-non-reasoning";

  const userPayload = {
    mode,
    custom_instruction: customInstruction || null,
    record: recordData ?? {
      type: body.type ?? "general",
      priority: body.priority ?? "today",
      property: body.property ?? null,
      issue: body.issue ?? "",
    },
    call: callData
      ? {
          source: callData.source,
          started_at: callData.started_at,
          out_of_hours: callData.out_of_hours,
          weekday: callData.weekday,
          caller_initials: callData.caller_initials,
        }
      : null,
    actions: actionsData,
    transcript: transcript || "(no transcript available)",
  };

  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${xaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });
    const latencyMs = Date.now() - t0;
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      return json({ error: "xAI Grok request failed", status: res.status }, 502);
    }

    const choices = asRecord(payload)?.choices;
    const first = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const content = asRecord(first?.message)?.content;
    if (typeof content !== "string") {
      return json({ error: "Invalid Grok response" }, 502);
    }

    const parsed = asRecord(JSON.parse(content));
    if (!parsed || typeof parsed.message !== "string") {
      return json({ error: "Malformed Grok JSON" }, 502);
    }

    const resolvedModel = typeof asRecord(payload)?.model === "string" ? String(asRecord(payload)?.model) : model;
    const usage = asRecord(asRecord(payload)?.usage);
    const evidenceQuotes = verifyQuotes(parsed.evidence_quotes, transcript);
    const checklist = Array.isArray(parsed.checklist)
      ? parsed.checklist.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 5)
      : [];

    const result = {
      ok: true,
      record_id: recordId || null,
      mode,
      subject: typeof parsed.subject === "string" ? parsed.subject.trim() : "Morning Lane dispatch",
      recipient_role: typeof parsed.recipient_role === "string" ? parsed.recipient_role.trim() : mode,
      message: parsed.message.trim(),
      checklist,
      evidence_quotes: evidenceQuotes,
      model: resolvedModel,
      latency_ms: latencyMs,
      tokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
      triage_source: "grok",
    };

    if (recordId && saveDraft) {
      await supabase
        .from("records")
        .update({ draft_reply: result.message.slice(0, 600) })
        .eq("id", recordId);
    }

    console.log(JSON.stringify({
      event: "grok_dispatch",
      record_id: recordId || null,
      mode,
      model: resolvedModel,
      latency_ms: latencyMs,
      tokens: result.tokens,
    }));

    return json(result);
  } catch (err) {
    return json({
      error: "Grok dispatch failed",
      detail: err instanceof Error ? err.message : String(err),
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
