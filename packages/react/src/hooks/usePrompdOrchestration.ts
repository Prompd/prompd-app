import { useState, useCallback } from 'react'
import type {
  UsePrompdOrchestrationReturn,
  PrompdOrchestrationState,
  PrompdPackageMetadata,
  PrompdMetadata,
  PrompdPackageRecommendation,
  PrompdExecutionResult,
  PrompdFileSections
} from '../types'
import { usePrompd } from '../context/PrompdContext'

const initialState: PrompdOrchestrationState = {
  recommendedPackages: [],
  fileSections: new Map(),
  isProcessing: false
}

export function usePrompdOrchestration(): UsePrompdOrchestrationReturn {
  const { apiBaseUrl } = usePrompd()
  const [state, setState] = useState<PrompdOrchestrationState>(initialState)

  const recommendPackages = useCallback(async (intent: string) => {
    setState(prev => ({ ...prev, isProcessing: true, intent }))

    try {
      // Use backend orchestration API for AI-powered recommendations
      const response = await fetch(`${apiBaseUrl}/api/recommend-packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ intent })
      })

      if (!response.ok) {
        throw new Error('Failed to get package recommendations')
      }

      const data = await response.json()

      // Backend already returns properly formatted recommendations
      const recommendations: PrompdPackageRecommendation[] = data.recommendations || []

      setState(prev => ({
        ...prev,
        recommendedPackages: recommendations,
        isProcessing: false
      }))
    } catch (error) {
      console.error('Failed to recommend packages:', error)
      setState(prev => ({ ...prev, isProcessing: false }))
      throw error
    }
  }, [apiBaseUrl])

  const selectPackage = useCallback((pkg: PrompdPackageMetadata) => {
    setState(prev => ({
      ...prev,
      selectedPackage: pkg
    }))
  }, [])

  const selectPrompd = useCallback((prompd: PrompdMetadata) => {
    setState(prev => ({
      ...prev,
      selectedPrompd: prompd
    }))
  }, [])

  const extractRole = useCallback(async (message: string) => {
    setState(prev => ({ ...prev, isProcessing: true }))

    try {
      const response = await fetch(`${apiBaseUrl}/api/extract-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })

      if (!response.ok) {
        throw new Error('Failed to extract role')
      }

      const data = await response.json()

      setState(prev => ({
        ...prev,
        extractedRole: data.role,
        isProcessing: false
      }))
    } catch (error) {
      console.error('Failed to extract role:', error)
      setState(prev => ({ ...prev, isProcessing: false }))
      throw error
    }
  }, [apiBaseUrl])

  const extractParameters = useCallback(async (
    message: string,
    prompd: PrompdMetadata
  ) => {
    setState(prev => ({ ...prev, isProcessing: true }))

    try {
      const response = await fetch(`${apiBaseUrl}/api/extract-parameters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          prompdId: prompd.id,
          prompdName: prompd.name,
          parameters: prompd.parameters
        })
      })

      if (!response.ok) {
        throw new Error('Failed to extract parameters')
      }

      const data = await response.json()

      setState(prev => ({
        ...prev,
        extractedParameters: data.parameters,
        isProcessing: false
      }))
    } catch (error) {
      console.error('Failed to extract parameters:', error)
      setState(prev => ({ ...prev, isProcessing: false }))
      throw error
    }
  }, [apiBaseUrl])

  const updateFileSections = useCallback((sections: PrompdFileSections) => {
    setState(prev => ({
      ...prev,
      fileSections: sections
    }))
  }, [])

  const executePrompt = useCallback(async (): Promise<PrompdExecutionResult> => {
    if (!state.selectedPrompd && !state.selectedPackage) {
      throw new Error('No prompd or package selected')
    }

    setState(prev => ({ ...prev, isProcessing: true }))

    try {
      const response = await fetch(`${apiBaseUrl}/api/execute-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompdId: state.selectedPrompd?.id,
          prompdContent: state.selectedPrompd?.content,
          packageName: state.selectedPackage?.name,
          packageVersion: state.selectedPackage?.version,
          role: state.extractedRole,
          parameters: state.extractedParameters,
          fileSections: Array.from(state.fileSections.entries()).reduce(
            (acc, [key, value]) => {
              acc[key] = value
              return acc
            },
            {} as Record<string, string[]>
          )
        })
      })

      if (!response.ok) {
        throw new Error('Failed to execute prompt')
      }

      const result: PrompdExecutionResult = await response.json()

      setState(prev => ({ ...prev, isProcessing: false }))

      return result
    } catch (error) {
      console.error('Failed to execute prompt:', error)
      setState(prev => ({ ...prev, isProcessing: false }))
      throw error
    }
  }, [apiBaseUrl, state])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  return {
    state,
    recommendPackages,
    selectPackage,
    selectPrompd,
    extractRole,
    extractParameters,
    updateFileSections,
    executePrompt,
    reset
  }
}
