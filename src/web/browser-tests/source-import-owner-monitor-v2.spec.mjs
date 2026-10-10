import {test,expect} from '@playwright/test';

test('Source Imports uses three distinct owner statuses and empty accepted run history',async({page})=>{
  await page.route('**/api/v1/imports/sources/*',route=>{
    const family=route.request().url().split('/').at(-1);
    return route.fulfill({json:{
      source_family:family,configured:false,profile_ids:{},checkpoint:null,latest_run:null,
    }});
  });
  await page.route('**/api/v1/imports/runs?*',route=>route.fulfill({json:{
    items:[],next_cursor:null,
  }}));
  await page.goto('http://127.0.0.1:4174/tickets');
  await page.getByRole('link',{name:'Source Imports'}).click();
  await expect(page.getByRole('region',{name:'Source Imports'})).toBeVisible();
  await expect(page.getByText('Source directory not configured')).toHaveCount(3);
  await expect(page.getByText('No import runs recorded in this page.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Next page'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Previous page'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Run import'})).toHaveCount(0);
});
