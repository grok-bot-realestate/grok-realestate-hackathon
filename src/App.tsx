import { useState } from 'react'
import { useInbox } from './lib/inbox'
import { useLineCall } from './lib/lineCall'
import Inbox from './screens/Inbox'
import RecordScreen from './screens/Record'
import type { InboxFilter } from './types'

export default function App() {
  const call = useLineCall()
  const inbox = useInbox(call.phase === 'processing')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (selectedId) {
    const row = inbox.rows.find((record) => record.id === selectedId) ?? null
    return (
      <RecordScreen
        row={row}
        loading={inbox.status === 'loading'}
        onBack={() => setSelectedId(null)}
        onChanged={() => void inbox.reload()}
      />
    )
  }

  return (
    <Inbox
      rows={inbox.rows}
      kpi={inbox.kpi}
      status={inbox.status}
      error={inbox.error}
      freshCount={inbox.freshCount}
      highlight={inbox.highlight}
      filter={filter}
      onFilter={setFilter}
      onOpen={setSelectedId}
      phase={call.phase}
      callError={call.error}
      callReady={call.ready}
      onCall={() => void call.start()}
      onHangUp={call.hangUp}
    />
  )
}
