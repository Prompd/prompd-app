/**
 * Reporter interface for @prompd/test
 */

import type { TestRunResult } from '../types';

export interface Reporter {
  report(result: TestRunResult): string;
}
