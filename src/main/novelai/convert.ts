/**
 * Convert the user-facing JSON request format (see resources/formats/novelai-json.md)
 * into the raw NovelAI /ai/generate-image payload.
 * Mirrors the behaviour of the Python `novelai-sdk` converter.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Jimp } from 'jimp'
import type { NovelAIClient } from './client'
import type { GenerationDefaults } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/defaults'

export const SIZE_PRESETS: Record<string, [number, number]> = {
  portrait: [832, 1216],
  landscape: [1216, 832],
  square: [1024, 1024],
  large_portrait: [1024, 1536],
  large_landscape: [1536, 1024],
  wallpaper_portrait: [1088, 1920],
  wallpaper_landscape: [1920, 1088]
}

export const QUALITY_TAGS = ', very aesthetic, masterpiece, no text'

export const UC_PRESETS: Record<string, string> = {
  strong:
    ', lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, ',
  light:
    ', lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page, ',
  furry_focus:
    ', {worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic, ',
  human_focus:
    ', lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, ',
  none: ''
}
const UC_PRESET_INDEX: Record<string, number> = { strong: 0, light: 1, furry_focus: 2, human_focus: 3, none: 4 }

export interface UserCharacter {
  prompt: string
  negative_prompt?: string
  position?: [number, number] | string
  enabled?: boolean
}
export interface UserCharacterReference {
  image: string
  type?: 'character' | 'style' | 'character&style'
  fidelity?: number
  strength?: number
}
export interface UserControlNetImage {
  image: string
  info_extracted?: number
  strength?: number
}
export interface UserRequest {
  prompt: string
  negative_prompt?: string
  model?: string
  size?: string | [number, number]
  steps?: number
  scale?: number
  sampler?: string
  noise_schedule?: string
  seed?: number
  n_samples?: number
  quality?: boolean
  uc_preset?: string
  cfg_rescale?: number
  variety_boost?: boolean
  image_format?: 'png' | 'webp'
  characters?: UserCharacter[]
  character_references?: UserCharacterReference[]
  controlnet?: { images: UserControlNetImage[]; strength?: number }
  i2i?: { image: string; strength: number; noise?: number; seed?: number }
  inpaint?: { image: string; mask: string; strength?: number; seed?: number }
  [key: string]: unknown
}

export interface ConvertContext {
  baseDir: string
  client: NovelAIClient
  log?: (msg: string) => void
  /** app-level defaults for fields the request omits */
  defaults?: GenerationDefaults
}

export interface ConvertedRequest {
  payload: Record<string, unknown>
  seed: number
  width: number
  height: number
}

/** strip `_comment`-style keys recursively */
export function stripComments<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripComments) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('_')) continue
      out[k] = stripComments(v)
    }
    return out as T
  }
  return value
}

export function isV4(model: string): boolean {
  return !/diffusion-3/.test(model)
}

export function resolveSize(size: UserRequest['size']): [number, number] {
  if (!size) return SIZE_PRESETS.portrait
  if (typeof size === 'string') {
    const p = SIZE_PRESETS[size]
    if (p) return p
    const m = size.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i)
    if (m) return resolveSize([Number(m[1]), Number(m[2])])
    throw new Error(`Unknown size preset: ${size}`)
  }
  const [w, h] = size
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 64 || h < 64) throw new Error(`Invalid size: ${JSON.stringify(size)}`)
  return [w, h]
}

export function resolvePosition(pos: UserCharacter['position']): { x: number; y: number } {
  if (!pos) return { x: 0.5, y: 0.5 }
  if (typeof pos === 'string') {
    const m = pos.trim().toUpperCase().match(/^([A-E])([1-5])$/)
    if (!m) throw new Error(`Invalid position preset: ${pos}`)
    const col = 'ABCDE'.indexOf(m[1]) + 1
    const row = Number(m[2])
    return { x: (col - 0.5) / 5, y: (row - 0.5) / 5 }
  }
  const [x, y] = pos
  return { x: Number(x), y: Number(y) }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967295)
}

function resolvePath(p: string, baseDir: string): string {
  return path.isAbsolute(p) ? p : path.resolve(baseDir, p)
}

async function readImageBase64(p: string, baseDir: string): Promise<string> {
  const full = resolvePath(p, baseDir)
  if (!fs.existsSync(full)) throw new Error(`Image not found: ${full}`)
  return fs.readFileSync(full).toString('base64')
}

/** Resize to exactly target size (like the SDK's resize_base64) */
async function resizeBase64(b64: string, w: number, h: number): Promise<string> {
  const img = await Jimp.read(Buffer.from(b64, 'base64'))
  if (img.width === w && img.height === h) return b64
  img.resize({ w, h })
  return (await img.getBuffer('image/png')).toString('base64')
}

/** Fit into 1024x1536 with black padding, centred (character reference requirement) */
async function cropAndResize(b64: string): Promise<string> {
  const target = { w: 1024, h: 1536 }
  const img = await Jimp.read(Buffer.from(b64, 'base64'))
  img.scaleToFit({ w: target.w, h: target.h })
  const canvas = new Jimp({ width: target.w, height: target.h, color: 0x000000ff })
  canvas.composite(img, Math.floor((target.w - img.width) / 2), Math.floor((target.h - img.height) / 2))
  return (await canvas.getBuffer('image/png')).toString('base64')
}

async function maskToBase64(p: string, baseDir: string, w: number, h: number): Promise<string> {
  const full = resolvePath(p, baseDir)
  const img = await Jimp.read(full)
  img.resize({ w, h })
  return (await img.getBuffer('image/png')).toString('base64')
}

interface VibeFile {
  identifier?: string
  image?: string
  encodings?: Record<string, Record<string, { encoding: string; params?: { information_extracted?: number } }>>
  importInfo?: { model?: string; information_extracted?: number; strength?: number }
}

const VIBE_MODEL_KEYS: Record<string, string> = {
  'nai-diffusion-4-5-full': 'v4-5full',
  'nai-diffusion-4-5-curated': 'v4-5curated',
  'nai-diffusion-4-full': 'v4full',
  'nai-diffusion-4-curated': 'v4curated'
}

/** Returns the vibe encoding for a controlnet image (.naiv4vibe or a raw image via /ai/encode-vibe) */
async function encodeControlNetImage(item: UserControlNetImage, model: string, ctx: ConvertContext): Promise<string> {
  const full = resolvePath(item.image, ctx.baseDir)
  const info = item.info_extracted ?? 1.0
  if (full.toLowerCase().endsWith('.naiv4vibe')) {
    const vibe = JSON.parse(fs.readFileSync(full, 'utf-8')) as VibeFile
    if (vibe.identifier !== 'novelai-vibe-transfer') throw new Error(`Invalid .naiv4vibe: ${full}`)
    const key = VIBE_MODEL_KEYS[model]
    const bucket = key ? vibe.encodings?.[key] : undefined
    if (bucket) {
      // prefer exact information_extracted match, else the closest
      let best: { encoding: string; diff: number } | null = null
      for (const entry of Object.values(bucket)) {
        const ie = entry.params?.information_extracted ?? 1
        const diff = Math.abs(ie - info)
        if (!best || diff < best.diff) best = { encoding: entry.encoding, diff }
      }
      if (best && best.diff < 0.011) {
        ctx.log?.(`vibe: using cached encoding from ${path.basename(full)}`)
        return best.encoding
      }
    }
    if (!vibe.image) throw new Error(`.naiv4vibe has no image data to re-encode: ${full}`)
    ctx.log?.(`vibe: encoding ${path.basename(full)} via API (info_extracted=${info})`)
    return ctx.client.encodeVibe(vibe.image, info, model)
  }
  const b64 = await readImageBase64(item.image, ctx.baseDir)
  ctx.log?.(`vibe: encoding ${path.basename(full)} via API (info_extracted=${info})`)
  return ctx.client.encodeVibe(b64, info, model)
}

export async function convertRequest(input: UserRequest, ctx: ConvertContext): Promise<ConvertedRequest> {
  const req = stripComments(input)
  if (!req.prompt || typeof req.prompt !== 'string') throw new Error('"prompt" is required')

  const d = ctx.defaults ?? DEFAULT_CONFIG.generationDefaults
  const model = req.model ?? d.model
  const [width, height] = resolveSize(req.size ?? d.size)
  const quality = req.quality ?? d.quality
  const ucPreset = req.uc_preset ?? d.uc_preset
  if (!(ucPreset in UC_PRESET_INDEX)) throw new Error(`Unknown uc_preset: ${ucPreset}`)
  const seed = req.seed && req.seed > 0 ? req.seed : randomSeed()

  const prompt = quality ? req.prompt + QUALITY_TAGS : req.prompt
  const negative = (req.negative_prompt ?? d.negative_prompt ?? '') + UC_PRESETS[ucPreset]

  const characters = (req.characters ?? []).map((c) => ({
    prompt: c.prompt,
    uc: c.negative_prompt ?? '',
    center: resolvePosition(c.position),
    enabled: c.enabled ?? true
  }))
  const enabledChars = characters.filter((c) => c.enabled)

  const params: Record<string, unknown> = {
    params_version: 3,
    width,
    height,
    scale: req.scale ?? d.scale,
    sampler: req.sampler ?? d.sampler,
    steps: req.steps ?? d.steps,
    n_samples: req.n_samples ?? d.n_samples,
    ucPreset: UC_PRESET_INDEX[ucPreset],
    qualityToggle: quality,
    autoSmea: false,
    sm: false,
    sm_dyn: false,
    dynamic_thresholding: false,
    controlnet_strength: req.controlnet?.strength ?? 1,
    legacy: false,
    legacy_uc: false,
    legacy_v3_extend: false,
    add_original_image: false,
    cfg_rescale: req.cfg_rescale ?? d.cfg_rescale,
    noise_schedule: req.noise_schedule ?? d.noise_schedule,
    skip_cfg_above_sigma: (req.variety_boost ?? d.variety_boost) ? 58 : null,
    deliberate_euler_ancestral_bug: false,
    prefer_brownian: true,
    use_coords: false,
    normalize_reference_strength_multiple: false,
    seed,
    negative_prompt: negative,
    characterPrompts: characters
  }
  if (req.image_format) params.image_format = req.image_format

  if (isV4(model)) {
    params.v4_prompt = {
      caption: {
        base_caption: prompt,
        char_captions: enabledChars.map((c) => ({ char_caption: c.prompt, centers: [c.center] }))
      },
      use_coords: false,
      use_order: true
    }
    params.v4_negative_prompt = {
      caption: {
        base_caption: negative,
        char_captions: enabledChars.map((c) => ({ char_caption: c.uc, centers: [c.center] }))
      },
      legacy_uc: false
    }
  } else {
    params.prompt = prompt
  }

  // Character reference (Director tools, V4.5 only)
  if (req.character_references?.length) {
    const refs = req.character_references
    const images: string[] = []
    for (const r of refs) images.push(await cropAndResize(await readImageBase64(r.image, ctx.baseDir)))
    params.director_reference_images = images
    params.director_reference_descriptions = refs.map((r) => ({
      caption: { base_caption: r.type ?? 'character', char_captions: [] },
      legacy_uc: false
    }))
    params.director_reference_strength_values = refs.map((r) => round2(r.strength ?? 1.0))
    params.director_reference_secondary_strength_values = refs.map((r) => round2(1 - (r.fidelity ?? 1.0)))
    params.director_reference_information_extracted = refs.map(() => 1.0)
  }

  // Vibe transfer
  if (req.controlnet?.images?.length) {
    const encodings: string[] = []
    for (const img of req.controlnet.images) encodings.push(await encodeControlNetImage(img, model, ctx))
    params.reference_image_multiple = encodings
    params.reference_strength_multiple = req.controlnet.images.map((i) => i.strength ?? 0.6)
  }

  // img2img / inpaint
  let action = 'generate'
  let resolvedModel = model
  const src = req.inpaint ?? req.i2i
  if (src) {
    const raw = await readImageBase64(src.image, ctx.baseDir)
    params.image = await resizeBase64(raw, width, height)
    const strength = src.strength ?? 0.7
    params.strength = strength
    params.noise = req.i2i?.noise ?? 0
    params.inpaintImg2ImgStrength = strength
    params.img2img = { color_correct: true, strength }
    if (src.seed) params.extra_noise_seed = src.seed
    if (req.inpaint) {
      params.mask = await maskToBase64(req.inpaint.mask, ctx.baseDir, width, height)
      action = 'infill'
      resolvedModel = model + '-inpainting'
    } else {
      action = 'img2img'
    }
  }

  return {
    payload: {
      action,
      input: prompt,
      model: resolvedModel,
      parameters: params,
      use_new_shared_trial: true
    },
    seed,
    width,
    height
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
