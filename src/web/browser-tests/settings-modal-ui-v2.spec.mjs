import {test,expect} from '@playwright/test';

test('Settings opens as a dialog over the active workspace and closes to it',async({page})=>{
  await page.goto('http://127.0.0.1:4174/tickets/sr/33333333-3333-4333-8333-333333333333');
  await expect(page.getByRole('navigation',{name:'Tickets navigation'})).toBeVisible();
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Settings'});
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('navigation',{name:'Tickets navigation'})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Close settings'})).toBeFocused();
  await dialog.getByRole('button',{name:'Open Reference Manager'}).click();
  await expect(dialog).toHaveAttribute('data-expanded','true');
  await expect(dialog.getByRole('heading',{name:'Reference Manager'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/tickets\/sr\//);
  await expect(page.getByRole('navigation',{name:'Tickets navigation'})).toBeVisible();
});

test('Settings deep links are dialogs; return to Overview when no previous workspace exists',async({page})=>{
  await page.goto('http://127.0.0.1:4174/settings/appearance');
  const dialog=page.getByRole('dialog',{name:'Settings'});
  await expect(dialog.getByRole('link',{name:'Appearance'})).toHaveAttribute('aria-current','page');
  await dialog.getByRole('button',{name:'Close settings'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/overview$/);
});

test('canonical brand favicon is served as SVG with a fixed owner path',async({page})=>{
  await page.goto('http://127.0.0.1:4174/infrastructure');
  const href=await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('/static/ui/brand/soma-mark.svg');
  const favicon=await page.request.get('http://127.0.0.1:4174'+href);
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');
});
