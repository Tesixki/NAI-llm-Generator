import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadConfig } from './config'
import { registerIpc } from './ipc'
import { mcpManager } from './mcp/manager'
import { ensureDefaultSkills } from './skills'
import { runSmoke } from './smoke'

// Stable userData path even when launched as `electron out/main/index.js` (app name would be "Electron").
app.setName('nai-llm-generator')
app.setPath('userData', path.join(app.getPath('appData'), 'nai-llm-generator'))

// Serve local image files to the renderer without disabling web security.
protocol.registerSchemesAsPrivileged([{ scheme: 'nai-local', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: 'NAI LLM Generator',
    backgroundColor: '#12141a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer:${level === 3 ? 'error' : 'warn'}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('render-process-gone', (_e, details) => console.error('[renderer] gone:', details.reason))
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(async () => {
  protocol.handle('nai-local', (request) => {
    // nai-local://file/<encoded absolute path>
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  const cfg = loadConfig()
  ensureDefaultSkills()
  registerIpc()
  const win = createWindow()
  // Connect MCP servers in the background; the renderer polls status.
  const mcpReady = mcpManager.reload(cfg).then(() => win.webContents.send('mcp:changed'))
  void runSmoke(win, mcpReady)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void mcpManager.closeAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void mcpManager.closeAll()
})
