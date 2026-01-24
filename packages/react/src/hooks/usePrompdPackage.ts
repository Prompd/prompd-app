import { useState, useCallback } from 'react'
import type {
  UsePrompdPackageReturn,
  PrompdPackageMetadata,
  PrompdPackageRecommendation
} from '../types'
import { usePrompd } from '../context/PrompdContext'

export function usePrompdPackage(): UsePrompdPackageReturn {
  const { apiBaseUrl } = usePrompd()
  const [packages, setPackages] = useState<PrompdPackageMetadata[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const search = useCallback(async (query: string): Promise<PrompdPackageRecommendation[]> => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/packages/search?q=${encodeURIComponent(query)}`
      )

      if (!response.ok) {
        throw new Error('Failed to search packages')
      }

      const data = await response.json()
      const recommendations: PrompdPackageRecommendation[] = data.results.map(
        (pkg: PrompdPackageMetadata) => ({
          package: pkg,
          score: 1.0,
          reason: 'Search result'
        })
      )

      setPackages(data.results)
      return recommendations
    } catch (error) {
      console.error('Failed to search packages:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl])

  const getPackage = useCallback(async (
    name: string,
    version?: string
  ): Promise<PrompdPackageMetadata> => {
    setIsLoading(true)
    try {
      const url = version
        ? `${apiBaseUrl}/api/packages/${name}/${version}`
        : `${apiBaseUrl}/api/packages/${name}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('Failed to get package')
      }

      const pkg: PrompdPackageMetadata = await response.json()
      return pkg
    } catch (error) {
      console.error('Failed to get package:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl])

  return {
    packages,
    isLoading,
    search,
    getPackage
  }
}
