/**
 * Resolve a user's own OpenAI API key from their stored provider config.
 *
 * Keys are stored AES-256-GCM-encrypted (EncryptionService); this decrypts the same
 * way. Shared by the chat-completions gateway and the image-generation gateway so the
 * key-handling lives in one place.
 */
import { decryptApiKey } from './EncryptionService.js'

/** Read a provider config from the user's aiFeatures.llmProviders (Map or object). */
function getUserProviderConfig(providers, providerId) {
  if (!providers) return null
  if (typeof providers.get === 'function') return providers.get(providerId)
  return providers[providerId]
}

/** The user's own OpenAI key (decrypted), or null when they haven't configured one.
 * Decryption uses the shared EncryptionService — the ONE implementation of the
 * AES-256-GCM scheme, so a change to the crypto/salt/secret can't silently
 * diverge here and downgrade every own-key user to the server key. */
export function getOpenAIKey(user) {
  const cfg = getUserProviderConfig(user?.aiFeatures?.llmProviders, 'openai')
  if (!cfg?.hasKey || !cfg.encryptedKey || !cfg.iv) return null
  try {
    return decryptApiKey(cfg.encryptedKey, cfg.iv)
  } catch (error) {
    console.error('[userOpenAiKey] Failed to decrypt user OpenAI key:', error.message)
    return null
  }
}
