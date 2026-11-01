// стираемая фольга и конфетти темы scratch: сердца на билете и полосы с призами работают одинаково
interface FoilOptions {
  threshold: number // какая доля холста должна быть стёрта, чтобы фольга сошла целиком
  onTouch?: () => void
  onClear?: () => void
}

function paint(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const ratio = Math.min(devicePixelRatio, 2)
  const { clientWidth: w, clientHeight: h } = canvas
  canvas.width = w * ratio
  canvas.height = h * ratio
  ctx.scale(ratio, ratio)
  const gold = ctx.createLinearGradient(0, 0, w, h)
  gold.addColorStop(0, '#f7dc8a')
  gold.addColorStop(0.32, '#c99a2e')
  gold.addColorStop(0.5, '#fff0b8')
  gold.addColorStop(0.72, '#b98a1f')
  gold.addColorStop(1, '#efcf74')
  ctx.fillStyle = gold
  ctx.fillRect(0, 0, w, h)
  // мелкое зерно: без него заливка выглядит пластиком, а не фольгой
  for (let i = 0; i < (w * h) / 14; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(90,55,0,.14)'
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1)
  }
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(20, Math.min(w, h) * 0.34)
  return { ctx, w, h }
}

export function initFoil(canvas: HTMLCanvasElement, { threshold, onTouch, onClear }: FoilOptions) {
  const { ctx, w, h } = paint(canvas)
  let last: { x: number, y: number } | null = null
  let moves = 0

  const clear = () => {
    if (canvas.classList.contains('is-clear'))
      return
    canvas.classList.add('is-clear')
    onClear?.()
  }
  // координаты в единицах холста: блок мог поменять размер, пока грузились шрифты
  const point = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect()
    return { x: (e.clientX - box.left) * w / box.width, y: (e.clientY - box.top) * h / box.height }
  }
  const stroke = (to: { x: number, y: number }) => {
    ctx.beginPath()
    ctx.moveTo(last!.x, last!.y)
    ctx.lineTo(to.x + 0.01, to.y)
    ctx.stroke()
    last = to
  }
  const check = () => {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let empty = 0
    for (let i = 3; i < data.length; i += 64) {
      if (data[i] === 0)
        empty += 1
    }
    if (empty / (data.length / 64) > threshold)
      clear()
  }

  canvas.addEventListener('pointerdown', (e) => {
    onTouch?.()
    canvas.setPointerCapture(e.pointerId)
    last = point(e)
    stroke(last)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!last)
      return
    stroke(point(e))
    moves += 1
    if (moves % 6 === 0)
      check()
  })
  const release = () => {
    last = null
    check()
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  return { clear }
}

export function confetti(from: Element, count: number, power: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  const origin = from.getBoundingClientRect()
  const sky = document.createElement('canvas')
  sky.className = 'sc-sky'
  sky.width = innerWidth
  sky.height = innerHeight
  document.body.append(sky)
  const ctx = sky.getContext('2d')!
  const colors = ['#e8c15a', '#fff0b8', '#c9182f', '#ffffff', '#f08a4b']
  const flakes = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1
    const speed = power * (0.35 + Math.random() * 0.75)
    return {
      x: origin.left + origin.width / 2,
      y: origin.top + origin.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      spin: Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
  })
  const start = performance.now()
  const frame = (now: number) => {
    const t = now - start
    ctx.clearRect(0, 0, sky.width, sky.height)
    for (const f of flakes) {
      f.vy += 0.16
      f.vx *= 0.992
      f.x += f.vx
      f.y += f.vy
      f.spin += 0.16
      ctx.globalAlpha = Math.max(0, 1 - t / 2400)
      ctx.fillStyle = f.color
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(f.spin)
      ctx.scale(1, Math.cos(f.spin * 1.4))
      ctx.fillRect(-f.size / 2, -f.size / 3, f.size, f.size * 0.66)
      ctx.restore()
    }
    if (t < 2400)
      requestAnimationFrame(frame)
    else sky.remove()
  }
  requestAnimationFrame(frame)
}
