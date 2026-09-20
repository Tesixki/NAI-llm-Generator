import { useEffect, useState } from 'react'
import type { AppConfig, GenerationDefaults, McpServerConfig, McpServerStatus } from '@shared/types'
import { NAI_MODELS, NAI_NOISE_SCHEDULES, NAI_SAMPLERS, NAI_SIZE_PRESETS, NAI_UC_PRESETS } from '@shared/defaults'

interface Props {
  cfg: AppConfig
  mcp: McpServerStatus[]
  onClose: () => void
  onSave: (patch: Partial<AppConfig>) => Promise<void>
}

type Section = 'llm' | 'novelai' | 'generation' | 'mcp' | 'paths'

const MODEL_LABELS: Record<string, string> = {
  'nai-diffusion-5-full': 'NAI Diffusion V5 Full',
  'nai-diffusion-5-curated': 'NAI Diffusion V5 Curated',
  'nai-diffusion-4-5-full': 'NAI Diffusion V4.5 Full',
  'nai-diffusion-4-5-curated': 'NAI Diffusion V4.5 Curated',
  'nai-diffusion-4-full': 'NAI Diffusion V4 Full',
  'nai-diffusion-4-curated': 'NAI Diffusion V4 Curated',
  'nai-diffusion-3': 'NAI Diffusion V3 (Anime)',
  'nai-diffusion-3-furry': 'NAI Diffusion V3 (Furry)'
}
const CLAUDE_MODELS = ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'] as const

const SIZE_LABELS: Record<string, string> = {
  portrait: '縦長 832×1216',
  landscape: '横長 1216×832',
  square: '正方形 1024×1024',
  large_portrait: '縦長 (大) 1024×1536',
  large_landscape: '横長 (大) 1536×1024',
  wallpaper_portrait: '壁紙 縦 1088×1920',
  wallpaper_landscape: '壁紙 横 1920×1088'
}

export function SettingsDialog({ cfg, mcp, onClose, onSave }: Props): React.JSX.Element {
  const [draft, setDraft] = useState<AppConfig>(() => structuredClone(cfg))
  const [section, setSection] = useState<Section>('llm')
  const [mcpText, setMcpText] = useState(() => JSON.stringify(cfg.mcpServers, null, 2))
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [paths, setPaths] = useState<{ userData: string; config: string; version: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.appPaths().then(setPaths)
  }, [])

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]): void => setDraft((d) => ({ ...d, [key]: value }))
  const setSub = <K extends 'anthropic' | 'openai' | 'novelai' | 'claudeCli' | 'devinCli' | 'danbooru'>(key: K, patch: Partial<AppConfig[K]>): void =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))

  const save = async (): Promise<void> => {
    let mcpServers: Record<string, McpServerConfig> = draft.mcpServers
    try {
      mcpServers = JSON.parse(mcpText)
      setMcpError(null)
    } catch (e) {
      setMcpError((e as Error).message)
      setSection('mcp')
      return
    }
    setSaving(true)
    try {
      await onSave({ ...draft, mcpServers })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-side">
          {(
            [
              ['llm', 'LLM プロバイダ'],
              ['novelai', 'NovelAI'],
              ['generation', '画像生成デフォルト'],
              ['mcp', 'MCP サーバー'],
              ['paths', 'フォルダ / その他']
            ] as [Section, string][]
          ).map(([id, label]) => (
            <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
          <div className="spacer" />
          {paths && (
            <div className="muted tiny">
              v{paths.version}
              <br />
              <span className="clickable" onClick={() => void window.api.showItem(paths.config)}>
                config.json
              </span>
            </div>
          )}
        </div>
        <div className="modal-body">
          {section === 'llm' && (
            <>
              <h3>Claude API (Anthropic)</h3>
              <Field label="API キー">
                <input type="password" value={draft.anthropic.apiKey} onChange={(e) => setSub('anthropic', { apiKey: e.target.value })} placeholder="sk-ant-..." />
              </Field>
              <Field label="モデル">
                <ModelSelect value={draft.anthropic.model} options={CLAUDE_MODELS} onChange={(m) => setSub('anthropic', { model: m })} />
              </Field>
              <Field label="Base URL (任意)">
                <input value={draft.anthropic.baseUrl} onChange={(e) => setSub('anthropic', { baseUrl: e.target.value })} placeholder="https://api.anthropic.com" />
              </Field>
              <Field label="max_tokens">
                <input type="number" value={draft.anthropic.maxTokens} onChange={(e) => setSub('anthropic', { maxTokens: Number(e.target.value) })} />
              </Field>

              <h3>OpenAI 互換 API</h3>
              <p className="muted">OpenAI / OpenRouter / LM Studio / Ollama / vLLM など、Chat Completions + function calling に対応したサーバー。</p>
              <Field label="Base URL">
                <input value={draft.openai.baseUrl} onChange={(e) => setSub('openai', { baseUrl: e.target.value })} placeholder="http://localhost:1234/v1" />
              </Field>
              <Field label="API キー">
                <input type="password" value={draft.openai.apiKey} onChange={(e) => setSub('openai', { apiKey: e.target.value })} placeholder="ローカルサーバーなら空でも可" />
              </Field>
              <Field label="モデル">
                <input value={draft.openai.model} onChange={(e) => setSub('openai', { model: e.target.value })} placeholder="gpt-4.1" />
              </Field>

              <h3>Claude Code CLI</h3>
              <p className="muted">
                <code>claude -p</code> を非対話モードで実行します。MCP サーバー設定は自動で渡されます。
              </p>
              <Field label="コマンド">
                <input value={draft.claudeCli.command} onChange={(e) => setSub('claudeCli', { command: e.target.value })} placeholder="claude" />
              </Field>
              <Field label="モデル (任意)">
                <input value={draft.claudeCli.model} onChange={(e) => setSub('claudeCli', { model: e.target.value })} placeholder="空なら CLI のデフォルト" />
              </Field>
              <Field label="追加引数">
                <input value={draft.claudeCli.extraArgs} onChange={(e) => setSub('claudeCli', { extraArgs: e.target.value })} placeholder="--permission-mode bypassPermissions など" />
              </Field>

              <h3>Devin CLI</h3>
              <p className="muted">
                <code>devin --print --prompt-file ... --permission-mode dangerous</code> で実行します。MCP サーバーは一時ワークスペースの <code>.devin/mcp_config.json</code> に自動で書き出されます (システムプロンプトはプロンプト先頭に埋め込み)。事前に <code>devin login</code> が必要です。
              </p>
              <Field label="コマンド">
                <input value={draft.devinCli.command} onChange={(e) => setSub('devinCli', { command: e.target.value })} placeholder="devin" />
              </Field>
              <Field label="モデル (任意)">
                <input value={draft.devinCli.model} onChange={(e) => setSub('devinCli', { model: e.target.value })} />
              </Field>
              <Field label="追加引数">
                <input value={draft.devinCli.extraArgs} onChange={(e) => setSub('devinCli', { extraArgs: e.target.value })} />
              </Field>

              <h3>エージェント</h3>
              <Field label="最大ツール呼び出しループ回数">
                <input type="number" value={draft.maxIterations} onChange={(e) => set('maxIterations', Number(e.target.value))} />
              </Field>
            </>
          )}

          {section === 'novelai' && (
            <>
              <h3>NovelAI</h3>
              <Field label="API キー (Persistent Token)">
                <input type="password" value={draft.novelai.apiKey} onChange={(e) => setSub('novelai', { apiKey: e.target.value })} placeholder="pst-..." />
              </Field>
              <p className="muted">
                NovelAI の <b>Account Settings → Get Persistent API Token</b> で取得できます。キーは OS の安全なストレージで暗号化して保存されます。
              </p>
              <Field label="Image API Base">
                <input value={draft.novelai.imageBase} onChange={(e) => setSub('novelai', { imageBase: e.target.value })} />
              </Field>
              <Field label="タイムアウト (秒)">
                <input type="number" value={draft.novelai.timeoutSec} onChange={(e) => setSub('novelai', { timeoutSec: Number(e.target.value) })} />
              </Field>
            </>
          )}

          {section === 'generation' && <GenerationDefaultsForm value={draft.generationDefaults} onChange={(v) => set('generationDefaults', v)} />}

          {section === 'mcp' && (
            <>
              <h3>内蔵 Danbooru ツール</h3>
              <p className="muted">
                <code>"danbooru": {'{ "type": "builtin" }'}</code> はアプリ内蔵の Danbooru ツール (search_tags / get_wiki_info / get_character_tags / get_post_tags / get_post_count) で、danbooru.donmai.us をこの PC から直接呼びます。ログイン情報は任意 (レート制限緩和)。
              </p>
              <Field label="Danbooru ログイン名 (任意)">
                <input value={draft.danbooru.login} onChange={(e) => setSub('danbooru', { login: e.target.value })} />
              </Field>
              <Field label="Danbooru API キー (任意)">
                <input type="password" value={draft.danbooru.apiKey} onChange={(e) => setSub('danbooru', { apiKey: e.target.value })} />
              </Field>
              <h3>MCP サーバー</h3>
              <p className="muted">
                Claude Desktop と同じ <code>mcpServers</code> 形式。<code>{'${NOVELAI_API_KEY}'}</code> / <code>{'${OUTPUT_DIR}'}</code> は設定値に置換されます。<code>"enabled": false</code> で無効化。
              </p>
              <div className="mcp-status">
                {mcp.map((m) => (
                  <div key={m.name} className="mcp-row">
                    <span className={`dot ${!m.enabled ? 'off' : m.connected ? 'ok' : 'bad'}`} />
                    <b>{m.name}</b>
                    <span className="muted">{!m.enabled ? '無効' : m.connected ? `${m.tools.length} tools: ${m.tools.map((t) => t.name).join(', ')}` : m.error ?? '接続中...'}</span>
                  </div>
                ))}
              </div>
              <textarea className="json-editor mcp-editor" spellCheck={false} value={mcpText} onChange={(e) => setMcpText(e.target.value)} />
              {mcpError && <div className="error-text">JSON エラー: {mcpError}</div>}
            </>
          )}

          {section === 'paths' && (
            <>
              <h3>フォルダ</h3>
              <DirField label="画像出力先" value={draft.outputDir} onChange={(v) => set('outputDir', v)} />
              <DirField label="スキル (.md)" value={draft.skillsDir} onChange={(v) => set('skillsDir', v)} />
              <DirField label="フォーマット (.md)" value={draft.formatsDir} onChange={(v) => set('formatsDir', v)} />
              <p className="muted">
                スキルは <code>name.md</code> または <code>name/SKILL.md</code>。先頭に <code>---</code> で囲んだ frontmatter (<code>name</code>, <code>description</code>) を書けます。
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={() => void save()} disabled={saving}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function GenerationDefaultsForm({ value, onChange }: { value: GenerationDefaults; onChange: (v: GenerationDefaults) => void }): React.JSX.Element {
  const upd = <K extends keyof GenerationDefaults>(key: K, v: GenerationDefaults[K]): void => onChange({ ...value, [key]: v })
  const isPreset = value.size in NAI_SIZE_PRESETS
  const custom = !isPreset ? value.size.match(/^(\d+)\s*[x×]\s*(\d+)$/) : null
  const cw = custom ? Number(custom[1]) : 832
  const ch = custom ? Number(custom[2]) : 1216
  return (
    <>
      <h3>画像生成デフォルト</h3>
      <p className="muted">LLM が出力した JSON で省略されたキーに適用される値です。JSON 側で明示された値が常に優先されます。LLM にもこのデフォルトが伝えられます。</p>
      <Field label="モデル">
        <ModelSelect value={value.model} options={NAI_MODELS} labels={MODEL_LABELS} onChange={(m) => upd('model', m)} />
      </Field>
      <Field label="解像度">
        <div className="row">
          <select value={isPreset ? value.size : 'custom'} onChange={(e) => upd('size', e.target.value === 'custom' ? `${cw}x${ch}` : e.target.value)}>
            {Object.keys(NAI_SIZE_PRESETS).map((k) => (
              <option key={k} value={k}>
                {SIZE_LABELS[k] ?? k}
              </option>
            ))}
            <option value="custom">カスタム</option>
          </select>
          {!isPreset && (
            <>
              <input type="number" step={64} min={64} max={2048} value={cw} onChange={(e) => upd('size', `${e.target.value}x${ch}`)} style={{ width: 90 }} />
              <span>×</span>
              <input type="number" step={64} min={64} max={2048} value={ch} onChange={(e) => upd('size', `${cw}x${e.target.value}`)} style={{ width: 90 }} />
            </>
          )}
        </div>
      </Field>
      <Field label="Steps (1〜50)">
        <input type="number" min={1} max={50} value={value.steps} onChange={(e) => upd('steps', clamp(Number(e.target.value), 1, 50))} />
      </Field>
      <Field label="Scale / CFG (0〜10)">
        <input type="number" min={0} max={10} step={0.1} value={value.scale} onChange={(e) => upd('scale', clamp(Number(e.target.value), 0, 10))} />
      </Field>
      <Field label="サンプラー">
        <select value={value.sampler} onChange={(e) => upd('sampler', e.target.value)}>
          {NAI_SAMPLERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ノイズスケジュール">
        <select value={value.noise_schedule} onChange={(e) => upd('noise_schedule', e.target.value)}>
          {NAI_NOISE_SCHEDULES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="UC プリセット">
        <select value={value.uc_preset} onChange={(e) => upd('uc_preset', e.target.value)}>
          {NAI_UC_PRESETS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="共通ネガティブ">
        <input value={value.negative_prompt} onChange={(e) => upd('negative_prompt', e.target.value)} placeholder="JSON に negative_prompt が無いときに使う (UC プリセットと結合)" />
      </Field>
      <Field label="1 リクエストの枚数 (1〜8)">
        <input type="number" min={1} max={8} value={value.n_samples} onChange={(e) => upd('n_samples', clamp(Number(e.target.value), 1, 8))} />
      </Field>
      <Field label="CFG Rescale (0〜1)">
        <input type="number" min={0} max={1} step={0.05} value={value.cfg_rescale} onChange={(e) => upd('cfg_rescale', clamp(Number(e.target.value), 0, 1))} />
      </Field>
      <Field label="品質タグ自動付与">
        <input type="checkbox" checked={value.quality} onChange={(e) => upd('quality', e.target.checked)} style={{ width: 'auto' }} />
      </Field>
      <Field label="Variety Boost">
        <input type="checkbox" checked={value.variety_boost} onChange={(e) => upd('variety_boost', e.target.checked)} style={{ width: 'auto' }} />
      </Field>
    </>
  )
}

/** Dropdown of known ids plus a "custom" entry that reveals a free-text input */
function ModelSelect({
  value,
  options,
  labels,
  onChange
}: {
  value: string
  options: readonly string[]
  labels?: Record<string, string>
  onChange: (v: string) => void
}): React.JSX.Element {
  const known = options.includes(value)
  const [custom, setCustom] = useState(!known)
  const showCustom = custom || !known
  return (
    <div className="row">
      <select
        value={showCustom ? '__custom__' : value}
        onChange={(e) => {
          if (e.target.value === '__custom__') setCustom(true)
          else {
            setCustom(false)
            onChange(e.target.value)
          }
        }}
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {labels?.[m] ? `${labels[m]} (${m})` : m}
          </option>
        ))}
        <option value="__custom__">カスタム (ID を直接入力)</option>
      </select>
      {showCustom && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="model id" />}
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  )
}

function DirField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <Field label={label}>
      <div className="row">
        <input value={value} onChange={(e) => onChange(e.target.value)} />
        <button
          onClick={() =>
            void window.api.pickDir(value).then((p) => {
              if (p) onChange(p)
            })
          }
        >
          選択
        </button>
        <button onClick={() => void window.api.openPath(value)}>開く</button>
      </div>
    </Field>
  )
}
