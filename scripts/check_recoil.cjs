const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),M=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalogue.json'),'utf8')),before=JSON.stringify(M);
const metrics=fs.readFileSync(path.join(root,'src/metrics.js'),'utf8'),runtime=fs.readFileSync(path.join(root,'src/runtime.js'),'utf8');
function lab(model){
  const elements=new Map(),document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{value:selector==='#build-sort'?'unlock':'',innerHTML:'',selectedOptions:[{textContent:'Unlock order'}]});return elements.get(selector)}};
  const context=vm.createContext({M:model,document,renderGearEffects:()=>'',setTimeout:()=>0,clearTimeout:()=>{}});
  vm.runInContext(metrics,context);vm.runInContext(runtime.slice(runtime.indexOf('const $='),runtime.indexOf("document.addEventListener('click'")),context);
  return {context,elements,run:code=>vm.runInContext(code,context),json:code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)))};
}
const actual=lab(M),examples=[];
for(const id of M.loadoutUi.carriedWeaponIds){
  actual.context.id=id;actual.run('buildInitialized=false;startBuild(id,false);buildAmmo=defaultAmmo(id)');
  const sight=actual.run("optionalRoutes(id).find(r=>attachmentGroups[r.attachmentKey]==='Sight')");if(sight){actual.context.sight=sight;actual.run('installAttachmentRoute(sight)')}
  const held=actual.json("buildSelections.filter(s=>attachmentGroups[s.attachmentKey]==='Sight'||s.slotTag==='Item.Attachment.Magazine')"),ammo=actual.run('buildAmmo'),profile=actual.run('buildSnapshot(id,buildSelections,buildAmmo).recoil');
  for(const preference of ['balanced','horizontal','vertical']){
    actual.context.preference=preference;actual.run('recoilPreference=preference');const previous=actual.json('buildSelections'),valid=actual.run('optimizeRecoil()');
    assert.equal(valid,Boolean(profile),id+' profile availability');
    assert.deepEqual(actual.json("buildSelections.filter(s=>attachmentGroups[s.attachmentKey]==='Sight'||s.slotTag==='Item.Attachment.Magazine')"),held,id+' retains exact sight and magazine');
    assert.equal(actual.run('buildAmmo'),ammo,id+' retains ammo');
    assert.equal(actual.run('selectionClosure(buildSelections,buildWeapon).length'),actual.run('buildSelections.length'),id+' keeps provider closure');
    if(!profile)assert.deepEqual(actual.json('buildSelections'),previous,id+' missing pattern is non-destructive');
    if(['id.item.m4','id.item.vector','id.item.wepn_028','id.item.sks','id.item.m249','id.item.svdm'].includes(id))examples.push({id,preference,parts:actual.json("buildSelections.filter(s=>['Underbarrel','Muzzle'].includes(attachmentGroups[s.attachmentKey])).map(s=>s.attachmentKey)"),recoil:actual.json('buildSnapshot(id,buildSelections,buildAmmo).recoil')});
  }
}
actual.run("buildInitialized=false;startBuild('id.item.m4',false);buildAmmo=defaultAmmo(buildWeapon)");
// Real extended-mag regression: recoil preferences never trade away capacity or the exact route.
actual.run("equip(buildWeapon,'id.item.stanagextendedmagazine','id.item.m4:3:2','builder')");
const extended=actual.json("buildSelections.find(s=>s.slotTag==='Item.Attachment.Magazine')");assert.equal(extended.attachmentKey,'id.item.stanagextendedmagazine');
for(const preference of ['balanced','horizontal','vertical']){actual.context.preference=preference;actual.run("recoilPreference=preference;applyPreset('bestRecoil')");assert.deepEqual(actual.json("buildSelections.find(s=>s.slotTag==='Item.Attachment.Magazine')"),extended);assert.equal(actual.run('weaponCapacity(buildWeapon,buildSelections).value'),60)}
const html=actual.elements.get('#build-values').innerHTML.split('<div class="sectionlabel">Stock versus current build')[0];assert(html.includes('>Horizontal</th>')&&html.includes('>Vertical</th>')&&html.includes('class="recoil-estimate"')&&html.includes('ADS aim time')&&html.includes('Reduction'));assert(!/NaN|Infinity/.test(html));assert(actual.elements.get('#preset-buttons').innerHTML.includes('Recoil preference'));
assert.equal(JSON.stringify(M),before,'real snapshot remains immutable');

function fixture(pattern=[{X:1,Y:4}]){
  const attachment=(id,group,v=1,h=1,extra=[])=>({id,name:id,tags:group==='Magazine'?['Item.Attachment.Magazine']:[],slots:group==='Magazine'?[{tag:'Item.Ammo',capacity:{value:30}}]:[],data:{},raw:{fragments:[]},modifiers:[['VerticalRecoilMultiplier',v],['HorizontalRecoilMultiplier',h]].map(([key,rawScalar])=>({attribute:'Attribute.Gameplay.Weapon.'+key,rawScalar,effectState:'AppliedEffects',operation:'EBHAttributeModOp::MultiplyCompound',channel:'EBHAttributeModChannel::Default'})).concat(extra)});
  const attachments={vertical:attachment('vertical','Underbarrel',.5,1),horizontal:attachment('horizontal','Underbarrel',1,.5),vMuzzle:attachment('vMuzzle','Muzzle',.8,1),hMuzzle:attachment('hMuzzle','Muzzle',1,.8),scope:attachment('scope','Sight'),mag:attachment('mag','Magazine'),rail:attachment('rail'),feed:attachment('feed')};
  const groups={vertical:'Underbarrel',horizontal:'Underbarrel',vMuzzle:'Muzzle',hMuzzle:'Muzzle',scope:'Sight',mag:'Magazine'};
  const route=(id,slotKey,slotTag,providerKey='gun')=>({weaponKey:'gun',attachmentKey:id,providerKey,slotKey,slotTag,requiredChainIds:[],slotRoute:[slotKey+'>'+id]});
  const routes=[route('vertical','gun:grip','Item.Attachment.Underbarrel'),route('horizontal','gun:grip','Item.Attachment.Underbarrel'),route('vMuzzle','gun:muzzle','Item.Attachment.Muzzle'),route('hMuzzle','gun:muzzle','Item.Attachment.Muzzle')];
  const defaults=[route('rail','gun:rail','Item.Attachment.Rail'),route('scope','rail:sight','Item.Attachment.Sight','rail'),route('feed','gun:feed','Item.Attachment.Feed'),route('mag','feed:mag','Item.Attachment.Magazine','feed')];
  const model={items:Object.values(attachments).map(a=>({id:a.id,name:a.name,offers:[],sources:[],tags:a.tags,raw:{}})),weapons:{gun:{id:'gun',name:'Fixture',attributes:{VerticalRecoilMultiplier:1,HorizontalRecoilMultiplier:1,AimTime:.5},stats:{RecoilPattern:pattern},slots:[],audio:[]}},attachments,ammo:{},ammoRoutes:[],routes,loadoutUi:{carriedWeaponIds:['gun'],optionalRouteKeys:routes.map(r=>r.weaponKey+'|'+r.slotKey+'|'+r.attachmentKey),attachmentGroups:groups,attachmentCategoryOrder:[],defaultSelections:{gun:defaults}}};
  const instance=lab(model);instance.run("buildWeapon='gun';buildSelections=U.defaultSelections.gun.map(s=>({...s}));buildInitialized=true");return {...instance,model,attachment,route};
}
const parts=instance=>instance.json("buildSelections.filter(s=>['Underbarrel','Muzzle'].includes(attachmentGroups[s.attachmentKey])).map(s=>s.attachmentKey).sort()");
let test=fixture();assert(test.run('optimizeRecoil()'));assert.deepEqual(parts(test),['vMuzzle','vertical']);
test=fixture([{X:4,Y:1}]);test.run('optimizeRecoil()');assert.deepEqual(parts(test),['hMuzzle','horizontal'],'horizontal-heavy gun beats old vertical-first ranking');
for(const [preference,expected]of [['horizontal',['hMuzzle','horizontal']],['vertical',['vMuzzle','vertical']]]){test=fixture();test.context.preference=preference;test.run('recoilPreference=preference;optimizeRecoil()');assert.deepEqual(parts(test),expected)}
// Equal-weight axes: complete pairs beat picking each group against stock independently.
test=fixture([{X:1,Y:1}]);test.run('optimizeRecoil()');assert.deepEqual(parts(test),['hMuzzle','vertical']);
// Equal requested axis prefers the better other axis before keeping a dominated current part.
test=fixture();test.model.attachments.horizontal.modifiers.find(m=>m.attribute.endsWith('VerticalRecoilMultiplier')).rawScalar=.5;test.run("recoilPreference='vertical';installAttachmentRoute(M.routes.find(r=>r.attachmentKey==='vertical'));optimizeRecoil()");assert(parts(test).includes('horizontal'));
// Identical scores preserve the exact current selection and its provider/slot metadata.
test=fixture();test.model.attachments.horizontal.modifiers=test.model.attachments.vertical.modifiers.map(m=>({...m}));test.run("installAttachmentRoute(M.routes.find(r=>r.attachmentKey==='horizontal'));installAttachmentRoute(M.routes.find(r=>r.attachmentKey==='vMuzzle'))");const exact=test.json('buildSelections');test.run('optimizeRecoil()');assert.deepEqual(test.json('buildSelections'),exact);
for(const pattern of [undefined,[],[{X:0,Y:1}],[{X:1,Y:0}],[{X:0,Y:0}],[{X:1,Y:NaN}],[{X:'1',Y:2}],[{X:Infinity,Y:1}],[{X:1e308,Y:1}]]){test=fixture(pattern);if(pattern===undefined)delete test.model.weapons.gun.stats.RecoilPattern;const held=test.json('buildSelections');assert.equal(test.run('optimizeRecoil()'),false);assert.deepEqual(test.json('buildSelections'),held)}
test=fixture([{X:-3,Y:4},{X:3,Y:-4}]);assert.deepEqual(test.json('buildSnapshot(buildWeapon,buildSelections,buildAmmo).recoil'),{horizontal:3,vertical:4,combined:5,points:2},'signed axes cannot cancel');
for(const scalar of [0,-1,NaN,Infinity,null]){test=fixture();test.model.attachments.vertical.modifiers[0].rawScalar=scalar;test.run("installAttachmentRoute(M.routes.find(r=>r.attachmentKey==='vertical'))");const held=test.json('buildSelections');assert.equal(test.run('optimizeRecoil()'),false);assert.deepEqual(test.json('buildSelections'),held)}
test=fixture();test.model.attachments.vertical.modifiers[0].rawScalar=-1;test.model.attachments.vertical.modifiers.push({...test.model.attachments.vertical.modifiers[0]});test.run("installAttachmentRoute(M.routes.find(r=>r.attachmentKey==='vertical'))");assert.equal(test.run('buildSnapshot(buildWeapon,buildSelections,buildAmmo).recoil'),null,'two invalid negative factors cannot cancel into a valid estimate');
// Attractive candidates that replace a sight rail or magazine provider must be rejected.
test=fixture();for(const [id,group,provider,slot]of [['badGrip','Underbarrel','otherRail','gun:rail'],['badMuzzle','Muzzle','otherFeed','gun:feed']]){test.model.attachments[provider]=test.attachment(provider);test.model.attachments[id]=test.attachment(id,group,.01,.01);test.run(`attachmentGroups['${id}']='${group}'`);const parent=test.route(provider,slot,'Item.Attachment.Rail'),candidate=test.route(id,provider+':part','Item.Attachment.'+group,provider);candidate.slotRoute=[slot+'>'+provider,candidate.slotKey+'>'+id];test.model.routes.push(parent,candidate);test.context.candidate=candidate;test.run("optionalRouteKeys.add(candidate.weaponKey+'|'+candidate.slotKey+'|'+candidate.attachmentKey)")}
const locked=test.json('buildSelections');test.run('optimizeRecoil()');for(const held of locked)assert(test.json('buildSelections').some(s=>s.slotKey===held.slotKey&&s.attachmentKey===held.attachmentKey&&s.providerKey===held.providerKey));assert(!parts(test).some(id=>id.startsWith('bad')));
// Conditional bipod gains are excluded; an unsupported unconditional operation is unavailable.
test=fixture();test.model.attachments.horizontal.modifiers.push({...test.model.attachments.horizontal.modifiers[0],rawScalar:.001,filter:{RequireTags:['State.Bipod']}});test.run('optimizeRecoil()');assert.deepEqual(parts(test),['vMuzzle','vertical']);
test=fixture();test.model.attachments.vertical.modifiers[0].operation='EBHAttributeModOp::Add';test.run("installAttachmentRoute(M.routes.find(r=>r.attachmentKey==='vertical'))");assert.equal(test.run('buildSnapshot(buildWeapon,buildSelections,buildAmmo).recoil'),null);const unresolved=test.json('buildSelections');assert.equal(test.run('optimizeRecoil()'),false);assert.deepEqual(test.json('buildSelections'),unresolved);
console.log(JSON.stringify({status:'passed',weapons:M.loadoutUi.carriedWeaponIds.length,profileWeapons:M.loadoutUi.carriedWeaponIds.filter(id=>M.weapons[id].stats.RecoilPattern?.length).length,cases:['axis-specific patterns and complete combinations','balanced versus vertical-first','preferences and other-axis tiebreak','exact ties','missing/malformed/zero/overflow input and invalid multipliers','signed RMS','exact sight/magazine/provider/ammo retention','conditional/unsupported effects','real current weapons','snapshot immutability'],examples,browser:'Not run'}));
