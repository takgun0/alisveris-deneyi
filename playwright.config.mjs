// Playwright ayarları (uçtan uca testler: testler/e2e).
//
// Testler kendi sunucusunu başlatır: site 127.0.0.1:8090 ve bellekte çalışan
// sahte API 127.0.0.1:54321 (40 sahte katılımcıyla). Sahte API, veritabanı
// fonksiyonlarıyla aynı RPC sözleşmesini taklit eder; güvenlik kuralları
// ayrıca veritabanı testlerinde (testler/vt) denetlenir.
//
// 54321 portu yerel Supabase ve "npm run site:sahte-api" ile ortaktır;
// e2e testlerinden önce ikisini de kapatın.

import { defineConfig } from '@playwright/test';

const PORT = 8090;

export default defineConfig({
  testDir: 'testler/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // sahte API'nin belleği testler arasında paylaşılır
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node scriptler/gelistirme_sunucusu.mjs --sahte-api --sahte-veri=40',
    url: `http://127.0.0.1:${PORT}/`,
    // SITE_KOKU=_site ile damgalı yayın kopyası denenir:
    //   node scriptler/surum_damgala.mjs --yerel-izin && SITE_KOKU=_site npx playwright test
    env: { PORT: String(PORT), ...(process.env.SITE_KOKU ? { SITE_KOKU: process.env.SITE_KOKU } : {}) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
