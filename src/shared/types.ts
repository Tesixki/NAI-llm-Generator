// Shared types between main, preload and renderer

export type ProviderId = 'anthropic' | 'openai' | 'claude-cli' | 'devin-cli'

export interface McpServerConfig {
  /** stdio: command + args, http: url, builtin: server bundled in the app (e.g. "danbooru") */
  type?: 'stdio' | 'http' | 'builtin'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}

export interface CliProviderConfig {
  /** executable name or full path */
  command: string
  /** extra args appended to the generated command line */
  extraArgs: string
  /** model flag value (empty = CLI default) */
  model: string
}

export interface AppConfig {
  provider: ProviderId
  anthropic: { apiKey: string; model: string; baseUrl: string; maxTokens: number }
  openai: { apiKey: string; model: string; baseUrl: string }
  claudeCli: CliProviderConfig
  devinCli: CliProviderConfig
  novelai: { apiKey: string; imageBase: string; timeoutSec: number }
  /** optional Danbooru credentials for the built-in Danbooru tools (raises rate limits) */
  danbooru: { login: string; apiKey: string }
  outputDir: string
  skillsDir: string
  formatsDir: string
  mcpServers: Record<string, McpServerConfig>
  /** max agent tool-loop iterations */
  maxIterations: number
  autoGenerate: boolean
  selectedSkills: string[]
  selectedFormat: string
  language: 'ja' | 'en'
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  path: string
  kind: 'skill' | 'format'
}

export interface McpServerStatus {
  name: string
  enabled: boolean
  connected: boolean
  error?: string
  tools: { name: string; description?: string }[]
}

export type AgentEvent =
  | { type: 'status'; runId: string; message: string }
  | { type: 'llm-text'; runId: string; text: string }
  | { type: 'tool-call'; runId: string; tool: string; args: unknown }
  | { type: 'tool-result'; runId: string; tool: string; result: string; isError?: boolean }
  | { type: 'cli-output'; runId: string; line: string }
  | { type: 'done'; runId: string; json?: unknown; text: string }
  | { type: 'error'; runId: string; message: string }

export interface AgentRunRequest {
  instruction: string
  skillIds: string[]
  formatId: string
  /** optional previous JSON to refine */
  previousJson?: unknown
}

export interface AgentRunResult {
  runId: string
  json?: unknown
  text: string
}

export interface GeneratedImage {
  path: string
  name: string
  seed: number
  width: number
  height: number
  requestPath: string
}

export interface GenerateProgress {
  jobId: string
  index: number
  total: number
  name: string
  status: 'start' | 'done' | 'error'
  message?: string
  images?: GeneratedImage[]
}

export interface GenerateResult {
  jobId: string
  images: GeneratedImage[]
  errors: { name: string; message: string }[]
}

export interface HistoryEntry {
  id: string
  createdAt: string
  instruction: string
  provider: ProviderId
  json: unknown
  images: GeneratedImage[]
}
