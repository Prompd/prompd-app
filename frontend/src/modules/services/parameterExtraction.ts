/**
 * Parameter Extraction Service
 * NOTE: Currently returns empty - parameters filled manually by user
 */

export interface ParameterDefinition {
  name: string
  type: string
  description?: string
  required?: boolean
  default?: unknown
}

export interface ExtractedParameters {
  values: Record<string, unknown>
  confidence: number
  missingRequired: string[]
}

export async function extractParametersFromConversation(
  conversationHistory: Array<{ role: string; content: string }>,
  parameterDefinitions: ParameterDefinition[]
): Promise<ExtractedParameters> {
  const missingRequired = parameterDefinitions
    .filter(p => p.required)
    .map(p => p.name)

  return {
    values: {},
    confidence: 0,
    missingRequired
  }
}
