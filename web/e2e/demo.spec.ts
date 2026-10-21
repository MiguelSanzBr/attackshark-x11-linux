import { type Page, expect, test } from '@playwright/test'

test('modo demo: lê a config, muda o DPI, confirma e vê aplicado', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar no modo demo' }).click()
  await expect(page.getByRole('note')).toContainText(/modo demo/i)
  await expect(page.getByRole('status')).toContainText('Configuração lida do mouse', { timeout: 15_000 })

  const slider = page.getByLabel('Estágio 1: DPI')
  await expect(slider).toHaveAttribute('aria-valuetext', '800 DPI')
  await slider.fill('24')
  await expect(slider).toHaveAttribute('aria-valuetext', '1200 DPI')
  await expect(page.getByText('1 alteração')).toBeVisible()

  await page.getByRole('button', { name: 'Revisar alterações' }).click()
  const review = page.getByRole('dialog', { name: 'Confirmar gravação' })
  await expect(review).toContainText('Estágio 1: DPI')
  await expect(review).toContainText('800 → 1200')
  await review.getByRole('button', { name: 'Gravar no mouse' }).click()

  await expect(page.getByRole('status')).toContainText(/gravado e conferido/i, { timeout: 15_000 })
  await expect(review).toBeHidden()
  await expect(slider).toHaveAttribute('aria-valuetext', '1200 DPI')
  await expect(slider).toHaveValue('24')
  await expect(page.getByText('Sem alterações')).toBeVisible()
})

test('sem WebHID: avisa e entra no demo, sem rolagem lateral em 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.addInitScript(() => {
    // simula Firefox/Safari, q não têm navigator.hid
    delete (Navigator.prototype as { hid?: unknown }).hid
  })
  await page.goto('./')
  await expect(page.getByText(/chrome e no edge/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Conectar mouse' })).toBeDisabled()
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(await overflow()).toBe(0)
  await page.getByRole('button', { name: 'Entrar no modo demo' }).click()
  await expect(page.getByRole('status')).toContainText('Configuração lida do mouse', { timeout: 15_000 })
  expect(await overflow()).toBe(0)
})

// média do RGB do fundo da página: o tema escuro fica abaixo de 100, o claro bem acima
const background = (page: Page) =>
  page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number)
    return (r! + g! + b!) / 3
  })

for (const colorScheme of ['dark', 'light'] as const) {
  test(`tema ${colorScheme}: segue o sistema, o botão troca e a escolha fica depois de recarregar`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('./')
    const dark = colorScheme === 'dark'
    // poll pq o fundo tem transição curta na troca de tema
    const isDark = (want: boolean) => expect.poll(async () => (await background(page)) < 100).toBe(want)
    await isDark(dark)
    await page.getByRole('button', { name: dark ? 'Usar tema claro' : 'Usar tema escuro' }).click()
    await isDark(!dark)
    await page.reload()
    await isDark(!dark)
    // a barra do navegador no celular também fica no tema escolhido, já antes do React
    for (const meta of await page.locator('meta[name="theme-color"]').all()) {
      await expect(meta).toHaveAttribute('content', dark ? '#f3f4f6' : '#151515')
    }
    await expect(page.getByRole('button', { name: dark ? 'Usar tema escuro' : 'Usar tema claro' })).toBeVisible()
  })
}
