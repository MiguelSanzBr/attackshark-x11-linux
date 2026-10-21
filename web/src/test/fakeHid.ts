import { vi } from 'vitest'

// navigator.hid de mentira: só o pedaço da API q o WebHidChannel usa
export function fakeDevice(productId = 0xfa60, opened = false) {
  const device = Object.assign(new EventTarget(), {
    productId,
    opened,
    open: vi.fn(async () => void (device.opened = true)),
    close: vi.fn(async () => void (device.opened = false)),
    sendFeatureReport: vi.fn(async (_id: number, _data: BufferSource) => undefined),
    receiveFeatureReport: vi.fn(async (_id: number) => new DataView(new ArrayBuffer(0))),
  })
  return device
}

export type FakeDevice = ReturnType<typeof fakeDevice>

export function fakeHid(devices: FakeDevice[]) {
  return { requestDevice: vi.fn(async (_opts: HIDDeviceRequestOptions) => devices) }
}

export function inputReport(device: FakeDevice, reportId: number, data: number[]) {
  // o Chrome entrega o input report sem o id no DataView, o id vem separado
  const buf = Uint8Array.of(0xee, ...data).buffer
  device.dispatchEvent(Object.assign(new Event('inputreport'), { reportId, data: new DataView(buf, 1) }))
}

// HIDDevice falso q repassa tudo pro mouse simulado: testa WebHidChannel + MouseLink + UI juntos
export function deviceBackedBy(demo: import('../adapters/demo/demoChannel').DemoChannel, productId = 0xfa60) {
  const device = fakeDevice(productId)
  device.sendFeatureReport.mockImplementation(async (id, data) => {
    await demo.setFeature(Uint8Array.of(id, ...new Uint8Array(data as ArrayBuffer)))
  })
  device.receiveFeatureReport.mockImplementation(async (id) => new DataView((await demo.getFeature(id, 64)).buffer))
  demo.onInput((r) => inputReport(device, r[0]!, Array.from(r.slice(1))))
  return device
}
