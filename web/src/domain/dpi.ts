// Porta da parte de DPI do sharkx11/protocol.py.
import { dpi as validDpi } from './model'

// Tabela de código do sensor T[n] (n = 0..220), copiada do AttackShark.exe @0x4ec024; T[n] ~ round(50n / 42.55).
// A posição 0 nunca é usada (passo começa em 1), fica só pra manter o índice igual ao do app.
export const T: readonly number[] = [
  0xffffff,
  1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 21, 22, 23,
  24, 25, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 47,
  48, 49, 50, 51, 52, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 67, 68, 69, 70,
  71, 72, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 87, 88, 89, 90, 91, 92, 94,
  95, 96, 97, 98, 99, 101, 102, 103, 104, 105, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117,
  118, 119, 121, 122, 123, 124, 125, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137, 138, 139, 141,
  142, 143, 144, 145, 147, 148, 149, 150, 151, 152, 154, 155, 156, 157, 158, 159, 161, 162, 163, 164,
  165, 167, 168, 169, 170, 171, 172, 174, 175, 176, 177, 178, 179, 181, 182, 183, 184, 185, 187, 188,
  189, 190, 191, 192, 194, 195, 196, 197, 198, 199, 201, 202, 203, 204, 205, 207, 208, 209, 210, 211,
  212, 214, 215, 216, 217, 218, 219, 221, 222, 223, 224, 225, 227, 228, 229, 230, 231, 232, 234, 235,
  118, 119, 121, 122, 123, 124, 125, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137, 138, 139, 141,
]

export type Encoded = [code: number, low: number, high: number]

/** Passo do slider do app (1..320): de 50 em 50 até 10000, depois de 100 em 100 até 22000. */
export function dpiToStep(dpi: number): number {
  dpi = validDpi(dpi)
  return dpi <= 10000 ? dpi / 50 : dpi / 100 + 100
}

export function stepToDpi(n: number): number {
  return n <= 200 ? 50 * n : 100 * (n - 100)
}

const t = (n: number) => T[n] as number

/** (código, flag baixa, flag alta) do passo n, DPI ~ código * 42.55 * 2^(baixa + alta). */
export function encodeStep(n: number): Encoded {
  if (n <= 200) return [t(n), 0, 0]
  if (n <= 220) return [t(n), 1, 0]
  if (n <= 300) return [t(n - 100), 0, 1]
  // o app usa T[200 + ((n - 300) >> 1)], q pro passo 301 dá o código de 10000 DPI vezes 4 (uns 40000 DPI).
  // Aqui vai a fórmula, igual ao Python, q chega nos mesmos 22000 no fim da faixa
  return [Math.round(stepToDpi(n) / (42.55 * 4)), 1, 1]
}

// acima de 20000 DPI dois passos podem ter o mesmo código: o maior sobrescreve (é o 22000 q a gente quer)
const DECODE = new Map<string, number>()
for (let n = 1; n <= 320; n++) DECODE.set(encodeStep(n).join(), n)

/** Passo de uma codificação lida do mouse, ou o passo mais perto pela fórmula física. */
export function decodeStep(code: number, low: number, high: number): number {
  const known = DECODE.get([code, low, high].join())
  if (known !== undefined) return known
  const dpi = code * 42.55 * 2 ** (low + high)
  let best = 1
  for (let k = 2; k <= 320; k++) {
    if (Math.abs(stepToDpi(k) - dpi) < Math.abs(stepToDpi(best) - dpi)) best = k
  }
  return best
}
