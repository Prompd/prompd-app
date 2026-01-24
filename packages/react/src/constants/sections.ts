/**
 * Standard Prompd section definitions
 * Based on the Prompd Format Specification
 */

export interface SectionDefinition {
  name: string
  label: string
  description: string
  allowMultiple: boolean
  accept?: string
  color: 'system' | 'context' | 'user' | 'assistant' | 'task' | 'output'
}

/**
 * Standard sections available in Prompd format
 */
export const STANDARD_SECTIONS: Record<string, SectionDefinition> = {
  system: {
    name: 'system',
    label: 'System',
    description: 'System message or persona definition',
    allowMultiple: false,
    accept: '.prmd,.txt,.md',
    color: 'system'
  },
  user: {
    name: 'user',
    label: 'User',
    description: 'User input or instructions',
    allowMultiple: false,
    accept: '.prmd,.txt,.md',
    color: 'user'
  },
  context: {
    name: 'context',
    label: 'Context',
    description: 'External files and data sources',
    allowMultiple: true,  // Context allows multiple files
    accept: '*/*',
    color: 'context'
  },
  assistant: {
    name: 'assistant',
    label: 'Assistant',
    description: 'Assistant personality or role definition',
    allowMultiple: false,
    accept: '.prmd,.txt,.md',
    color: 'assistant'
  },
  task: {
    name: 'task',
    label: 'Task',
    description: 'Task definition and requirements',
    allowMultiple: false,
    accept: '.prmd,.txt,.md',
    color: 'task'
  },
  output: {
    name: 'output',
    label: 'Output',
    description: 'Expected output format and structure',
    allowMultiple: false,
    accept: '.prmd,.txt,.md,.json,.yaml',
    color: 'output'
  },
  response: {
    name: 'response',
    label: 'Response',
    description: 'Response format and guidelines',
    allowMultiple: false,
    accept: '.prmd,.txt,.md,.json,.yaml',
    color: 'output'
  }
}

/**
 * Get section definition by name
 */
export function getSectionDefinition(name: string): SectionDefinition | undefined {
  return STANDARD_SECTIONS[name.toLowerCase()]
}

/**
 * Get all available section names
 */
export function getAvailableSections(): string[] {
  return Object.keys(STANDARD_SECTIONS)
}

/**
 * Check if a section allows multiple files
 */
export function allowsMultipleFiles(sectionName: string): boolean {
  const section = getSectionDefinition(sectionName)
  return section?.allowMultiple ?? false
}
