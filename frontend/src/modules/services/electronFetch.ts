/**
 * Electron-aware fetch wrapper that bypasses CORS by routing through main process
 */

import type { ApiRequestOptions, ApiRequestResponse } from '../../electron.d'

/**
 * Fetch wrapper that uses Electron IPC when available, falls back to browser fetch
 */
export async function electronFetch(url: string, options?: RequestInit): Promise<Response> {
  const electronAPI = (window as any).electronAPI

  // If we're in Electron and have the API available, use IPC to bypass CORS
  if (electronAPI?.apiRequest) {
    console.log('[electronFetch] Using Electron IPC for request to:', url)

    const apiOptions: ApiRequestOptions = {
      method: (options?.method || 'GET') as ApiRequestOptions['method'],
      headers: options?.headers ? Object.fromEntries(
        Object.entries(options.headers).map(([k, v]) => [k, String(v)])
      ) : {},
      body: options?.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined
    }

    const result: ApiRequestResponse = await electronAPI.apiRequest(url, apiOptions)

    if (!result.success) {
      throw new Error(result.error || 'API request failed')
    }

    // Create a Response-like object that mimics the Fetch API Response
    const response = new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: new Headers(result.headers || {})
    })

    // Add ok property
    Object.defineProperty(response, 'ok', {
      get: () => result.ok
    })

    return response
  }

  // Fall back to regular fetch (browser or web mode)
  console.log('[electronFetch] Using browser fetch for request to:', url)
  return fetch(url, options)
}
