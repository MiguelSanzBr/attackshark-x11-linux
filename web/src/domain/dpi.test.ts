import { describe, expect, it } from 'vitest'
import { T, decodeStep, dpiToStep, encodeStep, stepToDpi } from './dpi'

describe('dpiToStep / stepToDpi', () => {
  // espelha protocol.dpi_to_step e step_to_dpi (test_dpi_steps)
  it.each([
    [50, 1], [800, 16], [10000, 200], [10100, 201], [22000, 320],
  ])('%i DPI <-> passo %i', (dpi, step) => {
    expect(dpiToStep(dpi)).toBe(step)
    expect(stepToDpi(step)).toBe(dpi)
  })

  // espelha protocol.dpi_to_step (test_dpi_rejects)
  it.each([0, 40, 825, 10150, 22100])('recusa %i DPI', (dpi) => {
    expect(() => dpiToStep(dpi)).toThrow(RangeError)
  })
})

describe('encodeStep', () => {
  it('segue a fórmula do sensor em todos os 320 passos', () => {
    // espelha protocol.encode_step (test_encoding_follows_the_sensor_formula)
    for (let n = 1; n <= 320; n++) {
      const [code, low, high] = encodeStep(n)
      expect(Math.abs(code * 42.55 * 2 ** (low + high) - stepToDpi(n))).toBeLessThan(90)
    }
  })

  it('bate com os pontos fixos do Python', () => {
    // espelha protocol.encode_step (test_encoding_follows_the_sensor_formula)
    expect(T).toHaveLength(221)
    expect(encodeStep(1)).toEqual([1, 0, 0])
    expect(encodeStep(210)).toEqual([T[210], 1, 0])
    expect(encodeStep(221)).toEqual([T[121], 0, 1])
    expect(encodeStep(301)).toEqual([118, 1, 1])
    expect(encodeStep(320)).toEqual([T[210], 1, 1])
  })

  it('faixa 301..320 igual a saída do Python, byte a byte', () => {
    // espelha protocol.encode_step(n) for n in range(301, 321), conferido rodando o Python
    const python = [118, 119, 119, 120, 120, 121, 122, 122, 123, 123, 124, 125, 125, 126, 126, 127, 127, 128, 129, 129]
    expect(python.map((_, i) => encodeStep(301 + i))).toEqual(python.map((c) => [c, 1, 1]))
  })

  it('22000 DPI vira o código 0x81 com as duas flags, como lido no X11 de verdade', () => {
    // espelha protocol.encode_step(320), docs/PROTOCOL.md §8
    expect(encodeStep(dpiToStep(22000))).toEqual([0x81, 1, 1])
  })
})

describe('decodeStep', () => {
  it('ida e volta em 1..301', () => {
    // espelha protocol.decode_step (test_decode_round_trips_and_falls_back_to_the_formula)
    for (let n = 1; n <= 301; n++) expect(decodeStep(...encodeStep(n))).toBe(n)
  })

  it('acima de 20000 DPI dois passos dividem o código: ganha o maior', () => {
    // espelha protocol.decode_step (test_decode_round_trips_and_falls_back_to_the_formula)
    expect(decodeStep(...encodeStep(302))).toBe(303)
    expect(decodeStep(...encodeStep(320))).toBe(320)
  })

  it('código desconhecido cai no passo mais perto pela fórmula', () => {
    // espelha protocol.decode_step(100, 1, 1) -> 17000 DPI
    expect(stepToDpi(decodeStep(100, 1, 1))).toBe(17000)
  })
})
