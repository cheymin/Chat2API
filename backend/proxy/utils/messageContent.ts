/**
 * Extract plain text from OpenAI-style message content (string or multimodal array).
 */

type MessageLike = {
  role?: string
  content?: string | unknown[] | null
}

const TEXT_PART_TYPES = new Set([
  'text',
  'input_text',
  'output_text',
  'input_text_delta',
])

function textFromPart(part: unknown): string {
  if (!part || typeof part !== 'object') return ''
  const record = part as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  if (typeof record.content === 'string') return record.content
  return ''
}

export function extractMessageText(message: MessageLike | null | undefined): string {
  if (!message?.content) return ''

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const type = typeof (part as Record<string, unknown>).type === 'string'
          ? (part as Record<string, unknown>).type as string
          : ''
        if (type && !TEXT_PART_TYPES.has(type)) return ''
        return textFromPart(part)
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

/**
 * Extract last user-visible input for request logs.
 */
export function extractUserInputFromMessages(
  messages: MessageLike[] | null | undefined
): string | undefined {
  if (!messages?.length) return undefined

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const role = msg.role || ''
    if (role === 'user' || role === 'developer') {
      const text = extractMessageText(msg)
      if (text.trim()) return text
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const text = extractMessageText(messages[i])
    if (text.trim()) return text
  }

  return undefined
}

export function normalizeChatRoles<T extends MessageLike>(messages: T[]): T[] {
  return messages.map((msg) => {
    if (msg.role === 'developer') {
      return { ...msg, role: 'system' } as T
    }
    return msg
  })
}
