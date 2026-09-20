import { useEffect, useState } from 'react'
import type { AppConfig, McpServerConfig, McpServerStatus } from '@shared/types'

interface Props {
  cfg: AppConfig
  mcp: McpServerStatus[]
  onClose: () => void
  onSave: (patch: Partial<AppConfig>) => Promise<void>
}

type Section = 'llm' | 'novelai' | 'mcp' | 'paths'

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
                <input value={draft.anthropic.model} onChange={(e) => setSub('anthropic', { model: e.target.value })} list="claude-models" />
                <datalist id="claude-models">
                  <option value="claude-fable-5-1" />
                  <option value="claude-opus-5" />
                  <option value="claude-sonnet-5" />
                  <option value="claude-haiku-4-5-20251001" />
                </datalist>
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
