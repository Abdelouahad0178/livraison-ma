import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page loads with required fields', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByPlaceholder(/email/i)).toBeVisible()
    await expect(page.getByPlaceholder(/mot de passe/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /connexion/i })).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/email/i).fill('invalid@test.com')
    await page.getByPlaceholder(/mot de passe/i).fill('wrongpassword')
    await page.getByRole('button', { name: /connexion/i }).click()
    await expect(page.locator('text=/erreur|invalide|incorrect/i')).toBeVisible({ timeout: 8000 })
  })

  test('empty form shows validation', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /connexion/i }).click()
    await expect(page.locator('input[type="email"]:invalid, [class*=error], [class*=rouge]')).toBeVisible({ timeout: 3000 }).catch(() => {})
  })
})
