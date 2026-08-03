/**
 * Proxy Service Module - Video Generations Route
 * Implements POST /v1/videos/generations.
 *
 * There is no finalized OpenAI video spec, so this endpoint follows a
 * Sora-style object model and dispatches to provider-specific video
 * generators (ChatGPT Sora 2, Gemini Veo 3).
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { videoGeneratorDispatcher } from '../media/videoGenerator'
import type { VideoGenerationRequest } from '../media/types'

const router = new Router({ prefix: '/v1/videos' })

function errorBody(message: string, code = 'invalid_request_error', status = 400) {
  return {
    status,
    body: {
      error: {
        message,
        type: code,
        param: null,
        code: null,
      },
    },
  }
}

router.post('/generations', async (ctx: Context) => {
  let request: VideoGenerationRequest
  try {
    request = ctx.request.body as VideoGenerationRequest
  } catch {
    const e = errorBody('Invalid request body')
    ctx.status = e.status
    ctx.body = e.body
    return
  }

  if (!request.model) {
    const e = errorBody('Missing required field: model', 'invalid_request_error', 400)
    ctx.status = e.status
    ctx.body = e.body
    return
  }

  if (!request.prompt) {
    const e = errorBody('Missing required field: prompt', 'invalid_request_error', 400)
    ctx.status = e.status
    ctx.body = e.body
    return
  }

  try {
    const response = await videoGeneratorDispatcher.generate(request)
    ctx.set('Content-Type', 'application/json')
    ctx.body = response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Video generation failed'
    const status = /No available account/.test(message) ? 503 : 500
    ctx.status = status
    ctx.body = {
      error: {
        message,
        type: status === 503 ? 'service_unavailable' : 'internal_error',
        param: null,
        code: null,
      },
    }
  }
})

export default router
