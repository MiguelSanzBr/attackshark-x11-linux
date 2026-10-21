import { type CSSProperties, type PointerEvent, useState } from 'react'
import { type Hsv, hexToHsv, hsvToHex } from './drawing'

// as mesmas cores prontas do ColorPicker do app
const PRESETS = ['#ff0000', '#ff7a00', '#ffd400', '#4cd964', '#00e5ff', '#0066ff', '#7a00ff', '#ff2bd6', '#ffffff', '#000000']

interface Props {
  color: string
  /** nome acessível do campo hex, ex. "Estágio 2: cor" */
  label: string
  onChange: (color: string) => void
}

/** roda de matiz/saturação, barra de intensidade, hex e cores prontas, igual o seletor do app */
export function ColorPicker({ color, label, onChange }: Props) {
  // guarda o HSV pq o hex perde a matiz no preto e no cinza; se a cor mudou por fora, vale a de fora
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color))
  const cur = hsvToHex(hsv) === color ? hsv : hexToHsv(color)
  const [typed, setTyped] = useState<string | null>(null)

  const emit = (next: Hsv) => {
    setHsv(next)
    onChange(hsvToHex(next))
  }

  function pick(e: PointerEvent<HTMLDivElement>) {
    if (!e.buttons) return
    const r = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - r.left - r.width / 2
    const dy = e.clientY - r.top - r.height / 2
    const h = ((Math.atan2(-dy, dx) / (2 * Math.PI)) + 1) % 1
    // escolher matiz com a intensidade no zero não mostraria nada
    emit({ h, s: Math.min(Math.hypot(dx, dy) / (r.width / 2), 1), v: cur.v < 0.05 ? 1 : cur.v })
  }

  function type(text: string) {
    setTyped(text)
    const m = /^#?([0-9a-f]{6})$/i.exec(text.trim())
    if (m) onChange('#' + (m[1] as string).toLowerCase())
  }

  const angle = cur.h * 2 * Math.PI
  const knob = { left: `${50 + 50 * cur.s * Math.cos(angle)}%`, top: `${50 - 50 * cur.s * Math.sin(angle)}%`, background: color }
  return (
    <div className="picker">
      <div className="picker-main">
        <div
          className="wheel"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            pick(e)
          }}
          onPointerMove={pick}
        >
          <div className="wheel-shade" style={{ opacity: 1 - cur.v }} />
          <span className="wheel-knob" style={knob} />
        </div>
        <input
          className="value-bar"
          type="range"
          min={0}
          max={100}
          value={Math.round(cur.v * 100)}
          aria-label="Intensidade da cor"
          aria-valuetext={`${Math.round(cur.v * 100)}%`}
          style={{ '--hue': hsvToHex({ ...cur, v: 1 }) } as CSSProperties}
          onChange={(e) => emit({ ...cur, v: Number(e.target.value) / 100 })}
        />
        <div className="picker-side">
          <span className="swatch-big" style={{ background: color }} />
          <input
            className="hex"
            aria-label={label}
            value={typed ?? color}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            onChange={(e) => type(e.target.value)}
            onBlur={() => setTyped(null)}
          />
        </div>
      </div>
      <div className="presets" role="group" aria-label="Cores prontas">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className="preset"
            aria-label={`Cor ${c}`}
            aria-pressed={c === color}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  )
}
