import type { Anthropic } from '@anthropic-ai/sdk'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2'
const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 8
const DEFAULT_SCRAPE_CHARS = 12000
const MAX_SCRAPE_CHARS = 30000
const FIRECRAWL_TIMEOUT_MS = 60000

type ToolResult = Promise<{ success: boolean; data?: unknown; error?: string }>

type FirecrawlSearchResult = {
  title?: string
  description?: string
  url?: string
}

type FirecrawlResponse<T> = {
  success?: boolean
  data?: T
  warning?: string
  error?: string
  creditsUsed?: number
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10)
  return values.length > 0 ? values : undefined
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

async function firecrawlRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not configured')

  const response = await fetch(`${FIRECRAWL_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
  })

  const payload = (await response.json().catch(() => ({}))) as FirecrawlResponse<T>
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Firecrawl request failed with status ${response.status}`)
  }
  if (payload.data === undefined) throw new Error('Firecrawl returned no data')

  return payload.data
}

export const firecrawlSearchTool: Anthropic.Tool = {
  name: 'web_search',
  description:
    'Search the live web with Firecrawl. Use for current, time-sensitive, or externally verifiable information. Returns source titles, URLs, and descriptions; cite the returned URLs in the final response.',
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
      recency: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month', 'year'],
        description: 'Optional recency filter.',
      },
      includeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional hostnames to search, without protocol or paths.',
      },
      excludeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional hostnames to exclude. Do not combine with includeDomains.',
      },
    },
    required: ['query'],
  },
}

export const firecrawlScrapeTool: Anthropic.Tool = {
  name: 'web_scrape',
  description:
    'Read the main content of a public web page with Firecrawl and return clean Markdown. Use after web_search when result descriptions are insufficient. Cite the page URL in the final response.',
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

export async function executeFirecrawlSearch(parameters: Record<string, unknown>): ToolResult {
  try {
    const query = asString(parameters.query)
    if (!query) return { success: false, error: 'query is required' }
    if (query.length > 500) return { success: false, error: 'query must be 500 characters or fewer' }

    const includeDomains = asStringArray(parameters.includeDomains)
    const excludeDomains = asStringArray(parameters.excludeDomains)
    if (includeDomains && excludeDomains) {
      return { success: false, error: 'includeDomains and excludeDomains cannot be combined' }
    }

    const recencyMap: Record<string, string> = {
      hour: 'qdr:h',
      day: 'qdr:d',
      week: 'qdr:w',
      month: 'qdr:m',
      year: 'qdr:y',
    }
    const recency = asString(parameters.recency)
    const limit = clampInteger(parameters.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    const data = await firecrawlRequest<{ web?: FirecrawlSearchResult[] }>('/search', {
      query,
      limit,
      sources: ['web'],
      ...(recency && recencyMap[recency] ? { tbs: recencyMap[recency] } : {}),
      ...(includeDomains ? { includeDomains } : {}),
      ...(excludeDomains ? { excludeDomains } : {}),
    })

    const results = (data.web || []).slice(0, limit).map((result) => ({
      title: result.title || result.url || 'Untitled result',
      url: result.url || '',
      description: result.description || '',
    }))

    return { success: true, data: { query, results } }
  } catch (error) {
    console.error('Firecrawl search error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Web search failed' }
  }
}

export async function executeFirecrawlScrape(parameters: Record<string, unknown>): ToolResult {
  try {
    const url = validatePublicUrl(parameters.url)
    if (!url) return { success: false, error: 'A valid public HTTP or HTTPS URL is required' }

    const maxChars = clampInteger(parameters.maxChars, DEFAULT_SCRAPE_CHARS, MAX_SCRAPE_CHARS)
    const data = await firecrawlRequest<{
      markdown?: string
      metadata?: { title?: string; description?: string; sourceURL?: string; url?: string }
    }>('/scrape', {
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: FIRECRAWL_TIMEOUT_MS,
    })
    const markdown = truncate(data.markdown || '', maxChars)

    return {
      success: true,
      data: {
        title: data.metadata?.title || url,
        url: data.metadata?.sourceURL || data.metadata?.url || url,
        description: data.metadata?.description || '',
        markdown: markdown.text,
        truncated: markdown.truncated,
      },
    }
  } catch (error) {
    console.error('Firecrawl scrape error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Web page scrape failed' }
  }
}
