import type { Anthropic } from '@anthropic-ai/sdk'

// Get your Jina AI API key for free: https://jina.ai/?sui=apikey
const JINA_SEARCH_URL = 'https://s.jina.ai/'
const JINA_READER_URL = 'https://r.jina.ai/'
const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank'
const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 8
const DEFAULT_SCRAPE_CHARS = 12000
const MAX_SCRAPE_CHARS = 30000
const JINA_TIMEOUT_MS = 60000
const RERANK_MODEL = 'jina-reranker-v3.5'

type ToolResult = Promise<{ success: boolean; data?: unknown; error?: string }>

type JinaSearchResult = {
  title?: string
  url?: string
  description?: string
  content?: string
}

type JinaReaderData = {
  title?: string
  url?: string
  description?: string
  content?: string
}

type JinaJsonResponse<T> = {
  code?: number
  status?: number
  data?: T
  message?: string
  error?: string
}

type JinaRerankResponse = {
  results?: Array<{
    index: number
    relevance_score: number
    document?: { text?: string } | string
  }>
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function clampInteger(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.max(1, Math.min(value, maximum))
}

function truncate(value: string, maxChars: number) {
  return value.length <= maxChars
    ? { text: value, truncated: false }
    : { text: value.slice(0, maxChars), truncated: true }
}

function getJinaApiKey(): string {
  const apiKey = process.env.JINA_API_KEY
  if (!apiKey) throw new Error('JINA_API_KEY is not configured')
  return apiKey
}

function validatePublicUrl(value: unknown): string | null {
  const rawUrl = asString(value)
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const blockedHostname =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)

    return blockedHostname ? null : url.toString()
  } catch {
    return null
  }
}

async function jinaRequest<T>(
  url: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getJinaApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
  })

  const payload = (await response.json().catch(() => ({}))) as JinaJsonResponse<T>
  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || `Jina request failed with status ${response.status}`
    )
  }
  if (payload.data === undefined) throw new Error('Jina returned no data')

  return payload.data
}

async function rerankResults(
  query: string,
  results: Array<{ title: string; url: string; description: string }>
) {
  if (results.length <= 1) return results

  const documents = results.map((result) =>
    [result.title, result.description].filter(Boolean).join('\n')
  )

  const response = await fetch(JINA_RERANK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getJinaApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents,
      top_n: results.length,
      return_documents: false,
    }),
    signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
  })

  const payload = (await response.json().catch(() => ({}))) as JinaRerankResponse & {
    error?: string
    message?: string
  }

  if (!response.ok || !payload.results?.length) {
    throw new Error(
      payload.error || payload.message || `Jina rerank failed with status ${response.status}`
    )
  }

  return payload.results
    .map((item) => results[item.index])
    .filter((result): result is { title: string; url: string; description: string } => Boolean(result))
}

export const jinaSearchTool: Anthropic.Tool = {
  name: 'web_search',
  description:
    'Search the live web with Jina AI. Use for current, time-sensitive, or externally verifiable information. Returns source titles, URLs, and descriptions; cite the returned URLs in the final response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query, up to 500 characters.',
      },
      limit: {
        type: 'integer',
        description: `Number of results to return (1-${MAX_SEARCH_LIMIT}, default ${DEFAULT_SEARCH_LIMIT}).`,
      },
      site: {
        type: 'string',
        description: 'Optional domain to restrict search results to (e.g. example.com).',
      },
    },
    required: ['query'],
  },
}

export const jinaScrapeTool: Anthropic.Tool = {
  name: 'web_scrape',
  description:
    'Read the main content of a public web page with Jina AI Reader and return clean Markdown. Use after web_search when result descriptions are insufficient. Cite the page URL in the final response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'Public HTTP or HTTPS URL to read.',
      },
      maxChars: {
        type: 'integer',
        description: `Maximum Markdown characters to return (1-${MAX_SCRAPE_CHARS}, default ${DEFAULT_SCRAPE_CHARS}).`,
      },
    },
    required: ['url'],
  },
}

export async function executeJinaSearch(parameters: Record<string, unknown>): ToolResult {
  try {
    const query = asString(parameters.query)
    if (!query) return { success: false, error: 'query is required' }
    if (query.length > 500) return { success: false, error: 'query must be 500 characters or fewer' }

    const limit = clampInteger(parameters.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    const site = asString(parameters.site)
    const data = await jinaRequest<JinaSearchResult[]>(
      JINA_SEARCH_URL,
      { q: query, num: limit },
      {
        'X-Respond-With': 'no-content',
        ...(site ? { 'X-Site': site } : {}),
      }
    )

    const mapped = data.slice(0, limit).map((result) => ({
      title: result.title || result.url || 'Untitled result',
      url: result.url || '',
      description: result.description || result.content || '',
    }))

    let results = mapped
    try {
      results = await rerankResults(query, mapped)
    } catch (error) {
      // Search still succeeds if reranking is unavailable; keep original order.
      console.warn('Jina rerank skipped:', error)
    }

    return { success: true, data: { query, results: results.slice(0, limit) } }
  } catch (error) {
    console.error('Jina search error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Web search failed' }
  }
}

export async function executeJinaScrape(parameters: Record<string, unknown>): ToolResult {
  try {
    const url = validatePublicUrl(parameters.url)
    if (!url) return { success: false, error: 'A valid public HTTP or HTTPS URL is required' }

    const maxChars = clampInteger(parameters.maxChars, DEFAULT_SCRAPE_CHARS, MAX_SCRAPE_CHARS)
    const data = await jinaRequest<JinaReaderData>(
      JINA_READER_URL,
      { url },
      {
        'X-Return-Format': 'markdown',
        'X-Timeout': '30',
      }
    )
    const markdown = truncate(data.content || '', maxChars)

    return {
      success: true,
      data: {
        title: data.title || url,
        url: data.url || url,
        description: data.description || '',
        markdown: markdown.text,
        truncated: markdown.truncated,
      },
    }
  } catch (error) {
    console.error('Jina scrape error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Web page scrape failed' }
  }
}
