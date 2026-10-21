// Botões físicos do X11 na ordem do MouseEvent.button. O navegador entrega o clique já remapeado
// pelo sistema, então isso mostra o q a página recebe e não o remapeamento gravado no mouse

export type MousePart = 'left' | 'middle' | 'right' | 'back' | 'forward'
export type WheelDirection = 'up' | 'down'

const BY_BUTTON: readonly MousePart[] = ['left', 'middle', 'right', 'back', 'forward']

/** 3 é a lateral de trás (voltar), 4 a da frente (avançar) */
export const partForButton = (button: number): MousePart | null => BY_BUTTON[button] ?? null

/** deltaY negativo é a roda pra cima; 0 vem de rolagem só na horizontal */
export const wheelDirection = (deltaY: number): WheelDirection | null =>
  deltaY < 0 ? 'up' : deltaY > 0 ? 'down' : null
