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
  await admin.mouse.move(handle!.x + 40, top!.y + 60, { steps: 5 }) // Maus wandert nach dem Loslassen weiter
  await expect(rows.nth(0).locator('p')).toHaveText(third)
  await expect(admin.locator('ol > li[aria-hidden="true"]')).toHaveCount(0) // Karte ist eingerastet, schwebt nicht mehr
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

test('eigene Frage mit Ersatzantwort anlegen, bearbeiten und löschen', async ({ browser }) => {
  const admin = await open(browser, '/admin')
  await admin.getByLabel('Passwort').fill('test')
  await admin.getByRole('button', { name: 'Anmelden' }).click()
  await admin.getByRole('tab', { name: /Fragen/ }).click()

  await admin.getByRole('button', { name: 'Neue Frage' }).click()
  const dialog = admin.getByRole('dialog')
  await dialog.getByLabel(/^Frage/).fill('Was ist dein geheimes Talent?')
  await expect(dialog.getByText('Ohne API-Key: Claude.')).toBeVisible() // kein Key und noch keine Ersatzantwort
  await dialog.getByLabel(/Antwort 1/).fill('Ich kann sehr überzeugend zuhören.')
  await expect(dialog.getByText('Ohne API-Key')).toBeHidden()
  await dialog.getByRole('button', { name: 'Speichern und in den Plan' }).click()
  await expect(dialog).toBeHidden()
  await expect(admin.getByText('Eigene Fragen · 1 Frage')).toBeVisible()
  await expect(admin.getByText('1 Ersatzantwort', { exact: true })).toBeVisible()

  // Bearbeiten ändert Sammlung und Plan
  await admin.getByRole('button', { name: 'Frage bearbeiten: Was ist dein geheimes Talent?' }).click()
  await expect(dialog.getByLabel(/Antwort 1/)).toHaveValue('Ich kann sehr überzeugend zuhören.')
  await dialog.getByLabel(/^Frage/).fill('Was ist dein peinlichstes Talent?')
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(admin.getByText('Was ist dein peinlichstes Talent?')).toHaveCount(2)

  admin.once('dialog', d => d.accept()) // Sicherheitsfrage beim Löschen
  await admin.getByRole('button', { name: 'Frage bearbeiten: Was ist dein peinlichstes Talent?' }).click()
  await dialog.getByRole('button', { name: 'Löschen' }).click()
  await expect(admin.getByText('Eigene Fragen · 0 Fragen')).toBeVisible()
})
