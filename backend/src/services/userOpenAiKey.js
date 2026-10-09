/**
 * Resolve a user's own OpenAI API key from their stored provider config.
 *
 * Keys are stored AES-256-GCM-encrypted (EncryptionService); this decrypts the same
 * way. Shared by the chat-completions gateway and the image-generation gateway so the
 * key-handling lives in one place.
 *
 * The store is keyed by PROVIDER and always was; only the read used to assume
 * OpenAI. See getProviderKey.
 */
import { decryptApiKey } from './EncryptionService.js'

/** Read a provider config from the user's aiFeatures.llmProviders (Map or object). */
function getUserProviderConfig(providers, providerId) {
  if (!providers) return null
  if (typeof providers.get === 'function') return providers.get(providerId)
  return providers[providerId]
}

/** The user's own key for ONE provider (decrypted), or null when they haven't
 * configured one.
 *
 * Decryption uses the shared EncryptionService — the ONE implementation of the
 * AES-256-GCM scheme, so a change to the crypto/salt/secret can't silently
 * diverge here and downgrade every own-key user to the server key.
 *
 * Provider-agnostic because the store always was: aiFeatures.llmProviders is
 * keyed by provider id and llmProviders.js validates key prefixes for nine of
 * them. Only the READ was hardwired to 'openai', which is why a user could save
 * a Groq key and never reach Groq. */
export function getProviderKey(user, providerId) {
  const id = (providerId || 'openai').toLowerCase()
  const cfg = getUserProviderConfig(user?.aiFeatures?.llmProviders, id)
  if (!cfg?.hasKey || !cfg.encryptedKey || !cfg.iv) return null
  try {
    return decryptApiKey(cfg.encryptedKey, cfg.iv)
  } catch (error) {
    console.error(`[userOpenAiKey] Failed to decrypt user ${id} key:`, error.message)
    return null
  }
}

/** The user's own OpenAI key. Kept as its own name for the image-generation
 * gateway, which is OpenAI-only today (the gpt-image models). */
export function getOpenAIKey(user) {
  return getProviderKey(user, 'openai')
}
