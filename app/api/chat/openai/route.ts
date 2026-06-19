import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { Response, ResponseFunctionToolCall, ResponseInputItem, Tool } from 'openai/resources/responses/responses'
import type { ChatMessage, PageContext } from '@/types/chat'
import { availableTools, toolExecutors } from '../tools'
import { createClient as supabaseClient } from '@/lib/supabase/server';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

interface OpenAIAPIRequest {
  message: string
  context?: PageContext | null
  messages?: ChatMessage[]
  model?: string
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
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

interface OpenAIAPIResponse {
  message: string
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
  }>
  citations?: Array<{
    url: string
    title: string
    cited_text: string
  }>
  rawResponse?: unknown
}

type ResponsesInputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }

type ResponsesInputMessage = {
  role: 'user' | 'assistant'
  content: string | ResponsesInputContent[]
}

export async function POST(request: NextRequest): Promise<NextResponse<OpenAIAPIResponse>> {
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
    
    let body: OpenAIAPIRequest

    // Check if the request is multipart/form-data (file upload)
    const contentType = request.headers.get('content-type') || ''
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      
      const message = formData.get('message') as string
      const contextStr = formData.get('context') as string
      const messagesStr = formData.get('messages') as string
      const model = formData.get('model') as string
      const reasoningEffort = formData.get('reasoning_effort') as 'none' | 'low' | 'medium' | 'high' | 'xhigh'
      const clientTz = (formData.get('client_tz') as string) || ''
      const clientOffset = (formData.get('client_utc_offset') as string) || ''
      const clientNowIso = (formData.get('client_now_iso') as string) || ''
      const clientPath = (formData.get('client_path') as string) || ''
      const webSearchEnabled = formData.get('web_search_enabled') !== 'false'
      const attachmentCount = parseInt(formData.get('attachmentCount') as string || '0')
      
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
      
      body = { message, context, messages, model, reasoningEffort, attachments, clientTz, clientOffset, clientNowIso, clientPath, webSearchEnabled } as unknown as OpenAIAPIRequest
    } else {
      // Handle JSON request (backward compatibility)
      body = await request.json()
    }

    const {
      message,
      context,
      messages = [],
      model,
      reasoningEffort,
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

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { message: 'OpenAI API key is not configured' },
        { status: 500 }
      )
    }

    const response = await getOpenAIResponse(
      messages,
      message,
      context || null,
      attachments,
      model,
      reasoningEffort,
      clientTz,
      clientOffset,
      clientNowIso,
      clientPath,
      webSearchEnabled,
      request.signal
    )

    return NextResponse.json(response)
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ message: 'Request cancelled' }, { status: 499 })
    }
    console.error('OpenAI API error:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('OPENAI_API_KEY')) {
        return NextResponse.json(
          { message: 'AI service is not configured. Please check the API key.' },
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

// Convert Anthropic tools to OpenAI function format
function convertToolsToOpenAI(webSearchEnabled: boolean): Tool[] {
  return availableTools
    .filter((tool) => webSearchEnabled || (tool.name !== 'web_search' && tool.name !== 'web_scrape'))
    .map((tool): Tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    strict: false,
  }))
}

async function executeFunctionCall(functionName: string, parameters: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const executor = toolExecutors[functionName]
    if (!executor) {
      return { success: false, error: `Unknown function: ${functionName}` }
    }
    
    return await executor(parameters)
  } catch (error) {
    console.error('Function execution error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

async function getOpenAIResponse(
  history: ChatMessage[],
  newUserMessage: string,
  context: PageContext | null,
  attachments: Array<{ file: File; name: string; type: string; size: number }> = [],
  model?: string,
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh',
  clientTz: string = '',
  clientOffset: string = '',
  clientNowIso: string = '',
  clientPath: string = '',
  webSearchEnabled: boolean = true,
  signal?: AbortSignal
): Promise<OpenAIAPIResponse> {
  try {
    // 1. System Prompt
    let systemPrompt = `You are a helpful assistant. Use the available tools when appropriate to help users with their requests.

Image Processing Capabilities:
- You can analyze and understand images that users upload
- Extract relevant information from documents, screenshots, or images when users share them

Web Search Capabilities:
- Use the available web tools for current, time-sensitive, or externally verifiable information
- Use web_scrape when search result descriptions do not contain enough evidence
- Cite web sources as descriptive Markdown links in your response

If a tool responds with a url to a record, include it in your response using markdown.`

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

    // 2. Map history to Responses API input messages (filter out system messages)
    const openaiHistory: ResponsesInputMessage[] = history
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))

    // 3. Construct the new user message with attachments
    const newUserContent: ResponsesInputMessage = {
      role: 'user',
      content: newUserMessage
    }

    // Process attachments for Responses API.
    if (attachments.length > 0) {
      const contentBlocks: ResponsesInputContent[] = [
        { type: 'input_text', text: newUserMessage }
      ]

      for (const attachment of attachments) {
        if (attachment.type.startsWith('image/')) {
          const arrayBuffer = await attachment.file.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          const dataUrl = `data:${attachment.type};base64,${base64}`

          contentBlocks.push({
            type: 'input_image',
            image_url: dataUrl,
            detail: 'auto',
          })
        } else {
          contentBlocks.push({
            type: 'input_text',
            text: `\n\nFile attachment: ${attachment.name} (${attachment.type}, ${formatFileSize(attachment.size)})`
          })
        }
      }

      newUserContent.content = contentBlocks
    }

    const initialInput: ResponseInputItem[] = [
      ...openaiHistory,
      newUserContent,
    ]

    // 4. Prepare tools
    const tools = convertToolsToOpenAI(webSearchEnabled)

    // 5. Iterative tool calling with maximum of 5 iterations.
    let maxIterations = 5
    let previousResponseId: string | undefined
    let nextInput: ResponseInputItem[] = initialInput
    let finalResponse: Response | null = null
    const allToolResults: Array<{ success: boolean; data?: unknown; error?: string }> = []
    const allToolCalls: Array<{
      id: string
      name: string
      arguments: Record<string, unknown>
      result?: {
        success: boolean
        data?: unknown
        error?: string
      }
    }> = []

    while (maxIterations > 0) {
      signal?.throwIfAborted()
      const response = await openai.responses.create({
        model: model || 'gpt-5',
        instructions: systemPrompt,
        input: nextInput,
        previous_response_id: previousResponseId,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
      }, { signal })

      previousResponseId = response.id

      const toolCalls = response.output.filter(
        (item): item is ResponseFunctionToolCall =>
          item.type === 'function_call' &&
          typeof item.call_id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.arguments === 'string'
      )

      if (toolCalls.length === 0) {
        finalResponse = response
        break
      }

      nextInput = await Promise.all(
        toolCalls.map(async (toolCall) => {
          signal?.throwIfAborted()
          let parsedArgs: Record<string, unknown>
          try {
            parsedArgs = JSON.parse(toolCall.arguments)
          } catch (error) {
            console.error('Failed to parse tool arguments:', error)
            parsedArgs = {}
          }

          const augmentedArgs = {
            ...parsedArgs,
            client_tz: clientTz,
            client_utc_offset: clientOffset,
            client_now_iso: clientNowIso,
          }
          const functionResult = await executeFunctionCall(toolCall.name, augmentedArgs)
          signal?.throwIfAborted()
          allToolResults.push(functionResult)

          allToolCalls.push({
            id: toolCall.id || toolCall.call_id,
            name: toolCall.name,
            arguments: augmentedArgs,
            result: functionResult
          })

          return {
            type: 'function_call_output' as const,
            call_id: toolCall.call_id,
            output: JSON.stringify(functionResult),
          }
        })
      )

      maxIterations--
    }

    // Handle the final response
    if (finalResponse) {
      const content = finalResponse.output_text?.trim() || 'No response generated'

      // Get the first successful result for legacy response format
      const firstSuccessfulResult = allToolResults.find(result => result.success)

      return {
        message: content,
        functionResult: firstSuccessfulResult ? { success: true, data: firstSuccessfulResult.data } : { success: false, error: 'All tools failed' },
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        citations: [],
        actions: [],
        rawResponse: finalResponse
      }
    }

    // Fallback response if no tools were executed
    return {
      message: 'I apologize, but I encountered an error processing your request. Please try again.',
      actions: []
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    throw new Error('Failed to get response from OpenAI API')
  }
}
