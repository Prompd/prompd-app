/**
 * IntelliSense for Prompd editor
 *
 * This file re-exports from the modular intellisense/ directory.
 * The functionality has been split into separate files for maintainability:
 *
 * - intellisense/types.ts - Type definitions
 * - intellisense/context.ts - Context detection for completions
 * - intellisense/completions.ts - Completion provider
 * - intellisense/hover.ts - Hover provider
 * - intellisense/validation.ts - Validation and diagnostics
 * - intellisense/codeActions.ts - Quick fix code actions
 * - intellisense/filters.ts - Jinja2/Nunjucks filter definitions
 * - intellisense/utils.ts - Helper functions
 * - intellisense/index.ts - Main entry point
 */

// Re-export everything from the modular structure
export {
  setupIntelliSense,
  triggerValidation,
  triggerValidationForAllModels,
  setCurrentFilePath,
  setModelFilePath,
  setWorkspacePath,
  ALL_FILTERS,
  PROMPD_FILTERS,
  NUNJUCKS_BUILTIN_FILTERS,
  // Env vars cache for intellisense
  setEnvVarsCache,
  getEnvVarsCache,
  clearEnvVarsCache,
  // Provider/model hints for frontmatter completions
  setProviderModelHints
} from './intellisense/index'

// Re-export types
export type {
  Context,
  HoverContext,
  ExtractedParameters,
  ParameterMetadata,
  FilterDefinition
} from './intellisense/types'
