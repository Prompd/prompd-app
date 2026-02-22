/**
 * Smoke tests for key services
 * Verifies that services can be imported and instantiated
 * without errors in a non-Electron (jsdom) environment.
 */

import { describe, it, expect } from 'vitest'
import { parsePrompd, splitFrontmatter, parseSections } from '../modules/lib/prompdParser'
import { configService } from '../modules/services/configService'

describe('prompdParser', () => {
  it('parses a valid .prmd file with frontmatter and body', () => {
    const input = [
      '---',
      'id: my-prompt',
      'version: 1.0.0',
      '---',
      '# System',
      'You are a helpful assistant.',
    ].join('\n')

    const result = parsePrompd(input)

    expect(result.frontmatter.id).toBe('my-prompt')
    expect(result.frontmatter.version).toBe('1.0.0')
    expect(result.body).toContain('You are a helpful assistant.')
    // No errors expected for a valid file
    const errors = result.issues.filter(i => i.severity === 'error')
    expect(errors).toHaveLength(0)
  })

  it('reports an error for missing frontmatter block', () => {
    const input = 'Just some text without frontmatter'
    const result = parsePrompd(input)

    expect(result.issues.length).toBeGreaterThan(0)
    // Should warn about missing frontmatter and error about missing id/name
    const hasFrontmatterIssue = result.issues.some(i =>
      i.message.toLowerCase().includes('frontmatter') || i.message.toLowerCase().includes('missing')
    )
    expect(hasFrontmatterIssue).toBe(true)
  })

  it('splitFrontmatter separates YAML from body content', () => {
    const input = '---\nid: test\n---\n# Body here'
    const { frontmatterText, bodyText } = splitFrontmatter(input)

    expect(frontmatterText).toContain('---')
    expect(frontmatterText).toContain('id: test')
    expect(bodyText).toContain('# Body here')
  })

  it('parseSections extracts heading-based sections from body', () => {
    const body = '\n# System\nYou are an assistant.\n\n# User\nHello there.'
    const sections = parseSections(body)

    expect(sections.length).toBe(2)
    expect(sections[0].name).toBe('System')
    expect(sections[0].content).toContain('You are an assistant.')
    expect(sections[1].name).toBe('User')
    expect(sections[1].content).toContain('Hello there.')
  })
})

describe('configService', () => {
  it('can be imported and is an object with expected methods', () => {
    expect(configService).toBeDefined()
    expect(typeof configService.loadConfig).toBe('function')
    expect(typeof configService.getConfig).toBe('function')
    expect(typeof configService.hasNativeConfig).toBe('function')
  })

  it('reports no native config in jsdom environment', () => {
    // In jsdom (non-Electron), hasNativeConfig should return false
    expect(configService.hasNativeConfig()).toBe(false)
  })
})
