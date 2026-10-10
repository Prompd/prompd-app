/**
 * Google image adapter: the Gemini image models ("Nano Banana") through the
 * Interactions API. Checked against ai.google.dev on 2026-10-09: Imagen is
 * shut down, gemini-2.5-flash-image is legacy (shutdown 2027-03-15), and
 * gemini-nano-banana-2.1 is the recommended default. No documented prompt
 * limit; 4000 matches OpenAI's so the writer's cut is the same for both.
 * One image per request.
 */
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'

const SHAPES_FULL = { square: ['1:1', '1K'], wide: ['16:9', '1K'], tall: ['9:16', '1K'], 'square-2k': ['1:1', '2K'], 'wide-2k': ['16:9', '2K'], 'tall-2k': ['9:16', '2K'] }
const SHAPES_1K = { square: ['1:1', '1K'], wide: ['16:9', '1K'], tall: ['9:16', '1K'] }

/** Image blocks from a finished interaction: the convenience field first, else
 * every image in a model_output step. Thought images are not results. */
export function imagesFromInteraction(json) {
  const top = json?.output_image
  if (top && typeof top.data === 'string' && top.data) return [{ b64: top.data, mime: top.mime_type || 'image/png' }]
  const out = []
  for (const step of json?.steps ?? []) {
    if (step?.type !== 'model_output') continue
    for (const c of step.content ?? []) {
      if (c?.type === 'image' && typeof c.data === 'string' && c.data) out.push({ b64: c.data, mime: c.mime_type || 'image/png' })
    }
  }
  return out
}

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)

/** Tokens Google reports for a finished interaction, or null when it has none.
 *
 * Output is the IMAGE output: the card prices it at the model's listed output
 * rate, which is the image rate. Thought tokens (total_thought_tokens, apart
 * from total_output_tokens) and any text output bill at the lower text rate,
 * so counting them here would overstate the cost; they are left out. When the
 * per-modality breakdown is missing, total_output_tokens is the best count. */
export function usageFromInteraction(json) {
  const u = json?.usage
  const input = count(u?.total_input_tokens)
  const total = count(u?.total_output_tokens)
  if (input === null || total === null) return null
  const byModality = Array.isArray(u?.output_tokens_by_modality) ? u.output_tokens_by_modality : null
  const image = byModality ? count(byModality.find((m) => m?.modality === 'image')?.tokens) : null
  return { input, output: image ?? total }
}

export const googleProvider = {
  id: 'google',
  label: 'Google',
  models: [
    { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1', description: "Google's everyday image model.", shapes: SHAPES_FULL, qualities: ['auto'], maxPrompt: 4000, maxN: 1, default: true },
    { id: 'gemini-3-pro-image', label: 'Nano Banana Pro', description: 'Detail and legible text. Slower, and costs more.', shapes: SHAPES_FULL, qualities: ['auto'], maxPrompt: 4000, maxN: 1 },
    { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite', description: 'Fastest and cheapest. Standard sizes only.', shapes: SHAPES_1K, qualities: ['auto'], maxPrompt: 4000, maxN: 1 },
  ],

  buildBody(req, spec) {
    const [aspect_ratio, image_size] = spec.shapes[req.shape]
    return {
      model: req.model,
      input: req.prompt,
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio, image_size },
      store: false,
    }
  },

  async generate(req, key, { fetchImpl = fetch, signal } = {}) {
    const spec = googleProvider.models.find((m) => m.id === req.model)
    try {
      const res = await fetchImpl(INTERACTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(googleProvider.buildBody(req, spec)),
        signal,
      })
      const text = await res.text()
      if (!res.ok) return { ok: false, status: res.status, body: text, contentType: res.headers.get('content-type') || 'application/json' }
      let json
      try { json = JSON.parse(text) } catch { return { ok: false, status: 502, message: 'Google returned a reply that could not be read.' } }
      if (json?.status && json.status !== 'completed') {
        const why = json.errors?.[0]?.message
        return { ok: false, status: 502, message: `Google did not finish the image (${json.status})${why ? `: ${why}` : ''}` }
      }
      return { ok: true, images: imagesFromInteraction(json), usage: usageFromInteraction(json) }
    } catch (error) {
      return { ok: false, status: 502, message: `Upstream request failed: ${error.message}` }
    }
  },
}
