import { Buffer } from 'node:buffer'

// base64url: подходит и для адреса, и для параметра /start бота
export const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url')
