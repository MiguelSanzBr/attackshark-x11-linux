// Casos de uso: é só isso q a UI chama. Dependem das portas (HidChannel, MouseDevice) e do domínio.
import { type ChangePlan, planChanges as plan, readBackMatches } from '../domain/changePlan'
import type { Battery, MouseConfig, MouseSettings } from '../domain/model'
import { DPI, EV_BATTERY, EV_DPI, LIGHT, POLLING } from '../domain/protocol'
import { decodeDpi, decodeLight, decodePolling } from '../domain/reports'
import { MouseLink, type Timing } from './mouseLink'

export type { Timing }
import type { HidChannel, MouseDevice } from './ports'

declare const confirmedBrand: unique symbol
/** plano q passou pela confirmação do usuário; só sai de confirmPlan */
export type ConfirmedPlan = Readonly<ChangePlan> & { readonly [confirmedBrand]: true }
// o tipo segura no compilador, o WeakSet segura em runtime (um cast não fura)
const confirmed = new WeakSet<object>()

export const connect = (channel: HidChannel, timing?: Partial<Timing>): MouseDevice => new MouseLink(channel, timing)

export const disconnect = (device: MouseDevice) => device.close()

/** ReadConfig: identifica o mouse e lê os 3 reports, sem escrever nada */
export async function readConfig(device: MouseDevice): Promise<MouseConfig> {
  const { model, version } = await device.identify()
  const dpi = decodeDpi(await device.read(DPI))
  const light = decodeLight(await device.read(LIGHT))
  const polling = decodePolling(await device.read(POLLING))
  return { wired: device.wired, model, version, dpi, light, polling }
}

/** PlanChanges: o q mudou entre o lido e o rascunho, e os pacotes q isso vira */
export const planChanges = (current: MouseSettings, draft: MouseSettings): ChangePlan => plan(current, draft)

/** a confirmação do usuário: congela uma cópia dos pacotes, mexer no plano depois não muda nada */
export function confirmPlan(p: ChangePlan): ConfirmedPlan {
  if (!p.packets.length) throw new Error('nada pra gravar')
  const frozen = Object.freeze({ changes: [...p.changes], packets: p.packets.map((b) => b.slice()) }) as ConfirmedPlan
  confirmed.add(frozen)
  return frozen
}

/** ApplyChanges: grava só plano confirmado e relê tudo pra conferir com o q foi mandado */
export async function applyChanges(device: MouseDevice, p: ConfirmedPlan): Promise<{ config: MouseConfig; verified: boolean }> {
  if (!confirmed.has(p)) throw new Error('plano não confirmado: nada foi enviado')
  for (const packet of p.packets) await device.write(packet)
  const config = await readConfig(device)
  return { config, verified: readBackMatches(p.packets, config) }
}

/** ReadBattery: a bateria já conhecida na hora e as próximas a cada heartbeat (o X11 manda a cada 2 s) */
export function readBattery(device: MouseDevice, onChange: (b: Battery) => void) {
  if (device.battery) onChange(device.battery)
  return device.onEvent((ev) => {
    if (ev.event === EV_BATTERY) onChange(device.battery as Battery)
  })
}

/** o botão de DPI do mouse troca o estágio ativo sem passar pela gente */
export function followActiveStage(device: MouseDevice, onChange: (stage: number) => void) {
  return device.onEvent((ev) => {
    if (ev.event === EV_DPI && ev.v0 >= 1 && ev.v0 <= 8) onChange(ev.v0)
  })
}
