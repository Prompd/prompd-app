/**
 * Resolve a user's own OpenAI API key from their stored provider config.
 *
 * Keys are stored AES-256-GCM-encrypted (EncryptionService); this decrypts the same
 * way. Shared by the chat-completions gateway and the image-generation gateway so the
 * key-handling lives in one place.
 */
import crypto from 'node:crypto'

/** Read a provider config from the user's aiFeatures.llmProviders (Map or object). */
function getUserProviderConfig(providers, providerId) {
  if (!providers) return null
  if (typeof providers.get === 'function') return providers.get(providerId)
  return providers[providerId]
}

/** Decrypt an AES-256-GCM key the same way EncryptionService stores it. */
function decryptApiKey(encryptedKeyHex, ivHex) {
  if (!encryptedKeyHex || !ivHex) return null
  try {
    const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET
    if (!secret) return null
    const KEY = crypto.scryptSync(secret, 'prompd-salt', 32)
    const ivBuffer = Buffer.from(ivHex, 'hex')
    const encryptedText = encryptedKeyHex.slice(0, -32)
    const authTag = Buffer.from(encryptedKeyHex.slice(-32), 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, ivBuffer)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('[userOpenAiKey] Failed to decrypt user OpenAI key:', error.message)
    return null
  }
}

/** The user's own OpenAI key (decrypted), or null when they haven't configured one. */
export function getOpenAIKey(user) {
  const cfg = getUserProviderConfig(user?.aiFeatures?.llmProviders, 'openai')
  if (!cfg?.hasKey) return null
  return decryptApiKey(cfg.encryptedKey, cfg.iv)
}
