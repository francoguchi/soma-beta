import {test,expect} from '@playwright/test';
const setting=(value,source,revision)=>({setting_key:'OBJECTIVE_TIMEZONE_V1',contract_name:'OBJECTIVE_TIMEZONE_V1',
  contract_version:1,semantic_owner:'LLD-05',value,source,revision});
test('Settings consumes owner Objective timezone default without persisting or changing UTC chronology',async({page})=>{
  const requests=[];
  await page.route('**/api/v1/settings/OBJECTIVE_TIMEZONE_V1',route=>{
    requests.push(route.request().method());return route.fulfill({json:setting('America/Guayaquil','DEFAULT',null)});
  });
  await page.goto('http://127.0.0.1:4174/settings');
  const settings=page.getByRole('region',{name:'Objective scheduling settings'});
  await expect(settings).toContainText('Scheduling timezone: America/Guayaquil');
  await expect(settings).toContainText('Source: Default');
  await expect(settings).toContainText('No saved revision');
  await expect(settings).toContainText('Saved UTC instants remain authoritative');
  expect(requests).toEqual(['GET']);
});
test('Settings preserves persisted timezone revision and rejects an inconsistent default revision',async({page})=>{
  let invalid=false;
  await page.route('**/api/v1/settings/OBJECTIVE_TIMEZONE_V1',route=>route.fulfill({
    json:setting('Asia/Tokyo',invalid?'DEFAULT':'PERSISTED',4),
  }));
  await page.goto('http://127.0.0.1:4174/settings');
  const settings=page.getByRole('region',{name:'Objective scheduling settings'});
  await expect(settings).toContainText('Scheduling timezone: Asia/Tokyo');
  await expect(settings).toContainText('Source: Persisted');
  await expect(settings).toContainText('Revision 4');
  invalid=true;await page.reload();
  await expect(settings.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(settings.getByText('Scheduling timezone:',{exact:true})).toHaveCount(0);
});
