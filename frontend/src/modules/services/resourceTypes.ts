// Resource type system for Prompd packages
// Shared constants used by PublishModal, PrompdJsonDesignView, PrompdJsonEditor, install routing,
// PackagePanel, PackageDetailsModal, and InstalledResourcesPanel

import type { LucideIcon } from 'lucide-react'
import { Package, Workflow, Puzzle, Sparkles } from 'lucide-react'

export type ResourceType = 'package' | 'workflow' | 'node-template' | 'skill'

export const RESOURCE_TYPES: ResourceType[] = ['package', 'workflow', 'node-template', 'skill']

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  'package': 'Package',
  'workflow': 'Workflow',
  'node-template': 'Node Template',
  'skill': 'Skill',
}

export const RESOURCE_TYPE_DIRS: Record<ResourceType, string> = {
  'package': 'packages',
  'workflow': 'workflows',
  'node-template': 'templates',
  'skill': 'skills',
}

export const RESOURCE_TYPE_DESCRIPTIONS: Record<ResourceType, string> = {
  'package': 'Standard prompt package',
  'workflow': 'Deployable workflow package',
  'node-template': 'Reusable node configuration',
  'skill': 'AI agent skill with tool declarations',
}

export const RESOURCE_TYPE_ICONS: Record<ResourceType, LucideIcon> = {
  'package': Package,
  'workflow': Workflow,
  'node-template': Puzzle,
  'skill': Sparkles,
}

export const RESOURCE_TYPE_COLORS: Record<ResourceType, string> = {
  'package': '#3b82f6',
  'workflow': '#10b981',
  'node-template': '#f59e0b',
  'skill': '#8b5cf6',
}
