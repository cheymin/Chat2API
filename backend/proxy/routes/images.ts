/**
 * Proxy Service Module - Image Generations Route
 * Implements the OpenAI-compatible POST /v1/images/generations endpoint.
 *
 * Dispatches to provider-specific image generators (ChatGPT gpt-image-1,
 * Gemini Nano Banana / Imagen, Grok Imagine) based on the `model` field.
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { imageGeneratorDispatcher } from '../media/imageGenerator'
import type { ImageGenerationRequest } from '../media/types'

const router = new Router({ prefix: '/v1/images' })

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
  let request: ImageGenerationRequest
  try {
    request = ctx.request.body as ImageGenerationRequest
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
    const response = await imageGeneratorDispatcher.generate(request)
    ctx.set('Content-Type', 'application/json')
    ctx.body = response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
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
