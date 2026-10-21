// Porta do sharkx11/config.py: encode/decode dos reports de configuração.
// O decode guarda os bytes crus e o encode parte deles mudando só os campos documentados, então o q a
// gente não entende volta pro mouse exatamente como veio.
import { type Encoded, decodeStep, dpiToStep, encodeStep, stepToDpi } from './dpi'
import {
  type DpiSettings, type DpiStage, LIGHT_EFFECTS, type LightEffect, type LightSettings, MAX_STAGES, type PollingSettings,
  POLLING_RATES, checkLight, checkStages, pollingRate,
} from './model'
import { DPI, LIGHT, POLLING, POLLING_CODES, type ReportId, SIZES, checksum } from './protocol'

// o app só manda o brilho nesses modos, nos outros vai 8
const BRIGHTNESS_MODES: readonly (LightEffect | number)[] = ['static', 'static_dpi']

function frame(b: Uint8Array, csumAt: number): Uint8Array {
  b.set(checksum(b.slice(3, csumAt)), csumAt)
  return b
}

function check(raw: Uint8Array, rid: ReportId, csumAt?: number) {
  if (raw.length !== SIZES[rid] || raw[0] !== rid) {
    throw new Error(`não é um report 0x${rid.toString(16).padStart(2, '0')} (${raw.length} bytes)`)
  }
  if (csumAt !== undefined && checksum(raw.slice(3, csumAt)).some((v, i) => v !== raw[csumAt + i])) {
    throw new Error(`report 0x${rid.toString(16).padStart(2, '0')}: checksum errado`)
  }
}

const toHex = (b: Uint8Array) => '#' + Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('')
const fromColor = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

function blank(rid: ReportId): Uint8Array {
  const raw = new Uint8Array(SIZES[rid])
  raw.set([rid, SIZES[rid], 1])
  return raw
}

// ------------------------------------------------------------------ 0x04 estágios de DPI, angle snap, ripple
const DPI_CSUM = 50
// estágio q o mouse nunca teve configurado vem com código 0: mostra o padrão do app em vez de 50 DPI
const UNSET_DPI = 800

export function defaultDpi(): DpiSettings {
  const raw = blank(DPI)
  raw[49] = 2
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ff4000', '#ffffff']
  const stages = [800, 1600, 2400, 3200, 5000, 22000, 800, 800].map((dpi, i) => ({ dpi, on: i < 6, color: colors[i] as string }))
  return { ...decodeDpi(frame(raw, DPI_CSUM)), stages, active: 2 }
}

export function decodeDpi(raw: Uint8Array): DpiSettings {
  check(raw, DPI, DPI_CSUM)
  const b = (i: number) => raw[i] as number
  const stages: DpiStage[] = []
  for (let i = 0; i < MAX_STAGES; i++) {
    const code: Encoded = [b(8 + i), b(16 + i), (b(6) >> i) & 1]
    const dpi = code[0] ? stepToDpi(decodeStep(...code)) : UNSET_DPI
    stages.push({ dpi, on: Boolean((b(5) >> i) & 1), color: toHex(raw.slice(25 + 3 * i, 28 + 3 * i)), read: { dpi, code } })
  }
  return { raw: raw.slice(), angleSnap: Boolean(b(3)), ripple: Boolean(b(4)), stages, active: Math.min(Math.max(b(24), 1), MAX_STAGES) }
}

export function encodeDpi(cfg: DpiSettings): Uint8Array {
  checkStages(cfg.stages, cfg.active)
  const b = cfg.raw.slice()
  b[3] = Number(cfg.angleSnap)
  b[4] = Number(cfg.ripple)
  let on = 0
  let high = 0
  cfg.stages.forEach((s, i) => {
    // estágio intocado volta como foi lido (a não ser q ligue um q ainda tava sem código)
    const [code, low, hi] = s.read && s.read.dpi === s.dpi && (s.read.code[0] || !s.on) ? s.read.code : encodeStep(dpiToStep(s.dpi))
    on |= Number(s.on) << i
    high |= hi << i
    b[8 + i] = code
    b[16 + i] = low
    b.set(fromColor(s.color), 25 + 3 * i)
  })
  b[5] = on
  b[6] = high
  b[7] = high // o app escreve a máscara de faixa alta duas vezes
  b[24] = cfg.active
  return frame(b, DPI_CSUM)
}

// ------------------------------------------------------------------ 0x05 luz, timers de sono, debounce
const LIGHT_CSUM = 11

export function defaultLight(): LightSettings {
  return {
    ...decodeLight(frame(blank(LIGHT), LIGHT_CSUM)),
    mode: 'off', color: '#00ff00', brightness: 8, speed: 3, sleep: 1, deepSleep: 10, debounce: 4,
  }
}

export function decodeLight(raw: Uint8Array): LightSettings {
  check(raw, LIGHT, LIGHT_CSUM)
  const b = (i: number) => raw[i] as number
  const mode = b(3) >> 4
  return {
    raw: raw.slice(),
    mode: LIGHT_EFFECTS[mode] ?? mode,
    // firmware 5..1 = slider 4..8 do app = velocidade 1..5 aqui
    speed: Math.min(Math.max(6 - (b(4) & 0x0f), 1), 5),
    brightness: b(5) & 0x0f,
    // o deep sleep vem quebrado nos dois nibbles altos
    deepSleep: (b(4) & 0xf0) | (b(5) >> 4),
    color: toHex(raw.slice(6, 9)),
    sleep: b(9),
    debounce: b(10),
  }
}

export function encodeLight(cfg: LightSettings): Uint8Array {
  checkLight(cfg)
  const b = cfg.raw.slice()
  const mode = typeof cfg.mode === 'number' ? cfg.mode : LIGHT_EFFECTS.indexOf(cfg.mode)
  b[3] = (mode << 4) | ((b[3] as number) & 0x0f)
  b[4] = (cfg.deepSleep & 0xf0) | (6 - cfg.speed)
  b[5] = ((cfg.deepSleep << 4) & 0xf0) | (BRIGHTNESS_MODES.includes(cfg.mode) ? cfg.brightness : 8)
  b.set(fromColor(cfg.color), 6)
  b[9] = cfg.sleep
  b[10] = cfg.debounce
  return frame(b, LIGHT_CSUM)
}

// ------------------------------------------------------------------ 0x06 polling rate
export function decodePolling(raw: Uint8Array): PollingSettings {
  check(raw, POLLING)
  return { raw: raw.slice(), rate: POLLING_RATES.find((r) => POLLING_CODES[r] === raw[3]) ?? null }
}

export function encodePolling(rate: number): Uint8Array {
  const code = POLLING_CODES[pollingRate(rate)]
  return Uint8Array.of(POLLING, SIZES[POLLING], 1, code, code ^ 0xff, 0, 0, 0, 0)
}
