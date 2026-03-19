/**
 * @prompd/test - Prompt testing and evaluation framework
 *
 * Provides test discovery, assertion evaluation, and reporting for .prmd files.
 * Consumes @prompd/cli for compilation and execution.
 */

// Core classes
export { TestRunner } from './TestRunner';
export { TestParser, TestParseError } from './TestParser';
export { TestDiscovery } from './TestDiscovery';
export { EvaluatorEngine } from './EvaluatorEngine';

// Evaluators
export { NlpEvaluator } from './evaluators/NlpEvaluator';
export { ScriptEvaluator } from './evaluators/ScriptEvaluator';
export { PrmdEvaluator } from './evaluators/PrmdEvaluator';

// Reporters
export { ConsoleReporter } from './reporters/ConsoleReporter';
export { JsonReporter } from './reporters/JsonReporter';
export { JunitReporter } from './reporters/JunitReporter';

// Types
export type {
  TestSuite,
  TestCase,
  AssertionDef,
  TestResult,
  TestRunResult,
  TestSuiteResult,
  TestRunSummary,
  TestRunOptions,
  TestProgressEvent,
  TestProgressCallback,
  TestStatus,
  AssertionStatus,
  AssertionResult,
  EvaluatorType,
  NlpCheck,
} from './types';

export type {
  Evaluator,
  EvaluatorContext,
} from './evaluators/types';

export type {
  Reporter,
} from './reporters/types';

export type {
  DiscoveryResult,
  DiscoveryError,
} from './TestDiscovery';

export type {
  EvaluatorEngineOptions,
} from './EvaluatorEngine';

// Re-export TestHarness interface from @prompd/cli for convenience
export type {
  TestHarness,
  TestHarnessResult,
  TestHarnessOptions,
  TestHarnessProgressEvent,
  TestHarnessProgressCallback,
} from '@prompd/cli';

export type {
  PrmdEvaluatorOptions,
} from './evaluators/PrmdEvaluator';

export type {
  CompilerModule,
} from './cli-types';
