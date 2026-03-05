/**
 * Utility functions for IntelliSense
 */
import type { ExtractedParameters, ParameterMetadata } from './types'

/**
 * Extract parameters from document content
 */
export function extractParametersFromDoc(content: string): string[] {
  return extractParametersWithMetadata(content).parameters
}

/**
 * Extract parameters with metadata about whether they're loop variables
 */
export function extractParametersWithMetadata(content: string): ExtractedParameters {
  const parameters: string[] = []
  const loopVariables = new Set<string>()

  // Extract from YAML frontmatter parameters section (handle CRLF)
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1]
    const lines = yamlContent.split(/\r?\n/)
    let inParametersSection = false

    for (const line of lines) {
      // Check if we're entering parameters section
      if (line.match(/^\s*parameters:\s*$/)) {
        inParametersSection = true
        continue
      }

      // Check if we've left parameters section (new key at root level)
      if (inParametersSection && line.match(/^\w+:/)) {
        inParametersSection = false
        continue
      }

      if (inParametersSection) {
        // Array format: "  - name: paramName"
        const arrayMatch = line.match(/^\s*-\s*name:\s*["']?(\w+)["']?/)
        if (arrayMatch) {
          if (!parameters.includes(arrayMatch[1])) {
            parameters.push(arrayMatch[1])
          }
          continue
        }

        // Object format: "  paramName:" or "  paramName: { ... }"
        const objectMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(?:\{|$)/)
        if (objectMatch) {
          if (!parameters.includes(objectMatch[1])) {
            parameters.push(objectMatch[1])
          }
          continue
        }
      }
    }
  }

  // Extract loop variables from {% for VAR in COLLECTION %} or {%- for VAR in COLLECTION %} blocks (Nunjucks/Jinja2 syntax)
  // Also handles tuple unpacking: {% for key, value in dict %} -> both key and value are valid variables
  // The hyphen is for whitespace trimming
  const forLoopMatches = Array.from(content.matchAll(/\{%-?\s*for\s+([\w,\s]+?)\s+in\s+(\w+)/g))
  for (const match of forLoopMatches) {
    // Split on comma to handle tuple unpacking (e.g., "service, owner")
    const vars = match[1].split(',').map(v => v.trim()).filter(Boolean)
    for (const loopVar of vars) {
      loopVariables.add(loopVar)
      if (!parameters.includes(loopVar)) {
        parameters.push(loopVar)
      }
    }
  }

  // Also extract loop helper variables (loop.index, loop.first, etc.) when inside a for block
  // The 'loop' variable is automatically available inside {% for %} blocks
  if (content.includes('{%') && content.includes('for ')) {
    loopVariables.add('loop')
    if (!parameters.includes('loop')) {
      parameters.push('loop')
    }
  }

  // Extract set variables from {% set VAR = VALUE %} or {%- set VAR = VALUE %} blocks
  const setVarMatches = Array.from(content.matchAll(/\{%-?\s*set\s+(\w+)\s*=/g))
  for (const match of setVarMatches) {
    const setVar = match[1]
    // Track set variables as loop variables so they get special treatment in hover
    loopVariables.add(setVar)
    if (!parameters.includes(setVar)) {
      parameters.push(setVar)
    }
  }

  // Extract parameter references from content body
  const paramRefs = content.match(/\{(\w+)\}/g)
  if (paramRefs) {
    paramRefs.forEach(ref => {
      const param = ref.slice(1, -1) // Remove { }
      if (!parameters.includes(param)) {
        parameters.push(param)
      }
    })
  }

  return { parameters, loopVariables }
}

/**
 * Extract parameter metadata from frontmatter
 */
export function extractParameterMetadata(content: string): Map<string, ParameterMetadata> {
  const metadata = new Map<string, ParameterMetadata>()

  // Extract from YAML frontmatter (handle CRLF)
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) return metadata

  const yamlContent = frontmatterMatch[1]
  const paramMatch = yamlContent.match(/parameters:\s*\r?\n((?:\s+\w+:.*(?:\r?\n\s+\s+.*)*\r?\n?)+)/)
  if (!paramMatch) return metadata

  const paramSection = paramMatch[1]
  const lines = paramSection.split(/\r?\n/)

  let currentParam: string | null = null
  let currentMeta: ParameterMetadata = {}

  lines.forEach(line => {
    // Match parameter name: { ... } or multiline definition
    const paramNameMatch = line.match(/^\s+(\w+):\s*\{([^}]*)\}/)
    if (paramNameMatch) {
      // Save previous parameter
      if (currentParam) metadata.set(currentParam, currentMeta)

      currentParam = paramNameMatch[1]
      currentMeta = {}

      // Parse inline object
      const objContent = paramNameMatch[2]
      const typeMatch = objContent.match(/type:\s*(\w+)/)
      if (typeMatch) currentMeta.type = typeMatch[1]

      const descMatch = objContent.match(/description:\s*"([^"]*)"/)
      if (descMatch) currentMeta.description = descMatch[1]

      const defaultMatch = objContent.match(/default:\s*("([^"]*)"|(\w+))/)
      if (defaultMatch) currentMeta.default = defaultMatch[2] || defaultMatch[3]

      const requiredMatch = objContent.match(/required:\s*(true|false)/)
      if (requiredMatch) currentMeta.required = requiredMatch[1] === 'true'
    } else {
      // Check for new parameter (multiline)
      const newParamMatch = line.match(/^\s+(\w+):\s*$/)
      if (newParamMatch) {
        if (currentParam) metadata.set(currentParam, currentMeta)
        currentParam = newParamMatch[1]
        currentMeta = {}
      } else if (currentParam) {
        // Parse nested properties
        const typeMatch = line.match(/^\s+type:\s*(\w+)/)
        if (typeMatch) currentMeta.type = typeMatch[1]

        const descMatch = line.match(/^\s+description:\s*"([^"]*)"/)
        if (descMatch) currentMeta.description = descMatch[1]

        const defaultMatch = line.match(/^\s+default:\s*("([^"]*)"|(\w+))/)
        if (defaultMatch) currentMeta.default = defaultMatch[2] || defaultMatch[3]

        const requiredMatch = line.match(/^\s+required:\s*(true|false)/)
        if (requiredMatch) currentMeta.required = requiredMatch[1] === 'true'
      }
    }
  })

  // Save last parameter
  if (currentParam) metadata.set(currentParam, currentMeta)

  return metadata
}

/**
 * Convert object-format parameters to array format
 * Handles both pure object format AND mixed format (first param object, rest array)
 */
export function fixObjectParamsToArray(content: string): string {
  const lines = content.split('\n')
  const paramsLineIdx = lines.findIndex(l => l.match(/^\s*parameters:\s*$/))

  if (paramsLineIdx < 0) return content

  // Find the end of the parameters section (next non-indented line or ---)
  let paramsEndIdx = lines.length
  for (let i = paramsLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    // End at closing --- or any line that's not indented (and not empty)
    if (line.trim() === '---' || (line.trim() !== '' && !line.match(/^[ \t]/))) {
      paramsEndIdx = i
      break
    }
  }

  // Extract and fix the parameters section
  const beforeParams = lines.slice(0, paramsLineIdx + 1)
  const paramLines = lines.slice(paramsLineIdx + 1, paramsEndIdx)
  const afterParams = lines.slice(paramsEndIdx)

  const newParamLines: string[] = []
  let currentParam: { name: string; props: string[] } | null = null
  let inObjectParam = false

  for (const line of paramLines) {
    // Check for object-format param: "  param_name:" (indented identifier + colon, alone on line)
    const objectParamMatch = line.match(/^([ \t]+)([a-zA-Z_][a-zA-Z0-9_]*):\s*$/)
    // Check for array-format param: "  - name: param_name"
    const arrayParamMatch = line.match(/^([ \t]+)-\s*name:\s*(\S+)/)

    if (objectParamMatch && !line.includes('- name:')) {
      // Found object-format param, convert it
      if (currentParam) {
        newParamLines.push(`  - name: ${currentParam.name}`)
        newParamLines.push(...currentParam.props)
      }
      currentParam = { name: objectParamMatch[2], props: [] }
      inObjectParam = true
    } else if (arrayParamMatch) {
      // Found array-format param, keep as-is
      if (currentParam) {
        newParamLines.push(`  - name: ${currentParam.name}`)
        newParamLines.push(...currentParam.props)
        currentParam = null
      }
      inObjectParam = false
      newParamLines.push(line)
    } else if (inObjectParam && currentParam && line.match(/^[ \t]+\S/)) {
      // Property line for current object-format param
      currentParam.props.push(line)
    } else if (!inObjectParam) {
      // Keep other lines (properties of array-format params, empty lines)
      newParamLines.push(line)
    }
  }

  // Don't forget the last param if it was object format
  if (currentParam) {
    newParamLines.push(`  - name: ${currentParam.name}`)
    newParamLines.push(...currentParam.props)
  }

  return [...beforeParams, ...newParamLines, ...afterParams].join('\n')
}
