import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, AppConfig, GeneratedImage, GenerateProgress, HistoryEntry, McpServerStatus, ProviderId, SkillInfo } from '@shared/types'
import { SettingsDialog } from './components/SettingsDialog'
import { AgentLog, type LogItem } from './components/AgentLog'
import { Gallery } from './components/Gallery'
import {
  IconBook,
  IconBraces,
  IconFolder,
  IconImage,
  IconInfinity,
  IconLayers,
  IconOpen,
  IconPlay,
  IconRefresh,
  IconSave,
  IconSettings,
  IconSliders,
  IconSparkles,
  IconStop,
  IconTerminal,
  IconWand
} from './components/Icons'

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
  const mcpState = mcpEnabled === 0 ? 'off' : mcpOk === mcpEnabled ? 'ok' : mcpOk > 0 ? 'warn' : 'bad'
  const busy = phase !== 'idle'
  const d = cfg.generationDefaults
  const currentFormat = formatList.find((f) => f.id === selectedFormat)
  const presetCounts = [1, 3, 5, 10, 20]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <IconSparkles width={16} height={16} />
          </span>
          <span className="brand-name">NAI LLM Generator</span>
        </div>
        <div className="topbar-right">
          <div className="provider-pill">
            <span className="pill-label">LLM</span>
            <select value={cfg.provider} onChange={(e) => void patchCfg({ provider: e.target.value as ProviderId })} disabled={busy}>
              {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
            <span className="pill-model">{providerModel(cfg)}</span>
          </div>
          <button className={`chip chip-${mcpState}`} title="MCP サーバー再接続" onClick={() => void window.api.mcpReload()}>
            <span className="dot" />
            MCP {mcpOk}/{mcpEnabled}
          </button>
          <button
            className={`chip ${cfg.novelai.apiKey ? 'chip-ok' : 'chip-bad'}`}
            title={cfg.novelai.apiKey ? 'NovelAI API キー設定済み' : 'NovelAI API キー未設定'}
            onClick={() => setShowSettings(true)}
          >
            <span className="dot" />
            NovelAI
          </button>
          <button className="icon-btn" title="設定" onClick={() => setShowSettings(true)}>
            <IconSettings />
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="column">
          <section className="card">
            <div className="card-head">
              <IconWand className="card-icon" />
              <h2>指示</h2>
            </div>
            <textarea
              className="instruction"
              placeholder="例: ブルーアーカイブのアロナを、夜の教室で窓際に座って振り返っている構図で。制服姿、柔らかい光。3 パターン欲しい。"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={busy}
            />
            <div className="action-row">
              {busy ? (
                <button className="btn btn-danger btn-lg" onClick={cancel}>
                  <IconStop /> 中止
                </button>
              ) : (
                <button className="btn btn-primary btn-lg" disabled={!instruction.trim()} onClick={() => void runAgent(false)}>
                  <IconPlay /> {cfg.autoGenerate ? 'JSON 作成 → 画像生成' : 'JSON 作成'}
                </button>
              )}
              <button className="btn btn-lg" disabled={busy || !instruction.trim() || parsedJson === undefined} onClick={() => void runAgent(true)} title="現在の JSON を指示に従って修正">
                <IconRefresh /> 修正
              </button>
            </div>
            {busy && (
              <div className="status-line">
                <span className="spinner" />
                {phase === 'agent' ? 'LLM が JSON を作成中…' : progress ? `生成中 ${progress.index + 1}/${progress.total} ${progress.name}` : '画像を生成中…'}
                {loopInfo && (
                  <span className="status-loop">
                    ループ {loopInfo.i}
                    {loopInfo.total ? ` / ${loopInfo.total}` : ' / ∞'}
                  </span>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <IconSliders className="card-icon" />
              <h2>実行オプション</h2>
            </div>
            <label className="switch-row">
              <span>JSON 作成後に自動で画像生成</span>
              <span className={`switch ${cfg.autoGenerate ? 'on' : ''}`}>
                <input type="checkbox" checked={cfg.autoGenerate} onChange={(e) => void patchCfg({ autoGenerate: e.target.checked })} />
                <span className="knob" />
              </span>
            </label>
            <div className="option-row">
              <span>生成回数</span>
              <div className="segmented">
                {presetCounts.map((n) => (
                  <button
                    key={n}
                    className={!infinite && repeat === n ? 'active' : ''}
                    disabled={busy}
                    onClick={() => {
                      setInfinite(false)
                      setRepeat(n)
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button className={infinite ? 'active inf' : 'inf'} disabled={busy} onClick={() => setInfinite((v) => !v)} title="止めるまで繰り返し生成 (2 回目以降は seed をランダム化)">
                  <IconInfinity width={18} height={18} />
                </button>
              </div>
            </div>
            <div className="option-row">
              <span>回数を直接指定</span>
              <input
                className="num-input"
                type="number"
                min={1}
                max={999}
                value={repeat}
                disabled={busy || infinite}
                onChange={(e) => setRepeat(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
              />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <IconBook className="card-icon" />
              <h2>スキル</h2>
              <span className="count">
                {cfg.selectedSkills.filter((id) => skillList.some((s) => s.id === id)).length}/{skillList.length}
              </span>
              <div className="card-tools">
                <button className="icon-btn sm" title="一覧を更新" onClick={() => void refreshSkills()}>
                  <IconRefresh width={14} height={14} />
                </button>
                <button className="icon-btn sm" title="フォルダを開く" onClick={() => void window.api.openSkillsFolder('skill')}>
                  <IconFolder width={14} height={14} />
                </button>
              </div>
            </div>
            <div className="list">
              {skillList.length === 0 && <div className="empty">skills フォルダに .md を置くとここに出ます</div>}
              {skillList.map((s) => {
                const on = cfg.selectedSkills.includes(s.id)
                return (
                  <label key={s.id} className={`list-item ${on ? 'on' : ''}`} title={s.description}>
                    <span className={`switch sm ${on ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = e.target.checked ? [...cfg.selectedSkills, s.id] : cfg.selectedSkills.filter((x) => x !== s.id)
                          void patchCfg({ selectedSkills: next })
                        }}
                      />
                      <span className="knob" />
                    </span>
                    <span className="list-text">
                      <b>{s.name}</b>
                      <small>{s.description}</small>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <IconLayers className="card-icon" />
              <h2>出力フォーマット</h2>
              <div className="card-tools">
                <button className="icon-btn sm" title="フォルダを開く" onClick={() => void window.api.openSkillsFolder('format')}>
                  <IconFolder width={14} height={14} />
                </button>
              </div>
            </div>
            <select className="select" value={selectedFormat} onChange={(e) => void patchCfg({ selectedFormat: e.target.value })}>
              {formatList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {currentFormat && <div className="hint">{currentFormat.description}</div>}
          </section>

          <section className="card">
            <div className="card-head">
              <IconImage className="card-icon" />
              <h2>生成デフォルト</h2>
              <div className="card-tools">
                <button className="btn btn-xs" onClick={() => setShowSettings(true)}>
                  変更
                </button>
              </div>
            </div>
            <div className="chips">
              <span className="tag accent">{shortModel(d.model)}</span>
              <span className="tag">{d.size}</span>
              <span className="tag">{d.steps} steps</span>
              <span className="tag">scale {d.scale}</span>
              <span className="tag">{d.sampler}</span>
              <span className="tag">UC {d.uc_preset}</span>
              <span className="tag">{d.n_samples} 枚</span>
            </div>
          </section>
        </aside>

        <main className="column">
          <section className="card fill">
            <div className="tabbar">
              <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
                <IconTerminal width={14} height={14} /> ログ
              </button>
              <button className={`tab ${tab === 'json' ? 'active' : ''}`} onClick={() => setTab('json')}>
                <IconBraces width={14} height={14} /> JSON
                {jsonError && <span className="badge bad">!</span>}
              </button>
              <div className="spacer" />
              {tab === 'log' && log.length > 0 && (
                <button
                  className="btn btn-xs"
                  onClick={() => {
                    logRef.current = []
                    setLog([])
                  }}
                >
                  クリア
                </button>
              )}
            </div>
            {tab === 'log' ? (
              <AgentLog items={log} />
            ) : (
              <div className="json-pane">
                <textarea className="json-editor" spellCheck={false} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder="LLM が生成した JSON がここに入ります。直接編集もできます。" />
                <div className="toolbar">
                  {jsonError ? <span className="error-text">JSON エラー: {jsonError}</span> : <span className="hint">{parsedJson ? describeJson(parsedJson) : 'JSON はまだありません'}</span>}
                  <div className="spacer" />
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      void window.api.pickJson().then((r) => {
                        if (r) setJsonText(r.text)
                      })
                    }
                    disabled={busy}
                  >
                    <IconOpen width={14} height={14} /> 開く
                  </button>
                  <button className="btn btn-sm" onClick={() => void window.api.saveJson(jsonText)} disabled={!jsonText}>
                    <IconSave width={14} height={14} /> 保存
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={busy || parsedJson === undefined} onClick={() => void runGenerate(parsedJson, instruction)}>
                    <IconPlay width={14} height={14} /> この JSON で生成
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>

        <aside className="column">
          <section className="card fill">
            <Gallery
              images={images}
              history={history}
              onClearHistory={() => void window.api.historyClear().then(refreshHistory)}
              onLoadJson={(j) => {
                setJsonText(JSON.stringify(j, null, 2))
                setTab('json')
              }}
            />
          </section>
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

function shortModel(m: string): string {
  return m
    .replace('nai-diffusion-', 'NAI V')
    .replace('4-5', '4.5')
    .replace('-full', ' Full')
    .replace('-curated', ' Curated')
    .replace('-furry', ' Furry')
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
