/**
 * XML Parser for Agent Tool Calls
 *
 * Provides robust XML serialization and deserialization for agent responses.
 * Uses DOMParser for reliable parsing instead of regex.
 *
 * Format:
 * <response>
 *   <message>Human-readable explanation</message>
 *   <tool_calls>
 *     <tool_call>
 *       <tool>tool_name</tool>
 *       <params>
 *         <param_name>value</param_name>
 *       </params>
 *     </tool_call>
 *   </tool_calls>
 *   <done>true|false</done>
 * </response>
 */

// ============================================================================
// Types
// ============================================================================

export interface ParsedToolCall {
  tool: string
  params: Record<string, unknown>
}

export interface ParsedAgentResponse {
  message: string
  toolCalls: ParsedToolCall[]
  done: boolean
  suggestion?: {
    type: 'edit' | 'new-file'
    content: string
    filename?: string
  }
}

export interface XmlParseResult {
  success: boolean
  data?: ParsedAgentResponse
  error?: string
  isPlainText?: boolean
  rawContent?: string
  /** Fallback message extracted via regex when XML parsing fails */
  fallbackMessage?: string
}

// ============================================================================
// Fallback Message Extraction
// ============================================================================

/**
 * Extract message from XML-like content using regex when DOM parsing fails.
 * This handles cases where the XML is malformed but still has a recognizable message tag.
 * Only extracts the FIRST message tag to avoid concatenating messages from previous responses.
 */
function extractMessageFallback(content: string): string | undefined {
  // Extract content from ALL <message>...</message> tags and concatenate
  const messageRegex = /<message>([\s\S]*?)<\/message>/gi
  const parts: string[] = []
  let match: RegExpExecArray | null

  while ((match = messageRegex.exec(content)) !== null) {
    if (match[1]) {
      let text = match[1].trim()
      // Unescape common escape sequences
      text = text
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
      if (text) parts.push(text)
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined
}

/**
 * Try to parse the response using a more lenient approach.
 * This handles cases where the LLM output is valid XML but has quirks
 * that the strict DOMParser doesn't like.
 */
function tryLenientParse(content: string): ParsedAgentResponse | undefined {
  try {
    // Extract message
    let message = extractMessageFallback(content) || ''

    // Extract content block if present (LLMs sometimes put longer content in a separate <content> tag)
    // Match <content>...</content> or <content><![CDATA[...]]></content> at response level
    const contentCdataMatch = content.match(/<content><!\[CDATA\[([\s\S]*?)\]\]><\/content>/i)
    const contentPlainMatch = content.match(/<response>[\s\S]*?<content>([\s\S]*?)<\/content>[\s\S]*?<\/response>/i)
    let extraContent = ''
    if (contentCdataMatch) {
      extraContent = contentCdataMatch[1]
    } else if (contentPlainMatch && !contentPlainMatch[1].includes('<![CDATA[')) {
      extraContent = contentPlainMatch[1]
    }
    if (extraContent) {
      extraContent = extraContent
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
      message = message ? `${message}\n\n${extraContent}` : extraContent
    }

    // Check for done flag
    const doneMatch = content.match(/<done>\s*(true|false)\s*<\/done>/i)
    const done = doneMatch?.[1]?.toLowerCase() === 'true'

    // Extract tool calls using regex
    const toolCalls: ParsedToolCall[] = []
    const toolCallsMatch = content.match(/<tool_calls>([\s\S]*?)<\/tool_calls>/i)

    if (toolCallsMatch && toolCallsMatch[1]) {
      // Find each tool_call block
      const toolCallBlocks = toolCallsMatch[1].match(/<tool_call>([\s\S]*?)<\/tool_call>/gi)

      if (toolCallBlocks) {
        for (const block of toolCallBlocks) {
          // Extract tool name
          const toolMatch = block.match(/<tool>\s*([\w_]+)\s*<\/tool>/i)
          if (toolMatch && toolMatch[1]) {
            const tool = toolMatch[1].trim()

            // Extract params using regex for common patterns
            const params: Record<string, unknown> = {}
            const paramsMatch = block.match(/<params>([\s\S]*?)<\/params>/i)

            if (paramsMatch && paramsMatch[1]) {
              // Extract path
              const pathMatch = paramsMatch[1].match(/<path>([\s\S]*?)<\/path>/i)
              if (pathMatch) params.path = pathMatch[1].trim()

              // Extract content (with CDATA support)
              const contentCdataMatch = paramsMatch[1].match(/<content><!\[CDATA\[([\s\S]*?)\]\]><\/content>/i)
              const contentPlainMatch = paramsMatch[1].match(/<content>([\s\S]*?)<\/content>/i)
              if (contentCdataMatch) {
                params.content = contentCdataMatch[1]
              } else if (contentPlainMatch) {
                params.content = contentPlainMatch[1]
              }

              // Extract edits array for edit_file
              if (tool === 'edit_file') {
                const edits: Array<{ search: string; replace: string }> = []

                // First try to find <edits>...</edits> wrapper, then look for items inside
                const editsWrapperMatch = paramsMatch[1].match(/<edits>([\s\S]*?)<\/edits>/i)
                const editsContent = editsWrapperMatch ? editsWrapperMatch[1] : paramsMatch[1]

                const editItems = editsContent.match(/<item>([\s\S]*?)<\/item>/gi)

                if (editItems) {
                  for (const editBlock of editItems) {
                    // Support both search/replace (correct) and old_text/new_text (legacy)
                    const searchMatch = editBlock.match(/<search><!\[CDATA\[([\s\S]*?)\]\]><\/search>/i)
                      || editBlock.match(/<search>([\s\S]*?)<\/search>/i)
                      || editBlock.match(/<old_text><!\[CDATA\[([\s\S]*?)\]\]><\/old_text>/i)
                      || editBlock.match(/<old_text>([\s\S]*?)<\/old_text>/i)
                    const replaceMatch = editBlock.match(/<replace><!\[CDATA\[([\s\S]*?)\]\]><\/replace>/i)
                      || editBlock.match(/<replace>([\s\S]*?)<\/replace>/i)
                      || editBlock.match(/<new_text><!\[CDATA\[([\s\S]*?)\]\]><\/new_text>/i)
                      || editBlock.match(/<new_text>([\s\S]*?)<\/new_text>/i)

                    if (searchMatch && replaceMatch) {
                      edits.push({
                        search: searchMatch[1],
                        replace: replaceMatch[1]
                      })
                    }
                  }
                  if (edits.length > 0) {
                    params.edits = edits
                  }
                }
              }
            }

            toolCalls.push({ tool, params })
          }
        }
      }
    }

    // Only return if we got something useful
    if (message || toolCalls.length > 0 || done) {
      console.log('[XML Parser] Lenient parse succeeded:', {
        messageLength: message.length,
        toolCalls: toolCalls.length,
        toolCallDetails: toolCalls.map(tc => ({
          tool: tc.tool,
          hasPath: 'path' in tc.params,
          hasEdits: 'edits' in tc.params,
          editsCount: Array.isArray(tc.params.edits) ? tc.params.edits.length : 0,
          hasContent: 'content' in tc.params,
          paramKeys: Object.keys(tc.params)
        })),
        done
      })
      return { message, toolCalls, done }
    }

    return undefined
  } catch (error) {
    console.error('[XML Parser] Lenient parse failed:', error)
    return undefined
  }
}

// ============================================================================
// XML Repair (fix common LLM mistakes)
// ============================================================================

/**
 * Repair common XML mistakes that LLMs make
 */
function repairXml(xml: string): string {
  let repaired = xml

  // Fix: </tool_call> </tool_call> <tool>  ->  </tool_call> <tool_call> <tool>
  // LLM sometimes outputs double closing tag without opening tag for second tool_call
  repaired = repaired.replace(/<\/tool_call>\s*<\/tool_call>\s*<tool>/g, '</tool_call>\n<tool_call>\n<tool>')

  // Fix: </tool_call> <tool> (missing <tool_call> opening)
  repaired = repaired.replace(/<\/tool_call>\s*<tool>(?!_)/g, '</tool_call>\n<tool_call>\n<tool>')

  // Fix: </params> </tool_call> <tool> (missing <tool_call> opening)
  repaired = repaired.replace(/<\/params>\s*<\/tool_call>\s*<tool>(?!_)/g, '</params>\n</tool_call>\n<tool_call>\n<tool>')

  // Fix: unmatched </tool_call> at the end (extra closing tag)
  const openCount = (repaired.match(/<tool_call>/g) || []).length
  const closeCount = (repaired.match(/<\/tool_call>/g) || []).length
  if (closeCount > openCount) {
    // Remove extra closing tags from the end
    for (let i = 0; i < closeCount - openCount; i++) {
      repaired = repaired.replace(/<\/tool_call>\s*(<\/tool_calls>)/, '$1')
    }
  }

  if (repaired !== xml) {
    console.log('[XML Parser] Repaired malformed XML')
  }

  return repaired
}

// ============================================================================
// XML Parser
// ============================================================================

/**
 * Parse an agent response that may be XML or plain text
 */
export function parseAgentResponse(content: string): XmlParseResult {
  const trimmed = content.trim()

  // Check if content contains XML response tags (may have text before/after)
  if (!trimmed.includes('<response>') && !trimmed.includes('<message>')) {
    // No XML tags at all - return as plain text for conversational responses
    return {
      success: false,
      isPlainText: true,
      rawContent: content,
      error: 'Response is not XML format'
    }
  }

  try {
    // Try to extract just the <response>...</response> block if there's text before it
    let xmlContent = trimmed
    const responseStartIndex = trimmed.indexOf('<response>')
    const responseEndIndex = trimmed.lastIndexOf('</response>')

    if (responseStartIndex !== -1 && responseEndIndex !== -1) {
      // Extract just the XML block
      xmlContent = trimmed.substring(responseStartIndex, responseEndIndex + '</response>'.length)

      if (responseStartIndex > 0) {
        console.log('[XML Parser] Extracted <response> block from position', responseStartIndex)
      }
    } else if (!trimmed.startsWith('<response>')) {
      // Has <message> but not full <response> - wrap it
      xmlContent = `<response>${trimmed}</response>`
    }

    // Repair common XML mistakes from LLMs
    xmlContent = repairXml(xmlContent)

    // Parse using DOMParser
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, 'text/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.log('[XML Parser] DOM parse error, trying lenient parser')
      // Try lenient regex-based parsing as fallback
      const lenientResult = tryLenientParse(content)
      if (lenientResult) {
        return {
          success: true,
          data: lenientResult
        }
      }

      // Lenient parse failed too - extract message as last resort
      const fallbackMessage = extractMessageFallback(content)
      console.log('[XML Parser] Lenient parse failed, fallback message:', fallbackMessage?.slice(0, 50))
      return {
        success: false,
        error: `XML parse error: ${parseError.textContent}`,
        rawContent: content,
        fallbackMessage
      }
    }

    const response = doc.querySelector('response')
    if (!response) {
      // Try to extract message via regex as fallback
      const fallbackMessage = extractMessageFallback(content)
      return {
        success: false,
        error: 'No <response> element found',
        rawContent: content,
        fallbackMessage
      }
    }

    // Extract all direct <message> children and concatenate them
    // LLMs sometimes split a single response across multiple <message> tags
    const messageEls = response.querySelectorAll(':scope > message')
    let message = ''
    if (messageEls.length > 0) {
      const parts: string[] = []
      messageEls.forEach(el => {
        let text = el.textContent?.trim() || ''
        // Unescape common escape sequences that LLMs often produce in messages
        text = text
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
        if (text) parts.push(text)
      })
      message = parts.join('\n')
    }

    // Extract content block if present (LLMs sometimes put longer content in a separate <content> tag)
    const contentEl = response.querySelector(':scope > content')
    if (contentEl?.textContent) {
      let content = contentEl.textContent
      // Unescape common escape sequences
      content = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
      // Append content to message with a blank line separator
      if (message) {
        message = `${message}\n\n${content}`
      } else {
        message = content
      }
    }

    // Extract done flag
    const doneEl = response.querySelector('done')
    const done = doneEl?.textContent?.trim().toLowerCase() === 'true'

    // Extract tool calls
    const toolCalls: ParsedToolCall[] = []
    const toolCallEls = response.querySelectorAll('tool_calls > tool_call')

    toolCallEls.forEach(tcEl => {
      const toolEl = tcEl.querySelector('tool')
      const paramsEl = tcEl.querySelector('params')

      if (toolEl?.textContent) {
        const tool = toolEl.textContent.trim()
        const params: Record<string, unknown> = {}

        if (paramsEl) {
          // Extract all child elements as parameters
          Array.from(paramsEl.children).forEach(paramEl => {
            const paramName = paramEl.tagName
            const paramValue = parseParamValue(paramEl)
            params[paramName] = paramValue
          })
        }

        toolCalls.push({ tool, params })

        // Log edit_file params for debugging
        if (tool === 'edit_file') {
          console.log('[XML Parser] DOM parsed edit_file:', {
            hasPath: 'path' in params,
            hasEdits: 'edits' in params,
            editsCount: Array.isArray(params.edits) ? params.edits.length : 0,
            paramKeys: Object.keys(params),
            firstEdit: Array.isArray(params.edits) && params.edits.length > 0 ? params.edits[0] : null
          })
        }
      }
    })

    // Extract suggestion if present
    let suggestion: ParsedAgentResponse['suggestion'] | undefined
    const suggestionEl = response.querySelector('suggestion')
    if (suggestionEl) {
      const typeEl = suggestionEl.querySelector('type')
      const contentEl = suggestionEl.querySelector('content')
      const filenameEl = suggestionEl.querySelector('filename')

      if (typeEl?.textContent && contentEl?.textContent) {
        suggestion = {
          type: typeEl.textContent.trim() as 'edit' | 'new-file',
          content: contentEl.textContent,
          filename: filenameEl?.textContent?.trim()
        }
      }
    }

    return {
      success: true,
      data: {
        message,
        toolCalls,
        done,
        suggestion
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown XML parse error',
      rawContent: content
    }
  }
}

/**
 * Parse a parameter value, handling nested structures and arrays
 */
function parseParamValue(element: Element): unknown {
  // Check if it's an array (has multiple child elements with same tag or <item> elements)
  const items = element.querySelectorAll(':scope > item')
  if (items.length > 0) {
    return Array.from(items).map(item => {
      // Check if item has child elements (object) or just text
      if (item.children.length > 0) {
        const obj: Record<string, unknown> = {}
        Array.from(item.children).forEach(child => {
          obj[child.tagName] = parseParamValue(child)
        })
        return obj
      }
      return item.textContent?.trim() || ''
    })
  }

  // Check if it has child elements (nested object)
  if (element.children.length > 0) {
    const obj: Record<string, unknown> = {}
    Array.from(element.children).forEach(child => {
      obj[child.tagName] = parseParamValue(child)
    })
    return obj
  }

  // Simple text value - try to parse as number/boolean
  let text = element.textContent || ''

  // Check for boolean (before unescaping)
  const trimmed = text.trim()
  if (trimmed.toLowerCase() === 'true') return true
  if (trimmed.toLowerCase() === 'false') return false

  // Check for number (before unescaping)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed)
  }

  // Unescape common escape sequences that LLMs often produce
  // This handles cases where LLM outputs literal \n instead of actual newlines
  text = text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')

  return text
}

// ============================================================================
// XML Serializer (for tool results sent back to LLM)
// ============================================================================

export interface ToolResultForXml {
  tool: string
  success: boolean
  output?: unknown
  error?: string
}

/**
 * Serialize tool results as XML for sending back to the LLM
 */
export function serializeToolResults(results: ToolResultForXml[]): string {
  const resultXmls = results.map(result => {
    const outputContent = result.success
      ? serializeValue(result.output)
      : `<error>${escapeXml(result.error || 'Unknown error')}</error>`

    return `<tool_result>
<tool>${escapeXml(result.tool)}</tool>
<success>${result.success}</success>
${outputContent}
</tool_result>`
  })

  return `<tool_results>
${resultXmls.join('\n')}
</tool_results>`
}

/**
 * Serialize a value to XML
 */
function serializeValue(value: unknown, tagName: string = 'output'): string {
  if (value === null || value === undefined) {
    return `<${tagName}/>`
  }

  if (typeof value === 'string') {
    // For large string outputs, use CDATA to preserve formatting
    if (value.length > 100 || value.includes('<') || value.includes('&') || value.includes('\n')) {
      return `<${tagName}><![CDATA[${value}]]></${tagName}>`
    }
    return `<${tagName}>${escapeXml(value)}</${tagName}>`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `<${tagName}>${value}</${tagName}>`
  }

  if (Array.isArray(value)) {
    const items = value.map(item => serializeValue(item, 'item')).join('\n')
    return `<${tagName}>\n${items}\n</${tagName}>`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => serializeValue(val, key))
      .join('\n')
    return `<${tagName}>\n${entries}\n</${tagName}>`
  }

  return `<${tagName}>${escapeXml(String(value))}</${tagName}>`
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================================================
// Format Reminder (for retry prompts)
// ============================================================================

export const XML_FORMAT_REMINDER = `**CRITICAL: You MUST respond with XML format.**

Your response MUST start with <response> and be valid XML:

<response>
<message>What you are doing</message>
<tool_calls>
<tool_call>
<tool>write_file</tool>
<params>
<path>file.prmd</path>
<content><![CDATA[file content here]]></content>
</params>
</tool_call>
</tool_calls>
</response>

Or if done:
<response>
<message>Summary of what was done</message>
<done>true</done>
</response>

RULES:
- Start with <response> (no text before it)
- No markdown code blocks
- No plain text explanations
- Use write_file to make changes NOW (don't just describe them)
- Don't repeat previous tool calls - proceed to the NEXT step`
