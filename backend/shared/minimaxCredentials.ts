/**
 * Normalize MiniMax credentials from UI / OAuth / bookmarklet field names.
 */

function parseJwtUserId(jwtToken: string): string {
  try {
    const parts = jwtToken.split('.')
    if (parts.length < 2) return ''
    let payload = parts[1]
    const padding = payload.length % 4
    if (padding > 0) {
      payload += '='.repeat(4 - padding)
    }
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(payload, 'base64').toString('utf8')
    const data = JSON.parse(decoded) as Record<string, unknown>
    const user = data.user as Record<string, unknown> | undefined
    const id = user?.id ?? data.id ?? data.sub
    return typeof id === 'string' ? id : ''
  } catch {
    return ''
  }
}

function extractRealUserIdFromAgentJson(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return ''
  try {
    const agent = JSON.parse(trimmed) as Record<string, unknown>
    const id = agent.realUserID ?? agent.real_user_id
    return typeof id === 'string' ? id.trim() : ''
  } catch {
    return ''
  }
}

export function resolveMiniMaxCredentials(
  credentials: Record<string, string | undefined> | null | undefined,
): { jwtToken: string; realUserID: string; error?: string } {
  if (!credentials || typeof credentials !== 'object') {
    return { jwtToken: '', realUserID: '', error: '缺少凭证数据' }
  }

  let rawToken = (
    credentials.token ||
    credentials._token ||
    credentials.jwt ||
    ''
  ).trim()
  let providedRealUserID = (
    credentials.realUserID ||
    credentials._userId ||
    credentials.userId ||
    ''
  ).trim()

  const fromAgentField = extractRealUserIdFromAgentJson(
    credentials.user_detail_agent?.trim() || '',
  )
  if (fromAgentField) {
    providedRealUserID = fromAgentField
  } else if (providedRealUserID) {
    const fromInlineJson = extractRealUserIdFromAgentJson(providedRealUserID)
    if (fromInlineJson) {
      providedRealUserID = fromInlineJson
    }
  }

  // Combined realUserID+JWT pasted only in realUserID field
  if (!rawToken && providedRealUserID.includes('+')) {
    const plusIndex = providedRealUserID.indexOf('+')
    const maybeJwt = providedRealUserID.slice(plusIndex + 1).trim()
    if (maybeJwt.startsWith('eyJ')) {
      rawToken = maybeJwt
      providedRealUserID = providedRealUserID.slice(0, plusIndex).trim()
    }
  }

  // JWT pasted into realUserID by mistake
  if (!rawToken && providedRealUserID.startsWith('eyJ')) {
    rawToken = providedRealUserID
    providedRealUserID = ''
  }

  if (!rawToken) {
    return {
      jwtToken: '',
      realUserID: '',
      error: '请填写 JWT Token（Local Storage / Cookie 中的 _token，以 eyJ 开头）',
    }
  }

  let jwtToken = rawToken
  let realUserID = ''

  if (rawToken.includes('+')) {
    const plusIndex = rawToken.indexOf('+')
    realUserID = rawToken.slice(0, plusIndex).trim()
    jwtToken = rawToken.slice(plusIndex + 1).trim()
  } else if (providedRealUserID) {
    realUserID = providedRealUserID
    jwtToken = rawToken
  } else {
    jwtToken = rawToken
    realUserID = ''
  }

  if (!jwtToken.startsWith('eyJ')) {
    return {
      jwtToken: '',
      realUserID: '',
      error: 'Token 格式不正确，请使用 _token 中的 JWT（以 eyJ 开头）',
    }
  }

  if (!realUserID) {
    return {
      jwtToken,
      realUserID: '',
      error:
        'MiniMax 新版必须填写 Real User ID：打开 Local Storage 的 user_detail_agent，复制其中 realUserID。不要用 UNIQUE_USER_ID，也不要只依赖 JWT 里的 user.id。',
    }
  }

  const uniqueUserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uniqueUserIdPattern.test(realUserID)) {
    return {
      jwtToken,
      realUserID: '',
      error:
        'Real User ID 填错了：当前值是 UNIQUE_USER_ID。请打开 Local Storage → user_detail_agent，复制 JSON 里的 realUserID（例如 441972700348235778 这种数字串）。',
    }
  }

  return { jwtToken, realUserID }
}
