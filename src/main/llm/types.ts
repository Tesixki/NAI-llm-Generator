import type { AgentEvent } from '@shared/types'

export interface ToolDef {
  id: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCallResult {
  text: string
  isError: boolean
}

export interface ProviderRunContext {
  runId: string
  systemPrompt: string
  userPrompt: string
  tools: ToolDef[]
  callTool: (id: string, args: Record<string, unknown>) => Promise<ToolCallResult>
  emit: (ev: AgentEvent) => void
  maxIterations: number
  signal: AbortSignal
}

export interface ProviderRunResult {
  text: string
  json?: unknown
}

export interface LLMProvider {
  readonly id: string
  run(ctx: ProviderRunContext): Promise<ProviderRunResult>
}

/** The built-in tool API providers call to hand back the final request JSON */
export const SUBMIT_TOOL: ToolDef = {
  id: 'submit_request',
  description:
    'Submit the final NovelAI generation request JSON. Call this exactly once when the JSON is complete. The `request` argument must be the full JSON object that follows the required output format.',
  inputSchema: {
    type: 'object',
    properties: {
      request: { type: 'object', description: 'The complete generation request JSON object' },
      notes: { type: 'string', description: 'Short explanation of the choices made (Japanese)' }
    },
    required: ['request']
  }
}

/** Extract a JSON object from free text (```json fences preferred, else the widest {...} span) */
export function extractJson(text: string): unknown | undefined {
  const fences = [...text.matchAll(/```(?:json|jsonc)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1])
  for (const body of fences.reverse()) {
    const parsed = tryParse(body)
    if (parsed !== undefined) return parsed
  }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) {
    const parsed = tryParse(text.slice(first, last + 1))
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function tryParse(s: string): unknown | undefined {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : undefined
  } catch {
    // tolerate trailing commas
    try {
      const v = JSON.parse(s.replace(/,\s*([}\]])/g, '$1'))
      return v && typeof v === 'object' ? v : undefined
    } catch {
      return undefined
    }
  }
}

export function truncate(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + `\n...[truncated ${s.length - n} chars]` : s
}
