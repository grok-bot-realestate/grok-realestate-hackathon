import { supabaseConfigured } from './lib/supabase'

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-medium tracking-[0.18em] text-[var(--accent)] uppercase">
        Track 4 · Line Inbox
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">
        Grok Real Estate Hackathon
      </h1>
      <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
        Vite + React + TypeScript + Tailwind, wired to Supabase. Live on Vercel —
        Line Inbox UI ships next.
      </p>
      <dl className="mt-10 grid gap-3 text-sm sm:grid-cols-2">
        <div className="border-t border-black/10 pt-3">
          <dt className="text-[var(--muted)]">Supabase client</dt>
          <dd className="mt-1 font-medium">
            {supabaseConfigured ? 'Configured' : 'Missing VITE_SUPABASE_* env'}
          </dd>
        </div>
        <div className="border-t border-black/10 pt-3">
          <dt className="text-[var(--muted)]">Stack</dt>
          <dd className="mt-1 font-medium">Vite · React 19 · Tailwind 4</dd>
        </div>
      </dl>
    </main>
  )
}
