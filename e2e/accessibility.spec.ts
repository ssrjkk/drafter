import { test, expect, unlockApp } from './setup';

test.describe('Accessibility', () => {
  test('page has no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await unlockApp(page);
    await page.waitForTimeout(1000);
    expect(errors.filter(e => !e.includes('favicon') && !e.includes('ArrayBuffer') && !e.includes('sql') && !e.includes('wasm') && !e.includes('WebAssembly') && !e.includes('CompileError') && !e.includes('net::ERR_'))).toHaveLength(0);
  });

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);
    await page.waitForTimeout(1000);

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toBeVisible({ timeout: 3000 });
  });

  test('heading hierarchy is correct', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);
    await page.waitForTimeout(1000);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 5000 });
    const h1Count = await h1.count();
    expect(h1Count).toBe(1);
  });
});

test.describe('Theme', () => {
  test('page renders in browser', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);
    await page.waitForTimeout(1000);

    const html = await page.locator('html').evaluate(el => el.outerHTML);
    expect(html).toContain('Drafter');
  });
});
