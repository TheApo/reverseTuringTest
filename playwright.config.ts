import { defineConfig, devices } from '@playwright/test'

export const BASE = 'http://localhost:3100'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run build && node server/index.ts',
    url: `${BASE}/beamer`,
    reuseExistingServer: false,
    // Leere Keys: Die KI nutzt immer die Ersatzantwort, es gehen keine echten API-Aufrufe raus
    env: { PORT: '3100', ADMIN_PASSWORD: 'test', DATA_FILE: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '', PUBLIC_URL: '' },
  },
})
