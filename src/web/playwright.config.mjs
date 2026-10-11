import {defineConfig} from '@playwright/test';

// Individual scenarios have independent browser contexts and mocked owner routes.
// Playwright creates no more workers than runnable tests. Tests sharing mutable
// external state must explicitly opt into serial execution.
const defaultWorkers = process.env.CI ? 4 : 8;
const workers = Number(process.env.SOMA_TEST_WORKERS ?? defaultWorkers);
if (!Number.isInteger(workers) || workers < 1 || workers > 8)
  throw new Error('SOMA_TEST_WORKERS must be a whole number from 1 through 8');

export default defineConfig({testDir: './browser-tests', fullyParallel: true,
  workers, reporter: 'list', outputDir: '../../tmp/lld10-browser-results',
  use: {baseURL: 'http://127.0.0.1:4173', headless: true, timezoneId: 'UTC',
    launchOptions: {executablePath: process.env.SOMA_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}},
  webServer: process.env.SOMA_TEST_EXTERNAL_SERVER === '1' ? undefined :
    {command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173/static/ui/fixtures/harness.html', reuseExistingServer: false}});
