import {test,expect} from '@playwright/test';

test('exact RFC identity lookup rejects partial input and opens accepted RFC workbench',async({page})=>{
  const number='NC20261010000001';
  const id='44444444-4444-4444-8444-444444444444';
  let called=[];
  await page.route('**/api/v1/tickets/rfcs/by-business-id/*',route=>{
    called.push(new URL(route.request().url()).pathname);
    return route.fulfill({json:{rfc_id:id,rfc_no:number,revision:3,
      hierarchy_role:'standalone',local_archive_state:'active',warnings:[]}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/rfcs');
  const field=page.getByLabel('RFC number (NC followed by 14 digits)');
  const button=page.getByRole('button',{name:'Find exact RFC'});
  await expect(button).toBeDisabled();
  await field.fill('NC2026101000000');
  await expect(button).toBeDisabled();
  await field.fill(number);
  await expect(button).toBeEnabled();
  await button.click();
  const match=page.getByRole('complementary',{name:'Exact RFC match'});
  await expect(match.getByText('EXACT MATCH / '+number)).toBeVisible();
  expect(called).toEqual(['/api/v1/tickets/rfcs/by-business-id/'+number]);
  await match.getByRole('button',{name:'Open RFC workbench'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/rfc/'+id+'$'));
});
