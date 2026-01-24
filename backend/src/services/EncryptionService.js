import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

// Derive encryption key from environment secret
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set in environment variables')
  }
  return crypto.scryptSync(secret, 'prompd-salt', 32)
}

/**
 * Encrypts an API key using AES-256-GCM
 * @param {string} plaintext - The API key to encrypt
 * @returns {{encryptedKey: string, iv: string}} Encrypted key and initialization vector
 */
export function encryptApiKey(plaintext) {
  const KEY = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return {
    encryptedKey: encrypted + authTag.toString('hex'),
    iv: iv.toString('hex')
  }
}

/**
 * Decrypts an API key using AES-256-GCM
 * @param {string} encryptedKey - The encrypted key (includes auth tag)
 * @param {string} iv - The initialization vector (hex string)
 * @returns {string} The decrypted API key
 */
export function decryptApiKey(encryptedKey, iv) {
  const KEY = getEncryptionKey()
  const ivBuffer = Buffer.from(iv, 'hex')
  const encryptedText = encryptedKey.slice(0, -32)
  const authTag = Buffer.from(encryptedKey.slice(-32), 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, ivBuffer)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
