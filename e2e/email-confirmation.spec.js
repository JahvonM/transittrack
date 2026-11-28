import { test, expect } from '@playwright/test';

test('a person can correct their email address before requesting another sign-up code', async ({ page }) => {
  const submittedEmails = [];
  await page.route('**/api/**', async (route) => {
    if (route.request().url().includes('/auth/v1/signup')) {
      const { email } = route.request().postDataJSON();
      submittedEmails.push(email);
      return route.fulfill({
        json: {
          user: {
            id: 'new-user',
            email,
            identities: [{ identity_id: `identity-${submittedEmails.length}` }],
          },
          session: null,
        },
      });
    }
    return route.fulfill({ json: { id: 'test-app', public_settings: { authentication_required: false } } });
  });

  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill('person@outlok.com');
  await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-Battery-7');
  await page.getByLabel('Confirm Password', { exact: true }).fill('Correct-Horse-Battery-7');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit email address', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('person@outlok.com');
  await page.getByLabel('Email', { exact: true }).fill('person@outlook.com');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  await expect(page.getByText('We sent a code to person@outlook.com')).toBeVisible();
  expect(submittedEmails).toEqual(['person@outlok.com', 'person@outlook.com']);
});
