import { type KeyboardEvent, useReducer, useRef, useState } from 'react'
import type { HidChannel, MouseDevice } from '../../application/ports'
import {
  type Timing, applyChanges, confirmPlan, connect as openMouse, disconnect as closeMouse, followActiveStage, readBattery, readConfig,
} from '../../application/useCases'
import type { ChangePlan } from '../../domain/changePlan'
import type { DpiStage, MouseSettings } from '../../domain/model'
import { MODELS, MODEL_X11 } from '../../domain/protocol'
import { DpiTab, LightTab, PerformanceTab, PowerTab } from './editors'
import { Alert, Battery, Bolt, Cable, Check, Flask, Unplug, Wireless } from './icons'
import { Review } from './Review'
import { initial, pending, reducer } from './state'
import { TestZone } from './TestZone'
import { ThemeToggle } from './ThemeToggle'
import './app.css'

// driving adapter: só chama casos de uso. Os canais (WebHID ou demo) chegam prontos da raiz de composição
interface Props {
  /** o navegador tem navigator.hid */
  webHid: boolean
  /** abre o seletor do WebHID; null se o usuário fechar sem escolher */
  openDevice: () => Promise<HidChannel | null>
  openDemo: () => HidChannel
  timing?: Partial<Timing>
}

const TABS = [
  { id: 'dpi', name: 'DPI', Panel: DpiTab },
  { id: 'perf', name: 'Desempenho', Panel: PerformanceTab },
  { id: 'light', name: 'Iluminação', Panel: LightTab },
  { id: 'power', name: 'Energia', Panel: PowerTab },
] as const
type Tab = (typeof TABS)[number]

const message = (e: unknown) => (e as Error).message
const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0')
const ACCENT = '#4cd964'

export function App({ webHid, openDevice, openDemo, timing }: Props) {
  const [state, dispatch] = useReducer(reducer, initial)
  const [tab, setTab] = useState(0)
  const mouseRef = useRef<MouseDevice | null>(null)
  const supported = webHid
  const { phase, config, battery } = state
  const busy = phase === 'connecting' || phase === 'writing'

  async function connect(demo: boolean) {
    dispatch({ type: 'connect', demo })
    try {
      const channel = demo ? openDemo() : await openDevice()
      if (!channel) {
        return dispatch({ type: 'failed', status: 'Nenhum mouse escolhido. Clique em Conectar mouse e escolha o X11 na lista do navegador.' })
      }
      const mouse = openMouse(channel, timing)
      mouseRef.current = mouse
      readBattery(mouse, (b) => dispatch({ type: 'battery', battery: b }))
      followActiveStage(mouse, (stage) => dispatch({ type: 'activeStage', stage }))
      // só leitura aqui: nada é escrito ao conectar
      const read = await readConfig(mouse)
      dispatch({ type: 'loaded', config: read, status: 'Configuração lida do mouse. Nada é gravado sem você revisar e confirmar.' })
    } catch (e) {
      if (mouseRef.current) await closeMouse(mouseRef.current)
      mouseRef.current = null
      dispatch({ type: 'failed', status: `${message(e)}. Confira o cabo ou o receptor e conecte de novo.` })
    }
  }

  async function write() {
    const mouse = mouseRef.current as MouseDevice
    // o clique em "Gravar no mouse" é a confirmação: só daqui sai um plano q o applyChanges aceita
    const confirmed = confirmPlan(state.plan as ChangePlan)
    dispatch({ type: 'writing' })
    try {
      // o applyChanges relê tudo depois, então a tela mostra o q ficou no mouse de verdade
      const { config: after, verified } = await applyChanges(mouse, confirmed)
      dispatch({ type: 'loaded', config: after, status: 'Gravado e conferido: a releitura do mouse bate com o q foi enviado.' })
      if (!verified) {
        dispatch({ type: 'failed', status: 'Gravado, mas a releitura veio diferente do enviado. Confira os valores na tela.' })
      }
    } catch (e) {
      dispatch({ type: 'failed', status: `Falhou ao gravar: ${message(e)}. O rascunho continua aqui: confira o cabo ou o receptor e grave de novo.` })
    }
  }

  async function disconnect() {
    await closeMouse(mouseRef.current as MouseDevice)
    mouseRef.current = null
    dispatch({ type: 'disconnect' })
  }

  // setas trocam de aba e levam o foco junto, como pede o padrão de tabs do ARIA
  function tabKey(e: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!step) return
    const next = (tab + step + TABS.length) % TABS.length
    setTab(next)
    ;(document.getElementById(`tab-${(TABS[next] as Tab).id}`) as HTMLElement).focus()
  }

  // só o visual: quem anuncia é o status lá embaixo, q fica montado o tempo todo
  const statusLine = (
    <p aria-hidden="true" className={state.error ? 'status error' : 'status'}>
      {state.status}
    </p>
  )

  let body
  if (!config) {
    body = (
      <section className="hero" aria-labelledby="start-title">
        <TestZone led={ACCENT} frame="hero-art" />
        <div className="hero-copy">
          <p className="eyebrow">Configurador via <span translate="no">WebHID</span></p>
          <h2 id="start-title">DPI, luz e polling do seu <span translate="no">X11</span>, direto no navegador</h2>
          <p className="lead">
            Plugue o receptor 2.4 GHz ou o cabo USB e escolha o mouse no seletor do navegador. A configuração é lida
            primeiro e nada é gravado sem você revisar e confirmar.
          </p>
          {!supported && (
            <div className="callout warn">
              <Alert />
              <div>
                <h3>Navegador sem <span translate="no">WebHID</span></h3>
                <p id="no-webhid">
                  WebHID só funciona no Chrome e no Edge, no desktop. Firefox e Safari não têm essa API, então aqui dá
                  pra usar só o modo demo, com um mouse simulado.
                </p>
              </div>
            </div>
          )}
          <div className="hero-actions">
            <button type="button" className="button primary large" disabled={busy || !supported}
              aria-describedby={supported ? undefined : 'no-webhid'} onClick={() => void connect(false)}>
              {phase === 'connecting' && !state.demo ? 'Conectando…' : 'Conectar mouse'}
            </button>
            <button type="button" className="button secondary large" disabled={busy} onClick={() => void connect(true)}>
              Entrar no modo demo
            </button>
          </div>
          {statusLine}
          <ul className="perks">
            <li><Check />Ao conectar o site só lê</li>
            <li><Check />Você revisa cada alteração antes</li>
            <li><Check />Depois de gravar, relê pra conferir</li>
          </ul>
        </div>
      </section>
    )
  } else {
    const draft = state.draft as MouseSettings
    const active = draft.dpi.stages[draft.dpi.active - 1] as DpiStage
    const changes = pending(state)
    const ready = phase === 'ready'
    const { id, Panel } = TABS[tab] as Tab
    body = (
      <>
        <div className="workspace">
          <aside className="art-panel" aria-label="Mouse">
            <TestZone led={active.color} frame="art-frame" />
            <p className="art-caption">
              <span className="dot" style={{ background: active.color }} />
              Estágio&nbsp;{draft.dpi.active} · {active.dpi}&nbsp;DPI
            </p>
          </aside>
          <div className="settings">
            {config.model !== MODEL_X11 && (
              <p className="callout warn">
                <Alert />
                Modelo não testado: só o X11 foi verificado, outro modelo pode usar outro layout.
              </p>
            )}
            <fieldset className="editors" disabled={!ready}>
              <legend className="sr-only">Configuração</legend>
              <div role="tablist" aria-label="Configuração" className="tabs" onKeyDown={tabKey}>
                {TABS.map((t, i) => (
                  <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" className="tab" aria-selected={i === tab}
                    aria-controls={`panel-${t.id}`} tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}>
                    {t.name}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="panel">
                <Panel draft={draft} dispatch={dispatch} />
              </div>
            </fieldset>
          </div>
        </div>

        <div className={typeof changes === 'number' && changes > 0 ? 'dock staged' : 'dock'}>
          {statusLine}
          <p className="meta">
            <span>Modelo <b translate="no">{config.model === null ? 'desconhecido' : (MODELS[config.model] ?? hex(config.model))}</b></span>
            <span>Firmware <b>{config.version}</b></span>
          </p>
          <div className="dock-actions">
            <span className={typeof changes === 'string' ? 'pending error' : 'pending'} aria-live="polite">
              {typeof changes === 'string' ? changes
                : changes === 0 ? 'Sem alterações' : `${changes} ${changes === 1 ? 'alteração' : 'alterações'}`}
            </span>
            <button type="button" className="button ghost" disabled={!ready || changes === 0} onClick={() => dispatch({ type: 'discard' })}>
              Descartar{' '}<span className="wide-only">alterações</span>
            </button>
            <button type="button" className="button primary" disabled={!ready || typeof changes === 'string' || changes === 0}
              onClick={() => dispatch({ type: 'review' })}>
              Revisar{' '}<span className="wide-only">alterações</span>
            </button>
          </div>
        </div>
      </>
    )
  }

  const demo = state.demo && phase !== 'start'
  return (
    <div className={demo ? 'app demo' : 'app'}>
      <div className="shell" inert={state.plan !== null}>
        <header className="top">
          <h1 translate="no">ATTACK SHARK X11</h1>
          <div className="top-right">
            {config && (
              <ul className="badges">
                <li className="badge">
                  {config.wired ? <Cable /> : <Wireless />}
                  <span className="sr-only">Conexão: </span>
                  <span>{state.demo ? 'simulada' : config.wired ? 'cabo USB' : 'receptor 2.4 GHz'}</span>
                </li>
                <li className="badge">
                  <span className="sr-only">Bateria: </span>
                  {battery ? (
                    <>
                      <Battery percent={battery.percent} />
                      <span>{battery.percent}%</span>
                      {battery.charging && <Bolt />}
                    </>
                  ) : (
                    <span>aguardando</span>
                  )}
                </li>
              </ul>
            )}
            <ThemeToggle />
            {config && (
              <button type="button" className="button ghost small" disabled={busy} onClick={() => void disconnect()}>
                <Unplug />
                <span className="wide-only">Desconectar</span>
              </button>
            )}
          </div>
        </header>

        {demo && (
          <div role="note" className="demo-banner">
            <Flask />
            <span><strong>Modo demo</strong>: mouse simulado em memória. Nenhum hardware é tocado.</span>
          </div>
        )}

        <main>{body}</main>

        <footer className="credits">
          Porta pro navegador do{' '}
          <a href="https://github.com/MiguelSanzBr/attackshark-x11-linux" translate="no">attackshark-x11-linux</a>. Licença MIT.
        </footer>
      </div>

      {/* fora da casca: ela fica inerte na revisão e o leitor de tela perderia o "Gravando…" */}
      <p role="status" aria-live="polite" className="sr-only">{state.status}</p>

      {state.plan && (
        <Review plan={state.plan} busy={busy} onConfirm={() => void write()} onBack={() => dispatch({ type: 'back' })} />
      )}
    </div>
  )
}
