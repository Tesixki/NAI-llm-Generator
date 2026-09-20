import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createDanbooruServer } from './danbooru-server'
import type { AppConfig, McpServerConfig, McpServerStatus } from '@shared/types'
import { resolvePlaceholders } from '../config'

export interface McpTool {
  /** unique name exposed to the LLM: <server>__<tool> */
  id: string
  server: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface Connection {
  client: Client
  tools: McpTool[]
}

interface ContentPart {
  type: string
  text?: string
  mimeType?: string
  data?: string
  resource?: { uri?: string; text?: string }
}

/** Tool ids must satisfy Anthropic (^[a-zA-Z0-9_-]{1,128}$) and OpenAI (64 chars) rules */
export function toolId(server: string, tool: string): string {
  const clean = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${clean(server)}__${clean(tool)}`.slice(0, 64)
}

export class McpManager {
  private connections = new Map<string, Connection>()
  private errors = new Map<string, string>()
  private configs: Record<string, McpServerConfig> = {}

  async reload(cfg: AppConfig): Promise<void> {
    await this.closeAll()
    this.configs = cfg.mcpServers
    const jobs = Object.entries(cfg.mcpServers)
      .filter(([, c]) => c.enabled !== false)
      .map(([name, c]) => this.connect(name, c, cfg))
    await Promise.allSettled(jobs)
  }

  private async connect(name: string, c: McpServerConfig, cfg: AppConfig): Promise<void> {
    const client = new Client({ name: 'nai-llm-generator', version: '0.1.0' })
    try {
      if (c.type === 'builtin') {
        if (name !== 'danbooru') throw new Error(`Unknown builtin server "${name}" (only "danbooru" is available)`)
        const [clientT, serverT] = InMemoryTransport.createLinkedPair()
        const server = createDanbooruServer({ login: cfg.danbooru.login, apiKey: cfg.danbooru.apiKey })
        await server.connect(serverT)
        await client.connect(clientT)
      } else if (c.type === 'http' || (c.url && !c.command)) {
        if (!c.url) throw new Error('url is required for http server')
        const transport = new StreamableHTTPClientTransport(new URL(c.url), {
          requestInit: { headers: c.headers }
        })
        await client.connect(transport)
      } else {
        if (!c.command) throw new Error('command is required for stdio server')
        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
        for (const [k, v] of Object.entries(c.env ?? {})) env[k] = resolvePlaceholders(v, cfg)
        const transport = new StdioClientTransport({
          command: c.command,
          args: (c.args ?? []).map((a) => resolvePlaceholders(a, cfg)),
          env,
          stderr: 'pipe'
        })
        transport.stderr?.on('data', (d: Buffer) => {
          const line = d.toString().trim()
          if (line) console.log(`[mcp:${name}] ${line}`)
        })
        await client.connect(transport)
      }
      const listed = await client.listTools()
      const tools: McpTool[] = listed.tools.map((t) => ({
        id: toolId(name, t.name),
        server: name,
        name: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} }
      }))
      this.connections.set(name, { client, tools })
      this.errors.delete(name)
      console.log(`[mcp:${name}] connected, ${tools.length} tools`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.errors.set(name, msg)
      console.error(`[mcp:${name}] failed: ${msg}`)
      try {
        await client.close()
      } catch {
        /* ignore */
      }
    }
  }

  async closeAll(): Promise<void> {
    for (const [, conn] of this.connections) {
      try {
        await conn.client.close()
      } catch {
        /* ignore */
      }
    }
    this.connections.clear()
    this.errors.clear()
  }

  allTools(): McpTool[] {
    return [...this.connections.values()].flatMap((c) => c.tools)
  }

  findTool(id: string): McpTool | undefined {
    return this.allTools().find((t) => t.id === id)
  }

  status(): McpServerStatus[] {
    return Object.entries(this.configs).map(([name, c]) => {
      const conn = this.connections.get(name)
      return {
        name,
        enabled: c.enabled !== false,
        connected: !!conn,
        error: this.errors.get(name),
        tools: conn?.tools.map((t) => ({ name: t.name, description: t.description })) ?? []
      }
    })
  }

  /** Call a tool and flatten its content to text (images are summarised) */
  async callTool(id: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const tool = this.findTool(id)
    if (!tool) return { text: `Unknown tool: ${id}`, isError: true }
    const conn = this.connections.get(tool.server)
    if (!conn) return { text: `Server not connected: ${tool.server}`, isError: true }
    try {
      const res = await conn.client.callTool({ name: tool.name, arguments: args })
      const parts: string[] = []
      for (const c of (res.content as ContentPart[]) ?? []) {
        if (c.type === 'text') parts.push(c.text ?? '')
        else if (c.type === 'image') parts.push(`[image ${c.mimeType}, ${Math.round(((c.data?.length ?? 0) * 0.75) / 1024)} KB]`)
        else if (c.type === 'resource') parts.push(`[resource ${c.resource?.uri ?? ''}] ${c.resource?.text ?? ''}`)
        else parts.push(JSON.stringify(c))
      }
      if (res.structuredContent) parts.push(JSON.stringify(res.structuredContent))
      return { text: parts.join('\n') || '(empty result)', isError: !!res.isError }
    } catch (e) {
      return { text: `Tool error: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  }
}

export const mcpManager = new McpManager()
