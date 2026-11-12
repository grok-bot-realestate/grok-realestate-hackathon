import type {
  ActionRow,
  CallRow,
  DispatchMode,
  InboxFilter,
  InboxRecord,
  Priority,
  TranscriptTurn,
} from '../types'

const london = 'Europe/London'

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    maintenance: 'Maintenance',
    viewing: 'Viewing',
    let: 'Let',
    arrears: 'Arrears',
    general: 'General',
  }
  return labels[type] ?? type
}

export function priorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    urgent: 'Urgent',
    today: 'Today',
    week: 'This week',
  }
  return labels[priority] ?? priority
}

export function priorityRank(priority: string): number {
  if (priority === 'urgent') return 0
  if (priority === 'today') return 1
  return 2
}

export function sourceLabel(source: string | undefined): string {
  const labels: Record<string, string> = {
    phone: 'phone',
    dwelly: 'dwelly',
    synthetic: 'synthetic',
  }
  if (!source) return 'unknown'
  return labels[source] ?? source
}

export function rowWhen(iso: string): { time: string; when: string } {
  const date = new Date(iso)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: london,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  const dayKey = new Intl.DateTimeFormat('en-GB', {
    timeZone: london,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const when =
    dayKey.format(date) === dayKey.format(new Date())
      ? 'today'
      : new Intl.DateTimeFormat('en-GB', { timeZone: london, weekday: 'short' }).format(date)
  return { time, when }
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: london,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: london,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

export function durationLabel(seconds: number | null | undefined): string {
  if (seconds == null) return 'length unknown'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes <= 0) return `${rest}s`
  return `${minutes}m ${rest}s`
}

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function hoursMarker(call: CallRow | null): string | null {
  if (!call) return null
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: london,
    weekday: 'long',
  })
    .format(new Date(call.started_at))
    .toLowerCase()
  if (weekday === 'saturday') return 'Saturday'
  if (weekday === 'sunday') return 'Sunday'
  if (call.out_of_hours) return 'after hours'
  return null
}

export function primaryAction(actions: ActionRow[]): ActionRow | null {
  if (actions.length === 0) return null
  const open = actions.filter((action) => !action.done)
  const pool = open.length > 0 ? open : actions
  return [...pool].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
}

export function isRecordDone(record: InboxRecord): boolean {
  if (record.actions.length === 0) return false
  return record.actions.every((action) => action.done)
}

export function matchesFilter(row: InboxRecord, filter: InboxFilter): boolean {
  if (filter === 'ooh') return Boolean(row.call?.out_of_hours)
  if (filter === 'urgent') return row.priority === 'urgent'
  if (filter === 'open') return !isRecordDone(row)
  if (filter === 'done') return isRecordDone(row)
  if (filter === 'maintenance') return row.type === 'maintenance'
  if (filter === 'viewing') return row.type === 'viewing'
  if (filter === 'dwelly') return row.call?.source === 'dwelly'
  if (filter === 'phone') return row.call?.source === 'phone'
  return true
}

export function matchesSearch(row: InboxRecord, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    row.summary,
    row.property ?? '',
    row.issue ?? '',
    row.type,
    row.priority,
    row.call?.caller_initials ?? '',
    row.call?.transcript ?? '',
    ...row.actions.map((a) => a.action),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export function receivedAt(recordCreated: string, call: CallRow | null): string {
  return dateTime(call?.started_at ?? recordCreated)
}

export function parseTranscript(text: string): TranscriptTurn[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const turns: TranscriptTurn[] = []
  const speakerPattern =
    /^(AI|Assistant|Bot|Agent|Morning Lane|Caller|User|Tenant|Customer)\s*:\s*/i

  for (const line of lines) {
    const match = speakerPattern.exec(line)
    if (match) {
      const rawSpeaker = match[1].toLowerCase()
      const body = line.slice(match[0].length).trim()
      const isAssistant =
        rawSpeaker === 'ai' ||
        rawSpeaker === 'assistant' ||
        rawSpeaker === 'bot' ||
        rawSpeaker === 'agent' ||
        rawSpeaker === 'morning lane'
      const speaker: TranscriptTurn['speaker'] = isAssistant ? 'assistant' : 'caller'
      const label = isAssistant ? 'Morning Lane' : 'Caller'
      const prev = turns[turns.length - 1]
      if (prev && prev.speaker === speaker) {
        prev.text = `${prev.text}\n${body}`
      } else {
        turns.push({ speaker, label, text: body })
      }
    } else {
      const prev = turns[turns.length - 1]
      if (prev && prev.speaker !== 'note') {
        prev.text = `${prev.text}\n${line}`
      } else if (prev && prev.speaker === 'note') {
        prev.text = `${prev.text}\n${line}`
      } else {
        turns.push({ speaker: 'note', label: 'Case note', text: line })
      }
    }
  }

  return turns
}

export function extractCallbackPhone(text: string | null | undefined): string | null {
  if (!text) return null
  const ukMatch = text.match(/(?:\+44\s?|0)(?:\d[\s-]?){9,10}/)
  if (!ukMatch) return null
  return ukMatch[0].replace(/\s+/g, ' ').trim()
}

export function defaultDueForPriority(priority: Priority): string {
  const now = new Date()
  if (priority === 'urgent') {
    const next = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    return next.toISOString()
  }
  if (priority === 'today') {
    const next = new Date(now)
    next.setHours(18, 0, 0, 0)
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1)
    }
    return next.toISOString()
  }
  const next = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
  next.setHours(18, 0, 0, 0)
  return next.toISOString()
}

export function evidenceFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    priority: 'Priority',
    property: 'Property',
    issue: 'Issue',
    safety_check: 'Safety check',
    callback_confirmed: 'Callback',
    action: 'Action',
    evidence: 'Evidence',
  }
  return labels[field] ?? field.replace(/_/g, ' ')
}

export function normalizeWhitespace(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function findMatchingTurnIndex(turns: TranscriptTurn[], quote: string): number {
  const normQuote = normalizeWhitespace(quote)
  if (!normQuote) return -1
  const exactIdx = turns.findIndex((turn) => normalizeWhitespace(turn.text).includes(normQuote))
  if (exactIdx !== -1) return exactIdx

  // Fallback: match without punctuation differences
  const stripPunct = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const cleanQuote = stripPunct(quote)
  if (!cleanQuote) return -1
  return turns.findIndex((turn) => stripPunct(turn.text).includes(cleanQuote))
}

export function buildFlexibleQuoteRegex(quote: string): RegExp | null {
  const tokens = quote.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const pattern = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  return new RegExp(`(${pattern})`, 'gi')
}

export function buildDispatchDraft(record: InboxRecord, mode: DispatchMode): string {
  const property = record.property || 'Property TBC'
  const issue = record.issue || record.summary
  const caller = record.call?.caller_initials?.trim()
  const callbackPhone = extractCallbackPhone(record.call?.transcript)
  const safety = record.safety_check && record.safety_check !== 'n/a' ? record.safety_check : null
  const nextAction = primaryAction(record.actions)?.action ?? 'Please review and follow up.'

  if (mode === 'contractor') {
    return [
      `URGENCY: ${priorityLabel(record.priority).toUpperCase()} — ${typeLabel(record.type)}`,
      `Property: ${property}`,
      `Reported issue: ${issue}`,
      safety ? `Safety check on call: ${safety}` : null,
      callbackPhone ? `Tenant callback: ${callbackPhone}` : null,
      '',
      `Instruction: ${nextAction}`,
      'Please confirm ETA and attendance window by reply — Morning Lane Lettings.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }

  if (mode === 'caller') {
    const greeting = caller ? `Hi ${caller},` : 'Hello,'
    return [
      `${greeting} this is the Morning Lane lettings team following up on your recent ${typeLabel(record.type).toLowerCase()} call regarding ${property}.`,
      '',
      `We have logged: ${record.summary}.`,
      `Next step: ${nextAction}`,
      '',
      'Reply here if access times or any details change. — Morning Lane Branch',
    ].join('\n')
  }

  return [
    `[Morning Lane Handover · ${record.id}]`,
    `Priority: ${priorityLabel(record.priority)} | Type: ${typeLabel(record.type)}`,
    `Property: ${property}`,
    `Caller: ${caller || 'Not recorded'} | Callback: ${record.callback_confirmed ? 'Confirmed' : 'Not confirmed'}${callbackPhone ? ` (${callbackPhone})` : ''}`,
    `Summary: ${record.summary}`,
    safety ? `Safety check: ${safety}` : null,
    `Next action: ${nextAction}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}
