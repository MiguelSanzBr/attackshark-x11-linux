// Porta do gui/drawing.py do app de desktop: o desenho do mouse e o seletor de cor usam as mesmas contas de lá

export type Point = readonly [x: number, y: number]

/** o create_polygon(smooth=True) do Tk: B-spline quadrática fechada, passa pelo meio de cada aresta */
export function smoothPath(points: readonly Point[]): string {
  const mid = (i: number) => {
    const [ax, ay] = points[i % points.length] as Point
    const [bx, by] = points[(i + 1) % points.length] as Point
    return `${(ax + bx) / 2} ${(ay + by) / 2}`
  }
  return `M${mid(points.length - 1)}` + points.map(([x, y], i) => `Q${x} ${y} ${mid(i)}`).join('') + 'Z'
}

/** rr_points do app passado pela curva suave */
export const roundedPath = (x1: number, y1: number, x2: number, y2: number, r: number) =>
  smoothPath([
    [x1 + r, y1], [x2 - r, y1], [x2, y1], [x2, y1 + r], [x2, y2 - r], [x2, y2],
    [x2 - r, y2], [x1 + r, y2], [x1, y2], [x1, y2 - r], [x1, y1 + r], [x1, y1],
  ])

export interface Hsv {
  h: number
  s: number
  v: number
}

/** colorsys.rgb_to_hsv do Python, com h, s e v em 0..1 */
export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) h = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: ((h + 6) % 6) / 6, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h * 6) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
  }
  return '#' + [5, 3, 1].map((n) => channel(n).toString(16).padStart(2, '0')).join('')
}
