# Grok Real Estate Hackathon

Track 4 Line Inbox — Vite + React + TypeScript + Tailwind + Supabase.

## Local

```bash
cp .env.example .env   # fill keys
npm install
npm run dev
```

## Deploy (Vercel)

```bash
npx vercel          # preview
npx vercel --prod   # production
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project env (same values as `SUPABASE_URL` / `SUPABASE_ANON_KEY`).
