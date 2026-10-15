export function createDevOperationUUID(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID === 'function') {
    return cryptoProvider.randomUUID()
  }
  if (typeof cryptoProvider?.getRandomValues !== 'function') {
    throw new Error('当前浏览器不能生成安全的操作标识')
  }
  // HTTP LAN pages lack randomUUID, but Web Crypto still provides secure bytes.
  const bytes = new Uint8Array(16)
  cryptoProvider.getRandomValues(bytes)
  bytes[6] = (bytes[6] % 16) + 64
  bytes[8] = (bytes[8] % 64) + 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}
