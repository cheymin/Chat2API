import type { BuiltinProviderConfig } from '../../store/types'

export const claudeConfig: BuiltinProviderConfig = {
  id: 'claude',
  name: 'Claude',
  type: 'builtin',
  authType: 'cookie',
  apiEndpoint: 'http://127.0.0.1:18199',
  chatPath: '/v1/chat/completions',
  headers: { 'Content-Type': 'application/json' },
  enabled: true,
  description: 'Claude - 由 Universal Web API 驱动（浏览器自动化），需在受控浏览器中登录 claude.ai',
  supportedModels: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-3'],
  modelMappings: { 'claude-opus-4': 'claude-opus-4', 'claude-sonnet-4': 'claude-sonnet-4', 'claude-haiku-3': 'claude-haiku-3' },
  credentialFields: [
    {
      name: 'site',
      label: '站点域名',
      type: 'text',
      required: false,
      placeholder: 'claude.ai',
      helpText: '自动填入，由 Universal Web API 根据 provider ID 路由',
    },
    {
      name: 'pythonPath',
      label: 'Python 路径（可选）',
      type: 'text',
      required: false,
      placeholder: '自动检测 python3',
      helpText: '指定 Python 3.10+ 的完整路径',
    },
  ],
}

export default claudeConfig
