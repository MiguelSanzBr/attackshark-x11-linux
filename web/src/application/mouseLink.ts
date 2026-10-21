// O diálogo com o mouse, porta do sharkx11/device.py sem a parte de hidraw: handshake de leitura,
// reenvio até o ACK e a lista do q pode ser escrito. Só conhece a porta HidChannel, roda igual no WebHID e no demo.
import type { Battery } from '../domain/model'
import {
  CHARGING, EV_ACK, EV_BATTERY, IDENT, type MouseEvent, READ_REQ, type ReportId, SIZES, WRITABLE,
  parseEvent, readRequest,
} from '../domain/protocol'
import type { HidChannel, MouseDevice } from './ports'

export interface Timing {
  /** pausa entre o pedido 0xA0 e a resposta: 500 ms no receptor, 100 ms no cabo */
  readWait: number
  /** o app reenvia a cada 500 ms até o mouse confirmar, no máximo 10 vezes */
  ackWait: number
  ackTries: number
  readTries: number
  /** quanto esperar um heartbeat pra descobrir o modelo (o X11 manda um a cada 2 s) */
  eventWait: number
}

const hex = (n = 0) => '0x' + n.toString(16).padStart(2, '0')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MouseLink implements MouseDevice {
  model: number | null = null
  battery: Battery | null = null
  readonly timing: Timing
  private listeners = new Set<(ev: MouseEvent) => void>()
  private stopInput: () => void

  constructor(private channel: HidChannel, timing: Partial<Timing> = {}) {
    this.timing = { readWait: channel.wired ? 100 : 500, ackWait: 500, ackTries: 10, readTries: 3, eventWait: 3000, ...timing }
    this.stopInput = channel.onInput((report) => {
      const ev = parseEvent(report)
      if (!ev) return
      this.model = ev.model
      // pelo receptor v0 = 3 é carregando; no cabo o significado muda e o Python também não trata
      if (ev.event === EV_BATTERY) this.battery = { charging: ev.v0 === CHARGING, percent: ev.v1 }
      this.listeners.forEach((l) => l(ev))
    })
  }

  get wired() {
    return this.channel.wired
  }

  onEvent(listener: (ev: MouseEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private nextEvent(match: (ev: MouseEvent) => boolean, ms: number) {
    return new Promise<MouseEvent | null>((resolve) => {
      const off = this.onEvent((ev) => {
        if (!match(ev)) return
        clearTimeout(timer)
        off()
        resolve(ev)
      })
      const timer = setTimeout(() => (off(), resolve(null)), ms)
    })
  }

  /** um report de configuração, pelo handshake do app: pede no 0xA0, confere a resposta, busca */
  async read(rid: ReportId): Promise<Uint8Array> {
    const size = SIZES[rid]
    for (let i = 0; i < this.timing.readTries; i++) {
      await this.channel.setFeature(readRequest(rid, rid === IDENT ? 0 : 1))
      await sleep(this.timing.readWait)
      if ((await this.channel.getFeature(READ_REQ, SIZES[READ_REQ]))[1] === 1) {
        const r = await this.channel.getFeature(rid, size)
        if (r[0] === rid && r[1] === size) return r
      }
    }
    throw new Error(`sem resposta na leitura do report ${hex(rid)} (o mouse tá ligado?)`)
  }

  /** manda um report; pelo receptor reenvia até o mouse confirmar com 03 <modelo> 50 00 */
  async write(data: Uint8Array): Promise<void> {
    const rid = data[0]
    if (rid === undefined || !WRITABLE.includes(rid) || data.length !== SIZES[rid as ReportId]) {
      throw new Error(`recusando mandar o report ${hex(rid)} (${data.length} bytes)`)
    }
    if (this.channel.wired) return this.channel.setFeature(data)
    for (let i = 0; i < this.timing.ackTries; i++) {
      // ouve antes de mandar, senão um ACK rápido passa batido
      const ack = this.nextEvent((ev) => ev.event === EV_ACK, this.timing.ackWait)
      await this.channel.setFeature(data)
      const ev = await ack
      if (ev) {
        if (ev.v0 !== 0) throw new Error(`o mouse recusou o report ${hex(rid)} (status ${ev.v0})`)
        return
      }
    }
    throw new Error(`sem confirmação do report ${hex(rid)} (o mouse tá ligado?)`)
  }

  /** modelo pelos eventos (null se nenhum chegar) e versão pelos bytes 2-3 do report 0x0B */
  async identify(): Promise<{ model: number | null; version: string }> {
    const r = await this.read(IDENT)
    if (this.model === null) await this.nextEvent(() => true, this.timing.eventWait)
    const [, , major = 0, minor = 0] = r
    return { model: this.model, version: `${major.toString(16)}.${minor.toString(16).padStart(2, '0')}` }
  }


  async close() {
    this.stopInput()
    this.listeners.clear()
    await this.channel.close()
  }
}
