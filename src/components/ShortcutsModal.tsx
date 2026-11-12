type Props = {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { keys: ['j', '↓'], desc: 'Select next record in queue' },
  { keys: ['k', '↑'], desc: 'Select previous record in queue' },
  { keys: ['/'], desc: 'Focus instant inbox search' },
  { keys: ['d'], desc: 'Mark primary action done / reopen' },
  { keys: ['m'], desc: 'Mute or unmute microphone during a call' },
  { keys: ['Esc'], desc: 'Clear search, close dialog, or return to inbox' },
]

export default function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="rise-in w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 pb-3.5">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-wider text-sky-600 uppercase">
              Morning Lane Workbench
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
          >
            Esc
          </button>
        </div>

        <ul className="mt-3 divide-y divide-slate-100">
          {SHORTCUTS.map((item) => (
            <li key={item.desc} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-slate-700">{item.desc}</span>
              <span className="flex shrink-0 items-center gap-1">
                {item.keys.map((key) => (
                  <kbd key={key} className="kbd-cap">
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
