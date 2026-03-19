/**
 * Prmd Evaluator - LLM-based evaluation via @prompd/cli.
 *
 * Modes:
 * - prompt: "@scope/pkg@version" -> uses a registry package as the evaluator
 * - prompt: "./path" -> uses a local .prmd file as the evaluator
 * - (no prompt field) -> uses the content block of the .test.prmd
 *
 * The evaluator prompt receives {{input}}, {{output}}, and {{params}} variables.
 * Response must start with PASS or FAIL.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { Evaluator, EvaluatorContext } from './types';
import type { AssertionDef, AssertionResult } from '../types';
import type { CompilerModule } from '../cli-types';

const PASS_FAIL_REGEX = /^(PASS|FAIL)[:\s]*(.*)/i;

export interface PrmdEvaluatorOptions {
  testFileDir: string;
  evaluatorPrompt?: string;
  workspaceRoot?: string;
  registryUrl?: string;
  cliModule?: CompilerModule;
  provider?: string;
  model?: string;
}

export class PrmdEvaluator implements Evaluator {
  readonly type = 'prmd';
  private options: PrmdEvaluatorOptions;
  private cliModule: CompilerModule | null = null;

  constructor(options: PrmdEvaluatorOptions) {
    this.options = options;
    if (options.cliModule) {
      this.cliModule = options.cliModule;
    }
  }

  async evaluate(assertion: AssertionDef, context: EvaluatorContext): Promise<AssertionResult> {
    const start = Date.now();

    try {
      const evaluatorContent = await this.resolveEvaluatorContent(assertion);
      console.log(`[PrmdEvaluator] Resolved evaluator content (${evaluatorContent?.length || 0} chars)`);
      if (evaluatorContent) {
        console.log(`[PrmdEvaluator]   source: ${assertion.prompt || 'content block'}`);
        console.log(`[PrmdEvaluator]   preview: ${evaluatorContent.substring(0, 150)}`);
      }

      if (!evaluatorContent) {
        return {
          evaluator: 'prmd',
          status: 'error',
          reason: 'Could not resolve evaluator prompt content',
          duration: Date.now() - start,
        };
      }

      // Compile the evaluator prompt with context as parameters
      const cli = await this.getCli();
      const compiled = await this.compileEvaluator(cli, evaluatorContent, context);

      console.log(`[PrmdEvaluator] Compiled evaluator (${compiled?.length || 0} chars): ${compiled?.substring(0, 150) || 'null'}`);

      if (!compiled) {
        return {
          evaluator: 'prmd',
          status: 'error',
          reason: 'Evaluator prompt compilation failed',
          duration: Date.now() - start,
        };
      }

      // Execute against LLM using callLLM directly (avoids executeRawText re-compilation)
      const executor = new cli.PrompdExecutor();

      // Resolve provider/model/apiKey — same logic as TestRunner
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configManager = (cli as any).ConfigManager?.getInstance
        ? (cli as any).ConfigManager.getInstance()
        : null;
      const config = configManager?.config || {};

      // Priority: assertion-level > run options (UI selector) > config defaults
      const provider = assertion.provider || this.options.provider || config.defaultProvider || 'openai';
      const rawModel = assertion.model || this.options.model || config.default_model || config.defaultModel || '';
      const model = rawModel || this.getDefaultModel(provider);
      const apiKey = configManager?.getApiKey?.(provider, config) || '';

      console.log(`[PrmdEvaluator] Executing: provider=${provider}, model=${model}`);

      if (!apiKey && provider !== 'ollama') {
        return {
          evaluator: 'prmd',
          status: 'error',
          reason: `No API key configured for provider "${provider}"`,
          duration: Date.now() - start,
        };
      }

      const execResult = await executor.callLLM(provider, model, compiled, apiKey);

      if (!execResult.success) {
        return {
          evaluator: 'prmd',
          status: 'error',
          reason: execResult.error || 'Evaluator LLM execution failed',
          duration: Date.now() - start,
        };
      }

      const response = execResult.response || execResult.content || '';
      if (!response) {
        return {
          evaluator: 'prmd',
          status: 'error',
          reason: 'No response from evaluator',
          duration: Date.now() - start,
        };
      }

      // Parse PASS/FAIL from response
      return this.parseEvaluatorResponse(response, Date.now() - start);
    } catch (err) {
      return {
        evaluator: 'prmd',
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      };
    }
  }

  private async resolveEvaluatorContent(assertion: AssertionDef): Promise<string | null> {
    // If prompt: is specified, resolve it (registry ref, local file)
    if (assertion.prompt) {
      return this.resolvePromptTarget(assertion.prompt);
    }

    // No prompt: field — use the content block of the .test.prmd
    return this.options.evaluatorPrompt || null;
  }

  private async resolvePromptTarget(prompt: string): Promise<string | null> {
    // Registry reference: @scope/package@version
    if (prompt.startsWith('@')) {
      return this.wrapAsInherits(prompt);
    }

    // Local file path
    const resolved = path.resolve(this.options.testFileDir, prompt);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Evaluator prompt file not found: ${resolved}`);
    }

    return fs.readFileSync(resolved, 'utf-8');
  }

  /**
   * Wrap a registry reference as a minimal .prmd that inherits from the evaluator package.
   * The compiler handles resolution, download, and caching.
   */
  private wrapAsInherits(registryRef: string): string {
    return [
      '---',
      `inherits: "${registryRef}"`,
      'parameters:',
      '  - name: prompt',
      '    type: string',
      '  - name: response',
      '    type: string',
      '  - name: params',
      '    type: string',
      '---',
      '',
    ].join('\n');
  }

  private async compileEvaluator(
    cli: CompilerModule,
    content: string,
    context: EvaluatorContext
  ): Promise<string | null> {
    // If content doesn't start with frontmatter, wrap it with minimal frontmatter
    // so the compiler can process it. Content blocks from .test.prmd are raw markdown.
    let prmdContent = content;
    if (!content.trimStart().startsWith('---')) {
      prmdContent = [
        '---',
        'id: evaluator',
        'name: "Test Evaluator"',
        'version: 0.0.1',
        'parameters:',
        '  - name: prompt',
        '    type: string',
        '  - name: response',
        '    type: string',
        '  - name: params',
        '    type: object',
        '---',
        '',
        content,
      ].join('\n');
    }

    const memFs = new cli.MemoryFileSystem({ '/evaluator.prmd': prmdContent });
    const compiler = new cli.PrompdCompiler();

    // Inject evaluation context as template variables
    const parameters: Record<string, string> = {
      prompt: context.prompt,
      response: context.response,
      params: JSON.stringify(context.params, null, 2),
    };

    // Also expose individual params via dot notation
    for (const [key, value] of Object.entries(context.params)) {
      parameters[`params.${key}`] = String(value);
    }

    const result = await compiler.compile('/evaluator.prmd', {
      outputFormat: 'markdown',
      parameters,
      fileSystem: memFs,
      workspaceRoot: this.options.workspaceRoot,
      registryUrl: this.options.registryUrl,
    });

    // CLI compile() may return a string directly or an object
    if (typeof result === 'string') {
      return result || null;
    }
    return result.output || null;
  }

  private parseEvaluatorResponse(response: string, duration: number): AssertionResult {
    const firstLine = response.trim().split('\n')[0];
    const match = firstLine.match(PASS_FAIL_REGEX);

    if (!match) {
      return {
        evaluator: 'prmd',
        status: 'error',
        reason: `Evaluator response did not start with PASS or FAIL. Got: "${firstLine.substring(0, 100)}"`,
        duration,
      };
    }

    const verdict = match[1].toUpperCase();
    const reason = match[2]?.trim() || undefined;

    return {
      evaluator: 'prmd',
      status: verdict === 'PASS' ? 'pass' : 'fail',
      reason: reason || `Evaluator returned ${verdict}`,
      duration,
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
        '@prompd/cli module not provided. Pass it via PrmdEvaluatorOptions.cliModule'
      );
    }
    return this.cliModule;
  }
}
