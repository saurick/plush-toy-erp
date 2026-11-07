export function rasterImageMimeType(bytes) {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  const header = String.fromCharCode(...bytes.slice(0, 12))
  if (/^GIF8[79]a/u.test(header)) return 'image/gif'
  if (header.startsWith('RIFF') && header.endsWith('WEBP')) return 'image/webp'
  return ''
}
