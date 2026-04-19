/**
 * Discovers .test.prmd files and pairs them with their source .prmd files.
 */

import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { TestParser } from './TestParser';
import type { TestSuite } from './types';

export interface DiscoveryResult {
  suites: TestSuite[];
  errors: DiscoveryError[];
}

export interface DiscoveryError {
  filePath: string;
  message: string;
}

export class TestDiscovery {
  private parser: TestParser;

  constructor() {
    this.parser = new TestParser();
  }

  /**
   * Discover test suites from a target path.
   *
   * - If targetPath is a .test.prmd file, parse it directly.
   * - If targetPath is a .prmd file, look for a colocated .test.prmd sidecar.
   * - If targetPath is a directory, glob for all .test.prmd files recursively.
   */
  async discover(targetPath: string): Promise<DiscoveryResult> {
    const resolved = path.resolve(targetPath);
    const suites: TestSuite[] = [];
    const errors: DiscoveryError[] = [];

    if (!fs.existsSync(resolved)) {
      errors.push({ filePath: resolved, message: 'Path does not exist' });
      return { suites, errors };
    }

    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      return this.discoverDirectory(resolved);
    }

    if (resolved.endsWith('.test.prmd')) {
      return this.discoverTestFile(resolved);
    }

    if (resolved.endsWith('.prmd')) {
      return this.discoverFromSource(resolved);
    }

    errors.push({
      filePath: resolved,
      message: 'Target must be a .prmd file, .test.prmd file, or directory',
    });
    return { suites, errors };
  }

  private async discoverDirectory(dirPath: string): Promise<DiscoveryResult> {
    const suites: TestSuite[] = [];
    const errors: DiscoveryError[] = [];

    const pattern = '**/*.test.prmd';
    const testFiles = await glob(pattern, {
      cwd: dirPath,
      absolute: true,
      nodir: true,
      windowsPathsNoEscape: true,
    });

    for (const testFile of testFiles) {
      const normalized = testFile.replace(/\\/g, '/');
      const result = await this.discoverTestFile(normalized);
      suites.push(...result.suites);
      errors.push(...result.errors);
    }

    return { suites, errors };
  }

  private async discoverTestFile(testFilePath: string): Promise<DiscoveryResult> {
    const suites: TestSuite[] = [];
    const errors: DiscoveryError[] = [];

    try {
      const content = fs.readFileSync(testFilePath, 'utf-8');
      const suite = this.parser.parse(content, testFilePath);

      // Validate that the target .prmd file exists
      if (!fs.existsSync(suite.target)) {
        errors.push({
          filePath: testFilePath,
          message: `Target prompt file not found: ${suite.target}`,
        });
        return { suites, errors };
      }

      suites.push(suite);
    } catch (err) {
      errors.push({
        filePath: testFilePath,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return { suites, errors };
  }

  private async discoverFromSource(sourcePath: string): Promise<DiscoveryResult> {
    const dir = path.dirname(sourcePath);
    const base = path.basename(sourcePath, '.prmd');
    const testFilePath = path.join(dir, `${base}.test.prmd`);

    if (!fs.existsSync(testFilePath)) {
      return {
        suites: [],
        errors: [{
          filePath: sourcePath,
          message: `No colocated test file found: ${testFilePath}`,
        }],
      };
    }

    return this.discoverTestFile(testFilePath);
  }
}
