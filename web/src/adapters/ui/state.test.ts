import { describe, expect, it } from 'vitest'
import { readConfig } from '../../test/fixtures'
import { type State, initial, pending, reducer } from './state'

const loaded = (): State => reducer(reducer(initial, { type: 'connect', demo: true }), { type: 'loaded', config: readConfig(), status: 'lido' })

describe('reducer', () => {
  it('conecta, carrega e cria o rascunho igual ao lido', () => {
    const s1 = reducer(initial, { type: 'connect', demo: true })
    expect(s1).toMatchObject({ phase: 'connecting', demo: true, error: false })
    const s2 = reducer(s1, { type: 'loaded', config: readConfig(), status: 'lido' })
    expect(s2).toMatchObject({ phase: 'ready', status: 'lido', plan: null })
    expect(s2.draft).toEqual({ dpi: s2.config!.dpi, light: s2.config!.light, polling: s2.config!.polling })
  })

  it('falha sem config volta pro começo, com config fica pronto', () => {
    const s = reducer(reducer(initial, { type: 'connect', demo: false }), { type: 'failed', status: 'deu ruim' })
    expect(s).toMatchObject({ phase: 'start', error: true, status: 'deu ruim', demo: false })
    expect(reducer({ ...loaded(), phase: 'writing' }, { type: 'failed', status: 'x' })).toMatchObject({ phase: 'ready', error: true })
  })

  it('edita o rascunho sem tocar no lido', () => {
    let s = loaded()
    s = reducer(s, { type: 'stage', index: 0, patch: { dpi: 1200 } })
    s = reducer(s, { type: 'dpi', patch: { ripple: true } })
    s = reducer(s, { type: 'light', patch: { mode: 'neon' } })
    s = reducer(s, { type: 'polling', rate: 500 })
    expect(s.draft?.dpi.stages[0]?.dpi).toBe(1200)
    expect(s.draft?.dpi.stages[1]?.dpi).toBe(1600)
    expect(s.draft?.dpi.ripple).toBe(true)
    expect(s.draft?.light.mode).toBe('neon')
    expect(s.draft?.polling.rate).toBe(500)
    expect(s.config?.dpi.stages[0]?.dpi).toBe(800)
    expect(s.config?.polling.rate).toBe(1000)
    s = reducer(s, { type: 'discard' })
    expect(s.draft?.dpi).toBe(s.config?.dpi)
    expect(s.status).toMatch(/descartad/i)
  })

  it('edição sem nada carregado é ignorada', () => {
    for (const action of [
      { type: 'stage', index: 0, patch: { dpi: 1200 } },
      { type: 'dpi', patch: { ripple: true } },
      { type: 'light', patch: { sleep: 3 } },
      { type: 'polling', rate: 500 },
      { type: 'discard' },
      { type: 'review' },
      { type: 'activeStage', stage: 3 },
    ] as const) {
      expect(reducer(initial, action)).toBe(initial)
    }
  })

  it('revisão: monta o plano, recusa vazio e mostra erro de validação', () => {
    let s = loaded()
    expect(reducer(s, { type: 'review' })).toMatchObject({ phase: 'ready', status: expect.stringMatching(/nenhuma alteração/i) })
    s = reducer(s, { type: 'polling', rate: 250 })
    const review = reducer(s, { type: 'review' })
    expect(review.phase).toBe('review')
    expect(review.plan?.packets).toHaveLength(1)
    expect(reducer(review, { type: 'back' })).toMatchObject({ phase: 'ready', plan: null })
    const writing = reducer(review, { type: 'writing' })
    expect(writing.phase).toBe('writing')
    const bad = reducer(s, { type: 'dpi', patch: { active: 9 } })
    expect(reducer(bad, { type: 'review' })).toMatchObject({ phase: 'ready', error: true, status: expect.stringMatching(/ativo/) })
  })

  it('taxa de polling fora da lista no rascunho vira erro na revisão', () => {
    const s = loaded()
    const weird = { ...s, draft: { ...s.draft!, polling: { raw: s.draft!.polling.raw, rate: 300 as never } } }
    expect(reducer(weird, { type: 'review' }).status).toMatch(/polling/)
  })

  it('bateria e estágio trocado no botão do mouse', () => {
    let s = reducer(loaded(), { type: 'battery', battery: { charging: false, percent: 84 } })
    expect(s.battery).toEqual({ charging: false, percent: 84 })
    s = reducer(s, { type: 'activeStage', stage: 4 })
    expect(s.config?.dpi.active).toBe(4)
    expect(s.draft?.dpi.active).toBe(4)
    // estágio fora da faixa é ignorado
    expect(reducer(s, { type: 'activeStage', stage: 9 })).toBe(s)
    // se o usuário já tinha escolhido outro ativo no rascunho, a escolha dele fica
    s = reducer(s, { type: 'dpi', patch: { active: 1 } })
    s = reducer(s, { type: 'activeStage', stage: 5 })
    expect(s.config?.dpi.active).toBe(5)
    expect(s.draft?.dpi.active).toBe(1)
  })

  it('conta as alterações do rascunho ou diz pq ele não pode ser gravado', () => {
    let s = loaded()
    expect(pending(s)).toBe(0)
    s = reducer(s, { type: 'polling', rate: 250 })
    s = reducer(s, { type: 'stage', index: 0, patch: { dpi: 1200 } })
    expect(pending(s)).toBe(2)
    expect(pending(reducer(s, { type: 'dpi', patch: { active: 9 } }))).toMatch(/ativo/)
  })

  it('desconecta e volta pro estado inicial', () => {
    expect(reducer(loaded(), { type: 'disconnect' })).toEqual(initial)
  })
})
