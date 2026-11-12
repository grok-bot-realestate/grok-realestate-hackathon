import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  dateTime,
  durationLabel,
  primaryAction,
  priorityLabel,
  receivedAt,
  sourceLabel,
  typeLabel,
} from '../lib/format'
import type { InboxRecord } from '../types'

type Props = {
  row: InboxRecord | null
  loading: boolean
  onBack: () => void
  onChanged: () => void
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-black/10 py-3">
      <dt className="text-xs tracking-wide text-[var(--muted)] uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--ink)]">{value}</dd>
    </div>
  )
}

function Transcript({ text }: { text: string }) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    <div id="transcript" className="space-y-3">
      {lines.map((line, index) => {
        const match = /^(Assistant|Caller):\s*/i.exec(line)
        const speaker = match?.[1]
        const body = match ? line.slice(match[0].length) : line
        return (
          <p key={`${index}-${line.slice(0, 24)}`} className="text-sm leading-6">
            {speaker && (
              <span className="mr-2 font-medium text-[var(--muted)]">{speaker} </span>
            )}
            <span className="text-[var(--ink)]">{body}</span>
          </p>
        )
      })}
    </div>
  )
}

export default function RecordScreen({ row, loading, onBack, onChanged }: Props) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const action = row ? primaryAction(row.actions) : null
  const transcript = row?.call?.transcript?.trim() ?? ''

  async function markDone() {
    if (!action || !supabase || action.done) return
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('actions').update({ done: true }).eq('id', action.id)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    onChanged()
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <button type="button" onClick={onBack} className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ← Inbox
        </button>
      </div>

      {!row && (
        <p className="mx-auto max-w-5xl px-4 text-sm text-[var(--muted)] sm:px-6">
          {loading ? 'Loading this record…' : 'This record is not in the inbox.'}
        </p>
      )}

      {row && (
        <>
          <section className="bg-[var(--ink)] text-white">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6">
              <div>
                <p className="text-lg font-semibold">
                  {action?.action ?? 'No action logged'}
                </p>
                <p className="mt-1 text-sm text-white/75">
                  {priorityLabel(row.priority)} · {typeLabel(row.type)} · {row.issue || 'No issue noted'}
                  {action?.due ? ` · due ${dateTime(action.due)}` : ''}
                </p>
              </div>
              {action && (
                <button
                  type="button"
                  onClick={() => void markDone()}
                  disabled={action.done || saving}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-60"
                >
                  {action.done ? 'Done' : saving ? 'Saving…' : 'Mark done'}
                </button>
              )}
            </div>
          </section>

          {saveError && (
            <p className="mx-auto max-w-5xl px-4 pt-4 text-sm text-[var(--accent)] sm:px-6">{saveError}</p>
          )}

          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-medium tracking-wide text-[var(--muted)] uppercase">Transcript</h2>
                {transcript && (
                  <a href="#transcript" className="text-sm text-[var(--accent)]">
                    Open transcript
                  </a>
                )}
              </div>
              {transcript ? (
                <Transcript text={transcript} />
              ) : (
                <p className="text-sm text-[var(--muted)]">No transcript on this call.</p>
              )}
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium tracking-wide text-[var(--muted)] uppercase">
                Record
              </h2>
              <dl>
                <Field label="Type" value={typeLabel(row.type)} />
                <Field label="Priority" value={priorityLabel(row.priority)} />
                <Field label="Property" value={row.property || 'Not given'} />
                <Field
                  label="Caller"
                  value={row.call?.caller_initials?.trim() || 'not recorded'}
                />
                <Field
                  label="Callback"
                  value={row.callback_confirmed ? 'confirmed' : 'not confirmed'}
                />
                <Field label="Issue" value={row.issue || 'Not given'} />
                <Field label="Safety check" value={row.safety_check || 'n/a'} />
                <Field label="Received" value={receivedAt(row.created_at, row.call)} />
              </dl>
            </section>
          </div>

          <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm text-[var(--muted)] sm:px-6">
            Source: call {row.call?.id ?? row.call_id ?? 'unknown'} ·{' '}
            {dateTime(row.call?.started_at ?? row.created_at)} · {durationLabel(row.call?.duration_s)} ·
            source {sourceLabel(row.call?.source)}
          </footer>
        </>
      )}
    </div>
  )
}
