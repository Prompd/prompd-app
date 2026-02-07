/**
 * @prompd/scheduler - Workflow deployment and trigger management
 *
 * Main exports for the scheduler package
 */

export { DeploymentService } from './DeploymentService'
export { TriggerManager } from './TriggerManager'
export { DeploymentDependencyResolver } from './DeploymentDependencyResolver'
export type { ResolvedDependency, DependencyResolutionResult } from './DeploymentDependencyResolver'
export {
  DeploymentDatabase,
  DeploymentDB,
  TriggerDB,
  DeploymentExecutionDB,
  initializeDeploymentDatabase,
  getDefaultDbPath
} from './database/DeploymentDatabase'
export {
  migrateSchedulesToDeployments,
  rollbackMigration,
  verifyMigration,
  migrateStatusTerminology
} from './database/migration'

// Re-export all types
export type {
  WorkflowMetadata,
  WorkflowNode,
  ParsedWorkflow,
  WorkflowParameter,
  DeploymentOptions,
  DeploymentRecord,
  DeploymentData,
  TriggerRecord,
  TriggerData,
  TriggerType,
  TriggerConfiguration,
  TriggerContext,
  ExecutionRecord,
  ExecutionData,
  ExecutionStatus,
  ExecutionResult,
  DeploymentStatus,
  TriggerStats,
  WebhookRegistration,
  WebhookData,
  CloudWebhookContext,
  TriggerEventContext,
  DeploymentServiceOptions,
  TriggerManagerOptions,
  DeploymentFilters,
  TriggerFilters,
  ExecutionFilters,
  ExecutionQueryOptions,
  ExecutionPage,
  WorkflowParameters
} from './types'
