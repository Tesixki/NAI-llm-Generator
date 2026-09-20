/**
 * Dev-only smoke test, enabled with NAI_SMOKE_DIR=<dir>:
 * waits for the UI + MCP, screenshots the window, calls one Danbooru tool, then quits.
 * NAI_SMOKE_AGENT=<provider id> additionally runs one agent turn with that provider (no image generation).
 */
import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { mcpManager } from './mcp/manager'
import { loadConfig } from './config'
import { runAgent } from './llm/agent'
import type { ProviderId } from '@shared/types'

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

    if (process.env.NAI_SMOKE_SETTINGS) {
      // open 設定 → 画像生成デフォルト and screenshot it
      await win.webContents.executeJavaScript(`document.querySelector('button[title="設定"]')?.click()`)
      await new Promise((r) => setTimeout(r, 500))
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('.modal-side button')].find(b => b.textContent.includes('画像生成'))?.click()`)
      await new Promise((r) => setTimeout(r, 500))
      await win.webContents.executeJavaScript(`document.querySelector('.modal-body select')?.focus()`)
      await new Promise((r) => setTimeout(r, 300))
      fs.writeFileSync(path.join(dir, 'settings.png'), (await win.webContents.capturePage()).toPNG())
      const opts = await win.webContents.executeJavaScript(`[...document.querySelector('.modal-body select').options].map(o => o.value).join(', ')`)
      console.log('[smoke] model options:', opts)
    }
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
    const providerId = process.env.NAI_SMOKE_AGENT as ProviderId | undefined
    if (providerId) {
      const cfg = { ...loadConfig(), provider: providerId }
      const res = await runAgent({
        cfg,
        request: {
          instruction: process.env.NAI_SMOKE_INSTRUCTION ?? 'ブルーアーカイブのアロナの立ち絵を 1 枚。教室、窓際、笑顔。JSON だけ作ってください。',
          skillIds: ['novelai-prompt-rules', 'danbooru-research'],
          formatId: 'novelai-json-minimal'
        },
        signal: new AbortController().signal,
        emit: (ev) => console.log('[smoke:agent]', JSON.stringify(ev).slice(0, 400))
      })
      console.log('[smoke] agent result json:', JSON.stringify(res.json, null, 2))
    }
  } catch (e) {
    console.error('[smoke] failed:', e)
  } finally {
    app.quit()
  }
}
