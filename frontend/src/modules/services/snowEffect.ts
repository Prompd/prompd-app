/**
 * Snow Effect — Canvas-based snowfall with occasional Prompd P-icon flakes.
 *
 * Usage:
 *   const stop = startSnowEffect(canvas, container)
 *   // later: stop()
 *
 * Runs for ~60 seconds then auto-stops. The returned function cancels early.
 */

/** Prompd P icon SVG path data (matches PrompdIcon.tsx) */
const P_PATHS = [
  'M 271.6313,29.109924 C 456.06055,29.109924 454.60452,304.1 270.40336,304.1 L 228,304 v -47.30173 l 43.85191,0.0317 c 118.41324,0 116.08205,-178.966717 -0.82527,-178.966717 L 132.15087,77.622831 129.6,420.52 c -0.33992,0.0728 -45.968529,35.12868 -45.968529,35.12868 L 83.506489,28.866413 Z',
  'm 156,102 103.33423,0.32678 c 88.07508,0 87.938,129.66692 1.26051,129.66692 l -32.5414,0.0925 -0.0533,-47.08616 32.66331,-0.23913 c 27.90739,0 25.69827,-34.89447 -0.0611,-34.99087 L 204.00004,150 c 0.90517,68.30467 0.52,211.29643 0.52,211.29643 0,0 -48.54879,38.04493 -48.62668,38.05052 z'
]

const COLORS = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ffffff']
const DURATION = 60_000
const MAX_FLAKES = 120
const SPAWN_RATE = 3
const P_ICON_CHANCE = 0.12 // 12% of flakes are P icons

interface Snowflake {
  x: number
  y: number
  radius: number
  speed: number
  wind: number
  opacity: number
  wobbleAmp: number
  wobbleSpeed: number
  phase: number
  isIcon: boolean
  rotation: number   // radians — fixed per flake
  rotSpeed: number   // slow tumble
  colorIdx: number
}

/** Pre-render the P icon to an offscreen canvas at a given size and color */
function renderPIcon(size: number, color: string): HTMLCanvasElement {
  const oc = document.createElement('canvas')
  oc.width = size
  oc.height = size
  const ctx = oc.getContext('2d')!

  // Scale SVG viewBox (475x487) into the target size
  const sx = size / 475
  const sy = size / 487
  ctx.scale(sx, sy)
  ctx.fillStyle = color

  for (const d of P_PATHS) {
    const p = new Path2D(d)
    ctx.fill(p)
  }

  return oc
}

function createFlake(w: number): Snowflake {
  const isIcon = Math.random() < P_ICON_CHANCE
  return {
    x: Math.random() * w,
    y: -10,
    radius: isIcon ? 4 + Math.random() * 4 : 1.5 + Math.random() * 3,
    speed: 0.5 + Math.random() * 1.5,
    wind: (Math.random() - 0.5) * 0.5,
    opacity: 0.3 + Math.random() * 0.7,
    wobbleAmp: 20 + Math.random() * 40,
    wobbleSpeed: 0.002 + Math.random() * 0.003,
    phase: Math.random() * Math.PI * 2,
    isIcon,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.002,
    colorIdx: Math.floor(Math.random() * COLORS.length)
  }
}

/**
 * Start a 60-second snowfall on the given canvas.
 * Returns a cleanup function that stops the animation early.
 */
export function startSnowEffect(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  onDone?: () => void
): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  // Size canvas
  const rect = container.getBoundingClientRect()
  canvas.width = rect.width
  canvas.height = rect.height

  // Pre-render P icons per color at a few sizes
  const iconCache = new Map<string, HTMLCanvasElement>()
  const getIcon = (size: number, color: string): HTMLCanvasElement => {
    const key = `${size}|${color}`
    let cached = iconCache.get(key)
    if (!cached) {
      cached = renderPIcon(size, color)
      iconCache.set(key, cached)
    }
    return cached
  }

  let flakes: Snowflake[] = []
  const startTime = performance.now()
  let rafId = 0
  let stopped = false

  const animate = (ts: number) => {
    if (stopped) return
    const elapsed = ts - startTime
    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)

    // Spawn (taper in last 20s)
    const spawnFactor = elapsed < 40_000 ? 1 : Math.max(0, 1 - (elapsed - 40_000) / 20_000)
    if (flakes.length < MAX_FLAKES && Math.random() < spawnFactor) {
      const count = Math.ceil(SPAWN_RATE * spawnFactor)
      for (let i = 0; i < count && flakes.length < MAX_FLAKES; i++) {
        flakes.push(createFlake(w))
      }
    }

    // Update & draw
    flakes = flakes.filter(f => {
      f.y += f.speed
      f.x += f.wind + Math.sin(ts * f.wobbleSpeed + f.phase) * 0.3
      f.rotation += f.rotSpeed

      if (f.x < -10) f.x = w + 10
      if (f.x > w + 10) f.x = -10
      if (f.y > h + 10) return false

      // Fade in last 15s
      const fadeAlpha = elapsed > 45_000
        ? Math.max(0, f.opacity * (1 - (elapsed - 45_000) / 15_000))
        : f.opacity

      const color = COLORS[f.colorIdx]

      if (f.isIcon) {
        // Draw P icon flake
        const iconSize = Math.round(f.radius * 2.5)
        const icon = getIcon(iconSize, color)
        ctx.save()
        ctx.globalAlpha = fadeAlpha
        ctx.translate(f.x, f.y)
        ctx.rotate(f.rotation)
        ctx.drawImage(icon, -iconSize / 2, -iconSize / 2)
        ctx.restore()
      } else {
        // Circle flake
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = fadeAlpha
        ctx.fill()

        // Glow on larger dots
        if (f.radius > 2.5) {
          ctx.beginPath()
          ctx.arc(f.x, f.y, f.radius * 2, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.globalAlpha = fadeAlpha * 0.15
          ctx.fill()
        }
      }

      ctx.globalAlpha = 1
      return true
    })

    // Auto-stop when time's up and all flakes are gone
    if (elapsed >= DURATION && flakes.length === 0) {
      onDone?.()
      return
    }

    rafId = requestAnimationFrame(animate)
  }

  rafId = requestAnimationFrame(animate)

  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
  }
}
