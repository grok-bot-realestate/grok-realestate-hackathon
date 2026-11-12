import { useState } from 'react'
import type { DemoScriptId } from '../types'

type DemoScript = {
  id: DemoScriptId
  tag: string
  urgency: 'urgent' | 'today' | 'week'
  title: string
  property: string
  script: string
  expect: string
}

const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: 'boiler',
    tag: 'Maintenance · Urgent',
    urgency: 'urgent',
    title: 'Boiler & active leak at Flat 3 Chatsworth Rd',
    property: 'Flat 3, 14 Chatsworth Road, E5',
    script:
      'Hi, my boiler has stopped working and water is dripping onto the hallway carpet at Flat 3, 14 Chatsworth Road. My name is Priya Patel — P-A-T-E-L — and my number is 07700 900 412. No gas smell, and the water is away from the sockets.',
    expect: 'AI checks gas/electrics safety, reads back digits, logs Urgent.',
  },
  {
    id: 'viewing',
    tag: 'Viewing · Today',
    urgency: 'today',
    title: '2-bed flat viewing request on Mare Street',
    property: '42 Mare Street, Hackney E8',
    script:
      'Hello, I saw the two-bedroom flat at 42 Mare Street online and I would love to book a viewing tomorrow afternoon. My name is Oliver Bennett — B-E-N-N-E-T-T — callback 07700 900 885.',
    expect: 'AI spells surname, confirms callback digits, logs Today viewing.',
  },
  {
    id: 'arrears',
    tag: 'Arrears · Urgent',
    urgency: 'urgent',
    title: 'Direct debit bounce & rent timing query',
    property: '18 Victoria Park Road, E9',
    script:
      'Hi, my bank rejected this month’s standing order for 18 Victoria Park Road and I want to pay the rent manually in the morning. Name is Samira Khan — K-H-A-N — callback 07700 900 209.',
    expect: 'AI logs arrears urgency, confirms callback, avoids quoting terms.',
  },
]

type Props = {
  open: boolean
  onClose: () => void
  onStartCall: () => void
  onSimulateCall: (scriptId: DemoScriptId) => void
  simulating: boolean
  callReady: boolean
  isCallActive: boolean
  onCopied: (label: string) => void
}

export default function DemoPromptsPopover({
  open,
  onClose,
  onStartCall,
  onSimulateCall,
  simulating,
  callReady,
  isCallActive,
  onCopied,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (!open) return null

  async function copyScript(item: DemoScript) {
    try {
      await navigator.clipboard.writeText(item.script)
      setCopiedId(item.id)
      onCopied(`Copied "${item.title}" script`)
      window.setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 2000)
    } catch {
      onCopied('Clipboard permission blocked')
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Demo caller scripts"
      className="rise-in mt-4 border border-[var(--line-strong)] bg-[var(--paper-strong)] p-4 backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--lane)] uppercase">
            Live Voice Test · Caller Scripts
          </p>
          <p className="mt-0.5 text-xs text-[var(--quiet)]">
            Say any of these aloud after clicking Call the line — or use Simulate call for an instant no-mic Grok triage run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCallActive && callReady && (
            <button
              type="button"
              onClick={() => {
                onStartCall()
              }}
              className="bg-[var(--lane)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--lane-deep)]"
            >
              Start call now
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--line-strong)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--quiet)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {DEMO_SCRIPTS.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between border border-[var(--line)] bg-white/75 p-3"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-[10px] font-medium tracking-[0.14em] uppercase ${
                    item.urgency === 'urgent' ? 'text-[var(--urgent)]' : 'text-[var(--amber)]'
                  }`}
                >
                  {item.tag}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={simulating || isCallActive}
                    onClick={() => onSimulateCall(item.id)}
                    className="font-mono text-[11px] font-medium text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-4 transition hover:text-[var(--lane)] disabled:cursor-not-allowed disabled:opacity-45"
                    title="Send this transcript straight through Grok triage into the Inbox"
                  >
                    {simulating ? 'Triaging…' : 'Simulate call'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyScript(item)}
                    className="font-mono text-[11px] text-[var(--lane)] transition hover:text-[var(--lane-deep)]"
                  >
                    {copiedId === item.id ? 'Copied' : 'Copy script'}
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-sm font-medium text-[var(--ink)]">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--ink)]/85">“{item.script}”</p>
            </div>
            <p className="mt-3 border-t border-[var(--line)] pt-2 font-mono text-[11px] text-[var(--quiet)]">
              {item.expect}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
