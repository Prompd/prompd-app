/**
 * Evaluator interfaces for @prompd/test
 */

import type { AssertionDef, AssertionResult } from '../types';

export interface EvaluatorContext {
  prompt: string;
  response: string;
  params: Record<string, unknown>;
  metadata: {
    provider: string;
    model: string;
    duration: number;
  };
}

export interface Evaluator {
  readonly type: string;
  evaluate(
    assertion: AssertionDef,
    context: EvaluatorContext
  ): Promise<AssertionResult>;
}
