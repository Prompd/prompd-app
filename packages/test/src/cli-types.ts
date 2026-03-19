/**
 * Shared type interfaces for dynamically imported @prompd/cli module.
 * These mirror the CLI's public API without requiring a compile-time dependency.
 */

export interface CompilerModule {
  PrompdCompiler: new (config?: Record<string, unknown>) => Compiler;
  PrompdExecutor: new () => Executor;
  ConfigManager: new () => ConfigManagerInstance;
  MemoryFileSystem: new (files?: Record<string, string>) => MemoryFileSystemInstance;
  NodeFileSystem: new () => NodeFileSystemInstance;
}

export interface Compiler {
  compile(
    sourcePath: string,
    options: Record<string, unknown>
  ): Promise<string | {
    output?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }>;

  compileWithContext(
    sourcePath: string,
    options: Record<string, unknown>
  ): Promise<string | {
    compiledResult?: string;
    metadata?: Record<string, unknown>;
    errors?: unknown[];
    warnings?: unknown[];
  }>;
}

export interface Executor {
  execute(
    filePath: string,
    options: Record<string, unknown>
  ): Promise<ExecutorResult>;

  executeRawText(
    compiledText: string,
    options: Record<string, unknown>
  ): Promise<ExecutorResult>;

  callLLM(
    provider: string,
    model: string,
    content: string,
    apiKey: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<{
    success: boolean;
    response?: string;
    content?: string;
    error?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }>;
}

export interface ExecutorResult {
  response?: string;
  error?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: {
    provider?: string;
    model?: string;
  };
}

export interface MemoryFileSystemInstance {
  // In-memory file system for compilation without disk access
}

export interface NodeFileSystemInstance {
  // Disk-backed file system for compilation with file access
}

export interface ConfigManagerInstance {
  loadConfig?(): void;
  load?(): void;
  getConfig?(): Record<string, unknown> | null;
}
