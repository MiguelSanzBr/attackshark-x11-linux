import { type Page, expect, test } from '@playwright/test'

const zone = (page: Page) => page.getByRole('group', { name: 'Área de teste' })
const part = (page: Page, name: string) => page.locator(`[data-part="${name}"]`)
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

async function center(page: Page) {
  const box = (await zone(page).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// o Playwright só tem esquerdo, meio e direito; voltar e avançar saem direto pelo CDP do Chrome
async function sideButton(page: Page, x: number, y: number, button: 'back' | 'forward') {
  const cdp = await page.context().newCDPSession(page)
  const buttons = button === 'back' ? 8 : 16
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount: 1 })
  return () => cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // registra no window, depois do React, se alguém segurou o menu de contexto
    addEventListener('contextmenu', (e) => ((window as { menuBlocked?: boolean }).menuBlocked = e.defaultPrevented))
  })
})

test('antes de conectar: clique esquerdo e direito acendem e o menu de contexto não abre', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('Clique com o mouse: os botões acendem aqui.')).toBeVisible()
  const { x, y } = await center(page)
  await page.mouse.move(x, y)

  await page.mouse.down()
  await expect(part(page, 'left')).toHaveClass(/\blit\b/)
  await page.mouse.up()
  await expect(part(page, 'left')).not.toHaveClass(/\blit\b/)

  await page.mouse.down({ button: 'right' })
  await expect(part(page, 'right')).toHaveClass(/\blit\b/)
  await page.mouse.up({ button: 'right' })
  await expect(part(page, 'right')).not.toHaveClass(/\blit\b/)
  expect(await page.evaluate(() => (window as { menuBlocked?: boolean }).menuBlocked)).toBe(true)

  // fora da área o clique direito segue normal
  await page.getByRole('heading', { level: 1 }).click({ button: 'right' })
  expect(await page.evaluate(() => (window as { menuBlocked?: boolean }).menuBlocked)).toBe(false)
})

test('lateral de trás acende e não volta a página; fora da área volta', async ({ page }) => {
  await page.goto('./?antes')
  await page.goto('./')
  const { x, y } = await center(page)

  const release = await sideButton(page, x, y, 'back')
  await expect(part(page, 'back')).toHaveClass(/\blit\b/)
  await release()
  await expect(part(page, 'back')).not.toHaveClass(/\blit\b/)
  // o voltar do navegador sai no mouseup; espera um pouco pra ter certeza q não navegou
  await page.waitForTimeout(500)
  expect(new URL(page.url()).search).toBe('')

  // prova q o teste vale: no título, fora da área, o mesmo botão volta a página
  const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!
  await (await sideButton(page, title.x + 10, title.y + 10, 'back'))()
  await expect(page).toHaveURL(/\?antes$/)
})

test('modo demo: a roda pulsa a seta na área e não rola a página', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar no modo demo' }).click()
  await expect(page.getByRole('status')).toContainText('Configuração lida do mouse', { timeout: 15_000 })
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true)

  const { x, y } = await center(page)
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 200)
  await expect(page.locator('.wheel-arrow.down')).toBeAttached()
  await page.mouse.wheel(0, -200)
  await expect(page.locator('.wheel-arrow.up')).toBeAttached()
  expect(await scrollY(page)).toBe(0)

  // fora da área a página rola normal
  await page.mouse.move(900, 300)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0)
})
