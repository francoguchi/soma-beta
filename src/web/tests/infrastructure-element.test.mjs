import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyNetworkElement} from '../.test-build/presentation/infrastructure-element.js';

const ne='11111111-1111-4111-8111-111111111111',site='22222222-2222-4222-8222-222222222222';
const rack='33333333-3333-4333-8333-333333333333',model='44444444-4444-4444-8444-444444444444';
const point=()=>({
  network_element_id:ne,revision:1,lifecycle:'active',operational_name:'Router',
  site:{kind:'site',id:site},customer_org_id:site,
  placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
  model:null,cloud_deployment:null,primary_ip:null,ip_count:0,containment_parent:null,
  containment_child_count:0,device_reference_count:0,installed_component_count:0,warning_codes:[],
});
test('Accepted Network Element point permits explicit unracked and validated Rack placement',()=>{
  assert.doesNotThrow(()=>verifyNetworkElement(point(),ne));
  assert.doesNotThrow(()=>verifyNetworkElement({...point(),
    placement:{rack_id:rack,u_start:1,u_span:2,revision:2,explicit_unracked:false},
    model:{kind:'model',id:model},primary_ip:'192.0.2.1',ip_count:1},ne));
});
test('A foreign or corrupted NE point cannot display nested physical and model identities',()=>{
  const p=point();
  for(const bad of [
    {...p,network_element_id:site},{...p,revision:0},{...p,site:{kind:'rack',id:site}},
    {...p,customer_org_id:'not uuid'},{...p,model:{kind:'room',id:model}},
    {...p,cloud_deployment:{kind:'cloud_deployment',id:'wrong'}},
    {...p,placement:{rack_id:rack,u_start:null,u_span:2,revision:1,explicit_unracked:false}},
    {...p,placement:{rack_id:null,u_start:1,u_span:null,revision:1,explicit_unracked:true}},
    {...p,placement:{rack_id:rack,u_start:1,u_span:2,revision:1,explicit_unracked:true}},
    {...p,ip_count:-1},{...p,primary_ip:{address:'untrusted'}},
    {...p,warning_codes:['a'.repeat(129)]},
  ])assert.throws(()=>verifyNetworkElement(bad,ne),/Invalid Network Element/u);
});
