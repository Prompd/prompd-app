import { IPrompdEditor } from '@prompd/react'

/**
 * Editor integration for editor.prompdhub.ai
 * Implements the IPrompdEditor interface to enable PrompdChat
 * to interact with the Monaco editor for live .prmd file editing
 */
export class PrompdEditorIntegration implements IPrompdEditor {
  private getText: () => string
  private setText: (text: string) => void
  private getActiveTabName: () => string | null
  private showNotification: (message: string, type?: 'info' | 'warning' | 'error') => void

  constructor(
    getText: () => string,
    setText: (text: string) => void,
    getActiveTabName: () => string | null,
    showNotification: (message: string, type?: 'info' | 'warning' | 'error') => void
  ) {
    this.getText = getText
    this.setText = setText
    this.getActiveTabName = getActiveTabName
    this.showNotification = showNotification
  }

  /**
   * Get the currently active .prmd file being edited
   */
  getActiveDocument(): string | null {
    return this.getActiveTabName()
  }

  /**
   * Insert content at the current cursor position or specified location
   */
  async insertContent(content: string, location?: string | number): Promise<void> {
    const currentText = this.getText()

    if (typeof location === 'number') {
      // Insert at specific line number
      const lines = currentText.split('\n')
      const lineIndex = Math.max(0, Math.min(location - 1, lines.length))
      lines.splice(lineIndex, 0, content)
      this.setText(lines.join('\n'))
      this.showNotification(`Inserted content at line ${location}`, 'info')
    } else if (typeof location === 'string') {
      // Insert in specific section
      await this.replaceSection(location, content)
    } else {
      // Append at end
      this.setText(currentText + '\n\n' + content)
      this.showNotification('Content inserted at end of document', 'info')
    }
  }

  /**
   * Replace a section of the document
   */
  async replaceSection(section: string, content: string): Promise<void> {
    const currentText = this.getText()
    const lines = currentText.split('\n')

    // Find section header (case-insensitive)
    const sectionHeader = `# ${section}`
    const sectionHeaderRegex = new RegExp(`^#\\s+${section}\\s*$`, 'i')

    let sectionStartIndex = -1
    let sectionEndIndex = -1

    // Find start of section
    for (let i = 0; i < lines.length; i++) {
      if (sectionHeaderRegex.test(lines[i])) {
        sectionStartIndex = i
        break
      }
    }

    if (sectionStartIndex === -1) {
      // Section doesn't exist, add it after frontmatter
      const frontmatterEnd = this.findFrontmatterEnd(lines)
      if (frontmatterEnd !== -1) {
        lines.splice(frontmatterEnd + 1, 0, '', sectionHeader, content)
        this.setText(lines.join('\n'))
        this.showNotification(`Added new section: ${section}`, 'info')
      } else {
        this.showNotification(`Could not find frontmatter to add section: ${section}`, 'error')
      }
      return
    }

    // Find end of section (next section header or end of file)
    for (let i = sectionStartIndex + 1; i < lines.length; i++) {
      if (lines[i].match(/^#\s+\w+/)) {
        sectionEndIndex = i - 1
        break
      }
    }

    if (sectionEndIndex === -1) {
      sectionEndIndex = lines.length - 1
    }

    // Replace section content
    const newLines = [
      ...lines.slice(0, sectionStartIndex + 1),
      content,
      ...lines.slice(sectionEndIndex + 1)
    ]

    this.setText(newLines.join('\n'))
    this.showNotification(`Updated section: ${section}`, 'info')
  }

  /**
   * Add a parameter to the YAML frontmatter
   */
  async addParameter(parameter: {
    name: string
    type: string
    description?: string
    required?: boolean
    default?: any
  }): Promise<void> {
    const currentText = this.getText()
    const lines = currentText.split('\n')

    const frontmatterEnd = this.findFrontmatterEnd(lines)
    if (frontmatterEnd === -1) {
      this.showNotification('Could not find YAML frontmatter', 'error')
      return
    }

    // Check if parameters section exists
    let parametersIndex = -1
    for (let i = 0; i < frontmatterEnd; i++) {
      if (lines[i].trim().startsWith('parameters:')) {
        parametersIndex = i
        break
      }
    }

    // Build parameter YAML
    const paramLines = [`  - name: ${parameter.name}`]
    paramLines.push(`    type: ${parameter.type}`)
    if (parameter.description) {
      paramLines.push(`    description: "${parameter.description}"`)
    }
    if (parameter.required) {
      paramLines.push(`    required: true`)
    }
    if (parameter.default !== undefined) {
      const defaultValue = typeof parameter.default === 'string'
        ? `"${parameter.default}"`
        : parameter.default
      paramLines.push(`    default: ${defaultValue}`)
    }

    if (parametersIndex === -1) {
      // Add parameters section before closing frontmatter
      lines.splice(frontmatterEnd, 0, 'parameters:', ...paramLines)
    } else {
      // Add to existing parameters section
      let insertIndex = parametersIndex + 1
      // Find end of parameters section
      while (insertIndex < frontmatterEnd && lines[insertIndex].trim().startsWith('- ')) {
        insertIndex++
        // Skip parameter properties
        while (insertIndex < frontmatterEnd && lines[insertIndex].trim().match(/^\w+:/)) {
          insertIndex++
        }
      }
      lines.splice(insertIndex, 0, ...paramLines)
    }

    this.setText(lines.join('\n'))
    this.showNotification(`Added parameter: ${parameter.name}`, 'info')
  }

  /**
   * Update a parameter in the YAML frontmatter
   */
  async updateParameter(
    parameterName: string,
    updates: Partial<{
      type: string
      description: string
      required: boolean
      default: any
    }>
  ): Promise<void> {
    const currentText = this.getText()
    const lines = currentText.split('\n')

    const frontmatterEnd = this.findFrontmatterEnd(lines)
    if (frontmatterEnd === -1) {
      this.showNotification('Could not find YAML frontmatter', 'error')
      return
    }

    // Find the parameter
    let paramStartIndex = -1
    for (let i = 0; i < frontmatterEnd; i++) {
      if (lines[i].trim() === `- name: ${parameterName}`) {
        paramStartIndex = i
        break
      }
    }

    if (paramStartIndex === -1) {
      this.showNotification(`Parameter not found: ${parameterName}`, 'error')
      return
    }

    // Find end of this parameter
    let paramEndIndex = paramStartIndex + 1
    while (paramEndIndex < frontmatterEnd) {
      const line = lines[paramEndIndex].trim()
      if (line.startsWith('- name:')) {
        break
      }
      if (!line.match(/^\w+:/)) {
        break
      }
      paramEndIndex++
    }

    // Update parameter properties
    for (let i = paramStartIndex + 1; i < paramEndIndex; i++) {
      const line = lines[i]
      const match = line.match(/^(\s+)(\w+):\s*(.+)$/)
      if (!match) continue

      const [, indent, key, value] = match

      if (key === 'type' && updates.type !== undefined) {
        lines[i] = `${indent}type: ${updates.type}`
      } else if (key === 'description' && updates.description !== undefined) {
        lines[i] = `${indent}description: "${updates.description}"`
      } else if (key === 'required' && updates.required !== undefined) {
        lines[i] = `${indent}required: ${updates.required}`
      } else if (key === 'default' && updates.default !== undefined) {
        const defaultValue = typeof updates.default === 'string'
          ? `"${updates.default}"`
          : updates.default
        lines[i] = `${indent}default: ${defaultValue}`
      }
    }

    this.setText(lines.join('\n'))
    this.showNotification(`Updated parameter: ${parameterName}`, 'info')
  }

  /**
   * Get the current document content
   */
  async getDocumentContent(): Promise<string> {
    return this.getText()
  }

  /**
   * Set the entire document content (full replacement)
   */
  async setDocumentContent(content: string): Promise<void> {
    this.setText(content)
    this.showNotification('Document content replaced', 'info')
  }

  /**
   * Show a notification/message to the user
   */
  showMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.showNotification(message, type)
  }

  /**
   * Get the editor type/name for context-aware behavior
   */
  getEditorType(): string {
    return 'web-editor'
  }

  /**
   * Helper: Find the end of YAML frontmatter
   */
  private findFrontmatterEnd(lines: string[]): number {
    let inFrontmatter = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true
        } else {
          return i
        }
      }
    }
    return -1
  }
}
