import { planChanges } from '../../application/useCases'
import type { ChangePlan } from '../../domain/changePlan'
import type { Battery, DpiSettings, DpiStage, LightSettings, MouseConfig, MouseSettings, PollingRate } from '../../domain/model'

export type Phase = 'start' | 'connecting' | 'ready' | 'review' | 'writing'

export interface State {
  phase: Phase
  demo: boolean
  /** o q foi lido do mouse por último */
  config: MouseConfig | null
  /** o q o usuário tá editando; só vai pro mouse depois da confirmação */
  draft: MouseSettings | null
  plan: ChangePlan | null
  battery: Battery | null
  status: string
  error: boolean
}

export const initial: State = {
  phase: 'start', demo: false, config: null, draft: null, plan: null, battery: null, status: '', error: false,
}

export type Action =
  | { type: 'connect'; demo: boolean }
  | { type: 'loaded'; config: MouseConfig; status: string }
  | { type: 'failed'; status: string }
  | { type: 'stage'; index: number; patch: Partial<DpiStage> }
  | { type: 'dpi'; patch: Partial<Pick<DpiSettings, 'active' | 'angleSnap' | 'ripple'>> }
  | { type: 'light'; patch: Partial<LightSettings> }
  | { type: 'polling'; rate: PollingRate }
  | { type: 'discard' }
  | { type: 'review' }
  | { type: 'back' }
  | { type: 'writing' }
  | { type: 'battery'; battery: Battery }
  | { type: 'activeStage'; stage: number }
  | { type: 'disconnect' }

function edit(state: State, change: (d: MouseSettings) => MouseSettings): State {
  return state.draft ? { ...state, draft: change(state.draft), error: false } : state
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connect':
      return { ...initial, phase: 'connecting', demo: action.demo, status: 'Lendo a configuração do mouse…' }
    case 'loaded': {
      const { dpi, light, polling } = action.config
      return { ...state, phase: 'ready', config: action.config, draft: { dpi, light, polling }, plan: null, status: action.status, error: false }
    }
    case 'failed':
      return { ...state, phase: state.config ? 'ready' : 'start', plan: null, status: action.status, error: true }
    case 'stage':
      return edit(state, (d) => ({
        ...d,
        dpi: { ...d.dpi, stages: d.dpi.stages.map((s, i) => (i === action.index ? { ...s, ...action.patch } : s)) },
      }))
    case 'dpi':
      return edit(state, (d) => ({ ...d, dpi: { ...d.dpi, ...action.patch } }))
    case 'light':
      return edit(state, (d) => ({ ...d, light: { ...d.light, ...action.patch } }))
    case 'polling':
      return edit(state, (d) => ({ ...d, polling: { ...d.polling, rate: action.rate } }))
    case 'discard':
      return state.config ? reducer(state, { type: 'loaded', config: state.config, status: 'Alterações descartadas.' }) : state
    case 'review': {
      if (!state.config || !state.draft) return state
      try {
        const p = planChanges(state.config, state.draft)
        if (!p.changes.length) return { ...state, status: 'Nenhuma alteração pra gravar.', error: false }
        return { ...state, phase: 'review', plan: p, status: `${p.changes.length} alteração(ões) pra confirmar.`, error: false }
      } catch (e) {
        return { ...state, status: (e as Error).message, error: true }
      }
    }
    case 'back':
      return { ...state, phase: 'ready', plan: null, status: 'Nada foi gravado.' }
    case 'writing':
      return { ...state, phase: 'writing', status: 'Gravando no mouse…', error: false }
    case 'battery':
      return { ...state, battery: action.battery }
    case 'activeStage': {
      // o botão de DPI do mouse troca o estágio ativo sem passar pela gente
      const { config, draft } = state
      if (!config || !draft || action.stage < 1 || action.stage > 8) return state
      const followed = draft.dpi.active === config.dpi.active
      return {
        ...state,
        config: { ...config, dpi: { ...config.dpi, active: action.stage } },
        draft: followed ? { ...draft, dpi: { ...draft.dpi, active: action.stage } } : draft,
      }
    }
    case 'disconnect':
      return initial
  }
}

/** quantas alterações o rascunho tem, ou o motivo de ele não poder ser gravado */
export function pending({ config, draft }: State): number | string {
  try {
    return planChanges(config as MouseConfig, draft as MouseSettings).changes.length
  } catch (e) {
    return (e as Error).message
  }
}
