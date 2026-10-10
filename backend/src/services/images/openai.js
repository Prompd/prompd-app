/**
 * OpenAI image adapter. The lineup was checked against OpenAI's deprecations
 * page on 2026-10-08: dall-e-2/3 retired 2026-05-12, gpt-image-1 shuts down
 * 2026-10-23, gpt-image-1-mini / gpt-image-1.5 on 2026-12-01. None of those is
 * listed, so none can be forwarded.
 */
const IMAGES_URL = 'https://api.openai.com/v1/images/generations'

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)

/** Tokens OpenAI reports for the request, or null when the reply has none
 * (the gpt-image models report `usage`; anything else may not). */
export function usageFromImages(json) {
  const input = count(json?.usage?.input_tokens)
  const output = count(json?.usage?.output_tokens)
  return input === null || output === null ? null : { input, output }
}

const QUALITY_25 = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
const SIZES_STANDARD = { square: '1024x1024', wide: '1536x1024', tall: '1024x1536' }
/* The 2K sizes satisfy OpenAI's custom-size rules for the 2.5 models: both
 * edges multiples of 16, ratio within 1:3..3:1, no edge over 3840, total
 * pixels 655,360..8,294,400. */
const SIZES_25 = { ...SIZES_STANDARD, 'square-2k': '2048x2048', 'wide-2k': '2048x1152', 'tall-2k': '1152x2048' }

export const openaiProvider = {
  id: 'openai',
  label: 'OpenAI',
  models: [
    { id: 'gpt-image-2.5-flare', label: 'Fast', description: 'Everyday images, quickly.', shapes: SIZES_25, qualities: QUALITY_25, maxPrompt: 4000, maxN: 4, default: true },
    { id: 'gpt-image-2.5-sunburst', label: 'Detailed', description: 'Finer detail and text. Slower, and costs more.', shapes: SIZES_25, qualities: QUALITY_25, maxPrompt: 4000, maxN: 4 },
    { id: 'gpt-image-2', label: 'GPT Image 2', description: 'The previous generation.', shapes: SIZES_STANDARD, qualities: ['auto', 'low', 'medium', 'high'], maxPrompt: 4000, maxN: 4 },
  ],

  /** Every model here returns base64 and rejects response_format, so none is sent. */
  buildBody(req, spec) {
    return { model: req.model, prompt: req.prompt, size: spec.shapes[req.shape], n: req.n, quality: req.quality }
  },

  async generate(req, key, { fetchImpl = fetch, signal } = {}) {
    const spec = openaiProvider.models.find((m) => m.id === req.model)
    try {
      const res = await fetchImpl(IMAGES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(openaiProvider.buildBody(req, spec)),
        signal,
      })
      const text = await res.text()
      if (!res.ok) return { ok: false, status: res.status, body: text, contentType: res.headers.get('content-type') || 'application/json' }
      let json
      try { json = JSON.parse(text) } catch { return { ok: false, status: 502, message: 'OpenAI returned a reply that could not be read.' } }
      const images = (json?.data ?? [])
        .map((d) => d?.b64_json)
        .filter((b) => typeof b === 'string' && b.length > 0)
        .map((b64) => ({ b64, mime: 'image/png' }))
      return { ok: true, images, usage: usageFromImages(json) }
    } catch (error) {
      return { ok: false, status: 502, message: `Upstream request failed: ${error.message}` }
    }
  },
}
