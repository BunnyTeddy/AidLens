import { webcrypto } from 'node:crypto'

const pair = await webcrypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveBits'],
)
const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64')
const privateKey = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')

console.log(`VITE_NGO_ENCRYPTION_PUBLIC_KEY=${publicKey}`)
console.log(`NGO_ENCRYPTION_PRIVATE_KEY=${privateKey}`)
