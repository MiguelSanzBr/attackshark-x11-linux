import { describe, expect, it, vi } from 'vitest'
import { fakeDevice, fakeHid, inputReport } from '../../test/fakeHid'
import { FILTERS, WebHidChannel, hasWebHid } from './webHidChannel'

const asHid = (h: unknown) => h as HID

describe('hasWebHid', () => {
  it('detecta navigator.hid', () => {
    expect(hasWebHid({ hid: {} } as Navigator)).toBe(true)
    expect(hasWebHid({} as Navigator)).toBe(false)
  })
})

describe('WebHidChannel.request', () => {
  it('filtra pelo VID/PID do receptor e do cabo na usage page 0x0B e abre o device', async () => {
    const dev = fakeDevice()
    const hid = fakeHid([dev])
    const t = await WebHidChannel.request(asHid(hid))
    // espelha protocol.VID / PID_RECEIVER / PID_WIRED e discovery.SETTINGS_COLLECTION (usage page 0x0B)
    expect(FILTERS).toEqual([
      { vendorId: 0x1d57, productId: 0xfa60, usagePage: 0x0b },
      { vendorId: 0x1d57, productId: 0xfa55, usagePage: 0x0b },
    ])
    expect(hid.requestDevice).toHaveBeenCalledWith({ filters: FILTERS })
    expect(dev.open).toHaveBeenCalledOnce()
    expect(t?.wired).toBe(false)
  })

  it('não reabre device já aberto e reconhece o cabo', async () => {
    const dev = fakeDevice(0xfa55, true)
    const t = await WebHidChannel.request(asHid(fakeHid([dev])))
    expect(dev.open).not.toHaveBeenCalled()
    expect(t?.wired).toBe(true)
  })

  it('devolve null quando o usuário fecha o seletor', async () => {
    expect(await WebHidChannel.request(asHid(fakeHid([])))).toBeNull()
  })
})

describe('WebHidChannel I/O', () => {
  const open = async () => {
    const dev = fakeDevice()
    const t = (await WebHidChannel.request(asHid(fakeHid([dev]))))!
    return { dev, t }
  }

  it('manda a feature separando o id do resto', async () => {
    const { dev, t } = await open()
    await t.setFeature(Uint8Array.of(0x06, 9, 1, 2, 0xfd, 0, 0, 0, 0))
    const [id, data] = dev.sendFeatureReport.mock.calls[0]!
    expect(id).toBe(0x06)
    expect(new Uint8Array(data as ArrayBuffer)).toEqual(Uint8Array.of(9, 1, 2, 0xfd, 0, 0, 0, 0))
  })

  it('devolve a feature com o id no byte 0, venha ele ou não do navegador', async () => {
    const { dev, t } = await open()
    const full = Uint8Array.of(0xff, 0x0b, 8, 1, 0x12, 0, 0, 0, 0)
    dev.receiveFeatureReport.mockResolvedValueOnce(new DataView(full.buffer, 1))
    expect(await t.getFeature(0x0b, 8)).toEqual(full.slice(1))
    dev.receiveFeatureReport.mockResolvedValueOnce(new DataView(full.buffer, 2))
    expect(await t.getFeature(0x0b, 8)).toEqual(full.slice(1))
    expect(dev.receiveFeatureReport).toHaveBeenCalledWith(0x0b)
  })

  it('corta a feature no tamanho do report quando o Chrome devolve no tamanho do descritor (64 no X11)', async () => {
    // visto no mouse de verdade: o 0x04 tem 56 bytes mas chegava com 64 e o decode recusava
    const { dev, t } = await open()
    const report = Uint8Array.from({ length: 56 }, (_, i) => (i === 0 ? 0x04 : i === 1 ? 56 : i))
    const padded = new Uint8Array(64)
    padded.set(report)
    dev.receiveFeatureReport.mockResolvedValueOnce(new DataView(padded.buffer))
    expect(await t.getFeature(0x04, 56)).toEqual(report)
    // mesmo caso sem o id na frente: 63 de payload
    dev.receiveFeatureReport.mockResolvedValueOnce(new DataView(padded.buffer, 1))
    expect(await t.getFeature(0x04, 56)).toEqual(report)
  })

  it('entrega o input report com o id na frente e para de ouvir', async () => {
    const { dev, t } = await open()
    const heard = vi.fn()
    const stop = t.onInput(heard)
    inputReport(dev, 0x03, [0x55, 0x40, 1, 84])
    expect(heard).toHaveBeenCalledWith(Uint8Array.of(3, 0x55, 0x40, 1, 84))
    stop()
    inputReport(dev, 0x03, [0x55, 0x40, 1, 83])
    expect(heard).toHaveBeenCalledOnce()
  })

  it('fecha o device', async () => {
    const { dev, t } = await open()
    await t.close()
    expect(dev.close).toHaveBeenCalledOnce()
  })
})
