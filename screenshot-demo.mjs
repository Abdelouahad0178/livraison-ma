import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

  try {
    const htmlPath = 'file:///' + join(__dirname, 'demo-arrivage.html').replace(/\\/g, '/');
    console.log('📱 Ouverture de la démo:', htmlPath);
    await page.goto(htmlPath);
    await page.waitForTimeout(1000);

    console.log('📸 Screenshot de la démo...');
    await page.screenshot({ path: 'screenshot-demo-arrivage.png', fullPage: true });
    console.log('✅ Screenshot créé : screenshot-demo-arrivage.png');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await browser.close();
  }
})();
