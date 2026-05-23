'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      createdAt: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages }),
      })

      const data = await res.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.ok ? data.reply : 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại.',
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Kết nối thất bại. Vui lòng thử lại.',
          createdAt: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Chatbot AI</h1>
          <p className="text-xs text-slate-500">Trợ lý học tập & nghiệp vụ • Powered by Claude</p>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full font-medium">
          Beta
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="w-16 h-16 bg-purple-50 dark:bg-purple-950 rounded-2xl flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-purple-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Xin chào! Tôi có thể giúp gì?
            </h2>
            <p className="text-sm text-slate-400 max-w-sm">
              Hỏi tôi về sản phẩm kim hoàn, nghiệp vụ bán hàng, hoặc bất kỳ điều gì bạn cần
              hỗ trợ.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                'Cách phân biệt vàng 10K và 18K?',
                'Quy trình xử lý đơn đổi hàng?',
                'Tư vấn nhẫn cưới cho khách',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-3',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                msg.role === 'user'
                  ? 'bg-blue-100 dark:bg-blue-900'
                  : 'bg-purple-100 dark:bg-purple-900'
              )}
            >
              {msg.role === 'user' ? (
                <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              ) : (
                <Bot className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              )}
            </div>
            <div
              className={cn(
                'max-w-[80%] px-4 py-3 rounded-2xl text-sm',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-sm'
              )}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex items-end gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
          rows={1}
          className="flex-1 text-sm bg-transparent resize-none focus:outline-none text-slate-900 dark:text-white placeholder-slate-400 max-h-32 scrollbar-thin"
          style={{ minHeight: '1.5rem' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
