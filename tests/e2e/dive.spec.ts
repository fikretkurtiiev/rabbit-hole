import { SITES, expect, setApiKey, test } from './fixtures';

const root = (page: import('@playwright/test').Page) => page.locator('rabbit-hole-root');

test('shows onboarding when no API key is configured and sends nothing', async ({ context, background, providerRequests }) => {
  await setApiKey(background, null);
  const page = await context.newPage();
  await page.goto(SITES.chatgpt.url);

  await page.locator('[data-message-author-role="assistant"] pre').first().hover();
  await root(page).getByRole('button', { name: 'Dive into this code block' }).click();

  await expect(root(page).getByRole('heading', { name: 'Add your API key' })).toBeVisible();
  expect(providerRequests).toHaveLength(0);
});

test('hover → dive → streamed intro → close → reload restores the highlight', async ({ context, background, providerRequests }) => {
  await setApiKey(background, 'sk-ant-e2e');
  const page = await context.newPage();
  await page.goto(SITES.chatgpt.url);

  const code = page.locator('[data-message-author-role="assistant"] pre').first();
  await code.hover();
  const dive = root(page).getByRole('button', { name: 'Dive into this code block' });
  await expect(dive).toBeVisible();
  await dive.click();

  const popover = root(page).getByRole('dialog');
  await expect(popover).toContainText('A debounce wrapper delays calls until input settles');
  await expect(popover).toContainText('321 in · 42 out');

  // The context packet contains the fragment, the answer and the user question – nothing else.
  expect(providerRequests).toHaveLength(1);
  const body = JSON.parse(providerRequests[0]!.body) as { system: string; messages: unknown[] };
  expect(body.system).toContain('function debounce');
  expect(body.system).toContain('How do I debounce a function in TypeScript?');
  expect(body.system).not.toContain('And throttle?');

  await popover.getByRole('button', { name: 'Close' }).click();
  await expect(popover).toHaveCount(0);

  await page.reload();
  // The block anchor is restored: clicking the block reopens its thread without a new request.
  await page.locator('[data-message-author-role="assistant"] code').first().click();
  await expect(root(page).getByRole('dialog')).toContainText('A debounce wrapper delays calls');
  expect(providerRequests).toHaveLength(1);
});

test('text selection on Claude opens a thread for the selection', async ({ context, background, providerRequests }) => {
  await setApiKey(background, 'sk-ant-e2e');
  const page = await context.newPage();
  await page.goto(SITES.claude.url);

  await page.locator('.font-claude-response p').first().evaluate((p) => {
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 15);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  const dive = root(page).getByRole('button', { name: 'Dive into the selected text' });
  await expect(dive).toBeVisible();
  await dive.click();

  await expect(root(page).getByRole('dialog')).toContainText('A debounce wrapper');
  const body = JSON.parse(providerRequests[0]!.body) as { system: string };
  expect(body.system).toContain(`<fragment type="selection">\nBayes' theorem`);
});
