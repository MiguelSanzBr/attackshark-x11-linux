// Portas da aplicação. HidChannel é o canal HID cru, quem implementa são os adapters (WebHID de verdade
// ou o mouse simulado do demo). Todo report aqui carrega o id no byte 0, igual no hidraw do Linux.
import type { Battery } from '../domain/model'
import type { MouseEvent, ReportId } from '../domain/protocol'

export interface HidChannel {
  /** no cabo USB a própria escrita da feature já é a confirmação, não vem ACK */
  readonly wired: boolean
  setFeature(data: Uint8Array): Promise<void>
  getFeature(rid: number, size: number): Promise<Uint8Array>
  /** devolve a função pra parar de ouvir */
  onInput(listener: (report: Uint8Array) => void): () => void
  close(): Promise<void>
}

/** o mouse já com o protocolo por cima do canal: é o q os casos de uso enxergam */
export interface MouseDevice {
  readonly wired: boolean
  readonly battery: Battery | null
  read(rid: ReportId): Promise<Uint8Array>
  write(data: Uint8Array): Promise<void>
  identify(): Promise<{ model: number | null; version: string }>
  onEvent(listener: (ev: MouseEvent) => void): () => void
  close(): Promise<void>
}
