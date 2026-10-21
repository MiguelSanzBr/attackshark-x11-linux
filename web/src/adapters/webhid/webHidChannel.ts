// Transporte em cima do WebHID (Chrome/Edge). Não testado em hardware real: ver README.
import { PID_RECEIVER, PID_WIRED, SETTINGS_USAGE_PAGE, VID } from '../../domain/protocol'
import type { HidChannel } from '../../application/ports'

export const FILTERS: HIDDeviceFilter[] = [PID_RECEIVER, PID_WIRED].map((productId) => ({
  vendorId: VID,
  productId,
  usagePage: SETTINGS_USAGE_PAGE,
}))

export const hasWebHid = (nav: Navigator) => Boolean((nav as Partial<Navigator>).hid)

const bytes = (v: DataView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength)

export class WebHidChannel implements HidChannel {
  readonly wired: boolean

  constructor(private device: HIDDevice) {
    this.wired = device.productId === PID_WIRED
  }

  /** abre o seletor do navegador; null se o usuário fechar sem escolher */
  static async request(hid: HID): Promise<WebHidChannel | null> {
    const [device] = await hid.requestDevice({ filters: FILTERS })
    if (!device) return null
    if (!device.opened) await device.open()
    return new WebHidChannel(device)
  }

  async setFeature(data: Uint8Array) {
    await this.device.sendFeatureReport(data[0] as number, data.slice(1))
  }

  async getFeature(rid: number, size: number) {
    const r = bytes(await this.device.receiveFeatureReport(rid))
    // o Chrome costuma devolver o id no byte 0 dos reports numerados; se vier sem, recoloca.
    // E devolve no tamanho do descritor (64 no X11), não no do report: corta igual o Python, q lê só `size`.
    // O MouseLink.read confere id e tamanho depois, então um palpite errado aqui vira erro e não lixo
    const withId = r[0] === rid ? r : Uint8Array.of(rid, ...r)
    return withId.slice(0, size)
  }

  onInput(listener: (report: Uint8Array) => void) {
    const handler = (e: HIDInputReportEvent) => listener(Uint8Array.of(e.reportId, ...bytes(e.data)))
    this.device.addEventListener('inputreport', handler)
    return () => this.device.removeEventListener('inputreport', handler)
  }

  async close() {
    await this.device.close()
  }
}
