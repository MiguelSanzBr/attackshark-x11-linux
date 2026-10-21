import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex, roundedPath, smoothPath } from './drawing'

describe('smoothPath', () => {
  it('fecha a curva igual ao polygon smooth do Tk: passa pelo meio das arestas e usa o vértice de controle', () => {
    expect(smoothPath([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe('M0 5Q0 0 5 0Q10 0 10 5Q10 10 5 10Q0 10 0 5Z')
  })
})

describe('roundedPath', () => {
  it('usa os pontos do rr_points do app', () => {
    expect(roundedPath(0, 0, 20, 10, 4)).toBe(
      smoothPath([[4, 0], [16, 0], [20, 0], [20, 4], [20, 6], [20, 10], [16, 10], [4, 10], [0, 10], [0, 6], [0, 4], [0, 0]]),
    )
  })
})

describe('hexToHsv / hsvToHex', () => {
  it('converte as cores puras, cinza e preto', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00')).toEqual({ h: 1 / 3, s: 1, v: 1 })
    expect(hexToHsv('#0000ff')).toEqual({ h: 2 / 3, s: 1, v: 1 })
    expect(hexToHsv('#ff00ff').h).toBeCloseTo(5 / 6)
    expect(hexToHsv('#808080')).toEqual({ h: 0, s: 0, v: 128 / 255 })
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('faz ida e volta', () => {
    for (const c of ['#ff0000', '#80ff00', '#00ffff', '#ff4000', '#123456', '#ffffff', '#000000']) {
      expect(hsvToHex(hexToHsv(c))).toBe(c)
    }
    expect(hsvToHex({ h: 0.25, s: 1, v: 0.5 })).toBe('#408000')
  })
})
