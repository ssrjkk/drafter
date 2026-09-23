import { test, expect, unlockApp } from './setup';

test.describe('Command palette', () => {
  test('can be opened via custom event', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const palette = page.locator('input[placeholder="Type a command..."]');
    await expect(palette).toBeVisible({ timeout: 5000 });
  });

  test('can be closed via custom event', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const palette = page.locator('input[placeholder="Type a command..."]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('close-all-modals')));
    await expect(palette).not.toBeVisible({ timeout: 2000 });
  });

  test('shows available commands', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const apiKeyCmd = page.locator('button', { hasText: 'Set API Key' });
    await expect(apiKeyCmd).toBeVisible({ timeout: 5000 });

    const resetCmd = page.locator('button', { hasText: 'Reset Task' });
    await expect(resetCmd).toBeVisible();
  });

  test('filters by query', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const input = page.locator('input[placeholder="Type a command..."]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('api');

    await expect(page.locator('button', { hasText: 'Set API Key' })).toBeVisible({ timeout: 2000 });
    await expect(page.locator('button', { hasText: 'Reset Task' })).not.toBeVisible({ timeout: 2000 });
  });

  test('shows no results for bad query', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const input = page.locator('input[placeholder="Type a command..."]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('zzzznonexistent');

    await expect(page.locator('text=No commands found')).toBeVisible({ timeout: 2000 });
  });

  test('clicking backdrop closes palette', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const palette = page.locator('input[placeholder="Type a command..."]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="command-palette-backdrop"]').click({ position: { x: 10, y: 10 } });
    await expect(palette).not.toBeVisible({ timeout: 2000 });
  });

  test('executing a command closes palette', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const resetBtn = page.locator('button', { hasText: 'Reset Task' });
    await expect(resetBtn).toBeVisible({ timeout: 5000 });
    await resetBtn.click();

    const palette = page.locator('input[placeholder="Type a command..."]');
    await expect(palette).not.toBeVisible({ timeout: 2000 });
  });

  test('Escape key closes palette via keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    await unlockApp(page);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('toggle-command-palette')));
    const palette = page.locator('input[placeholder="Type a command..."]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible({ timeout: 2000 });
  });
});
