/**
 * Markdown transformation utilities for different output formats
 *
 * - markdown: Full formatted output (default)
 * - trimmed: Minimal but contextual - keeps code blocks, URLs, semantic structure
 * - plain: Pure text, everything stripped
 */

/**
 * Convert markdown to trimmed format
 * Preserves semantic content while removing decorative syntax
 * - Keeps code blocks (LLMs benefit from knowing it's code)
 * - Keeps URLs intact (they're content, not formatting)
 * - Strips headers, bold, italic, list markers
 * - Normalizes whitespace
 */
export function toTrimmed(markdown: string): string {
  let result = markdown

  // Preserve code blocks by replacing them with placeholders
  const codeBlocks: string[] = []
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length
    // Keep code blocks with language hint for LLM context
    codeBlocks.push(lang ? `[${lang}]\n${code.trim()}\n[/${lang}]` : `[code]\n${code.trim()}\n[/code]`)
    return `__CODE_BLOCK_${index}__`
  })

  // Preserve inline code
  const inlineCode: string[] = []
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    const index = inlineCode.length
    inlineCode.push(code)
    return `__INLINE_CODE_${index}__`
  })

  // Preserve URLs (both markdown links and raw URLs)
  const urls: string[] = []
  // Markdown links: [text](url) -> keep url
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const index = urls.length
    urls.push(`${text} (${url})`)
    return `__URL_${index}__`
  })
  // Raw URLs
  result = result.replace(/(https?:\/\/[^\s\)]+)/g, (url) => {
    const index = urls.length
    urls.push(url)
    return `__URL_${index}__`
  })

  // Strip headers (# ## ### etc)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1')

  // Strip bold and italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1') // bold italic
  result = result.replace(/\*\*(.+?)\*\*/g, '$1') // bold
  result = result.replace(/\*(.+?)\*/g, '$1') // italic
  result = result.replace(/___(.+?)___/g, '$1') // bold italic underscore
  result = result.replace(/__(.+?)__/g, '$1') // bold underscore
  result = result.replace(/_(.+?)_/g, '$1') // italic underscore

  // Strip strikethrough
  result = result.replace(/~~(.+?)~~/g, '$1')

  // Convert unordered list markers to simple bullets
  result = result.replace(/^[\s]*[-*+]\s+/gm, '- ')

  // Convert ordered list markers to simple numbers
  result = result.replace(/^[\s]*\d+\.\s+/gm, (match) => {
    const num = match.match(/\d+/)
    return `${num}. `
  })

  // Strip blockquote markers
  result = result.replace(/^>\s*/gm, '')

  // Strip horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, '')

  // Strip image syntax, keep alt text
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')

  // Restore code blocks
  codeBlocks.forEach((code, index) => {
    result = result.replace(`__CODE_BLOCK_${index}__`, code)
  })

  // Restore inline code (without backticks, just the content)
  inlineCode.forEach((code, index) => {
    result = result.replace(`__INLINE_CODE_${index}__`, code)
  })

  // Restore URLs
  urls.forEach((url, index) => {
    result = result.replace(`__URL_${index}__`, url)
  })

  // Normalize whitespace: collapse multiple blank lines to single
  result = result.replace(/\n{3,}/g, '\n\n')

  // Trim leading/trailing whitespace from each line
  result = result.split('\n').map(line => line.trim()).join('\n')

  // Trim overall
  result = result.trim()

  return result
}

/**
 * Convert markdown to plain text
 * Strips all formatting, returns pure text content
 */
export function toPlainText(markdown: string): string {
  let result = markdown

  // Remove code blocks entirely (just keep the code content)
  result = result.replace(/```\w*\n([\s\S]*?)```/g, '$1')

  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, '$1')

  // Convert markdown links to just the text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Strip headers
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1')

  // Strip bold and italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1')
  result = result.replace(/\*\*(.+?)\*\*/g, '$1')
  result = result.replace(/\*(.+?)\*/g, '$1')
  result = result.replace(/___(.+?)___/g, '$1')
  result = result.replace(/__(.+?)__/g, '$1')
  result = result.replace(/_(.+?)_/g, '$1')

  // Strip strikethrough
  result = result.replace(/~~(.+?)~~/g, '$1')

  // Strip list markers
  result = result.replace(/^[\s]*[-*+]\s+/gm, '')
  result = result.replace(/^[\s]*\d+\.\s+/gm, '')

  // Strip blockquote markers
  result = result.replace(/^>\s*/gm, '')

  // Strip horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, '')

  // Strip images entirely
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')

  // Normalize whitespace
  result = result.replace(/\n{3,}/g, '\n\n')
  result = result.split('\n').map(line => line.trim()).join('\n')
  result = result.trim()

  return result
}

/**
 * Estimate token count for a string
 * Uses ~4 characters per token approximation
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Get all format variants with token counts
 */
export function getFormatVariants(markdown: string): {
  markdown: { content: string; tokens: number }
  trimmed: { content: string; tokens: number }
  plain: { content: string; tokens: number }
} {
  const trimmed = toTrimmed(markdown)
  const plain = toPlainText(markdown)

  return {
    markdown: {
      content: markdown,
      tokens: estimateTokens(markdown)
    },
    trimmed: {
      content: trimmed,
      tokens: estimateTokens(trimmed)
    },
    plain: {
      content: plain,
      tokens: estimateTokens(plain)
    }
  }
}
