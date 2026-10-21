// Mouse simulado, porta do tests/fake_mouse.py: responde o handshake 0xA0, guarda o q é escrito e
// manda o ACK 03 55 50 <status> pelo "receptor", como o X11 real. Não tem hardware nenhum envolvido.
import { defaultDpi, defaultLight, encodeDpi, encodeLight, encodePolling } from '../../domain/reports'
import { DPI, EV_ACK, EV_BATTERY, IDENT, LIGHT, MODEL_X11, POLLING, READ_REQ } from '../../domain/protocol'
import type { HidChannel } from '../../application/ports'

export class DemoChannel implements HidChannel {
  readonly wired: boolean
  model = MODEL_X11
  reports = new Map<number, Uint8Array>([
    [IDENT, Uint8Array.of(IDENT, 8, 0x01, 0x12, 0, 0, 0, 0)],
    [DPI, encodeDpi(defaultDpi())],
    [LIGHT, encodeLight(defaultLight())],
    [POLLING, encodePolling(1000)],
  ])
  log: Uint8Array[] = []
  /** nunca confirma as escritas */
  silent = false
  status = 0
  /** recusa os próximos N pedidos de leitura (0xA0 com byte 1 = 0) */
  refuseReads = 0
  /** heartbeat (estado, %) mandado a cada pedido de leitura; null = mouse mudo */
  heartbeat: [number, number] | null = [1, 84]
  private pending: number | null = null
  private listeners = new Set<(report: Uint8Array) => void>()

  constructor({ wired = false } = {}) {
    this.wired = wired
  }

  /** manda um input report 0x03, assíncrono igual chega do USB */
  emit(event: number, v0 = 0, v1 = 0, model = this.model) {
    const report = Uint8Array.of(0x03, model, event, v0, v1)
    setTimeout(() => this.listeners.forEach((l) => l(report.slice())))
  }

  async setFeature(data: Uint8Array) {
    const copy = data.slice()
    this.log.push(copy)
    if (copy[0] === READ_REQ) {
      this.pending = copy[1] as number
      if (this.heartbeat) this.emit(EV_BATTERY, ...this.heartbeat)
      return
    }
    this.reports.set(copy[0] as number, copy)
    if (!this.wired && !this.silent) this.emit(EV_ACK, this.status)
  }

  async getFeature(rid: number, size: number) {
    if (rid === READ_REQ) {
      const ok = this.pending !== null && !this.refuseReads
      this.refuseReads = Math.max(this.refuseReads - 1, 0)
      return Uint8Array.of(READ_REQ, Number(ok), 0, 0, 0, 0, 0, 0)
    }
    const report = this.reports.get(rid)
    if (!report) throw new Error(`o mouse simulado não tem o report 0x${rid.toString(16).padStart(2, '0')}`)
    return report.slice(0, size)
  }

  onInput(listener: (report: Uint8Array) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  async close() {
    this.listeners.clear()
  }
}
