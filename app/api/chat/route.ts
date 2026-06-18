// app/api/chat/route.ts (or wherever your route lives)
import { NextRequest, NextResponse } from 'next/server'
import type { ChatMessage, PageContext } from '@/types/chat'
import Anthropic from '@anthropic-ai/sdk'
import { availableTools, toolExecutors } from './tools'
import { createClient as supabaseClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic client
// ─────────────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ChatAPIRequest {
  message: string
  context?: PageContext | null
  messages?: ChatMessage[]
  model?: string
  attachments?: Array<{
    file: File
    name: string
    type: string
    size: number
  }>
  clientTz?: string
  clientOffset?: string
  clientNowIso?: string
  clientPath?: string
}

interface ChatAPIResponse {
  message: string
  reasoning?: string
  actions?: Array<{
    type: 'filter' | 'sort' | 'navigate' | 'create' | 'function_call'
    label: string
    payload: Record<string, unknown>
  }>
  functionResult?: {
    success: boolean
    data?: unknown
    error?: string
  }
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
    result?: {
      success: boolean
      data?: unknown
      error?: string
    }
    reasoning?: string
  }>
  citations?: Array<{
    url: string
    title: string
    cited_text: string
  }>
  rawResponse?: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Use imported tool definitions
const availableFunctions = availableTools

async function executeFunctionCall(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const executor = (toolExecutors as Record<string, (args: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>>)[functionName]
    if (!executor) return { success: false, error: `Unknown function: ${functionName}` }
    return await executor(parameters)
  } catch (error) {
    console.error('Function execution error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

// Build final API response from the last Anthropic message + accumulated tool data
interface TextBlock {
  type: 'text'
  text: string
  citations?: Array<{
    type: string
    url?: string
    title?: string
    cited_text?: string
  }>
}

function buildChatApiResponse(
  resp: Anthropic.Messages.Message,
  allToolCalls: NonNullable<ChatAPIResponse['toolCalls']>,
  allToolResults: Array<{ success: boolean; data?: unknown; error?: string }>,
): ChatAPIResponse {
  const textBlocks = resp.content.filter((b) => b.type === 'text') as TextBlock[]

  // Build message text with inline citation markers like [1][2] and collect metadata
  const citations: NonNullable<ChatAPIResponse['citations']> = []
  const messageText = textBlocks
    .map((tb) => {
      let blockText = tb.text || ''
      const cits = (tb.citations || []).filter((c) => c.type === 'web_search_result_location')
      if (cits.length > 0) {
        const markers: string[] = []
        for (const c of cits) {
          citations.push({
            url: c.url || '',
            title: c.title || '',
            cited_text: c.cited_text || '',
          })
          markers.push(`[${citations.length}]`)
        }
        blockText += markers.join('')
      }
      return blockText
    })
    .join('')
    .trim()

  // First successful custom tool result (legacy convenience)
  const firstSuccess = allToolResults.find((r) => r.success)

  return {
    message: messageText || (resp.stop_reason === 'max_tokens' ? 'Partial output (hit max_tokens).' : 'Done.'),
    // If you want to expose "reasoning", you could also carry forward a pre-tool text blurb.
    reasoning: undefined,
    functionResult: firstSuccess ? { success: true, data: firstSuccess.data } : undefined,
    toolCalls: allToolCalls.length ? allToolCalls : undefined,
    citations: citations.length ? citations : undefined,
    actions: [],
    rawResponse: resp,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse<ChatAPIResponse>> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { message: 'AI service is not configured. Please check the API key.' },
        { status: 500 },
      )
    }

    // Check authentication
    const supabase = await supabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { message: 'User not authenticated' },
        { status: 401 }
      )
    }

    let body: ChatAPIRequest

    // Parse multipart or JSON
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const message = (formData.get('message') as string) || ''
      const contextStr = formData.get('context') as string
      const messagesStr = formData.get('messages') as string
      const model = (formData.get('model') as string) || ''
      const clientTz = ((formData.get('client_tz') as string) || '').trim()
      const clientOffset = ((formData.get('client_utc_offset') as string) || '').trim()
      const clientNowIso = ((formData.get('client_now_iso') as string) || '').trim()
      const clientPath = ((formData.get('client_path') as string) || '').trim()
      const attachmentCount = parseInt((formData.get('attachmentCount') as string) || '0', 10)

      const context = contextStr && contextStr !== 'null' ? JSON.parse(contextStr) : null
      const messages = messagesStr ? JSON.parse(messagesStr) : []

      const attachments: Array<{ file: File; name: string; type: string; size: number }> = []
      for (let i = 0; i < attachmentCount; i++) {
        const file = formData.get(`attachment-${i}`) as File
        const name = (formData.get(`attachment-${i}-name`) as string) || file?.name || `attachment-${i}`
        const type = (formData.get(`attachment-${i}-type`) as string) || file?.type || 'application/octet-stream'
        const size = parseInt((formData.get(`attachment-${i}-size`) as string) || `${file?.size || 0}`, 10)
        if (file) attachments.push({ file, name, type, size })
      }

      body = { message, context, messages, model, attachments, clientTz, clientOffset, clientNowIso, clientPath }
    } else {
      body = await request.json()
    }

    const {
      message,
      context,
      messages = [],
      model,
      attachments = [],
      clientTz = '',
      clientOffset = '',
      clientNowIso = '',
      clientPath = '',
    } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ message: 'Invalid message content' }, { status: 400 })
    }

    const response = await getLLMResponse(
      messages,
      message,
      context || null,
      attachments,
      model,
      clientTz,
      clientOffset,
      clientNowIso,
      clientPath,
    )

    return NextResponse.json(response)
  } catch (error) {
    console.error('Chat API error:', error)
    if (error instanceof Error) {
      if (error.message.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          { message: 'AI service is not configured. Please check the API key.' },
          { status: 500 },
        )
      }
      return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json(
      { message: 'I apologize, but I encountered an error processing your request. Please try again.' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core LLM loop driven by stop_reason
// ─────────────────────────────────────────────────────────────────────────────
async function getLLMResponse(
  history: ChatMessage[],
  newUserMessage: string,
  context: PageContext | null,
  attachments: Array<{ file: File; name: string; type: string; size: number }> = [],
  model?: string,
  clientTz = '',
  clientOffset = '',
  clientNowIso = '',
  clientPath = '',
): Promise<ChatAPIResponse> {
  // 1) System prompt
  let systemPrompt = `You are a helpful assistant. Use the available tools when appropriate to help users with their requests.

Web Search Capabilities:
- Use the available web tools for current, time-sensitive, or externally verifiable information
- Use web_scrape when search result descriptions do not contain enough evidence
- Cite web sources as descriptive Markdown links in your response

If a tool responds with a url to a record, include it in your response using markdown.`

  if (clientTz || clientOffset || clientNowIso) {
    systemPrompt += `

User Locale Context:
- Timezone: ${clientTz || 'unknown'}
- UTC offset (at request): ${clientOffset || 'unknown'}
- Local time at request: ${clientNowIso || 'unknown'}`
  }

  if (clientPath) {
    systemPrompt += `

User Navigation Context:
- Current path: ${clientPath}
- If the path is /dashboard/notes/{id}, use that {id} as noteId for note tools.`
  }

  if (context) {
    systemPrompt += `

## Current Page Context:
- Total items: ${context.totalCount}
- Current filters: ${JSON.stringify(context.currentFilters, null, 2)}
- Current sorting: ${JSON.stringify(context.currentSort, null, 2)}
- Visible data sample: ${JSON.stringify(context.visibleData.slice(0, 3), null, 2)}`
  }

  // 2) Map history to Anthropic format (filter system messages)
  const anthropicHistory: Anthropic.MessageParam[] = history
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // 3) Construct the new user message with attachments
  const newUserContentBlocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: newUserMessage }]
  for (const attachment of attachments) {
    if (attachment.type.startsWith('image/')) {
      const arrayBuffer = await attachment.file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | undefined
      switch (attachment.type) {
        case 'image/jpeg':
        case 'image/jpg':
          mediaType = 'image/jpeg'
          break
        case 'image/png':
          mediaType = 'image/png'
          break
        case 'image/gif':
          mediaType = 'image/gif'
          break
        case 'image/webp':
          mediaType = 'image/webp'
          break
      }
      if (mediaType) {
        newUserContentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        })
      } else {
        newUserContentBlocks.push({
          type: 'text',
          text: `\n\nUnsupported image format: ${attachment.name} (${attachment.type}, ${formatFileSize(attachment.size)})`,
        })
      }
    } else {
      newUserContentBlocks.push({
        type: 'text',
        text: `\n\nFile attachment: ${attachment.name} (${attachment.type}, ${formatFileSize(attachment.size)})`,
      })
    }
  }

  const currentMessages: Anthropic.MessageParam[] = [
    ...anthropicHistory,
    { role: 'user', content: newUserContentBlocks },
  ]

  // 4) Tools: custom tools + web_search (server-side tool)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [...availableFunctions]
  // Firecrawl supplies the shared web_search tool when configured. Keep
  // Anthropic's native server tool as a Claude-only fallback.
  if (!process.env.FIRECRAWL_API_KEY) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: parseInt(process.env.WEB_SEARCH_MAX_USES || '5', 10),
    })
  }

  // 5) Loop controlled by stop_reason (maxIterations is only a fuse)
  const maxIterations = 5
  let iteration = 0

  // Accumulators
  const allToolResults: Array<{ success: boolean; data?: unknown; error?: string }> = []
  const allToolCalls: NonNullable<ChatAPIResponse['toolCalls']> = []

  while (iteration < maxIterations) {
    const resp = await anthropic.messages.create({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages: currentMessages,
    })

    const stopReason = resp.stop_reason // <- drive behavior from this
    const content = resp.content

    // Blocks
    interface ToolUseBlock {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
    
    interface ServerToolUseBlock {
      type: 'server_tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
    
    interface WebSearchResultBlock {
      type: 'web_search_tool_result'
      tool_use_id: string
      content: unknown
    }
    
    const textBlocks = content.filter((b) => b.type === 'text') as TextBlock[]
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use') as ToolUseBlock[]
    const serverToolUseBlocks = content.filter((b) => b.type === 'server_tool_use') as ServerToolUseBlock[]
    const webSearchResultBlocks = content.filter((b) => b.type === 'web_search_tool_result') as WebSearchResultBlock[]

    // Capture "reasoning" text preceding tools (if you want to attach per-call)
    const reasoningText = textBlocks.map((b) => b.text).join(' ').trim()

    // Record server_tool_use events (we don't execute them here; the platform does)
    if (serverToolUseBlocks.length) {
      for (const st of serverToolUseBlocks) {
        const correspondingResult = webSearchResultBlocks.find((r) => r.tool_use_id === st.id)
        allToolCalls.push({
          id: st.id,
          name: st.name,
          arguments: (st.input as Record<string, unknown>) || {},
          result: correspondingResult
            ? { success: true, data: correspondingResult.content || [] }
            : undefined,
          reasoning: st.name === 'web_search' ? undefined : (reasoningText || undefined),
        })
      }
    }

    // If the model asked us to use local tools, execute them and continue loop
    if (stopReason === 'tool_use' || toolUseBlocks.length > 0) {
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (tb) => {
          const augmentedInput = {
            ...(tb.input as Record<string, unknown>),
            client_tz: clientTz,
            client_utc_offset: clientOffset,
            client_now_iso: clientNowIso,
          }
          const result = await executeFunctionCall(tb.name, augmentedInput)
          allToolResults.push(result)
          allToolCalls.push({
            id: tb.id,
            name: tb.name,
            arguments: augmentedInput,
            result,
            reasoning: reasoningText || undefined,
          })
          return {
            type: 'tool_result' as const,
            tool_use_id: tb.id,
            content: result.success ? JSON.stringify(result.data) : result.error || 'Unknown error',
          }
        }),
      )

      // Append assistant turn and our tool results, then continue
      currentMessages.push({ role: 'assistant', content })
      currentMessages.push({ role: 'user', content: toolResults })
      iteration++
      continue
    }

    // Handle pause_turn (let the model continue next call in the same request)
    if (stopReason === 'pause_turn') {
      // Persist the assistant's partial turn and immediately continue
      currentMessages.push({ role: 'assistant', content })
      iteration++
      continue
    }

    // Terminal conditions: end_turn / stop_sequence / max_tokens / refusal / null fallback
    if (
      stopReason === 'end_turn' ||
      stopReason === 'stop_sequence' ||
      stopReason === 'max_tokens' ||
      stopReason === 'refusal' ||
      stopReason == null
    ) {
      // Build and return final response
      return buildChatApiResponse(resp, allToolCalls, allToolResults)
    }
  }

  // Safety fuse tripped
  return {
    message: 'I couldn’t complete the request within the tool-calling limit.',
    actions: [],
    toolCalls: allToolCalls.length ? allToolCalls : undefined,
  }
}
