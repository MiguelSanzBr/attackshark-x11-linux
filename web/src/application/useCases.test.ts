import { describe, expect, it, vi } from 'vitest'
import { DemoChannel } from '../adapters/demo/demoChannel'
import { DPI, EV_BATTERY, EV_DPI, POLLING, READ_REQ } from '../domain/protocol'
import { decodeDpi } from '../domain/reports'
import { tick } from '../test/tick'
import {
  type ConfirmedPlan, applyChanges, confirmPlan, connect, disconnect, followActiveStage, planChanges, readBattery, readConfig,
} from './useCases'

const timing = { readWait: 0, ackWait: 10, eventWait: 20 }
const setup = (channel = new DemoChannel()) => ({ channel, device: connect(channel, timing) })
const writes = (c: DemoChannel) => c.log.filter((r) => r[0] !== READ_REQ)

describe('connect / disconnect', () => {
  it('abre o mouse sobre o canal e fecha o canal no fim', async () => {
    const channel = new DemoChannel({ wired: true })
    const close = vi.spyOn(channel, 'close')
    const device = connect(channel)
    expect(device.wired).toBe(true)
    await disconnect(device)
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('readConfig', () => {
  it('identifica o mouse e lê DPI, luz e polling sem escrever nada', async () => {
    const { channel, device } = setup()
    const cfg = await readConfig(device)
    expect(cfg).toMatchObject({ wired: false, model: 0x55, version: '1.12', polling: { rate: 1000 }, light: { mode: 'off' } })
    expect(cfg.dpi.stages[5]?.dpi).toBe(22000)
    expect(writes(channel)).toEqual([])
  })
})

describe('planChanges + confirmPlan + applyChanges', () => {
  it('só grava plano confirmado, na ordem, e confere a releitura', async () => {
    const { channel, device } = setup()
    const current = await readConfig(device)
    const stages = current.dpi.stages.map((s, i) => (i === 0 ? { ...s, dpi: 1200 } : s))
    const plan = planChanges(current, { ...current, dpi: { ...current.dpi, stages }, polling: { ...current.polling, rate: 500 } })
    expect(plan.changes.map((c) => c.label)).toEqual(['Estágio 1: DPI', 'Polling rate'])

    const result = await applyChanges(device, confirmPlan(plan))
    expect(writes(channel).map((r) => r[0])).toEqual([DPI, POLLING])
    expect(result.verified).toBe(true)
    expect(result.config.dpi.stages[0]?.dpi).toBe(1200)
    expect(decodeDpi(channel.reports.get(DPI)!).stages[0]?.dpi).toBe(1200)
  })

  it('recusa plano q não passou pela confirmação, sem mandar nada', async () => {
    const { channel, device } = setup()
    const current = await readConfig(device)
    const plan = planChanges(current, { ...current, polling: { ...current.polling, rate: 250 } })
    await expect(applyChanges(device, plan as ConfirmedPlan)).rejects.toThrow(/não confirmado/)
    await expect(applyChanges(device, { ...plan, confirmed: true } as unknown as ConfirmedPlan)).rejects.toThrow(/não confirmado/)
    expect(writes(channel)).toEqual([])
  })

  it('não confirma plano vazio e a confirmação congela os pacotes', async () => {
    const { device } = setup()
    const current = await readConfig(device)
    expect(() => confirmPlan(planChanges(current, current))).toThrow(/nada pra gravar/)
    const plan = planChanges(current, { ...current, polling: { ...current.polling, rate: 250 } })
    const confirmed = confirmPlan(plan)
    plan.packets[0]![3] = 0x08 // mexer no plano depois de confirmar não muda o q vai pro mouse
    plan.packets.push(new Uint8Array(9))
    expect(confirmed.packets).toHaveLength(1)
    expect(confirmed.packets[0]![3]).toBe(0x04)
  })

  it('avisa quando a releitura não bate com o q foi mandado', async () => {
    const { channel, device } = setup()
    const current = await readConfig(device)
    const real = channel.setFeature.bind(channel)
    channel.setFeature = async (data) => real(data[0] === POLLING ? Uint8Array.of(6, 9, 1, 8, 0xf7, 0, 0, 0, 0) : data)
    const plan = planChanges(current, { ...current, polling: { ...current.polling, rate: 250 } })
    const result = await applyChanges(device, confirmPlan(plan))
    expect(result.verified).toBe(false)
    expect(result.config.polling.rate).toBe(125)
  })

  it('propaga a falha de escrita', async () => {
    const { channel, device } = setup()
    const current = await readConfig(device)
    channel.silent = true
    const plan = planChanges(current, { ...current, polling: { ...current.polling, rate: 250 } })
    await expect(applyChanges(device, confirmPlan(plan))).rejects.toThrow(/sem confirmação/)
  })
})

describe('readBattery / followActiveStage', () => {
  it('avisa a bateria já conhecida na hora e as próximas pelo heartbeat', async () => {
    const { channel, device } = setup()
    const seen = vi.fn()
    expect(readBattery(device, seen)).toBeTypeOf('function')
    expect(seen).not.toHaveBeenCalled()
    channel.emit(EV_BATTERY, 1, 70)
    await tick()
    expect(seen).toHaveBeenLastCalledWith({ charging: false, percent: 70 })

    const late = vi.fn()
    const stop = readBattery(device, late)
    expect(late).toHaveBeenCalledWith({ charging: false, percent: 70 })
    stop()
    channel.emit(EV_BATTERY, 3, 71)
    channel.emit(EV_DPI, 2)
    await tick()
    expect(late).toHaveBeenCalledOnce()
    expect(seen).toHaveBeenLastCalledWith({ charging: true, percent: 71 })
  })

  it('segue o estágio trocado no botão do mouse e ignora valor fora de 1..8', async () => {
    const { channel, device } = setup()
    const seen = vi.fn()
    const stop = followActiveStage(device, seen)
    channel.emit(EV_DPI, 0)
    channel.emit(EV_DPI, 9)
    channel.emit(EV_BATTERY, 1, 50)
    channel.emit(EV_DPI, 3)
    await tick()
    expect(seen.mock.calls).toEqual([[3]])
    stop()
    channel.emit(EV_DPI, 4)
    await tick()
    expect(seen).toHaveBeenCalledOnce()
  })
})
