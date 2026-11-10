import { devices, expect, test, type Browser } from '@playwright/test'
import { BASE } from '../playwright.config.ts'

/** Jedes Gerät bekommt einen eigenen Browser-Kontext (eigener localStorage), Handys als Pixel 7. */
async function open(browser: Browser, path: string, phone = true) {
  const context = await browser.newContext({ ...(phone ? devices['Pixel 7'] : { viewport: { width: 1600, height: 900 } }), baseURL: BASE, locale: 'de-DE' })
  const page = await context.newPage()
  await page.goto(path)
  return page
}

test('eine ganze Partie: beitreten, antworten, abstimmen, auflösen, Finale', async ({ browser }) => {
  const beamer = await open(browser, '/beamer', false)
  await expect(beamer.getByRole('heading', { name: 'Mensch oder Maschine?' })).toBeVisible()

  const admin = await open(browser, '/admin')
  await admin.getByLabel('Passwort').fill('test')
  await admin.getByRole('button', { name: 'Anmelden' }).click()
  await admin.getByRole('tab', { name: /Fragen/ }).click()
  // Drag & Drop: Frage 3 per Maus an den Anfang ziehen
  const rows = admin.locator('ol > li')
  const third = await rows.nth(2).locator('p').innerText()
  const handle = await admin.getByRole('button', { name: /^Frage 3 verschieben/ }).boundingBox()
  const top = await rows.nth(0).boundingBox()
  await admin.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await admin.mouse.down()
  await admin.mouse.move(handle!.x + handle!.width / 2, top!.y + 4, { steps: 10 })
  await admin.mouse.up()
  await expect(rows.nth(0).locator('p')).toHaveText(third)
  for (let i = 8; i > 1; i--) await admin.getByRole('button', { name: `Frage ${i} entfernen` }).click()
  await expect(admin.getByRole('heading', { name: 'Fragenplan · 1 Runde' })).toBeVisible()

  const player = await open(browser, '/spielen')
  await player.getByLabel('Dein Name').fill('Mia')
  await player.getByRole('button', { name: 'Weihnachtsmütze' }).click() // Avatar-Baukasten
  await expect(player.getByRole('button', { name: 'Weihnachtsmütze' })).toHaveAttribute('aria-pressed', 'true')
  await player.getByRole('button', { name: 'Beitreten' }).click()
  await expect(player.getByText('Du bist dabei!')).toBeVisible()
  await player.reload()
  await expect(player.getByText('Du bist dabei!')).toBeVisible() // Wiederverbinden über den Token

  const audience = await open(browser, '/publikum')
  await audience.getByLabel('Dein Name').fill('Kati')
  await audience.getByRole('button', { name: 'Beitreten' }).click()
  await expect(beamer.getByText('Mia')).toBeVisible()

  await admin.getByRole('tab', { name: 'Runde' }).click()
  await admin.getByRole('button', { name: 'Spiel starten' }).click()

  const box = player.getByLabel('Deine Antwort')
  await box.dispatchEvent('paste')
  await expect(player.getByText('Einfügen ist in diesem Spiel gesperrt')).toBeVisible()
  await box.fill('Ich bin ganz sicher ein Mensch.')
  await player.getByRole('button', { name: 'Antwort abschicken' }).click()

  // Ohne API-Key antwortet die KI sofort mit der Ersatzantwort, also startet die Abstimmung
  await expect(audience.getByText('Markiere 1 Antwort als KI')).toBeVisible()
  const cards = audience.getByRole('listitem')
  await cards.filter({ hasNotText: 'Ich bin ganz sicher ein Mensch.' }).getByRole('button', { name: /ist von der KI/ }).click()
  await cards.filter({ hasText: 'Ich bin ganz sicher ein Mensch.' }).getByRole('button', { name: /ist am lustigsten/ }).click()
  await expect(beamer.getByText('Abstimmung beendet')).toBeVisible() // alle haben abgestimmt

  await admin.getByRole('button', { name: 'Jetzt auflösen' }).click()
  await expect(beamer.getByText('Mensch · Mia')).toBeVisible()
  await expect(beamer.getByText('KI · Claude')).toBeVisible()
  await expect(beamer.getByText('+1 Lustigste')).toBeVisible()
  await expect(audience.getByText('Richtig erkannt! +1')).toBeVisible()
  await expect(player.getByText('+1 Lustigste Antwort!')).toBeVisible()

  await admin.getByRole('button', { name: 'Zum Finale' }).click()
  await expect(beamer.getByRole('heading', { name: 'Die Menschen gewinnen!' })).toBeVisible()
  await admin.getByRole('button', { name: 'Detektive' }).first().click()
  await expect(beamer.getByRole('heading', { name: 'Die besten Detektive' })).toBeVisible()
  await expect(beamer.getByText('Kati')).toBeVisible()
  await admin.getByRole('button', { name: 'Beste Antworten' }).first().click()
  await expect(beamer.getByRole('heading', { name: 'Die besten Antworten des Abends' })).toBeVisible()
  await expect(beamer.getByText('„Ich bin ganz sicher ein Mensch.“')).toBeVisible()

  await admin.getByRole('button', { name: 'Admin' }).click()
  await admin.getByRole('button', { name: 'Abmelden' }).click()
  await expect(admin.getByLabel('Passwort')).toBeVisible()
  await admin.reload()
  await expect(admin.getByLabel('Passwort')).toBeVisible() // bleibt abgemeldet
})

test('Startseite schaltet auf Englisch um', async ({ browser }) => {
  const page = await open(browser, '/')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await expect(page.getByRole('heading', { name: 'Human or machine?' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Play/ })).toHaveAttribute('href', '/play')
})
