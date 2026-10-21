'use strict';

const payload=Uint8Array.from(atob(document.querySelector('#site-data').textContent),c=>c.charCodeAt(0));

const modelText=await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

const M=JSON.parse(modelText);
const PUBLIC_ROADMAP=JSON.parse(document.querySelector('#public-roadmap').textContent);

const V=new Map(M.damage.vehicles.map(v=>[v.id,v])),A=new Map(M.damage.armor.map(a=>[a.id,a]));

for(const i of M.items){i.vehicle=V.get(i.vehicleId);i.armor=A.get(i.armorId)}

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const fmt=v=>v==null?'—':typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:5}):String(v),cash=v=>v==null?'—':'$'+fmt(v);

function catalogueProjection(model){
  const offersById=new Map();
  for(const parent of model.items)for(const offer of parent.offers||[]){if(!offersById.has(offer.id))offersById.set(offer.id,[]);offersById.get(offer.id).push({parent,offer})}
  return model.items.map(item=>{
    if(!model.ammo[item.id]&&!model.attachments[item.id]?.tags.some(tag=>tag==='Item.Attachment.Magazine'||tag.startsWith('Item.Attachment.Magazine.')))return item;
    const matches=offersById.get(item.id)||[],offers=matches.map(match=>match.offer),active=offers.filter(offer=>offer.visible),familyOffers=(item.offers||[]).filter(offer=>offer.visible&&!offer.previewOnly),shopFamily=!active.length&&familyOffers.some(offer=>offer.id!==item.id);
    const prices=[...new Set(active.map(offer=>offer.price).filter(value=>typeof value==='number'&&Number.isFinite(value)))],vendorLevels=[...new Set(offers.map(offer=>offer.vendorLevelToUnlock).filter(value=>typeof value==='number'))],sourceParent=matches.find(match=>match.offer.visible&&!match.offer.previewOnly)?.parent;
    return {...item,visible:active.length>0||shopFamily,offers:shopFamily?item.offers:offers,price:shopFamily?item.price:prices.length===1?prices[0]:null,vendorLevels,team:active.length?[...new Set(active.map(offer=>offer.team))]:item.team,shopFamily,icon:item.icon||sourceParent?.icon||null,iconSource:!item.icon&&sourceParent?.icon?'Vendor family artwork: '+sourceParent.rawId:null,sources:[...item.sources,...matches.map(match=>match.offer.source)],raw:{...item.raw,shopOfferProjection:{exactItemId:item.id,sourceVisibleExactOffers:active.length,vendorFamily:shopFamily,offerParents:[...new Set(matches.map(match=>match.parent.id))],originalFamilyOffers:item.offers}}};
  });
}
const C=catalogueProjection(M),I=new Map(C.map(i=>[i.id,i]));

const U=M.loadoutUi,carried=new Set(U.carriedWeaponIds),optionalRouteKeys=new Set(U.optionalRouteKeys);
const attachmentGroups={...U.attachmentGroups};
const attachmentCategoryOrder=[...U.attachmentCategoryOrder,'Magazine'];
const isMagazine=id=>Boolean(M.attachments[id]?.tags.some(tag=>tag==='Item.Attachment.Magazine'||tag.startsWith('Item.Attachment.Magazine.'))&&!M.attachments[id]?.tags.includes('Item.Resource.Magazine.Battery'));
for(const id of Object.keys(M.attachments))if(isMagazine(id))attachmentGroups[id]='Magazine';
for(const weaponId of U.carriedWeaponIds){
  const defaults=U.defaultSelections[weaponId]||[],slots=M.weapons[weaponId].slots;
  const candidates=M.routes.filter(route=>route.weaponKey===weaponId&&route.slotTag==='Item.Attachment.Magazine'&&slots.some(slot=>slot.key===route.slotKey&&!slot.hidden)&&M.attachments[route.attachmentKey]?.data.bCanBeRemovedInGame===true&&(defaults.some(d=>d.slotKey===route.slotKey&&d.attachmentKey===route.attachmentKey)||I.get(route.attachmentKey)?.offers.some(offer=>offer.visible)));
  if(new Set(candidates.map(route=>route.attachmentKey)).size<2)continue;
  for(const route of candidates){optionalRouteKeys.add(route.weaponKey+'|'+route.slotKey+'|'+route.attachmentKey);attachmentGroups[route.attachmentKey]='Magazine'}
}


let attachmentGroup='Sight',attachmentSort='unlock',buildCategory='All',buildInitialized=false,recoilPreference='balanced';

const labels={weapons:'Equipment',attachments:'Attachments',gear:'Gear',items:'Items','loose-ammo':'Loose ammunition',vehicles:'Vehicles',cosmetics:'Cosmetics'};

let view='overview',subcategory='All',selected='id.item.m4',detailTab='stats',role='Wardog',buildWeapon='id.item.m4',buildAmmo=null,buildSelections=[],presetName='Custom',component=null,damageGun='id.item.m4';

const objectives=[['bestRecoil','Best recoil'],['fastestAim','Fastest aim'],['range','Best range'],['damage','Best damage'],['apDamage','Best AP damage'],['hpDamage','Best HP damage'],['penetration','Best penetration'],['impactImpulse','Highest impact impulse'],['sniperSound','Sniper suppression']];

const weaponName=id=>M.weapons[id]?.name||M.attachments[id]?.name||M.ammo[id]?.name||I.get(id)?.name||id;

const slotName=tag=>tag?.split('.').slice(-1)[0]||'Slot';

function art(i){return i?.icon?`<img src="${esc(i.icon)}" alt="" loading="lazy"${i.iconSource?` title="${esc(i.iconSource)}"`:""}>`:'<span class="fallback" aria-hidden="true">W</span>'}

function raw(value,label='All raw fields'){return `<details><summary>${esc(label)}</summary><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`}

function kv(k,v){return `<div class="kv"><span>${esc(k)}</span><b>${esc(typeof v==='object'?JSON.stringify(v):fmt(v))}</b></div>`}

function source(s){return s?`<div class="source">${esc(s.path||s.package||s.virtualPath||'')}${s.oneBasedLine!=null?' · line '+esc(s.oneBasedLine):''}<br>${esc(s.export||'')} · ${esc(s.jsonPointer||s.pointer||s.parsedPointer||'')}</div>`:''}

function projectileFieldLink(pointer,value){

  const fields=M.globalProjectileConfig.fields,index=fields.findIndex(f=>f.source.parsedPointer===pointer);

  return index<0?esc(value==null?'Not stored':fmt(value)):`<a href="#projectile-source-${index}" data-projectile-source="${index}" title="${esc(fields[index].path)}">${esc(fmt(value))}</a>`;

}

function projectileSurface(surface){

  const key=surface?.split('::').at(-1),tables=M.globalProjectileConfig.tables;

  if(!key)return null;

  const rows=Object.fromEntries(tables.filter(t=>typeof t.rows[0]?.key==='string').map(t=>[t.field,t.rows.find(r=>r.key===key)]));

  return Object.values(rows).every(Boolean)?{key,rows}:null;

}

function projectileTupleCells(row){

  return ['Min','Max'].map(name=>{const index=row.value.items.findIndex(f=>f.field===name);return index<0?'Not stored':projectileFieldLink(row.source.parsedPointer+'/items/1/value/items/'+index+'/value',row.value.items[index].value)});

}

function renderProjectileSurface(binding){

  const profile=binding.profile,match=projectileSurface(profile?.raw.SurfaceType);

  if(!match)return kv('Global surface inputs','Unmatched: physical material profile or surface key missing');

  const exit=match.rows.PenetrationPhysMatExitSpeedModifiers,rico=match.rows.PhysMatRicochetProbabilities,rest=match.rows.PhysMatRicochetRestitutionCoefficient;

  const cells=projectileTupleCells(rest),ignored=M.globalProjectileConfig.fields.find(f=>f.path.startsWith('ProjectileSystemSettings.PenetrationPhysMatIgnoreList.')&&f.value.split('.',1)[0]===binding.physicalMaterial);

  return kv('Surface key',match.key)+`<div class="kv"><span>Exit speed modifier / raw</span><b>${projectileFieldLink(exit.source.parsedPointer+'/items/1/value',exit.value)}</b></div><div class="kv"><span>Ricochet probability / raw</span><b>${projectileFieldLink(rico.source.parsedPointer+'/items/1/value',rico.value)}</b></div><div class="kv"><span>Restitution Min / Max / raw</span><b>${cells.join(' / ')}</b></div><div class="kv"><span>Listed in penetration ignore list</span><b>${ignored?projectileFieldLink(ignored.source.parsedPointer,'Yes'):'No'}</b></div>`+source({...profile.source,jsonPointer:(profile.source.jsonPointer||profile.source.pointer)+'/SurfaceType'});

}

function renderProjectileSettings(){

  const g=M.globalProjectileConfig,tables=g.tables,surface=tables.find(t=>t.field==='PenetrationPhysMatExitSpeedModifiers');

  const tableFields=new Set(tables.map(t=>t.field));

  const general=g.fields.filter(f=>f.kind==='number'&&!tableFields.has(f.path.split('.')[1]));

  const values=general.map(f=>`<div class="kv"><span>${esc(f.path.replace('ProjectileSystemSettings.',''))} / raw</span><b>${projectileFieldLink(f.source.parsedPointer,f.value)}</b></div>`).join('');

  const materialRows=surface.rows.map(row=>{const match=projectileSurface(row.key),r=match.rows,rest=projectileTupleCells(r.PhysMatRicochetRestitutionCoefficient);return `<tr><th scope="row">${esc(row.key)}</th><td>${projectileFieldLink(row.source.parsedPointer+'/items/1/value',row.value)}</td><td>${projectileFieldLink(r.PhysMatRicochetProbabilities.source.parsedPointer+'/items/1/value',r.PhysMatRicochetProbabilities.value)}</td><td>${rest[0]}</td><td>${rest[1]}</td></tr>`}).join('');

  const angle=tables.find(t=>t.field==='ImpactAngleRicochetProbabilities');

  const angleRows=angle.rows.map(r=>`<tr>${r.key.items.map((f,n)=>`<td>${projectileFieldLink(r.source.parsedPointer+'/items/0/value/items/'+n+'/value',f.value)}</td>`).join('')}<td>${projectileFieldLink(r.source.parsedPointer+'/items/1/value',r.value)}</td></tr>`).join('');

  const fieldRows=g.fields.map((f,n)=>`<details id="projectile-source-${n}"><summary>${esc(f.path)}: ${esc(fmt(f.value))}</summary>${source(f.source)}${raw(f,'Field provenance')}</details>`).join('');

  return `<details class="projectile-settings"><summary>Global projectile settings · 291 numeric inputs</summary><p class="small muted">Shared game settings. Values use stored raw units.</p>${values}<details><summary>Material inputs · 63 surface keys</summary><div class="scrolltable"><table><thead><tr><th>Surface</th><th>Exit modifier / raw</th><th>Ricochet probability / raw</th><th>Restitution Min / raw</th><th>Restitution Max / raw</th></tr></thead><tbody>${materialRows}</tbody></table></div></details><details><summary>Impact-angle inputs · 9 rows</summary><div class="scrolltable"><table><thead><tr><th>X / raw</th><th>Y / raw</th><th>Probability / raw</th></tr></thead><tbody>${angleRows}</tbody></table></div></details><details><summary>All source fields · 510</summary>${fieldRows}</details>${raw({assignments:g.assignments,references:g.references},'Damage registration, hit locations and parsed assignments')}</details>`;

}

function unlockText(i){return i.unlocks.length?i.unlocks.map(u=>`${u.role} LVL ${u.level}`).join(' / '):i.vendorLevels?.some(v=>v>1)?'LVL '+Math.min(...i.vendorLevels.filter(v=>v>1)):'Available'}

function activeOffers(i){return (i?.offers||[]).filter(o=>o.visible&&(!o.previewOnly||Boolean(M.ammo[i.id])||isMagazine(i.id)))}

function packLabel(i,amount){return amount==null?'Quantity not stored':i.category==='loose-ammo'?`${fmt(amount)} rounds`:`Pack of ${fmt(amount)}`}

function itemCash(i,value){return i.currency==='Attribute.Meta.Currency.GoldBars'?(value==null?'—':fmt(value)+' gold bars'):cash(value)}

function purchaseLabel(i){

  if(!i)return cash(null);

  const active=activeOffers(i),offers=active.length?active:(i.offers||[]),priced=offers.filter(o=>typeof o.price==='number'&&Number.isFinite(o.price));

  if(!priced.length)return itemCash(i,i.price);

  const minimum=Math.min(...priced.map(o=>o.price)),cheapest=priced.filter(o=>o.price===minimum),amounts=[...new Set(cheapest.map(o=>o.amount))];

  const varies=new Set(priced.map(o=>`${o.price}|${o.amount}`)).size>1;

  const quantity=amounts.length===1&&amounts[0]>1?' / '+packLabel(i,amounts[0]):amounts.length>1?' / varying packs':'';

  return (active.length?'':'Stored ')+(varies?'From ':'')+itemCash(i,minimum)+quantity;

}

function renderOffers(i){

  const offers=i.offers||[];

  if(!offers.length)return '<div class="empty">No vendor offers stored for this definition.</div>';

  const render=o=>{

    const types=(o.subcategories||[]).map(t=>t.split('.').at(-1).replace(/([a-z0-9])([A-Z])/g,'$1 $2')).join(' / ');

    const permanent=(o.permanentUnlockRefs||[]).map(id=>M.unlocks.find(u=>u.id===id)).filter(Boolean);

    const limit=o.lifeTimeBuyLimit==null?'':kv(o.lifeTimeBuyLimit>0?'Lifetime purchase limit':'Lifetime buy limit (raw)',o.lifeTimeBuyLimit);

    return `<article class="attachment offer"><div class="attachmentheader"><h3>${esc(o.name||o.rawId)}</h3><span class="value-green">${cash(o.price)}</span></div><div class="small muted">${esc(types)}</div>${kv('Pack quantity',packLabel(i,o.amount))}${o.team!=null?kv('Faction',o.team==='all'?'All teams':o.team):''}${o.vendorLevelToUnlock!=null?kv('Vendor level',o.vendorLevelToUnlock):''}${limit}${o.entitlementRequired!=null?kv('Entitlement required',o.entitlementRequired?'Yes':'No'):''}${(o.unlockRequiredItems||[]).length?kv('Required item IDs',o.unlockRequiredItems.join(', ')):''}${permanent.map(u=>kv(u.role+' unlock / fee',`LVL ${fmt(u.level)} / ${cash(u.fee)}`)).join('')}<details><summary>Offer source and raw fields</summary>${source(o.source)}${raw(o,'Raw offer')}</details></article>`;

  };

  const listed=o=>o.visible&&(!o.previewOnly||Boolean(M.ammo[i.id])||isMagazine(i.id));const groups=[['Shop offers',offers.filter(listed)],['Preview offers',offers.filter(o=>!listed(o)&&o.previewOnly)],['Hidden offers',offers.filter(o=>!o.visible&&!o.previewOnly)]];

  return groups.map(([title,rows],n)=>!rows.length?'':n?`<details class="offer-archive"><summary>${title} (${rows.length})</summary>${rows.map(render).join('')}</details>`:`<div class="sectionlabel">${title} (${rows.length})</div>${rows.map(render).join('')}`).join('');

}

function uiShopVisible(i){return i.visible&&U.catalogueOverrides[i.id]?.shopEligible!==false}

function uiCategory(i){return isMagazine(i.id)?'attachments':U.catalogueOverrides[i.id]?.category||i.category}

function uiGroup(i){if(isMagazine(i.id))return 'Magazine';const override=U.catalogueOverrides[i.id];if(override)return override.subcategory;if(i.category==='attachments')return attachmentGroups[i.id];if(i.category==='weapons')return U.weaponCategories[i.id]||({'Assault rifles':'Assault Rifle','SMGs':'SMG','Shotguns':'Shotgun','LMGs':'LMG','Marksman rifles':'Marksman Rifle','Sniper rifles':'Sniper','Bows':'Bows','Sidearms':'Sidearms','Launchers':'Launchers'}[i.subcategory]||i.subcategory);if(i.category==='gear')return ({'Inventory.Slot.Armor':'Body armour','Inventory.Slot.Helmet':'Helmets','Inventory.Slot.Backpack':'Backpacks','Inventory.Slot.Vest':'Vests','Inventory.Slot.Traversal':'Parachutes'}[i.tags.find(t=>t.startsWith('Inventory.Slot.'))]||i.subcategory);return i.subcategory}

function catalogueEligible(i){return uiCategory(i)!=='attachments'||Boolean(attachmentGroups[i.id])}

function byUnlock(a,b){return (a.unlockLevel-b.unlockLevel)||((a.price??Infinity)-(b.price??Infinity))||a.name.localeCompare(b.name)}

function sortItems(list,sort){return list.sort((a,b)=>sort==='unlock'?byUnlock(a,b):sort==='name'?a.name.localeCompare(b.name):sort==='price'?((a.price??Infinity)-(b.price??Infinity))||byUnlock(a,b):sort==='rpm'?((M.weapons[b.id]?.stats.RoundsPerMinute??-Infinity)-(M.weapons[a.id]?.stats.RoundsPerMinute??-Infinity)):((M.weapons[a.id]?.attributes.AimTime??Infinity)-(M.weapons[b.id]?.attributes.AimTime??Infinity)))}

function rows(){const q=$('#search').value.toLowerCase(),all=$('#availability').value==='all';return sortItems(C.filter(i=>uiCategory(i)===view&&catalogueEligible(i)&&(!M.weapons[i.id]||view!=='weapons'||carried.has(i.id))&&(all||uiShopVisible(i))&&(subcategory==='All'||uiGroup(i)===subcategory)&&(!q||[i.name,i.rawId,uiGroup(i),...i.tags].join(' ').toLowerCase().includes(q))),$('#sort').value)}

function setView(name){view=name;const catalogue=Object.hasOwn(labels,name);document.querySelectorAll('.section').forEach(s=>s.hidden=s.id!==(catalogue?'catalogue':name));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(catalogue){subcategory=name==='attachments'?'Sight':'All';$('#search').value='';$('#sort').value='unlock';renderCatalogue()}if(name==='overview')renderOverview();if(name==='builder')renderBuilder();if(name==='progression')renderProgression();if(name==='economy')renderEconomy();if(name==='comparison')renderComparison();window.scrollTo({top:0})}

function equipmentCard(i,active,action){return `<button class="card ${i.id===active?'selected':''}" data-${action}="${esc(i.id)}" aria-label="Select ${esc(i.name)}"><span class="price">${esc(purchaseLabel(i))}</span><span class="picture">${art(i)}</span><span class="name">${esc(i.name)}${i.shopFamily?'<small class="metric-result">Vendor family</small>':''}</span><span class="unlockstrip"><b>${esc(unlockText(i))}</b></span></button>`}

function ammoCardItem(a){const item=I.get(a.id),offers=M.items.flatMap(i=>i.offers).filter(o=>o.id===a.id);return {...item,id:a.id,name:a.name,offers,unlocks:M.unlocks.filter(u=>u.itemId===a.id),vendorLevels:offers.map(o=>o.vendorLevelToUnlock)}}

function renderCatalogue(){const available=C.filter(i=>uiCategory(i)===view&&catalogueEligible(i)&&(!M.weapons[i.id]||view!=='weapons'||carried.has(i.id))&&($('#availability').value==='all'||uiShopVisible(i)));const priority=view==='weapons'?U.weaponCategoryOrder:view==='attachments'?attachmentCategoryOrder:view==='gear'?['Body armour','Helmets','Backpacks','Vests','Parachutes']:M.categoryOrder[view]||[],rank=c=>priority.includes(c)?priority.indexOf(c):999;const cats=view==='attachments'?attachmentCategoryOrder:['All',...[...new Set(available.map(uiGroup))].sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b))];if(!cats.includes(subcategory))subcategory=cats[0];$('#subcategories').innerHTML=cats.map(c=>`<button data-subcategory="${esc(c)}" class="${c===subcategory?'active':''}">${esc(c)}</button>`).join('');const list=rows();if(!list.some(i=>i.id===selected))selected=list[0]?.id||null;$('#catalogue-title').textContent=labels[view];$('#catalogue-kicker').textContent=view==='vehicles'?'Garage vendor':'Equipment vendor';$('#catalogue-count').textContent=list.length+' ITEMS';$('#cards').innerHTML=list.length?list.map(i=>equipmentCard(i,selected,'item')).join(''):'<div class="empty">No items match these filters.</div>';$('#catalogue-summary').textContent='Ordered by '+($('#sort').selectedOptions[0]?.textContent||'unlock');renderDetail()}

function startBuild(id,preserve=true){if(!carried.has(id))return false;if(buildWeapon!==id||!buildInitialized){const old=preserve?buildSelections.filter(optionalSelection):[];buildWeapon=id;buildSelections=U.defaultSelections[id].map(s=>({...s}));buildInitialized=true;presetName='Custom';for(const chosen of old){const route=optionalRoutes(id).find(r=>r.attachmentKey===chosen.attachmentKey);if(route)installAttachmentRoute(route)}}return true}

function optionalSelection(s){return attachmentGroups[s.attachmentKey]&&(['Item.Attachment.Sight','Item.Attachment.Underbarrel','Item.Attachment.Muzzle'].includes(s.slotTag)||s.slotTag==='Item.Attachment.Magazine'&&optionalRouteKeys.has(buildWeapon+'|'+s.slotKey+'|'+s.attachmentKey))}

function renderGunSelectors(id,sandbox){if(!carried.has(id))return '';startBuild(id);return `<div class="gunselectors" aria-label="Weapon attachments">${[['Sight','Scope'],['Underbarrel','Underbarrel'],['Muzzle','Muzzle'],['Magazine','Magazine']].map(([group,label])=>{const chosen=buildSelections.filter(s=>group==='Magazine'?s.slotTag==='Item.Attachment.Magazine':optionalSelection(s)&&attachmentGroups[s.attachmentKey]===group).at(-1),routes=optionalRoutes(id).filter(r=>attachmentGroups[r.attachmentKey]===group),capacity=group==='Magazine'?weaponCapacity(id,buildSelections).value:null;return `<button data-attachment-group="${group}" data-selector-weapon="${esc(id)}" data-selector-location="${sandbox?'builder':'detail'}" class="${attachmentGroup===group?'active':''}" ${routes.length?'':'disabled'}><span>${label}</span><span class="selectorart">${chosen&&I.get(chosen.attachmentKey)?.icon?art(I.get(chosen.attachmentKey)):capacity!=null?esc(capacity):'+'}</span><small>${esc(chosen?weaponName(chosen.attachmentKey):capacity!=null?'Fixed feed / '+capacity:routes.length?'Standard / none':'No options')}</small></button>`}).join('')}</div>`}

function statTiles(values){const present=values.filter(([,v])=>v!=null);if(!present.length)return '';return `<div class="statsgrid">${present.map(([k,v])=>`<div><label>${esc(k)}</label><strong>${esc(fmt(v))}</strong></div>`).join('')}</div>`}

function renderDetail(){return preservePickerState(renderDetailContent)}

function renderDetailContent(){const i=I.get(selected);if(!i){$('#detail').innerHTML='<div class="empty">Select equipment to inspect it.</div>';return}const w=M.weapons[i.id],a=M.attachments[i.id],ammo=M.ammo[i.id],target=i.vehicle||i.armor;const tabs=[['stats','Stats'],...(w?[['ammo','Ammo']]:[]),...(target?[['damage','Damage & armour']]:[]),...(i.offers.length?[['offers','Offers']]:[]),['sources','Sources']];if(!tabs.some(t=>t[0]===detailTab)&&!(detailTab==='attachments'&&carried.has(i.id)))detailTab='stats';let body='';if(detailTab==='stats'){let stats=w?statTiles([['Fire rate / RPM',w.stats.RoundsPerMinute],['Aim time',w.attributes.AimTime],['Effective range',w.stats.EffectiveRange],['Bullet speed',w.stats.InitialBulletSpeed]]):i.vehicle?statTiles([['Vehicle health',i.vehicle.healthProfiles?.[0]?.raw.InitialVehicleHealth],['Health sections',i.vehicle.componentHealth.length],['Collision bindings',i.vehicle.collisionMaterials.length],['Price',i.price]]):i.armor?statTiles([['Durability',i.armor.raw.ReplicatedData?.Durability],['Covered regions',i.armor.raw.CoveredHitLocations?.length]]):ammo?statTiles([['Projectile base damage',ammo.baseDamage],['Typical speed',ammo.stats.TypicalSpeed],['Penetration exit multiplier',ammo.stats.PenetrationExitSpeedMultiplier],['Projectile mass',ammo.stats.ProjectileDimensions?.Mass]]):'';body=stats+(w?renderCapacity(i.id):a&&isMagazine(i.id)?statTiles([['Ammo capacity',a.slots.find(slot=>slot.tag==='Item.Ammo')?.capacity?.value],['Magazine weight / stored',magazineFacts(i.id).weight],['Reload animation rate',magazineFacts(i.id).reloadPlayRate]])+raw(a.slots.map(slot=>({slotKey:slot.key,tag:slot.tag,capacity:slot.capacity})),'Magazine capacity sources'):'')+kv('Unlock',unlockText(i))+i.unlocks.map(u=>kv(u.role+' unlock fee',cash(u.fee))).join('')+kv('Buy price',purchaseLabel(i))+kv('Availability',i.team?.map(t=>t==='all'?'All teams':t).join(', '))+ (a?modifierTable(a.modifiers):'')+(i.armor?armorStages(i.armor):'')+renderUtility(i.id)+renderGearEffects(i.id)+(ammo?renderProjectileSettings():'')+raw(w?{attributes:w.attributes,weaponStats:w.stats,fragments:w.raw.fragments,audio:w.audio}:target||ammo||i.raw);if(w&&carried.has(i.id))body+=`<div class="actionrow"><button data-build="${esc(i.id)}">Open in build lab</button></div>`}else if(detailTab==='attachments')body=renderAttachments(i.id,false);else if(detailTab==='ammo')body=renderAmmo(i.id);else if(detailTab==='damage')body=renderDamage(i);else if(detailTab==='offers')body=renderOffers(i);else body=i.sources.map(source).join('')+raw({offers:i.offers,...i.raw},'Vendor offers and source records');$('#detail').innerHTML=`<div class="detailhero"><div><span class="eyebrow">${esc(uiGroup(i))}</span><h2>${esc(i.name)}</h2>${i.shopFamily?'<p class="small muted">Vendor family. Purchasable variants and exact prices are listed under Offers.</p>':''}${U.catalogueOverrides[i.id]?.status?`<p class="small muted">${esc(U.catalogueOverrides[i.id].status)}</p>`:''}</div><div class="detailprice">${esc(purchaseLabel(i))}</div><div class="picture">${art(i)}</div></div>${renderGunSelectors(i.id,false)}<div class="detail-actions"><button data-compare-item="${esc(i.id)}" aria-label="Add ${esc(i.name)} to comparison">Add to comparison</button></div><div class="tabs" role="tablist" aria-label="Equipment details">${tabs.map(([key,text])=>`<button data-tab="${key}" class="${detailTab===key?'active':''}" role="tab" aria-selected="${detailTab===key}">${text}</button>`).join('')}</div><div class="content">${body}</div>`}

function renderUtility(id){const u=M.utility.items[id];if(!u)return '';const smoke=u.smokeSummary?.fields||[];let hero=smoke.length?statTiles([['Smoke diameter',smoke.find(f=>f.name==='Diameter')?.value],['Smoke duration',smoke.find(f=>f.name==='Total Duration')?.value],['Fuse',u.fields.find(f=>f.name==='BaseFuseTime')?.value],['World actor lifetime',u.fields.find(f=>f.name==='InitialLifeSpan')?.value]]):'';const health=u.fields.find(f=>f.label==='Health change');if(health)hero+=statTiles([['Health change',health.value],['Durability',u.fields.find(f=>f.name==='Durability')?.value]]);return hero+(u.readableGroups||[]).map(g=>{const seen=new Set(),fields=g.fields.filter(f=>{const key=f.label+'|'+JSON.stringify(f.value);if(seen.has(key))return false;seen.add(key);return true});const content=fields.map(f=>`<div title="${esc((f.source?.path||'')+' '+(f.source?.pointer||''))}">${kv(f.label.replace(/^b /,''),typeof f.value==='string'?f.value.split('::').slice(-1)[0]:f.value)}</div>`).join('');return g.name==='Inventory and behavior'||fields.length>12?`<details><summary>${esc(g.name)}</summary>${content}</details>`:`<div class="sectionlabel">${esc(g.name)}</div>${content}`}).join('')+raw({fields:u.fields,dependencyEdges:u.dependencyEdges,sources:u.sources},'Linked fields and sources')}

function unconditionalModifier(m){return (!m.curveIndexing||m.curveIndexing.endsWith('::Fixed'))&&m.effectState==='AppliedEffects'&&!m.filter?.RequireTags?.length&&!m.filter?.IgnoreTags?.length&&!m.filter?.TagQuery?.QueryTokenStream?.length&&!m.curve?.CurveTable}
function fixedModifiers(mods){return mods.filter(m=>typeof m.rawScalar==='number'&&Number.isFinite(m.rawScalar)&&unconditionalModifier(m)&&m.operation==='EBHAttributeModOp::MultiplyCompound'&&m.channel==='EBHAttributeModChannel::Default')}

function modifierTable(mods){return mods.length?`<div class="sectionlabel">Attachment modifiers</div>${mods.map(m=>kv(m.attribute.split('.').slice(-1)[0]+' / '+m.operation.split('::').slice(-1)[0],m.rawScalar)).join('')}`:''}

function optionalRoutes(id){return M.routes.filter(r=>r.weaponKey===id&&optionalRouteKeys.has(r.weaponKey+'|'+r.slotKey+'|'+r.attachmentKey))}

function renderAttachments(weaponId,sandbox){const seen=new Set();let routes=optionalRoutes(weaponId).filter(r=>attachmentGroups[r.attachmentKey]===attachmentGroup).filter(r=>{const key=r.slotKey+'|'+r.attachmentKey;if(seen.has(key))return false;seen.add(key);return true});routes.sort((a,b)=>{const x=I.get(a.attachmentKey),y=I.get(b.attachmentKey);return attachmentSort==='name'?x.name.localeCompare(y.name):attachmentSort==='price'?((x.price??Infinity)-(y.price??Infinity))||byUnlock(x,y):byUnlock(x,y)});return `<div class="attachmenttoolbar"><h3>${esc(attachmentGroup==='Sight'?'Scope / Sight':attachmentGroup)}</h3><label>Sort<select data-attachment-sort aria-label="Sort compatible attachments">${[['unlock','Unlock order'],['price','Lowest price'],['name','Name']].map(([id,label])=>`<option value="${id}" ${attachmentSort===id?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="attachmenttiles">${routes.length?routes.map(r=>{const a=M.attachments[r.attachmentKey],item=I.get(a.id),wins=M.rankings.filter(g=>g.weaponKey===weaponId&&g.slotKey===r.slotKey&&g.winners.some(w=>w.attachmentKey===r.attachmentKey)),chosen=buildWeapon===weaponId&&buildSelections.some(s=>s.slotKey===r.slotKey&&s.attachmentKey===r.attachmentKey);return `<article class="attachmenttile ${chosen?'selected':''}"><button class="attachmentchoose" data-equip="${esc(a.id)}" data-route="${esc(r.slotKey)}" data-weapon="${esc(weaponId)}" data-equip-location="${sandbox?'builder':'detail'}"><span class="tileprice">${esc(purchaseLabel(item))}</span><span class="tileart">${art(item)}</span><b>${esc(a.name)}</b><small>${esc(unlockText(item))}</small><span class="badge">${chosen?'Equipped':'Select'}</span></button><div class="badges">${wins.map(g=>`<span class="badge best">${esc({verticalRecoil:'Best vertical',horizontalRecoil:'Best horizontal',aimTime:'Fastest aim'}[g.rule]||g.rule)} ×${fmt(g.bestRawScalar)}</span>`).join('')}</div>${attachmentGroup==='Magazine'?`<div class="small">Capacity: ${esc(fmt(a.slots.find(slot=>slot.tag==='Item.Ammo')?.capacity?.value))}</div>`:''}${fixedModifiers(a.modifiers).slice(0,3).map(m=>`<div class="small">${esc(m.attribute.split('.').at(-1))} ×${fmt(m.rawScalar)}</div>`).join('')}${r.requiredChainIds.length?`<div class="route">Requires ${r.requiredChainIds.map(id=>esc(weaponName(id))).join(' → ')}</div>`:''}<button class="small" data-inspect-attachment="${esc(a.id)}">Stats / sources</button></article>`}).join(''):'<div class="empty">No selectable attachments in this slot.</div>'}</div>`}

function compatibleAmmo(id){const selections=id===buildWeapon&&buildInitialized?buildSelections:U.defaultSelections[id]||[],magazines=selections.filter(s=>s.slotTag==='Item.Attachment.Magazine').map(s=>s.attachmentKey),all=M.ammoRoutes.filter(r=>r.weaponKey===id),fromMagazine=all.filter(r=>magazines.includes(r.providerKey)&&r.slotTag==='Item.Ammo'),routes=fromMagazine.length?fromMagazine:all.filter(r=>r.providerKey===id);return [...new Set(routes.map(r=>r.ammoKey))].map(k=>M.ammo[k]).filter(Boolean)}

function renderAmmo(id){const list=compatibleAmmo(id);return (list.length?list.map(a=>`<div class="attachment"><b>${esc(a.name)}</b><div class="badges">${a.tags.filter(t=>t.startsWith('Item.Ammo.Type.')).map(t=>`<span class="badge">${esc(t.split('.').slice(-1)[0])}</span>`).join('')}</div>${kv('Projectile base damage',a.baseDamage)}${kv('Typical speed',a.stats.TypicalSpeed)}${kv('Penetration exit multiplier',a.stats.PenetrationExitSpeedMultiplier)}${raw(a.stats,'Projectile fields')}${source(a.projectileSource)}</div>`).join(''):'<div class="empty">No ammunition route in this definition.</div>')+renderProjectileSettings()}

function tagMatch(tag,expected){return tag===expected||tag.startsWith(expected+'.')}

function armorStages(a){const stages=a.raw.DurabilityStagesSetupData||[];return stages.length?`<div class="sectionlabel">Armour stages</div><div class="scrolltable"><table><thead><tr><th>Stage entry</th><th>Reduction %</th><th>Thickness</th><th>Density</th></tr></thead><tbody>${stages.map((s,n)=>`<tr><td>${n+1}</td><td class="num">${fmt(s.DamagePercentageReduction)}</td><td class="num">${fmt(s.Thickness)}</td><td class="num">${fmt(s.Density)}</td></tr>`).join('')}</tbody></table></div>`:''}

function armorOperationTable(armor,ammo){const ids=new Set(ammo.map(a=>a.id));const rows=(M.armorOperationModels||[]).filter(r=>r.armorId===armor.id&&r.stage===0&&ids.has(r.ammoId));return rows.length?`<div class="sectionlabel">Armour operation model / stage entry 1</div><div class="scrolltable"><table><thead><tr><th>Bullet</th><th>Input damage</th><th>Armour delta</th><th>After operation</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.ammoName)}</td><td class="num">${fmt(r.base)}</td><td class="num">${fmt(r.delta)}</td><td class="num">${fmt(r.remaining)}</td></tr>`).join('')}</tbody></table></div>${raw(M.armorOperationFormula,'Armour operation formula')}`:''}

function renderDamage(i){const v=i.vehicle,a=i.armor;const allRules=[...new Set(v?v.damageProfiles.flatMap(p=>p.ruleIds||[]):[...(a.armorRuleIds||[]),...(a.playerRuleIds||[])])].map(id=>M.damage.rules[id]).filter(Boolean);const guns=Object.values(M.weapons).filter(w=>compatibleAmmo(w.id).length);if(!M.weapons[damageGun])damageGun=guns[0]?.id;const ammo=compatibleAmmo(damageGun);let body=`<label class="small">Compare gun<select class="inlinechoice" id="damage-gun" aria-label="Damage comparison gun">${guns.map(w=>`<option value="${esc(w.id)}" ${damageGun===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>`;if(v){body+=`<div class="sectionlabel">Health sections</div><div class="scrolltable"><table><thead><tr><th>Component</th><th>Max health</th></tr></thead><tbody>${v.componentHealth.map(c=>`<tr><td>${esc(c.attributeTag.replace('Attribute.Gameplay.Health.','').replace('Attribute.Gameplay.Health','Main body'))}</td><td class="num">${fmt(c.raw.MaxHealth)}</td></tr>`).join('')}</tbody></table></div><div class="sectionlabel">Armour and collision surfaces</div>${[...new Map(v.collisionMaterials.map(c=>[c.slotName+'|'+c.physicalMaterial,c])).values()].map(c=>`<details><summary>${esc(c.slotName)} · ${esc(c.profile?.raw.BallisticResponse?.split('::').slice(-1)[0]||'')}</summary>${kv('Thickness',c.profile?.raw.PlanarThickness)}${kv('Density',c.profile?.raw.Density)}${renderProjectileSurface(c)}${raw(c.profile?.raw||{},'Material properties')}${source(c.materialSource)}</details>`).join('')}`}else body+=kv('Covered hit regions',(a.raw.CoveredHitLocations||[]).map(t=>t.split('.').slice(-2).join(' ')).join(', '))+kv('Durability',a.raw.ReplicatedData?.Durability);if(a)body+=armorStages(a)+armorOperationTable(a,ammo);body+=`<div class="sectionlabel">Ammunition → target rules</div><div class="scrolltable"><table><thead><tr><th>Ammunition</th><th>Projectile base</th><th>Matching source rules</th></tr></thead><tbody>${ammo.map(b=>{const tags=[b.stats.DamageEntityData?.Tag?.TagName,...(b.stats.DamageEntityData?.Context||[])].filter(Boolean);const rules=allRules.filter(r=>(r.raw.SourceRequirements||[]).length&&(r.raw.SourceRequirements||[]).every(t=>tags.some(tag=>tagMatch(tag,t))));return `<tr><td>${esc(b.name)}</td><td class="num">${fmt(b.baseDamage)}</td><td>${rules.slice(0,8).map(r=>`${esc(r.raw.OutModification?.Operation?.split('::').slice(-1)[0]||r.kind)} ${fmt(r.raw.OutModification?.Amount)}`).join('<br>')||'—'}</td></tr>`}).join('')}</tbody></table></div>`;body+=raw(allRules,'All target damage rules')+raw(v||a,'Component routing and raw profiles')+(v?renderProjectileSettings():'');return body}

function renderBuilder(){return preservePickerState(renderBuilderContent)}

function renderBuilderContent(){let guns=U.carriedWeaponIds.map(id=>I.get(id));if(!carried.has(buildWeapon))buildWeapon=guns[0]?.id;startBuild(buildWeapon);const categories=['All',...U.weaponCategoryOrder.filter(c=>guns.some(i=>U.weaponCategories[i.id]===c))];$('#build-categories').innerHTML=categories.map(c=>`<button data-build-category="${esc(c)}" class="${buildCategory===c?'active':''}">${esc(c)}</button>`).join('');const query=$('#build-search').value.toLowerCase();guns=sortItems(guns.filter(i=>(buildCategory==='All'||U.weaponCategories[i.id]===buildCategory)&&(!query||[i.name,U.weaponCategories[i.id],...i.tags].join(' ').toLowerCase().includes(query))),$('#build-sort').value||'unlock');$('#build-weapon-cards').innerHTML=guns.map(i=>equipmentCard(i,buildWeapon,'build-weapon-card')).join('')||'<div class="empty">No carried weapons match.</div>';const ammo=compatibleAmmo(buildWeapon);if(!ammo.some(a=>a.id===buildAmmo))buildAmmo=ammo[0]?.id||null;$('#build-ammo-cards').innerHTML=sortItems(ammo.map(ammoCardItem),'unlock').map(a=>equipmentCard(a,buildAmmo,'build-ammo-card')).join('')||'<div class="empty">No compatible ammunition.</div>';const availableObjectives=objectives.filter(([id])=>id==='impactImpulse'?M.impulseChoices[buildWeapon]?.impactImpulseGroups?.length:U.presets.some(p=>p.weaponKey===buildWeapon&&p.objective===id&&!/^(missing_|no_)/.test(p.status||'')));$('#preset-buttons').innerHTML=availableObjectives.map(([id,label])=>`<button data-preset="${id}" class="${presetName===label?'active':''}">${label}</button>`).join('')+renderRecoilPreference();const w=M.weapons[buildWeapon];$('#build-name').textContent=w.name;$('#build-art').innerHTML=art(I.get(buildWeapon));$('#build-selectors').innerHTML=renderGunSelectors(buildWeapon,true);$('#preset-name').textContent=presetName;$('#build-slots').innerHTML=buildSelections.filter(optionalSelection).map(s=>`<div class="kv"><span>${esc(attachmentGroups[s.attachmentKey])}<br><b>${esc(weaponName(s.attachmentKey))}</b></span><button data-remove-slot="${esc(s.slotKey)}">${s.slotTag==='Item.Attachment.Magazine'?'Default':'Remove'}</button></div>`).join('')+raw(buildSelections.filter(s=>!optionalSelection(s)),'Fixed defaults and required provider parts');$('#build-attachments').innerHTML=renderAttachments(buildWeapon,true);renderBuildValues()}

// Retain page/picker position when replacing selected cards; navigation remains explicit.

function preservePickerState(render){

  if(typeof window==='undefined'||!document.querySelectorAll)return render();

  const x=window.scrollX,y=window.scrollY,focus=document.activeElement;

  const containers=[...document.querySelectorAll('#build-attachments .attachmenttiles,#detail .attachmenttiles')].map(el=>({id:el.closest('[id]').id,top:el.scrollTop,left:el.scrollLeft}));

  const fingerprint=focus?.dataset?JSON.stringify(focus.dataset):null,focusId=focus?.id;

  const result=render();

  for(const saved of containers){const el=document.getElementById(saved.id)?.querySelector('.attachmenttiles');if(el){el.scrollTop=saved.top;el.scrollLeft=saved.left}}

  const replacement=focusId?document.getElementById(focusId):fingerprint?[...document.querySelectorAll('button,select')].find(el=>JSON.stringify(el.dataset)===fingerprint):null;

  replacement?.focus({preventScroll:true});window.scrollTo(x,y);return result;

}

function selectionClosure(selections,weaponId){let reachable=new Set([weaponId]),result=[];for(let pass=0;pass<=selections.length;pass++){const next=selections.filter(s=>reachable.has(s.providerKey));if(next.length===result.length)break;result=next;reachable=new Set([weaponId,...result.map(s=>s.attachmentKey)])}return result}

function routeSelections(selections,route,weaponId){let result=selections.map(s=>({...s}));for(const entry of route.slotRoute||[]){const split=entry.lastIndexOf('>'),slot=entry.slice(0,split),id=entry.slice(split+1),edge=M.routes.find(r=>r.weaponKey===weaponId&&r.slotKey===slot&&r.attachmentKey===id);if(edge)result=[...result.filter(s=>s.slotKey!==edge.slotKey),{...edge}]}result=[...result.filter(s=>s.slotKey!==route.slotKey),{...route}];return selectionClosure(result,weaponId)}

function withoutGroup(selections,group,weaponId){return selectionClosure(selections.filter(s=>!optionalSelection(s)||attachmentGroups[s.attachmentKey]!==group),weaponId)}

function defaultAmmo(weaponId){const legal=new Set(compatibleAmmo(weaponId).map(a=>a.id)),providers=[M.weapons[weaponId],...U.defaultSelections[weaponId].map(s=>M.attachments[s.attachmentKey])];const ids=[...new Set(providers.flatMap(p=>(p?.slots||[]).flatMap(s=>(s.defaults||[]).map(d=>d.Item?.TagName?.toLowerCase())).filter(id=>legal.has(id))))];return ids.length===1?ids[0]:null}

function buildSnapshot(weaponId,selections,ammoId){

  const w=M.weapons[weaponId],ammo=M.ammo[ammoId],products={};

  for(const s of selections)for(const m of fixedModifiers(M.attachments[s.attachmentKey]?.modifiers||[])){const key=m.attribute.split('.').at(-1);products[key]=(products[key]??1)*m.rawScalar}

  const modified=key=>typeof w.attributes[key]==='number'?w.attributes[key]*(products[key]??1):null;

  const sight=selections.find(s=>optionalSelection(s)&&attachmentGroups[s.attachmentKey]==='Sight'),zoom=opticZoom(M.attachments[sight?.attachmentKey]?.data);

  const multiplier=tag=>ammo?.modifiers?.[0]?.multipliers.find(v=>v.Key.TagName===tag)?.Value;

  const impulse=ammo?.stats.DamageValues?.ImpulseValues;

  const values={VerticalRecoilMultiplier:modified('VerticalRecoilMultiplier'),HorizontalRecoilMultiplier:modified('HorizontalRecoilMultiplier'),AimTime:modified('AimTime'),SpreadMultiplier:modified('SpreadMultiplier'),EquipSpeedMultiplier:modified('EquipSpeedMultiplier'),zoomMax:zoom?.maximum??modified('AdsZoomMultiplier'),EffectiveRange:w.stats.EffectiveRange,InitialBulletSpeed:w.stats.InitialBulletSpeed,BaseDamage:ammo?.baseDamage,PenetrationExitSpeedMultiplier:ammo?.stats.PenetrationExitSpeedMultiplier,ammoRange:multiplier('Projectile.Attributes.EffectiveRangeMultiplier'),ammoPenetration:multiplier('Projectile.Attributes.PenetrationEffectivenessMultiplier'),ImpulseScale:impulse?.ImpulseScale,BaseSuppression:ammo?.stats.SuppressionData?.BaseSuppression};

  const recoilValues={HorizontalRecoilMultiplier:values.HorizontalRecoilMultiplier,VerticalRecoilMultiplier:values.VerticalRecoilMultiplier};
  const unresolved=[];for(const selection of selections){const mods=M.attachments[selection.attachmentKey]?.modifiers||[],known=fixedModifiers(mods);for(const mod of mods){const key=mod.attribute.split('.').at(-1);if(Object.hasOwn(recoilValues,key)&&unconditionalModifier(mod)&&(!known.includes(mod)||mod.rawScalar<=0))recoilValues[key]=null;if(Object.hasOwn(values,key)&&!known.includes(mod)){values[key]=null;unresolved.push({attachmentKey:selection.attachmentKey,key,operation:mod.operation,value:mod.rawScalar,source:mod.source,effectState:mod.effectState,filter:mod.filter})}}}
  const capacity=weaponCapacity(weaponId,selections);values.AmmoCapacity=capacity.value;values.ChamberCapacity=capacity.magazine?capacity.chamber?.value:null;values.MagazineWeight=capacity.magazineWeight;values.MagazineReloadPlayRate=capacity.magazineReloadPlayRate;values.MagazineSwayMultiplier=capacity.magazineSwayMultiplier;
  return {values,products,ammoId,unresolved,capacity,recoil:recoilEstimate(w.stats.RecoilPattern,recoilValues),impulseScope:JSON.stringify([impulse?.bApplyImpulse,impulse?.bVelocityChange])};

}

function magazineFacts(id){
  const part=M.attachments[id],fragments=part?.raw.fragments||[],weightFragment=fragments.find(f=>f.type==='BHInventoryFragment_Weight'),attachmentFragment=fragments.find(f=>f.type==='WDInventoryFragment_Attachment');
  const fieldSource=(fragment,field)=>fragment?.source?{...fragment.source,pointer:'/'+fragment.source.exportIndex+'/Properties/'+field}:null;
  const weight=weightFragment?.properties.Weight,reload=part?.data.ReloadAnimationPlayRate,sway=part?.modifiers.find(m=>m.effectState==='AppliedCharacterEffects'&&m.attribute.endsWith('.AimSwayScaleMultiplier'));
  return {weight:Number.isFinite(weight)?weight:null,weightSource:fieldSource(weightFragment,'Weight'),reloadPlayRate:Number.isFinite(reload)?reload:null,reloadSource:fieldSource(attachmentFragment,'AttachmentData/ReloadAnimationPlayRate'),swayMultiplier:Number.isFinite(sway?.rawScalar)?sway.rawScalar:null,swaySource:sway?.source};
}
function definitionDefaults(weaponId){return U.defaultSelections[weaponId]||(M.weapons[weaponId]?.slots||[]).flatMap(slot=>(slot.defaults||[]).flatMap(d=>{const id=d.Item?.TagName?.toLowerCase();return M.attachments[id]?[{attachmentKey:id,providerKey:weaponId,slotKey:slot.key,slotTag:slot.tag}]:[]}))}
function weaponCapacity(weaponId,selections=definitionDefaults(weaponId)){
  const chambers=(M.weapons[weaponId]?.slots||[]).filter(slot=>slot.tag==='Item.Attachment.Chamber'&&Number.isFinite(slot.capacity?.value)).map(slot=>({providerId:weaponId,slotKey:slot.key,...slot.capacity}));
  const magazines=selections.filter(s=>s.slotTag==='Item.Attachment.Magazine'),pools=magazines.flatMap(selection=>(M.attachments[selection.attachmentKey]?.slots||[]).filter(slot=>slot.tag==='Item.Ammo'&&Number.isFinite(slot.capacity?.value)).map(slot=>({providerId:selection.attachmentKey,slotKey:slot.key,...slot.capacity})));
  const magazine=pools.length===1?pools[0]:null,chamber=chambers.length===1?chambers[0]:null,isCharge=magazines.some(selection=>M.attachments[selection.attachmentKey]?.tags.includes('Item.Resource.Magazine.Battery')),rounds=isCharge?null:magazine?.value??chamber?.value??null;
  const part=magazines.length===1?M.attachments[magazines[0].attachmentKey]:null,facts=magazineFacts(part?.id);
  return {value:rounds,chargeCapacity:isCharge?magazine?.value??null:null,kind:magazine?'magazine':chamber?'chamber':null,magazine,chamber,chambers,pools,magazineId:part?.id||null,magazineWeight:facts.weight,magazineReloadPlayRate:facts.reloadPlayRate,magazineSwayMultiplier:facts.swayMultiplier,magazineFacts:facts,modifiers:part?.modifiers||[]};
}
function renderCapacity(weaponId){const capacity=weaponCapacity(weaponId);return statTiles([['Default ammo capacity',capacity.value],['Default charge capacity',capacity.chargeCapacity],['Default separate chamber capacity',capacity.magazine?capacity.chamber?.value:null]])+raw(capacity,'Magazine and chamber capacity sources')}
function renderRecoilPreference(){return `<label class="small">Recoil preference <select id="recoil-preference" aria-label="Recoil preference">${Object.entries({balanced:'Balanced',horizontal:'Horizontal',vertical:'Vertical'}).map(([key,label])=>`<option value="${key}" ${recoilPreference===key?'selected':''}>${label}</option>`).join('')}</select></label>`}
function renderRecoilSummary(stock,current){
  const preference={balanced:'Balanced',horizontal:'Horizontal',vertical:'Vertical'}[recoilPreference];
  const explanation=recoilPreference==='balanced'?'Lowest combined raw magnitude across both axes.':'Lowest '+recoilPreference+' raw magnitude; the other axis breaks ties.';
  if(!stock.recoil||!current.recoil)return `<div class="sectionlabel">Recoil estimate</div><p class="small muted">Recoil estimate unavailable for these stored inputs. Current parts stay selected.</p>`;
  const rows=[['Horizontal',stock.recoil.horizontal,current.recoil.horizontal],['Vertical',stock.recoil.vertical,current.recoil.vertical],['Combined',stock.recoil.combined,current.recoil.combined]];
  const aim=[stock.values.AimTime,current.values.AimTime],aimChange=aim.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0)?(aim[1]/aim[0]-1)*100:null;
  return `<div class="sectionlabel">Recoil estimate · ${esc(preference)}</div><p class="small muted">${explanation} Scope, magazine and ammo stay selected.</p><div class="scrolltable"><table class="recoil-estimate"><thead><tr><th>Axis</th><th>Stock</th><th>Build</th><th>Reduction</th></tr></thead><tbody>${rows.map(([label,left,right])=>`<tr><th scope="row">${label}</th><td class="num ${sameMetric(left,right)?'tiedvalue':left<right?'bestvalue':''}">${fmt(left)}</td><td class="num ${sameMetric(left,right)?'tiedvalue':right<left?'bestvalue':''}">${fmt(right)}</td><td class="num">${((1-right/left)*100).toLocaleString('en-US',{maximumFractionDigits:1})}%</td></tr>`).join('')}</tbody></table></div>${kv('ADS aim time · stock → current',fmt(aim[0])+' → '+fmt(aim[1])+(aimChange==null?'':' ('+fmt(Math.abs(aimChange))+'% '+(sameMetric(aimChange,0)?'change':aimChange>0?'slower':'faster')+')'))}<details><summary>How recoil scoring works</summary><p class="small muted">Raw RMS over ${current.recoil.points} stored points: H = √mean(X²) × horizontal multiplier; V = √mean(Y²) × vertical multiplier; combined = √(H² + V²). Stock uses default parts; current includes selected scope and magazine. Fixed unconditional effects only. Raw profile estimate, not a firing simulation.</p></details>`;
}
function renderBuildValues(){

  const w=M.weapons[buildWeapon],a=M.ammo[buildAmmo],stockAmmo=defaultAmmo(buildWeapon),stock=buildSnapshot(buildWeapon,U.defaultSelections[buildWeapon],stockAmmo),current=buildSnapshot(buildWeapon,buildSelections,buildAmmo),hasSight=buildSelections.some(s=>optionalSelection(s)&&attachmentGroups[s.attachmentKey]==='Sight'),noSight=hasSight?buildSnapshot(buildWeapon,withoutGroup(buildSelections,'Sight',buildWeapon),buildAmmo):null;

  const labels={AmmoCapacity:'Ammo capacity',ChamberCapacity:'Separate chamber capacity',MagazineWeight:'Magazine weight / stored',MagazineReloadPlayRate:'Magazine reload animation rate',MagazineSwayMultiplier:'Magazine sway multiplier / raw',VerticalRecoilMultiplier:'Vertical recoil multiplier',HorizontalRecoilMultiplier:'Horizontal recoil multiplier',AimTime:'Aim time / raw',SpreadMultiplier:'Spread multiplier',EquipSpeedMultiplier:'Equip speed multiplier',zoomMax:'Maximum optical zoom / raw',EffectiveRange:'Weapon effective range / raw',InitialBulletSpeed:'Initial bullet speed / raw',BaseDamage:'Projectile base damage',PenetrationExitSpeedMultiplier:'Penetration exit-speed multiplier',ammoRange:'Ammo range modifier / raw',ammoPenetration:'Ammo penetration effectiveness / raw',ImpulseScale:'Impact impulse / raw',BaseSuppression:'Base suppression'};

  const table=(left,right,leftLabel,rightLabel)=>`<div class="scrolltable"><table class="build-stat-table"><thead><tr><th>Metric</th><th>${esc(leftLabel)}</th><th>${esc(rightLabel)}</th><th>Delta</th></tr></thead><tbody>${Object.keys(labels).map(key=>{const rule=metricDefinition(key),values=[left.values[key],right.values[key]],wins=metricWinners(values,rule,key==='ImpulseScale'?[left.impulseScope,right.impulseScope]:[]),delta=wins.status!=='incomparable'&&values.every(v=>scalarMetric(v)!=null)?values[1]-values[0]:null;return `<tr><th scope="row" title="${esc(rule.note)}">${labels[key]}<small class="metric-result">${rule.direction==='low'?'Lower is better':rule.direction==='high'?'Higher is better':''}</small></th>${values.map((value,index)=>`<td class="${wins.indices.includes(index)?wins.status==='tie'?'tiedvalue':'bestvalue':''}">${esc(fmt(value))}${wins.indices.includes(index)?`<small class="metric-result">${wins.status==='tie'?'Tie':wins.status==='best-tie'?'Joint best':'Best'}</small>`:''}</td>`).join('')}<td>${delta==null?'—':(delta>0?'+':'')+fmt(delta)}</td></tr>`}).join('')}</tbody></table></div>`;

  $('#build-values').innerHTML=renderRecoilSummary(stock,current)+`<div class="sectionlabel">Stock versus current build</div><p class="small muted">Stock uses declared default parts. Stock ammo: ${esc(stockAmmo?weaponName(stockAmmo):'not uniquely stored')}. Current ammo: ${esc(weaponName(buildAmmo))}.</p>`+table(stock,current,'Stock','Current')+(noSight?`<div class="sectionlabel">Selected scope impact</div><p class="small muted">Same ammo and other attachments. Optical zoom and ballistic range remain separate.</p>`+table(noSight,current,'Without scope','With scope'):'')+(current.unresolved.length?`<details><summary>Equipped effects requiring other operation semantics (${current.unresolved.length})</summary>${current.unresolved.map(effect=>kv(weaponName(effect.attachmentKey)+' / '+effect.key+' / '+effect.operation.split('::').at(-1),effect.value)+source(effect.source)).join('')}</details>`:'')+(current.capacity.magazineId?`<div class="sectionlabel">Selected magazine effects</div>${modifierTable(current.capacity.modifiers)}${raw(current.capacity,'Magazine capacity, weight and effect sources')}`:'')+raw(current.products,'Unconditional attachment multiplier products')+raw(a?.stats||{},'Selected ammunition fields')+soundTable(w)+raw(w.audio,'Firing sound and attenuation profiles');

}

function soundTable(w){const sounds=w.audio.flatMap(a=>a.fireAssets||[]).filter(s=>s.contextTag.endsWith('.3p'));return sounds.length?`<div class="sectionlabel">Third-person firing sound</div><div class="scrolltable"><table><thead><tr><th>Profile</th><th>Volume</th><th>Max distance</th></tr></thead><tbody>${sounds.map(s=>`<tr><td>${s.contextTag.includes('Suppressed')?'Suppressed':'Standard'}</td><td class="num">${fmt(s.audio?.properties.Volume)}</td><td class="num">${fmt(s.audio?.properties.MaxDistance)}</td></tr>`).join('')}</tbody></table></div>`:''}

function pruneBuild(){buildSelections=selectionClosure(buildSelections,buildWeapon)}

function installAttachmentRoute(r){buildSelections=routeSelections(buildSelections,r,buildWeapon)}

function equip(weaponId,attachmentId,slotKey,location='builder'){if(!startBuild(weaponId))return;const r=M.routes.find(r=>r.weaponKey===weaponId&&r.attachmentKey===attachmentId&&r.slotKey===slotKey);if(!r||!optionalRouteKeys.has(weaponId+'|'+slotKey+'|'+attachmentId))return;const group=attachmentGroups[attachmentId];buildSelections=buildSelections.filter(s=>!optionalSelection(s)||attachmentGroups[s.attachmentKey]!==group);pruneBuild();installAttachmentRoute(r);presetName='Custom';if(location==='detail'){detailTab='attachments';renderDetail()}else renderBuilder()}

function optimizeGroups(groups,keys){

  // Current selection first keeps neutral parts and exact ties stable.

  const original=buildSelections;let best=buildSelections,score=buildSnapshot(buildWeapon,best,buildAmmo).values;const changes=selections=>groups.reduce((count,group)=>count+(original.find(s=>optionalSelection(s)&&attachmentGroups[s.attachmentKey]===group)?.attachmentKey!==selections.find(s=>optionalSelection(s)&&attachmentGroups[s.attachmentKey]===group)?.attachmentKey),0);

  const better=values=>{for(const key of keys){if(scalarMetric(values[key])==null||scalarMetric(score[key])==null)return false;if(sameMetric(values[key],score[key]))continue;return metricDefinition(key).direction==='low'?values[key]<score[key]:values[key]>score[key]}return false};

  const visit=(index,selections)=>{if(index===groups.length){const values=buildSnapshot(buildWeapon,selections,buildAmmo).values;if(better(values)||(keys.every(key=>scalarMetric(values[key])!=null&&scalarMetric(score[key])!=null&&sameMetric(values[key],score[key]))&&changes(selections)<changes(best))){best=selections;score=values}return}const group=groups[index],base=withoutGroup(selections,group,buildWeapon);if(group!=='Magazine'||!optionalRoutes(buildWeapon).some(r=>attachmentGroups[r.attachmentKey]==='Magazine'))visit(index+1,base);for(const r of optionalRoutes(buildWeapon).filter(r=>attachmentGroups[r.attachmentKey]===group))visit(index+1,routeSelections(base,r,buildWeapon))};

  visit(0,buildSelections);buildSelections=best;

}

function optimizeRecoil(){
  const original=buildSelections,groups=['Underbarrel','Muzzle'],same=(a,b)=>a.slotKey===b.slotKey&&a.attachmentKey===b.attachmentKey&&a.providerKey===b.providerKey&&a.slotTag===b.slotTag;
  const locked=original.filter(s=>attachmentGroups[s.attachmentKey]==='Sight'||s.slotTag==='Item.Attachment.Magazine');
  for(let index=0;index<locked.length;index++)for(const provider of original.filter(s=>s.attachmentKey===locked[index].providerKey))if(!locked.includes(provider))locked.push(provider);
  let best=original,score=recoilScores(buildSnapshot(buildWeapon,original,buildAmmo).recoil,recoilPreference);if(!score)return false;
  const changes=selections=>original.filter(s=>!selections.some(t=>same(s,t))).length+selections.filter(s=>!original.some(t=>same(s,t))).length;
  const visit=(index,selections)=>{
    if(index===groups.length){
      if(!locked.every(s=>selections.some(t=>same(s,t)))||groups.some(group=>selections.filter(s=>optionalSelection(s)&&attachmentGroups[s.attachmentKey]===group).length>1))return;
      const next=recoilScores(buildSnapshot(buildWeapon,selections,buildAmmo).recoil,recoilPreference);if(!next)return;
      const first=next.findIndex((value,i)=>!sameMetric(value,score[i]));
      if(first>=0?next[first]<score[first]:changes(selections)<changes(best)){best=selections;score=next}return;
    }
    const routes=optionalRoutes(buildWeapon).filter(r=>attachmentGroups[r.attachmentKey]===groups[index]);if(!routes.length){visit(index+1,selections);return}
    const base=withoutGroup(selections,groups[index],buildWeapon);visit(index+1,base);for(const route of routes)visit(index+1,routeSelections(base,route,buildWeapon));
  };
  visit(0,original);buildSelections=best;return true;
}

function applyPreset(objective){

  const p=U.presets.find(p=>p.weaponKey===buildWeapon&&p.objective===objective);

  if(objective==='bestRecoil'){if(!optimizeRecoil()){toast('No comparable recoil pattern. Current parts kept.');return}}

  else if(objective==='fastestAim')optimizeGroups(['Sight','Underbarrel','Muzzle','Magazine'],['AimTime']);

  else if(objective==='range'){optimizeGroups(['Sight'],['zoomMax']);if(p?.ammoKey&&!p.ties?.includes(buildAmmo))buildAmmo=p.ammoKey}

  else if(objective==='impactImpulse'){const groups=M.impulseChoices[buildWeapon]?.impactImpulseGroups||[],group=groups.find(g=>g.candidateAmmoKeys?.includes(buildAmmo))||groups[0],choices=group?.winners||[];if(!choices.length){toast('No comparable impact impulse field for this weapon.');return}if(!choices.some(c=>c.profile.ammoKey===buildAmmo))buildAmmo=choices[0].profile.ammoKey}

  else if(objective==='sniperSound'){const isSuppressor=s=>M.attachments[s.attachmentKey]?.data?.FireAudioContextTag?.TagName?.includes('Suppress')||(p?.ties||[]).includes(s.attachmentKey);const routes=optionalRoutes(buildWeapon).filter(r=>attachmentGroups[r.attachmentKey]==='Muzzle');if(!buildSelections.some(isSuppressor)){const candidate=(p?.selections||[]).find(s=>routes.some(r=>r.attachmentKey===s.attachmentKey));const route=routes.find(r=>r.attachmentKey===candidate?.attachmentKey);if(route)buildSelections=routeSelections(withoutGroup(buildSelections,'Muzzle',buildWeapon),route,buildWeapon)}}

  else if(p?.ammoKey){const tied=(p.ties||[]).map(t=>typeof t==='string'?t:t.ammoKey);if(!tied.includes(buildAmmo))buildAmmo=p.ammoKey}

  else{toast('Preset source not found.');return}

  presetName=objectives.find(o=>o[0]===objective)?.[1]||objective;pruneBuild();renderBuilder();

}

function unlockBuyPrice(u){const all=u.purchasePrices||[],active=all.filter(p=>p.visible&&!p.previewOnly),offers=active.length?active:all;const prices=[...new Set(offers.filter(p=>typeof p.price==='number').map(p=>cash(p.price)+(p.amount>1?' / '+fmt(p.amount)+(p.unit?' '+p.unit:''):'')))];return prices.length?prices.join(' · '):cash(u.price)}

function renderProgression(){$('#roles').innerHTML=M.roles.map(r=>`<button data-role="${r}" class="${role===r?'active':''}">${r} <span class="small">${M.unlocks.filter(u=>u.role===r).length}</span></button>`).join('');const list=M.unlocks.filter(u=>u.role===role).sort((a,b)=>(a.level-b.level)||(a.fee??0)-(b.fee??0));$('#role-title').textContent=role+' unlocks';$('#unlock-count').textContent=M.unlocks.length+' TOTAL UNLOCK RECORDS';$('#role-caption').textContent=role==='Wardog'?'Career level combines all role levels':'';$('#unlock-rows').innerHTML=list.map(u=>`<tr class="clickrow" data-unlock-item="${esc(u.itemId)}"><td class="num">${fmt(u.level)}</td><td>${esc(u.name)}</td><td class="num">${cash(u.fee)}</td><td class="num">${esc(unlockBuyPrice(u))}${u.purchasePrices?.length&&u.purchasePrices.every(p=>p.previewOnly)?'<br><span class="small muted">Preview offer</span>':''}</td><td>${(u.roleRequirements||[]).map(r=>`${esc(r.role?.split('.').slice(-1)[0])} ${fmt(r.level)}`).join(' / ')}</td></tr>`).join('');const mastery=M.mastery.find(m=>(m.row?.split('.').slice(-1)[0]===(role==='Assault'?'Infantry':role)));$('#xp-summary').innerHTML=mastery?`<div class="scrolltable"><table><thead><tr><th>Level</th><th>Stored XP</th></tr></thead><tbody>${mastery.levels.map(l=>`<tr><td>${fmt(l.Level)}</td><td class="num">${fmt(l.XP)}</td></tr>`).join('')}</tbody></table></div>`:'Career level combines the six role levels.'}

function calculateDelivery(streak,zone){const step=Math.min(10,Math.max(0,Math.floor(streak)-1));return {cash:(625+step*125)*zone,xp:zone>0?500+step*50:0}}

function renderDelivery(){const s=Math.max(1,Number($('#delivery-streak').value)||1),zone=Number($('#delivery-zone').value);const v=calculateDelivery(s,zone);$('#delivery-cash').textContent=cash(v.cash);$('#delivery-xp').textContent=fmt(v.xp);$('#delivery-formula').textContent='Cash: (625 + clamp(streak − 1, 0, 10) × 125) × zone modifier. Driver XP: 500 + clamp(streak − 1, 0, 10) × 50.'}

function renderEconomy(){renderDelivery();$('#opportunities').innerHTML=M.economy.map(o=>`<article class="opportunity"><h3>${esc(o.title||o.name||o.id)}</h3>${o.summary?`<p>${esc(o.summary)}</p>`:''}${(o.steps||[]).map((t,n)=>`<p>${n+1}. ${esc(t)}</p>`).join('')}${(o.examples||[]).map(e=>`<div class="kv"><span>${esc(e.scenario)}</span><b>${e.cash!=null?cash(e.cash):''}${e.roleXP!=null?' / '+fmt(e.roleXP)+' XP':''}</b></div>`).join('')}${o.conditions?.length?`<details><summary>Reward conditions</summary>${o.conditions.map(c=>`<p>${esc(c)}</p>`).join('')}</details>`:''}${(o.formulaNotes||[]).map(t=>`<p>${esc(t)}</p>`).join('')}${raw(o,'Full mechanic and sources')}</article>`).join('');$('#reward-rows').innerHTML=M.rewards.map(r=>`<tr><td>${esc(r.rawId)}</td><td>${raw(r.resourceCalculations,'Resource expressions')}</td></tr>`).join('')}

function renderOverview(){const c=M.coverage;$('#overview-metrics').innerHTML=[['Shop items',C.filter(uiShopVisible).length],['Attachment routes',M.routes.length],['Vehicle components',c.damage.vehicleComponentHealthRecords],['Unlock nodes',M.unlocks.length]].map(([k,v])=>`<div class="metric"><span class="eyebrow">${k}</span><b>${fmt(v)}</b></div>`).join('');$('#connection-tree').innerHTML=[['Item identity','Vendor variants, in-game names, price, icon and role unlock.'],['Weapon → attachment','Root slots, barrels, handguards, rails, exclusions and raw modifier winners.'],['Gun → ammunition','Magazine/chamber filters, calibre, AP/HP type and projectile definitions.'],['Projectile → armour','Base damage, penetration, target rules and personal armour coverage.'],['Vehicle → component','Health sections, collision surfaces, physical materials and routed damage.'],['Action → reward','Selectors, streaks, crew splits, payouts and class progression.']].map(([h,p])=>`<div class="treebox"><h3>${h}</h3><p>${p}</p></div>`).join('');$('#coverage-values').innerHTML=kv('Weapon definitions',c.weapons.weapons)+kv('Attachment definitions',c.weapons.attachments)+kv('Ammunition definitions',c.weapons.ammoDefinitions)+kv('Exact weapon-stat links',c.weapons.resolvedWeaponStatsReferences)+kv('Damage connections',c.damage.damageConnections)+kv('Vehicle variants',c.damage.vehicleVariants)+kv('Real game icons',c.icons)+kv('Reward definitions',M.rewards.length);$('#work-queue').innerHTML=PUBLIC_ROADMAP.map(t=>`<div class="todo ${t.status==='done'?'done':''}"><span class="status">${esc(t.status)}</span><span>${esc(t.label)}</span></div>`).join('')}

function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3500)}

function download(value,name){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

document.addEventListener('click',e=>{const link=e.target.closest('[data-projectile-source]');if(!link)return;e.preventDefault();const field=document.getElementById('projectile-source-'+link.dataset.projectileSource);if(!field)return;for(let parent=field;parent&&parent.id!=='detail';parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field.scrollIntoView({block:'nearest'})});

document.addEventListener('change',e=>{if(e.target.id==='recoil-preference'&&['balanced','horizontal','vertical'].includes(e.target.value)){recoilPreference=e.target.value;applyPreset('bestRecoil')}});

document.addEventListener('click',e=>{const b=e.target.closest('button,[data-unlock-item]');if(!b)return;if(b.dataset.view)setView(b.dataset.view);if(b.dataset.subcategory){subcategory=b.dataset.subcategory;renderCatalogue()}if(b.dataset.item){selected=b.dataset.item;detailTab='stats';component=null;renderCatalogue();if(matchMedia('(max-width:950px)').matches)$('#detail').scrollIntoView({block:'start'})}if(b.dataset.tab){detailTab=b.dataset.tab;renderDetail()}if(b.dataset.build){startBuild(b.dataset.build);setView('builder')}if(b.dataset.equip)equip(b.dataset.weapon,b.dataset.equip,b.dataset.route,b.dataset.equipLocation);if(b.dataset.attachmentGroup){startBuild(b.dataset.selectorWeapon);attachmentGroup=b.dataset.attachmentGroup;attachmentSort='unlock';if(b.dataset.selectorLocation==='builder')renderBuilder();else{detailTab='attachments';renderDetail()}}if(b.dataset.buildCategory){buildCategory=b.dataset.buildCategory;renderBuilder()}if(b.dataset.buildWeaponCard){startBuild(b.dataset.buildWeaponCard);renderBuilder()}if(b.dataset.buildAmmoCard){if(compatibleAmmo(buildWeapon).some(a=>a.id===b.dataset.buildAmmoCard)){buildAmmo=b.dataset.buildAmmoCard;presetName='Custom';renderBuilder()}}if(b.dataset.preset)applyPreset(b.dataset.preset);if(b.dataset.role){role=b.dataset.role;renderProgression()}if(b.dataset.inspectAttachment){const a=I.get(b.dataset.inspectAttachment);if(a){if(!a.visible)$('#availability').value='all';setView(uiCategory(a));subcategory=uiGroup(a);selected=a.id;renderCatalogue()}}if(b.dataset.removeSlot){const removed=buildSelections.find(s=>s.slotKey===b.dataset.removeSlot);buildSelections=buildSelections.filter(s=>s.slotKey!==b.dataset.removeSlot);if(removed?.slotTag==='Item.Attachment.Magazine'){const original=U.defaultSelections[buildWeapon].find(s=>s.slotKey===removed.slotKey);if(original)buildSelections.push({...original})}pruneBuild();presetName='Custom';renderBuilder()}if(b.dataset.unlockItem){const i=I.get(b.dataset.unlockItem);if(i){if(!i.visible)$('#availability').value='all';selected=i.id;setView(i.category)}}if(b.id==='reset-build'){buildInitialized=false;startBuild(buildWeapon,false);renderBuilder()}if(b.id==='download-model')download(M,'wardogs-linked-index.json')});

$('#search').addEventListener('input',renderCatalogue);$('#sort').addEventListener('change',renderCatalogue);$('#availability').addEventListener('change',renderCatalogue);$('#build-search').addEventListener('input',renderBuilder);$('#build-sort').addEventListener('change',renderBuilder);document.addEventListener('change',e=>{if(e.target.matches('[data-attachment-sort]')){attachmentSort=e.target.value;if(view==='builder')renderBuilder();else renderDetail()}});document.addEventListener('change',e=>{if(e.target.id==='damage-gun'){damageGun=e.target.value;renderDetail()}});$('#delivery-streak').addEventListener('input',renderDelivery);$('#delivery-zone').addEventListener('change',renderDelivery);$('#top-count').textContent=M.items.length+' EQUIPMENT RECORDS';setView('overview');
