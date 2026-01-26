/**
 * Pattern-Based Suggestions for IntelliSense
 *
 * Analyzes prompt content to detect common patterns and suggests
 * relevant parameters, structure, and best practices.
 */

export interface PatternSuggestion {
  pattern: RegExp
  category: string
  suggestedParams: Array<{
    name: string
    type: string
    description: string
    required: boolean
    default?: string | number | boolean
  }>
  suggestedDescription?: string
  tags?: string[]
}

/**
 * Common prompt patterns with suggested parameters
 */
export const PROMPT_PATTERNS: PatternSuggestion[] = [
  // Code Review
  {
    pattern: /code\s+review|review\s+code|analyze\s+code/i,
    category: 'development',
    suggestedParams: [
      { name: 'language', type: 'string', description: 'Programming language (e.g., typescript, python)', required: true },
      { name: 'code', type: 'string', description: 'Code to review', required: true },
      { name: 'focus', type: 'string', description: 'Review focus (e.g., security, performance, style)', required: false },
      { name: 'severity', type: 'string', description: 'Minimum severity level to report', required: false, default: 'warning' }
    ],
    suggestedDescription: 'Reviews code for quality, security, and best practices',
    tags: ['development', 'code-quality', 'review']
  },

  // Translation
  {
    pattern: /translate|translation|locali[sz]ation/i,
    category: 'content',
    suggestedParams: [
      { name: 'text', type: 'string', description: 'Text to translate', required: true },
      { name: 'target_language', type: 'string', description: 'Target language code (e.g., es, fr, de)', required: true },
      { name: 'source_language', type: 'string', description: 'Source language code (auto-detected if omitted)', required: false },
      { name: 'formality', type: 'string', description: 'Formality level (formal, informal)', required: false, default: 'formal' }
    ],
    suggestedDescription: 'Translates text from one language to another',
    tags: ['translation', 'i18n', 'content']
  },

  // Summarization
  {
    pattern: /summari[sz]e|summary|tldr|condense/i,
    category: 'content',
    suggestedParams: [
      { name: 'text', type: 'string', description: 'Text to summarize', required: true },
      { name: 'max_length', type: 'number', description: 'Maximum summary length in words', required: false, default: 100 },
      { name: 'format', type: 'string', description: 'Output format (paragraph, bullets, key-points)', required: false, default: 'paragraph' },
      { name: 'focus', type: 'string', description: 'What to focus on in summary', required: false }
    ],
    suggestedDescription: 'Generates a concise summary of longer text',
    tags: ['content', 'summarization', 'analysis']
  },

  // Data Extraction
  {
    pattern: /extract\s+data|parse\s+text|information\s+extraction/i,
    category: 'data',
    suggestedParams: [
      { name: 'text', type: 'string', description: 'Text to extract data from', required: true },
      { name: 'fields', type: 'array', description: 'Fields to extract', required: true },
      { name: 'format', type: 'string', description: 'Output format (json, csv, yaml)', required: false, default: 'json' }
    ],
    suggestedDescription: 'Extracts structured data from unstructured text',
    tags: ['data', 'extraction', 'parsing']
  },

  // Question Answering
  {
    pattern: /answer\s+question|qa\s+system|question\s+answering/i,
    category: 'knowledge',
    suggestedParams: [
      { name: 'question', type: 'string', description: 'The question to answer', required: true },
      { name: 'context', type: 'string', description: 'Context/document to search for answer', required: true },
      { name: 'max_answer_length', type: 'number', description: 'Maximum answer length in words', required: false, default: 50 }
    ],
    suggestedDescription: 'Answers questions based on provided context',
    tags: ['qa', 'knowledge', 'search']
  },

  // Content Generation
  {
    pattern: /generate\s+content|create\s+content|write\s+blog|write\s+article/i,
    category: 'content',
    suggestedParams: [
      { name: 'topic', type: 'string', description: 'Topic or title for the content', required: true },
      { name: 'tone', type: 'string', description: 'Tone of voice (professional, casual, technical)', required: false, default: 'professional' },
      { name: 'target_audience', type: 'string', description: 'Target audience for the content', required: false },
      { name: 'word_count', type: 'number', description: 'Approximate word count', required: false, default: 500 }
    ],
    suggestedDescription: 'Generates content on a specified topic',
    tags: ['content', 'generation', 'writing']
  },

  // Sentiment Analysis
  {
    pattern: /sentiment\s+analysis|analyze\s+sentiment|emotion\s+detection/i,
    category: 'analysis',
    suggestedParams: [
      { name: 'text', type: 'string', description: 'Text to analyze', required: true },
      { name: 'granularity', type: 'string', description: 'Analysis granularity (document, sentence)', required: false, default: 'document' },
      { name: 'format', type: 'string', description: 'Output format (score, label, detailed)', required: false, default: 'label' }
    ],
    suggestedDescription: 'Analyzes sentiment and emotional tone of text',
    tags: ['analysis', 'sentiment', 'nlp']
  },

  // Classification
  {
    pattern: /classif(y|ication)|categori[sz]e|label\s+text/i,
    category: 'analysis',
    suggestedParams: [
      { name: 'text', type: 'string', description: 'Text to classify', required: true },
      { name: 'categories', type: 'array', description: 'Possible categories', required: true },
      { name: 'multi_label', type: 'boolean', description: 'Allow multiple categories', required: false, default: false },
      { name: 'confidence_threshold', type: 'number', description: 'Minimum confidence (0-1)', required: false, default: 0.5 }
    ],
    suggestedDescription: 'Classifies text into predefined categories',
    tags: ['classification', 'analysis', 'nlp']
  },

  // Email Drafting
  {
    pattern: /write\s+email|draft\s+email|compose\s+email/i,
    category: 'communication',
    suggestedParams: [
      { name: 'recipient', type: 'string', description: 'Email recipient name or role', required: true },
      { name: 'purpose', type: 'string', description: 'Purpose of the email', required: true },
      { name: 'tone', type: 'string', description: 'Tone (formal, friendly, apologetic)', required: false, default: 'professional' },
      { name: 'key_points', type: 'array', description: 'Key points to include', required: false }
    ],
    suggestedDescription: 'Drafts a professional email based on requirements',
    tags: ['email', 'communication', 'writing']
  },

  // Code Generation
  {
    pattern: /generate\s+code|write\s+code|create\s+function/i,
    category: 'development',
    suggestedParams: [
      { name: 'language', type: 'string', description: 'Programming language', required: true },
      { name: 'description', type: 'string', description: 'What the code should do', required: true },
      { name: 'input_output', type: 'string', description: 'Input/output specification', required: false },
      { name: 'style', type: 'string', description: 'Code style (functional, oop)', required: false }
    ],
    suggestedDescription: 'Generates code based on specifications',
    tags: ['development', 'code-generation']
  },

  // Documentation
  {
    pattern: /write\s+documentation|generate\s+docs|api\s+documentation/i,
    category: 'development',
    suggestedParams: [
      { name: 'code', type: 'string', description: 'Code to document', required: true },
      { name: 'format', type: 'string', description: 'Documentation format (jsdoc, markdown, sphinx)', required: false, default: 'markdown' },
      { name: 'detail_level', type: 'string', description: 'Detail level (brief, standard, comprehensive)', required: false, default: 'standard' }
    ],
    suggestedDescription: 'Generates documentation for code',
    tags: ['development', 'documentation']
  },

  // Test Generation
  {
    pattern: /generate\s+tests|write\s+tests|unit\s+test|test\s+cases/i,
    category: 'development',
    suggestedParams: [
      { name: 'code', type: 'string', description: 'Code to test', required: true },
      { name: 'framework', type: 'string', description: 'Testing framework (jest, pytest, junit)', required: true },
      { name: 'coverage', type: 'string', description: 'Coverage level (basic, comprehensive)', required: false, default: 'comprehensive' }
    ],
    suggestedDescription: 'Generates unit tests for code',
    tags: ['development', 'testing', 'quality']
  },

  // SQL Query Generation
  {
    pattern: /generate\s+sql|write\s+query|database\s+query/i,
    category: 'data',
    suggestedParams: [
      { name: 'description', type: 'string', description: 'What the query should do', required: true },
      { name: 'schema', type: 'string', description: 'Database schema information', required: false },
      { name: 'database', type: 'string', description: 'Database type (postgres, mysql, sqlite)', required: false, default: 'postgres' }
    ],
    suggestedDescription: 'Generates SQL queries based on requirements',
    tags: ['data', 'sql', 'database']
  },

  // Refactoring
  {
    pattern: /refactor\s+code|improve\s+code|optimize\s+code/i,
    category: 'development',
    suggestedParams: [
      { name: 'code', type: 'string', description: 'Code to refactor', required: true },
      { name: 'goal', type: 'string', description: 'Refactoring goal (readability, performance, maintainability)', required: true },
      { name: 'language', type: 'string', description: 'Programming language', required: true },
      { name: 'preserve_behavior', type: 'boolean', description: 'Preserve existing behavior', required: false, default: true }
    ],
    suggestedDescription: 'Refactors code for better quality',
    tags: ['development', 'refactoring', 'code-quality']
  },

  // Comparison
  {
    pattern: /compare|comparison|vs\.|versus|difference/i,
    category: 'analysis',
    suggestedParams: [
      { name: 'item_a', type: 'string', description: 'First item to compare', required: true },
      { name: 'item_b', type: 'string', description: 'Second item to compare', required: true },
      { name: 'criteria', type: 'array', description: 'Comparison criteria', required: false },
      { name: 'format', type: 'string', description: 'Output format (table, prose, pros-cons)', required: false, default: 'table' }
    ],
    suggestedDescription: 'Compares two items across multiple dimensions',
    tags: ['analysis', 'comparison']
  },

  // Bug Detection
  {
    pattern: /find\s+bugs|debug|bug\s+detection|code\s+issues/i,
    category: 'development',
    suggestedParams: [
      { name: 'code', type: 'string', description: 'Code to analyze for bugs', required: true },
      { name: 'language', type: 'string', description: 'Programming language', required: true },
      { name: 'focus', type: 'string', description: 'Focus area (logic, memory, concurrency)', required: false }
    ],
    suggestedDescription: 'Detects potential bugs and issues in code',
    tags: ['development', 'debugging', 'quality']
  }
]

/**
 * Detect patterns in prompt content and return matching suggestions
 */
export function detectPatterns(content: string): PatternSuggestion[] {
  const matches: PatternSuggestion[] = []

  for (const pattern of PROMPT_PATTERNS) {
    if (pattern.pattern.test(content)) {
      matches.push(pattern)
    }
  }

  return matches
}

/**
 * Get suggested parameters based on detected patterns
 */
export function getSuggestedParameters(content: string): Array<{
  name: string
  type: string
  description: string
  required: boolean
  default?: string | number | boolean
  source: string // Which pattern suggested this
}> {
  const patterns = detectPatterns(content)
  const suggestions: Array<{
    name: string
    type: string
    description: string
    required: boolean
    default?: string | number | boolean
    source: string
  }> = []

  // Deduplicate parameters by name
  const seen = new Set<string>()

  for (const pattern of patterns) {
    for (const param of pattern.suggestedParams) {
      if (!seen.has(param.name)) {
        seen.add(param.name)
        suggestions.push({
          ...param,
          source: pattern.category
        })
      }
    }
  }

  return suggestions
}

/**
 * Get category tags for detected patterns
 */
export function getDetectedCategories(content: string): string[] {
  const patterns = detectPatterns(content)
  const categories = new Set<string>()

  for (const pattern of patterns) {
    categories.add(pattern.category)
    if (pattern.tags) {
      pattern.tags.forEach(tag => categories.add(tag))
    }
  }

  return Array.from(categories)
}
