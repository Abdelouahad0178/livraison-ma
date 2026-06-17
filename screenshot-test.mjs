import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // Ouvrir la page d'accueil
    console.log('📱 Ouverture de l\'application...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Attendre un peu pour que la page se charge complètement
    await page.waitForTimeout(1000);

    // Screenshot de la page d'accueil
    console.log('📸 Screenshot de la page d\'accueil...');
    await page.screenshot({ path: 'screenshot-home.png', fullPage: true });

    // Vérifier si on est sur la page de login
    const loginButton = await page.locator('text=Se connecter').first();
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('🔐 Page de login détectée');
      await page.screenshot({ path: 'screenshot-login.png' });
    }

    // Essayer de naviguer directement vers /agent (si pas d'auth)
    console.log('🚚 Tentative de navigation vers /agent...');
    await page.goto('http://localhost:5173/agent', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Screenshot de la page agent
    console.log('📸 Screenshot de la page agent...');
    await page.screenshot({ path: 'screenshot-agent.png', fullPage: true });

    // Chercher l'onglet "Arrivages"
    const arrivageTab = await page.locator('text=/Arrivage/i').first();
    if (await arrivageTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('✅ Onglet Arrivages trouvé, clic...');
      await arrivageTab.click();
      await page.waitForTimeout(1000);

      // Screenshot de la page d'arrivage
      console.log('📸 Screenshot de la page d\'arrivage avec améliorations UX...');
      await page.screenshot({ path: 'screenshot-arrivage-final.png', fullPage: true });
    }

    console.log('✅ Screenshots capturés avec succès !');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await page.screenshot({ path: 'screenshot-error.png' });
  } finally {
    await browser.close();
  }
})();
