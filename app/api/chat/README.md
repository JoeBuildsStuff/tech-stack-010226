# Chat API

This directory contains the chat API endpoints, supporting multiple AI providers and models.

## Available Endpoints

### 1. Anthropic Chat API (`/api/chat/anthropic`)

- **Provider**: Anthropic (Claude models)
- **Models**: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5
- **Features**: Function calling, web search, file attachments, context awareness
- **File**: `anthropic/route.ts`

### 2. OpenAI Chat API (`/api/chat/openai`)

- **Provider**: OpenAI
- **Models**: GPT-5.5, GPT-5.4, GPT-5, GPT-5.4 Mini, GPT-5.4 Nano
- **Features**: Function calling, Firecrawl web search, file attachments, context awareness
- **File**: `openai/route.ts`

### 3. Cerebras Chat API (`/api/chat/cerebras`)

- **Provider**: Cerebras
- **Models**: GPT-OSS-120B
- **Features**: Function calling, reasoning effort control, file attachments
- **File**: `cerebras/route.ts`

### 4. xAI Chat API (`/api/chat/xai`)

- **Provider**: xAI (Grok)
- **Models**: Grok 4.5
- **Features**: Function calling, reasoning effort control (`low`/`medium`/`high`), file attachments, Firecrawl web search
- **File**: `xai/route.ts`

## Model Selection

Users can select from different AI models in the chat interface:

- **Anthropic Models**: `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`
- **OpenAI Models**: `gpt-5.5`, `gpt-5.4`, `gpt-5`, `gpt-5.4-mini`, `gpt-5.4-nano`
- **xAI Models**: `grok-4.5`
- **Cerebras Models**: `gpt-oss-120b`

## Reasoning Effort Control

Some models support configurable reasoning effort levels:

- **None**: No additional reasoning effort
- **Low**: Fastest response, minimal reasoning
- **Medium**: Balanced speed and reasoning (default)
- **High**: Maximum reasoning, best quality
- **XHigh**: Maximum available OpenAI reasoning effort

Currently supported by:

- Cerebras GPT-OSS-120B (`low`, `medium`, `high`)
- OpenAI GPT-5 models (`none`, `low`, `medium`, `high`, `xhigh`)
- xAI Grok 4.5 (`low`, `medium`, `high`; defaults to `high`)

## Function Calling

All endpoints share the same tool system. Add project-specific tools in `tools/` — see `tools/README.md` for instructions.

## File Attachments

All endpoints support file uploads:

- **Images**: Processed for content extraction
- **Documents**: Converted to text descriptions
- **Audio/Video**: Metadata extraction

## Environment Variables

```bash
# Required for Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# Required for OpenAI
OPENAI_API_KEY=your_openai_api_key

# Required for Cerebras
CEREBRAS_API_KEY=your_cerebras_api_key

# Required for xAI (Grok)
XAI_API_KEY=your_xai_api_key

# Optional shared web search and scraping for every provider
FIRECRAWL_API_KEY=fc-your_firecrawl_api_key

# Claude-native fallback when Firecrawl is not configured
WEB_SEARCH_MAX_USES=5
```

## Usage

The chat interface automatically routes requests to the appropriate API based on the selected model. Users can:

1. Select their preferred AI model
2. Configure reasoning effort (if supported)
3. Send messages with or without attachments
4. Use natural language to interact with the system

## Architecture

- **Unified Interface**: All endpoints use the same request/response format
- **Tool Conversion**: OpenAI and Cerebras endpoints convert Anthropic tools to their native format
- **Error Handling**: Comprehensive error handling across all endpoints
- **Context Preservation**: Chat history and page context maintained across all providers

## Development

To add a new AI provider:

1. Create a new directory under `src/app/api/chat/`
2. Implement the route with the same interface
3. Add model options to the chat input component
4. Update the useChat hook to route to the new endpoint
5. Document the integration in this README
