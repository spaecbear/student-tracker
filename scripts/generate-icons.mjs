/**
 * Generates the PWA icons as PNGs with no image toolchain and no binary
 * assets in the repo. The mark is a clock face on the app's teal accent,
 * drawn by hand into an RGBA buffer and deflated into a PNG.
 *
 * Run with: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const ACCENT = [15, 157, 143, 255]
const INK = [255, 255, 255, 255]
const TRANSPARENT = [0, 0, 0, 0]

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  // Each scanline is prefixed with its filter byte; 0 means no filtering.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Coverage of a pixel by a shape, sampled 3x3 for cheap antialiasing. */
function coverage(x, y, inside) {
  let hits = 0
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits += 1
    }
  }
  return hits / 9
}

function blend(target, offset, color, alpha) {
  if (alpha <= 0) return
  const existing = target[offset + 3] / 255
  const out = alpha + existing * (1 - alpha)
  for (let channel = 0; channel < 3; channel += 1) {
    const src = color[channel] * alpha
    const dst = target[offset + channel] * existing * (1 - alpha)
    target[offset + channel] = out === 0 ? 0 : Math.round((src + dst) / out)
  }
  target[offset + 3] = Math.round(out * 255)
}

function drawIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i += 1) {
    pixels.set(TRANSPARENT, i * 4)
  }

  const s = size
  // A maskable icon is cropped to a circle by the platform, so its glyph sits
  // inside the 80% safe zone and the background runs full bleed.
  const radius = maskable ? 0 : s * 0.22
  const glyphScale = maskable ? 0.62 : 0.78
  const cx = s / 2
  const cy = s / 2
  const faceOuter = (s * glyphScale) / 2
  const ringWidth = s * 0.055 * (maskable ? 0.9 : 1)
  const faceInner = faceOuter - ringWidth

  const insideBackground = (x, y) => {
    if (radius === 0) return true
    const dx = Math.max(radius - x, x - (s - radius), 0)
    const dy = Math.max(radius - y, y - (s - radius), 0)
    return dx * dx + dy * dy <= radius * radius
  }

  const insideRing = (x, y) => {
    const d = Math.hypot(x - cx, y - cy)
    return d <= faceOuter && d >= faceInner
  }

  // Hands frozen at 10:10, the arrangement that reads as a clock at 16px.
  const hand = (angleDeg, length, width) => {
    const angle = ((angleDeg - 90) * Math.PI) / 180
    const ex = cx + Math.cos(angle) * faceOuter * length
    const ey = cy + Math.sin(angle) * faceOuter * length
    return (x, y) => {
      const vx = ex - cx
      const vy = ey - cy
      const t = Math.max(0, Math.min(1, ((x - cx) * vx + (y - cy) * vy) / (vx * vx + vy * vy)))
      const px = cx + vx * t
      const py = cy + vy * t
      return Math.hypot(x - px, y - py) <= (s * width) / 2
    }
  }

  const minuteHand = hand(58, 0.66, 0.05)
  const hourHand = hand(-60, 0.46, 0.05)

  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const offset = (y * s + x) * 4
      blend(pixels, offset, ACCENT, coverage(x, y, insideBackground))
      const glyph = Math.max(
        coverage(x, y, insideRing),
        coverage(x, y, minuteHand),
        coverage(x, y, hourHand),
      )
      blend(pixels, offset, INK, glyph)
    }
  }

  return encodePng(s, pixels)
}

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
]

for (const [name, size, options] of targets) {
  writeFileSync(join(OUT_DIR, name), drawIcon(size, options))
  console.log(`wrote ${name} (${size}x${size})`)
}
