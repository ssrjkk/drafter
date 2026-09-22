import { test, expect, unlockApp } from './setup';

test.describe('Drafter', () => {
  test('loads the application', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    const title = await page.title();
    expect(title).toBeTruthy();

    const hasContent = await page.locator('#root').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
