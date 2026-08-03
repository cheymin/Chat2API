/**
 * Image generation dispatcher.
 *
 * Resolves an account for the requested image model (via the load
 * balancer), looks up the matching provider image generator, runs it,
 * and returns an OpenAI-compatible ImageGenerationResponse.
 */

import { loadBalancer } from '../loadbalancer'
import { storeManager } from '../../store/store'
import type { LoadBalanceStrategy } from '../../store/types'
import { findImageGenerator } from './providers'
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  MediaGeneratorContext,
} from './types'

export class ImageGeneratorDispatcher {
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
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
      throw new Error(`No available account for image model "${model}"`)
    }

    const { account, provider, actualModel } = selection
    const generator = findImageGenerator(provider.id, model)
    if (!generator) {
      throw new Error(
        `No image generator registered for provider "${provider.id}" and model "${model}"`
      )
    }

    const ctx: MediaGeneratorContext = { provider, account, model, actualModel }

    try {
      const result = await generator.generate(ctx, request)
      return result
    } catch (err) {
      loadBalancer.markAccountFailed(account.id)
      throw err
    }
  }
}

export const imageGeneratorDispatcher = new ImageGeneratorDispatcher()
