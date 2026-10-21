import { describe, expect, it } from 'vitest'
import { MAX_STAGES, checkLight, checkStages, dpi, lightEffectName, pollingRate } from './model'

const stage = (on = true) => ({ dpi: 800, on, color: '#ff0000' })
const light = { mode: 'off' as const, speed: 3, brightness: 8, deepSleep: 10, color: '#00ff00', sleep: 1, debounce: 4 }

describe('dpi (valor)', () => {
  // mesma regra do protocol.dpi_to_step: 50..10000 de 50 em 50, 10100..22000 de 100 em 100
  it.each([50, 800, 10000, 10100, 22000])('aceita %i', (v) => expect(dpi(v)).toBe(v))
  it.each([0, 40, 825, 10150, 22100, 800.5, Number.NaN])('recusa %s', (v) => expect(() => dpi(v)).toThrow(RangeError))
})

describe('pollingRate (valor)', () => {
  // espelha protocol.POLLING_CODES: só as 4 taxas q o app oferece pro X11
  it.each([125, 250, 500, 1000])('aceita %i Hz', (hz) => expect(pollingRate(hz)).toBe(hz))
  it.each([0, 300, 2000, 4000])('recusa %i Hz', (hz) => expect(() => pollingRate(hz)).toThrow(/polling/))
})

describe('checkStages (invariantes dos estágios)', () => {
  it('aceita até 8 estágios com pelo menos um ligado e ativo dentro da lista', () => {
    expect(MAX_STAGES).toBe(8)
    expect(() => checkStages(Array.from({ length: 8 }, () => stage()), 8)).not.toThrow()
    expect(() => checkStages([stage(false), stage()], 1)).not.toThrow()
  })

  it('recusa nenhum ligado, mais de 8, lista vazia e ativo fora da faixa', () => {
    expect(() => checkStages([stage(false)], 1)).toThrow(/pelo menos um/)
    expect(() => checkStages([], 1)).toThrow(/pelo menos um/)
    expect(() => checkStages(Array.from({ length: 9 }, () => stage()), 1)).toThrow(/no máximo 8/)
    expect(() => checkStages([stage(), stage()], 0)).toThrow(/ativo/)
    expect(() => checkStages([stage(), stage()], 3)).toThrow(/ativo/)
    expect(() => checkStages([stage(), stage()], 1.5)).toThrow(/ativo/)
  })

  it('recusa DPI inválido em qualquer estágio', () => {
    expect(() => checkStages([stage(), { ...stage(), dpi: 825 }], 1)).toThrow(RangeError)
  })
})

describe('checkLight (limites da luz e energia)', () => {
  it('aceita o padrão de fábrica', () => expect(() => checkLight(light)).not.toThrow())

  // espelha config.encode_light: limites de cada campo
  it.each([
    ['speed', 0, /velocidade/], ['speed', 6, /velocidade/], ['brightness', 0, /brilho/], ['brightness', 9, /brilho/],
    ['sleep', 0, /sono precisa/], ['sleep', 61, /sono precisa/], ['deepSleep', 0, /sono profundo/], ['deepSleep', 61, /sono profundo/],
    ['debounce', 1, /debounce/], ['debounce', 26, /debounce/], ['sleep', 2.5, /sono precisa/],
  ] as const)('recusa %s = %s', (key, value, msg) => {
    expect(() => checkLight({ ...light, [key]: value })).toThrow(msg)
  })
})

describe('lightEffectName', () => {
  it('nomeia os 7 efeitos e mostra o número de um desconhecido', () => {
    expect(lightEffectName('breathing_dpi')).toBe('Respiração por DPI')
    expect(lightEffectName(9)).toBe('desconhecido (9)')
  })
})
