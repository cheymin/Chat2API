/**
 * Media Generation Module - Type Definitions
 *
 * Shared types for image and video generation across providers.
 * The request/response shapes mirror the OpenAI Images API so the
 * /v1/images/generations endpoint can stay OpenAI-compatible, while
 * video generation uses a comparable shape (OpenAI has not finalized a
 * public video API spec, so we follow the Sora-style object model).
 */

import type { Account, Provider } from '../../store/types'

/**
 * OpenAI-compatible image generation request.
 */
export interface ImageGenerationRequest {
  /** Model id, e.g. `gpt-image-1`, `gemini-3-pro-image`, `grok-imagine`. */
  model: string
  /** Text prompt describing the desired image. */
  prompt: string
  /** Number of images to generate. Defaults to 1. */
  n?: number
  /** Size hint, e.g. `1024x1024`, `1024x1792`, `auto`. */
  size?: string
  /** Quality hint, e.g. `standard`, `hd`, `auto`. */
  quality?: string
  /** Response format: `b64_json` or `url`. */
  response_format?: 'b64_json' | 'url'
  /** Optional style hint (provider-specific). */
  style?: string
  /** Optional reference image (URL or data URI) for image-to-image. */
  image?: string
  /** A transparent passthrough bag for provider-specific options. */
  extra?: Record<string, unknown>
}

/**
 * A single generated image in the OpenAI Images response shape.
 */
export interface GeneratedImage {
  /** Revise prompt / revised prompt, when the provider returns one. */
  revised_prompt?: string
  /** Base64-encoded PNG/JPEG data (without the data: prefix). */
  b64_json?: string
  /** Public or signed URL to the generated image. */
  url?: string
}

export interface ImageGenerationResponse {
  created: number
  data: GeneratedImage[]
}

/**
 * Video generation request. There is no finalized OpenAI spec, so this
 * follows the Sora-style shape and degrades gracefully.
 */
export interface VideoGenerationRequest {
  /** Model id, e.g. `sora-2`, `sora-2-turbo`, `veo-3`, `veo-3-fast`. */
  model: string
  /** Text prompt describing the desired video. */
  prompt: string
  /** Desired duration in seconds, when supported. */
  seconds?: number
  /** Aspect ratio hint, e.g. `16:9`, `9:16`, `1:1`. */
  aspect_ratio?: string
  /** Resolution hint, e.g. `720p`, `1080p`. */
  resolution?: string
  /** Number of variations. Defaults to 1. */
  n?: number
  /** Whether to wait for the final video (sync) or return a job id (async). */
  wait?: boolean
  /** Optional reference image (URL or data URI) for image-to-video. */
  image?: string
  extra?: Record<string, unknown>
}

export interface GeneratedVideo {
  /** Public or signed URL to the generated video (mp4). */
  url?: string
  /** Base64-encoded video data (without prefix). */
  b64_json?: string
  /** Job id when the video is still being rendered. */
  id?: string
  /** Status: `completed`, `pending`, `failed`. */
  status?: 'completed' | 'pending' | 'failed'
  /** Duration in seconds, when known. */
  duration_seconds?: number
  /** Provider-specific metadata. */
  metadata?: Record<string, unknown>
}

export interface VideoGenerationResponse {
  created: number
  data: GeneratedVideo[]
}

/**
 * Context handed to every provider media generator.
 */
export interface MediaGeneratorContext {
  provider: Provider
  account: Account
  /** Original requested model (before mapping). */
  model: string
  /** Provider-specific actual model id (after mapping). */
  actualModel: string
}

/**
 * Provider image generator interface.
 */
export interface ImageGenerator {
  /** Provider id this generator handles (e.g. `chatgpt`, `gemini`, `grok`). */
  providerId: string
  /** Model ids (or prefixes) this generator can serve. */
  supportedModels: string[]
  generate(ctx: MediaGeneratorContext, request: ImageGenerationRequest): Promise<ImageGenerationResponse>
}

/**
 * Provider video generator interface.
 */
export interface VideoGenerator {
  providerId: string
  supportedModels: string[]
  generate(ctx: MediaGeneratorContext, request: VideoGenerationRequest): Promise<VideoGenerationResponse>
}
