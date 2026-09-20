import Anthropic from '@anthropic-ai/sdk'
import type { AppConfig } from '@shared/types'
import { SUBMIT_TOOL, extractJson, truncate, type LLMProvider, type ProviderRunContext, type ProviderRunResult } from './types'

type MessageParam = Anthropic.MessageParam
type ContentBlock = Anthropic.ContentBlock

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic'
  constructor(private cfg: AppConfig['anthropic']) {}

  async run(ctx: ProviderRunContext): Promise<ProviderRunResult> {
    if (!this.cfg.apiKey) throw new Error('Anthropic API key is not set (設定 → Claude API)')
    const client = new Anthropic({
      apiKey: this.cfg.apiKey,
      baseURL: this.cfg.baseUrl || undefined
    })
    const tools: Anthropic.Tool[] = [...ctx.tools, SUBMIT_TOOL].map((t) => ({
      name: t.id,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema']
    }))
    const messages: MessageParam[] = [{ role: 'user', content: ctx.userPrompt }]
    let lastText = ''
    let submitted: unknown

    for (let iter = 0; iter < ctx.maxIterations; iter++) {
      if (ctx.signal.aborted) throw new Error('cancelled')
      ctx.emit({ type: 'status', runId: ctx.runId, message: `Claude API 呼び出し中 (${iter + 1}/${ctx.maxIterations})` })
      const res = await client.messages.create(
        {
          model: this.cfg.model,
          max_tokens: this.cfg.maxTokens || 8192,
          system: ctx.systemPrompt,
          tools,
          messages
        },
        { signal: ctx.signal }
      )
      const blocks: ContentBlock[] = res.content
      const toolUses = blocks.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const texts = blocks.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text)
      if (texts.length) {
        lastText = texts.join('\n')
        ctx.emit({ type: 'llm-text', runId: ctx.runId, text: lastText })
      }
      messages.push({ role: 'assistant', content: blocks })

      if (!toolUses.length || res.stop_reason !== 'tool_use') break

      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const args = (tu.input ?? {}) as Record<string, unknown>
        ctx.emit({ type: 'tool-call', runId: ctx.runId, tool: tu.name, args })
        if (tu.name === SUBMIT_TOOL.id) {
          submitted = args.request
          if (typeof args.notes === 'string') lastText = args.notes
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'accepted' })
          continue
        }
        const r = await ctx.callTool(tu.name, args)
        ctx.emit({ type: 'tool-result', runId: ctx.runId, tool: tu.name, result: truncate(r.text), isError: r.isError })
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: truncate(r.text, 20000), is_error: r.isError })
      }
      messages.push({ role: 'user', content: results })
      if (submitted !== undefined) break
    }
    return { text: lastText, json: submitted ?? extractJson(lastText) }
  }
}
