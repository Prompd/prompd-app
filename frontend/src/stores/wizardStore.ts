/**
 * Wizard Store
 * Manages guided prompt creation wizard state
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { WizardState, PackageReference, Section } from '../modules/types/wizard'

/**
 * Wizard Store State & Actions
 */
interface WizardStore extends WizardState {
  // Actions
  setCurrentStep: (step: WizardState['currentStep']) => void
  addSelectedPackage: (pkg: PackageReference) => void
  removeSelectedPackage: (name: string) => void
  setSelectedPackages: (packages: PackageReference[]) => void
  setBasePrompt: (prompt: string | null) => void
  setBasePromptContent: (content: any) => void
  setSections: (sections: Section[]) => void
  setSectionOverride: (sectionId: string, value: string | null) => void
  setMetadata: (metadata: Partial<Pick<WizardState, 'id' | 'name' | 'version' | 'description'>>) => void
  setCustomContent: (content: string) => void
  setParameterOverrides: (overrides: any[]) => void
  addContextFile: (file: string) => void
  removeContextFile: (file: string) => void
  resetWizard: () => void
}

const initialState: WizardState = {
  currentStep: 'select-packages',
  selectedPackages: [],
  basePrompt: null,
  basePromptContent: null,
  sections: [],
  sectionOverrides: {},
  id: '',
  name: '',
  version: '1.0.0',
  contextFiles: []
}

/**
 * Create Wizard Store
 */
export const useWizardStore = create<WizardStore>()(
  devtools(
    immer((set) => ({
      ...initialState,

      setCurrentStep: (step) => set((state) => {
        state.currentStep = step
      }),

      addSelectedPackage: (pkg) => set((state) => {
        if (!state.selectedPackages.find(p => p.name === pkg.name)) {
          state.selectedPackages.push(pkg)
        }
      }),

      removeSelectedPackage: (name) => set((state) => {
        state.selectedPackages = state.selectedPackages.filter(p => p.name !== name)
      }),

      setSelectedPackages: (packages) => set((state) => {
        state.selectedPackages = packages
      }),

      setBasePrompt: (prompt) => set((state) => {
        state.basePrompt = prompt
      }),

      setBasePromptContent: (content) => set((state) => {
        state.basePromptContent = content
      }),

      setSections: (sections) => set((state) => {
        state.sections = sections
      }),

      setSectionOverride: (sectionId, value) => set((state) => {
        state.sectionOverrides[sectionId] = value
      }),

      setMetadata: (metadata) => set((state) => {
        Object.assign(state, metadata)
      }),

      setCustomContent: (content) => set((state) => {
        state.customContent = content
      }),

      setParameterOverrides: (overrides) => set((state) => {
        state.parameterOverrides = overrides
      }),

      addContextFile: (file) => set((state) => {
        if (!state.contextFiles) {
          state.contextFiles = []
        }
        if (!state.contextFiles.includes(file)) {
          state.contextFiles.push(file)
        }
      }),

      removeContextFile: (file) => set((state) => {
        if (state.contextFiles) {
          state.contextFiles = state.contextFiles.filter(f => f !== file)
        }
      }),

      resetWizard: () => set(initialState)
    })),
    { name: 'WizardStore' }
  )
)
