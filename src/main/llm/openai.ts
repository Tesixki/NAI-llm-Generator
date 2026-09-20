import OpenAI from 'openai'
import type { AppConfig } from '@shared/types'
import { SUBMIT_TOOL, extractJson, truncate, type LLMProvider, type ProviderRunContext, type ProviderRunResult } from './types'

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool

/** OpenAI-compatible chat completions (OpenAI, LM Studio, Ollama, vLLM, OpenRouter, ...) */
export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai'
  constructor(private cfg: AppConfig['openai']) {}

  async run(ctx: ProviderRunContext): Promise<ProviderRunResult> {
    const client = new OpenAI({
      apiKey: this.cfg.apiKey || 'sk-no-key',
      baseURL: this.cfg.baseUrl || undefined
    })
    const tools: ChatTool[] = [...ctx.tools, SUBMIT_TOOL].map((t) => ({
      type: 'function',
      function: {
        name: t.id,
        description: t.description.slice(0, 1024),
        parameters: normalizeSchema(t.inputSchema)
      }
    }))
    const messages: ChatMessage[] = [
      { role: 'system', content: ctx.systemPrompt },
      { role: 'user', content: ctx.userPrompt }
    ]
    let lastText = ''
    let submitted: unknown

    for (let iter = 0; iter < ctx.maxIterations; iter++) {
      if (ctx.signal.aborted) throw new Error('cancelled')
      ctx.emit({ type: 'status', runId: ctx.runId, message: `LLM 呼び出し中 (${iter + 1}/${ctx.maxIterations})` })
      const res = await client.chat.completions.create(
        { model: this.cfg.model, messages, tools, tool_choice: 'auto' },
        { signal: ctx.signal }
      )
      const choice = res.choices[0]
      if (!choice) throw new Error('LLM returned no choices')
      const msg = choice.message
      if (msg.content) {
        lastText = msg.content
        ctx.emit({ type: 'llm-text', runId: ctx.runId, text: msg.content })
      }
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })

      const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function')
      if (!calls.length) break

      for (const call of calls) {
        if (call.type !== 'function') continue
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          args = {}
        }
        ctx.emit({ type: 'tool-call', runId: ctx.runId, tool: call.function.name, args })
        if (call.function.name === SUBMIT_TOOL.id) {
          submitted = typeof args.request === 'string' ? extractJson(args.request) : args.request
          if (typeof args.notes === 'string') lastText = args.notes
          messages.push({ role: 'tool', tool_call_id: call.id, content: 'accepted' })
          continue
        }
        const r = await ctx.callTool(call.function.name, args)
        ctx.emit({ type: 'tool-result', runId: ctx.runId, tool: call.function.name, result: truncate(r.text), isError: r.isError })
        messages.push({ role: 'tool', tool_call_id: call.id, content: truncate(r.text, 20000) })
      }
      if (submitted !== undefined) break
    }
    return { text: lastText, json: submitted ?? extractJson(lastText) }
  }
}

/** Some OpenAI-compatible servers reject schemas without an explicit object type */
function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const s = { ...schema }
  if (!s.type) s.type = 'object'
  if (s.type === 'object' && !s.properties) s.properties = {}
  delete s.$schema
  return s
}
