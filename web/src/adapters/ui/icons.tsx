import type { ReactNode } from 'react'

// ícones de traço simples, herdam a cor do texto
const Icon = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const Sun = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

export const Moon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
)

/** o leque do Wi-Fi do badge do app: receptor 2.4 GHz */
export const Wireless = () => (
  <Icon>
    <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19.5" r="1" fill="currentColor" />
  </Icon>
)

export const Cable = () => (
  <Icon>
    <path d="M9 2v5M15 2v5M7 7h10v4a5 5 0 0 1-10 0zM12 16v6" />
  </Icon>
)

export const Battery = ({ percent }: { percent: number }) => (
  <svg className="icon battery" width={26} height={18} viewBox="0 0 26 18" aria-hidden="true">
    <rect x="1" y="3" width="21" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <rect x="23" y="7" width="2" height="4" rx="1" fill="currentColor" />
    <rect x="3.5" y="5.5" width={(16 * Math.min(Math.max(percent, 0), 100)) / 100} height="7" rx="1.5" fill="currentColor" />
  </svg>
)

export const Bolt = () => (
  <svg className="icon" width={14} height={14} viewBox="0 0 24 24" role="img" aria-label="carregando">
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
  </svg>
)

export const Unplug = () => (
  <Icon size={16}>
    <path d="M18 6 6 18M7 7l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3M17 17l3-3a4 4 0 0 0-5.7-5.7L13 9.6" />
  </Icon>
)

export const Alert = () => (
  <Icon>
    <path d="M12 3 2 20h20zM12 10v4M12 17h.01" />
  </Icon>
)

export const Flask = () => (
  <Icon>
    <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9" />
  </Icon>
)

export const Check = () => (
  <Icon size={16}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
)
