import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DemoScriptId = "boiler" | "viewing" | "arrears";

const DEMO_SCENARIOS: Record<
  DemoScriptId,
  { durationSeconds: number; transcript: string }
> = {
  boiler: {
    durationSeconds: 42,
    transcript: [
      "AI: Hello, you've reached the Morning Lane property line. How can I help today?",
      "Caller: Hi, my boiler has stopped working and water is dripping onto the hallway carpet at Flat 3, 14 Chatsworth Road. My name is Priya Patel — P-A-T-E-L — and my number is 07700 900 412.",
      "AI: I'm sorry to hear that. Just to check safety first, can you smell any gas, and is the water clear of any electrics or plug sockets?",
      "Caller: No gas smell, and the water is away from the sockets.",
      "AI: Thank you for confirming. Let me read your callback number back to you: 0-7-7-0-0, 9-0-0, 4-1-2. Is that right?",
      "Caller: Yes, that's right. Please send someone out as soon as you can.",
      "AI: All logged as urgent for our Morning Lane team. Someone will be back in touch shortly.",
    ].join("\n"),
  },
  viewing: {
    durationSeconds: 36,
    transcript: [
      "AI: Hello, you've reached the Morning Lane property line. How can I help today?",
      "Caller: Hello, I saw the two-bedroom flat at 42 Mare Street online and I would love to book a viewing tomorrow afternoon.",
      "AI: Of course, I can pass that over to our lettings team. Could I take your name, with your surname spelled out, and your best callback number?",
      "Caller: My name is Oliver Bennett — B-E-N-N-E-T-T — callback 07700 900 885.",
      "AI: Thanks, Oliver. Let me read that back: 0-7-7-0-0, 9-0-0, 8-8-5. Is that correct?",
      "Caller: Yes, spot on. Thank you!",
      "AI: Perfect, I've logged your viewing request for 42 Mare Street and our team will call you back to confirm a slot.",
    ].join("\n"),
  },
  arrears: {
    durationSeconds: 38,
    transcript: [
      "AI: Hello, you've reached the Morning Lane property line. How can I help today?",
      "Caller: Hi, my bank rejected this month’s standing order for 18 Victoria Park Road and I want to pay the rent manually in the morning.",
      "AI: Thanks for letting us know straight away. Could I take your name and callback number so our accounts and property team can contact you first thing?",
      "Caller: Name is Samira Khan — K-H-A-N — callback 07700 900 209.",
      "AI: Thank you, Samira. Reading that back: 0-7-7-0-0, 9-0-0, 2-0-9. Is that right?",
      "Caller: Yes, that's right. Thanks for picking up.",
      "AI: Logged for urgent morning follow-up — the team will call you back shortly.",
    ].join("\n"),
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function runtimeSecret(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("line_runtime_secret", { secret_name: name });
  if (!error && typeof data === "string" && data.length > 0) return data;
  return Deno.env.get(name) ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const vapiSecret = await runtimeSecret(supabase, "VAPI_WEBHOOK_SECRET");
  if (!vapiSecret) {
    return json({ ok: false, error: "Webhook secret not configured" }, 500);
  }

  const mode = typeof body.mode === "string" ? body.mode.trim() : "demo";

  let targetCallId: string;
  let startedAt: Date;
  let endedAt: Date;
  let durationSeconds: number;
  let transcript: string;
  let assistantId: string | undefined;
  let isSimulated = true;
  let scriptId: DemoScriptId = "boiler";

  if (mode === "live_fallback") {
    const rawCallId = typeof body.call_id === "string" ? body.call_id.trim() : "";
    const rawTranscript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!rawCallId && !rawTranscript) {
      return json({ ok: false, error: "Missing call_id and transcript" }, 400);
    }

    targetCallId = rawCallId || `live-${crypto.randomUUID().slice(0, 8)}`;
    const dbCallId = `ph-${targetCallId}`;
    const dbRecordId = `r-ph-${targetCallId}`;

    // Skip if Vapi's own end-of-call-report webhook already persisted this call
    const { data: existingRec } = await supabase
      .from("records")
      .select("id, call_id, triage_source")
      .eq("id", dbRecordId)
      .maybeSingle();
    if (existingRec) {
      return json({
        ok: true,
        already_exists: true,
        call_id: dbCallId,
        record_id: dbRecordId,
        triage_source: existingRec.triage_source ?? "grok",
      });
    }

    endedAt = typeof body.ended_at === "string" && !Number.isNaN(Date.parse(body.ended_at))
      ? new Date(body.ended_at)
      : new Date();
    durationSeconds = typeof body.duration_seconds === "number" && Number.isFinite(body.duration_seconds)
      ? Math.max(0, Math.round(body.duration_seconds))
      : 0;
    startedAt = typeof body.started_at === "string" && !Number.isNaN(Date.parse(body.started_at))
      ? new Date(body.started_at)
      : new Date(endedAt.getTime() - durationSeconds * 1000);
    transcript = rawTranscript;
    assistantId = typeof body.assistant_id === "string" && body.assistant_id.trim()
      ? body.assistant_id.trim()
      : undefined;
    isSimulated = false;
  } else {
    const rawId = typeof body.script_id === "string" ? body.script_id.trim() : "boiler";
    scriptId = rawId === "viewing" || rawId === "arrears" ? rawId : "boiler";
    const scenario = DEMO_SCENARIOS[scriptId];

    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    targetCallId = `demo-${scriptId}-${uniqueSuffix}`;
    endedAt = new Date();
    startedAt = new Date(endedAt.getTime() - scenario.durationSeconds * 1000);
    durationSeconds = scenario.durationSeconds;
    transcript = scenario.transcript;
  }

  const vapiPayload = {
    message: {
      type: "end-of-call-report",
      call: {
        id: targetCallId,
        ...(assistantId ? { assistantId } : {}),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      },
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSeconds,
      transcript,
      artifact: {
        transcript,
      },
      endedReason: "customer-ended-call",
      ...(isSimulated ? { simulated: true, script_id: scriptId } : { client_fallback: true }),
    },
  };

  const targetUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/call-ended`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-vapi-secret": vapiSecret,
      },
      body: JSON.stringify(vapiPayload),
    });

    const result = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok || !result?.ok) {
      return json(
        {
          ok: false,
          error: typeof result?.error === "string" ? result.error : "Demo triage failed",
          status: res.status,
        },
        502,
      );
    }

    console.log(
      JSON.stringify({
        event: isSimulated ? "demo_call_triaged" : "live_call_fallback_triaged",
        script_id: isSimulated ? scriptId : null,
        call_id: result.call_id ?? null,
        record_id: result.record_id ?? null,
        triage_source: result.triage_source ?? null,
      }),
    );

    return json({
      ok: true,
      mode,
      ...(isSimulated ? { script_id: scriptId } : {}),
      call_id: result.call_id,
      record_id: result.record_id,
      triage_source: result.triage_source ?? "grok",
      grok_model: result.grok_model ?? null,
      grok_latency_ms: result.grok_latency_ms ?? null,
      evidence_count: result.evidence_count ?? null,
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: "Demo call dispatch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
});
