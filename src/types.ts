export type CallSource = 'phone' | 'dwelly' | 'synthetic'
export type CaseType = 'maintenance' | 'viewing' | 'let' | 'arrears' | 'general'
export type Priority = 'urgent' | 'today' | 'week'

export type CallRow = {
  id: string
  source: string
  started_at: string
  duration_s: number | null
  out_of_hours: boolean
  weekday: string | null
  caller_initials: string | null
  transcript: string | null
}

export type ActionRow = {
  id: string
  record_id: string
  action: string
  due: string | null
  done: boolean
  created_at: string
}

export type InboxRecord = {
  id: string
  call_id: string | null
  type: string
  priority: string
  property: string | null
  issue: string | null
  callback_confirmed: boolean
  safety_check: string | null
  summary: string
  created_at: string
  call: CallRow | null
  actions: ActionRow[]
}

export type Kpi = {
  calls: number
  out_of_hours_pct: number
  urgent_open: number
  hours_saved: number
}

export type InboxFilter =
  | 'all'
  | 'ooh'
  | 'urgent'
  | 'maintenance'
  | 'viewing'
  | 'dwelly'
  | 'phone'
