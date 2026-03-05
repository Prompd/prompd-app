/**
 * Block Registry - Extensible registration system for canvas block types.
 *
 * Built-in blocks (metadata, parameters, specialty, content) are registered
 * at module load time. Custom block types can be added via registerBlock().
 */

import type { BlockRegistration, CanvasBlockType } from './types'

const registry = new Map<CanvasBlockType, BlockRegistration>()

/** Register a block type. Overwrites any existing registration for the same type. */
export function registerBlock<T = Record<string, unknown>>(
  registration: BlockRegistration<T>
): void {
  registry.set(registration.type, registration as unknown as BlockRegistration)
}

/** Get a registered block type */
export function getBlock(type: CanvasBlockType): BlockRegistration | undefined {
  return registry.get(type)
}

/** Get all registered block types, sorted by display order */
export function getAllBlocks(): BlockRegistration[] {
  return Array.from(registry.values()).sort((a, b) => a.order - b.order)
}

/** Check if a block type is registered */
export function hasBlock(type: CanvasBlockType): boolean {
  return registry.has(type)
}

/** Unregister a block type (for dynamic plugins) */
export function unregisterBlock(type: CanvasBlockType): boolean {
  return registry.delete(type)
}
