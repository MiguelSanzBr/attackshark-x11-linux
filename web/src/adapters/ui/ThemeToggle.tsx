import { useState } from 'react'
import { Moon, Sun } from './icons'

const root = document.documentElement
// mesmo --bg do app.css: a barra do navegador no celular acompanha o fundo
const BG = { light: '#f3f4f6', dark: '#151515' }

/** sem escolha salva segue o sistema; o index.html aplica a salva antes do React pra não piscar */
export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches,
  )
  function toggle() {
    const next = dark ? 'light' : 'dark'
    root.dataset.theme = next
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = BG[next]
    setDark(!dark)
    try {
      localStorage.setItem('theme', next)
    } catch {
      // storage bloqueado: o tema troca, só não fica salvo
    }
  }
  return (
    <button type="button" className="icon-button" aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'} onClick={toggle}>
      {dark ? <Sun /> : <Moon />}
    </button>
  )
}
