/**
 * Dev-only smoke test, enabled with NAI_SMOKE_DIR=<dir>:
 * waits for the UI + MCP, screenshots the window, calls one Danbooru tool, then quits.
 */
import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { mcpManager } from './mcp/manager'

export async function runSmoke(win: BrowserWindow, mcpReady: Promise<void>): Promise<void> {
  const dir = process.env.NAI_SMOKE_DIR
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  try {
    await mcpReady
    await new Promise((r) => setTimeout(r, 2500))
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(dir, 'smoke.png'), img.toPNG())
    console.log('[smoke] screenshot saved')

    const tools = mcpManager.allTools()
    console.log('[smoke] tools:', tools.map((t) => t.id).join(', '))
    const wiki = tools.find((t) => t.name === 'get_wiki_info')
    if (wiki) {
      const res = await mcpManager.callTool(wiki.id, { tag_name: 'arona_(blue_archive)' })
      console.log(`[smoke] get_wiki_info isError=${res.isError}\n${res.text.slice(0, 600)}`)
    }
    const chara = tools.find((t) => t.name === 'get_character_tags')
    if (chara) {
      const res = await mcpManager.callTool(chara.id, { character_tag: 'arona_(blue_archive)', num_posts: 30, top_n: 15 })
      console.log(`[smoke] get_character_tags isError=${res.isError}\n${res.text.slice(0, 600)}`)
    }
  } catch (e) {
    console.error('[smoke] failed:', e)
  } finally {
    app.quit()
  }
}
