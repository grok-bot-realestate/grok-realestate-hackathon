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
      className="rise-in rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-elevated)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-wider text-sky-600 uppercase">
            Live Voice Test · Caller Scripts
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Read any script aloud after clicking Call the line — or click Simulate call for an instant no-mic Grok triage run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCallActive && callReady && (
            <button
              type="button"
              onClick={() => onStartCall()}
              className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Start call now
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3.5 md:grid-cols-3">
        {DEMO_SCRIPTS.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300 hover:bg-white"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10.5px] font-semibold ${
                    item.urgency === 'urgent'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {item.tag}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={simulating || isCallActive}
                    onClick={() => onSimulateCall(item.id)}
                    className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    title="Send this transcript straight through Grok triage into the Inbox"
                  >
                    {simulating ? 'Triaging…' : 'Simulate call'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyScript(item)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    {copiedId === item.id ? 'Copied' : 'Copy script'}
                  </button>
                </div>
              </div>
              <p className="mt-2.5 text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">“{item.script}”</p>
            </div>
            <p className="mt-3 border-t border-slate-200/80 pt-2.5 font-mono text-[11px] text-slate-500">
              {item.expect}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
