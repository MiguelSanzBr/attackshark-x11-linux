import { useEffect, useRef } from 'react'
import type { ChangePlan } from '../../domain/changePlan'

interface Props {
  plan: ChangePlan
  busy: boolean
  onConfirm: () => void
  onBack: () => void
}

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0')

export function Review({ plan, busy, onConfirm, onBack }: Props) {
  const title = useRef<HTMLHeadingElement>(null)
  // foco só ao abrir: se fosse em todo render o heartbeat da bateria roubaria o foco dos botões
  useEffect(() => (title.current as HTMLHeadingElement).focus(), [])
  return (
    <div className="overlay">
      <section role="dialog" aria-modal="true" aria-labelledby="review-title" className="dialog"
        onKeyDown={(e) => e.key === 'Escape' && !busy && onBack()}>
        <h2 id="review-title" tabIndex={-1} ref={title}>Confirmar gravação</h2>
        <p className="hint">Isso vai ser gravado no mouse. Depois o app relê tudo pra conferir.</p>
        <ul className="changes">
          {plan.changes.map((c) => (
            <li key={c.label}>
              <span className="change-label">{c.label}</span>
              <span className="sr-only">: </span>
              <span className="change-values">
                <span className="from">{c.from}</span> → <span className="to">{c.to}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="hint mono">
          Reports enviados: {plan.packets.map((p) => `${hex(p[0] as number)} (${p.length} bytes)`).join(', ')}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button ghost" disabled={busy} onClick={onBack}>Voltar</button>
          <button type="button" className="button primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Gravando…' : 'Gravar no mouse'}
          </button>
        </div>
      </section>
    </div>
  )
}
