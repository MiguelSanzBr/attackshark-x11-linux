import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeDpi, decodeLight, decodePolling } from '../../domain/reports'
import { DPI, EV_BATTERY, EV_DPI, LIGHT, POLLING, READ_REQ, checksum } from '../../domain/protocol'
import { deviceBackedBy, fakeHid } from '../../test/fakeHid'
import { DemoChannel } from '../demo/demoChannel'
import { WebHidChannel } from '../webhid/webHidChannel'
import { App } from './App'

const timing = { readWait: 0, ackWait: 10, eventWait: 20 }

// sem hid = navegador sem WebHID; com hid = seletor falso, ligado igual a raiz de composição liga
function renderDemo(demo = new DemoChannel(), hid?: ReturnType<typeof fakeHid>) {
  const { container, unmount } = render(
    <App webHid={hid !== undefined} openDevice={() => WebHidChannel.request(hid as unknown as HID)} openDemo={() => demo} timing={timing} />,
  )
  return { demo, container, unmount, user: userEvent.setup() }
}

async function enterDemo(demo?: DemoChannel) {
  const ctx = renderDemo(demo)
  await ctx.user.click(screen.getByRole('button', { name: 'Entrar no modo demo' }))
  await waitFor(() => expect(status()).toHaveTextContent(/configuração lida do mouse/i))
  return ctx
}

const writes = (demo: DemoChannel) => demo.log.filter((r) => r[0] !== READ_REQ)
const status = () => screen.getByRole('status')
const tab = (name: string) => screen.getByRole('tab', { name })
const chip = (n: number) => screen.getByRole('button', { name: `Estágio ${n}: ativar e editar a cor` })
const review = () => screen.getByRole('button', { name: 'Revisar alterações' })
const led = (container: HTMLElement) => container.querySelector('.led') as SVGElement

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  delete document.documentElement.dataset.theme
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('navegador sem WebHID', () => {
  it('avisa q só funciona no Chrome/Edge, mostra o conectar desligado e oferece o modo demo', () => {
    const { container } = renderDemo()
    expect(screen.getByRole('heading', { name: /sem webhid/i })).toBeInTheDocument()
    expect(screen.getByText(/chrome e no edge/i)).toBeInTheDocument()
    const connect = screen.getByRole('button', { name: 'Conectar mouse' })
    expect(connect).toBeDisabled()
    expect(connect).toHaveAccessibleDescription(/chrome e no edge/i)
    expect(screen.getByRole('button', { name: 'Entrar no modo demo' })).toBeEnabled()
    // o desenho do mouse já aparece na entrada, com os botões apontados
    expect(container.querySelector('svg.mouse-art')).toBeInTheDocument()
    expect(screen.getByText('Botão esquerdo')).toBeInTheDocument()
  })
})

describe('modo demo', () => {
  it('deixa claro na tela q é simulado e lê a config do mouse', async () => {
    const { demo, user } = await enterDemo()
    expect(screen.getByRole('note')).toHaveTextContent(/modo demo/i)
    expect(screen.getByText('X11')).toBeInTheDocument()
    expect(screen.getByText('1.12')).toBeInTheDocument()
    expect(screen.getByText('simulada')).toBeInTheDocument()
    expect(tab('DPI')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Estágio 1: DPI')).toHaveAttribute('aria-valuetext', '800 DPI')
    expect(screen.getByLabelText('Estágio 6: DPI')).toHaveAttribute('aria-valuetext', '22000 DPI')
    expect(screen.getByText('Sem alterações')).toBeInTheDocument()
    expect(review()).toBeDisabled()
    await user.click(tab('Desempenho'))
    expect(screen.getByRole('radio', { name: '1000 Hz' })).toBeChecked()
    await user.click(tab('Iluminação'))
    expect(screen.getByRole('radio', { name: 'Desligado' })).toBeChecked()
    // ler não escreve nada: só pedidos 0xA0
    expect(demo.log.length).toBeGreaterThan(0)
    expect(writes(demo)).toEqual([])
  })

  it('abas: clique e setas do teclado', async () => {
    const { user } = await enterDemo()
    await user.click(tab('Energia'))
    expect(screen.getByRole('tabpanel', { name: 'Energia' })).toBeInTheDocument()
    expect(tab('Energia')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(tab('DPI')).toHaveAttribute('aria-selected', 'true')
    expect(tab('DPI')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(tab('Energia')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(tab('Iluminação')).toHaveAttribute('aria-selected', 'true')
    // outras teclas não trocam de aba
    await user.keyboard('a')
    expect(tab('Iluminação')).toHaveAttribute('aria-selected', 'true')
  })

  it('mostra a bateria, segue o botão de DPI do mouse e acende o LED com a cor do estágio ativo', async () => {
    const { demo, container } = await enterDemo()
    expect(await screen.findByText('84%')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'carregando' })).not.toBeInTheDocument()
    expect(chip(2)).toHaveAttribute('aria-pressed', 'true')
    expect(led(container)).toHaveAttribute('fill', '#00ff00')
    await act(async () => {
      demo.emit(EV_BATTERY, 3, 90)
      demo.emit(EV_DPI, 4)
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'carregando' })).toBeInTheDocument()
    expect(chip(4)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(2)).toHaveAttribute('aria-pressed', 'false')
    expect(led(container)).toHaveAttribute('fill', '#ffff00')
    // o botão do mouse não é alteração do usuário
    expect(screen.getByText('Sem alterações')).toBeInTheDocument()
  })

  it('editar não escreve; só grava depois de revisar e confirmar, e mostra o relido', async () => {
    const { demo, user } = await enterDemo()
    fireEvent.change(screen.getByLabelText('Estágio 1: DPI'), { target: { value: '24' } })
    expect(screen.getByLabelText('Estágio 1: DPI')).toHaveAttribute('aria-valuetext', '1200 DPI')
    expect(screen.getByText('1 alteração')).toBeInTheDocument()
    await user.click(tab('Desempenho'))
    await user.click(screen.getByRole('radio', { name: '500 Hz' }))
    expect(screen.getByText('2 alterações')).toBeInTheDocument()
    expect(writes(demo)).toEqual([])

    await user.click(review())
    const dialog = screen.getByRole('dialog', { name: 'Confirmar gravação' })
    expect(within(dialog).getByRole('heading', { name: 'Confirmar gravação' })).toHaveFocus()
    expect(dialog).toHaveTextContent('Estágio 1: DPI')
    expect(dialog).toHaveTextContent('800 → 1200')
    expect(dialog).toHaveTextContent('1000 Hz → 500 Hz')
    expect(dialog).toHaveTextContent('0x04 (56 bytes)')
    expect(dialog).toHaveTextContent('0x06 (9 bytes)')
    // durante a revisão o formulário fica travado
    expect(screen.getByRole('radio', { name: '500 Hz' })).toBeDisabled()
    expect(writes(demo)).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: 'Voltar' }))
    expect(status()).toHaveTextContent('Nada foi gravado.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(writes(demo)).toEqual([])

    // Esc também volta sem gravar
    await user.click(review())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(writes(demo)).toEqual([])

    await user.click(review())
    await user.click(screen.getByRole('button', { name: 'Gravar no mouse' }))
    await waitFor(() => expect(status()).toHaveTextContent(/gravado e conferido/i))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(writes(demo).map((r) => r[0])).toEqual([DPI, POLLING])
    expect(decodeDpi(demo.reports.get(DPI)!).stages[0]?.dpi).toBe(1200)
    expect(decodePolling(demo.reports.get(POLLING)!).rate).toBe(500)
    expect(screen.getByRole('radio', { name: '500 Hz' })).toBeChecked()
    expect(screen.getByText('Sem alterações')).toBeInTheDocument()
    await user.click(tab('DPI'))
    expect(screen.getByLabelText('Estágio 1: DPI')).toHaveAttribute('aria-valuetext', '1200 DPI')
  })

  it('edita estágios, luz e energia e descarta', async () => {
    const { demo, user } = await enterDemo()
    await user.click(screen.getByLabelText('Estágio 7: ligado'))
    await user.click(chip(7))
    expect(chip(7)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.input(screen.getByLabelText('Estágio 7: cor'), { target: { value: '#123456' } })
    await user.click(chip(3))
    expect(screen.getByLabelText('Estágio 3: cor')).toHaveValue('#0000ff')

    await user.click(tab('Desempenho'))
    await user.click(screen.getByLabelText('Angle snap'))
    await user.click(screen.getByLabelText('Ripple control'))
    fireEvent.change(screen.getByLabelText('Debounce dos botões'), { target: { value: '8' } })

    await user.click(tab('Iluminação'))
    await user.click(screen.getByRole('radio', { name: 'Estático' }))
    fireEvent.input(screen.getByLabelText('Cor da luz'), { target: { value: '#ff8000' } })
    fireEvent.change(screen.getByLabelText('Brilho'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Velocidade do efeito'), { target: { value: '5' } })

    await user.click(tab('Energia'))
    fireEvent.change(screen.getByLabelText('Sono'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Sono profundo'), { target: { value: '20' } })

    await user.click(review())
    const dialog = screen.getByRole('dialog', { name: 'Confirmar gravação' })
    for (const text of ['Estágio 7: desligado → ligado', '#ff4000 → #123456', '2 → 3', 'Estático', '#ff8000', '8 → 3', '3 → 5', '1 min → 5 min', '10 min → 20 min', '4 → 8']) {
      expect(dialog).toHaveTextContent(text)
    }
    await user.click(screen.getByRole('button', { name: 'Gravar no mouse' }))
    await waitFor(() => expect(status()).toHaveTextContent(/gravado e conferido/i))
    expect(decodeLight(demo.reports.get(LIGHT)!)).toMatchObject({ mode: 'static', brightness: 3, speed: 5, deepSleep: 20 })

    await user.click(tab('DPI'))
    fireEvent.change(screen.getByLabelText('Estágio 2: DPI'), { target: { value: '40' } })
    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }))
    expect(screen.getByLabelText('Estágio 2: DPI')).toHaveAttribute('aria-valuetext', '1600 DPI')
    expect(status()).toHaveTextContent(/descartad/i)
  })

  it('seletor de cor: roda, intensidade, cores prontas e hex digitado', async () => {
    const { container, user } = await enterDemo()
    await user.click(chip(1))
    const hex = screen.getByLabelText('Estágio 1: cor')
    expect(hex).toHaveValue('#ff0000')
    const wheel = container.querySelector('.wheel') as HTMLElement
    wheel.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect

    // topo da roda = matiz 90°, borda = saturação cheia
    fireEvent.pointerDown(wheel, { buttons: 1, clientX: 100, clientY: 0, pointerId: 1 })
    expect(hex).toHaveValue('#80ff00')
    // passar o ponteiro sem apertar não muda nada
    fireEvent.pointerMove(wheel, { buttons: 0, clientX: 200, clientY: 100 })
    expect(hex).toHaveValue('#80ff00')
    fireEvent.change(screen.getByLabelText('Intensidade da cor'), { target: { value: '50' } })
    expect(hex).toHaveValue('#408000')

    await user.click(screen.getByRole('button', { name: 'Cor #000000' }))
    expect(hex).toHaveValue('#000000')
    expect(screen.getByRole('button', { name: 'Cor #000000' })).toHaveAttribute('aria-pressed', 'true')
    // escolher na roda com o preto dá a cor acesa, senão não aparece nada
    fireEvent.pointerMove(wheel, { buttons: 1, clientX: 200, clientY: 100 })
    expect(hex).toHaveValue('#ff0000')

    // hex incompleto fica só no campo até sair dele; com ou sem # vale
    await user.clear(hex)
    await user.type(hex, '12ab')
    expect(hex).toHaveValue('12ab')
    expect(led(container)).toHaveAttribute('fill', '#ff0000')
    await user.tab()
    expect(hex).toHaveValue('#ff0000')
    await user.clear(hex)
    await user.type(hex, '12AB34')
    expect(hex).toHaveValue('12AB34')
    expect(led(container)).toHaveAttribute('fill', '#12ab34')
    await user.tab()
    expect(hex).toHaveValue('#12ab34')
    // cor do estágio 1 e o estágio ativo, q foi pro 1 no clique
    expect(screen.getByText('2 alterações')).toBeInTheDocument()
  })

  it('mostra o motivo quando o rascunho não pode ser gravado', async () => {
    const { user } = await enterDemo()
    for (let i = 1; i <= 6; i++) await user.click(screen.getByLabelText(`Estágio ${i}: ligado`))
    expect(screen.getByText(/pelo menos um estágio/i)).toBeInTheDocument()
    expect(review()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descartar alterações' })).toBeEnabled()
  })

  it('mostra erro de escrita sem perder o rascunho', async () => {
    const { demo, user } = await enterDemo()
    demo.silent = true
    await user.click(tab('Desempenho'))
    await user.click(screen.getByRole('radio', { name: '250 Hz' }))
    await user.click(review())
    await user.click(screen.getByRole('button', { name: 'Gravar no mouse' }))
    expect(screen.getByRole('button', { name: 'Gravando…' })).toBeDisabled()
    await waitFor(() => expect(status()).toHaveTextContent(/sem confirmação/i))
    expect(status()).toHaveTextContent(/rascunho continua aqui.*grave de novo/i)
    expect(screen.getByRole('radio', { name: '250 Hz' })).toBeChecked()
  })

  it('avisa quando a releitura não bate com o q foi enviado', async () => {
    const { demo, user } = await enterDemo()
    const real = demo.setFeature.bind(demo)
    // mouse q confirma mas guarda outra coisa
    demo.setFeature = async (data) => real(data[0] === POLLING ? Uint8Array.of(6, 9, 1, 8, 0xf7, 0, 0, 0, 0) : data)
    await user.click(tab('Desempenho'))
    await user.click(screen.getByRole('radio', { name: '250 Hz' }))
    await user.click(review())
    await user.click(screen.getByRole('button', { name: 'Gravar no mouse' }))
    await waitFor(() => expect(status()).toHaveTextContent(/releitura veio diferente/i))
    expect(screen.getByRole('radio', { name: '125 Hz' })).toBeChecked()
  })

  it('mostra modo de luz e polling desconhecidos e avisa de modelo não testado', async () => {
    const demo = new DemoChannel()
    demo.model = 0x07
    const light = demo.reports.get(LIGHT)!.slice()
    light[3] = 0x90
    light.set(checksum(light.slice(3, 11)), 11)
    demo.reports.set(LIGHT, light)
    demo.reports.set(POLLING, Uint8Array.of(6, 9, 1, 0x10, 0xef, 0, 0, 0, 0))
    const { user } = await enterDemo(demo)
    expect(screen.getByText('X11SE')).toBeInTheDocument()
    expect(screen.getByText(/só o X11 foi verificado/i)).toBeInTheDocument()
    await user.click(tab('Iluminação'))
    expect(screen.getByText(/efeito lido do mouse: desconhecido \(9\)/i)).toBeInTheDocument()
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toEqual([])
    await user.click(tab('Desempenho'))
    expect(screen.getByText(/taxa q o app não conhece/i)).toBeInTheDocument()
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toEqual([])
  })

  it('modelo sem nenhum evento aparece como desconhecido, com id cru se não tiver nome', async () => {
    const demo = new DemoChannel()
    demo.heartbeat = null
    await enterDemo(demo)
    expect(screen.getByText('desconhecido')).toBeInTheDocument()
    expect(screen.getByText('aguardando')).toBeInTheDocument()
  })

  it('id de modelo sem nome aparece em hexa', async () => {
    const demo = new DemoChannel()
    demo.model = 0x99
    await enterDemo(demo)
    expect(screen.getByText('0x99')).toBeInTheDocument()
  })

  it('falha de leitura volta pro começo com o erro', async () => {
    const demo = new DemoChannel()
    demo.refuseReads = 99
    const { user } = renderDemo(demo)
    await user.click(screen.getByRole('button', { name: 'Entrar no modo demo' }))
    await waitFor(() => expect(status()).toHaveTextContent(/sem resposta na leitura/i))
    expect(status()).toHaveTextContent(/confira o cabo ou o receptor e conecte de novo/i)
    expect(screen.getByRole('button', { name: 'Entrar no modo demo' })).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('desconecta', async () => {
    const { user } = await enterDemo()
    await user.click(screen.getByRole('button', { name: 'Desconectar' }))
    expect(screen.getByRole('button', { name: 'Entrar no modo demo' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Estágio 1: DPI')).not.toBeInTheDocument()
  })
})

describe('leitor de tela e tradutor', () => {
  it('um status só, sempre montado e fora da casca q fica inerte na revisão', async () => {
    const { user } = renderDemo()
    const live = status()
    await user.click(screen.getByRole('button', { name: 'Entrar no modo demo' }))
    await waitFor(() => expect(live).toHaveTextContent(/configuração lida do mouse/i))
    expect(status()).toBe(live)
    await user.click(screen.getByLabelText('Estágio 2: ligado'))
    await user.click(review())
    expect(live).toHaveTextContent(/pra confirmar/i)
    expect(live.closest('[inert]')).toBeNull()
  })

  it('contagem de alterações e motivo de não poder gravar são anunciados', async () => {
    await enterDemo()
    expect(screen.getByText('Sem alterações')).toHaveAttribute('aria-live', 'polite')
  })

  it('marca, modelo e WebHID não passam pelo tradutor do navegador', async () => {
    const { unmount } = renderDemo()
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('translate', 'no')
    const names = [...screen.getAllByText('WebHID'), ...screen.getAllByText('X11'), screen.getByText('attackshark-x11-linux')]
    expect(names.length).toBeGreaterThanOrEqual(4)
    for (const n of names) expect(n).toHaveAttribute('translate', 'no')
    unmount()
    await enterDemo()
    expect(screen.getByText('X11')).toHaveAttribute('translate', 'no')
  })
})

describe('área de teste dos botões', () => {
  it('já funciona na entrada, antes de conectar, e o resto da página clica normal', () => {
    const { container } = renderDemo()
    const zone = screen.getByRole('group', { name: 'Área de teste' })
    fireEvent.mouseDown(zone, { button: 2 })
    expect(container.querySelector('[data-part="right"]')).toHaveClass('lit')
    expect(fireEvent.contextMenu(zone)).toBe(false)
    // fora da área o navegador segue com o comportamento dele
    const demoButton = screen.getByRole('button', { name: 'Entrar no modo demo' })
    expect(fireEvent.contextMenu(demoButton)).toBe(true)
    expect(fireEvent.mouseUp(demoButton, { button: 3 })).toBe(true)
    expect(fireEvent.wheel(demoButton, { deltaY: 100 })).toBe(true)
  })

  it('continua no painel do mouse depois de conectar no demo', async () => {
    const { container } = await enterDemo()
    fireEvent.mouseDown(screen.getByRole('group', { name: 'Área de teste' }), { button: 3 })
    expect(container.querySelector('[data-part="back"]')).toHaveClass('lit')
  })
})

describe('tema', () => {
  it('a cor da barra do navegador acompanha o tema escolhido', async () => {
    document.head.insertAdjacentHTML('beforeend',
      '<meta name="theme-color" content="#f3f4f6" media="(prefers-color-scheme: light)">'
      + '<meta name="theme-color" content="#151515" media="(prefers-color-scheme: dark)">')
    const { user } = renderDemo()
    const colors = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content)
    await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
    expect(colors()).toEqual(['#151515', '#151515'])
    await user.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(colors()).toEqual(['#f3f4f6', '#f3f4f6'])
  })

  it('segue o sistema e alterna entre claro e escuro, guardando a escolha', async () => {
    const { user } = renderDemo()
    await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('começa no tema do sistema ou no q já foi aplicado', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const first = renderDemo()
    expect(screen.getByRole('button', { name: 'Usar tema claro' })).toBeInTheDocument()
    first.unmount()
    document.documentElement.dataset.theme = 'light'
    renderDemo()
    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeInTheDocument()
  })

  it('sem localStorage o tema troca do mesmo jeito', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const { user } = renderDemo()
    await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('WebHID', () => {
  it('conecta pelo seletor do navegador e lê pelo receptor', async () => {
    const demo = new DemoChannel()
    const hid = fakeHid([deviceBackedBy(demo)])
    const { user } = renderDemo(demo, hid)
    expect(screen.getByRole('button', { name: 'Conectar mouse' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: /sem webhid/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Conectar mouse' }))
    await waitFor(() => expect(status()).toHaveTextContent(/configuração lida do mouse/i))
    expect(screen.getByText('receptor 2.4 GHz')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('reconhece o cabo USB', async () => {
    const demo = new DemoChannel({ wired: true })
    const { user } = renderDemo(demo, fakeHid([deviceBackedBy(demo, 0xfa55)]))
    await user.click(screen.getByRole('button', { name: 'Conectar mouse' }))
    expect(await screen.findByText('cabo USB')).toBeInTheDocument()
  })

  it('usuário fecha o seletor ou o navegador recusa', async () => {
    const hid = fakeHid([])
    const { user } = renderDemo(new DemoChannel(), hid)
    await user.click(screen.getByRole('button', { name: 'Conectar mouse' }))
    expect(status()).toHaveTextContent('Nenhum mouse escolhido. Clique em Conectar mouse e escolha o X11 na lista do navegador.')
    hid.requestDevice.mockRejectedValueOnce(new Error('SecurityError'))
    await user.click(screen.getByRole('button', { name: 'Conectar mouse' }))
    await waitFor(() => expect(status()).toHaveTextContent(/SecurityError/))
    expect(status()).toHaveTextContent(/conecte de novo/i)
  })

  it('mostra Conectando… enquanto o seletor do navegador tá aberto', async () => {
    const hid = fakeHid([])
    let pick: (d: never[]) => void = () => undefined
    hid.requestDevice.mockReturnValueOnce(new Promise((r) => (pick = r)))
    const { user } = renderDemo(new DemoChannel(), hid)
    await user.click(screen.getByRole('button', { name: 'Conectar mouse' }))
    expect(screen.getByRole('button', { name: 'Conectando…' })).toBeDisabled()
    // o demo continua com o nome dele, só o botão clicado muda
    expect(screen.getByRole('button', { name: 'Entrar no modo demo' })).toBeDisabled()
    await act(async () => pick([]))
    expect(screen.getByRole('button', { name: 'Conectar mouse' })).toBeEnabled()
  })
})
