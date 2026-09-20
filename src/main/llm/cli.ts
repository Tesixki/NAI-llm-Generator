import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppConfig, CliProviderConfig } from '@shared/types'
import { resolvePlaceholders } from '../config'
import { extractJson, type LLMProvider, type ProviderRunContext, type ProviderRunResult } from './types'

/**
 * Runs an agentic coding CLI (Claude Code / Devin CLI) in non-interactive mode.
 * The CLI does its own MCP tool calls; we only parse the final answer.
 */
export class CliProvider implements LLMProvider {
  constructor(
    readonly id: 'claude-cli' | 'devin-cli',
    private cli: CliProviderConfig,
    private appCfg: AppConfig
  ) {}

  async run(ctx: ProviderRunContext): Promise<ProviderRunResult> {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-llm-'))
    try {
      const { args, stdin, cwd } = this.id === 'claude-cli' ? this.claudeArgs(ctx, work) : this.devinArgs(ctx, work)
      const extra = splitArgs(this.cli.extraArgs)
      const stdout = await runProcess(this.cli.command || this.id, [...args, ...extra], {
        cwd,
        stdin,
        signal: ctx.signal,
        onLine: (line) => ctx.emit({ type: 'cli-output', runId: ctx.runId, line })
      })
      const text = this.id === 'claude-cli' ? parseClaudeOutput(stdout) : stdout.trim()
      ctx.emit({ type: 'llm-text', runId: ctx.runId, text })
      return { text, json: extractJson(text) }
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  }

  /** Enabled MCP servers in the common {command,args,env}/{url} shape (builtin danbooru → electron-as-node stdio) */
  private mcpServerEntries(): Record<string, Record<string, unknown>> {
    const servers: Record<string, Record<string, unknown>> = {}
    for (const [name, s] of Object.entries(this.appCfg.mcpServers)) {
      if (s.enabled === false) continue
      if (s.type === 'builtin') {
        servers[name] = {
          type: 'stdio',
          command: process.execPath,
          args: [path.join(__dirname, 'danbooru-mcp-stdio.js')],
          env: { ELECTRON_RUN_AS_NODE: '1', DANBOORU_LOGIN: this.appCfg.danbooru.login, DANBOORU_API_KEY: this.appCfg.danbooru.apiKey }
        }
      } else if (s.type === 'http' || (s.url && !s.command)) {
        servers[name] = { type: 'http', url: s.url, headers: s.headers }
      } else {
        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(s.env ?? {})) env[k] = resolvePlaceholders(v, this.appCfg)
        servers[name] = { type: 'stdio', command: s.command, args: (s.args ?? []).map((a) => resolvePlaceholders(a, this.appCfg)), env }
      }
    }
    return servers
  }

  private claudeArgs(ctx: ProviderRunContext, work: string): { args: string[]; stdin: string; cwd: string } {
    const sysFile = path.join(work, 'system.md')
    fs.writeFileSync(sysFile, ctx.systemPrompt, 'utf-8')
    const mcpFile = path.join(work, 'mcp.json')
    const servers = this.mcpServerEntries()
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8')
    const allowed = Object.keys(servers).map((n) => `mcp__${n}`)
    const args = [
      '-p',
      '--output-format',
      'json',
      '--append-system-prompt-file',
      sysFile,
      '--mcp-config',
      mcpFile,
      '--strict-mcp-config',
      '--disallowedTools',
      'Bash',
      'Edit',
      'Write',
      'MultiEdit',
      'NotebookEdit',
      'WebFetch',
      'WebSearch',
      'Task'
    ]
    if (allowed.length) args.push('--allowedTools', ...allowed)
    if (this.cli.model) args.push('--model', this.cli.model)
    return { args, stdin: ctx.userPrompt, cwd: work }
  }

  private devinArgs(ctx: ProviderRunContext, work: string): { args: string[]; stdin: string; cwd: string } {
    // Devin CLI has no system-prompt flag: the system prompt is embedded at the top of the prompt file.
    // MCP servers are passed through the project-level config (<cwd>/.devin/mcp_config.json).
    const promptFile = path.join(work, 'prompt.md')
    fs.writeFileSync(promptFile, `${ctx.systemPrompt}

---

# ユーザーの指示

${ctx.userPrompt}
`, 'utf-8')
    const devinDir = path.join(work, '.devin')
    fs.mkdirSync(devinDir, { recursive: true })
    const servers: Record<string, Record<string, unknown>> = {}
    for (const [name, s] of Object.entries(this.mcpServerEntries())) {
      const { type, ...rest } = s
      servers[name] = { ...rest, transport: type === 'http' ? 'http' : 'stdio' }
    }
    fs.writeFileSync(path.join(devinDir, 'mcp_config.json'), JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8')
    // "dangerous" auto-approves every tool call; print mode cannot show approval prompts.
    const args = ['--print', '--prompt-file', promptFile, '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false']
    if (this.cli.model) args.push('--model', this.cli.model)
    return { args, stdin: '', cwd: work }
  }
}

function parseClaudeOutput(stdout: string): string {
  const trimmed = stdout.trim()
  try {
    const obj = JSON.parse(trimmed) as { result?: string; is_error?: boolean; subtype?: string }
    if (obj.is_error) throw new Error(`claude CLI error: ${obj.result ?? obj.subtype ?? 'unknown'}`)
    if (typeof obj.result === 'string') return obj.result
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('claude CLI error')) throw e
    // fall through: the CLI printed plain text (older versions or extra logging)
    const start = trimmed.lastIndexOf('\n{')
    if (start >= 0) {
      try {
        const obj = JSON.parse(trimmed.slice(start + 1)) as { result?: string }
        if (typeof obj.result === 'string') return obj.result
      } catch {
        /* ignore */
      }
    }
  }
  return trimmed
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s ?? ''))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

interface RunOptions {
  cwd: string
  stdin: string
  signal: AbortSignal
  onLine: (line: string) => void
}

function runProcess(command: string, args: string[], opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32' && !/\.(exe|cmd|bat)$/i.test(command) && !path.isAbsolute(command)
    const finalArgs = useShell ? args.map(quoteWin) : args
    const child = spawn(command, finalArgs, {
      cwd: opts.cwd,
      shell: useShell,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' },
      windowsHide: true
    })
    const chunks: string[] = []
    let stderrTail = ''
    let buf = ''
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (d: string) => {
      chunks.push(d)
      buf += d
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const l of lines) if (l.trim()) opts.onLine(l)
    })
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (d: string) => {
      stderrTail = (stderrTail + d).slice(-4000)
      for (const l of d.split(/\r?\n/)) if (l.trim()) opts.onLine(`[stderr] ${l}`)
    })
    child.on('error', (e) => reject(new Error(`Failed to start "${command}": ${e.message}`)))
    child.on('close', (code) => {
      if (buf.trim()) opts.onLine(buf)
      if (opts.signal.aborted) return reject(new Error('cancelled'))
      if (code !== 0) return reject(new Error(`"${command}" exited with code ${code}\n${stderrTail}`))
      resolve(chunks.join(''))
    })
    const onAbort = (): void => {
      child.kill()
    }
    opts.signal.addEventListener('abort', onAbort, { once: true })
    if (opts.stdin) child.stdin.write(opts.stdin)
    child.stdin.end()
    const id = randomUUID().slice(0, 8)
    opts.onLine(`[${id}] $ ${command} ${finalArgs.join(' ')}`)
  })
}

function quoteWin(a: string): string {
  if (/^[A-Za-z0-9_\-.:\\/=]+$/.test(a)) return a
  return `"${a.replace(/"/g, '\\"')}"`
}
