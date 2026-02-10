/**
 * Shared TypeScript interfaces for scheduler package
 */

export interface WorkflowMetadata {
  id?: string
  name?: string
  [key: string]: unknown
}

export interface WorkflowNode {
  id: string
  type: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface ParsedWorkflow {
  version?: string
  nodes?: WorkflowNode[]
  metadata?: WorkflowMetadata
  parameters?: WorkflowParameter[]
  [key: string]: unknown
}

export interface WorkflowParameter {
  name: string
  type: string
  required?: boolean
  default?: unknown
  [key: string]: unknown
}

export interface DeploymentOptions {
  name?: string
  enabled?: boolean
  dependencies?: Record<string, string>
  createdBy?: string
  workspacePath?: string
}

export interface DeploymentRecord {
  id: string
  name: string
  workflowId: string
  packagePath: string
  packageHash: string
  version?: string | null
  status: 'enabled' | 'disabled' | 'deleted'
  deployedAt: number
  deletedAt?: number | null
  lastExecutionAt?: number | null
  lastExecutionStatus?: string | null
  metadata?: string | null
  createdBy?: string | null
  updatedAt: number
}

export interface DeploymentData {
  id?: string
  name: string
  workflowId: string
  packagePath: string
  packageHash: string
  version?: string
  status?: 'enabled' | 'disabled' | 'deleted'
  deployedAt?: number
  deletedAt?: number
  lastExecutionAt?: number
  lastExecutionStatus?: string
  metadata?: WorkflowMetadata
  createdBy?: string
}

export interface TriggerRecord {
  id: string
  deploymentId: string
  nodeId: string
  triggerType: TriggerType
  enabled: boolean
  config: string | null
  scheduleCron?: string | null
  scheduleTimezone?: string | null
  nextRunAt?: number | null
  webhookPath?: string | null
  webhookSecret?: string | null
  fileWatchPaths?: string | null
  eventName?: string | null
  lastTriggeredAt?: number | null
  lastTriggerStatus?: string | null
  triggerCount: number
  createdAt: number
  updatedAt: number
}

export interface TriggerData {
  id?: string
  deploymentId: string
  nodeId: string
  triggerType: TriggerType
  enabled?: boolean
  config: Record<string, unknown>
  scheduleCron?: string
  scheduleTimezone?: string
  nextRunAt?: number
  webhookPath?: string
  webhookSecret?: string
  fileWatchPaths?: string
  eventName?: string
  lastTriggeredAt?: number
  lastTriggerStatus?: string
  triggerCount?: number
}

export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'file-watch' | 'event'

export interface TriggerConfiguration {
  triggerType: TriggerType
  scheduleCron?: string
  scheduleTimezone?: string
  scheduleEnabled?: boolean
  webhookPath?: string
  webhookSecret?: string
  fileWatchPaths?: string[]
  fileWatchEvents?: string[]
  fileWatchDebounceMs?: number
  fileWatchIgnoreInitial?: boolean
  eventName?: string
  [key: string]: unknown
}

export interface TriggerContext {
  deploymentId?: string
  workflowId?: string
  packagePath?: string
}

export interface ExecutionRecord {
  id: string
  deploymentId: string
  triggerId: string | null
  workflowId: string
  triggerType: TriggerType
  status: ExecutionStatus
  result: string | null
  error: string | null
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  parameters: string | null
  nodeExecutionLog: string | null
}

export interface ExecutionData {
  id?: string
  deploymentId: string
  triggerId?: string | null
  workflowId: string
  triggerType: TriggerType
  status: ExecutionStatus
  result?: Record<string, unknown>
  error?: string
  startedAt: number
  completedAt?: number
  durationMs?: number
  parameters?: Record<string, unknown>
  nodeExecutionLog?: Record<string, unknown>
}

export type ExecutionStatus = 'running' | 'success' | 'error' | 'cancelled'

export interface ExecutionResult {
  status?: ExecutionStatus
  result?: Record<string, unknown>
  error?: string
  duration?: number
}

export interface DeploymentStatus {
  id: string
  name: string
  workflowId: string
  status: string
  triggers: TriggerRecord[]
  recentExecutions: ExecutionRecord[]
  triggerCount: number
  activeTriggersCount: number
  [key: string]: unknown
}

export interface TriggerStats {
  cronJobs: number
  webhooks: number
  webhookClientActive: boolean
  webhookClientMode: string
  fileWatchers: number
  eventListeners: number
}

export interface WebhookRegistration {
  workflowId: string
  triggerId: string
}

export interface WebhookData {
  workflowId: string
  payload: Record<string, unknown>
}

export interface CloudWebhookContext {
  triggerType: 'webhook'
  workflowId: string
  payload: Record<string, unknown>
  triggeredAt: number
}

export interface TriggerEventContext {
  triggerType: TriggerType
  triggeredAt: number
  event?: string
  filePath?: string
  workflowId?: string
  payload?: Record<string, unknown>
  eventName?: string
  eventData?: Record<string, unknown>
}

export interface DeploymentServiceOptions {
  dbPath?: string
  deploymentsPath?: string
  executeWorkflow?: (
    deployment: DeploymentRecord,
    trigger: TriggerRecord | { triggerType: 'manual' },
    context: TriggerEventContext
  ) => Promise<ExecutionResult>
}

export interface TriggerManagerOptions {
  onTrigger?: (triggerId: string, context: TriggerEventContext) => void | Promise<void | ExecutionResult | undefined>
}

export interface DeploymentFilters {
  status?: string
  workflowId?: string
  createdBy?: string
}

export interface TriggerFilters {
  deploymentId?: string
  triggerType?: string
  enabled?: boolean
}

export interface ExecutionFilters {
  status?: string
  triggerType?: string
  workflowId?: string
  limit?: number
  offset?: number
}

export interface ExecutionQueryOptions {
  limit?: number
  offset?: number
}

export interface ExecutionPage {
  executions: ExecutionRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface DeploymentVersionRecord {
  id: string
  deploymentId: string
  version: string | null
  packageHash: string
  triggerSnapshot: string | null
  metadata: string | null
  deployedAt: number
  deployedBy: string | null
  note: string | null
}

export interface DeploymentVersionData {
  id?: string
  deploymentId: string
  version?: string
  packageHash: string
  triggerSnapshot?: string
  metadata?: string
  deployedAt: number
  deployedBy?: string
  note?: string
}

export interface WorkflowParameters {
  parameters: WorkflowParameter[]
  workflowName: string
}
