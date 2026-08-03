/**
 * Video generation dispatcher.
 *
 * Mirrors the image dispatcher: resolves an account for the requested
 * video model, finds the provider video generator, and returns the
 * VideoGenerationResponse.
 */

import { loadBalancer } from '../loadbalancer'
import { storeManager } from '../../store/store'
import type { LoadBalanceStrategy } from '../../store/types'
import { findVideoGenerator } from './providers'
import type {
  VideoGenerationRequest,
  VideoGenerationResponse,
  MediaGeneratorContext,
} from './types'

export class VideoGeneratorDispatcher {
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    const model = request.model
    if (!model) {
      throw new Error('Missing required field: model')
    }
    if (!request.prompt) {
      throw new Error('Missing required field: prompt')
    }

    const config = storeManager.getConfig()
    const strategy: LoadBalanceStrategy = config.loadBalanceStrategy || 'round-robin'

    const selection = loadBalancer.selectAccount(model, strategy)
    if (!selection) {
      throw new Error(`No available account for video model "${model}"`)
    }

    const { account, provider, actualModel } = selection
    const generator = findVideoGenerator(provider.id, model)
    if (!generator) {
      throw new Error(
        `No video generator registered for provider "${provider.id}" and model "${model}"`
      )
    }

    const ctx: MediaGeneratorContext = { provider, account, model, actualModel }

    try {
      return await generator.generate(ctx, request)
    } catch (err) {
      loadBalancer.markAccountFailed(account.id)
      throw err
    }
  }
}

export const videoGeneratorDispatcher = new VideoGeneratorDispatcher()
