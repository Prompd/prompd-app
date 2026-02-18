/**
 * Electron-aware fetch wrapper that bypasses CORS by routing through main process
 */

import type { ApiRequestOptions, ApiRequestResponse } from '../../electron.d'

interface ElectronFetchOptions extends RequestInit {
  /** Set to 'arraybuffer' for binary responses (e.g. file downloads) */
  responseType?: 'arraybuffer'
}

/**
 * Fetch wrapper that uses Electron IPC when available, falls back to browser fetch.
 * Use responseType: 'arraybuffer' for binary downloads (ZIP, images, etc.)
 */
export async function electronFetch(url: string, options?: ElectronFetchOptions): Promise<Response> {
  const electronAPI = (window as unknown as { electronAPI?: { apiRequest: (url: string, options: Record<string, unknown>) => Promise<ApiRequestResponse & { binary?: boolean }> } })?.electronAPI

  // If we're in Electron and have the API available, use IPC to bypass CORS
  if (electronAPI?.apiRequest) {
    // Convert Headers to plain object
    let headerObj: Record<string, string> = {}
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => { headerObj[key] = value })
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => { headerObj[key] = value })
      } else {
        headerObj = Object.fromEntries(
          Object.entries(options.headers).map(([k, v]) => [k, String(v)])
        )
      }
    }

    const apiOptions: ApiRequestOptions & { responseType?: string } = {
      method: (options?.method || 'GET') as ApiRequestOptions['method'],
      headers: headerObj,
      body: options?.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined,
      responseType: options?.responseType
    }

    const result = await electronAPI.apiRequest(url, apiOptions as Record<string, unknown>)

    if (!result.success) {
      throw new Error(result.error || 'API request failed')
    }

    // For binary responses, decode base64 back to ArrayBuffer
    let body: BodyInit
    if (result.binary && result.body) {
      const binaryStr = atob(result.body)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      body = bytes
    } else {
      body = result.body || ''
    }

    return new Response(body, {
      status: result.status,
      statusText: result.statusText,
      headers: new Headers(result.headers || {})
    })
  }

  // Fall back to regular fetch (browser or web mode)
  return fetch(url, options)
}
