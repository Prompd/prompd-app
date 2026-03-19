/**
 * NLP Evaluator - local, fast, free, deterministic assertions.
 *
 * Checks: contains, not_contains, matches, max_tokens, min_tokens, starts_with, ends_with
 */

import type { Evaluator, EvaluatorContext } from './types';
import type { AssertionDef, AssertionResult, NlpCheck } from '../types';

export class NlpEvaluator implements Evaluator {
  readonly type = 'nlp';

  async evaluate(assertion: AssertionDef, context: EvaluatorContext): Promise<AssertionResult> {
    const start = Date.now();
    const check = assertion.check as NlpCheck;

    try {
      const result = this.runCheck(check, assertion.value, context.response);
      return {
        evaluator: 'nlp',
        check,
        status: result.pass ? 'pass' : 'fail',
        reason: result.reason,
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        evaluator: 'nlp',
        check,
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      };
    }
  }

  private runCheck(
    check: NlpCheck,
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    switch (check) {
      case 'contains':
        return this.checkContains(value, output);
      case 'not_contains':
        return this.checkNotContains(value, output);
      case 'matches':
        return this.checkMatches(value, output);
      case 'max_tokens':
        return this.checkMaxTokens(value, output);
      case 'min_tokens':
        return this.checkMinTokens(value, output);
      case 'starts_with':
        return this.checkStartsWith(value, output);
      case 'ends_with':
        return this.checkEndsWith(value, output);
      default:
        return { pass: false, reason: `Unknown NLP check: ${check}` };
    }
  }

  private checkContains(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    const values = this.toStringArray(value);
    const lower = output.toLowerCase();
    const missing = values.filter(v => !lower.includes(v.toLowerCase()));

    if (missing.length === 0) {
      return { pass: true, reason: `Output contains all expected values` };
    }
    return {
      pass: false,
      reason: `Output missing: ${missing.map(v => `"${v}"`).join(', ')}`,
    };
  }

  private checkNotContains(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    const values = this.toStringArray(value);
    const lower = output.toLowerCase();
    const found = values.filter(v => lower.includes(v.toLowerCase()));

    if (found.length === 0) {
      return { pass: true, reason: `Output does not contain any excluded values` };
    }
    return {
      pass: false,
      reason: `Output contains excluded values: ${found.map(v => `"${v}"`).join(', ')}`,
    };
  }

  private checkMatches(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'string') {
      return { pass: false, reason: '"matches" check requires a string regex pattern' };
    }

    const regex = new RegExp(value);
    if (regex.test(output)) {
      return { pass: true, reason: `Output matches pattern /${value}/` };
    }
    return { pass: false, reason: `Output does not match pattern /${value}/` };
  }

  private checkMaxTokens(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'number') {
      return { pass: false, reason: '"max_tokens" check requires a numeric value' };
    }

    const tokenCount = this.estimateTokens(output);
    if (tokenCount <= value) {
      return { pass: true, reason: `Token count ${tokenCount} <= ${value}` };
    }
    return { pass: false, reason: `Token count ${tokenCount} exceeds max ${value}` };
  }

  private checkMinTokens(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'number') {
      return { pass: false, reason: '"min_tokens" check requires a numeric value' };
    }

    const tokenCount = this.estimateTokens(output);
    if (tokenCount >= value) {
      return { pass: true, reason: `Token count ${tokenCount} >= ${value}` };
    }
    return { pass: false, reason: `Token count ${tokenCount} below min ${value}` };
  }

  private checkStartsWith(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'string') {
      return { pass: false, reason: '"starts_with" check requires a string value' };
    }

    const trimmed = output.trimStart();
    if (trimmed.toLowerCase().startsWith(value.toLowerCase())) {
      return { pass: true, reason: `Output starts with "${value}"` };
    }
    return { pass: false, reason: `Output does not start with "${value}"` };
  }

  private checkEndsWith(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'string') {
      return { pass: false, reason: '"ends_with" check requires a string value' };
    }

    const trimmed = output.trimEnd();
    if (trimmed.toLowerCase().endsWith(value.toLowerCase())) {
      return { pass: true, reason: `Output ends with "${value}"` };
    }
    return { pass: false, reason: `Output does not end with "${value}"` };
  }

  /**
   * Rough token estimation: ~4 characters per token (GPT-family average).
   * This is intentionally approximate — for precise counting, use a tokenizer.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private toStringArray(value: string | string[] | number | undefined): string[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value.map(String);
    return [String(value)];
  }
}
