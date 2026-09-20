import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AgentEvent,
  AgentRunRequest,
  AgentRunResult,
  AppConfig,
  GenerateProgress,
  GenerateResult,
  HistoryEntry,
  McpServerStatus,
  SkillInfo
} from '@shared/types'

type Unsub = () => void
function on<T>(channel: string, cb: (payload: T) => void): Unsub {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:save', patch),
  appPaths: (): Promise<{ userData: string; config: string; version: string }> => ipcRenderer.invoke('app:paths'),

  listSkills: (): Promise<SkillInfo[]> => ipcRenderer.invoke('skills:list'),
  openSkillsFolder: (kind: 'skill' | 'format'): Promise<void> => ipcRenderer.invoke('skills:openFolder', kind),

  mcpStatus: (): Promise<McpServerStatus[]> => ipcRenderer.invoke('mcp:status'),
  mcpReload: (): Promise<McpServerStatus[]> => ipcRenderer.invoke('mcp:reload'),
  onMcpChanged: (cb: () => void): Unsub => on('mcp:changed', cb),

  runAgent: (req: AgentRunRequest): Promise<AgentRunResult> => ipcRenderer.invoke('agent:run', req),
  cancelAgent: (): Promise<void> => ipcRenderer.invoke('agent:cancel'),
  onAgentEvent: (cb: (ev: AgentEvent) => void): Unsub => on('agent:event', cb),

  generate: (payload: { json: unknown; stem?: string; baseDir?: string }): Promise<GenerateResult> => ipcRenderer.invoke('generate:run', payload),
  cancelGenerate: (): Promise<void> => ipcRenderer.invoke('generate:cancel'),
  onGenerateProgress: (cb: (p: GenerateProgress) => void): Unsub => on('generate:progress', cb),

  historyList: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
  historyAdd: (entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<HistoryEntry> => ipcRenderer.invoke('history:add', entry),
  historyClear: (): Promise<void> => ipcRenderer.invoke('history:clear'),

  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:openPath', p),
  showItem: (p: string): Promise<void> => ipcRenderer.invoke('shell:showItem', p),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  pickDir: (current?: string): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir', current),
  pickJson: (): Promise<{ path: string; text: string } | null> => ipcRenderer.invoke('dialog:pickJson'),
  saveJson: (text: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveJson', text),

  /** URL usable in <img src> for a local file */
  localUrl: (p: string): string => `nai-local://file/${encodeURIComponent(p.replace(/\\/g, '/'))}`
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
