/**
 * IntelliSense module for Prompd editor
 *
 * This module provides:
 * - Completion suggestions for packages, parameters, filters, etc.
 * - Hover information for packages and variables
 * - Validation diagnostics with quick fixes
 * - Code actions for auto-fixing common issues
 */
import type * as monacoEditor from 'monaco-editor'
import { registerSnippets, registerMarkdownAutoClose } from '../snippets'
import { registerCompletionProvider } from './completions'
import { registerHoverProvider, registerSignatureHelpProvider } from './hover'
import { registerCodeActionProvider } from './codeActions'
import { registerValidationListeners, validateModel, setCurrentFilePath, enableCompilerDiagnostics } from './validation'

// Re-export types
export * from './types'
export { setCurrentFilePath, enableCompilerDiagnostics } from './validation'
export { ALL_FILTERS, PROMPD_FILTERS, NUNJUCKS_BUILTIN_FILTERS } from './filters'

// Re-export new IntelliSense enhancements
export {
  getRegistrySync,
  initializeRegistrySync,
  cleanupRegistrySync,
  type PackageStatus,
  type RegistrySyncOptions
} from './registrySync'

export {
  analyzeParameterUsage,
  extractParameterDefinitions,
  extractParameterReferences,
  getParameterUsageStats,
  type ParameterUsageDiagnostic,
  type ParameterDefinition,
  type ParameterReference
} from './crossReference'

export {
  detectPatterns,
  getSuggestedParameters,
  getDetectedCategories,
  PROMPT_PATTERNS,
  type PatternSuggestion
} from './promptPatterns'

// Guard to ensure we only register IntelliSense once
// Use window property to survive HMR (Hot Module Replacement) in development
const INTELLISENSE_REGISTERED_KEY = '__PROMPD_INTELLISENSE_REGISTERED__'

// Store a reference to the validation function so it can be called externally
let validateModelFn: ((model: monacoEditor.editor.ITextModel) => Promise<void>) | null = null
let monacoInstance: typeof monacoEditor | null = null

// Store model validation disposables
const modelValidationDisposables = new Map<string, monacoEditor.IDisposable>()

// Re-export env cache functions
export { setEnvVarsCache, getEnvVarsCache, clearEnvVarsCache } from './envCache'


/**
 * Manually trigger validation for a specific model.
 * Call this from editor onMount to ensure validation runs.
 * @param model The Monaco text model to validate
 * @param force If true, validates regardless of language ID (use when you know it's a .prmd file)
 */
export function triggerValidation(model: monacoEditor.editor.ITextModel, force = false): void {
  console.log('[intellisense] triggerValidation called for model:', model.uri.toString(), 'language:', model.getLanguageId(), 'force:', force)
  if (validateModelFn) {
    // If force=true, validate regardless of language ID
    // This handles cases where Monaco creates models with 'markdown' before language is set to 'prompd'
    if (force || model.getLanguageId() === 'prompd') {
      console.log('[intellisense] Triggering validation (force:', force, ')')
      validateModelFn(model)
    } else {
      console.log('[intellisense] Skipping - language is not prompd and force is false')
    }
  } else {
    console.log('[intellisense] validateModelFn not yet assigned')
  }
}

/**
 * Manually trigger validation for all prompd models.
 * Useful when IntelliSense is registered after models are created.
 */
export function triggerValidationForAllModels(): void {
  console.log('[intellisense] triggerValidationForAllModels called')
  if (!monacoInstance) {
    console.log('[intellisense] No monaco instance available')
    return
  }
  const models = monacoInstance.editor.getModels()
  console.log('[intellisense] Found', models.length, 'models')
  models.forEach(model => {
    console.log('[intellisense] Checking model:', model.uri.toString(), 'language:', model.getLanguageId())
    if (model.getLanguageId() === 'prompd') {
      console.log('[intellisense] Triggering validation for:', model.uri.toString())
      validateModelFn?.(model)
    }
  })
}

/**
 * Setup IntelliSense for the Prompd language
 */
export function setupIntelliSense(monaco: typeof monacoEditor): void {
  const LANGUAGE_ID = 'prompd'

  // Store monaco instance for external validation triggers
  monacoInstance = monaco

  // Only register once globally (use window property to survive HMR)
  if ((window as unknown as Record<string, boolean>)[INTELLISENSE_REGISTERED_KEY]) {
    console.log('[IntelliSense] Already registered, skipping')
    return
  }

  console.log('[IntelliSense] Registering Prompd IntelliSense providers...')
  ;(window as unknown as Record<string, boolean>)[INTELLISENSE_REGISTERED_KEY] = true

  // Register code snippets
  registerSnippets(monaco, LANGUAGE_ID)
  registerMarkdownAutoClose(monaco, LANGUAGE_ID)

  // Register completion item provider
  registerCompletionProvider(monaco, LANGUAGE_ID)

  // Register hover provider
  registerHoverProvider(monaco, LANGUAGE_ID)

  // Register signature help provider
  registerSignatureHelpProvider(monaco, LANGUAGE_ID)

  // Register code action provider for quick-fixes
  registerCodeActionProvider(monaco, LANGUAGE_ID)

  // Register validation listeners
  registerValidationListeners(monaco, LANGUAGE_ID, modelValidationDisposables)

  // Store reference to validateModel for external triggers
  validateModelFn = (model: monacoEditor.editor.ITextModel) => validateModel(monaco, model)
  console.log('[intellisense] validateModelFn assigned, ready for external triggers')

  // Enable compiler diagnostics after Monaco is fully initialized
  // This prevents the UI from freezing during initial load
  setTimeout(() => {
    enableCompilerDiagnostics()
    // Re-validate all prompd models now that compiler diagnostics are enabled
    const models = monaco.editor.getModels()
    models.forEach(model => {
      if (model.getLanguageId() === LANGUAGE_ID && !model.isDisposed()) {
        console.log('[intellisense] Re-validating with compiler diagnostics:', model.uri.toString())
        validateModel(monaco, model)
      }
    })
  }, 2000) // Wait 2 seconds after registration to enable compiler diagnostics
}
