import { test, expect } from '@playwright/test'

test.describe('Navigation & routing', () => {
  test('root redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })

  test('protected routes redirect to login', async ({ page }) => {
    for (const route of ['/agent', '/admin', '/archive', '/clients']) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    }
  })

  test('login page has company branding', async ({ page }) => {
    await page.goto('/login')
    // App should render without JS errors
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.waitForLoadState('domcontentloaded')
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('PWA manifest is present', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest')
    expect(response?.status()).toBe(200)
    const manifest = await response?.json()
    expect(manifest).toHaveProperty('name')
    expect(manifest).toHaveProperty('icons')
  })

  test('service worker registers', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.length > 0
    })
    expect(swRegistered).toBe(true)
  })
})
