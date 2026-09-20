import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { SkillInfo } from '@shared/types'
import { loadConfig } from './config'

/** Where the bundled default skills/formats live (dev: ./resources, packaged: resources/) */
export function bundledResourcesDir(): string {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'resources')]
    : [path.join(app.getAppPath(), 'resources'), path.join(__dirname, '../../resources')]
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0]
}

/** Copy bundled defaults into the user dirs on first run (never overwrites user files) */
export function ensureDefaultSkills(): void {
  const cfg = loadConfig()
  const pairs: Array<[string, string]> = [
    ['skills', cfg.skillsDir],
    ['formats', cfg.formatsDir]
  ]
  for (const [sub, dest] of pairs) {
    const src = path.join(bundledResourcesDir(), sub)
    fs.mkdirSync(dest, { recursive: true })
    if (!fs.existsSync(src)) continue
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const from = path.join(src, entry.name)
      const to = path.join(dest, entry.name)
      if (fs.existsSync(to)) continue
      fs.cpSync(from, to, { recursive: true })
    }
  }
}

interface Frontmatter {
  meta: Record<string, string>
  body: string
}

export function parseFrontmatter(text: string): Frontmatter {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: text }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (mm) meta[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: m[2] }
}

function listDir(dir: string, kind: 'skill' | 'format'): SkillInfo[] {
  if (!fs.existsSync(dir)) return []
  const out: SkillInfo[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    let file: string | null = null
    let id = entry.name
    if (entry.isDirectory()) {
      // Claude-style skill folder: <name>/SKILL.md
      const candidate = path.join(dir, entry.name, 'SKILL.md')
      if (fs.existsSync(candidate)) file = candidate
    } else if (/\.(md|txt|json)$/i.test(entry.name)) {
      file = path.join(dir, entry.name)
      id = entry.name.replace(/\.(md|txt|json)$/i, '')
    }
    if (!file) continue
    const text = fs.readFileSync(file, 'utf-8')
    const { meta, body } = parseFrontmatter(text)
    const firstLine = body.split(/\r?\n/).find((l) => l.trim())?.replace(/^#+\s*/, '') ?? ''
    out.push({
      id,
      name: meta.name || id,
      description: meta.description || firstLine.slice(0, 120),
      path: file,
      kind
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function listSkills(): SkillInfo[] {
  const cfg = loadConfig()
  return [...listDir(cfg.skillsDir, 'skill'), ...listDir(cfg.formatsDir, 'format')]
}

export function readSkillBody(info: SkillInfo): string {
  const text = fs.readFileSync(info.path, 'utf-8')
  return parseFrontmatter(text).body.trim()
}

export function openSkillsFolder(kind: 'skill' | 'format'): void {
  const cfg = loadConfig()
  const dir = kind === 'skill' ? cfg.skillsDir : cfg.formatsDir
  fs.mkdirSync(dir, { recursive: true })
  void shell.openPath(dir)
}
