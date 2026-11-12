import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultDueForPriority } from './format'
import { supabase } from './supabase'
import type { ActionRow, CallRow, InboxRecord, Kpi, Priority, RealtimeStatus } from '../types'

type RawRecord = {
  id: string
  call_id: string | null
  type: string
  priority: string
  property: string | null
  issue: string | null
  callback_confirmed: boolean | null
  safety_check: string | null
  summary: string
  created_at: string
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function computeKpiFromRows(rows: InboxRecord[], serverKpi: Kpi | null): Kpi {
  const calls = Math.max(rows.length, serverKpi?.calls ?? 0)
  const oohCount = rows.filter((r) => r.call?.out_of_hours).length
  const out_of_hours_pct =
    rows.length > 0 ? Math.round((100 * oohCount) / rows.length) : (serverKpi?.out_of_hours_pct ?? 0)
  const urgent_open = rows.reduce((sum, r) => {
    if (r.priority !== 'urgent') return sum
    return sum + r.actions.filter((a) => !a.done).length
  }, 0)
  const hours_saved = Number(((rows.length * 4) / 60).toFixed(1))
  return {
    calls,
    out_of_hours_pct,
    urgent_open,
    hours_saved,
  }
}

export function useInbox(poll: boolean) {
  const [rows, setRows] = useState<InboxRecord[]>([])
  const [serverKpi, setServerKpi] = useState<Kpi | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [freshCount, setFreshCount] = useState(0)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [latestArrivedPhoneId, setLatestArrivedPhoneId] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    if (!supabase) {
      setStatus('error')
      setError('Supabase is not configured.')
      return
    }

    const [recordsRes, callsRes, actionsRes, kpiRes] = await Promise.all([
      supabase
        .from('records')
        .select(
          'id, call_id, type, priority, property, issue, callback_confirmed, safety_check, summary, created_at',
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('calls')
        .select(
          'id, source, started_at, duration_s, out_of_hours, weekday, caller_initials, transcript',
        ),
      supabase
        .from('actions')
        .select('id, record_id, action, due, done, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('kpi').select('calls, out_of_hours_pct, urgent_open, hours_saved').maybeSingle(),
    ])

    if (recordsRes.error || callsRes.error || actionsRes.error) {
      setStatus('error')
      setError(
        recordsRes.error?.message ??
          callsRes.error?.message ??
          actionsRes.error?.message ??
          'Could not load the inbox.',
      )
      return
    }

    const calls = new Map<string, CallRow>(
      asArray(callsRes.data as CallRow[] | null).map((call) => [call.id, call]),
    )
    const actionsByRecord = new Map<string, ActionRow[]>()
    for (const action of asArray(actionsRes.data as ActionRow[] | null)) {
      const list = actionsByRecord.get(action.record_id) ?? []
      list.push({ ...action, done: Boolean(action.done) })
      actionsByRecord.set(action.record_id, list)
    }

    const next = asArray(recordsRes.data as RawRecord[] | null)
      .map((record): InboxRecord => ({
        ...record,
        callback_confirmed: Boolean(record.callback_confirmed),
        call: record.call_id ? (calls.get(record.call_id) ?? null) : null,
        actions: actionsByRecord.get(record.id) ?? [],
      }))
      .sort((a, b) => {
        const left = a.call?.started_at ?? a.created_at
        const right = b.call?.started_at ?? b.created_at
        return right.localeCompare(left)
      })

    if (!seen.current) {
      seen.current = new Set(next.map((record) => record.id))
    } else {
      const arrived = next.filter((record) => !seen.current?.has(record.id))
      const arrivedIds = arrived.map((record) => record.id)
      if (arrivedIds.length > 0) {
        setFreshCount((count) => count + arrivedIds.length)
        setHighlight((current) => new Set([...current, ...arrivedIds]))
        const arrivedPhone = arrived.find((r) => r.call?.source === 'phone') ?? arrived[0]
        if (arrivedPhone) {
          setLatestArrivedPhoneId(arrivedPhone.id)
        }
        window.setTimeout(() => {
          setHighlight((current) => {
            const copy = new Set(current)
            for (const id of arrivedIds) copy.delete(id)
            return copy
          })
        }, 5000)
      }
      for (const record of next) seen.current.add(record.id)
    }

    setRows(next)
    if (!kpiRes.error && kpiRes.data) setServerKpi(kpiRes.data as Kpi)
    setLastSyncedAt(new Date().toISOString())
    setStatus('ready')
    setError(null)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const client = supabase
    if (!client) {
      setRealtimeStatus('offline')
      return
    }
    const channel = client
      .channel('line-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        void load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => {
        void load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, () => {
        void load()
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') setRealtimeStatus('live')
        else if (state === 'TIMED_OUT' || state === 'CHANNEL_ERROR') setRealtimeStatus('reconnecting')
        else if (state === 'CLOSED') setRealtimeStatus('offline')
        else setRealtimeStatus('connecting')
      })
    return () => {
      void client.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    if (!poll) return
    const timer = window.setInterval(() => {
      void load()
    }, 2200)
    return () => window.clearInterval(timer)
  }, [load, poll])

  const toggleActionDone = useCallback(
    async (actionId: string, nextDone: boolean): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
      const snapshot = rows
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          actions: row.actions.map((a) => (a.id === actionId ? { ...a, done: nextDone } : a)),
        })),
      )

      const { error: updateErr } = await supabase
        .from('actions')
        .update({ done: nextDone })
        .eq('id', actionId)

      if (updateErr) {
        setRows(snapshot)
        return { ok: false, error: updateErr.message }
      }
      void load()
      return { ok: true }
    },
    [rows, load],
  )

  const addFollowUpAction = useCallback(
    async (
      recordId: string,
      actionText: string,
      priority: Priority,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
      const trimmed = actionText.trim()
      if (!trimmed) return { ok: false, error: 'Enter an action before adding.' }

      const tempId = `temp-${Date.now()}`
      const optimisticAction: ActionRow = {
        id: tempId,
        record_id: recordId,
        action: trimmed,
        due: defaultDueForPriority(priority),
        done: false,
        created_at: new Date().toISOString(),
      }
      const snapshot = rows
      setRows((prev) =>
        prev.map((row) =>
          row.id === recordId ? { ...row, actions: [optimisticAction, ...row.actions] } : row,
        ),
      )

      const { data, error: insertErr } = await supabase
        .from('actions')
        .insert({
          record_id: recordId,
          action: trimmed,
          due: optimisticAction.due,
          done: false,
        })
        .select('id, record_id, action, due, done, created_at')
        .single()

      if (insertErr) {
        setRows(snapshot)
        return { ok: false, error: insertErr.message }
      }

      if (data) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === recordId
              ? {
                  ...row,
                  actions: row.actions.map((a) => (a.id === tempId ? (data as ActionRow) : a)),
                }
              : row,
          ),
        )
      }
      void load()
      return { ok: true }
    },
    [rows, load],
  )

  const updateRecordPriority = useCallback(
    async (recordId: string, nextPriority: Priority): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
      const snapshot = rows
      setRows((prev) =>
        prev.map((row) => (row.id === recordId ? { ...row, priority: nextPriority } : row)),
      )

      const { error: updateErr } = await supabase
        .from('records')
        .update({ priority: nextPriority })
        .eq('id', recordId)

      if (updateErr) {
        setRows(snapshot)
        return { ok: false, error: updateErr.message }
      }
      void load()
      return { ok: true }
    },
    [rows, load],
  )

  const kpi = computeKpiFromRows(rows, serverKpi)

  return {
    rows,
    kpi,
    status,
    error,
    freshCount,
    highlight,
    realtimeStatus,
    lastSyncedAt,
    latestArrivedPhoneId,
    clearLatestArrivedPhoneId: () => setLatestArrivedPhoneId(null),
    reload: load,
    toggleActionDone,
    addFollowUpAction,
    updateRecordPriority,
  }
}
