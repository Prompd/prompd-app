/**
 * Image persistence utility - saves inline base64 images to disk and replaces
 * data URIs with prompd-gen:// protocol URLs that Electron's custom protocol
 * handler resolves to ~/.prompd/generated/images/.
 *
 * This prevents IndexedDB/localStorage bloat from storing large base64 strings
 * in persisted Zustand state. Each image is content-addressed (SHA256 hash)
 * so duplicate images share storage.
 *
 * In non-Electron contexts (web), returns the markdown unchanged.
 */

/**
 * Find all inline base64 image data URIs in markdown content, save each to disk
 * via IPC, and replace with prompd-gen:// protocol URLs.
 *
 * Handles both markdown image syntax and HTML img tags:
 *   ![alt](data:image/png;base64,...)  →  ![alt](prompd-gen://images/abc123.png)
 *   <img src="data:image/png;base64,...">  →  <img src="prompd-gen://images/abc123.png">
 */
export async function persistBase64Images(markdown: string): Promise<string> {
  if (!window.electronAPI?.generated?.saveImage) return markdown

  // Match data:image/TYPE;base64,DATA in any context (markdown URLs, img src, etc.)
  // Use a non-greedy approach: base64 charset is [A-Za-z0-9+/=] plus optional whitespace
  const dataUriPattern = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g
  const matches = [...markdown.matchAll(dataUriPattern)]

  if (matches.length === 0) return markdown

  let result = markdown

  for (const match of matches) {
    const fullDataUri = match[0]
    const ext = match[1]
    const base64Data = match[2]
    const cleanData = base64Data.replace(/\s+/g, '')

    // Skip tiny images (< 1KB of base64 = ~750 bytes decoded) - not worth persisting
    if (cleanData.length < 1024) continue

    const mimeType = `image/${ext}`
    const saveResult = await window.electronAPI.generated.saveImage(cleanData, mimeType)

    if (saveResult.success && saveResult.fileName) {
      // Use custom protocol URL: prompd-gen://images/filename.ext
      const protocolUrl = `prompd-gen://images/${saveResult.fileName}`
      result = result.replace(fullDataUri, protocolUrl)
    }
  }

  return result
}
