/**
 * JUnit XML Reporter - generates JUnit-compatible XML for CI systems.
 *
 * Output format follows the JUnit XML schema used by Jenkins, GitHub Actions,
 * Azure DevOps, and most CI platforms.
 */

import type { Reporter } from './types';
import type { TestRunResult, TestResult } from '../types';

export class JunitReporter implements Reporter {
  report(result: TestRunResult): string {
    const lines: string[] = [];

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites tests="${result.summary.total}" ` +
      `failures="${result.summary.failed}" ` +
      `errors="${result.summary.errors}" ` +
      `skipped="${result.summary.skipped}" ` +
      `time="${(result.summary.duration / 1000).toFixed(3)}">`
    );

    for (const suite of result.suites) {
      const suiteTests = suite.results.length;
      const suiteFailures = suite.results.filter(r => r.status === 'fail').length;
      const suiteErrors = suite.results.filter(r => r.status === 'error').length;
      const suiteSkipped = suite.results.filter(r => r.status === 'skip').length;
      const suiteDuration = suite.results.reduce((sum, r) => sum + r.duration, 0);

      lines.push(
        `  <testsuite name="${this.escapeXml(suite.suite)}" ` +
        `tests="${suiteTests}" ` +
        `failures="${suiteFailures}" ` +
        `errors="${suiteErrors}" ` +
        `skipped="${suiteSkipped}" ` +
        `time="${(suiteDuration / 1000).toFixed(3)}" ` +
        `file="${this.escapeXml(suite.testFilePath)}">`
      );

      for (const test of suite.results) {
        this.appendTestCase(lines, suite.suite, test);
      }

      lines.push('  </testsuite>');
    }

    lines.push('</testsuites>');
    return lines.join('\n');
  }

  private appendTestCase(lines: string[], suiteName: string, test: TestResult): void {
    const time = (test.duration / 1000).toFixed(3);

    lines.push(
      `    <testcase name="${this.escapeXml(test.testName)}" ` +
      `classname="${this.escapeXml(suiteName)}" ` +
      `time="${time}">`
    );

    if (test.status === 'fail') {
      const failedAssertions = test.assertions.filter(a => a.status === 'fail');
      const message = failedAssertions
        .map(a => `${a.evaluator}${a.check ? `(${a.check})` : ''}: ${a.reason || 'failed'}`)
        .join('; ');

      lines.push(`      <failure message="${this.escapeXml(message)}">`);
      lines.push(this.escapeXml(this.buildFailureDetail(test)));
      lines.push('      </failure>');
    }

    if (test.status === 'error') {
      const errorMessage = test.error || 'Unknown error';
      lines.push(`      <error message="${this.escapeXml(errorMessage)}">`);
      lines.push(this.escapeXml(errorMessage));
      lines.push('      </error>');
    }

    if (test.status === 'skip') {
      lines.push('      <skipped/>');
    }

    // Include output as system-out if available
    if (test.output) {
      lines.push('      <system-out>');
      lines.push(this.escapeXml(test.output.substring(0, 10000)));
      lines.push('      </system-out>');
    }

    lines.push('    </testcase>');
  }

  private buildFailureDetail(test: TestResult): string {
    const details: string[] = [];

    for (const assertion of test.assertions) {
      const prefix = assertion.status === 'pass' ? '[PASS]' : '[FAIL]';
      const check = assertion.check ? ` (${assertion.check})` : '';
      details.push(`${prefix} ${assertion.evaluator}${check}: ${assertion.reason || ''}`);
    }

    return details.join('\n');
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
