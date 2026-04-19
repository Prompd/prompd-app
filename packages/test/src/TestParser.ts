/**
 * Parses .test.prmd files into TestSuite structures.
 *
 * A .test.prmd file has YAML frontmatter (test definitions) and
 * an optional content block (evaluator prompt for prmd evaluators).
 */

import * as path from 'path';
import * as YAML from 'yaml';
import type { TestSuite, TestCase, AssertionDef, EvaluatorType, NlpCheck } from './types';

const VALID_EVALUATOR_TYPES: EvaluatorType[] = ['nlp', 'script', 'prmd'];
const VALID_NLP_CHECKS: NlpCheck[] = [
  'contains', 'not_contains', 'matches',
  'max_tokens', 'min_tokens', 'max_words', 'min_words',
  'starts_with', 'ends_with'
];

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  target?: string;
  tests?: RawTestCase[];
}

interface RawTestCase {
  name?: string;
  params?: Record<string, unknown>;
  assert?: RawAssertionDef[];
  expect_error?: boolean;
}

interface RawAssertionDef {
  evaluator?: string;
  check?: string;
  value?: unknown;
  evaluate?: string;
  run?: string;
  prompt?: string;
  provider?: string;
  model?: string;
}

export class TestParser {
  /**
   * Parse a .test.prmd file's raw content into a TestSuite.
   */
  parse(content: string, testFilePath: string): TestSuite {
    const normalized = content.replace(/\r\n/g, '\n');
    const { frontmatter, body } = this.splitFrontmatter(normalized);

    if (!frontmatter) {
      throw new TestParseError('Missing YAML frontmatter in .test.prmd file', testFilePath);
    }

    let parsed: ParsedFrontmatter;
    try {
      parsed = YAML.parse(frontmatter) as ParsedFrontmatter;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TestParseError(`Invalid YAML frontmatter: ${message}`, testFilePath);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new TestParseError('Frontmatter must be a YAML object', testFilePath);
    }

    const name = parsed.name || path.basename(testFilePath, '.test.prmd');
    const target = this.resolveTarget(parsed.target, testFilePath);
    const tests = this.parseTests(parsed.tests, testFilePath);
    const evaluatorPrompt = body.trim() || undefined;

    return {
      name,
      description: parsed.description,
      target,
      testFilePath,
      tests,
      evaluatorPrompt,
    };
  }

  private splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
      return { frontmatter: null, body: content };
    }
    return {
      frontmatter: match[1],
      body: match[2],
    };
  }

  private resolveTarget(target: string | undefined, testFilePath: string): string {
    if (target) {
      const dir = path.dirname(testFilePath);
      return path.resolve(dir, target);
    }

    // Auto-discover: summarize.test.prmd -> summarize.prmd
    const dir = path.dirname(testFilePath);
    const base = path.basename(testFilePath);
    const sourceBase = base.replace(/\.test\.prmd$/, '.prmd');
    return path.resolve(dir, sourceBase);
  }

  private parseTests(rawTests: RawTestCase[] | undefined, filePath: string): TestCase[] {
    if (!rawTests || !Array.isArray(rawTests)) {
      throw new TestParseError('Frontmatter must contain a "tests" array', filePath);
    }

    if (rawTests.length === 0) {
      throw new TestParseError('"tests" array must not be empty', filePath);
    }

    return rawTests.map((raw, index) => {
      const name = raw.name || `test_${index + 1}`;
      const params = raw.params && typeof raw.params === 'object' ? raw.params : {};

      if (raw.expect_error) {
        return {
          name,
          params,
          assert: [],
          expect_error: true,
        };
      }

      const assertions = this.parseAssertions(raw.assert, name, filePath);
      return { name, params, assert: assertions };
    });
  }

  private parseAssertions(
    rawAssertions: RawAssertionDef[] | undefined,
    testName: string,
    filePath: string
  ): AssertionDef[] {
    if (!rawAssertions || !Array.isArray(rawAssertions)) {
      return [];
    }

    return rawAssertions.map((raw, index) => {
      if (!raw.evaluator || !VALID_EVALUATOR_TYPES.includes(raw.evaluator as EvaluatorType)) {
        throw new TestParseError(
          `Test "${testName}", assertion ${index + 1}: invalid evaluator "${raw.evaluator}". ` +
          `Must be one of: ${VALID_EVALUATOR_TYPES.join(', ')}`,
          filePath
        );
      }

      const evaluator = raw.evaluator as EvaluatorType;

      if (evaluator === 'nlp') {
        return this.validateNlpAssertion(raw, testName, index, filePath);
      }

      if (evaluator === 'script') {
        return this.validateScriptAssertion(raw, testName, index, filePath);
      }

      return this.validatePrmdAssertion(raw, testName, index, filePath);
    });
  }

  private validateNlpAssertion(
    raw: RawAssertionDef,
    testName: string,
    index: number,
    filePath: string
  ): AssertionDef {
    if (!raw.check || !VALID_NLP_CHECKS.includes(raw.check as NlpCheck)) {
      throw new TestParseError(
        `Test "${testName}", assertion ${index + 1}: NLP evaluator requires a valid "check". ` +
        `Must be one of: ${VALID_NLP_CHECKS.join(', ')}`,
        filePath
      );
    }

    if (raw.value === undefined || raw.value === null) {
      throw new TestParseError(
        `Test "${testName}", assertion ${index + 1}: NLP evaluator requires a "value"`,
        filePath
      );
    }

    return {
      evaluator: 'nlp',
      check: raw.check as NlpCheck,
      value: raw.value as string | string[] | number,
      evaluate: (raw.evaluate as AssertionDef['evaluate']) || undefined,
    };
  }

  private validateScriptAssertion(
    raw: RawAssertionDef,
    testName: string,
    index: number,
    filePath: string
  ): AssertionDef {
    if (!raw.run || typeof raw.run !== 'string') {
      throw new TestParseError(
        `Test "${testName}", assertion ${index + 1}: script evaluator requires a "run" path`,
        filePath
      );
    }

    return {
      evaluator: 'script',
      run: raw.run,
      evaluate: (raw.evaluate as AssertionDef['evaluate']) || undefined,
    };
  }

  private validatePrmdAssertion(
    raw: RawAssertionDef,
    _testName: string,
    _index: number,
    _filePath: string
  ): AssertionDef {
    // prompt: is optional — if omitted, uses the content block of the .test.prmd
    return {
      evaluator: 'prmd',
      prompt: raw.prompt || undefined,
      provider: raw.provider || undefined,
      model: raw.model || undefined,
      evaluate: (raw.evaluate as AssertionDef['evaluate']) || undefined,
    };
  }
}

export class TestParseError extends Error {
  public readonly filePath: string;

  constructor(message: string, filePath: string) {
    super(`${message} (${filePath})`);
    this.name = 'TestParseError';
    this.filePath = filePath;
  }
}
