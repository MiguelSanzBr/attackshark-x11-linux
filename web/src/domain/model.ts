// Modelo do mouse na linguagem de quem configura: estágio de DPI, polling rate, efeito de luz.
// As funções daqui são os objetos de valor: só deixam passar o q o X11 aceita, e os encoders dos
// reports chamam elas antes de montar qualquer byte.

export const MIN_DPI = 50
export const MAX_DPI = 22000
export const MAX_STAGES = 8

export const POLLING_RATES = [125, 250, 500, 1000] as const
export type PollingRate = (typeof POLLING_RATES)[number]

export const LIGHT_EFFECTS = ['off', 'static', 'breathing', 'neon', 'color_breathing', 'static_dpi', 'breathing_dpi'] as const
export type LightEffect = (typeof LIGHT_EFFECTS)[number]

export const LIGHT_EFFECT_NAMES: Record<LightEffect, string> = {
  off: 'Desligado',
  static: 'Estático',
  breathing: 'Respiração',
  neon: 'Neon',
  color_breathing: 'Respiração colorida',
  static_dpi: 'Estático por DPI',
  breathing_dpi: 'Respiração por DPI',
}

export const lightEffectName = (effect: LightEffect | number) =>
  typeof effect === 'number' ? `desconhecido (${effect})` : LIGHT_EFFECT_NAMES[effect]

export interface DpiStage {
  dpi: number
  on: boolean
  color: string
  /** como o estágio veio do mouse (DPI e código cru), pra devolver igualzinho se ninguém mexer */
  read?: { dpi: number; code: [code: number, low: number, high: number] }
}

export interface DpiSettings {
  raw: Uint8Array
  angleSnap: boolean
  ripple: boolean
  stages: DpiStage[]
  active: number
}

export interface LightSettings {
  raw: Uint8Array
  /** número quando o mouse manda um efeito q o app não conhece */
  mode: LightEffect | number
  speed: number
  brightness: number
  deepSleep: number
  color: string
  sleep: number
  debounce: number
}

export interface PollingSettings {
  raw: Uint8Array
  /** null quando o código lido não é nenhuma das 4 taxas */
  rate: PollingRate | null
}

/** o q dá pra editar e gravar */
export interface MouseSettings {
  dpi: DpiSettings
  light: LightSettings
  polling: PollingSettings
}

/** agregado: as configurações mais o q identifica o mouse de onde elas vieram */
export interface MouseConfig extends MouseSettings {
  wired: boolean
  model: number | null
  version: string
}

export interface Battery {
  charging: boolean
  percent: number
}

export function dpi(value: number): number {
  if (!Number.isInteger(value) || value < MIN_DPI || value > MAX_DPI || value % (value <= 10000 ? 50 : 100)) {
    throw new RangeError(`DPI precisa ser 50..10000 de 50 em 50 ou 10100..22000 de 100 em 100, não ${value}`)
  }
  return value
}

export function pollingRate(hz: number): PollingRate {
  const rate = POLLING_RATES.find((r) => r === hz)
  if (rate === undefined) throw new RangeError(`polling precisa ser ${POLLING_RATES.join(', ')} Hz, não ${hz}`)
  return rate
}

export function checkStages(stages: readonly Pick<DpiStage, 'dpi' | 'on'>[], active: number) {
  if (stages.length > MAX_STAGES) throw new RangeError(`no máximo ${MAX_STAGES} estágios de DPI`)
  if (!stages.some((s) => s.on)) throw new RangeError('pelo menos um estágio de DPI precisa ficar ligado')
  if (!Number.isInteger(active) || active < 1 || active > stages.length) {
    throw new RangeError(`estágio ativo precisa ser 1..${stages.length}`)
  }
  stages.forEach((s) => dpi(s.dpi))
}

const LIGHT_LIMITS = [
  ['speed', 1, 5, 'velocidade'], ['brightness', 1, 8, 'brilho'], ['sleep', 1, 60, 'sono'],
  ['deepSleep', 1, 60, 'sono profundo'], ['debounce', 2, 25, 'debounce'],
] as const

export function checkLight(light: Pick<LightSettings, (typeof LIGHT_LIMITS)[number][0]>) {
  for (const [key, lo, hi, name] of LIGHT_LIMITS) {
    const v = light[key]
    if (!Number.isInteger(v) || v < lo || v > hi) throw new RangeError(`${name} precisa ser ${lo}..${hi}`)
  }
}
