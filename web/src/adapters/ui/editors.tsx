import type { CSSProperties, Dispatch, ReactNode } from 'react'
import { dpiToStep, stepToDpi } from '../../domain/dpi'
import {
  LIGHT_EFFECTS, LIGHT_EFFECT_NAMES, type DpiStage, type LightEffect, type LightSettings, type MouseSettings, POLLING_RATES,
  type PollingRate, lightEffectName,
} from '../../domain/model'
import { ColorPicker } from './ColorPicker'
import type { Action } from './state'

interface Props {
  draft: MouseSettings
  dispatch: Dispatch<Action>
}

const num = (e: { target: { value: string } }) => Number(e.target.value)
// pinta o trilho do slider até o valor
const fill = (value: number, min: number, max: number) => ({ '--fill': `${((value - min) / (max - min)) * 100}%` }) as CSSProperties

const Card = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="card">
    <h3>{title}</h3>
    {hint && <p className="hint">{hint}</p>}
    {children}
  </section>
)

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = label.replace(/\W+/g, '-').toLowerCase()
  return (
    <div className="switch-row">
      <label htmlFor={id}>{label}</label>
      <small id={`${id}-hint`} className="hint">{hint}</small>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.checked)} />
    </div>
  )
}

interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  unit?: string
  hint?: string
  onChange: (v: number) => void
}

function SliderRow({ id, label, value, min, max, unit = '', hint, onChange }: SliderProps) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" className="slider" min={min} max={max} value={value} style={fill(value, min, max)}
        aria-valuetext={`${value}${unit}`} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(num(e))} />
      <span className="value" aria-hidden="true">{`${value}${unit}`}</span>
      {hint && <small id={`${id}-hint`} className="hint">{hint}</small>}
    </div>
  )
}

/** escolha única em pílulas, como os chips do app; por baixo é radio, então teclado e leitor de tela já funcionam */
function Chips<T extends string | number>(
  { legend, name, value, options, onChange }: { legend: string; name: string; value: unknown; options: [T, string][]; onChange: (v: T) => void },
) {
  return (
    <fieldset className="chips">
      <legend className="sr-only">{legend}</legend>
      {options.map(([v, text]) => (
        <label key={v} className="chip-option">
          <input type="radio" name={name} checked={v === value} onChange={() => onChange(v)} />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
  )
}

export function DpiTab({ draft: { dpi }, dispatch }: Props) {
  const stage = (index: number, patch: Partial<DpiStage>) => dispatch({ type: 'stage', index, patch })
  // como no app: o estágio ativo é o q tem a cor editada
  const edit = dpi.active - 1
  return (
    <Card title="Estágios de DPI" hint="Clique no número pra ativar o estágio e editar a cor dele. O botão de DPI do mouse alterna entre os estágios ligados.">
      <ol className="stages">
        {dpi.stages.map((s, i) => {
          const n = i + 1
          const step = dpiToStep(s.dpi)
          return (
            <li key={n} className={s.on ? 'stage' : 'stage off'}>
              <input type="checkbox" role="switch" className="switch" checked={s.on} aria-label={`Estágio ${n}: ligado`}
                onChange={(e) => stage(i, { on: e.target.checked })} />
              <button type="button" className="stage-chip" aria-pressed={i === edit} aria-label={`Estágio ${n}: ativar e editar a cor`}
                onClick={() => dispatch({ type: 'dpi', patch: { active: n } })}>
                <span className="dot" style={{ background: s.color }} />
                {n}
              </button>
              <input type="range" className="slider" min={1} max={320} value={step} style={fill(step, 1, 320)}
                aria-label={`Estágio ${n}: DPI`} aria-valuetext={`${s.dpi} DPI`} onChange={(e) => stage(i, { dpi: stepToDpi(num(e)) })} />
              <span className="value" aria-hidden="true">{s.dpi} DPI</span>
            </li>
          )
        })}
      </ol>
      <h4 className="picker-title">Cor do estágio {edit + 1}</h4>
      {/* key: trocar de estágio zera o q tava digitado no hex */}
      <ColorPicker key={edit} color={(dpi.stages[edit] as DpiStage).color} label={`Estágio ${edit + 1}: cor`}
        onChange={(color) => stage(edit, { color })} />
    </Card>
  )
}

export function PerformanceTab({ draft: { dpi, polling, light }, dispatch }: Props) {
  return (
    <>
      <Card title="Taxa de polling" hint="Quantas vezes por segundo o mouse manda a posição pro computador.">
        <Chips legend="Polling rate" name="polling" value={polling.rate} options={POLLING_RATES.map((hz): [PollingRate, string] => [hz, `${hz} Hz`])}
          onChange={(rate) => dispatch({ type: 'polling', rate })} />
        {polling.rate === null && <p className="hint warn-text">O mouse mandou uma taxa q o app não conhece.</p>}
      </Card>
      <Card title="Sensor e cliques">
        <Switch label="Angle snap" hint="corrige linhas tortas" checked={dpi.angleSnap}
          onChange={(angleSnap) => dispatch({ type: 'dpi', patch: { angleSnap } })} />
        <Switch label="Ripple control" hint="suaviza tremidas" checked={dpi.ripple}
          onChange={(ripple) => dispatch({ type: 'dpi', patch: { ripple } })} />
        <SliderRow id="debounce" label="Debounce dos botões" value={light.debounce} min={2} max={25} unit=" ms"
          onChange={(debounce) => dispatch({ type: 'light', patch: { debounce } })} />
      </Card>
    </>
  )
}

export function LightTab({ draft: { light }, dispatch }: Props) {
  const set = (patch: Partial<LightSettings>) => dispatch({ type: 'light', patch })
  return (
    <>
      <Card title="Efeito">
        <Chips legend="Efeito de luz" name="mode" value={light.mode} options={LIGHT_EFFECTS.map((m): [LightEffect, string] => [m, LIGHT_EFFECT_NAMES[m]])}
          onChange={(mode) => set({ mode })} />
        {typeof light.mode === 'number' && <p className="hint warn-text">Efeito lido do mouse: {lightEffectName(light.mode)}</p>}
        <SliderRow id="brightness" label="Brilho" value={light.brightness} min={1} max={8} hint="só vale nos modos estáticos"
          onChange={(brightness) => set({ brightness })} />
        <SliderRow id="speed" label="Velocidade do efeito" value={light.speed} min={1} max={5} onChange={(speed) => set({ speed })} />
      </Card>
      <Card title="Cor">
        <ColorPicker color={light.color} label="Cor da luz" onChange={(color) => set({ color })} />
      </Card>
    </>
  )
}

export function PowerTab({ draft: { light }, dispatch }: Props) {
  const set = (patch: Partial<LightSettings>) => dispatch({ type: 'light', patch })
  return (
    <Card title="Economia de energia" hint="A bateria aparece no topo enquanto o mouse tá ligado ao receptor.">
      <SliderRow id="sleep" label="Sono" value={light.sleep} min={1} max={60} unit=" min" onChange={(sleep) => set({ sleep })} />
      <SliderRow id="deep-sleep" label="Sono profundo" value={light.deepSleep} min={1} max={60} unit=" min"
        onChange={(deepSleep) => set({ deepSleep })} />
    </Card>
  )
}
