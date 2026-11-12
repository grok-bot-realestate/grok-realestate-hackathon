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
          <p className="font-display text-5xl font-semibold tracking-tight text-[var(--ink)]">Line</p>
          <p className="mt-3 text-sm text-[var(--quiet)]">Morning Lane could not open the inbox.</p>
          <p className="mt-4 text-sm text-[var(--urgent)]">{this.state.error}</p>
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
      <p className="font-display text-5xl font-semibold tracking-tight text-[var(--ink)]">Line</p>
      <p className="mt-2 text-base text-[var(--quiet)]">Morning Lane branch</p>
      <p className="mt-6 text-sm leading-6 text-[var(--ink)]">
        This build is missing required environment variables, so the inbox cannot load.
      </p>
      {missing.length > 0 && (
        <p className="mt-3 font-mono text-xs text-[var(--urgent)]">{missing.join(', ')}</p>
      )}
      <p className="mt-4 text-sm text-[var(--quiet)]">
        Set the Vite keys in Vercel, then redeploy. Never ship a silent white screen.
      </p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>{supabaseConfigured ? <App /> : <MissingConfig />}</Boundary>
  </StrictMode>,
)
