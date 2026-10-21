import { describe, expect, it } from 'vitest'
import { readConfig } from '../test/fixtures'
import { planChanges as plan, readBackMatches } from './changePlan'
import { encodeDpi, encodeLight, encodePolling } from './reports'

describe('planChanges', () => {
  it('sem mudança não manda nada', () => {
    const cfg = readConfig()
    expect(plan(cfg, cfg)).toEqual({ changes: [], packets: [] })
  })

  it('lista cada campo de DPI mudado e manda só o report 0x04', () => {
    const read = readConfig()
    const stages = read.dpi.stages.slice()
    stages[0] = { ...stages[0]!, dpi: 1200, color: '#123456' }
    stages[6] = { ...stages[6]!, on: true }
    const dpi = { ...read.dpi, stages, active: 3, angleSnap: true, ripple: true }
    const draft = { ...read, dpi }
    expect(plan(read, draft)).toEqual({
      changes: [
        { label: 'Estágio 1: DPI', from: '800', to: '1200' },
        { label: 'Estágio 1: cor', from: '#ff0000', to: '#123456' },
        { label: 'Estágio 7', from: 'desligado', to: 'ligado' },
        { label: 'Estágio ativo', from: '2', to: '3' },
        { label: 'Angle snap', from: 'não', to: 'sim' },
        { label: 'Ripple control', from: 'não', to: 'sim' },
      ],
      packets: [encodeDpi(dpi)],
    })
  })

  it('lista a luz com o nome do modo e manda só o report 0x05', () => {
    const read = readConfig()
    const light = { ...read.light, mode: 'breathing_dpi' as const, color: '#ff8000', brightness: 5, speed: 1, sleep: 5, deepSleep: 20, debounce: 8 }
    const result = plan(read, { ...read, light })
    expect(result.changes).toEqual([
      { label: 'Efeito de luz', from: 'Desligado', to: 'Respiração por DPI' },
      { label: 'Cor da luz', from: '#00ff00', to: '#ff8000' },
      { label: 'Brilho', from: '8', to: '5' },
      { label: 'Velocidade do efeito', from: '3', to: '1' },
      { label: 'Sono', from: '1 min', to: '5 min' },
      { label: 'Sono profundo', from: '10 min', to: '20 min' },
      { label: 'Debounce dos botões', from: '4', to: '8' },
    ])
    expect(result.packets).toEqual([encodeLight(light)])
  })

  it('modo de luz desconhecido aparece com o número', () => {
    const read = readConfig()
    const result = plan({ ...read, light: { ...read.light, mode: 9 } }, read)
    expect(result.changes).toEqual([{ label: 'Efeito de luz', from: 'desconhecido (9)', to: 'Desligado' }])
  })

  it('polling: manda o report 0x06, e taxa lida desconhecida aparece como tal', () => {
    const read = readConfig()
    const draft = { ...read, polling: { ...read.polling, rate: 500 as const } }
    expect(plan(read, draft)).toEqual({
      changes: [{ label: 'Polling rate', from: '1000 Hz', to: '500 Hz' }],
      packets: [encodePolling(500)],
    })
    expect(plan({ ...read, polling: { ...read.polling, rate: null } }, draft).changes[0]?.from).toBe('desconhecido')
  })

  it('manda na ordem do app oficial: 0x04, 0x05, 0x06', () => {
    const read = readConfig()
    const draft = {
      dpi: { ...read.dpi, ripple: true },
      light: { ...read.light, sleep: 2 },
      polling: { ...read.polling, rate: 125 as const },
    }
    expect(plan(read, draft).packets.map((p) => p[0])).toEqual([0x04, 0x05, 0x06])
  })

  it('config inválida estoura antes de gerar qualquer pacote', () => {
    const read = readConfig()
    const draft = { ...read, dpi: { ...read.dpi, stages: read.dpi.stages.map((s) => ({ ...s, on: false })) } }
    expect(() => plan(read, draft)).toThrow(/pelo menos um/)
  })
})

describe('readBackMatches', () => {
  it('confere cada pacote enviado com o report relido', () => {
    const read = readConfig()
    const dpi = encodeDpi({ ...read.dpi, ripple: true })
    const polling = encodePolling(500)
    const after = { ...read, dpi: { ...read.dpi, raw: dpi }, polling: { raw: polling, rate: 500 as const } }
    expect(readBackMatches([dpi, polling], after)).toBe(true)
    expect(readBackMatches([dpi, encodePolling(250)], after)).toBe(false)
    expect(readBackMatches([dpi.slice(0, 20)], after)).toBe(false)
    expect(readBackMatches([Uint8Array.of(0x08, 59)], after)).toBe(false)
  })
})
