/**
 * TestRunner - orchestrates the full test lifecycle:
 * discovery -> compile -> execute -> evaluate -> report
 *
 * Consumes @prompd/cli for compilation and execution.
 * This is the primary public API for @prompd/test.
 */

import * as path from 'path';
import * as fs from 'fs';
import { TestDiscovery } from './TestDiscovery';
import { EvaluatorEngine } from './EvaluatorEngine';
import { ConsoleReporter } from './reporters/ConsoleReporter';
import { JsonReporter } from './reporters/JsonReporter';
import { JunitReporter } from './reporters/JunitReporter';
import type { Reporter } from './reporters/types';
import type { EvaluatorContext } from './evaluators/types';
import type { CompilerModule } from './cli-types';
import type { TestHarness } from '@prompd/cli';
import type {
  TestSuite,
  TestCase,
  TestResult,
  TestRunResult,
  TestSuiteResult,
  TestRunSummary,
  TestRunOptions,
  TestProgressCallback,
  EvaluatorType,
} from './types';

export class TestRunner implements TestHarness {
  private discovery: TestDiscovery;
  private cliModule: CompilerModule | null = null;
  private configLoaded = false;

  /**
   * @param cli - Optional pre-loaded @prompd/cli module. If provided, skips dynamic import.
   *              This is the recommended approach when running inside Electron where the CLI
   *              is already loaded by the main process.
   */
  constructor(cli?: CompilerModule) {
    this.discovery = new TestDiscovery();
    if (cli) {
      this.cliModule = cli;
    }
  }

  /**
   * Ensure CLI config is loaded (API keys, provider settings).
   * Called once before any execution.
   */
  private async ensureConfig(): Promise<void> {
    if (this.configLoaded) return;
    const cli = await this.getCli();
    try {
      const configManager = new cli.ConfigManager();
      console.log('[TestRunner] Loading config...');
      // loadConfig() is async — must await it
      if (configManager.loadConfig) {
        await configManager.loadConfig();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = (configManager as any).config;
        console.log('[TestRunner] Config loaded:', cfg ? Object.keys(cfg) : 'null');
        console.log('[TestRunner] API keys:', cfg?.apiKeys ? Object.keys(cfg.apiKeys).filter((k: string) => cfg.apiKeys[k]) : 'none');
        console.log('[TestRunner] Default provider:', cfg?.defaultProvider);
      } else if (configManager.load) {
        await configManager.load();
        console.log('[TestRunner] Config loaded via load()');
      }
      this.configLoaded = true;
    } catch (err) {
      console.error('[TestRunner] Config load failed:', err);
      // Config may not exist — that's OK for --no-llm runs
    }
  }

  /**
   * Run tests for a target path (file or directory).
   * Returns structured results and an exit code (0 = all pass, 1 = failures).
   */
  async run(
    targetPath: string,
    options: TestRunOptions = {},
    onProgress?: TestProgressCallback
  ): Promise<TestRunResult> {
    const startTime = Date.now();

    // 1. Discovery
    const { suites, errors: discoveryErrors } = await this.discovery.discover(targetPath);

    if (discoveryErrors.length > 0 && suites.length === 0) {
      return this.buildErrorResult(discoveryErrors.map(e => e.message), startTime);
    }

    // 2. Run each suite
    const suiteResults: TestSuiteResult[] = [];

    for (const suite of suites) {
      onProgress?.({ type: 'suite_start', suite: suite.name, testCount: suite.tests.length });

      const results = await this.runSuite(suite, options, onProgress);
      suiteResults.push({
        suite: suite.name,
        testFilePath: suite.testFilePath,
        results,
      });

      onProgress?.({ type: 'suite_complete', suite: suite.name, results });
    }

    // 3. Build summary
    const summary = this.buildSummary(suiteResults, startTime);

    return { suites: suiteResults, summary };
  }

  /**
   * Run tests and return formatted output string.
   */
  async runAndReport(
    targetPath: string,
    options: TestRunOptions = {},
    onProgress?: TestProgressCallback
  ): Promise<{ output: string; exitCode: number }> {
    const result = await this.run(targetPath, options, onProgress);
    const reporter = this.getReporter(options);
    const output = reporter.report(result);
    const exitCode = (result.summary.failed > 0 || result.summary.errors > 0) ? 1 : 0;
    return { output, exitCode };
  }

  private async runSuite(
    suite: TestSuite,
    options: TestRunOptions,
    onProgress?: TestProgressCallback
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const allowedEvaluators = this.resolveAllowedEvaluators(options);

    for (const testCase of suite.tests) {
      onProgress?.({ type: 'test_start', suite: suite.name, testName: testCase.name });

      const result = await this.runTestCase(suite, testCase, allowedEvaluators, options, onProgress);
      results.push(result);

      onProgress?.({ type: 'test_complete', suite: suite.name, testName: testCase.name, result });
    }

    return results;
  }

  private async runTestCase(
    suite: TestSuite,
    testCase: TestCase,
    allowedEvaluators: EvaluatorType[],
    options: TestRunOptions,
    onProgress?: TestProgressCallback
  ): Promise<TestResult> {
    const start = Date.now();

    // Step 1: Compile the target .prmd with test params
    let compiledOutput: string;
    let promptMetadata: Record<string, unknown> = {};
    try {
      const compileResult = await this.compileTarget(suite.target, testCase.params, options);
      compiledOutput = compileResult.compiled;
      promptMetadata = compileResult.metadata;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // If expect_error is set, compilation failure is a PASS
      if (testCase.expect_error) {
        return {
          suite: suite.name,
          testName: testCase.name,
          status: 'pass',
          duration: Date.now() - start,
          assertions: [],
          error: `Expected error occurred: ${errorMessage}`,
        };
      }

      return {
        suite: suite.name,
        testName: testCase.name,
        status: 'error',
        duration: Date.now() - start,
        assertions: [],
        error: `Compilation failed: ${errorMessage}`,
      };
    }

    // If expect_error was set but compilation succeeded, that's a failure
    if (testCase.expect_error) {
      return {
        suite: suite.name,
        testName: testCase.name,
        status: 'fail',
        duration: Date.now() - start,
        assertions: [],
        compiledInput: compiledOutput,
        error: 'Expected compilation to fail, but it succeeded',
      };
    }

    // Step 2: Execute against LLM (unless --no-llm)
    let llmOutput = '';
    let provider = 'none';
    let model = 'none';
    let execDuration = 0;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    if (!options.noLlm) {
      try {
        const execResult = await this.executePrompt(compiledOutput, promptMetadata, options);
        llmOutput = execResult.response;
        provider = execResult.provider;
        model = execResult.model;
        execDuration = execResult.duration;
        usage = execResult.usage;
      } catch (err) {
        return {
          suite: suite.name,
          testName: testCase.name,
          status: 'error',
          duration: Date.now() - start,
          assertions: [],
          compiledInput: compiledOutput,
          error: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } else {
      // In --no-llm mode, use the compiled output as the "output" for NLP checks
      // This enables structural assertions against the compiled prompt itself
      llmOutput = compiledOutput;
    }

    const execution = !options.noLlm ? { provider, model, duration: execDuration, usage } : undefined;

    // Step 3: Run evaluations
    if (testCase.assert.length === 0) {
      return {
        suite: suite.name,
        testName: testCase.name,
        status: 'pass',
        duration: Date.now() - start,
        assertions: [],
        output: llmOutput,
        compiledInput: compiledOutput,
        execution,
      };
    }

    const engine = new EvaluatorEngine({
      testFileDir: path.dirname(suite.testFilePath),
      evaluatorPrompt: suite.evaluatorPrompt,
      workspaceRoot: options.workspaceRoot,
      registryUrl: options.registryUrl,
      allowedEvaluators,
      failFast: options.runAll ? false : (options.failFast !== false),
      cliModule: this.cliModule || undefined,
      provider: options.provider,
      model: options.model,
    });

    const context: EvaluatorContext = {
      prompt: compiledOutput,
      response: llmOutput,
      params: testCase.params,
      metadata: { provider, model, duration: execDuration },
    };

    const assertions = await engine.evaluate(
      testCase.assert,
      context,
      (assertion) => {
        onProgress?.({
          type: 'assertion_complete',
          suite: suite.name,
          testName: testCase.name,
          assertion,
        });
      }
    );

    // Determine overall test status from assertions
    const hasFailure = assertions.some(a => a.status === 'fail');
    const hasError = assertions.some(a => a.status === 'error');
    const status = hasError ? 'error' : hasFailure ? 'fail' : 'pass';

    return {
      suite: suite.name,
      testName: testCase.name,
      status,
      duration: Date.now() - start,
      assertions,
      output: llmOutput,
      compiledInput: compiledOutput,
      execution,
    };
  }

  /**
   * Compile a .prmd file and return both the compiled text and metadata
   * (provider, model, temperature, max_tokens from frontmatter).
   */
  private async compileTarget(
    targetPath: string,
    params: Record<string, unknown>,
    options: TestRunOptions
  ): Promise<{ compiled: string; metadata: Record<string, unknown> }> {
    const cli = await this.getCli();
    const compiler = new cli.PrompdCompiler();

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Target prompt file not found: ${targetPath}`);
    }

    // Use compileWithContext to get both output and frontmatter metadata
    const context = await compiler.compileWithContext(targetPath, {
      outputFormat: 'markdown',
      parameters: params,
      filePath: targetPath,
      workspaceRoot: options.workspaceRoot,
      registryUrl: options.registryUrl,
      fileSystem: new cli.NodeFileSystem(),
    });

    // compileWithContext may return { compiledResult, metadata } or a string
    let compiled: string;
    let metadata: Record<string, unknown> = {};

    if (typeof context === 'string') {
      compiled = context;
    } else if (context && typeof context === 'object') {
      compiled = (context as { compiledResult?: string }).compiledResult || '';
      metadata = (context as { metadata?: Record<string, unknown> }).metadata || {};
    } else {
      throw new Error('Compilation produced no output');
    }

    if (!compiled) {
      throw new Error('Compilation produced no output');
    }

    console.log(`[TestRunner] Compiled ${targetPath}`);
    console.log(`[TestRunner]   params: ${JSON.stringify(params)}`);
    console.log(`[TestRunner]   metadata: ${JSON.stringify(metadata)}`);
    console.log(`[TestRunner]   output (${compiled.length} chars): ${compiled.substring(0, 200)}`);

    return { compiled, metadata };
  }

  /**
   * Execute compiled prompt text against an LLM using the executor's callLLM directly.
   * This avoids re-compilation through executeRawText which loses metadata.
   */
  private async executePrompt(
    compiled: string,
    metadata: Record<string, unknown>,
    runOptions: TestRunOptions
  ): Promise<{ response: string; provider: string; model: string; duration: number; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
    await this.ensureConfig();
    const cli = await this.getCli();
    const executor = new cli.PrompdExecutor();
    const start = Date.now();

    // Resolve provider/model from frontmatter metadata + config defaults
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configManager = (cli as any).ConfigManager?.getInstance
      ? (cli as any).ConfigManager.getInstance()
      : null;
    const config = configManager?.config || {};

    // Priority: .prmd frontmatter > test run options (UI selector) > config defaults
    const provider = String(metadata.provider || runOptions.provider || config.defaultProvider || 'openai');
    const rawModel = metadata.model || runOptions.model || config.default_model || config.defaultModel || '';
    // Fall back to a sensible default model if none specified
    const model = String(rawModel) || this.getDefaultModel(provider);
    const temperature = Number(metadata.temperature ?? 0.7);
    const maxTokens = Number(metadata.max_tokens ?? 4096);

    // Get API key from config
    const apiKey = configManager?.getApiKey?.(provider, config) || '';

    console.log(`[TestRunner] Executing: provider=${provider}, model=${model || '(default)'}, tokens=${compiled.length}`);

    if (!apiKey && provider !== 'ollama') {
      throw new Error(`No API key configured for provider "${provider}". Check ~/.prompd/config.yaml`);
    }

    try {
      const result = await executor.callLLM(provider, model, compiled, apiKey, temperature, maxTokens);

      if (!result.success) {
        throw new Error(result.error || 'LLM execution failed');
      }

      return {
        response: result.response || result.content || '',
        provider,
        model,
        duration: Date.now() - start,
        usage: result.usage,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TestRunner] callLLM failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }

  private resolveAllowedEvaluators(options: TestRunOptions): EvaluatorType[] {
    if (options.noLlm) {
      // In --no-llm mode, skip prmd evaluators (they require LLM calls)
      const base = options.evaluators || ['nlp', 'script'];
      return base.filter(e => e !== 'prmd');
    }

    return options.evaluators || ['nlp', 'script', 'prmd'];
  }

  private getReporter(options: TestRunOptions): Reporter {
    switch (options.reporter) {
      case 'json':
        return new JsonReporter(options.verbose);
      case 'junit':
        return new JunitReporter();
      case 'console':
      default:
        return new ConsoleReporter(options.verbose);
    }
  }

  private buildSummary(suiteResults: TestSuiteResult[], startTime: number): TestRunSummary {
    let total = 0;
    let passed = 0;
    let failed = 0;
    let errors = 0;
    let skipped = 0;
    let totalTokens = 0;
    const providerSet = new Set<string>();
    const modelSet = new Set<string>();

    for (const suite of suiteResults) {
      for (const result of suite.results) {
        total++;
        switch (result.status) {
          case 'pass': passed++; break;
          case 'fail': failed++; break;
          case 'error': errors++; break;
          case 'skip': skipped++; break;
        }
        if (result.execution) {
          if (result.execution.provider && result.execution.provider !== 'none') {
            providerSet.add(result.execution.provider);
          }
          if (result.execution.model && result.execution.model !== 'none') {
            modelSet.add(result.execution.model);
          }
          if (result.execution.usage?.totalTokens) {
            totalTokens += result.execution.usage.totalTokens;
          }
        }
      }
    }

    return {
      total,
      passed,
      failed,
      errors,
      skipped,
      duration: Date.now() - startTime,
      totalTokens: totalTokens || undefined,
      providers: providerSet.size > 0 ? Array.from(providerSet) : undefined,
      models: modelSet.size > 0 ? Array.from(modelSet) : undefined,
    };
  }

  private buildErrorResult(errorMessages: string[], startTime: number): TestRunResult {
    return {
      suites: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: errorMessages.length,
        skipped: 0,
        duration: Date.now() - startTime,
      },
    };
  }

  private getDefaultModel(provider: string): string {
    const defaults: Record<string, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-sonnet-4-20250514',
      groq: 'llama-3.1-70b-versatile',
      google: 'gemini-2.0-flash',
      mistral: 'mistral-large-latest',
      deepseek: 'deepseek-chat',
    };
    return defaults[provider.toLowerCase()] || 'gpt-4o';
  }

  private async getCli(): Promise<CompilerModule> {
    if (!this.cliModule) {
      throw new Error(
        '@prompd/cli module not provided. Pass it to the TestRunner constructor: new TestRunner(cliModule)'
      );
    }
    return this.cliModule;
  }
}
