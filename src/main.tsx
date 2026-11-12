import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
        <main className="mx-auto max-w-xl px-6 py-16">
          <h1 className="text-2xl font-semibold">Line Inbox</h1>
          <p className="mt-3 text-sm text-[var(--accent)]">{this.state.error}</p>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
)
