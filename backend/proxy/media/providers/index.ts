/**
 * Media provider registry.
 *
 * Registers the per-provider image/video generators and exposes helpers
 * to look up a generator by provider id or model id.
 */

import { ChatGPTImageGenerator, ChatGPTVideoGenerator } from './chatgpt'
import { GeminiImageGenerator, GeminiVideoGenerator } from './gemini'
import { GrokImageGenerator } from './grok'
import type { ImageGenerator, VideoGenerator } from '../types'

const imageGenerators: ImageGenerator[] = [
  new ChatGPTImageGenerator(),
  new GeminiImageGenerator(),
  new GrokImageGenerator(),
]

const videoGenerators: VideoGenerator[] = [
  new ChatGPTVideoGenerator(),
  new GeminiVideoGenerator(),
]

/**
 * Match a model id against a generator's supportedModels list. Supports
 * exact match and `*` suffix prefix match (e.g. `sora-*`).
 */
function modelMatches(supported: string[], model: string): boolean {
  const normalized = model.toLowerCase()
  return supported.some((m) => {
    const lower = m.toLowerCase()
    if (lower.endsWith('*')) {
      return normalized.startsWith(lower.slice(0, -1))
    }
    return normalized === lower
  })
}

export function findImageGenerator(providerId: string, model: string): ImageGenerator | undefined {
  return imageGenerators.find(
    (g) => g.providerId === providerId && modelMatches(g.supportedModels, model)
  )
}

export function findVideoGenerator(providerId: string, model: string): VideoGenerator | undefined {
  return videoGenerators.find(
    (g) => g.providerId === providerId && modelMatches(g.supportedModels, model)
  )
}

/** Whether any registered image generator can serve this model. */
export function isImageModel(model: string): boolean {
  return imageGenerators.some((g) => modelMatches(g.supportedModels, model))
}

/** Whether any registered video generator can serve this model. */
export function isVideoModel(model: string): boolean {
  return videoGenerators.some((g) => modelMatches(g.supportedModels, model))
}
