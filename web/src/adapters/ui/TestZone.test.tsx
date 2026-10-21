import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestZone } from './TestZone'

function renderZone() {
  const { container, unmount } = render(<TestZone led="#4cd964" frame="hero-art" />)
  const zone = screen.getByRole('group', { name: 'Área de teste' })
  const part = (name: string) => container.querySelector(`[data-part="${name}"]`) as SVGElement
  const lit = () => [...container.querySelectorAll('.lit')].map((el) => el.getAttribute('data-part'))
  const arrow = () => container.querySelector('.wheel-arrow')
  return { zone, part, lit, arrow, unmount }
}

// o fireEvent devolve false quando alguém chamou preventDefault
const aux = (el: Element, button: number) =>
  fireEvent(el, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button }))

afterEach(() => {
  vi.useRealTimers()
})

describe('área de teste', () => {
  it('mostra o rótulo e a dica', () => {
    renderZone()
    expect(screen.getByText('Área de teste')).toBeVisible()
    expect(screen.getByText('Clique com o mouse: os botões acendem aqui.')).toBeVisible()
  })

  it.each([
    [0, 'left'], [1, 'middle'], [2, 'right'], [3, 'back'], [4, 'forward'],
  ])('botão %i acende %s enquanto está apertado', (button, name) => {
    const { zone, part, lit } = renderZone()
    fireEvent.mouseDown(zone, { button })
    expect(part(name)).toHaveClass('lit')
    expect(lit()).toEqual([name])
    fireEvent.mouseUp(zone, { button })
    expect(lit()).toEqual([])
  })

  it('acende mais de um botão ao mesmo tempo e apaga só o q foi solto', () => {
    const { zone, lit } = renderZone()
    fireEvent.mouseDown(zone, { button: 0 })
    fireEvent.mouseDown(zone, { button: 2 })
    expect(lit()).toEqual(['left', 'right'])
    fireEvent.mouseUp(zone, { button: 0 })
    expect(lit()).toEqual(['right'])
  })

  it('saiu da área com botão apertado: apaga tudo', () => {
    const { zone, lit } = renderZone()
    fireEvent.mouseDown(zone, { button: 0 })
    fireEvent.mouseDown(zone, { button: 4 })
    fireEvent.mouseLeave(zone)
    expect(lit()).toEqual([])
  })

  it('botão q o X11 não tem não acende nada', () => {
    const { zone, lit } = renderZone()
    fireEvent.mouseDown(zone, { button: 5 })
    expect(lit()).toEqual([])
  })

  it('segura o menu de contexto e o voltar/avançar do navegador', () => {
    const { zone } = renderZone()
    expect(fireEvent.contextMenu(zone, { button: 2 })).toBe(false)
    for (const button of [3, 4]) {
      expect(fireEvent.mouseDown(zone, { button })).toBe(false)
      expect(fireEvent.mouseUp(zone, { button })).toBe(false)
      expect(aux(zone, button)).toBe(false)
    }
  })

  it.each([
    [120, 'down'], [-120, 'up'],
  ])('roda com deltaY %i pulsa a seta %s e não rola a página', (deltaY, direction) => {
    vi.useFakeTimers()
    const { zone, arrow } = renderZone()
    expect(fireEvent.wheel(zone, { deltaY })).toBe(false)
    expect(arrow()).toHaveClass(direction)
    act(() => vi.advanceTimersByTime(300))
    // girou de novo antes de sumir: a seta fica e o tempo recomeça
    fireEvent.wheel(zone, { deltaY })
    act(() => vi.advanceTimersByTime(300))
    expect(arrow()).toHaveClass(direction)
    act(() => vi.advanceTimersByTime(200))
    expect(arrow()).toBeNull()
  })

  it('rolagem só na horizontal não pulsa mas também não rola a página', () => {
    const { zone, arrow } = renderZone()
    expect(fireEvent.wheel(zone, { deltaX: 50, deltaY: 0 })).toBe(false)
    expect(arrow()).toBeNull()
  })

  it('desmontou: solta o listener da roda', () => {
    vi.useFakeTimers()
    const { zone, unmount } = renderZone()
    fireEvent.wheel(zone, { deltaY: 1 })
    unmount()
    expect(fireEvent.wheel(zone, { deltaY: 1 })).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
