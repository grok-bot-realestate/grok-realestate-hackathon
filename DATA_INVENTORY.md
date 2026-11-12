# Hackathon public dataset inventory

Filename / structure only. Datasets are gitignored under `data/` and on `wckd` at `/mnt/ai-vault/hackathon-data` (symlinked from `~/grok-realestate-hackathon/data`).

Updated: 2026-11-11 (after Mac Downloads import + Parallel key fix).

## Layout

| Local (Mac) | Remote (`wckd`) |
|-------------|-----------------|
| `/Users/lmalik/Documents/Hackathon/data/` | `/mnt/ai-vault/hackathon-data/` → `~/grok-realestate-hackathon/data` |

---

## 1. Ares Deal Documents & Brochures (`ares-deals/`) — COMPLETE

~4.6 MB, 27 files. PDFs + markdown page extracts from:

- Acuitus, Allsop Auctions, Auction House UK
- British Land Investors (PDFs + MD)
- HF CUAD / HF DocLayNet (MD extracts)
- Knight Frank Commercial, Landsec Results & Reports
- Savills Auctions / Savills Search
- SEC EDGAR offering-memorandum HTM→MD extracts
- SEGRO Investors (trading-update PDFs + MD)

---

## 2. Ares Legal & Lease Datasets (`ares-leases/`) — COMPLETE (merged)

### Zip shards (from earlier `gdown`)

| File | Size |
|------|------|
| `Legal-lease_datasets_p01.zip` | ~52 MB |
| `Legal-lease_datasets_p02.zip` | ~47 MB |
| `Legal-lease_datasets_p03.zip` | ~11 MB |
| `Legal-lease_datasets_p04.zip` | ~13 MB |

`p05–p08` zips were blocked by Drive for `gdown`; browser downloads were imported as extracted folders instead.

### Extracted merge (`ares-leases/extracted/Legal-lease datasets/`)

**4,044 files** / ~750 MB total under `ares-leases/` (zips + extracted). Imported from Mac Downloads folders `Legal-lease datasets` … `-7`.

| Folder | Contents (types) |
|--------|------------------|
| `Acuitus/` | Sale memorandum PDF |
| `Allsop_Auctions/` | Purchase agreement templates |
| `HF_CUAD/` | Large contract PDF/TXT corpus |
| `HF_DocLayNet/` | Layout/doc assets |
| `INSPIRE_Index_Polygons/` | Geo index assets |
| `Overture_Maps/` | Map-related assets |
| `Planning_Data/` | developer-agreement CSV/JSON |
| `SEC_full-text_offering_memorandum/` | HTM/TXT/XLSX OM packs |
| `SEGRO/` | SEGRO-related lease/docs |

---

## 3. Dwelly Agency Dataset (`dwelly-cases/`) — COMPLETE

Source archive: `Real Estate Agency Synthetic.tar` (~2.6 MB compressed; ~5 MB on disk).

### Structure

```
dwelly-cases/
  Real Estate Agency Synthetic.tar
  Real Estate Agency Synthetic/
    001/ … 050/          # 50 case folders (sponsor brief said ~49)
      index.md           # case summary (role, status, property, overview, outcome)
      history.md         # full event timeline
      attachments/       # optional PDFs (present on some cases; ~7 folders have attachments/)
```

### File mix

- ~100 markdown files (`index.md` + `history.md` per case)
- ~16 PDF attachments (quotes, inspection reports, etc.)

### Case schema (from `index.md`)

- Source role, status, created/updated/completed timestamps  
- Property address  
- Initial request / overview / outcome  
- Link to `history.md`  
- Optional attachments list  

Example case: `005` — Check-Out Cleaning (agency manager workflow with cleaning quotes + checkout report PDFs).

---

## API smoke test (2026-11-11)

| Key / service | Result |
|---------------|--------|
| `XAI_API_KEY` | 200 (`GET /v1/models`) |
| `PARALLEL_API_KEY` | 200 (`POST /v1beta/search`) — key corrected (`OdHms`) |
| `SUPABASE_URL` | 200 (`/auth/v1/health`) |
| `COGNEE_API_KEY` | 200 (`/health`) |

Still pending tomorrow: `V7_API_KEY`, Cortile / MSCI credentials if used.

---

## Compliance

`data/`, `datasets/`, `*msci*`, `*rca*`, `*cortile*`, spreadsheet/PDF patterns, `.env*`, and `.cursor/mcp.json` remain gitignored. Do not commit MSCI RCA or Cortile datasets.
