import { defaultDpi, defaultLight, encodeDpi, encodeLight, encodePolling, decodeDpi, decodeLight, decodePolling } from '../domain/reports'
import type { MouseConfig } from '../domain/model'

// config como se tivesse acabado de vir do mouse (passou por encode/decode, igual o modo demo)
export const readConfig = (): MouseConfig => ({
  wired: false,
  model: 0x55,
  version: '1.12',
  dpi: decodeDpi(encodeDpi(defaultDpi())),
  light: decodeLight(encodeLight(defaultLight())),
  polling: decodePolling(encodePolling(1000)),
})
