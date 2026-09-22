import { test as base, type Page } from '@playwright/test';

const MASTER_PASSWORD = process.env.TEST_MASTER_PASSWORD || 'TestPass123!';

export async function unlockApp(page: Page) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

    // First-run onboarding must never race test clicks. Seed its storage flag
    // on the page (applies to any future navigation/reload) and write it
    // directly to the current document (covers a mount that predates an init
    // script or a flaky network drop mid-load).
    await page.addInitScript(() => {
      try {
        localStorage.setItem('drafter-onboarding-seen', 'true');
      } catch {
        // Storage unavailable — the dismiss loop below still skips the wizard
      }
    }).catch(() => {});
    await page.evaluate(() => {
      try {
        localStorage.setItem('drafter-onboarding-seen', 'true');
      } catch {
        // Storage unavailable — the dismiss loop below still skips the wizard
      }
    }).catch(() => {});

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await passwordInput.fill(MASTER_PASSWORD);

      const confirmInput = page.locator('input[type="password"]').nth(1);
      if (await confirmInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmInput.fill(MASTER_PASSWORD);
      }

      await page.locator('button[type="submit"]').click();
    }

    // The app shell mounts only once the database is initialized. Onboarding
    // renders in the same commit as the shell, so waiting for the first explicit
    // role="button" (a task card) guarantees the Skip control is present too.
    await page.locator('[role="button"]').first().waitFor({ state: 'visible', timeout: 30000 });

    // If the wizard is still shown (late-mounted or remounted app), dismiss it
    // repeatedly until it is gone — never leave it overlaying test clicks.
    const skipBtn = page.locator('button[aria-label="Skip onboarding"]');
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (!(await skipBtn.isVisible().catch(() => false))) break;
      await skipBtn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
    await skipBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  } catch {
    // App may show DB error or page may close — that's fine for E2E
  }
}

export const test = base.extend<{ unlockedPage: Page }>({
  unlockedPage: async ({ page }, use) => {
    await page.goto('/');
    await unlockApp(page);
    await use(page);
  },
});

test.beforeEach(async ({ context }) => {
  // First-run onboarding is a one-time modal in the app; seeding its storage
  // flag via init script (a standard E2E pattern for first-run state) prevents
  // the modal from racing with test clicks. Runs before every navigation.
  await context.addInitScript(() => {
    try {
      localStorage.setItem('drafter-onboarding-seen', 'true');
    } catch {
      // Storage unavailable — unlockApp() fallback will skip the modal instead
    }
  });
});

export { expect } from '@playwright/test';
