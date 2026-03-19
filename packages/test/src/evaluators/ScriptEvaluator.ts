/**
 * Script Evaluator - runs external scripts with stdin/stdout contract.
 *
 * Contract:
 * - Receives JSON on stdin: { input, output, params, metadata }
 * - Exit code 0 = PASS, 1 = FAIL, other = ERROR
 * - Stdout = reason (optional)
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { Evaluator, EvaluatorContext } from './types';
import type { AssertionDef, AssertionResult } from '../types';

const SCRIPT_TIMEOUT_MS = 30_000;

export class ScriptEvaluator implements Evaluator {
  readonly type = 'script';
  private testFileDir: string;

  constructor(testFileDir: string) {
    this.testFileDir = testFileDir;
  }

  async evaluate(assertion: AssertionDef, context: EvaluatorContext): Promise<AssertionResult> {
    const start = Date.now();
    const scriptPath = assertion.run;

    if (!scriptPath) {
      return {
        evaluator: 'script',
        status: 'error',
        reason: 'No "run" path specified for script evaluator',
        duration: Date.now() - start,
      };
    }

    const resolvedPath = path.resolve(this.testFileDir, scriptPath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        evaluator: 'script',
        status: 'error',
        reason: `Script not found: ${resolvedPath}`,
        duration: Date.now() - start,
      };
    }

    // Validate script stays within the test file's directory tree
    const normalizedScript = path.normalize(resolvedPath);
    const normalizedBase = path.normalize(this.testFileDir);
    if (!normalizedScript.startsWith(normalizedBase)) {
      return {
        evaluator: 'script',
        status: 'error',
        reason: `Script path escapes test directory: ${scriptPath}`,
        duration: Date.now() - start,
      };
    }

    try {
      const result = await this.runScript(resolvedPath, context);
      return {
        evaluator: 'script',
        status: result.exitCode === 0 ? 'pass' : 'fail',
        reason: result.stdout.trim() || (result.exitCode === 0 ? 'Script passed' : 'Script failed'),
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        evaluator: 'script',
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      };
    }
  }

  private runScript(
    scriptPath: string,
    context: EvaluatorContext
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const { command, args } = this.getRunner(scriptPath);
      const child = spawn(command, args, {
        cwd: this.testFileDir,
        timeout: SCRIPT_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn script: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code === null) {
          reject(new Error('Script process was killed (timeout or signal)'));
          return;
        }
        resolve({ exitCode: code, stdout, stderr });
      });

      // Send context as JSON on stdin
      const payload = JSON.stringify({
        prompt: context.prompt,
        response: context.response,
        params: context.params,
        metadata: context.metadata,
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  }

  private getRunner(scriptPath: string): { command: string; args: string[] } {
    const ext = path.extname(scriptPath).toLowerCase();

    switch (ext) {
      case '.ts':
        return { command: 'npx', args: ['tsx', scriptPath] };
      case '.js':
      case '.mjs':
        return { command: 'node', args: [scriptPath] };
      case '.py':
        return { command: 'python', args: [scriptPath] };
      case '.sh':
        return { command: 'bash', args: [scriptPath] };
      case '.ps1':
        return { command: 'powershell', args: ['-File', scriptPath] };
      default:
        // For unknown extensions, try running directly (relies on shebang or OS association)
        return { command: scriptPath, args: [] };
    }
  }
}
