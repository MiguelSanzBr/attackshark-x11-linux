import { describe, expect, it, vi } from 'vitest'
import { decodeDpi, encodePolling } from '../domain/reports'
import { DPI, EV_BATTERY, EV_DPI, POLLING, readRequest } from '../domain/protocol'
import { tick } from '../test/tick'
import { DemoChannel } from '../adapters/demo/demoChannel'
import { MouseLink } from './mouseLink'

// tempos curtos pros testes; os de verdade (500 ms, 10 tentativas) ficam no padrão do MouseLink
const fast = { readWait: 0, ackWait: 15, eventWait: 30 }

const setup = (demo = new DemoChannel()) => ({ demo, mouse: new MouseLink(demo, fast) })

describe('MouseLink.read (espelha device.Device.read)', () => {
  it('identifica pelo heartbeat e lê a versão do report 0x0B', async () => {
    // espelha test_read_identify_and_events
    const { demo, mouse } = setup()
    demo.emit(EV_BATTERY, 3, 87)
    demo.onInput(() => undefined)
    await tick()
    expect(mouse.battery).toEqual({ charging: true, percent: 87 })
    expect(await mouse.identify()).toEqual({ model: 0x55, version: '1.12' })
    await tick()
    expect(mouse.battery).toEqual({ charging: false, percent: 84 }) // o heartbeat da leitura é mais novo
    expect(demo.log[0]).toEqual(readRequest(0x0b, 0))
  })

  it('ignora input report q não é 0x03', async () => {
    const demo = new DemoChannel()
    let push: (r: Uint8Array) => void = () => undefined
    vi.spyOn(demo, 'onInput').mockImplementation((l) => ((push = l), () => undefined))
    const mouse = new MouseLink(demo, fast)
    push(Uint8Array.of(0x02, 0xe9, 0x00)) // tecla de mídia, não é evento
    expect(mouse.model).toBeNull()
  })

  it('faz o handshake e confere id e tamanho da resposta', async () => {
    const { demo, mouse } = setup()
    expect(decodeDpi(await mouse.read(DPI)).active).toBe(2)
    expect(demo.log.at(-1)).toEqual(readRequest(DPI))
    demo.refuseReads = 1 // primeiro handshake recusado, segundo aceito
    expect((await mouse.read(POLLING))[3]).toBe(1)
    demo.refuseReads = 5
    await expect(mouse.read(POLLING)).rejects.toThrow(/0x06/)
  })

  it('recusa resposta com byte de tamanho errado ou id trocado', async () => {
    // espelha test_read_checks_the_answer
    const { demo, mouse } = setup()
    demo.reports.set(POLLING, Uint8Array.of(6, 8, 1, 1, 0xfe, 0, 0, 0, 0))
    await expect(mouse.read(POLLING)).rejects.toThrow(/0x06/)
    demo.reports.set(POLLING, Uint8Array.of(5, 9, 1, 1, 0xfe, 0, 0, 0, 0))
    await expect(mouse.read(POLLING)).rejects.toThrow(/0x06/)
  })

  it('sem evento nenhum o modelo fica desconhecido', async () => {
    // espelha test_identify_without_events
    const { demo, mouse } = setup()
    demo.heartbeat = null
    expect(await mouse.identify()).toEqual({ model: null, version: '1.12' })
  })

  it('espera o primeiro evento quando o modelo ainda não apareceu', async () => {
    const { demo, mouse } = setup()
    demo.heartbeat = null
    setTimeout(() => demo.emit(EV_DPI, 2), 5)
    expect((await mouse.identify()).model).toBe(0x55)
  })
})

describe('MouseLink.write (espelha device.Device.write)', () => {
  it('espera o ACK do mouse', async () => {
    // espelha test_write_waits_for_ack
    const { demo, mouse } = setup()
    await mouse.write(encodePolling(250))
    expect(demo.reports.get(POLLING)?.[3]).toBe(4)
    expect(mouse.model).toBe(0x55)
  })

  it('falha quando o mouse recusa ou nunca confirma', async () => {
    // espelha test_write_waits_for_ack
    const { demo, mouse } = setup()
    demo.status = 2
    await expect(mouse.write(encodePolling(250))).rejects.toThrow(/recusou.*status 2/)
    demo.status = 0
    demo.silent = true
    demo.emit(EV_DPI, 2) // evento q não é ACK não conta
    await expect(mouse.write(encodePolling(250))).rejects.toThrow(/sem confirmação/)
    expect(demo.log.filter((r) => r[0] === POLLING)).toHaveLength(1 + 10)
  })

  it('nunca manda report fora da lista ou com tamanho errado', async () => {
    // espelha test_write_refuses_unknown_reports; 0x0c 0x0a 01 fe 01 fe é o pacote q o PROTOCOL.md manda não enviar
    const { demo, mouse } = setup()
    for (const data of [
      Uint8Array.of(0x0c, 0x0a, 1, 0xfe, 1, 0xfe, 0, 0, 0, 0),
      Uint8Array.of(0x06, 9, 1, 1, 0xfe, 0, 0, 0),
      new Uint8Array(59).fill(0x08, 0, 1),
      new Uint8Array(0),
    ]) {
      await expect(mouse.write(data)).rejects.toThrow(/recusando/)
    }
    expect(demo.log).toEqual([])
  })

  it('no cabo não espera ACK', async () => {
    // espelha test_wired_write_needs_no_ack
    const { demo, mouse } = setup(Object.assign(new DemoChannel({ wired: true }), { silent: true }))
    await mouse.write(encodePolling(125))
    expect(demo.reports.get(POLLING)?.[3]).toBe(8)
  })
})

describe('MouseLink: eventos e tempos', () => {
  it('repassa os eventos e para de ouvir ao fechar', async () => {
    const { demo, mouse } = setup()
    const heard = vi.fn()
    const stop = mouse.onEvent(heard)
    demo.emit(EV_DPI, 3)
    await tick()
    expect(heard).toHaveBeenCalledWith({ model: 0x55, event: EV_DPI, v0: 3, v1: 0 })
    stop()
    await mouse.close()
    demo.emit(EV_DPI, 4)
    await tick()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('usa os tempos do app oficial quando nada é passado', () => {
    expect(new MouseLink(new DemoChannel()).timing).toEqual({ readWait: 500, ackWait: 500, ackTries: 10, readTries: 3, eventWait: 3000 })
    expect(new MouseLink(new DemoChannel({ wired: true })).timing.readWait).toBe(100)
  })
})
