import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppConfig, GeneratedImage, GenerateProgress, GenerateResult } from '@shared/types'
import { NovelAIClient } from './client'
import { convertRequest, stripComments, type UserRequest } from './convert'

export interface BatchItem {
  name: string
  request: UserRequest
}

/** Expand a single request or a `requests` batch into named items */
export function expandBatch(json: unknown, stem: string): BatchItem[] {
  if (!json || typeof json !== 'object') throw new Error('Request JSON must be an object')
  const obj = json as Record<string, unknown>
  if (Array.isArray(obj.requests)) {
    const defaults: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) if (k !== 'requests' && !k.startsWith('_')) defaults[k] = v
    return (obj.requests as Record<string, unknown>[]).map((r, i) => {
      const name = typeof r._name === 'string' && r._name ? r._name : `${stem}_${String(i + 1).padStart(3, '0')}`
      const merged: Record<string, unknown> = { ...defaults }
      for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined) merged[k] = v
      return { name: safeName(name), request: stripComments(merged) as unknown as UserRequest }
    })
  }
  return [{ name: safeName(stem), request: stripComments(obj) as unknown as UserRequest }]
}

function safeName(n: string): string {
  return n.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'image'
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export interface GenerateOptions {
  json: unknown
  /** base directory for relative image paths inside the JSON */
  baseDir?: string
  stem?: string
  onProgress?: (p: GenerateProgress) => void
  signal?: AbortSignal
}

export async function runGeneration(cfg: AppConfig, opts: GenerateOptions): Promise<GenerateResult> {
  const jobId = randomUUID()
  const client = new NovelAIClient({
    apiKey: cfg.novelai.apiKey,
    imageBase: cfg.novelai.imageBase,
    timeoutMs: cfg.novelai.timeoutSec * 1000
  })
  const items = expandBatch(opts.json, opts.stem ?? 'gen')
  const outDir = path.join(cfg.outputDir, timestamp())
  fs.mkdirSync(outDir, { recursive: true })
  const baseDir = opts.baseDir ?? cfg.outputDir

  const images: GeneratedImage[] = []
  const errors: { name: string; message: string }[] = []

  for (let i = 0; i < items.length; i++) {
    if (opts.signal?.aborted) break
    const item = items[i]
    opts.onProgress?.({ jobId, index: i, total: items.length, name: item.name, status: 'start' })
    try {
      const converted = await convertRequest(item.request, {
        baseDir,
        client,
        defaults: cfg.generationDefaults,
        log: (m) => opts.onProgress?.({ jobId, index: i, total: items.length, name: item.name, status: 'start', message: m })
      })
      const blobs = await client.generateImage(converted.payload)
      const requestPath = path.join(outDir, `${item.name}.json`)
      const record = { ...item.request, seed: converted.seed, _generated_at: new Date().toISOString() }
      fs.writeFileSync(requestPath, JSON.stringify(record, null, 2), 'utf-8')
      const produced: GeneratedImage[] = []
      blobs.forEach((blob, bi) => {
        const ext = blob.filename.split('.').pop() ?? 'png'
        const suffix = blobs.length > 1 ? `_${bi}` : ''
        const file = path.join(outDir, `${item.name}${suffix}.${ext}`)
        fs.writeFileSync(file, blob.data)
        produced.push({
          path: file,
          name: `${item.name}${suffix}`,
          seed: converted.seed,
          width: converted.width,
          height: converted.height,
          requestPath
        })
      })
      images.push(...produced)
      opts.onProgress?.({ jobId, index: i, total: items.length, name: item.name, status: 'done', images: produced })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ name: item.name, message })
      opts.onProgress?.({ jobId, index: i, total: items.length, name: item.name, status: 'error', message })
    }
  }
  return { jobId, images, errors }
}
