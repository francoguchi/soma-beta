import {test,expect} from '@playwright/test';

test('Settings General consumes real timezone DTO, stays compact and opens owner catalogs',async({page})=>{
  const calls=[];
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    calls.push(path);
    if(path==='/api/v1/settings/OBJECTIVE_TIMEZONE_V1')return route.fulfill({json:{
      setting_key:'OBJECTIVE_TIMEZONE_V1',contract_name:'OBJECTIVE_TIMEZONE_V1',
      contract_version:1,semantic_owner:'LLD-05',value:'America/Guayaquil',
      revision:null,source:'DEFAULT',
    }});
    if(['/api/v1/product-lines','/api/v1/contracts',
      '/api/v1/contract-product-lines','/api/v1/sla/classification-mappings'].includes(path)){
      return route.fulfill({json:{items:[],next_cursor:null,exact_count:0}});
    }
    return route.fulfill({json:{items:[],continuation:null}});
  });
  await page.goto('http://127.0.0.1:4174/settings');
  const dialog=page.getByRole('dialog',{name:'Settings'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Scheduling timezone:',{exact:false})).toBeVisible();
  await expect(dialog.getByText('America/Guayaquil',{exact:false})).toBeVisible();
  await expect(dialog.getByRole('region',{name:'Product Lines',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const general=dialog.getByRole('link',{name:'General'});
  const appearance=dialog.getByRole('link',{name:'Appearance'});
  const p1=await general.boundingBox(),p2=await appearance.boundingBox();
  expect(p1&&p2).toBeTruthy();
  expect(Math.abs(p1.y-p2.y)).toBeLessThan(8);
  expect(p2.x).toBeGreaterThan(p1.x);
  await dialog.getByRole('button',{name:'Open Reference Manager'}).click();
  await expect(dialog).toHaveAttribute('data-expanded','true');
  await expect(dialog.getByRole('region',{name:'Product Lines',exact:true}).getByText('0 accepted records at read',{exact:false})).toBeVisible();
  await expect(dialog.getByRole('region',{name:'Customer Contracts',exact:true}).getByText('0 accepted records at read',{exact:false})).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(calls).toContain('/api/v1/settings/OBJECTIVE_TIMEZONE_V1');
  expect(calls).not.toContain('/api/v1/settings/objective-timezone');
});

test('dark theme uses a legible SOMA wordmark without replacing canonical mark',async({page})=>{
  await page.goto('http://127.0.0.1:4174/tickets');
  const dark=page.locator('.soma-v2-brand-dark');
  await expect(dark).toBeVisible();
  const url=await dark.getAttribute('src');
  expect(url).toBe('/static/ui/brand/soma-lockup-dark.svg');
  const response=await page.request.get('http://127.0.0.1:4174'+url);
  expect(response.ok()).toBe(true);
  const svg=await response.text();
  expect(svg).toContain('#0A33FF');
  expect(svg).toContain('#DCE5F2');
  const theme=page.locator('html');
  await theme.evaluate(node=>node.setAttribute('data-mode','light'));
  await expect(page.locator('.soma-v2-brand-light')).toBeVisible();
  await expect(dark).toBeHidden();
});
