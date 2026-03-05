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

/**
 * Streaming fetch that uses IPC events for incremental data delivery.
 * Returns a Response with a real ReadableStream body backed by IPC events,
 * so getReader().read() yields chunks as they arrive from the HTTP response.
 * Use this for SSE/streaming endpoints (LLM APIs).
 * Falls back to regular fetch in non-Electron environments.
 */
export async function electronStreamFetch(url: string, options?: ElectronFetchOptions): Promise<Response> {
  interface StreamElectronAPI {
    apiStreamRequest: (url: string, options: Record<string, unknown>, streamId: string) => Promise<ApiRequestResponse>
    onApiStreamChunk: (callback: (streamId: string, data: string) => void) => () => void
    onApiStreamEnd: (callback: (streamId: string) => void) => () => void
    onApiStreamError: (callback: (streamId: string, error: string) => void) => () => void
  }

  const electronAPI = (window as unknown as { electronAPI?: StreamElectronAPI })?.electronAPI

  if (!electronAPI?.apiStreamRequest) {
    // Fall back to regular fetch (browser/web mode)
    return fetch(url, options)
  }

  const streamId = Math.random().toString(36).slice(2) + Date.now().toString(36)

  // Buffer for chunks that arrive before ReadableStream controller is ready
  const pendingChunks: string[] = []
  let streamEnded = false
  let streamError: string | null = null
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const encoder = new TextEncoder()

  const cleanupFns: Array<() => void> = []
  const cleanupAll = () => {
    for (const fn of cleanupFns) fn()
    cleanupFns.length = 0
  }

  // Set up listeners BEFORE starting the request to avoid missing chunks
  cleanupFns.push(electronAPI.onApiStreamChunk((id: string, data: string) => {
    if (id !== streamId) return
    if (controller) {
      controller.enqueue(encoder.encode(data))
    } else {
      pendingChunks.push(data)
    }
  }))

  cleanupFns.push(electronAPI.onApiStreamEnd((id: string) => {
    if (id !== streamId) return
    streamEnded = true
    if (controller) {
      controller.close()
      cleanupAll()
    }
  }))

  cleanupFns.push(electronAPI.onApiStreamError((id: string, error: string) => {
    if (id !== streamId) return
    streamError = error
    if (controller) {
      controller.error(new Error(error))
      cleanupAll()
    }
  }))

  // Convert headers (same logic as electronFetch)
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

  // Start the request - resolves when response headers arrive
  const result = await electronAPI.apiStreamRequest(url, {
    method: (options?.method || 'GET'),
    headers: headerObj,
    body: options?.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined,
  }, streamId)

  if (!result.success) {
    cleanupAll()
    throw new Error(result.error || 'Stream request failed')
  }

  // Create ReadableStream backed by IPC events
  const readableStream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl

      // Flush any chunks that arrived while we were setting up
      for (const chunk of pendingChunks) {
        ctrl.enqueue(encoder.encode(chunk))
      }
      pendingChunks.length = 0

      // Check if stream already completed while we were setting up
      if (streamError) {
        ctrl.error(new Error(streamError))
        cleanupAll()
      } else if (streamEnded) {
        ctrl.close()
        cleanupAll()
      }
    },
    cancel() {
      cleanupAll()
    }
  })

  return new Response(readableStream, {
    status: result.status,
    statusText: result.statusText,
    headers: new Headers(result.headers || {})
  })
}
