import { describe, expect, it } from 'vitest'
import { DPI, IDENT, checksum, parseEvent, readRequest } from './protocol'

const bytes = (...b: number[]) => Uint8Array.from(b)

describe('checksum', () => {
  it('soma 16 bits em big-endian, com estouro', () => {
    // espelha protocol.checksum (test_checksum_and_read_request): 300 * 255 = 76500 -> 0x12AD4
    expect(checksum(new Uint8Array(300).fill(0xff))).toEqual(bytes(0x2a, 0xd4))
    expect(checksum(bytes())).toEqual(bytes(0, 0))
  })
})

describe('readRequest', () => {
  it('monta o pedido 0xA0 com id, tamanho e flag', () => {
    // espelha protocol.read_request(DPI)
    expect(readRequest(DPI)).toEqual(bytes(0xa0, 0x04, 56, 0, 1, 0, 0, 0))
    // espelha protocol.read_request(IDENT, 0): o app usa flag 0 só pro 0x0B
    expect(readRequest(IDENT, 0)).toEqual(bytes(0xa0, 0x0b, 8, 0, 0, 0, 0, 0))
  })
})

describe('parseEvent', () => {
  it('lê modelo, evento e valores do input report 0x03', () => {
    // espelha protocol.parse_event (test_parse_event)
    expect(parseEvent(bytes(3, 0x55, 0x40, 1, 87))).toEqual({ model: 0x55, event: 0x40, v0: 1, v1: 87 })
  })

  it('ignora report com outro id ou curto demais', () => {
    expect(parseEvent(bytes(2, 0x55, 0x40, 1, 87))).toBeNull()
    expect(parseEvent(bytes(3, 0x55))).toBeNull()
  })
})
