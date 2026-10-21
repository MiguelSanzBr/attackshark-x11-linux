import { describe, expect, it } from 'vitest'
import { fromHex } from '../test/hex'
import { checksum } from './protocol'
import {
  decodeDpi, decodeLight, decodePolling, defaultDpi, defaultLight, encodeDpi, encodeLight, encodePolling,
} from './reports'

// bytes gerados rodando o Python (config.encode_dpi(config.default_dpi()) e afins)
const DPI_DEFAULT = fromHex('04380100003f20201225384b75811212000000000001000002ff000000ff000000ffffff0000ffffff00ffff4000ffffff020f8b00000000')
const DPI_EDIT = fromHex('04380100007f60601c25384b75818e12000000000001000003ff000000ff000000ffffff0000ffffff00ffff4000ffffff0210d200000000')
const LIGHT_DEFAULT = fromHex('050f010003a800ff00010401af0000')
const LIGHT_EDIT = fromHex('050f01102113ff8000050801d00000')
const LIGHT_NEON = fromHex('050f01302118ff8000050801f50000')

describe('report 0x04 (DPI)', () => {
  it('padrão de fábrica sai igual ao Python e faz ida e volta', () => {
    // espelha config.encode_dpi(config.default_dpi()) (test_dpi_defaults_round_trip)
    const raw = encodeDpi(defaultDpi())
    expect(raw).toEqual(DPI_DEFAULT)
    expect(raw.slice(50, 52)).toEqual(checksum(raw.slice(3, 50)))
    const cfg = decodeDpi(raw)
    expect(cfg.stages.map((s) => s.dpi)).toEqual([800, 1600, 2400, 3200, 5000, 22000, 800, 800])
    expect(cfg.stages.map((s) => s.on)).toEqual([true, true, true, true, true, true, false, false])
    expect(cfg.stages[6]?.color).toBe('#ff4000')
    expect(cfg.active).toBe(2)
    expect(encodeDpi(cfg)).toEqual(raw)
  })

  it('edição gera os mesmos bytes do Python', () => {
    // espelha config.encode_dpi com stage 1 = 1200, stage 7 = 12100 ligado, ativo 3
    const cfg = defaultDpi()
    cfg.stages[0] = { ...cfg.stages[0]!, dpi: 1200 }
    cfg.stages[6] = { ...cfg.stages[6]!, dpi: 12100, on: true }
    expect(encodeDpi({ ...cfg, active: 3 })).toEqual(DPI_EDIT)
    expect(decodeDpi(DPI_EDIT).stages[6]?.dpi).toBe(12100)
  })

  it('mexe só nos campos conhecidos e devolve o resto como veio', () => {
    // espelha config.encode_dpi (test_dpi_edit_keeps_unknown_bytes)
    const raw = DPI_DEFAULT.slice()
    raw.set([9, 8, 7, 6], 52)
    const cfg = decodeDpi(raw)
    cfg.stages[0] = { ...cfg.stages[0]!, dpi: 12100, color: '#123456' }
    const out = encodeDpi({ ...cfg, angleSnap: true, ripple: true, active: 1 })
    expect([out[3], out[4], out[24]]).toEqual([1, 1, 1])
    expect(out.slice(52)).toEqual(Uint8Array.of(9, 8, 7, 6))
    expect(out[6]! & 1).toBe(1)
    expect(out[7]).toBe(out[6])
    expect(out.slice(25, 28)).toEqual(Uint8Array.of(0x12, 0x34, 0x56))
    expect(decodeDpi(out).stages[0]?.dpi).toBe(12100)
  })

  it('estágio nunca configurado (código 0) aparece como 800 e volta como zero se seguir desligado', () => {
    // espelha config.decode_dpi: o X11 real veio de fábrica com estágios 7-8 em código 0 (PROTOCOL.md §8)
    const raw = DPI_DEFAULT.slice()
    raw[14] = 0
    raw.set(checksum(raw.slice(3, 50)), 50)
    const cfg = decodeDpi(raw)
    expect(cfg.stages[6]?.dpi).toBe(800)
    expect(encodeDpi(cfg)[14]).toBe(0)
    cfg.stages[6] = { ...cfg.stages[6]!, on: true }
    expect(encodeDpi(cfg)[14]).toBe(DPI_DEFAULT[8 + 0]) // ligou: codifica 800 de verdade
  })

  it('estágio ativo lido fora de 1..8 é limitado', () => {
    // espelha config.decode_dpi: active = min(max(raw[24], 1), 8)
    for (const [byte, active] of [[0, 1], [9, 8]] as const) {
      const raw = DPI_DEFAULT.slice()
      raw[24] = byte
      raw.set(checksum(raw.slice(3, 50)), 50)
      expect(decodeDpi(raw).active).toBe(active)
    }
  })

  it('recusa config sem estágio ligado, ativo inválido, checksum errado e tamanho errado', () => {
    // espelha config.encode_dpi / decode_dpi (test_dpi_rejects)
    const cfg = defaultDpi()
    expect(() => encodeDpi({ ...cfg, stages: cfg.stages.map((s) => ({ ...s, on: false })) })).toThrow(/pelo menos um/)
    expect(() => encodeDpi({ ...cfg, active: 9 })).toThrow(/ativo/)
    const bad = DPI_DEFAULT.slice()
    bad[50]! ^= 1
    expect(() => decodeDpi(bad)).toThrow(/checksum/)
    expect(() => decodeDpi(DPI_DEFAULT.slice(0, 20))).toThrow(/não é um report/)
    const otherId = DPI_DEFAULT.slice()
    otherId[0] = 0x05
    expect(() => decodeDpi(otherId)).toThrow(/não é um report/)
  })
})

describe('report 0x05 (luz, sono, debounce)', () => {
  it('padrão sai igual ao Python', () => {
    // espelha config.encode_light(config.default_light()) (test_light_round_trip_and_fields)
    expect(encodeLight(defaultLight())).toEqual(LIGHT_DEFAULT)
    const cfg = decodeLight(LIGHT_DEFAULT)
    expect(cfg).toMatchObject({ mode: 'off', speed: 3, brightness: 8, deepSleep: 10, sleep: 1, debounce: 4, color: '#00ff00' })
  })

  it('edição gera os mesmos bytes do Python e brilho só vai nos modos estáticos', () => {
    // espelha config.encode_light com static, brilho 3, velocidade 5, deep sleep 33
    const cfg = { ...defaultLight(), mode: 'static' as const, brightness: 3, speed: 5, deepSleep: 33, color: '#ff8000', sleep: 5, debounce: 8 }
    expect(encodeLight(cfg)).toEqual(LIGHT_EDIT)
    expect(decodeLight(LIGHT_EDIT)).toMatchObject({ mode: 'static', brightness: 3, speed: 5, deepSleep: 33, color: '#ff8000' })
    // espelha config.encode_light com mode neon: brilho vira 8
    expect(encodeLight({ ...cfg, mode: 'neon' })).toEqual(LIGHT_NEON)
    expect(decodeLight(encodeLight({ ...cfg, mode: 'static_dpi' })).brightness).toBe(3)
  })

  it('modo desconhecido vira número e volta igual', () => {
    // espelha config.decode_light (test_light_unknown_mode_and_limits)
    const raw = LIGHT_DEFAULT.slice()
    raw[3] = 0x90
    raw.set(checksum(raw.slice(3, 11)), 11)
    const cfg = decodeLight(raw)
    expect(cfg.mode).toBe(9)
    expect(encodeLight(cfg)[3]).toBe(0x90)
  })

  it('velocidade lida fora da faixa é limitada a 1..5', () => {
    // espelha config.decode_light: min(max(6 - (raw[4] & 0x0F), 1), 5)
    for (const [nibble, speed] of [[0, 5], [9, 1]] as const) {
      const raw = LIGHT_DEFAULT.slice()
      raw[4] = nibble
      raw.set(checksum(raw.slice(3, 11)), 11)
      expect(decodeLight(raw).speed).toBe(speed)
    }
  })

  it.each([
    ['speed', 0], ['speed', 6], ['brightness', 0], ['brightness', 9], ['sleep', 0], ['sleep', 61],
    ['deepSleep', 0], ['deepSleep', 61], ['debounce', 1], ['debounce', 26],
  ] as const)('recusa %s = %i', (key, value) => {
    // espelha config.encode_light: limites de cada campo
    expect(() => encodeLight({ ...defaultLight(), [key]: value })).toThrow(RangeError)
  })

  it('recusa checksum errado', () => {
    const bad = LIGHT_DEFAULT.slice()
    bad[12]! ^= 1
    expect(() => decodeLight(bad)).toThrow(/checksum/)
  })
})

describe('report 0x06 (polling)', () => {
  it('codifica com o complemento e decodifica', () => {
    // espelha config.encode_polling / decode_polling (test_polling)
    const raw = encodePolling(500)
    expect(raw).toEqual(Uint8Array.of(6, 9, 1, 2, 0xfd, 0, 0, 0, 0))
    expect(decodePolling(raw).rate).toBe(500)
    expect(decodePolling(encodePolling(1000)).rate).toBe(1000)
    expect(decodePolling(Uint8Array.of(6, 9, 1, 0x10, 0xef, 0, 0, 0, 0)).rate).toBeNull()
  })

  it('recusa taxa fora da lista e report errado', () => {
    expect(() => encodePolling(300)).toThrow(RangeError)
    expect(() => decodePolling(Uint8Array.of(6, 8, 1, 1))).toThrow(/não é um report/)
  })
})
