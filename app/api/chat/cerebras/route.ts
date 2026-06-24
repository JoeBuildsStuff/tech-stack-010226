import { NextRequest, NextResponse } from 'next/server'
import type { ChatMessage, PageContext } from '@/types/chat'
import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { availableTools, toolExecutors, type ToolExecutionContext } from '../tools'
import { createClient as supabaseClient } from '@/lib/supabase/server';

// Initialize Cerebras client
const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY || '',
})

interface CerebrasAPIRequest {
  message: string
  context?: PageContext | null
  messages?: ChatMessage[]
  model?: string
  reasoning_effort?: 'low' | 'medium' | 'high'
  stream?: boolean
  max_completion_tokens?: number
  temperature?: number
  top_p?: number
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
  webSearchEnabled?: boolean
}

interface CerebrasAPIResponse {
  message: string
  reasoning?: string
  stream?: ReadableStream
  rawResponse?: unknown
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
    result?: {
      success: boolean
      data?: unknown
      error?: string
    }
  }>
  citations?: Array<{
    url: string
    title: string
    cited_text: string
  }>
}

// Cerebras response type interfaces
interface CerebrasStreamingChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
}

interface CerebrasResponse {
  choices?: Array<{
    message?: {
      content?: string
      reasoning?: string
      tool_calls?: Array<{
        id: string
        function: {
          name: string
          arguments: string
        }
      }>
    }
  }>
}



type CerebrasMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; reasoning?: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; content: string; tool_call_id: string };

const encoder = new TextEncoder()

function encodeSSE(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// Convert Anthropic tool format to Cerebras tool format
function convertToolsToCerebrasFormat(tools: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>) {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || `Tool for ${tool.name}`,
      parameters: tool.input_schema
    }
  }))
}

// Execute function calls for Cerebras
async function executeFunctionCall(
  functionName: string,
  parameters: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const executor = toolExecutors[functionName]
    if (!executor) {
      return { success: false, error: `Unknown function: ${functionName}` }
    }
    
    return await executor(parameters, context)
  } catch (error) {
    console.error('Function execution error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {

    // Check authentication
    const supabase = await supabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { message: 'User not authenticated' },
        { status: 401 }
      )
    }

    let body: CerebrasAPIRequest

    // Check if the request is multipart/form-data (file upload)
    const contentType = request.headers.get('content-type') || ''
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      
      const message = formData.get('message') as string
      const contextStr = formData.get('context') as string
      const messagesStr = formData.get('messages') as string
      const model = formData.get('model') as string
      const reasoningEffort = formData.get('reasoning_effort') as 'low' | 'medium' | 'high'
      const stream = formData.get('stream') === 'true'
      const maxCompletionTokens = parseInt(formData.get('max_completion_tokens') as string || '65536')
      const temperature = parseFloat(formData.get('temperature') as string || '1')
      const topP = parseFloat(formData.get('top_p') as string || '1')
      const attachmentCount = parseInt(formData.get('attachmentCount') as string || '0')
      const clientTz = (formData.get('client_tz') as string) || ''
      const clientOffset = (formData.get('client_utc_offset') as string) || ''
      const clientNowIso = (formData.get('client_now_iso') as string) || ''
      const clientPath = (formData.get('client_path') as string) || ''
      const webSearchEnabled = formData.get('web_search_enabled') !== 'false'
      
      const context = contextStr && contextStr !== 'null' ? JSON.parse(contextStr) : null
      const messages = messagesStr ? JSON.parse(messagesStr) : []
      
      const attachments: Array<{ file: File; name: string; type: string; size: number }> = []
      
      // Process attachments
      for (let i = 0; i < attachmentCount; i++) {
        const file = formData.get(`attachment-${i}`) as File
        const name = formData.get(`attachment-${i}-name`) as string
        const type = formData.get(`attachment-${i}-type`) as string
        const size = parseInt(formData.get(`attachment-${i}-size`) as string || '0')
        
        if (file) {
          attachments.push({ file, name, type, size })
        }
      }
      
      body = { 
        message, 
        context, 
        messages, 
        model, 
        reasoning_effort: reasoningEffort,
        stream,
        max_completion_tokens: maxCompletionTokens,
        temperature,
        top_p: topP,
        attachments,
        clientTz,
        clientOffset,
        clientNowIso,
        clientPath,
        webSearchEnabled,
      }
    } else {
      // Handle JSON request
      body = await request.json()
    }

    const { 
      message, 
      context, 
      messages = [], 
      model = 'gpt-oss-120b',
      reasoning_effort = 'low',
      stream = false,
      max_completion_tokens = 65536,
      temperature = 1,
      top_p = 1,
      attachments = [],
      clientTz = '',
      clientOffset = '',
      clientNowIso = '',
      clientPath = '',
      webSearchEnabled = true,
    } = body

    // Validate input
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { message: 'Invalid message content' },
        { status: 400 }
      )
    }

    if (!process.env.CEREBRAS_API_KEY) {
      return NextResponse.json(
        { message: 'Cerebras API key is not configured' },
        { status: 500 }
      )
    }

    const toolContext: ToolExecutionContext = {
      appBaseUrl: request.nextUrl.origin,
    }

    if (stream) {
      return streamCerebrasResponse({
        history: messages,
        newUserMessage: message,
        context: context || null,
        attachments,
        model,
        reasoning_effort,
        max_completion_tokens,
        temperature,
        top_p,
        clientTz,
        clientOffset,
        clientNowIso,
        clientPath,
        webSearchEnabled,
        toolContext,
        signal: request.signal,
      })
    }

    const response = await getCerebrasResponse(
      messages,
      message,
      context || null,
      attachments,
      model,
      reasoning_effort,
      max_completion_tokens,
      temperature,
      top_p,
      clientTz,
      clientOffset,
      clientNowIso,
      clientPath,
      webSearchEnabled,
      toolContext,
      request.signal,
    )

    return NextResponse.json(response)
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ message: 'Request cancelled' }, { status: 499 })
    }
    console.error('Cerebras API error:', error)
    
    // More specific error handling
    if (error instanceof Error) {
      if (error.message.includes('CEREBRAS_API_KEY')) {
        return NextResponse.json(
          { message: 'Cerebras service is not configured. Please check the API key.' },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { message: `Error: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { message: 'I apologize, but I encountered an error processing your request. Please try again.' },
      { status: 500 }
    )
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Build the system prompt, message history (with attachments) and tool list
// shared by the streaming and non-streaming paths.
async function buildCerebrasMessages({
  history,
  newUserMessage,
  context,
  attachments = [],
  clientTz = '',
  clientOffset = '',
  clientNowIso = '',
  clientPath = '',
  webSearchEnabled = true,
}: {
  history: ChatMessage[]
  newUserMessage: string
  context: PageContext | null
  attachments?: Array<{ file: File; name: string; type: string; size: number }>
  clientTz?: string
  clientOffset?: string
  clientNowIso?: string
  clientPath?: string
  webSearchEnabled?: boolean
}): Promise<{ currentMessages: CerebrasMessage[]; cerebrasTools: ReturnType<typeof convertToolsToCerebrasFormat> }> {
  // 1. System Prompt
  let systemPrompt = `You are a helpful assistant. Use the available tools when appropriate to help users with their requests.

Web Search Capabilities:
- Use the available web tools for current, time-sensitive, or externally verifiable information
- Use web_scrape when search result descriptions do not contain enough evidence
- Cite web sources as descriptive Markdown links in your response

If a tool responds with a url to a record, include it in your response using markdown.
When linking to app records in markdown, use the exact absolute URL returned by the tool. Do not rewrite it as a relative path.`

  if (!webSearchEnabled) {
    systemPrompt += `\n\nWeb access is disabled for this request. Do not claim to have searched or accessed the web.`
  }

  // Provide user locale/timezone context to the model
  if (clientTz || clientOffset || clientNowIso) {
    systemPrompt += `\n\nUser Locale Context:\n- Timezone: ${clientTz || 'unknown'}\n- UTC offset (at request): ${clientOffset || 'unknown'}\n- Local time at request: ${clientNowIso || 'unknown'}`
  }

  if (clientPath) {
    systemPrompt += `\n\nUser Navigation Context:\n- Current path: ${clientPath}\n- If the path is /dashboard/notes/{id}, use that {id} as noteId for note tools.`
  }

  if (context) {
    systemPrompt += `\n\n## Current Page Context:\n- Total items: ${context.totalCount}\n- Current filters: ${JSON.stringify(context.currentFilters, null, 2)}\n- Current sorting: ${JSON.stringify(context.currentSort, null, 2)}\n- Visible data sample: ${JSON.stringify(context.visibleData.slice(0, 3), null, 2)}`
  }

  // 2. Convert tools to Cerebras format
  const cerebrasTools = convertToolsToCerebrasFormat(
    availableTools.filter(
      (tool) => webSearchEnabled || (tool.name !== 'web_search' && tool.name !== 'web_scrape')
    )
  )

  // 3. Map history to Cerebras format (filter out system messages)
  const cerebrasHistory: CerebrasMessage[] = [
    { role: 'system', content: systemPrompt }
  ]

  // Add conversation history - only include user messages and final assistant responses
  // Tool calls and their results should be handled in the current conversation flow, not from history
  history
    .filter(msg => msg.role !== 'system')
    .forEach(msg => {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Skip assistant messages with tool calls from history
        // These will be handled in the current conversation flow
        return
      } else {
        cerebrasHistory.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    })

  // 4. Construct the new user message with attachments
  let userContent = newUserMessage

  for (const attachment of attachments) {
    if (attachment.type.startsWith('image/')) {
      const arrayBuffer = await attachment.file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      // Add image description to the message
      userContent += `\n\nImage attachment: ${attachment.name} (${attachment.type}, ${formatFileSize(attachment.size)})\nBase64 data: ${base64}`
    } else {
      userContent += `\n\nFile attachment: ${attachment.name} (${attachment.type}, ${formatFileSize(attachment.size)})`
    }
  }

  // Add the new user message
  cerebrasHistory.push({
    role: 'user',
    content: userContent
  })

  return { currentMessages: cerebrasHistory, cerebrasTools }
}

type CerebrasToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: {
    success: boolean
    data?: unknown
    error?: string
  }
  reasoning?: string
}

// Execute the tool calls returned in one assistant turn, append the assistant
// message + tool results to `currentMessages`, and record them in `allToolCalls`.
async function runCerebrasToolCalls({
  toolCalls,
  assistantContent,
  reasoning,
  currentMessages,
  allToolCalls,
  clientTz,
  clientOffset,
  clientNowIso,
  toolContext,
  signal,
}: {
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>
  assistantContent: string
  reasoning?: string
  currentMessages: CerebrasMessage[]
  allToolCalls: CerebrasToolCall[]
  clientTz: string
  clientOffset: string
  clientNowIso: string
  toolContext?: ToolExecutionContext
  signal?: AbortSignal
}): Promise<void> {
  // Save the assistant's message exactly as returned (including tool_calls and reasoning)
  currentMessages.push({
    role: 'assistant',
    content: assistantContent,
    reasoning,
    tool_calls: toolCalls.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: tc.function,
    })),
  })

  // Execute all tools in parallel
  const toolResults = await Promise.all(
    toolCalls.map(async (toolCall) => {
      signal?.throwIfAborted()
      let baseArgs: Record<string, unknown>
      try {
        baseArgs = JSON.parse(toolCall.function.arguments)
      } catch (error) {
        console.error('Failed to parse tool arguments:', error)
        baseArgs = {}
      }
      const augmentedArgs = {
        ...baseArgs,
        client_tz: clientTz,
        client_utc_offset: clientOffset,
        client_now_iso: clientNowIso,
      }
      const functionResult = await executeFunctionCall(
        toolCall.function.name,
        augmentedArgs,
        toolContext,
      )
      signal?.throwIfAborted()

      allToolCalls.push({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: augmentedArgs,
        result: functionResult,
        reasoning,
      })

      return {
        role: 'tool' as const,
        content: functionResult.success ? JSON.stringify(functionResult.data) : functionResult.error || 'Unknown error',
        tool_call_id: toolCall.id,
      }
    })
  )

  // Append tool results to messages
  currentMessages.push(...toolResults)
}

async function getCerebrasResponse(
  history: ChatMessage[],
  newUserMessage: string,
  context: PageContext | null,
  attachments: Array<{ file: File; name: string; type: string; size: number }> = [],
  model: string = 'gpt-oss-120b',
  reasoning_effort: 'low' | 'medium' | 'high' = 'low',
  max_completion_tokens: number = 65536,
  temperature: number = 1,
  top_p: number = 1,
  clientTz: string = '',
  clientOffset: string = '',
  clientNowIso: string = '',
  clientPath: string = '',
  webSearchEnabled: boolean = true,
  toolContext?: ToolExecutionContext,
  signal?: AbortSignal
): Promise<CerebrasAPIResponse> {
  try {
    const { currentMessages, cerebrasTools } = await buildCerebrasMessages({
      history,
      newUserMessage,
      context,
      attachments,
      clientTz,
      clientOffset,
      clientNowIso,
      clientPath,
      webSearchEnabled,
    })

    // Multi-turn tool calling with maximum of 5 iterations
    let maxIterations = 5
    let finalResponse: CerebrasResponse | null = null
    const allToolCalls: CerebrasToolCall[] = []

    while (maxIterations > 0) {
      signal?.throwIfAborted()
      const response = await cerebras.chat.completions.create({
        messages: currentMessages,
        model: model,
        stream: false,
        max_completion_tokens: max_completion_tokens,
        temperature: temperature,
        top_p: top_p,
        reasoning_effort: reasoning_effort,
        tools: cerebrasTools,
      }, { signal })

      const typedResponse = response as CerebrasResponse
      const message = typedResponse.choices?.[0]?.message

      if (!message) {
        throw new Error('No message in response')
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        await runCerebrasToolCalls({
          toolCalls: message.tool_calls,
          assistantContent: message.content || '',
          reasoning: message.reasoning,
          currentMessages,
          allToolCalls,
          clientTz,
          clientOffset,
          clientNowIso,
          toolContext,
          signal,
        })
        maxIterations--
      } else {
        // No more tools to execute, this is our final response
        finalResponse = typedResponse
        break
      }
    }

    // Handle the final response
    if (finalResponse) {
      const content = finalResponse.choices?.[0]?.message?.content || 'No response generated'
      const finalReasoning = finalResponse.choices?.[0]?.message?.reasoning

      return {
        message: content,
        reasoning: finalReasoning, // Only include final reasoning, tool call reasoning is now associated with each tool call
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        rawResponse: finalResponse,
      }
    }

    // Fallback response if no tools were executed
    return {
      message: 'I apologize, but I encountered an error processing your request. Please try again.',
    }
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('Cerebras API error:', error)
    throw new Error('Failed to get response from Cerebras API')
  }
}

function streamCerebrasResponse({
  history,
  newUserMessage,
  context,
  attachments = [],
  model = 'gpt-oss-120b',
  reasoning_effort = 'low',
  max_completion_tokens = 65536,
  temperature = 1,
  top_p = 1,
  clientTz = '',
  clientOffset = '',
  clientNowIso = '',
  clientPath = '',
  webSearchEnabled = true,
  toolContext,
  signal,
}: {
  history: ChatMessage[]
  newUserMessage: string
  context: PageContext | null
  attachments?: Array<{ file: File; name: string; type: string; size: number }>
  model?: string
  reasoning_effort?: 'low' | 'medium' | 'high'
  max_completion_tokens?: number
  temperature?: number
  top_p?: number
  clientTz?: string
  clientOffset?: string
  clientNowIso?: string
  clientPath?: string
  webSearchEnabled?: boolean
  toolContext?: ToolExecutionContext
  signal?: AbortSignal
}): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encodeSSE(event, data))
      }

      try {
        const { currentMessages, cerebrasTools } = await buildCerebrasMessages({
          history,
          newUserMessage,
          context,
          attachments,
          clientTz,
          clientOffset,
          clientNowIso,
          clientPath,
          webSearchEnabled,
        })

        let maxIterations = 5
        let finalMessage = ''
        let finalReasoning: string | undefined
        const allToolCalls: CerebrasToolCall[] = []

        while (maxIterations > 0) {
          signal?.throwIfAborted()
          const streamResponse = await cerebras.chat.completions.create({
            messages: currentMessages,
            model: model,
            stream: true,
            max_completion_tokens: max_completion_tokens,
            temperature: temperature,
            top_p: top_p,
            reasoning_effort: reasoning_effort,
            tools: cerebrasTools,
          }, { signal })

          // Accumulate streamed content and tool-call fragments for this turn.
          let contentBuf = ''
          let reasoningBuf = ''
          const toolCallsAcc: Array<{ id: string; name: string; arguments: string }> = []
          const toolCallIndex = new Map<number, number>()

          if (Symbol.asyncIterator in streamResponse) {
            for await (const chunk of streamResponse as AsyncIterable<CerebrasStreamingChunk>) {
              signal?.throwIfAborted()
              const delta = chunk.choices?.[0]?.delta
              if (!delta) continue

              if (delta.content) {
                contentBuf += delta.content
                send('delta', { delta: delta.content })
              }
              if (delta.reasoning) {
                reasoningBuf += delta.reasoning
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  let pos = toolCallIndex.get(tc.index)
                  if (pos === undefined) {
                    pos = toolCallsAcc.length
                    toolCallIndex.set(tc.index, pos)
                    toolCallsAcc.push({ id: tc.id || '', name: tc.function?.name || '', arguments: '' })
                  }
                  if (tc.id) toolCallsAcc[pos].id = tc.id
                  if (tc.function?.name) toolCallsAcc[pos].name = tc.function.name
                  if (tc.function?.arguments) toolCallsAcc[pos].arguments += tc.function.arguments
                }
              }
            }
          }

          const turnReasoning = reasoningBuf || undefined

          if (toolCallsAcc.length > 0) {
            await runCerebrasToolCalls({
              toolCalls: toolCallsAcc.map(tc => ({
                id: tc.id,
                function: { name: tc.name, arguments: tc.arguments },
              })),
              assistantContent: contentBuf,
              reasoning: turnReasoning,
              currentMessages,
              allToolCalls,
              clientTz,
              clientOffset,
              clientNowIso,
              toolContext,
              signal,
            })
            maxIterations--
          } else {
            // No tool calls: this turn is the final response.
            finalMessage = contentBuf
            finalReasoning = turnReasoning
            break
          }
        }

        send('done', {
          message: finalMessage.trim() || 'No response generated',
          reasoning: finalReasoning,
          toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
          citations: [],
        } satisfies CerebrasAPIResponse)
      } catch (error) {
        if (!signal?.aborted) {
          console.error('Cerebras API streaming error:', error)
          send('error', {
            message: error instanceof Error ? error.message : 'Failed to get response from Cerebras API',
          })
        }
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
