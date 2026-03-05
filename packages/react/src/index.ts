// Types
export * from './types'

// Context & Provider
export {
  PrompdProvider,
  usePrompd,
  usePrompdLLMClient,
  usePrompdResultDisplay,
  usePrompdEditor,
  usePrompdMode,
  usePrompdTheme
} from './context/PrompdContext'

// Components
export { PrompdChat } from './components/PrompdChat'
export { PrompdChatInput } from './components/PrompdChatInput'
export { PrompdMessages } from './components/PrompdMessages'
export { PrompdModeDropdown } from './components/PrompdModeDropdown'
export { PrompdContextArea } from './components/PrompdContextArea'
export { PrompdPackageSelector } from './components/PrompdPackageSelector'
export { PrompdResultModal } from './components/PrompdResultModal'
export { PrompdProviderSelector, defaultProviders, type LLMProviderOption, type PrompdProviderSelectorProps } from './components/PrompdProviderSelector'
export { FileTreeView, type FileNode } from './components/PrompdFileTree'
export { PrompdMetadata, type PrompdMetadataProps } from './components/PrompdMetadata'
export { PrompdPinnedPackage, type PrompdPinnedPackageProps, type PinnedPrompdPackage } from './components/PrompdPinnedPackage'
export { PrompdParameterList, type PrompdParameterListProps, type PrompdParameter } from './components/PrompdParameterList'

// Individual parameter components for custom implementations
export {
  AdaptiveParameterList,
  validateRequiredParameters,
  ArrayPillInput,
  StringInput,
  NumberInput,
  BooleanInput,
  EnumInput,
  TextInput,
  ObjectInput,
  FileInput,
  type FileValue,
  JsonInput,
  Base64Input,
  JwtInput,
  ParameterCard,
} from './components/parameters'
export { PrompdExecutionResult, type PrompdExecutionResultProps, type PrompdExecutionResultData } from './components/PrompdExecutionResult'
export { PrompdPackageSuggestionMessage, type PrompdPackageSuggestionMessageProps, type PrompdPackageRecommendation } from './components/PrompdPackageSuggestionMessage'
export { PrompdAddSectionModal, type PrompdAddSectionModalProps } from './components/PrompdAddSectionModal'
export { PrompdResetButton, type PrompdResetButtonProps } from './components/PrompdResetButton'
export { PromptBrowserDialog, type PromptBrowserDialogProps } from './components/PromptBrowserDialog'
export { PromptSwitchConfirmDialog, type PromptSwitchConfirmDialogProps } from './components/PromptSwitchConfirmDialog'
export { PrompdMultiProviderSelector, defaultMultiProviders, type ProviderOption, type PrompdMultiProviderSelectorProps } from './components/PrompdMultiProviderSelector'
export { PrompdComparisonResults, type ProviderResult, type ComparisonMetadata, type PrompdComparisonResultsProps } from './components/PrompdComparisonResults'
export { MarkdownChatMessage } from './components/MarkdownChatMessage'
export { ProviderSelectionDialog, providerGroups, type ModelOption, type ProviderGroup, type ProviderSelectionDialogProps } from './components/ProviderSelectionDialog'
export {
  PrompdUsageTracker,
  calculateUsageStats,
  createUsageEvent,
  type UsageEvent,
  type UsageEventType,
  type UsageStats,
  type PrompdUsageTrackerProps
} from './components/PrompdUsageTracker'

// Hooks
export {
  usePrompdChat,
  usePrompdIntelligentChat,
  usePrompdOrchestration,
  usePrompdSession,
  usePrompdPackage,
  usePrompdUsage,
  type UsePrompdUsageOptions,
  type UsePrompdUsageReturn
} from './hooks'

// Clients & Displays
export { DefaultLLMClient } from './clients/DefaultLLMClient'
export { DefaultResultDisplay } from './displays/DefaultResultDisplay'

// Constants
export { STANDARD_SECTIONS, getSectionDefinition, getAvailableSections, allowsMultipleFiles, type SectionDefinition } from './constants/sections'
export { CHAT_MODES, getChatMode, getAvailableChatModes, getChatModesArray, type ChatModeDefinition } from './constants/chatModes'
export {
  MODEL_PRICING,
  getModelPricing,
  calculateCost,
  formatCost,
  formatTokens,
  type ModelPricing,
  type ModelPricingEntry
} from './constants/pricing'

// Compaction
export * from './compaction'

// Utils
export { highlightPrompd, SYNTAX_COLORS } from './utils/syntax-highlighter'
export { PackageCache, packageCache, type PackageCacheOptions, type Prompt, type PackageFile } from './utils/PackageCache'

// Styles
import './styles.css'
