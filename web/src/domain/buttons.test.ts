import { describe, expect, it } from 'vitest'
import { partForButton, wheelDirection } from './buttons'

describe('partForButton', () => {
  // numeração do MouseEvent.button, a mesma ordem dos botões no HID
  it.each([
    [0, 'left'], [1, 'middle'], [2, 'right'], [3, 'back'], [4, 'forward'],
  ])('botão %i acende %s', (button, part) => {
    expect(partForButton(button)).toBe(part)
  })

  it.each([-1, 5, 7])('botão %i não existe no X11', (button) => {
    expect(partForButton(button)).toBeNull()
  })
})

describe('wheelDirection', () => {
  it.each([
    [-100, 'up'], [-0.5, 'up'], [3, 'down'], [120, 'down'], [0, null],
  ])('deltaY %d vira %s', (deltaY, direction) => {
    expect(wheelDirection(deltaY)).toBe(direction)
  })
})
