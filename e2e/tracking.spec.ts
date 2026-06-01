import { test, expect } from '@playwright/test'

test.describe('Public tracking page', () => {
  test('tracking page is accessible without login', async ({ page }) => {
    await page.goto('/track')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('input[placeholder*="tracking"], input[placeholder*="BG"], input[placeholder*="suivi"]')).toBeVisible({ timeout: 5000 })
  })

  test('shows not found for invalid tracking ID', async ({ page }) => {
    await page.goto('/track?id=BG000000')
    await expect(page.locator('text=/introuvable|non trouvé|not found|000000/i')).toBeVisible({ timeout: 8000 })
  })

  test('search input accepts input', async ({ page }) => {
    await page.goto('/track')
    const input = page.locator('input').first()
    await input.fill('BG123456')
    await expect(input).toHaveValue('BG123456')
  })
})
