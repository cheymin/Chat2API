export interface DeepSeekChatOptionInput {
  model: string
  web_search?: boolean
  reasoning_effort?: string
}

export interface DeepSeekChatOptions {
  modelType: 'default' | 'expert'
  searchEnabled: boolean
  thinkingEnabled: boolean
}

export function resolveDeepSeekChatOptions(
  request: DeepSeekChatOptionInput,
  _prompt: string = ''
): DeepSeekChatOptions {
  const modelLower = request.model.toLowerCase()
  const isProModel = modelLower.includes('deepseek-v4-pro') || modelLower.includes('expert')
  const isSearchAlias = modelLower.includes('search')
  const isThinkingAlias = modelLower.includes('think')
    || modelLower.includes('r1')
    || modelLower.includes('reasoner')

  return {
    modelType: isProModel ? 'expert' : 'default',
    searchEnabled: Boolean(request.web_search) || isSearchAlias,
    thinkingEnabled: Boolean(request.reasoning_effort)
      || isThinkingAlias,
  }
}

export type KimiScenario = 'SCENARIO_K2D5' | 'SCENARIO_K2D6'

export function resolveKimiScenario(model: string): KimiScenario {
  return model.toLowerCase().includes('k2.6') ? 'SCENARIO_K2D6' : 'SCENARIO_K2D5'
}

export function createKimiChatPayload(options: {
  model: string
  content: string
  enableWebSearch: boolean
  enableThinking: boolean
}) {
  const scenario = resolveKimiScenario(options.model)

  return {
    scenario,
    chat_id: '',
    tools: [
      ...(options.enableWebSearch ? [{ type: 'TOOL_TYPE_SEARCH', search: {} }] : []),
      { type: 'TOOL_TYPE_CRON_JOB' }
    ],
    message: {
      parent_id: '',
      role: 'user',
      blocks: [{
        message_id: '',
        text: { content: options.content }
      }],
      scenario,
      is_goal: false,
    },
    options: {
      thinking: options.enableThinking,
      enable_plugin: true,
      reasoning_effort: 'REASONING_EFFORT_NONE'
    },
    project_id: ''
  }
}

export function encodeKimiGrpcFrame(payload: unknown): Buffer {
  const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf8')
  const frameBuffer = Buffer.alloc(5 + jsonBuffer.length)
  frameBuffer.writeUInt8(0, 0)
  frameBuffer.writeUInt32BE(jsonBuffer.length, 1)
  jsonBuffer.copy(frameBuffer, 5)
  return frameBuffer
}
