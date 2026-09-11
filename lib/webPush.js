// A from-scratch Web Push implementation (VAPID auth + RFC 8291 message
// encryption) using only Node's built-in `crypto` module -- no `web-push`
// npm dependency. Two real reasons, not just one:
//
// 1. This sandbox's device_bash VM has zero network access (confirmed:
//    `npm view web-push version` returns a 403 from the registry), so
//    installing anything here isn't an option today.
// 2. This project already has a standing rule from session 26: "before
//    adding an npm dependency, check built-in platform features first."
//    Web Push is a fully open, standardized protocol (RFC 8291 for the
//    payload encryption, RFC 8292 for the VAPID identification JWT) --
//    every piece of crypto it needs (P-256 ECDH, ECDSA-P256-SHA256
//    signing, HKDF, AES-128-GCM) is already in Node's `crypto` module.
//    A dependency-free implementation is also the one thing that keeps
//    working the moment Dylan's own Mac has no internet for `npm install`
//    either -- exactly the situation this sandbox is in right now.
//
// This same protocol is what every major push service speaks underneath
// (Chrome/Android through FCM, Firefox through Mozilla's autopush, and --
// confirmed via a fresh web search before writing this -- Safari/iOS
// 16.4+ through web.push.apple.com) BECAUSE Web Push is one open standard
// with only the endpoint URL differing by browser. One implementation
// here covers all of them; there is no "Apple-specific" or "Android-
// specific" push code anywhere in this file.

import crypto from 'crypto'
import { loadData, saveData } from './dataStore.js'

// ---- VAPID key generation & (de)serialization ----
//
// A VAPID key pair is a plain P-256 (prime256v1) EC key pair. The public
// key is shared in RAW uncompressed-point form (0x04 || X(32) || Y(32) =
// 65 bytes, base64url-encoded) -- this exact 65-byte value is what both
// the VAPID JWT's "k" parameter AND the browser's
// `pushManager.subscribe({ applicationServerKey })` call expect. The
// private key is stored as just its raw 32-byte scalar (base64url) --
// the same minimal format the `web-push` npm package and every VAPID
// guide uses, so these keys would be portable to that library too if
// this project ever wanted to swap in the real package later.

export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const publicJwk = publicKey.export({ format: 'jwk' })
  const privateJwk = privateKey.export({ format: 'jwk' })

  const rawPublicKey = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ])

  return {
    publicKey: rawPublicKey.toString('base64url'),
    privateKey: Buffer.from(privateJwk.d, 'base64url').toString('base64url'),
  }
}

// Rebuilds a signable/verifiable EC KeyObject pair from the minimal
// stored (publicKey, privateKey) base64url strings above. A JWK EC
// private key needs its public (x, y) coordinates alongside the private
// scalar (d) -- those are just sliced back out of the raw 65-byte public
// key we already stored, so nothing about the stored format needs to
// change to support this.
function keyObjectsFromVapidKeys(vapidKeys) {
  const rawPublic = Buffer.from(vapidKeys.publicKey, 'base64url')
  if (rawPublic.length !== 65 || rawPublic[0] !== 0x04) {
    throw new Error('VAPID public key is not a raw uncompressed P-256 point -- check .env')
  }
  const x = rawPublic.subarray(1, 33)
  const y = rawPublic.subarray(33, 65)
  const d = Buffer.from(vapidKeys.privateKey, 'base64url')

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: x.toString('base64url'),
    y: y.toString('base64url'),
    d: d.toString('base64url'),
  }

  return {
    privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }),
    rawPublic,
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

// Builds the "Authorization: vapid t=<jwt>, k=<public key>" header
// required by every Web Push endpoint (RFC 8292). `endpoint` is the
// subscriber's real push-service URL (from PushSubscription.endpoint) --
// the JWT's "aud" claim must be that URL's origin, not the endpoint path,
// or every major push service rejects the request outright.
function buildVapidAuthHeader(endpoint, vapidKeys, subject) {
  const { privateKey, rawPublic } = keyObjectsFromVapidKeys(vapidKeys)
  const audience = new URL(endpoint).origin
  const nowSeconds = Math.floor(Date.now() / 1000)

  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    // RFC 8292 caps this at 24h; push services (Apple's included) reject
    // a longer expiry outright. 12h leaves comfortable margin either way.
    exp: nowSeconds + 12 * 60 * 60,
    sub: subject,
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`

  // ES256 (JWS) needs the RAW (r || s) 64-byte signature format, not the
  // DER-wrapped ASN.1 signature `crypto.sign` produces by default --
  // `dsaEncoding: 'ieee-p1363'` is exactly this raw format and needs no
  // manual DER unwrapping.
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  })

  const jwt = `${signingInput}.${base64url(signature)}`
  return `vapid t=${jwt}, k=${rawPublic.toString('base64url')}`
}

// ---- RFC 8291 message encryption (the "aes128gcm" content-coding) ----
//
// Turns a plaintext JSON payload into the single binary record every
// push service expects to receive as the request body. Follows RFC 8291
// section 3.4 exactly: an ECDH exchange between a fresh one-time server
// key pair and the subscriber's stored public key, combined with the
// subscription's own `auth` secret through two chained HKDF steps (one
// deriving a shared input keying material, one deriving the actual
// AES-128-GCM key + nonce from that plus a random salt), matching what
// RFC 8188's generic aes128gcm content-coding defines. Node's
// `crypto.hkdfSync` implements RFC 5869 HKDF (extract-and-expand) in one
// call, so each "derive a key from these inputs" step below is exactly
// one `hkdfSync` call, not a hand-rolled HMAC chain.
function encryptPayload(payloadObject, subscriptionKeys) {
  const uaPublicKey = Buffer.from(subscriptionKeys.p256dh, 'base64url')
  const authSecret = Buffer.from(subscriptionKeys.auth, 'base64url')

  if (uaPublicKey.length !== 65) {
    throw new Error('Subscription p256dh key is not a raw 65-byte P-256 point')
  }

  // One-time (per message) server key pair -- never reused, never stored.
  const serverEcdh = crypto.createECDH('prime256v1')
  serverEcdh.generateKeys()
  const serverPublicKey = serverEcdh.getPublicKey(null, 'uncompressed') // 65 bytes
  const ecdhSecret = serverEcdh.computeSecret(uaPublicKey) // 32 bytes

  const salt = crypto.randomBytes(16)

  // Stage 1: combine the ECDH secret with the subscription's own auth
  // secret into one intermediate keying material (RFC 8291's "IKM").
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'binary'),
    uaPublicKey,
    serverPublicKey,
  ])
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32))

  // Stage 2: derive the actual AES-128-GCM content-encryption key and
  // nonce from that IKM plus the random per-message salt, using the
  // fixed info strings RFC 8188's aes128gcm content-coding defines.
  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'binary')
  const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'binary')
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, cekInfo, 16))
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, nonceInfo, 12))

  // A single-record message per RFC 8188: the plaintext gets one
  // trailing 0x02 "last record" delimiter byte before encryption.
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payloadObject), 'utf8'), Buffer.from([0x02])])

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])

  // aes128gcm record header per RFC 8188 section 2.1: salt(16) ||
  // record_size(4, big-endian) || keyid_length(1) || keyid. The "keyid"
  // slot carries our one-time server public key so the push service
  // (which just relays bytes) doesn't need to -- the RECEIVING browser
  // reads it back out of this same header to redo the ECDH on its end.
  const recordSizeBuf = Buffer.alloc(4)
  recordSizeBuf.writeUInt32BE(ciphertext.length, 0)
  const header = Buffer.concat([
    salt,
    recordSizeBuf,
    Buffer.from([serverPublicKey.length]),
    serverPublicKey,
  ])

  return Buffer.concat([header, ciphertext])
}

// Sends one push message to one stored subscription. Returns
// { ok, status, gone } -- `gone` is true on 404/410, which every push
// service uses to mean "this subscription is dead, stop sending to it"
// (the user uninstalled the PWA, cleared data, etc.) -- callers should
// delete that subscription from storage rather than retry it.
export async function sendPushNotification(subscription, payloadObject, vapidConfig) {
  const body = encryptPayload(payloadObject, subscription.keys)
  const authHeader = buildVapidAuthHeader(subscription.endpoint, vapidConfig.keys, vapidConfig.subject)

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: authHeader,
      TTL: '86400', // hold for up to a day if the phone is offline/unreachable
      Urgency: 'normal',
    },
    body,
  })

  return {
    ok: response.ok,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  }
}

// Reads the real VAPID key pair Dylan generated once into his own .env --
// never hardcoded, never generated per-request (a push service would
// reject every message signed by a key it hasn't seen associated with a
// subscription yet). Returns null if he hasn't set them up, so every
// caller can degrade to "notifications aren't configured yet" instead of
// crashing.
export function getVapidConfigFromEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  return {
    keys: { publicKey, privateKey },
    subject: process.env.VAPID_SUBJECT || 'mailto:dylan@example.com',
  }
}

// The one shared "send this to every device Dylan has enabled
// notifications on" entry point -- used identically by the Settings
// page's manual "send a test notification" button and by the automatic
// streak/due-date checks in lib/notificationTriggers.js, so there is only
// one place that knows how to prune a dead subscription after a 404/410.
export async function broadcastPushNotification(payloadObject) {
  const vapidConfig = getVapidConfigFromEnv()
  if (!vapidConfig) return { sent: 0, total: 0, configured: false }

  const subscriptions = loadData('push_subscriptions')
  if (!subscriptions.length) return { sent: 0, total: 0, configured: true }

  let sent = 0
  const stillValid = []
  for (const subscription of subscriptions) {
    try {
      const result = await sendPushNotification(subscription, payloadObject, vapidConfig)
      if (result.gone) continue // the browser/OS says this device unsubscribed -- drop it
      stillValid.push(subscription)
      if (result.ok) sent += 1
    } catch (error) {
      // A network error or a transient 5xx isn't proof the subscription is
      // dead -- keep it and just don't count this attempt as delivered.
      console.error('Push send failed:', error.message)
      stillValid.push(subscription)
    }
  }
  if (stillValid.length !== subscriptions.length) saveData('push_subscriptions', stillValid)
  return { sent, total: subscriptions.length, configured: true }
}
