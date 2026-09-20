import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_CONFIG } from '@shared/defaults'
import type { AppConfig } from '@shared/types'

const SECRET_KEYS: Array<[keyof AppConfig, string]> = [
  ['anthropic', 'apiKey'],
  ['openai', 'apiKey'],
  ['novelai', 'apiKey'],
  ['danbooru', 'apiKey']
]
const ENC_PREFIX = 'enc:'

let cached: AppConfig | null = null

export function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function userDataDir(): string {
  return app.getPath('userData')
}

function encrypt(value: string): string {
  if (!value) return ''
  if (value.startsWith(ENC_PREFIX)) return value
  if (safeStorage.isEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
  }
  return value
}

function decrypt(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge<T>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[k]
    if (isPlainObject(v) && isPlainObject(baseVal)) {
      out[k] = deepMerge(baseVal, v)
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out as T
}

export function loadConfig(): AppConfig {
  if (cached) return cached
  let raw: Partial<AppConfig> = {}
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
  } catch {
    /* first run */
  }
  const cfg = deepMerge(DEFAULT_CONFIG, raw)
  // mcpServers is replaced wholesale by the saved value (so deleted servers stay deleted)
  if (raw.mcpServers) cfg.mcpServers = raw.mcpServers
  for (const [section, key] of SECRET_KEYS) {
    const sec = cfg[section] as unknown as Record<string, string>
    sec[key] = decrypt(sec[key] ?? '')
  }
  if (!cfg.outputDir) cfg.outputDir = path.join(app.getPath('pictures'), 'NAI-llm-Generator')
  if (!cfg.skillsDir) cfg.skillsDir = path.join(userDataDir(), 'skills')
  if (!cfg.formatsDir) cfg.formatsDir = path.join(userDataDir(), 'formats')
  cached = cfg
  return cfg
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const current = loadConfig()
  const next = deepMerge(current, patch)
  if (patch.mcpServers) next.mcpServers = patch.mcpServers
  if (patch.selectedSkills) next.selectedSkills = patch.selectedSkills
  cached = next
  const toWrite = JSON.parse(JSON.stringify(next)) as Record<string, Record<string, string>>
  for (const [section, key] of SECRET_KEYS) {
    toWrite[section][key] = encrypt(toWrite[section][key] ?? '')
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(toWrite, null, 2), 'utf-8')
  return next
}

/** Resolve ${VAR} placeholders in MCP env values using config + process env */
export function resolvePlaceholders(value: string, cfg: AppConfig): string {
  const vars: Record<string, string | undefined> = {
    ...process.env,
    NOVELAI_API_KEY: cfg.novelai.apiKey,
    ANTHROPIC_API_KEY: cfg.anthropic.apiKey,
    OPENAI_API_KEY: cfg.openai.apiKey,
    OUTPUT_DIR: cfg.outputDir
  }
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => vars[name] ?? '')
}
