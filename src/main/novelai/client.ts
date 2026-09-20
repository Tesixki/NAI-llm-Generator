import { unzipSync } from 'fflate'

export class NovelAIError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
    this.name = 'NovelAIError'
  }
}

export interface NovelAIClientOptions {
  apiKey: string
  imageBase?: string
  timeoutMs?: number
}

export interface GeneratedBlob {
  filename: string
  data: Buffer
}

/** Minimal NovelAI image API client (generate-image / encode-vibe) */
export class NovelAIClient {
  private apiKey: string
  private base: string
  private timeoutMs: number

  constructor(opts: NovelAIClientOptions) {
    this.apiKey = opts.apiKey
    this.base = (opts.imageBase || 'https://image.novelai.net').replace(/\/$/, '')
    this.timeoutMs = opts.timeoutMs ?? 180_000
  }

  private async post(pathname: string, body: unknown): Promise<Buffer> {
    if (!this.apiKey) throw new NovelAIError('NovelAI API key is not set')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.base}${pathname}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: '*/*'
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      if (res.status === 200 || res.status === 201) {
        return Buffer.from(await res.arrayBuffer())
      }
      const text = await res.text().catch(() => '')
      switch (res.status) {
        case 400:
          throw new NovelAIError(`Invalid request: ${text}`, 400)
        case 401:
          throw new NovelAIError('Invalid API key', 401)
        case 402:
          throw new NovelAIError('Insufficient credits or subscription required', 402)
        case 409:
          throw new NovelAIError(`Conflict: ${text}`, 409)
        case 429:
          throw new NovelAIError('Rate limit exceeded', 429)
        default:
          throw new NovelAIError(`HTTP ${res.status}: ${text.slice(0, 500)}`, res.status)
      }
    } catch (e) {
      if (e instanceof NovelAIError) throw e
      if ((e as Error).name === 'AbortError') throw new NovelAIError('Request timed out')
      throw new NovelAIError(`Network error: ${(e as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /** POST /ai/generate-image → images extracted from the zip response */
  async generateImage(request: unknown): Promise<GeneratedBlob[]> {
    const data = await this.post('/ai/generate-image', request)
    return extractImages(data)
  }

  /** POST /ai/encode-vibe → base64 vibe encoding */
  async encodeVibe(imageBase64: string, informationExtracted: number, model: string): Promise<string> {
    const data = await this.post('/ai/encode-vibe', {
      image: imageBase64,
      information_extracted: informationExtracted,
      model
    })
    return data.toString('base64')
  }
}

function extractImages(data: Buffer): GeneratedBlob[] {
  try {
    const files = unzipSync(new Uint8Array(data))
    const out: GeneratedBlob[] = []
    for (const [name, bytes] of Object.entries(files)) {
      if (/\.(png|jpe?g|webp)$/i.test(name)) out.push({ filename: name, data: Buffer.from(bytes) })
    }
    if (out.length) return out.sort((a, b) => a.filename.localeCompare(b.filename))
  } catch {
    /* not a zip */
  }
  // PNG / WEBP magic → single raw image
  if (data.subarray(0, 4).toString('hex') === '89504e47') return [{ filename: 'image_0.png', data }]
  if (data.subarray(0, 4).toString('ascii') === 'RIFF') return [{ filename: 'image_0.webp', data }]
  throw new NovelAIError(`Unexpected response (${data.length} bytes): ${data.subarray(0, 80).toString('utf-8')}`)
}
