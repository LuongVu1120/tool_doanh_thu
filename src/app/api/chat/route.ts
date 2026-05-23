export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `Bạn là trợ lý học tập thông minh của công ty HuyK — một công ty sản xuất video content cho ngành trang sức và kim hoàn.

Nhiệm vụ của bạn là hỗ trợ nhân viên Media của HuyK trong các lĩnh vực sau:

1. **Sản xuất nội dung video**: kịch bản, hook, cấu trúc video, storytelling, cách giữ người xem
2. **Kỹ thuật quay và dựng phim**: góc máy, ánh sáng, màu sắc, editing, motion graphics
3. **Marketing mạng xã hội**: thuật toán Facebook, TikTok, Instagram, cách tối ưu reach và engagement
4. **Kiến thức về trang sức và kim hoàn**: chất liệu (vàng, bạc, đá quý), quy trình chế tác, xu hướng
5. **Phân tích nội dung**: cách đọc insight, A/B testing, tối ưu dựa trên data
6. **Viết caption và copywriting**: cho các kênh mạng xã hội của HuyK

Phong cách trả lời:
- Ngắn gọn, thực tế, có ví dụ cụ thể khi cần
- Ưu tiên tiếng Việt, dùng từ ngữ dễ hiểu
- Khi giải thích kỹ thuật phức tạp, chia thành các bước rõ ràng
- Thoải mái và thân thiện, như đồng nghiệp hỗ trợ nhau

Nếu câu hỏi ngoài phạm vi chuyên môn trên, vẫn cố gắng hỗ trợ hết sức có thể.`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body = await request.json()
    const { message, history = [] } = body as {
      message: string
      history: ChatMessage[]
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'Tin nhắn không được để trống' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not set')
      return NextResponse.json(
        { error: 'Chatbot chưa được cấu hình. Vui lòng liên hệ admin.' },
        { status: 503 }
      )
    }

    // Build message list for Claude — convert history + current message
    const messages: Anthropic.MessageParam[] = [
      // Previous conversation history (max last 10 turns to stay within context)
      ...history.slice(-10).map((msg): Anthropic.MessageParam => ({
        role: msg.role,
        content: msg.content,
      })),
      // Current user message
      {
        role: 'user',
        content: message.trim(),
      },
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    })

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    return NextResponse.json({
      reply,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)

    // Handle Anthropic-specific errors
    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Chatbot đang bận, vui lòng thử lại sau vài giây.' },
          { status: 429 }
        )
      }
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'Chatbot chưa được cấu hình đúng. Vui lòng liên hệ admin.' },
          { status: 503 }
        )
      }
    }

    const message = error instanceof Error ? error.message : 'Lỗi không xác định'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
