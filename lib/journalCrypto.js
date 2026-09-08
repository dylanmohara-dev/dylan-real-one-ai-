import crypto from 'crypto'

const ITERATIONS = 210000
const KEY_LENGTH = 32
const DIGEST = 'sha256'
const ALGORITHM = 'aes-256-gcm'

export function generateSalt() {
  return crypto.randomBytes(16).toString('hex')
}

export function deriveKey(passcode, saltHex) {
  const salt = Buffer.from(saltHex, 'hex')
  return crypto.pbkdf2Sync(passcode, salt, ITERATIONS, KEY_LENGTH, DIGEST)
}

export function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  }
}

export function decrypt({ iv, authTag, ciphertext }, key) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}
