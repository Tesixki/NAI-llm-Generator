import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, AppConfig, GeneratedImage, GenerateProgress, HistoryEntry, McpServerStatus, ProviderId, SkillInfo } from '@shared/types'
import { SettingsDialog } from './components/SettingsDialog'
import { AgentLog, type LogItem } from './components/AgentLog'
import { Gallery } from './components/Gallery'

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Claude API',
  openai: 'OpenAI 互換 API',
  'claude-cli': 'Claude Code CLI',
  'devin-cli': 'Devin CLI'
}

type Phase = 'idle' | 'agent' | 'generate'

export default function App(): React.JSX.Element {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [mcp, setMcp] = useState<McpServerStatus[]>([])
  const [instruction, setInstruction] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [log, setLog] = useState<LogItem[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState<'log' | 'json'>('log')
  const [progress, setProgress] = useState<GenerateProgress | null>(null)
  const [repeat, setRepeat] = useState(1)
  const [infinite, setInfinite] = useState(false)
  const [loopInfo, setLoopInfo] = useState<{ i: number; total: number | null } | null>(null)
  const logRef = useRef<LogItem[]>([])
  const stopRef = useRef(false)

  const pushLog = useCallback((item: Omit<LogItem, 'id' | 'at'>) => {
    const entry: LogItem = { id: crypto.randomUUID(), at: Date.now(), ...item }
    logRef.current = [...logRef.current, entry].slice(-500)
    setLog(logRef.current)
  }, [])

  const refreshSkills = useCallback(async () => setSkills(await window.api.listSkills()), [])
  const refreshMcp = useCallback(async () => setMcp(await window.api.mcpStatus()), [])
  const refreshHistory = useCallback(async () => setHistory(await window.api.historyList()), [])

  useEffect(() => {
    void (async () => {
      setCfg(await window.api.getConfig())
      await Promise.all([refreshSkills(), refreshMcp(), refreshHistory()])
    })()
    const offMcp = window.api.onMcpChanged(() => void refreshMcp())
    const offAgent = window.api.onAgentEvent((ev: AgentEvent) => {
      switch (ev.type) {
        case 'status':
          pushLog({ kind: 'status', text: ev.message })
          break
        case 'llm-text':
          pushLog({ kind: 'llm', text: ev.text })
          break
        case 'tool-call':
          pushLog({ kind: 'tool-call', text: ev.tool, detail: JSON.stringify(ev.args, null, 2) })
          break
        case 'tool-result':
          pushLog({ kind: ev.isError ? 'error' : 'tool-result', text: ev.tool, detail: ev.result })
          break
        case 'cli-output':
          pushLog({ kind: 'cli', text: ev.line })
          break
        case 'error':
          pushLog({ kind: 'error', text: ev.message })
          break
        case 'done':
          pushLog({ kind: 'status', text: ev.json ? 'JSON を受理しました' : 'JSON が抽出できませんでした' })
          break
      }
    })
    const offGen = window.api.onGenerateProgress((p) => {
      setProgress(p)
      if (p.status === 'start' && p.message) pushLog({ kind: 'status', text: `[${p.name}] ${p.message}` })
      else if (p.status === 'start') pushLog({ kind: 'status', text: `[${p.index + 1}/${p.total}] ${p.name} 生成中...` })
      else if (p.status === 'done') {
        pushLog({ kind: 'status', text: `[${p.index + 1}/${p.total}] ${p.name} 完了 (${p.images?.length ?? 0} 枚)` })
        if (p.images) setImages((prev) => [...(p.images ?? []), ...prev])
      } else if (p.status === 'error') pushLog({ kind: 'error', text: `[${p.name}] ${p.message}` })
    })
    return () => {
      offMcp()
      offAgent()
      offGen()
    }
  }, [pushLog, refreshHistory, refreshMcp, refreshSkills])

  const skillList = useMemo(() => skills.filter((s) => s.kind === 'skill'), [skills])
  const formatList = useMemo(() => skills.filter((s) => s.kind === 'format'), [skills])
  const selectedFormat = cfg?.selectedFormat && formatList.some((f) => f.id === cfg.selectedFormat) ? cfg.selectedFormat : (formatList[0]?.id ?? '')

  const patchCfg = useCallback(async (patch: Partial<AppConfig>) => {
    const next = await window.api.saveConfig(patch)
    setCfg(next)
    return next
  }, [])

  const parsedJson = useMemo(() => {
    if (!jsonText.trim()) return undefined
    try {
      const v = JSON.parse(jsonText)
      setJsonError(null)
      return v as unknown
    } catch (e) {
      setJsonError((e as Error).message)
      return undefined
    }
  }, [jsonText])

  const runGenerate = useCallback(
    async (json: unknown, instructionForHistory: string) => {
      if (!cfg) return
      setPhase('generate')
      setTab('log')
      stopRef.current = false
      const total = infinite ? null : Math.max(1, repeat)
      const collected: GeneratedImage[] = []
      try {
        for (let i = 0; total === null || i < total; i++) {
          if (stopRef.current) break
          setLoopInfo({ i: i + 1, total })
          if (i > 0 || total === null) pushLog({ kind: 'status', text: `── ループ ${i + 1}${total ? `/${total}` : ' (∞)'} ──` })
          const payload = i === 0 ? json : randomizeSeeds(json)
          const res = await window.api.generate({ json: payload, stem: 'gen' })
          collected.push(...res.images)
          if (res.errors.length) {
            pushLog({ kind: 'error', text: `${res.errors.length} 件失敗: ${res.errors.map((e) => `${e.name}: ${e.message}`).join(' / ')}` })
            if (res.images.length === 0) break // e.g. auth error: don't spin forever
          }
        }
        if (collected.length) {
          await window.api.historyAdd({ instruction: instructionForHistory, provider: cfg.provider, json, images: collected })
          await refreshHistory()
        }
      } catch (e) {
        pushLog({ kind: 'error', text: (e as Error).message })
      } finally {
        setPhase('idle')
        setProgress(null)
        setLoopInfo(null)
      }
    },
    [cfg, infinite, pushLog, refreshHistory, repeat]
  )

  const runAgent = useCallback(
    async (refine: boolean) => {
      if (!cfg || !instruction.trim()) return
      setPhase('agent')
      setTab('log')
      logRef.current = []
      setLog([])
      try {
        const res = await window.api.runAgent({
          instruction,
          skillIds: cfg.selectedSkills,
          formatId: selectedFormat,
          previousJson: refine ? parsedJson : undefined
        })
        if (res.json !== undefined) {
          setJsonText(JSON.stringify(res.json, null, 2))
          if (cfg.autoGenerate) {
            await runGenerate(res.json, instruction)
            return
          }
          setTab('json')
        } else {
          pushLog({ kind: 'error', text: 'LLM の回答から JSON を抽出できませんでした。ログを確認してください。' })
        }
      } catch (e) {
        pushLog({ kind: 'error', text: (e as Error).message })
      } finally {
        setPhase('idle')
      }
    },
    [cfg, instruction, parsedJson, pushLog, runGenerate, selectedFormat]
  )

  const cancel = useCallback(() => {
    stopRef.current = true
    void window.api.cancelAgent()
    void window.api.cancelGenerate()
  }, [])

  if (!cfg) return <div className="loading">読み込み中...</div>

  const mcpOk = mcp.filter((m) => m.connected).length
  const mcpEnabled = mcp.filter((m) => m.enabled).length
  const busy = phase !== 'idle'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">NAI</span> LLM Generator
        </div>
        <div className="topbar-controls">
          <label className="inline">
            <span>LLM</span>
            <select value={cfg.provider} onChange={(e) => void patchCfg({ provider: e.target.value as ProviderId })} disabled={busy}>
              {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <span className="model-name">{providerModel(cfg)}</span>
          <button className="ghost" title="MCP サーバー再接続" onClick={() => void window.api.mcpReload()}>
            <span className={`dot ${mcpOk === mcpEnabled && mcpEnabled > 0 ? 'ok' : mcpOk > 0 ? 'warn' : 'bad'}`} /> MCP {mcpOk}/{mcpEnabled}
          </button>
          <button className="ghost" onClick={() => setShowSettings(true)}>
            ⚙ 設定
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel left">
          <h2>指示</h2>
          <textarea
            className="instruction"
            placeholder={'例: ブルーアーカイブのアロナを、夜の教室で窓際に座って振り返っている構図で。制服姿、柔らかい光。3パターン欲しい。'}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={busy}
          />
          <div className="row">
            <button className="primary" disabled={busy || !instruction.trim()} onClick={() => void runAgent(false)}>
              {cfg.autoGenerate ? '▶ JSON 作成 → 画像生成' : '▶ JSON 作成'}
            </button>
            <button disabled={busy || !instruction.trim() || parsedJson === undefined} onClick={() => void runAgent(true)} title="現在の JSON を指示に従って修正">
              ↻ JSON を修正
            </button>
            {busy && (
              <button className="danger" onClick={cancel}>
                ■ 中止
              </button>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={cfg.autoGenerate} onChange={(e) => void patchCfg({ autoGenerate: e.target.checked })} />
            JSON 作成後に自動で NovelAI 生成
          </label>
          <div className="row repeat-row">
            <span className="muted">生成回数</span>
            <select value={infinite ? 'inf' : String(repeat)} onChange={(e) => (e.target.value === 'inf' ? setInfinite(true) : (setInfinite(false), setRepeat(Number(e.target.value))))} disabled={busy}>
              {[1, 2, 3, 5, 10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} 回
                </option>
              ))}
              <option value="inf">∞ 無限</option>
            </select>
            <button className={infinite ? 'inf active' : 'inf'} onClick={() => setInfinite((v) => !v)} disabled={busy} title="止めるまで JSON を繰り返し生成 (2 回目以降は seed をランダム化)">
              ∞
            </button>
            {loopInfo && (
              <span className="progress">
                ループ {loopInfo.i}
                {loopInfo.total ? `/${loopInfo.total}` : ' / ∞'}
              </span>
            )}
          </div>

          <div className="section-head">
            <h2>スキル</h2>
            <div>
              <button className="ghost small" onClick={() => void refreshSkills()}>
                更新
              </button>
              <button className="ghost small" onClick={() => void window.api.openSkillsFolder('skill')}>
                フォルダ
              </button>
            </div>
          </div>
          <div className="skill-list">
            {skillList.length === 0 && <div className="muted">skills フォルダに .md を置いてください</div>}
            {skillList.map((s) => (
              <label key={s.id} className="check skill" title={s.description}>
                <input
                  type="checkbox"
                  checked={cfg.selectedSkills.includes(s.id)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...cfg.selectedSkills, s.id] : cfg.selectedSkills.filter((x) => x !== s.id)
                    void patchCfg({ selectedSkills: next })
                  }}
                />
                <span>
                  <b>{s.name}</b>
                  <small>{s.description}</small>
                </span>
              </label>
            ))}
          </div>

          <div className="section-head">
            <h2>フォーマット</h2>
            <button className="ghost small" onClick={() => void window.api.openSkillsFolder('format')}>
              フォルダ
            </button>
          </div>
          <select value={selectedFormat} onChange={(e) => void patchCfg({ selectedFormat: e.target.value })}>
            {formatList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {formatList.find((f) => f.id === selectedFormat) && <div className="muted small-text">{formatList.find((f) => f.id === selectedFormat)?.description}</div>}
        </aside>

        <main className="panel center">
          <div className="tabs">
            <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
              ログ
            </button>
            <button className={tab === 'json' ? 'active' : ''} onClick={() => setTab('json')}>
              JSON {jsonError && <span className="badge bad">!</span>}
            </button>
            <div className="spacer" />
            {progress && (
              <span className="progress">
                {progress.index + 1}/{progress.total} {progress.name}
              </span>
            )}
          </div>
          {tab === 'log' ? (
            <AgentLog items={log} />
          ) : (
            <div className="json-pane">
              <textarea className="json-editor" spellCheck={false} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder="LLM が生成した JSON がここに入ります。直接編集もできます。" />
              <div className="row json-actions">
                {jsonError ? <span className="error-text">JSON エラー: {jsonError}</span> : <span className="muted">{parsedJson ? describeJson(parsedJson) : ''}</span>}
                <div className="spacer" />
                <button
                  onClick={() =>
                    void window.api.pickJson().then((r) => {
                      if (r) setJsonText(r.text)
                    })
                  }
                  disabled={busy}
                >
                  開く
                </button>
                <button onClick={() => void window.api.saveJson(jsonText)} disabled={!jsonText}>
                  保存
                </button>
                <button className="primary" disabled={busy || parsedJson === undefined} onClick={() => void runGenerate(parsedJson, instruction)}>
                  ▶ この JSON で生成
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className="panel right">
          <Gallery images={images} history={history} onClearHistory={() => void window.api.historyClear().then(refreshHistory)} onLoadJson={(j) => {
            setJsonText(JSON.stringify(j, null, 2))
            setTab('json')
          }} />
        </aside>
      </div>

      {showSettings && (
        <SettingsDialog
          cfg={cfg}
          mcp={mcp}
          onClose={() => setShowSettings(false)}
          onSave={async (patch) => {
            await patchCfg(patch)
            await refreshSkills()
          }}
        />
      )}
    </div>
  )
}

function providerModel(cfg: AppConfig): string {
  switch (cfg.provider) {
    case 'anthropic':
      return cfg.anthropic.model
    case 'openai':
      return cfg.openai.model
    case 'claude-cli':
      return cfg.claudeCli.model || 'default'
    case 'devin-cli':
      return cfg.devinCli.model || 'default'
  }
}

/** Return a copy of the request JSON with every seed reset to 0 (= random) so repeated runs differ */
function randomizeSeeds(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json
  const o = JSON.parse(JSON.stringify(json)) as Record<string, unknown>
  if ('seed' in o) o.seed = 0
  if (Array.isArray(o.requests)) for (const r of o.requests as Record<string, unknown>[]) if (r && typeof r === 'object' && 'seed' in r) r.seed = 0
  return o
}

function describeJson(j: unknown): string {
  if (!j || typeof j !== 'object') return ''
  const o = j as Record<string, unknown>
  if (Array.isArray(o.requests)) return `バッチ: ${o.requests.length} 件`
  const n = typeof o.n_samples === 'number' ? o.n_samples : 1
  return `単一リクエスト (${n} 枚) / model: ${String(o.model ?? 'default')} / size: ${JSON.stringify(o.size ?? 'portrait')}`
}
