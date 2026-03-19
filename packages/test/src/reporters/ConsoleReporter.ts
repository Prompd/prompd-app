/**
 * Console Reporter - terminal output with pass/fail formatting.
 *
 * Does NOT use emojis (breaks things per project rules).
 * Uses simple text markers: [PASS], [FAIL], [ERROR], [SKIP].
 */

import type { Reporter } from './types';
import type { TestRunResult, TestResult, AssertionResult } from '../types';

export class ConsoleReporter implements Reporter {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  report(result: TestRunResult): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('=== Prompd Test Results ===');
    lines.push('');

    for (const suite of result.suites) {
      lines.push(`  ${suite.suite}`);

      for (const test of suite.results) {
        const marker = this.statusMarker(test.status);
        const duration = this.formatDuration(test.duration);
        const meta = test.execution
          ? ` [${test.execution.provider}/${test.execution.model}${test.execution.usage?.totalTokens ? ` ${test.execution.usage.totalTokens}tok` : ''}]`
          : '';
        lines.push(`    ${marker} ${test.testName} (${duration})${meta}`);

        if (test.status === 'error' && test.error) {
          lines.push(`      Error: ${test.error}`);
        }

        if (this.verbose || test.status === 'fail' || test.status === 'error') {
          for (const assertion of test.assertions) {
            this.appendAssertionDetail(lines, assertion);
          }
        }
      }

      lines.push('');
    }

    // Summary
    const s = result.summary;
    lines.push('---');
    lines.push(
      `Tests: ${s.passed} passed, ${s.failed} failed, ${s.errors} errors, ${s.skipped} skipped, ${s.total} total`
    );
    lines.push(`Time:  ${this.formatDuration(s.duration)}`);
    if (s.totalTokens) {
      lines.push(`Tokens: ${s.totalTokens.toLocaleString()}`);
    }
    if (s.models && s.models.length > 0) {
      lines.push(`Models: ${s.models.join(', ')}`);
    }

    if (s.failed > 0 || s.errors > 0) {
      lines.push('Result: FAIL');
    } else {
      lines.push('Result: PASS');
    }

    lines.push('');
    return lines.join('\n');
  }

  private appendAssertionDetail(lines: string[], assertion: AssertionResult): void {
    const marker = this.statusMarker(assertion.status);
    const check = assertion.check ? ` (${assertion.check})` : '';
    const duration = this.formatDuration(assertion.duration);
    lines.push(`      ${marker} ${assertion.evaluator}${check} [${duration}]`);

    if (assertion.reason && (assertion.status !== 'pass' || this.verbose)) {
      lines.push(`        ${assertion.reason}`);
    }
  }

  private statusMarker(status: string): string {
    switch (status) {
      case 'pass': return '[PASS]';
      case 'fail': return '[FAIL]';
      case 'error': return '[ERR ]';
      case 'skip': return '[SKIP]';
      default: return '[????]';
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}
