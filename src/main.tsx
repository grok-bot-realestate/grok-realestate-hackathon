import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { supabaseConfigured } from './lib/supabase'

type BoundaryState = { error: string | null }

class Boundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    const message = error instanceof Error ? error.message : 'The inbox failed to load.'
    return { error: message }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-3xl font-bold tracking-tight text-slate-900">Line</p>
            <p className="mt-2 text-sm text-slate-600">Morning Lane could not open the inbox.</p>
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {this.state.error}
            </p>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

function MissingConfig() {
  const missing = [
    !import.meta.env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
    !import.meta.env.VITE_SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean)

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <p className="text-3xl font-bold tracking-tight text-slate-900">Line</p>
        <p className="mt-1 text-sm text-slate-500">Morning Lane · Hackney E8</p>
        <p className="mt-5 text-sm leading-6 text-slate-800">
          This build is missing required environment variables, so the inbox cannot load.
        </p>
        {missing.length > 0 && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700">
            {missing.join(', ')}
          </p>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Set the Vite keys in Vercel, then redeploy.
        </p>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>{supabaseConfigured ? <App /> : <MissingConfig />}</Boundary>
  </StrictMode>,
)
