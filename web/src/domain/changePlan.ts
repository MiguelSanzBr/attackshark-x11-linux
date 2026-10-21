// Compara o q foi lido do mouse com o rascunho: vira a lista q o usuário confirma e os pacotes q vão
// ser enviados. Só manda o report q teve alguma mudança, na ordem do app oficial (0x04, 0x05, 0x06).
import { type MouseSettings, lightEffectName } from './model'
import { DPI, LIGHT, POLLING } from './protocol'
import { encodeDpi, encodeLight, encodePolling } from './reports'

export interface Change {
  label: string
  from: string
  to: string
}

export interface ChangePlan {
  changes: Change[]
  packets: Uint8Array[]
}

const yesNo = (v: boolean) => (v ? 'sim' : 'não')
const onOff = (v: boolean) => (v ? 'ligado' : 'desligado')

export function planChanges(read: MouseSettings, draft: MouseSettings): ChangePlan {
  const changes: Change[] = []
  const diff = (label: string, a: unknown, b: unknown, fmt: (v: never) => string = String) => {
    if (a !== b) changes.push({ label, from: fmt(a as never), to: fmt(b as never) })
  }
  const packets: Uint8Array[] = []

  const before = changes.length
  draft.dpi.stages.forEach((s, i) => {
    const r = read.dpi.stages[i] as typeof s
    diff(`Estágio ${i + 1}: DPI`, r.dpi, s.dpi)
    diff(`Estágio ${i + 1}`, r.on, s.on, onOff)
    diff(`Estágio ${i + 1}: cor`, r.color, s.color)
  })
  diff('Estágio ativo', read.dpi.active, draft.dpi.active)
  diff('Angle snap', read.dpi.angleSnap, draft.dpi.angleSnap, yesNo)
  diff('Ripple control', read.dpi.ripple, draft.dpi.ripple, yesNo)
  if (changes.length > before) packets.push(encodeDpi(draft.dpi))

  const beforeLight = changes.length
  const [a, b] = [read.light, draft.light]
  diff('Efeito de luz', a.mode, b.mode, lightEffectName)
  diff('Cor da luz', a.color, b.color)
  diff('Brilho', a.brightness, b.brightness)
  diff('Velocidade do efeito', a.speed, b.speed)
  diff('Sono', a.sleep, b.sleep, (v: number) => `${v} min`)
  diff('Sono profundo', a.deepSleep, b.deepSleep, (v: number) => `${v} min`)
  diff('Debounce dos botões', a.debounce, b.debounce)
  if (changes.length > beforeLight) packets.push(encodeLight(draft.light))

  const hz = (v: number | null) => (v === null ? 'desconhecido' : `${v} Hz`)
  if (read.polling.rate !== draft.polling.rate) {
    diff('Polling rate', read.polling.rate, draft.polling.rate, hz)
    packets.push(encodePolling(draft.polling.rate as number))
  }
  return { changes, packets }
}

/** depois de gravar o app relê tudo: cada pacote enviado tem q voltar igualzinho */
export function readBackMatches(packets: readonly Uint8Array[], after: MouseSettings): boolean {
  const raws: Record<number, Uint8Array> = { [DPI]: after.dpi.raw, [LIGHT]: after.light.raw, [POLLING]: after.polling.raw }
  return packets.every((p) => {
    const raw = raws[p[0] as number]
    return raw !== undefined && raw.length === p.length && raw.every((v, i) => v === p[i])
  })
}
