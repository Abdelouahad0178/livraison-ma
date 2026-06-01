import { memo, useState } from 'react'
import type { ReactNode } from 'react'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (text: string) => Promise<void> | void
  disabled?: boolean
  placeholder?: string
  inputClassName?: string
  btnClassName?: string
  btnContent?: ReactNode
}

const ChatInput = memo(function ChatInput({
  onSend,
  disabled,
  placeholder,
  inputClassName,
  btnClassName,
  btnContent,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    const text = value.trim()
    if (!text || disabled || sending) return
    setSending(true)
    try {
      await onSend(text)
      setValue('')
    } finally {
      setSending(false)
    }
  }

  const isDisabled = disabled || sending

  return (
    <>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
        }}
        placeholder={disabled ? 'Conversation traitee' : (placeholder || 'Repondre...')}
        disabled={isDisabled}
        className={
          inputClassName ||
          'flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400'
        }
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || isDisabled}
        className={
          btnClassName ||
          'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 shrink-0'
        }
      >
        {btnContent || <Send className="w-3.5 h-3.5" />}
      </button>
    </>
  )
})

export default ChatInput
