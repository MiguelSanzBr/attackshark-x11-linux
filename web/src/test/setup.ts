import '@testing-library/jest-dom/vitest'

// o jsdom não tem matchMedia nem pointer capture, e a UI usa os dois (tema e roda de cor)
window.matchMedia ??= ((media: string) => ({ media, matches: false })) as unknown as typeof window.matchMedia
Element.prototype.setPointerCapture ??= () => undefined
