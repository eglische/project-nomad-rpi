export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  thinking?: string
  isThinking?: boolean
  thinkingDuration?: number
}

export interface ChatSession {
  id: string
  title: string
  model?: string | null
  folder?: string | null
  sortOrder?: number
  lastMessage?: string
  timestamp: Date
}
