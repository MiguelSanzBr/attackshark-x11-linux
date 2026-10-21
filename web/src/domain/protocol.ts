// Porta do sharkx11/protocol.py: constantes, checksum e framing. O detalhe de cada byte tá no
// docs/PROTOCOL.md do repo attackshark-x11-linux.
import type { PollingRate } from './model'

export const VID = 0x1d57
export const PID_RECEIVER = 0xfa60
export const PID_WIRED = 0xfa55
// a configuração toda trafega na coleção de usage page 0x0B da interface 2
export const SETTINGS_USAGE_PAGE = 0x0b

// id do modelo = byte 1 de todo input report 0x03 (as 18 páginas de modelo do app oficial)
export const MODELS: Readonly<Record<number, string>> = {
  0x85: 'X6', 0x4d: 'X3', 0x10: 'R1', 0x55: 'X11', 0x4e: 'X3MAX', 0xb1: 'X1', 0xbe: 'X11PRO',
  0x01: 'X3PRO', 0x03: 'V5SE', 0x07: 'X11SE', 0x02: 'X8SE', 0x06: 'X8 Plus', 0x08: 'X8 PRO',
  0x04: 'G3', 0x0e: 'G3 PRO', 0xe5: 'V3 PRO', 0x24: 'V6', 0xea: 'V3',
}
export const MODEL_X11 = 0x55

export const DPI = 0x04
export const LIGHT = 0x05
export const POLLING = 0x06
export const BUTTONS = 0x08
export const MACRO = 0x09
export const IDENT = 0x0b
export const READ_REQ = 0xa0

// tamanho total de cada feature report, contando o id
export const SIZES = {
  [DPI]: 56, [LIGHT]: 15, [POLLING]: 9, [BUTTONS]: 59, [MACRO]: 64, [IDENT]: 8, [READ_REQ]: 8,
} as const
export type ReportId = keyof typeof SIZES
// os únicos reports q esse site escreve (botões ficaram de fora, ver README)
export const WRITABLE: readonly number[] = [DPI, LIGHT, POLLING]

export const EV_DPI = 0x10
export const EV_POLLING = 0x20
export const EV_BATTERY = 0x40
export const EV_ACK = 0x50
export const EV_LIGHT = 0x70
export const CHARGING = 3

export const POLLING_CODES: Readonly<Record<PollingRate, number>> = { 1000: 0x01, 500: 0x02, 250: 0x04, 125: 0x08 }

export function checksum(data: Uint8Array): Uint8Array {
  const s = data.reduce((a, b) => a + b, 0) & 0xffff
  return Uint8Array.of(s >> 8, s & 0xff)
}

export function readRequest(rid: ReportId, flag = 1): Uint8Array {
  return Uint8Array.of(READ_REQ, rid, SIZES[rid], 0, flag, 0, 0, 0)
}

export interface MouseEvent {
  model: number
  event: number
  v0: number
  v1: number
}

export function parseEvent(report: Uint8Array): MouseEvent | null {
  if (report.length < 5 || report[0] !== 0x03) return null
  const [, model = 0, event = 0, v0 = 0, v1 = 0] = report
  return { model, event, v0, v1 }
}
