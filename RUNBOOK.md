# Grok Bot Real Estate Hackathon — prep runbook

Sanitized (no API keys). Stored on `wckd` for team kickoff.

## Hosts

- **Mac cockpit:** `/Users/lmalik/Documents/Hackathon`
- **GPU rig `wckd`:** `lucas@10.24.0.164` / `lucas@wckd.lan`
  - Project: `/home/lucas/grok-realestate-hackathon`
  - Data: `/mnt/ai-vault/hackathon-data` ← symlinked as `~/grok-realestate-hackathon/data`
  - Memory store: `/mnt/ai-vault/hackathon-memory/`
- SSH config Host `wckd` → User `lucas`, IdentityFile `~/.ssh/id_ed25519`

## Hardware (wckd)

- 2× RTX 5060 Ti 16GB, driver ~595 / CUDA 13.2
- ~834G free on `/`, ~1.4T free on `/mnt/ai-vault`
- Rootless Docker + nvidia-container-toolkit working (`docker run --gpus all …`)

## Toolchain

- Python **3.13** venv via `uv` at `.venv` (Mac + wckd)
- Packages: parallel-web, cognee, supabase, openai, pymupdf, pdfplumber, pandas, openpyxl, fastapi, uvicorn, httpx, python-dotenv, gdown, mem0ai
- Node 24 / npm / pnpm / uv / git on PATH for non-interactive SSH

## Secrets location

- `.env` on Mac and `wckd` (gitignored) — never commit
- `.cursor/mcp.json` has Cognee Cloud key (gitignored); use `.cursor/mcp.json.example` as template
- Keys present: XAI, Parallel, Supabase (URL/anon/service_role + PAT), Cognee Cloud
- Pending tomorrow 18:15: **V7_API_KEY** (also Cortile / MSCI RCA placeholders in `.env.example`)

## MCP (Cursor on Mac)

- Supabase → Real-Estate-Hack / EXL-1 (`btyldznsqoohztewbrpv`)
- Parallel → `https://mcp.parallel.ai/mcp` (+ API key in `.env`)
- Cognee Cloud → `uvx cognee-mcp@0.5.6` with tenant URL in mcp.json

## Public datasets (gitignored)

| Folder | Status |
|--------|--------|
| `data/ares-deals/` | Complete (~27 files) |
| `data/ares-leases/` | ~4044 extracted files + p01–p04 zips; includes Acuitus, Allsop, HF_CUAD, DocLayNet, INSPIRE, Overture, Planning_Data, SEC OM, SEGRO |
| `data/dwelly-cases/Real Estate Agency Synthetic/` | 50 cases (`001`–`050`), each `index.md` + `history.md`, some PDF attachments |

See `DATA_INVENTORY.md` for filenames/structure only.

## Compliance

- Do **not** commit MSCI RCA / Cortile datasets or keys
- `.gitignore` blocks `data/`, `datasets/`, `*msci*`, `*rca*`, `*cortile*`, PDFs/spreadsheets, `.env*`, `.cursor/mcp.json`

## Tomorrow flow

1. 18:15 — claim V7 (+ Cortile/MSCI if needed), paste into `.env`
2. 18:30 — form team, pick track (docs extraction + citations = strong fit)
3. Scaffold app then (not done yet by design)
4. Compute/GPU work on `wckd`; Cursor cockpit on Mac or Remote SSH into project

## Smoke tests last verified

- XAI `/v1/models` → 200
- Parallel `/v1beta/search` → 200
- Supabase `/auth/v1/health` → 200
- Cognee `/health` → 200
