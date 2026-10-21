import { describe, expect, it, vi } from 'vitest'
import { defaultDpi, defaultLight, encodeDpi, encodeLight, encodePolling } from '../../domain/reports'
import { DPI, IDENT, POLLING, READ_REQ, readRequest } from '../../domain/protocol'
import { tick } from '../../test/tick'
import { DemoChannel } from './demoChannel'

describe('DemoChannel (espelha tests/fake_mouse.py)', () => {
  it('começa com os reports padrão e a versão 1.12', () => {
    const demo = new DemoChannel()
    expect(demo.wired).toBe(false)
    expect(demo.reports.get(DPI)).toEqual(encodeDpi(defaultDpi()))
    expect(demo.reports.get(0x05)).toEqual(encodeLight(defaultLight()))
    expect(demo.reports.get(POLLING)).toEqual(encodePolling(1000))
    // espelha FakeMouse.reports[IDENT]: 0b 08 01 12, o mesmo q o X11 real devolveu
    expect(demo.reports.get(IDENT)).toEqual(Uint8Array.of(0x0b, 8, 1, 0x12, 0, 0, 0, 0))
  })

  it('responde o handshake 0xA0 e manda o heartbeat de bateria', async () => {
    const demo = new DemoChannel()
    const heard = vi.fn()
    demo.onInput(heard)
    expect((await demo.getFeature(READ_REQ, 8))[1]).toBe(0) // nada pedido ainda
    await demo.setFeature(readRequest(IDENT, 0))
    expect(await demo.getFeature(READ_REQ, 8)).toEqual(Uint8Array.of(READ_REQ, 1, 0, 0, 0, 0, 0, 0))
    expect(await demo.getFeature(IDENT, 8)).toEqual(demo.reports.get(IDENT))
    await tick()
    // espelha FakeMouse.ioctl: heartbeat (1, 84) a cada pedido de leitura
    expect(heard).toHaveBeenCalledWith(Uint8Array.of(3, 0x55, 0x40, 1, 84))
    expect(demo.log).toEqual([readRequest(IDENT, 0)])
  })

  it('recusa leituras quando pedido e fica quieto sem heartbeat', async () => {
    const demo = new DemoChannel()
    const heard = vi.fn()
    demo.onInput(heard)
    demo.heartbeat = null
    demo.refuseReads = 1
    await demo.setFeature(readRequest(DPI))
    expect((await demo.getFeature(READ_REQ, 8))[1]).toBe(0)
    expect((await demo.getFeature(READ_REQ, 8))[1]).toBe(1)
    await tick()
    expect(heard).not.toHaveBeenCalled()
  })

  it('guarda o q foi escrito e manda o ACK com o status', async () => {
    const demo = new DemoChannel()
    const heard = vi.fn()
    demo.onInput(heard)
    const data = encodePolling(250)
    await demo.setFeature(data)
    expect(demo.reports.get(POLLING)).toEqual(data)
    demo.status = 2
    await demo.setFeature(data)
    await tick()
    expect(heard.mock.calls).toEqual([[Uint8Array.of(3, 0x55, 0x50, 0, 0)], [Uint8Array.of(3, 0x55, 0x50, 2, 0)]])
  })

  it('não manda ACK quando silencioso ou no cabo', async () => {
    for (const demo of [Object.assign(new DemoChannel(), { silent: true }), new DemoChannel({ wired: true })]) {
      const heard = vi.fn()
      demo.onInput(heard)
      await demo.setFeature(encodePolling(500))
      await tick()
      expect(heard).not.toHaveBeenCalled()
    }
  })

  it('emite eventos com outro modelo, para de ouvir e fecha', async () => {
    const demo = new DemoChannel()
    const a = vi.fn()
    const b = vi.fn()
    const stop = demo.onInput(a)
    demo.onInput(b)
    demo.emit(0x10, 3, 0, 0x07)
    await tick()
    expect(a).toHaveBeenCalledWith(Uint8Array.of(3, 0x07, 0x10, 3, 0))
    stop()
    await demo.close()
    demo.emit(0x10, 2)
    await tick()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('falha ao pedir um report q não existe', async () => {
    await expect(new DemoChannel().getFeature(0x08, 59)).rejects.toThrow(/0x08/)
  })
})
