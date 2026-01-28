/**
 * Validation utility to verify section compilation logic matches expected behavior
 * This implements the section-to-API-field mapping rules
 */

interface ParsedSection {
  name: string
  content: string
  type: 'system' | 'user' | 'assistant' | 'context' | 'other'
}

interface CompiledPrompt {
  system?: string
  assistant?: string
  user: string
  metadata?: {
    originalSections: string[]
    userSectionSources: string[]
  }
}

/**
 * Parse markdown content into sections (same logic as VisualMarkdownRenderer)
 */
function parseMarkdownSections(content: string): { frontmatter: string; sections: ParsedSection[] } {
  const parts = content.split('---\n')
  const frontmatter = parts.length >= 3 ? parts[1] : ''
  const body = parts.length >= 3 ? parts.slice(2).join('---\n') : content
  
  const sections: ParsedSection[] = []
  const lines = body.split('\n')
  let currentSection: ParsedSection | null = null
  
  for (const line of lines) {
    const headerMatch = line.match(/^#\s+(.+)$/)
    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection)
      }
      
      // Start new section
      const name = headerMatch[1].trim()
      const type = getSectionType(name)
      currentSection = { name, content: '', type }
    } else if (currentSection) {
      // Add content to current section
      if (currentSection.content) {
        currentSection.content += '\n'
      }
      currentSection.content += line
    }
  }
  
  // Add final section
  if (currentSection) {
    sections.push(currentSection)
  }
  
  return { frontmatter, sections }
}

function getSectionType(name: string): ParsedSection['type'] {
  const lower = name.toLowerCase()
  if (lower.includes('system')) return 'system'
  if (lower.includes('user')) return 'user'
  if (lower.includes('assistant')) return 'assistant'
  if (lower.includes('context')) return 'context'
  return 'other'
}

/**
 * Compile sections according to the expected behavior:
 * - System section → system field
 * - Assistant section → assistant field  
 * - User section → part of user field
 * - All other sections → part of user field (in order)
 */
export function compilePrompt(content: string): CompiledPrompt {
  const { sections } = parseMarkdownSections(content)
  
  const compiled: CompiledPrompt = {
    user: '',
    metadata: {
      originalSections: sections.map(s => s.name),
      userSectionSources: []
    }
  }
  
  const userSectionParts: string[] = []
  
  for (const section of sections) {
    const trimmedContent = section.content.trim()
    if (!trimmedContent) continue
    
    switch (section.type) {
      case 'system':
        compiled.system = trimmedContent
        break
        
      case 'assistant':
        compiled.assistant = trimmedContent
        break
        
      case 'user':
        userSectionParts.push(trimmedContent)
        compiled.metadata!.userSectionSources.push(section.name)
        break
        
      default:
        // All other sections (context, other) go into user message
        userSectionParts.push(trimmedContent)
        compiled.metadata!.userSectionSources.push(section.name)
        break
    }
  }
  
  compiled.user = userSectionParts.join('\n\n')
  return compiled
}

/**
 * Validate that the compilation matches expected behavior
 */
export function validateCompilationBehavior(): { success: boolean; details: string[] } {
  const details: string[] = []
  
  // Test Case 1: Basic system/user mapping
  const test1 = `# System
You are a helpful AI assistant.

# User
Please help me with this question.`
  
  const result1 = compilePrompt(test1)
  if (result1.system === 'You are a helpful AI assistant.' && 
      result1.user === 'Please help me with this question.' &&
      !result1.assistant) {
    details.push('✅ Basic system/user mapping works correctly')
  } else {
    details.push('❌ Basic system/user mapping failed')
    details.push(`   Expected: system="You are a helpful AI assistant.", user="Please help me with this question."`)
    details.push(`   Got: system="${result1.system}", user="${result1.user}"`)
  }
  
  // Test Case 2: Custom sections compile to user field
  const test2 = `# System
You are helpful.

# Context
Here is background info.

# Instructions
Follow these rules.

# User
My question is here.

# Examples
Here are examples.`
  
  const result2 = compilePrompt(test2)
  const expectedUser2 = 'Here is background info.\n\nFollow these rules.\n\nMy question is here.\n\nHere are examples.'
  if (result2.system === 'You are helpful.' && 
      result2.user === expectedUser2 &&
      result2.metadata!.userSectionSources.length === 4) {
    details.push('✅ Custom sections compile to user field in correct order')
  } else {
    details.push('❌ Custom sections compilation failed')
    details.push(`   Expected user field: "${expectedUser2}"`)
    details.push(`   Got user field: "${result2.user}"`)
    details.push(`   User section sources: ${result2.metadata!.userSectionSources.join(', ')}`)
  }
  
  // Test Case 3: Assistant section mapping
  const test3 = `# System
You are helpful.

# Assistant
I understand. I'll help with that.

# User
Please answer this.`
  
  const result3 = compilePrompt(test3)
  if (result3.system === 'You are helpful.' &&
      result3.assistant === "I understand. I'll help with that." &&
      result3.user === 'Please answer this.') {
    details.push('✅ Assistant section maps to assistant field correctly')
  } else {
    details.push('❌ Assistant section mapping failed')
    details.push(`   Got: system="${result3.system}", assistant="${result3.assistant}", user="${result3.user}"`)
  }
  
  // Test Case 4: Section ordering in user field
  const test4 = `# System
Be helpful.

# Context
Background first.

# Instructions
Instructions second.

# User
Question third.

# Examples
Examples fourth.`
  
  const result4 = compilePrompt(test4)
  const expectedUser4 = 'Background first.\n\nInstructions second.\n\nQuestion third.\n\nExamples fourth.'
  if (result4.user === expectedUser4) {
    details.push('✅ Section ordering preserved in user field')
  } else {
    details.push('❌ Section ordering not preserved')
    details.push(`   Expected: "${expectedUser4}"`)
    details.push(`   Got: "${result4.user}"`)
  }
  
  const success = details.every(d => d.startsWith('✅'))
  return { success, details }
}

/**
 * Run validation and log results
 */
export function runCompilationValidation(): boolean {
  console.log('🔍 Validating section compilation logic...')
  const { success, details } = validateCompilationBehavior()
  
  details.forEach(detail => console.log(detail))
  
  if (success) {
    console.log('🎉 All compilation validation tests passed!')
  } else {
    console.log('⚠️  Some compilation validation tests failed!')
  }
  
  return success
}