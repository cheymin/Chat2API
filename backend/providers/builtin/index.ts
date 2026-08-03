import deepseekConfig from './deepseek'
import glmConfig from './glm'
import kimiConfig from './kimi'
import minimaxConfig from './minimax'
import mimoConfig from './mimo'
import perplexityConfig from './perplexity'
import qwenConfig from './qwen'
import qwenAiConfig from './qwen-ai'
import zaiConfig from './zai'
import chatgptConfig from './chatgpt'
import geminiConfig from './gemini'
import grokConfig from './grok'
import type { BuiltinProviderConfig } from '../../store/types'

export const builtinProviders: BuiltinProviderConfig[] = [
  deepseekConfig,
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qwenConfig,
  qwenAiConfig,
  zaiConfig,
  chatgptConfig,
  geminiConfig,
  grokConfig,
]

export const builtinProviderMap: Record<string, BuiltinProviderConfig> = {
  deepseek: deepseekConfig,
  glm: glmConfig,
  kimi: kimiConfig,
  minimax: minimaxConfig,
  mimo: mimoConfig,
  perplexity: perplexityConfig,
  qwen: qwenConfig,
  'qwen-ai': qwenAiConfig,
  zai: zaiConfig,
  chatgpt: chatgptConfig,
  gemini: geminiConfig,
  grok: grokConfig,
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
  qwenConfig,
  qwenAiConfig,
  zaiConfig,
  chatgptConfig,
  geminiConfig,
  grokConfig,
}

export default builtinProviders
