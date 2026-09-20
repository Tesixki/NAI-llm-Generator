import { useEffect, useRef, useState } from 'react'

export interface LogItem {
  id: string
  at: number
  kind: 'status' | 'llm' | 'tool-call' | 'tool-result' | 'cli' | 'error'
  text: string
  detail?: string
}

const LABEL: Record<LogItem['kind'], string> = {
  status: 'INFO',
  llm: 'LLM',
  'tool-call': 'CALL',
  'tool-result': 'RESULT',
  cli: 'CLI',
  error: 'ERROR'
}

export function AgentLog({ items }: { items: LogItem[] }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])
  return (
    <div className="log" ref={ref}>
      {items.length === 0 && <div className="muted">指示を入力して「JSON 作成」を押すと、LLM とツール呼び出しの経過がここに表示されます。</div>}
      {items.map((it) => (
        <LogRow key={it.id} item={it} />
      ))}
    </div>
  )
}

function LogRow({ item }: { item: LogItem }): React.JSX.Element {
  const [open, setOpen] = useState(item.kind === 'llm')
  const time = new Date(item.at).toLocaleTimeString('ja-JP', { hour12: false })
  return (
    <div className={`log-row ${item.kind}`}>
      <span className="log-time">{time}</span>
      <span className={`log-kind ${item.kind}`}>{LABEL[item.kind]}</span>
      <div className="log-body">
        <div className={item.detail ? 'log-title clickable' : 'log-title'} onClick={() => item.detail && setOpen((o) => !o)}>
          {item.detail && <span className="chev">{open ? '▾' : '▸'}</span>}
          {item.text}
        </div>
        {item.detail && open && <pre className="log-detail">{item.detail}</pre>}
      </div>
    </div>
  )
}
