/**
 * Routes assertions to the correct evaluator and manages execution order.
 *
 * Execution order: nlp -> script -> prmd (cheap to expensive).
 * Fail-fast by default — stops on first failure unless runAll is set.
 */

import type { AssertionDef, AssertionResult, EvaluatorType } from './types';
import type { Evaluator, EvaluatorContext } from './evaluators/types';
import type { CompilerModule } from './cli-types';
import { NlpEvaluator } from './evaluators/NlpEvaluator';
import { ScriptEvaluator } from './evaluators/ScriptEvaluator';
import { PrmdEvaluator, type PrmdEvaluatorOptions } from './evaluators/PrmdEvaluator';

/** Execution priority — lower number runs first */
const EVALUATOR_PRIORITY: Record<EvaluatorType, number> = {
  nlp: 0,
  script: 1,
  prmd: 2,
};

export interface EvaluatorEngineOptions {
  testFileDir: string;
  evaluatorPrompt?: string;
  workspaceRoot?: string;
  registryUrl?: string;
  allowedEvaluators?: EvaluatorType[];
  failFast?: boolean;
  cliModule?: CompilerModule;
  provider?: string;
  model?: string;
}

export class EvaluatorEngine {
  private evaluators: Map<EvaluatorType, Evaluator>;
  private allowedEvaluators: Set<EvaluatorType>;
  private failFast: boolean;

  constructor(options: EvaluatorEngineOptions) {
    this.failFast = options.failFast !== false;
    this.allowedEvaluators = new Set(options.allowedEvaluators || ['nlp', 'script', 'prmd']);

    const prmdOptions: PrmdEvaluatorOptions = {
      testFileDir: options.testFileDir,
      evaluatorPrompt: options.evaluatorPrompt,
      workspaceRoot: options.workspaceRoot,
      registryUrl: options.registryUrl,
      cliModule: options.cliModule,
      provider: options.provider,
      model: options.model,
    };

    this.evaluators = new Map<EvaluatorType, Evaluator>([
      ['nlp', new NlpEvaluator()],
      ['script', new ScriptEvaluator(options.testFileDir)],
      ['prmd', new PrmdEvaluator(prmdOptions)],
    ]);
  }

  /**
   * Evaluate all assertions in cost-priority order.
   * Returns results for each assertion.
   */
  async evaluate(
    assertions: AssertionDef[],
    context: EvaluatorContext,
    onResult?: (result: AssertionResult) => void
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];

    // Sort by evaluator priority (nlp first, prmd last)
    const sorted = [...assertions].sort(
      (a, b) => EVALUATOR_PRIORITY[a.evaluator] - EVALUATOR_PRIORITY[b.evaluator]
    );

    for (const assertion of sorted) {
      // Skip evaluators that aren't allowed
      if (!this.allowedEvaluators.has(assertion.evaluator)) {
        const skipped: AssertionResult = {
          evaluator: assertion.evaluator,
          check: assertion.check,
          status: 'skip',
          reason: `Evaluator type "${assertion.evaluator}" skipped by filter`,
          duration: 0,
        };
        results.push(skipped);
        onResult?.(skipped);
        continue;
      }

      const evaluator = this.evaluators.get(assertion.evaluator);
      if (!evaluator) {
        const errorResult: AssertionResult = {
          evaluator: assertion.evaluator,
          check: assertion.check,
          status: 'error',
          reason: `No evaluator registered for type "${assertion.evaluator}"`,
          duration: 0,
        };
        results.push(errorResult);
        onResult?.(errorResult);
        continue;
      }

      const result = await evaluator.evaluate(assertion, context);
      results.push(result);
      onResult?.(result);

      // Fail-fast: stop on first failure
      if (this.failFast && result.status !== 'pass') {
        // Mark remaining assertions as skipped
        const remaining = sorted.slice(sorted.indexOf(assertion) + 1);
        for (const rem of remaining) {
          const skipped: AssertionResult = {
            evaluator: rem.evaluator,
            check: rem.check,
            status: 'skip',
            reason: 'Skipped due to prior failure (fail-fast)',
            duration: 0,
          };
          results.push(skipped);
          onResult?.(skipped);
        }
        break;
      }
    }

    return results;
  }
}
