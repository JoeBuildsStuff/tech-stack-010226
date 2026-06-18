# OpenAI Chat API

This directory contains the OpenAI integration for the chat API, implemented on top of the OpenAI Responses API with function calling capabilities.

## Features

- **GPT-5 Models**: Support for `gpt-5`, `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.4-nano`
- **Responses API**: Uses `responses.create(...)` instead of `chat.completions.create(...)`
- **Function Calling**: Full support for the tool system (add project-specific tools in `app/api/chat/tools/`)
- **Reasoning Effort**: Configurable reasoning effort levels (low, medium, high)
- **File Attachments**: Support for file uploads (converted to text descriptions)
- **Context Awareness**: Full integration with page context and chat history

## Environment Variables

Set the following environment variable:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

## API Endpoint

- **URL**: `/api/chat/openai`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data` or `application/json`

## Request Parameters

- `message` (string, required): The user's message
- `context` (string, optional): JSON stringified page context
- `messages` (string, optional): JSON stringified chat history
- `model` (string, optional): OpenAI model name (defaults to `gpt-5`)
- `reasoning_effort` (string, optional): Reasoning effort level - `none`, `low`, `medium`, `high`, or `xhigh`
- `attachments` (files, optional): File attachments

## Response Format

```typescript
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
```

## Function Calling

The OpenAI integration automatically converts the Anthropic tool definitions in `app/api/chat/tools/` to OpenAI function format. Add your own project-specific tools following the pattern in the tools README.

## Usage Example

```typescript
const formData = new FormData()
formData.append('message', 'Hello, how can you help?')
formData.append('model', 'gpt-5')
formData.append('reasoning_effort', 'high')

const response = await fetch('/api/chat/openai', {
  method: 'POST',
  body: formData
})

const result = await response.json()
console.log(result.message)
```

## Differences from Anthropic

- **Web Search**: Uses the shared Firecrawl tools when `FIRECRAWL_API_KEY` is configured
- **Citations**: Firecrawl sources are included as Markdown links rather than Anthropic citation blocks
- **File Handling**: Images are passed as Responses input images; non-image files are converted to text descriptions
- **Reasoning Effort**: The `reasoning_effort` parameter is forwarded to the Responses API

## Error Handling

The API includes comprehensive error handling for:
- Missing API keys
- Invalid requests
- OpenAI API errors
- Function execution errors

## Security

- API key validation
- Input sanitization
- Function execution sandboxing
- Rate limiting (handled by OpenAI)
