/**
 * Grok media generator.
 *
 * Image generation (Grok Imagine / Aurora) is driven through the same
 * app-chat conversation endpoint as chat, but with
 * `modelName: "grok-imagine"` and `imageGeneration: true`. The NDJSON
 * stream returns cumulative payloads; the final image URLs appear in
 * `modelResponse.imageUrls` / `imagineImageUrls`.
 *
 * Grok does not currently expose a public video generation flow, so no
 * video generator is registered for this provider.
 */

import axios from 'axios'
import { GrokAdapter } from '../../../oauth/adapters/grok'
import type { AdapterConfig } from '../../../oauth/types'
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  MediaGeneratorContext,
  ImageGenerator,
} from '../types'

const GROK_BASE = 'https://grok.com'

const ADAPTER_CONFIG: AdapterConfig = {
  providerId: 'media-grok',
  providerType: 'grok',
  authMethods: ['manual', 'cookie'],
  callbackPort: 0,
}

const grokAdapter = new GrokAdapter(ADAPTER_CONFIG)

/**
 * Parse a Grok NDJSON stream body and return the final (cumulative)
 * envelope. Grok streams one JSON object per line; the last object that
 * carries `modelResponse` holds the complete state.
 */
function parseGrokStream(body: string): any | null {
  const lines = body.split('\n').filter((l) => l.trim().startsWith('{'))
  let last: any = null
  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      if (obj?.modelResponse || obj?.imagineImageUrls || obj?.imageUrls) {
        last = obj
      }
    } catch {
      // skip malformed line
    }
  }
  return last
}

/** Collect image URLs from a parsed Grok envelope. */
function collectImageUrls(envelope: any): string[] {
  const urls: string[] = []
  if (!envelope) return urls
  const candidates = [
    envelope?.imagineImageUrls,
    envelope?.imageUrls,
    envelope?.modelResponse?.imagineImageUrls,
    envelope?.modelResponse?.imageUrls,
  ]
  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const u of c) {
        if (typeof u === 'string') urls.push(u)
        else if (u?.url) urls.push(u.url)
        else if (u?.imageUrl) urls.push(u.imageUrl)
      }
    }
  }
  return urls
}

export class GrokImageGenerator implements ImageGenerator {
  providerId = 'grok'
  supportedModels = ['grok-imagine', 'aurora', 'grok-image']

  async generate(
    ctx: MediaGeneratorContext,
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const cookieStr = ctx.account.credentials.cookie || ctx.account.credentials.cookies || ''
    if (!cookieStr) throw new Error('Grok SSO cookies are missing')

    const statsigId = ctx.account.credentials.statsigId || ctx.account.credentials.statsig_id
    const headers = grokAdapter.buildHeaders(cookieStr, statsigId)

    // Grok app-chat payload: force the grok-imagine model and enable
    // image generation. The conversation is single-turn.
    const payload = {
      message: request.prompt,
      modelName: 'grok-imagine',
      imageGeneration: true,
      disableSearch: true,
      enableImageGeneration: true,
      isReasoning: false,
    }

    const response = await axios.post(`${GROK_BASE}/rest/app-chat/conversations/new`, payload, {
      headers,
      responseType: 'text',
      timeout: 180000,
      validateStatus: () => true,
    })

    if (response.status >= 400) {
      throw new Error(`Grok image generation failed: HTTP ${response.status}`)
    }

    const envelope = parseGrokStream(typeof response.data === 'string' ? response.data : '')
    const urls = collectImageUrls(envelope)

    const n = Math.max(1, request.n || 1)
    const responseFormat = request.response_format || 'url'
    const data = urls.slice(0, n).map((u) =>
      responseFormat === 'b64_json' ? { url: u } : { url: u }
    )

    if (data.length === 0) {
      throw new Error('Grok did not return any image URLs (the response may have been challenged)')
    }

    return { created: Math.floor(Date.now() / 1000), data }
  }
}
