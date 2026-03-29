# Chat API

This directory contains the chat API endpoints, supporting multiple AI providers and models.

## Available Endpoints

### 1. Main Chat API (`/api/chat`)
- **Provider**: Anthropic (Claude models)
- **Models**: Haiku 4.5, Sonnet 4.6, Opus 4.6
- **Features**: Function calling, web search, file attachments, context awareness
- **File**: `route.ts`

### 2. OpenAI Chat API (`/api/chat/openai`)
- **Provider**: OpenAI
- **Models**: GPT-5, GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano
- **Features**: Function calling, file attachments, context awareness
- **File**: `openai/route.ts`

### 3. Cerebras Chat API (`/api/chat/cerebras`)
- **Provider**: Cerebras
- **Models**: GPT-OSS-120B
- **Features**: Function calling, reasoning effort control, file attachments
- **File**: `cerebras/route.ts`

## Model Selection

Users can select from different AI models in the chat interface:

- **Anthropic Models**: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`
- **OpenAI Models**: `gpt-5.4`, `gpt-5`, `gpt-5.4-mini`, `gpt-5.4-nano`
- **Cerebras Models**: `gpt-oss-120b`

## Reasoning Effort Control

Some models support configurable reasoning effort levels:
- **Low**: Fastest response, minimal reasoning
- **Medium**: Balanced speed and reasoning (default)
- **High**: Maximum reasoning, best quality

Currently supported by:
- Cerebras GPT-OSS-120B
- OpenAI GPT-5 models (parameter passed but not yet utilized)

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

# Optional for web search
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
