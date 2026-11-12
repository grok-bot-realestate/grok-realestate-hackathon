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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/28 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="rise-in w-full max-w-md border border-[var(--line-strong)] bg-[#f4f8f5] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-3">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--lane)] uppercase">
              Morning Lane Workbench
            </p>
            <h2 className="font-display mt-1 text-2xl font-semibold text-[var(--ink)]">
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--line-strong)] px-2.5 py-1 font-mono text-xs text-[var(--quiet)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Esc
          </button>
        </div>

        <ul className="mt-3 divide-y divide-[var(--line)]">
          {SHORTCUTS.map((item) => (
            <li key={item.desc} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-[var(--ink)]">{item.desc}</span>
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
