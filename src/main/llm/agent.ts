import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentRunRequest, AgentRunResult, AppConfig } from '@shared/types'
import { mcpManager } from '../mcp/manager'
import { listSkills, readSkillBody } from '../skills'
import { AnthropicProvider } from './anthropic'
import { CliProvider } from './cli'
import { OpenAIProvider } from './openai'
import type { LLMProvider, ToolDef } from './types'

const BASE_SYSTEM = `あなたは NovelAI (Diffusion V4/V4.5) 向けの画像生成リクエストを作成する専門家です。
ユーザーの自然言語の指示から、後述の「出力フォーマット」に厳密に従った JSON を作成してください。

## 作業手順
1. 指示を読み、登場キャラクター・版権・シチュエーション・構図・画風を整理する。
2. キャラクター名や固有名詞が出てきたら、利用可能な Danbooru ツール (get_character_tags / get_wiki_info など) で正式な Danbooru タグ名と、そのキャラクターに頻出する外見タグ (髪色・目の色・服装など) を必ず確認する。推測でタグを書かないこと。
3. 一般タグは Danbooru の慣習 (小文字、単語はアンダースコア区切り) で記述する。
4. 「スキル」セクションにあるプロンプト規約・順序・強調記法を守る。
5. 完成した JSON を提出する。JSON にはコメント用に "_" で始まるキーを使ってよい。

## 出力の要件
- 出力は必ず 1 つの JSON オブジェクト。
- prompt は英語の Danbooru タグ列。説明文は書かない。
- ユーザーが枚数・サイズ・モデル等を指定した場合はそれを反映し、指定がなければフォーマットのデフォルトに従う。
- 複数パターンが求められた場合は "requests" 配列を使ったバッチ形式にする。`

const SUBMIT_INSTRUCTION_API = `\n## 提出方法\n最終 JSON は必ず \`submit_request\` ツールで提出してください (request 引数に JSON オブジェクトをそのまま渡す)。テキストで JSON を書くだけでは受理されません。`
const SUBMIT_INSTRUCTION_TEXT = `\n## 提出方法\n最終回答の末尾に、完成した JSON を \`\`\`json フェンス付きコードブロックで 1 つだけ出力してください。コードブロックの外には短い説明のみ書いてください。`

export interface AgentRunOptions {
  cfg: AppConfig
  request: AgentRunRequest
  emit: (ev: AgentEvent) => void
  signal: AbortSignal
}

export function buildProvider(cfg: AppConfig): LLMProvider {
  switch (cfg.provider) {
    case 'anthropic':
      return new AnthropicProvider(cfg.anthropic)
    case 'openai':
      return new OpenAIProvider(cfg.openai)
    case 'claude-cli':
      return new CliProvider('claude-cli', cfg.claudeCli, cfg)
    case 'devin-cli':
      return new CliProvider('devin-cli', cfg.devinCli, cfg)
    default:
      throw new Error(`Unknown provider: ${String(cfg.provider)}`)
  }
}

export function buildSystemPrompt(cfg: AppConfig, req: AgentRunRequest, isCli: boolean): string {
  const skills = listSkills()
  const parts: string[] = [BASE_SYSTEM]
  const chosen = skills.filter((s) => s.kind === 'skill' && req.skillIds.includes(s.id))
  if (chosen.length) {
    parts.push('\n# スキル (プロンプト規約・知識)')
    for (const s of chosen) parts.push(`\n## ${s.name}\n\n${readSkillBody(s)}`)
  }
  const format = skills.find((s) => s.kind === 'format' && s.id === req.formatId) ?? skills.find((s) => s.kind === 'format')
  if (format) {
    parts.push(`\n# 出力フォーマット: ${format.name}\n\n${readSkillBody(format)}`)
  } else {
    parts.push('\n# 出力フォーマット\n\n{"prompt": "<danbooru tags>", "negative_prompt": "", "model": "nai-diffusion-4-5-full", "size": "portrait", "steps": 23, "scale": 5.0, "n_samples": 1}')
  }
  const tools = mcpManager.allTools()
  if (tools.length) {
    parts.push('\n# 利用可能な MCP ツール')
    for (const t of tools) parts.push(`- ${isCli ? `mcp__${t.server}__${t.name}` : t.id}: ${t.description.split('\n')[0].slice(0, 200)}`)
  } else {
    parts.push('\n# 注意\nDanbooru ツールは現在利用できません。タグは自身の知識で慎重に記述してください。')
  }
  parts.push(isCli ? SUBMIT_INSTRUCTION_TEXT : SUBMIT_INSTRUCTION_API)
  return parts.join('\n')
}

export function buildUserPrompt(req: AgentRunRequest): string {
  const parts = [`# 指示\n\n${req.instruction.trim()}`]
  if (req.previousJson !== undefined) {
    parts.push(`\n# 現在の JSON (これを上記の指示に従って修正・改善してください)\n\n\`\`\`json\n${JSON.stringify(req.previousJson, null, 2)}\n\`\`\``)
  }
  return parts.join('\n')
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { cfg, request, emit, signal } = opts
  const runId = randomUUID()
  const provider = buildProvider(cfg)
  const isCli = provider.id.endsWith('-cli')
  const tools: ToolDef[] = mcpManager.allTools().map((t) => ({ id: t.id, description: t.description, inputSchema: t.inputSchema }))
  const systemPrompt = buildSystemPrompt(cfg, request, isCli)
  const userPrompt = buildUserPrompt(request)

  emit({ type: 'status', runId, message: `プロバイダ: ${provider.id} / ツール: ${tools.length} 件` })
  try {
    const res = await provider.run({
      runId,
      systemPrompt,
      userPrompt,
      tools,
      callTool: (id, args) => mcpManager.callTool(id, args),
      emit,
      maxIterations: cfg.maxIterations || 30,
      signal
    })
    emit({ type: 'done', runId, json: res.json, text: res.text })
    return { runId, json: res.json, text: res.text }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    emit({ type: 'error', runId, message })
    throw e
  }
}
