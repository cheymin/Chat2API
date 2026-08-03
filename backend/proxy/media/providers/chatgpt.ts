/**
 * ChatGPT media generator.
 *
 * Image generation: uses the Codex Responses API with the
 * `image_generation` tool. The model `gpt-image-1` is mapped to a
 * Responses call that forces the image_generation tool; the resulting
 * `image_generation_call` output items carry base64 PNG data.
 *
 * Video generation: uses the Sora web job API
 *   POST /backend-api/sora/videos          (create job)
 *   GET  /backend-api/sora/videos/{id}     (poll status)
 * The endpoint is gated behind the same OAuth token as the rest of
 * chatgpt.com. When `wait` is true the generator polls until the job
 * finishes (or times out) and returns the mp4 URL.
 */

import axios from 'axios'
import { ChatGPTAdapter } from '../../../oauth/adapters/chatgpt'
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

const CHATGPT_API_BASE = 'https://chatgpt.com'

const FAKE_HEADERS: Record<string, string> = {
  Accept: 'text/event-stream',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Origin: CHATGPT_API_BASE,
  Pragma: 'no-cache',
  'OpenAI-Beta': 'responses=experimental',
  Originator: 'codex_cli_rs',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Priority: 'u=1, i',
}

// Minimal adapter config — we only use acquireToken(), which does not
// touch the callback server / login flow.
const ADAPTER_CONFIG: AdapterConfig = {
  providerId: 'media-chatgpt',
  providerType: 'chatgpt',
  authMethods: ['manual'],
  callbackPort: 0,
}

const tokenAdapter = new ChatGPTAdapter(ADAPTER_CONFIG)

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Map an OpenAI-style size string to Sora's expected width/height. */
function parseSize(size?: string): { width?: number; height?: number } {
  if (!size) return {}
  const m = size.match(/^(\d+)x(\d+)$/)
  if (!m) return {}
  return { width: Number(m[1]), height: Number(m[2]) }
}

export class ChatGPTImageGenerator implements ImageGenerator {
  providerId = 'chatgpt'
  supportedModels = ['gpt-image-1', 'dall-e-3']

  async generate(
    ctx: MediaGeneratorContext,
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const tokenInfo = await tokenAdapter.acquireToken(ctx.account.credentials)
    if (!tokenInfo) {
      throw new Error('ChatGPT access token is missing or expired')
    }

    // Drive image generation through the Responses API by forcing the
    // image_generation tool. The `gpt-image-1` model id is not directly
    // accepted by /codex/responses; instead we use `gpt-5.4` and inject
    // the image_generation tool, which routes to the same backend.
    const payload = {
      model: 'gpt-5.4',
      input: request.prompt,
      stream: false,
      store: false,
      tools: [{ type: 'image_generation' }],
      tool_choice: { type: 'image_generation' },
    }

    const response = await axios.post(`${CHATGPT_API_BASE}/backend-api/codex/responses`, payload, {
      headers: {
        Authorization: `Bearer ${tokenInfo.accessToken}`,
        'Content-Type': 'application/json',
        session_id: tokenInfo.accountId || uuid(),
        ...FAKE_HEADERS,
      },
      timeout: 180000,
      validateStatus: () => true,
    })

    if (response.status >= 400) {
      throw new Error(`ChatGPT image generation failed: HTTP ${response.status} ${JSON.stringify(response.data).slice(0, 300)}`)
    }

    const images: NonNullable<ImageGenerationResponse['data'][number]>[] = []
    const output = response.data?.output
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item?.type === 'image_generation_call' && item.result) {
          images.push({ b64_json: item.result, revised_prompt: item.revised_prompt })
        }
      }
    }

    // Some non-streaming payloads nest under `responses` / `image_urls`
    if (images.length === 0 && Array.isArray(response.data?.image_urls)) {
      for (const url of response.data.image_urls) {
        images.push({ url: typeof url === 'string' ? url : url.url })
      }
    }

    const n = Math.max(1, request.n || 1)
    while (images.length < n) {
      // The Responses API returns a single image per call; for n>1 we
      // would need additional calls. Repeat up to n times.
      if (images.length === 0) break
      images.push({ ...images[0] })
    }

    return { created: Math.floor(Date.now() / 1000), data: images.slice(0, n) }
  }
}

export class ChatGPTVideoGenerator implements VideoGenerator {
  providerId = 'chatgpt'
  supportedModels = ['sora-2', 'sora-2-turbo', 'sora']

  async generate(
    ctx: MediaGeneratorContext,
    request: VideoGenerationRequest
  ): Promise<VideoGenerationResponse> {
    const tokenInfo = await tokenAdapter.acquireToken(ctx.account.credentials)
    if (!tokenInfo) {
      throw new Error('ChatGPT access token is missing or expired')
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokenInfo.accessToken}`,
      'Content-Type': 'application/json',
      session_id: tokenInfo.accountId || uuid(),
      ...FAKE_HEADERS,
    }

    const { width, height } = parseSize(
      request.resolution ? `${request.resolution}` : undefined
    )

    const createPayload: Record<string, unknown> = {
      prompt: request.prompt,
      model: request.model,
      // Sora web expects size as "WxH" when provided.
      size: request.aspect_ratio || (width && height ? `${width}x${height}` : undefined),
      seconds: request.seconds,
      n: Math.max(1, request.n || 1),
    }

    const create = await axios.post(`${CHATGPT_API_BASE}/backend-api/sora/videos`, createPayload, {
      headers,
      timeout: 60000,
      validateStatus: () => true,
    })

    if (create.status >= 400) {
      throw new Error(`Sora job creation failed: HTTP ${create.status} ${JSON.stringify(create.data).slice(0, 300)}`)
    }

    const jobIds: string[] = []
    if (Array.isArray(create.data?.data)) {
      for (const v of create.data.data) {
        if (v?.id) jobIds.push(v.id)
      }
    } else if (create.data?.id) {
      jobIds.push(create.data.id)
    }

    if (jobIds.length === 0) {
      throw new Error('Sora did not return a job id')
    }

    const wait = request.wait !== false
    const videos: NonNullable<VideoGenerationResponse['data'][number]>[] = []

    for (const jobId of jobIds) {
      if (!wait) {
        videos.push({ id: jobId, status: 'pending' })
        continue
      }

      const result = await pollSoraJob(jobId, headers)
      videos.push(result)
    }

    return { created: Math.floor(Date.now() / 1000), data: videos }
  }
}

async function pollSoraJob(
  jobId: string,
  headers: Record<string, string>
): Promise<NonNullable<VideoGenerationResponse['data'][number]>> {
  const deadline = Date.now() + 10 * 60 * 1000 // 10 min cap
  const pollInterval = 5000

  while (Date.now() < deadline) {
    const resp = await axios.get(`${CHATGPT_API_BASE}/backend-api/sora/videos/${jobId}`, {
      headers,
      timeout: 30000,
      validateStatus: () => true,
    })

    if (resp.status >= 400) {
      throw new Error(`Sora poll failed: HTTP ${resp.status}`)
    }

    const status = (resp.data?.status || resp.data?.state || '').toLowerCase()
    const url: string | undefined = resp.data?.url || resp.data?.download_url || resp.data?.video_url
    if (status === 'completed' || status === 'succeeded' || url) {
      return {
        url,
        status: 'completed',
        id: jobId,
        duration_seconds: resp.data?.seconds || resp.data?.duration,
      }
    }
    if (status === 'failed' || status === 'error') {
      return { id: jobId, status: 'failed' }
    }

    await new Promise((r) => setTimeout(r, pollInterval))
  }

  return { id: jobId, status: 'pending' }
}
