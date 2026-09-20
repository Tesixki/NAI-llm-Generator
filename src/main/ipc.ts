import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentRunRequest, AppConfig, HistoryEntry } from '@shared/types'
import { configPath, loadConfig, saveConfig, userDataDir } from './config'
import { runAgent } from './llm/agent'
import { mcpManager } from './mcp/manager'
import { runGeneration } from './novelai/generate'
import { listSkills, openSkillsFolder } from './skills'

let agentAbort: AbortController | null = null
let genAbort: AbortController | null = null

function historyPath(): string {
  return path.join(userDataDir(), 'history.json')
}

function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(fs.readFileSync(historyPath(), 'utf-8')) as HistoryEntry[]
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  fs.writeFileSync(historyPath(), JSON.stringify(entries.slice(0, 300), null, 2), 'utf-8')
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

/** Strip secrets before sending config to the renderer? No: the renderer is our own settings UI. */
export function registerIpc(): void {
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:save', async (_e, patch: Partial<AppConfig>) => {
    const before = JSON.stringify(loadConfig().mcpServers) + loadConfig().novelai.apiKey + loadConfig().outputDir
    const next = saveConfig(patch)
    const after = JSON.stringify(next.mcpServers) + next.novelai.apiKey + next.outputDir
    if (before !== after) {
      void mcpManager.reload(next).then(() => broadcast('mcp:changed', null))
    }
    return next
  })
  ipcMain.handle('app:paths', () => ({ userData: userDataDir(), config: configPath(), version: app.getVersion() }))

  ipcMain.handle('skills:list', () => listSkills())
  ipcMain.handle('skills:openFolder', (_e, kind: 'skill' | 'format') => openSkillsFolder(kind))

  ipcMain.handle('mcp:status', () => mcpManager.status())
  ipcMain.handle('mcp:reload', async () => {
    await mcpManager.reload(loadConfig())
    broadcast('mcp:changed', null)
    return mcpManager.status()
  })

  ipcMain.handle('agent:run', async (e, req: AgentRunRequest) => {
    agentAbort?.abort()
    agentAbort = new AbortController()
    const cfg = loadConfig()
    return runAgent({
      cfg,
      request: req,
      signal: agentAbort.signal,
      emit: (ev) => {
        if (!e.sender.isDestroyed()) e.sender.send('agent:event', ev)
      }
    })
  })
  ipcMain.handle('agent:cancel', () => {
    agentAbort?.abort()
  })

  ipcMain.handle('generate:run', async (e, payload: { json: unknown; stem?: string; baseDir?: string }) => {
    genAbort?.abort()
    genAbort = new AbortController()
    const cfg = loadConfig()
    return runGeneration(cfg, {
      json: payload.json,
      stem: payload.stem,
      baseDir: payload.baseDir,
      signal: genAbort.signal,
      onProgress: (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('generate:progress', p)
      }
    })
  })
  ipcMain.handle('generate:cancel', () => {
    genAbort?.abort()
  })

  ipcMain.handle('history:list', () => readHistory())
  ipcMain.handle('history:add', (_e, entry: Omit<HistoryEntry, 'id' | 'createdAt'>) => {
    const entries = readHistory()
    const full: HistoryEntry = { id: randomUUID(), createdAt: new Date().toISOString(), ...entry }
    entries.unshift(full)
    writeHistory(entries)
    return full
  })
  ipcMain.handle('history:clear', () => writeHistory([]))

  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:showItem', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('dialog:pickDir', async (e, current?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: current || undefined })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('dialog:pickJson', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (res.canceled || !res.filePaths[0]) return null
    return { path: res.filePaths[0], text: fs.readFileSync(res.filePaths[0], 'utf-8') }
  })
  ipcMain.handle('dialog:saveJson', async (e, text: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showSaveDialog(win!, { filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: 'request.json' })
    if (res.canceled || !res.filePath) return null
    fs.writeFileSync(res.filePath, text, 'utf-8')
    return res.filePath
  })
}
