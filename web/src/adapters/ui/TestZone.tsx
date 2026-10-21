import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { type MousePart, partForButton, wheelDirection } from '../../domain/buttons'
import { MouseArt, type WheelPulse } from './MouseArt'

// a roda não tem "soltou", então a seta some sozinha depois desse tempo
const PULSE_MS = 450

/**
 * Desenho do mouse q acende o botão apertado, igual o app de desktop. O WebHID não deixa ler os
 * botões do próprio mouse, então vem dos eventos de clique da página e funciona com qualquer mouse
 */
export function TestZone({ led, frame }: { led: string; frame: string }) {
  const zone = useRef<HTMLDivElement>(null)
  const [pressed, setPressed] = useState<ReadonlySet<MousePart>>(new Set())
  const [wheel, setWheel] = useState<WheelPulse | null>(null)

  useEffect(() => {
    const el = zone.current as HTMLDivElement
    let timer: ReturnType<typeof setTimeout> | undefined
    let n = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const direction = wheelDirection(e.deltaY)
      if (!direction) return
      clearTimeout(timer)
      setWheel({ direction, n: ++n })
      timer = setTimeout(() => setWheel(null), PULSE_MS)
    }
    // o onWheel do React é passivo, sem o listener nativo o preventDefault não segura a rolagem da página
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(timer)
    }
  }, [])

  function press(e: MouseEvent, down: boolean) {
    // no mouseup o 3 e o 4 viram voltar/avançar do navegador, e o mousedown do meio liga o autoscroll
    e.preventDefault()
    const part = partForButton(e.button)
    if (!part) return
    setPressed((prev) => {
      const next = new Set(prev)
      if (down) next.add(part)
      else next.delete(part)
      return next
    })
  }

  return (
    <div ref={zone} role="group" aria-labelledby="test-zone-label" className="test-zone"
      onMouseDown={(e) => press(e, true)} onMouseUp={(e) => press(e, false)}
      onMouseLeave={() => setPressed(new Set())}
      onContextMenu={(e) => e.preventDefault()} onAuxClick={(e) => e.preventDefault()}>
      <span id="test-zone-label" className="test-zone-label">Área de teste</span>
      <div className={frame}>
        <MouseArt led={led} pressed={pressed} wheel={wheel} />
      </div>
      <p className="test-hint">Clique com o mouse: os botões acendem aqui.</p>
    </div>
  )
}
