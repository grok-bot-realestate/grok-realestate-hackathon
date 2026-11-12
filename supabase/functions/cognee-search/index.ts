import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DATASET_NAME = "morning_lane_dwelly";
const DATASET_ID = "abdfa5a4-14c1-531b-80ff-849bc90537e7";
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PrecedentResult = {
  id: string;
  case_id: string | null;
  title: string | null;
  property: string | null;
  status: string | null;
  outcome: string | null;
  excerpt: string;
  score: number | null;
  similarity: number | null;
  dataset: string;
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

async function runtimeSecret(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("line_runtime_secret", { secret_name: name });
  if (!error && typeof data === "string" && data.length > 0) return data;
  return Deno.env.get(name) ?? "";
}

function extractSection(text: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^##\\s+${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|\\n===\\s|$)`, "im");
  const match = text.match(re);
  if (!match) return null;
  const cleaned = match[1]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function cleanTextForExcerpt(text: string): string {
  return text
    .replace(/^===\s*DWELLY CASE\s+\d+\s*===\s*/im, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCogneeChunk(raw: Record<string, unknown>, dataset: string): PrecedentResult | null {
  const text = typeof raw.text === "string"
    ? raw.text
    : typeof raw.chunk === "string"
    ? raw.chunk
    : typeof raw.content === "string"
    ? raw.content
    : "";
  if (!text.trim()) return null;

  const caseBanner = text.match(/===\s*DWELLY CASE\s+(\d+)\s*===/i) ??
    text.match(/^#\s*Case\s+(\d+)\s*:/im);
  const caseNum = caseBanner?.[1] ? caseBanner[1].padStart(3, "0") : null;
  const caseId = caseNum ? `dwelly-${caseNum}` : null;

  const titleMatch = text.match(/^#\s*(Case\s+\d+:\s*.+)$/im);
  const title = titleMatch?.[1]?.trim() ?? (caseNum ? `Case ${caseNum}` : null);

  const propertyMatch = text.match(/^\-\s*\*\*Property:\*\*\s*(.+)$/im);
  const property = propertyMatch?.[1]?.trim() ?? null;

  const statusMatch = text.match(/^\-\s*\*\*Status:\*\*\s*(.+)$/im);
  const status = statusMatch?.[1]?.trim() ?? null;

  const overview = extractSection(text, "Overview");
  const outcome = extractSection(text, "Outcome");
  const initialRequest = extractSection(text, "Initial request");

  let excerptSource = "";
  if (overview && outcome) {
    excerptSource = `${overview} Outcome: ${outcome}`;
  } else if (overview) {
    excerptSource = overview;
  } else if (outcome) {
    excerptSource = outcome;
  } else if (initialRequest) {
    excerptSource = initialRequest;
  } else {
    excerptSource = cleanTextForExcerpt(text);
  }

  const excerpt = excerptSource.length > 320
    ? `${excerptSource.slice(0, 317).trimEnd()}...`
    : excerptSource;

  const rawScore = typeof raw.score === "number" && Number.isFinite(raw.score)
    ? Number(raw.score.toFixed(4))
    : null;
  const similarity = rawScore !== null && rawScore >= 0 && rawScore <= 1
    ? Number((1 - rawScore).toFixed(4))
    : null;

  const id = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : caseId ?? crypto.randomUUID();

  return {
    id,
    case_id: caseId,
    title,
    property,
    status,
    outcome: outcome ? (outcome.length > 220 ? `${outcome.slice(0, 217).trimEnd()}...` : outcome) : null,
    excerpt,
    score: rawScore,
    similarity,
    dataset,
  };
}

function extractRawItems(payload: unknown): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const rec = asRecord(entry);
      if (!rec) continue;
      if (Array.isArray(rec.search_result)) {
        for (const sub of rec.search_result) {
          const subRec = asRecord(sub);
          if (subRec) items.push(subRec);
        }
      } else {
        items.push(rec);
      }
    }
  } else {
    const rec = asRecord(payload);
    if (rec) {
      if (Array.isArray(rec.search_result)) {
        for (const sub of rec.search_result) {
          const subRec = asRecord(sub);
          if (subRec) items.push(subRec);
        }
      } else if (Array.isArray(rec.results)) {
        for (const sub of rec.results) {
          const subRec = asRecord(sub);
          if (subRec) items.push(subRec);
        }
      }
    }
  }
  return items;
}

async function queryCognee(
  baseUrl: string,
  apiKey: string,
  query: string,
  searchType: "CHUNKS" | "SUMMARIES",
  topK: number,
): Promise<{ ok: boolean; status: number; results: PrecedentResult[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // Cognee Cloud expects ONLY X-Api-Key (no Authorization: Bearer header).
    const res = await fetch(`${baseUrl}/api/v1/search`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        searchType,
        datasetIds: [DATASET_ID],
        top_k: topK,
      }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, results: [] };
    }

    const rawItems = extractRawItems(payload);
    const seenKeys = new Set<string>();
    const normalized: PrecedentResult[] = [];

    for (const item of rawItems) {
      const parsed = parseCogneeChunk(item, DATASET_NAME);
      if (!parsed) continue;
      const dedupeKey = parsed.case_id ??
        (typeof item.document_id === "string" ? item.document_id : parsed.id);
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      normalized.push(parsed);
    }

    return { ok: true, status: res.status, results: normalized };
  } finally {
    clearTimeout(timeout);
  }
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

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const rawLimit = typeof body.limit === "number"
    ? body.limit
    : typeof body.limit === "string"
    ? Number(body.limit)
    : DEFAULT_LIMIT;
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.round(rawLimit)))
    : DEFAULT_LIMIT;

  let query = typeof body.query === "string" ? body.query.trim() : "";
  const recordId = typeof body.record_id === "string" ? body.record_id.trim() : "";

  if (!query && recordId) {
    const { data: rec, error: recErr } = await supabase
      .from("records")
      .select("id, type, property, issue, summary")
      .eq("id", recordId)
      .maybeSingle();

    if (recErr) {
      return json({ ok: false, error: "Database read failed" }, 500);
    }
    if (!rec) {
      return json({ ok: false, error: "Record not found" }, 404);
    }

    const parts = [
      typeof rec.type === "string" ? rec.type.trim() : "",
      typeof rec.issue === "string" && rec.issue.trim()
        ? rec.issue.trim()
        : typeof rec.summary === "string"
        ? rec.summary.trim()
        : "",
      typeof rec.property === "string" ? rec.property.trim() : "",
    ].filter((part) => part.length > 0);

    query = parts.join(" — ").slice(0, 400);
  }

  if (!query) {
    return json({ ok: false, error: "Provide query or record_id" }, 400);
  }

  const [baseUrlRaw, apiKey] = await Promise.all([
    runtimeSecret(supabase, "COGNEE_BASE_URL"),
    runtimeSecret(supabase, "COGNEE_API_KEY"),
  ]);
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");

  if (!baseUrl || !apiKey) {
    return json({ ok: false, error: "Cognee credentials not configured" }, 500);
  }

  const t0 = Date.now();
  const fetchTopK = Math.min(limit * 2, 10);

  try {
    let searchRes = await queryCognee(baseUrl, apiKey, query, "CHUNKS", fetchTopK);
    let searchTypeUsed: "CHUNKS" | "SUMMARIES" = "CHUNKS";

    if ((!searchRes.ok || searchRes.results.length === 0)) {
      const fallbackRes = await queryCognee(baseUrl, apiKey, query, "SUMMARIES", fetchTopK);
      if (fallbackRes.ok && fallbackRes.results.length > 0) {
        searchRes = fallbackRes;
        searchTypeUsed = "SUMMARIES";
      }
    }

    const latencyMs = Date.now() - t0;

    if (!searchRes.ok) {
      console.log(JSON.stringify({
        event: "cognee_search_error",
        record_id: recordId || null,
        status: searchRes.status,
        latency_ms: latencyMs,
      }));
      return json({
        ok: false,
        error: "Cognee search request failed",
        status: searchRes.status,
      }, 502);
    }

    const results = searchRes.results.slice(0, limit);

    console.log(JSON.stringify({
      event: "cognee_search",
      dataset: DATASET_NAME,
      search_type: searchTypeUsed,
      record_id: recordId || null,
      result_count: results.length,
      latency_ms: latencyMs,
    }));

    return json({
      ok: true,
      dataset: DATASET_NAME,
      query,
      results,
      latency_ms: latencyMs,
    });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    console.log(JSON.stringify({
      event: "cognee_search_exception",
      record_id: recordId || null,
      latency_ms: latencyMs,
      error: err instanceof Error ? err.message : String(err),
    }));
    return json({
      ok: false,
      error: "Cognee search failed",
      detail: err instanceof Error ? err.message : String(err),
    }, 502);
  }
});
