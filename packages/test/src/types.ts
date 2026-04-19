/**
 * Core type definitions for @prompd/test
 */

// --- Evaluator taxonomy ---

export type EvaluatorType = 'nlp' | 'script' | 'prmd';

export type NlpCheck =
  | 'contains'
  | 'not_contains'
  | 'matches'
  | 'max_tokens'
  | 'min_tokens'
  | 'max_words'
  | 'min_words'
  | 'starts_with'
  | 'ends_with';

// --- Test definition types (parsed from .test.prmd frontmatter) ---

/** What the evaluator checks: the compiled prompt, the LLM response, or both */
export type EvaluateTarget = 'prompt' | 'response' | 'both';

export interface AssertionDef {
  evaluator: EvaluatorType;
  /** What to evaluate: 'prompt' (compiled input), 'response' (LLM output), or 'both'. Defaults to 'response'. */
  evaluate?: EvaluateTarget;
  // NLP fields
  check?: NlpCheck;
  value?: string | string[] | number;
  // Script fields
  run?: string;
  // Prmd fields — prompt: registry ref, local file, or omit to use content block
  prompt?: string;
  provider?: string;
  model?: string;
}

export interface TestCase {
  name: string;
  params: Record<string, unknown>;
  assert: AssertionDef[];
  expect_error?: boolean;
}

export interface TestSuite {
  name: string;
  description?: string;
  target: string;
  testFilePath: string;
  tests: TestCase[];
  evaluatorPrompt?: string;
}

// --- Test result types ---

export type TestStatus = 'pass' | 'fail' | 'error' | 'skip';
export type AssertionStatus = 'pass' | 'fail' | 'error' | 'skip';

export interface AssertionResult {
  evaluator: EvaluatorType;
  check?: string;
  status: AssertionStatus;
  reason?: string;
  duration: number;
}

export interface TestExecutionMetadata {
  provider: string;
  model: string;
  duration: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface TestResult {
  suite: string;
  testName: string;
  status: TestStatus;
  duration: number;
  assertions: AssertionResult[];
  output?: string;
  compiledInput?: string;
  error?: string;
  execution?: TestExecutionMetadata;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  duration: number;
  totalTokens?: number;
  providers?: string[];
  models?: string[];
}

export interface TestRunResult {
  suites: TestSuiteResult[];
  summary: TestRunSummary;
}

export interface TestSuiteResult {
  suite: string;
  testFilePath: string;
  results: TestResult[];
}

// --- Options ---

export interface TestRunOptions {
  evaluators?: EvaluatorType[];
  noLlm?: boolean;
  reporter?: 'console' | 'json' | 'junit';
  failFast?: boolean;
  runAll?: boolean;
  verbose?: boolean;
  workspaceRoot?: string;
  registryUrl?: string;
  // Default provider/model for test execution (overridden by .prmd frontmatter)
  provider?: string;
  model?: string;
  /** AbortSignal for cancelling a running test */
  signal?: AbortSignal;
}

// --- Progress callback ---

export type TestProgressEvent =
  | { type: 'suite_start'; suite: string; testCount: number }
  | { type: 'test_start'; suite: string; testName: string }
  | { type: 'test_complete'; suite: string; testName: string; result: TestResult }
  | { type: 'suite_complete'; suite: string; results: TestResult[] }
  | { type: 'assertion_complete'; suite: string; testName: string; assertion: AssertionResult };

export type TestProgressCallback = (event: TestProgressEvent) => void;
