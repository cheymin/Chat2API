import deepseekConfig from './deepseek'
import glmConfig from './glm'
import kimiConfig from './kimi'
import minimaxConfig from './minimax'
import mimoConfig from './mimo'
import perplexityConfig from './perplexity'
import qoderConfig from './qoder'
import qwenConfig from './qwen'
import qwenAiConfig from './qwen-ai'
import universalConfig from './universal'
import veniceConfig from './venice'
import workbuddyConfig from './workbuddy'
import zaiConfig from './zai'

import type { BuiltinProviderConfig } from '../../store/types'

export const builtinProviders: BuiltinProviderConfig[] = [
  deepseekConfig,
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qoderConfig,
  qwenConfig,
  qwenAiConfig,
  universalConfig,
  veniceConfig,
  workbuddyConfig,
  zaiConfig,
]

export const builtinProviderMap: Record<string, BuiltinProviderConfig> = {
  deepseek: deepseekConfig,
  glm: glmConfig,
  kimi: kimiConfig,
  minimax: minimaxConfig,
  mimo: mimoConfig,
  perplexity: perplexityConfig,
  qoder: qoderConfig,
  qwen: qwenConfig,
  'qwen-ai': qwenAiConfig,
  universal: universalConfig,
  venice: veniceConfig,
  workbuddy: workbuddyConfig,
  zai: zaiConfig,
}

export function getBuiltinProvider(id: string): BuiltinProviderConfig | undefined {
  return builtinProviderMap[id]
}

export function getBuiltinProviders(): BuiltinProviderConfig[] {
  return builtinProviders
}

export {
  deepseekConfig,
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qoderConfig,
  qwenConfig,
  qwenAiConfig,
  universalConfig,
  veniceConfig,
  workbuddyConfig,
  zaiConfig,
}

export default builtinProviders
