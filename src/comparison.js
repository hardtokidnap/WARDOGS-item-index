const compareSelections=Object.fromEntries(Object.keys(labels).map(k=>[k,[]]));

let comparisonCategory='weapons',comparisonCurve=null;

const comparisonColours=['#efbc54','#8dc9de','#b2cf89','#d69cce'];



function compareValue(value){

  if(Array.isArray(value))return [...new Set(value.filter(v=>v!=null).map(fmt))].join(' / ')||'—';

  return typeof value==='object'&&value!==null?JSON.stringify(value):fmt(value);

}



function comparisonFields(item){

  const fields=new Map();

  const add=(key,label,value,group='Equipment',direction=null,scope='raw',format=null)=>{

    const rule=metricDefinition(key.startsWith('component.')?'MaxHealth':key);

    if(value!=null&&!(Array.isArray(value)&&!value.length))fields.set(key,{key,label,value,group,direction:direction===false?null:direction??rule.direction,scope,format,note:rule.note});

  };

  const human=s=>s.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^b /,'');

  const tree=(obj,prefix,group,depth=0)=>{

    if(!obj||depth>3)return;

    for(const [key,value] of Object.entries(obj)){

      if(/Curve|Tag|Context|Source|Object|Asset|Name/.test(key)||Array.isArray(value))continue;

      const path=prefix?prefix+'.'+key:key;

      if(typeof value==='number'||typeof value==='boolean')add(path,human(path.split('.').slice(1).join(' / ')),value,group);

      else if(value&&typeof value==='object')tree(value,path,group,depth+1);

    }

  };

  const offers=activeOffers(item),packs=[...new Set(offers.map(o=>`${o.price}|${o.amount}`))];

  if(packs.length===1&&typeof offers[0].price==='number'&&Number.isFinite(offers[0].amount)&&offers[0].amount>0)add('price','Buy price / pack',offers[0].price,'Purchase',null,`${item.currency||'Attribute.Meta.Currency.Cash'}|${offers[0].amount}`,'price');

  else if(!offers.length&&item.currency==='Attribute.Meta.Currency.GoldBars'&&typeof item.price==='number')add('price','Collection price',item.price,'Purchase',null,item.currency+'|1','price');

  else add('price','Buy price / pack',purchaseLabel(item),'Purchase',false);

  add('unlock','Unlock',unlockText(item),'Purchase');

  add('fees','Unlock fee',item.unlocks.map(u=>`${u.role} ${cash(u.fee)}`),'Purchase');

  add('catalogue','Catalogue',item.visible?'Shop entry':'Extracted definition','Purchase');

  add('teams','Team access',item.team.map(t=>t==='all'?'All teams':t),'Purchase');

  const w=M.weapons[item.id],attachment=M.attachments[item.id],ammo=M.ammo[item.id];

  if(w){

    add('rpm','Fire rate / RPM',w.stats.RoundsPerMinute,'Weapon','high');

    add('aim','Aim time / raw',w.attributes.AimTime,'Weapon','low');

    add('range','Effective range / raw',w.stats.EffectiveRange,'Weapon','high');

    add('speed','Initial bullet speed / raw',w.stats.InitialBulletSpeed,'Weapon','high');

    add('accuracy','Accuracy value',w.stats.WeaponAccuracy?.AccuracyValue,'Weapon','high');

    add('attachments','Compatible attachments',new Set(M.routes.filter(r=>r.weaponKey===item.id).map(r=>r.attachmentKey)).size,'Weapon');

    add('projectileDamage','Projectile base damage',compatibleAmmo(item.id).map(a=>a.baseDamage),'Ammunition');

    for(const [key,value] of Object.entries(w.attributes))if(!['AimTime'].includes(key))add('attribute.'+key,human(key),value,'Attributes');

    const skip=new Set(['RoundsPerMinute','EffectiveRange','InitialBulletSpeed','WeaponAccuracy']);

    tree(Object.fromEntries(Object.entries(w.stats).filter(([k])=>!skip.has(k))),'stat','Weapon fields');

  }

  if(attachment){

    const zoom=opticZoom(attachment.data);

    if(zoom){add('zoomMin','Optical zoom minimum / raw',zoom.minimum,'Optics');add('zoomMax','Optical zoom maximum / raw',zoom.maximum,'Optics');}

    const products={};

    for(const m of fixedModifiers(attachment.modifiers))products[m.attribute]=(products[m.attribute]??1)*m.rawScalar;

    for(const [key,value] of Object.entries(products))add('modifier.'+key,human(key.split('.').at(-1))+' ×',value,'Attachment modifiers');

  }

  if(w){for(const key of ['attribute.VerticalRecoilMultiplier','attribute.HorizontalRecoilMultiplier'])if(fields.has(key))fields.get(key).scope=JSON.stringify([w.stats.RecoilPattern,w.stats.RecoilPatternYawMinMax,w.stats.RecoilPatternPitchMax,w.stats.PostPatternRandomYawRecoil,w.stats.PostPatternRandomPitchRecoil]);if(fields.has('attribute.SpreadMultiplier'))fields.get('attribute.SpreadMultiplier').scope=JSON.stringify(w.stats.WeaponAccuracy);}
  if(ammo){tree(ammo.stats,'projectile','Projectile');const impulse=fields.get('projectile.DamageValues.ImpulseValues.ImpulseScale');if(impulse)impulse.scope=JSON.stringify([ammo.stats.DamageValues?.ImpulseValues?.bApplyImpulse,ammo.stats.DamageValues?.ImpulseValues?.bVelocityChange]);}

  const u=M.utility.items[item.id];

  if(u){

    const wanted=new Set(['Weight','Durability','AttributeValue','BaseFuseTime','BaseDamage','ExplosiveRadius','EffectiveExplosiveRadius','MinimumExplosiveDamage','MaxStackSize','MaxListSize']);

    for(const f of u.fields)if(wanted.has(f.name))add('utility.'+f.name,f.label,f.value,'Item fields');

    for(const f of u.smokeSummary?.fields||[])if(['Diameter','Total Duration','Fade In Time','Fade Out Time'].includes(f.name))add('smoke.'+f.name,'Smoke '+f.label.toLowerCase(),f.value,'Smoke');

  }

  if(item.armor){

    add('armor.durability','Durability',item.armor.raw.ReplicatedData?.Durability,'Armour');

    add('armor.coverage','Covered regions',(item.armor.raw.CoveredHitLocations||[]).map(s=>s.split('.').slice(-2).join(' ')),'Armour');

    for(const [index,stage] of (item.armor.raw.DurabilityStagesSetupData||[]).entries())for(const [key,value] of Object.entries(stage))add('armor.stage.'+index+'.'+key,`Stage ${index+1} / ${human(key)}`,value,'Armour stages');

  }

  if(item.vehicle){

    add('vehicle.health','Vehicle health',item.vehicle.healthProfiles?.[0]?.raw.InitialVehicleHealth,'Vehicle');

    const health=new Map();

    for(const c of item.vehicle.componentHealth){const tag=c.attributeTag;health.set(tag,[...(health.get(tag)||[]),c.raw.MaxHealth])}

    for(const [tag,values] of health)add('component.'+tag,human(tag.replace('Attribute.Gameplay.Health.','').replace('Attribute.Gameplay.Health','Main body')),values,'Component max health');

  }

  for(const m of M.armorEffects?.[item.id]?.modifiers||[]){

    const condition=gearConditions(m.effectConditions),operation=m.operation.split('::').at(-1);

    add('gear.'+m.attribute+'|'+operation+'|'+condition,gearAttributeLabel(m.attribute)+' / '+operation,fmt(m.value)+(condition?' / '+condition:''),'Equipped effects');

  }

  for(const ref of M.armorEffects?.[item.id]?.appliedEffects||[]){

    const effect=M.armorEffectDefinitions[ref.effectId],condition=gearConditions(effect.conditions);

    for(const tag of effect.grantedTags||[])add('state.'+tag,gearTagLabel(tag),'Granted'+(condition?' / '+condition:''),'Equipment states');

  }

  const aliases={fire_rate_rpm:'rpm',initial_bullet_speed:'speed',effective_range:'range',accuracy_value:'accuracy',inventory_weight:'utility.Weight',recoil_reset_time:'stat.RecoilPatternResetTime',melee_damage:'stat.MeleeDamage','Attribute.Gameplay.Weapon.AimTime':'aim'};

  for(const f of M.comparisonEntities?.[item.id]?.fields||[]){

    const key=aliases[f.metricId]||(f.metricId.startsWith('Attribute.')?'attribute.'+f.metricId.split('.').at(-1):'source.'+f.metricId);

    if(!fields.has(key))add(key,f.label,f.value,'Source fields');

  }

  return fields;

}



function addComparison(id){

  const item=I.get(id);if(!item)return;

  comparisonCategory=item.category;

  const ids=compareSelections[comparisonCategory];

  if(!ids.includes(id)){if(ids.length===4){toast('Compare up to four items. Remove one first.');return}ids.push(id)}

  setView('comparison');

}



function renderComparison(){

  const ids=compareSelections[comparisonCategory],items=ids.map(id=>I.get(id)).filter(Boolean);

  $('#compare-category').innerHTML=Object.entries(labels).map(([id,label])=>`<option value="${esc(id)}" ${id===comparisonCategory?'selected':''}>${esc(label)}</option>`).join('');

  const options=C.filter(i=>i.category===comparisonCategory&&!ids.includes(i.id)).sort((a,b)=>a.name.localeCompare(b.name));

  $('#compare-item').innerHTML=options.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}${i.visible?'':' / extracted'}</option>`).join('');

  $('#compare-add').disabled=ids.length>=4||!options.length;

  $('#compare-count').textContent=items.length+' / 4 ITEMS';

  if(!items.length){$('#compare-table').innerHTML='<div class="empty">Add up to four items to compare raw fields.</div>';$('#compare-curve-panel').hidden=true;return}

  const maps=items.map(comparisonFields),keys=[...new Set(maps.flatMap(m=>[...m.keys()]))];

  let group=null;

  const rows=keys.map(key=>{

    const field=maps.find(m=>m.has(key)).get(key),values=maps.map(m=>m.get(key)?.value);

    const winners=metricWinners(values,field,maps.map(m=>m.get(key)?.scope));

    const section=group!==field.group?`<tr class="comparison-group"><th colspan="${items.length+1}">${esc(field.group)}</th></tr>`:'';group=field.group;

    return section+`<tr><th scope="row" title="${esc(field.note)}">${esc(field.label)}${winners.status==='incomparable'?'<div class="small muted">Different profiles / contexts</div>':field.direction?`<div class="small muted">${field.direction==='low'?'Lower':'Higher'} is better</div>`:''}</th>${values.map((value,index)=>{const win=winners.indices.includes(index),marker=winners.status==='tie'?'Tie':winners.status==='best-tie'?'Joint best':'Best';return `<td class="${win?(winners.status==='tie'?'tiedvalue':'bestvalue'):''}">${esc(field.format==='price'&&typeof value==='number'?itemCash(items[index],value):compareValue(value))}${win?`<small class="metric-result">${marker}</small>`:''}</td>`}).join('')}</tr>`;

  }).join('');

  $('#compare-table').innerHTML=`<table class="comparison-table"><thead><tr><th scope="col">Raw field</th>${items.map((i,n)=>`<th scope="col"><div class="compare-art">${art(i)}</div><b style="color:${comparisonColours[n]}">${esc(i.name)}</b><button data-compare-remove="${esc(i.id)}" aria-label="Remove ${esc(i.name)} from comparison">Remove</button></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="content">${raw(items.map(i=>({id:i.id,name:i.name,fields:M.comparisonEntities?.[i.id]?.fields||[],vendorSources:i.sources})),'Comparison values and sources')}</div>`;

  renderComparisonCurves(items);

}



function curveMetric(c){

  const base=c.metricPath||c.path||c.label;

  const component=c.source?.pointer?.match(/\/FloatCurves(?:\[(\d+)\])?$/);

  return component?base+' / component '+(component[1]||'0'):base;

}



function renderComparisonCurves(items){

  const curveItems=items.flatMap(i=>(M.weaponCurves?.[i.id]?.curves||[]).map(c=>({item:i,curve:c})));

  const metrics=[...new Set(curveItems.map(c=>curveMetric(c.curve)))];

  $('#compare-curve-panel').hidden=!metrics.length;

  if(!metrics.length)return;

  if(!metrics.includes(comparisonCurve))comparisonCurve=metrics.find(m=>/Distance.*Damage.*Falloff/.test(m))||metrics[0];

  $('#compare-curve').innerHTML=metrics.map(m=>`<option value="${esc(m)}" ${m===comparisonCurve?'selected':''}>${esc(m)}</option>`).join('');

  // shortcut: plot exact stored points until each source interpolation contract is supported.

  const series=items.map((item,n)=>({item,colour:comparisonColours[n],curves:(M.weaponCurves?.[item.id]?.curves||[]).filter(c=>curveMetric(c)===comparisonCurve)}));

  const points=c=>(c.keys||c.points||[]).map(k=>({x:k.Time??k.X,y:k.Value??k.Y})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));

  const all=series.flatMap(s=>s.curves.flatMap(points));

  if(!all.length){$('#compare-plot').innerHTML='<div class="empty">No numeric keys for this curve.</div>';return}

  const xmin=Math.min(...all.map(p=>p.x)),xmax=Math.max(...all.map(p=>p.x)),ymin=Math.min(...all.map(p=>p.y)),ymax=Math.max(...all.map(p=>p.y));

  const x=v=>60+(v-xmin)/(xmax-xmin||1)*680,y=v=>265-(v-ymin)/(ymax-ymin||1)*215;

  const axes=series.flatMap(s=>s.curves)[0]?.axes||{};

  let svg=`<svg viewBox="0 0 800 315" role="img" aria-label="${esc(comparisonCurve)} stored curve points; ${esc(axes.x||'Stored input')} ${fmt(xmin)} to ${fmt(xmax)}; ${esc(axes.y||'Stored value')} ${fmt(ymin)} to ${fmt(ymax)}"><path d="M60 35V265H750" fill="none" stroke="#737964"/><text x="60" y="285">${esc(fmt(xmin))}</text><text x="740" y="285" text-anchor="end">${esc(fmt(xmax))}</text><text x="48" y="50" text-anchor="end">${esc(fmt(ymax))}</text><text x="48" y="265" text-anchor="end">${esc(fmt(ymin))}</text><text x="400" y="310" text-anchor="middle">${esc(axes.x||'Stored input')}</text><text x="65" y="20">${esc(axes.y||'Stored value')}</text>`;

  for(const s of series)for(const c of s.curves)for(const [index,p] of points(c).entries())svg+=`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="4.5" fill="${s.colour}" fill-opacity=".7"><title>${esc(s.item.name)} · ${esc(c.label||comparisonCurve)} · key ${index}: ${fmt(p.x)}, ${fmt(p.y)}</title></circle>`;

  svg+='</svg>';

  $('#compare-plot').innerHTML=svg+`<div class="plotlegend">${series.filter(s=>s.curves.length).map(s=>`<span style="color:${s.colour}">${esc(s.item.name)}</span>`).join('')}</div>`+raw(series.map(s=>({item:s.item.name,curves:s.curves})),'Curve keys, interpolation and sources');

}



document.addEventListener('click',e=>{

  const b=e.target.closest('button');if(!b)return;

  if(b.dataset.compareItem)addComparison(b.dataset.compareItem);

  if(b.dataset.compareRemove){compareSelections[comparisonCategory]=compareSelections[comparisonCategory].filter(id=>id!==b.dataset.compareRemove);renderComparison()}

  if(b.id==='compare-add')addComparison($('#compare-item').value);

  if(b.id==='compare-clear'){compareSelections[comparisonCategory]=[];renderComparison()}

});

$('#compare-category').addEventListener('change',()=>{comparisonCategory=$('#compare-category').value;renderComparison()});

$('#compare-curve').addEventListener('change',()=>{comparisonCurve=$('#compare-curve').value;renderComparisonCurves(compareSelections[comparisonCategory].map(id=>I.get(id)))});
