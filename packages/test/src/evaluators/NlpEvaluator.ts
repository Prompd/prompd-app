/**
 * NLP Evaluator - local, fast, free, deterministic assertions.
 *
 * Checks: contains, not_contains, matches, max_tokens, min_tokens, starts_with, ends_with
 */

import type { Evaluator, EvaluatorContext } from './types';
import type { AssertionDef, AssertionResult, NlpCheck, EvaluateTarget } from '../types';

export class NlpEvaluator implements Evaluator {
  readonly type = 'nlp';

  async evaluate(assertion: AssertionDef, context: EvaluatorContext): Promise<AssertionResult> {
    const start = Date.now();
    const check = assertion.check as NlpCheck;
    const target: EvaluateTarget = assertion.evaluate || 'response';

    try {
      const text = this.resolveTarget(target, context);
      const targetLabel = target === 'both' ? 'Prompt+Response' : target === 'prompt' ? 'Prompt' : 'Output';
      const result = this.runCheck(check, assertion.value, text, targetLabel);
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

  private resolveTarget(target: EvaluateTarget, context: EvaluatorContext): string {
    switch (target) {
      case 'prompt': return context.prompt;
      case 'both': return `${context.prompt}\n\n${context.response}`;
      case 'response':
      default: return context.response;
    }
  }

  private runCheck(
    check: NlpCheck,
    value: string | string[] | number | undefined,
    output: string,
    label: string = 'Output'
  ): { pass: boolean; reason: string } {
    switch (check) {
      case 'contains':
        return this.checkContains(value, output, label);
      case 'not_contains':
        return this.checkNotContains(value, output, label);
      case 'matches':
        return this.checkMatches(value, output, label);
      case 'max_tokens':
        return this.checkMaxTokens(value, output);
      case 'min_tokens':
        return this.checkMinTokens(value, output);
      case 'max_words':
        return this.checkMaxWords(value, output);
      case 'min_words':
        return this.checkMinWords(value, output);
      case 'starts_with':
        return this.checkStartsWith(value, output, label);
      case 'ends_with':
        return this.checkEndsWith(value, output, label);
      default:
        return { pass: false, reason: `Unknown NLP check: ${check}` };
    }
  }

  private checkContains(
    value: string | string[] | number | undefined,
    output: string,
    label: string
  ): { pass: boolean; reason: string } {
    const values = this.toStringArray(value);
    const lower = output.toLowerCase();
    const missing = values.filter(v => !lower.includes(v.toLowerCase()));

    if (missing.length === 0) {
      return { pass: true, reason: `${label} contains all expected values` };
    }
    return {
      pass: false,
      reason: `${label} missing: ${missing.map(v => `"${v}"`).join(', ')}`,
    };
  }

  private checkNotContains(
    value: string | string[] | number | undefined,
    output: string,
    label: string
  ): { pass: boolean; reason: string } {
    const values = this.toStringArray(value);
    const lower = output.toLowerCase();
    const found = values.filter(v => lower.includes(v.toLowerCase()));

    if (found.length === 0) {
      return { pass: true, reason: `${label} does not contain any excluded values` };
    }
    return {
      pass: false,
      reason: `${label} contains excluded values: ${found.map(v => `"${v}"`).join(', ')}`,
    };
  }

  private checkMatches(
    value: string | string[] | number | undefined,
    output: string,
    label: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'string') {
      return { pass: false, reason: '"matches" check requires a string regex pattern' };
    }

    const regex = new RegExp(value);
    if (regex.test(output)) {
      return { pass: true, reason: `${label} matches pattern /${value}/` };
    }
    return { pass: false, reason: `${label} does not match pattern /${value}/` };
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
    output: string,
    label: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'string') {
      return { pass: false, reason: '"starts_with" check requires a string value' };
    }

    const trimmed = output.trimStart();
    if (trimmed.toLowerCase().startsWith(value.toLowerCase())) {
      return { pass: true, reason: `${label} starts with "${value}"` };
    }
    return { pass: false, reason: `${label} does not start with "${value}"` };
  }

  private checkEndsWith(
    value: string | string[] | number | undefined,
    output: string,
    label: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'string') {
      return { pass: false, reason: '"ends_with" check requires a string value' };
    }

    const trimmed = output.trimEnd();
    if (trimmed.toLowerCase().endsWith(value.toLowerCase())) {
      return { pass: true, reason: `${label} ends with "${value}"` };
    }
    return { pass: false, reason: `${label} does not end with "${value}"` };
  }

  private checkMaxWords(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'number') {
      return { pass: false, reason: '"max_words" check requires a numeric value' };
    }

    const wordCount = this.countWords(output);
    if (wordCount <= value) {
      return { pass: true, reason: `Word count ${wordCount} <= ${value}` };
    }
    return { pass: false, reason: `Word count ${wordCount} exceeds max ${value}` };
  }

  private checkMinWords(
    value: string | string[] | number | undefined,
    output: string
  ): { pass: boolean; reason: string } {
    if (typeof value !== 'number') {
      return { pass: false, reason: '"min_words" check requires a numeric value' };
    }

    const wordCount = this.countWords(output);
    if (wordCount >= value) {
      return { pass: true, reason: `Word count ${wordCount} >= ${value}` };
    }
    return { pass: false, reason: `Word count ${wordCount} below min ${value}` };
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
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
