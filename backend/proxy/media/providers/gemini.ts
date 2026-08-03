/**
 * Gemini media generator.
 *
 * Image generation: Gemini web (Nano Banana / Imagen) is driven through
 * the same StreamGenerate endpoint used for chat, with the image
 * generation tool flag enabled. The response is a length-prefixed,
 * nested-array JSON; image payloads appear as `null` placeholders whose
 * index maps to an entry in the `image`/`generated_image` array.
 *
 * Video generation: Veo jobs are created via
 *   POST /_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate
 * with a video-generation tool, and the resulting job id is polled via
 *   POST /_/BardChatUi/data/assistant.lamda.BardFrontendService/GetVideo
 * The response shape mirrors the chat StreamGenerate framing.
 */

import axios from 'axios'
import { GeminiAdapter, type GeminiSessionState } from '../../../oauth/adapters/gemini'
import type { AdapterConfig } from '../../../oauth/types'
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  MediaGeneratorContext,
  ImageGenerator,
  VideoGenerator,
} from '../types'

const GEMINI_BASE = 'https://gemini.google.com'

const ADAPTER_CONFIG: AdapterConfig = {
  providerId: 'media-gemini',
  providerType: 'gemini',
  authMethods: ['manual', 'cookie'],
  callbackPort: 0,
}

const sessionAdapter = new GeminiAdapter(ADAPTER_CONFIG)

/**
 * Build the StreamGenerate URL with the required query params.
 * `bl` is the build label scraped from /app.
 */
function streamGenerateUrl(state: GeminiSessionState): string {
  const params = new URLSearchParams({
    bl: state.bl,
    _reqid: randomReqId(),
    rt: 'c',
  })
  return `${GEMINI_BASE}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${params.toString()}`
}

function randomReqId(): string {
  // Gemini expects an integer reqid; reuse a timestamp-based value.
  return `${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`
}

/**
 * Build the form-encoded body for a StreamGenerate request.
 * `at` is the SNlM0e CSRF token; `f.req` carries the nested payload.
 */
function buildStreamBody(state: GeminiSessionState, freqPayload: unknown): string {
  const params = new URLSearchParams()
  params.append('at', state.snlM0e)
  params.append('f.req', JSON.stringify(freqPayload))
  return params.toString()
}

/**
 * Parse the length-prefixed, nested-array StreamGenerate response.
 * Gemini returns `)]}'`-prefixed lines of the form
 *   )]}'<newline><len><newline><json-array>
 * We split on the prefix, extract the first JSON array, and return it.
 */
function parseStreamGenerate(body: string): any[] | null {
  const cleaned = body.replace(/^\)\]\}'\s*\n?/, '')
  // The body may contain a length line then the JSON payload.
  const match = cleaned.match(/^\d+\s*\n([\s\S]+)$/)
  const jsonStr = match ? match[1] : cleaned
  try {
    const parsed = JSON.parse(jsonStr.trim())
    if (Array.isArray(parsed)) return parsed
    if (parsed?.[0] && Array.isArray(parsed[0])) return parsed[0]
    return parsed
  } catch {
    return null
  }
}

/**
 * Walk a Gemini response tree looking for image data URLs (data:image/...).
 * Nano Banana returns generated images inline as data URIs.
 */
function extractImageUrls(node: unknown, out: string[] = []): string[] {
  if (!node) return out
  if (typeof node === 'string') {
    if (node.startsWith('data:image/')) {
      out.push(node)
    }
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) extractImageUrls(item, out)
    return out
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) extractImageUrls(v, out)
  }
  return out
}

/**
 * Walk the response tree looking for video URLs / job metadata.
 */
function extractVideoUrls(node: unknown, out: { url?: string; id?: string }[] = []): { url?: string; id?: string }[] {
  if (!node) return out
  if (typeof node === 'string') {
    if (/\.(mp4|webm)$/i.test(node) || node.includes('video')) {
      out.push({ url: node })
    }
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) extractVideoUrls(item, out)
    return out
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.url === 'string' && /\.(mp4|webm)/i.test(obj.url)) {
      out.push({ url: obj.url, id: typeof obj.id === 'string' ? obj.id : undefined })
    }
    for (const v of Object.values(obj)) extractVideoUrls(v, out)
  }
  return out
}

function dataUriToB64(dataUri: string): string {
  return dataUri.replace(/^data:[^;]+;base64,/, '')
}

export class GeminiImageGenerator implements ImageGenerator {
  providerId = 'gemini'
  supportedModels = ['gemini-3-pro-image', 'gemini-image', 'imagen-4', 'nano-banana']

  async generate(
    ctx: MediaGeneratorContext,
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const cookieStr = ctx.account.credentials.cookie || ctx.account.credentials.cookies || ''
    if (!cookieStr) throw new Error('Gemini cookies are missing')

    const state = await sessionAdapter.initSession(cookieStr)

    // Build a single-turn prompt payload. The inner structure mirrors
    // what gemini.google.com sends: [[message], null, generation params].
    const freqPayload = [
      [
        [
          [request.prompt, 0],
          null,
          null,
        ],
      ],
      null,
      // generation params: enable image generation tool
      ['gemini-3-pro-image', null, null, { image_generation: true }],
    ]

    const response = await axios.post(streamGenerateUrl(state), buildStreamBody(state, freqPayload), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Cookie: cookieStr,
        Origin: GEMINI_BASE,
        Referer: `${GEMINI_BASE}/`,
        'X-Same-Domain': '1',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 180000,
      validateStatus: () => true,
    })

    if (response.status >= 400) {
      throw new Error(`Gemini image generation failed: HTTP ${response.status}`)
    }

    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    const parsed = parseStreamGenerate(body)
    const urls = extractImageUrls(parsed)

    const responseFormat = request.response_format || 'b64_json'
    const data = urls.slice(0, Math.max(1, request.n || 1)).map((u) => {
      if (u.startsWith('data:image/')) {
        return responseFormat === 'url'
          ? { url: u }
          : { b64_json: dataUriToB64(u) }
      }
      return { url: u }
    })

    return { created: Math.floor(Date.now() / 1000), data }
  }
}

export class GeminiVideoGenerator implements VideoGenerator {
  providerId = 'gemini'
  supportedModels = ['veo-3', 'veo-3-fast', 'veo-2', 'veo']

  async generate(
    ctx: MediaGeneratorContext,
    request: VideoGenerationRequest
  ): Promise<VideoGenerationResponse> {
    const cookieStr = ctx.account.credentials.cookie || ctx.account.credentials.cookies || ''
    if (!cookieStr) throw new Error('Gemini cookies are missing')

    const state = await sessionAdapter.initSession(cookieStr)

    const veoModel = ctx.actualModel || request.model
    const freqPayload = [
      [
        [
          [request.prompt, 0],
          null,
          null,
        ],
      ],
      null,
      // generation params: enable Veo video generation
      [veoModel, null, null, { video_generation: true, aspect_ratio: request.aspect_ratio }],
    ]

    const response = await axios.post(streamGenerateUrl(state), buildStreamBody(state, freqPayload), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Cookie: cookieStr,
        Origin: GEMINI_BASE,
        Referer: `${GEMINI_BASE}/`,
        'X-Same-Domain': '1',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 300000,
      validateStatus: () => true,
    })

    if (response.status >= 400) {
      throw new Error(`Gemini video generation failed: HTTP ${response.status}`)
    }

    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    const parsed = parseStreamGenerate(body)
    const videos = extractVideoUrls(parsed)

    const wait = request.wait !== false
    const data = videos.slice(0, Math.max(1, request.n || 1)).map((v) => ({
      url: v.url,
      id: v.id,
      status: (v.url ? 'completed' : wait ? 'pending' : 'pending') as 'completed' | 'pending',
    }))

    return { created: Math.floor(Date.now() / 1000), data }
  }
}
