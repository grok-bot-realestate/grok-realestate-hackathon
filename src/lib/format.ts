import type { ActionRow, CallRow } from '../types'

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
  const when = dayKey.format(date) === dayKey.format(new Date())
    ? 'today'
    : new Intl.DateTimeFormat('en-GB', { timeZone: london, weekday: 'long' }).format(date)
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

export function durationLabel(seconds: number | null | undefined): string {
  if (seconds == null) return 'length unknown'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes <= 0) return `${rest}s`
  return `${minutes}m ${rest}s`
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

export function receivedAt(recordCreated: string, call: CallRow | null): string {
  return dateTime(call?.started_at ?? recordCreated)
}
