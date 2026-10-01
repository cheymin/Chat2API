import type { BuiltinProviderConfig } from '../../store/types'

export const grokConfig: BuiltinProviderConfig = {
  id: 'grok',
  name: 'Grok',
  type: 'builtin',
  authType: 'cookie',
  apiEndpoint: 'http://127.0.0.1:18199',
  chatPath: '/v1/chat/completions',
  headers: { 'Content-Type': 'application/json' },
  enabled: true,
  description: 'Grok - 由 Universal Web API 驱动（浏览器自动化），需在受控浏览器中登录 grok.com',
  supportedModels: ['grok-4.7', 'grok-4'],
  modelMappings: { 'grok-4.7': 'grok-4.7', 'grok-4': 'grok-4' },
  credentialFields: [
    {
      name: 'site',
      label: '站点域名',
      type: 'text',
      required: false,
      placeholder: 'grok.com',
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

export default grokConfig
