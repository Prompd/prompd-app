/**
 * JSON Reporter - structured output for programmatic consumption and CI.
 */

import type { Reporter } from './types';
import type { TestRunResult } from '../types';

export class JsonReporter implements Reporter {
  private pretty: boolean;

  constructor(pretty = true) {
    this.pretty = pretty;
  }

  report(result: TestRunResult): string {
    if (this.pretty) {
      return JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result);
  }
}
