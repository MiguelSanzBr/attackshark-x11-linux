import type { MousePart, WheelDirection } from '../../domain/buttons'
import { type Point, roundedPath, smoothPath } from './drawing'

// Coordenadas do gui/mouse.py do app de desktop (contorno tirado da silhueta do render oficial, 200 de largura)
const BODY: Point[] = [[117, 0], [185, 26], [186, 33], [188, 33], [189, 28], [193, 35], [195, 70], [192, 126], [192, 183],
  [199, 271], [198, 302], [193, 322], [186, 338], [177, 352], [157, 370], [141, 379], [120, 384], [95, 385],
  [71, 381], [48, 369], [28, 350], [15, 326], [9, 305], [7, 283], [9, 228], [9, 128], [7, 75], [8, 37],
  [12, 30], [14, 36], [15, 29], [21, 25], [53, 14], [81, 1], [85, 1], [86, 17], [114, 17], [115, 2]]
const SPLIT_Y = 177
const CENTER_X = 101
const LEFT: Point[] = [[12, 30], [21, 25], [53, 14], [81, 1], [85, 1], [86, 17], [86, 110], [CENTER_X, 116],
  [CENTER_X, SPLIT_Y], [9, SPLIT_Y], [9, 128], [7, 75], [8, 37]]
const RIGHT: Point[] = [[117, 0], [185, 26], [189, 28], [193, 35], [195, 70], [192, 126], [192, SPLIT_Y],
  [CENTER_X, SPLIT_Y], [CENTER_X, 116], [116, 110], [114, 17], [115, 2]]
const WHEEL = [88, 22, 115, 104] as const
const FORWARD = [0, 132, 10, 163] as const
const BACK = [0, 186, 10, 215] as const

// o mouse fica no meio, com 150 de cada lado pras etiquetas, igual o CALLOUT_W do app
const OX = 150
const CALLOUT_W = 132
const CALLOUTS = [
  { label: 'Botão esquerdo', side: 'l', y: 60, to: [45, 80] },
  { label: 'Lateral da frente', side: 'l', y: 150, to: [5, 147] },
  { label: 'Lateral de trás', side: 'l', y: 205, to: [5, 200] },
  { label: 'Botão do meio', side: 'r', y: 40, to: [CENTER_X, 63] },
  { label: 'Botão direito', side: 'r', y: 95, to: [155, 80] },
] as const

const box = ([x1, y1, x2, y2]: readonly [number, number, number, number], r: number) => roundedPath(x1, y1, x2, y2, r)

/** n muda a cada giro, pra seta reiniciar a animação mesmo na mesma direção */
export interface WheelPulse {
  direction: WheelDirection
  n: number
}

interface Props {
  led: string
  pressed: ReadonlySet<MousePart>
  wheel: WheelPulse | null
}

const WHEEL_X = (WHEEL[0] + WHEEL[2]) / 2
const WHEEL_Y = (WHEEL[1] + WHEEL[3]) / 2

/** o X11 visto de cima; o LED acende com a cor do estágio de DPI ativo e os botões apertados acendem em verde */
export function MouseArt({ led, pressed, wheel }: Props) {
  const button = (part: MousePart, d: string) => (
    <path className={pressed.has(part) ? 'part lit' : 'part'} data-part={part} d={d} />
  )
  return (
    <svg className="mouse-art" viewBox="0 -6 500 400" role="img" aria-label="ATTACK SHARK X11 visto de cima">
      <g className="mouse" transform={`translate(${OX} 0)`}>
        <path className="part" d={smoothPath(BODY)} />
        {button('left', smoothPath(LEFT))}
        {button('right', smoothPath(RIGHT))}
        {button('middle', box(WHEEL, 6))}
        {button('forward', box(FORWARD, 6))}
        {button('back', box(BACK, 6))}
        {[32, 41, 50, 59, 68, 77, 86, 95].map((y) => (
          <path key={y} className="grip" d={`M92 ${y}H111`} />
        ))}
        <path className="part" d={box([95, 114, 107, 136], 5)} />
        {wheel && (
          <path key={wheel.n} className={`wheel-arrow ${wheel.direction}`}
            d={wheel.direction === 'up'
              ? `M${WHEEL_X - 8} ${WHEEL_Y + 4}L${WHEEL_X} ${WHEEL_Y - 5}L${WHEEL_X + 8} ${WHEEL_Y + 4}`
              : `M${WHEEL_X - 8} ${WHEEL_Y - 4}L${WHEEL_X} ${WHEEL_Y + 5}L${WHEEL_X + 8} ${WHEEL_Y - 4}`} />
        )}
        <path className="led" d={box([93, 184, 109, 188], 2)} fill={led} style={{ color: led }} />
      </g>
      <g className="callouts">
        {CALLOUTS.map(({ label, side, y, to: [tx, ty] }) => {
          const x1 = side === 'l' ? 4 : OX + 214
          const edge = side === 'l' ? x1 + CALLOUT_W : x1
          return (
            <g key={label}>
              <path className="callout-line" d={`M${edge} ${y}L${tx + OX} ${ty}`} />
              <circle className="callout-dot" cx={tx + OX} cy={ty} r={3} />
              <path className="callout-box" d={roundedPath(x1, y - 14, x1 + CALLOUT_W, y + 14, 10)} />
              <text className="callout-text" x={x1 + 12} y={y + 4.5}>{label}</text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
