import type { ToolResult } from './contracts'

/**
 * Formats tool call result for display
 */
export function formatToolCallResult(result: ToolResult | undefined): string {
  if (!result) return 'No result'

  if (!result.success) return result.error || 'Unknown error'
  try {
    const data = result.data
    if (typeof data === 'string') {
      // Check if the data contains HTML markup
      if (data.includes('<pre><code>') && data.includes('</code></pre>')) {
        // Extract content from HTML markup
        const match = data.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)
        if (match) {
          return match[1]
        }
      }
      return data
    }
    return JSON.stringify(data, null, 2)
  } catch {
    return 'Invalid result data'
  }
}
