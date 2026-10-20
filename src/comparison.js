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
    const capacity=weaponCapacity(item.id);add('AmmoCapacity','Ammo capacity',capacity.value,'Weapon');add('ChamberCapacity','Separate chamber capacity',capacity.magazine?capacity.chamber?.value:null,'Weapon');
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
    if(isMagazine(item.id)){add('AmmoCapacity','Ammo capacity',attachment.slots.find(slot=>slot.tag==='Item.Ammo')?.capacity?.value,'Magazine');const facts=magazineFacts(item.id);add('MagazineWeight','Magazine weight / stored',facts.weight,'Magazine');add('MagazineReloadPlayRate','Reload animation rate',facts.reloadPlayRate,'Magazine');}

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



function curveDescriptor(c){
  const pointer=c.edgeSource?.pointer||c.source?.pointer||c.comparisonGroup||'';
  const binding=pointer.replace(/^\/(?:\d+\/)?Properties\/(?:WeaponStats\/)?/,'').replace(/\/(?:ExternalCurve|EditorCurveData)$/,'');
  const component=c.source?.pointer?.match(/\/FloatCurves(?:\[(\d+)\])?$/)?.[1]??(c.source?.pointer?.endsWith('/FloatCurves')?'0':null);
  const label=c.label||'Stored curve',context=c.context?.rowName||'';
  return {id:JSON.stringify([c.type,label,binding,component,context,c.axes||{},c.units||{}]),label:label+(component==null?'':' / component '+component),binding,component};
}
function curveMetric(c){return curveDescriptor(c).id}
function curvePoints(c){return (Array.isArray(c.keys)?c.keys:[]).map((key,index)=>({x:c.type==='ordered_xy'?key?.X:key?.Time,y:c.type==='ordered_xy'?key?.Y:key?.Value,index,key}))}
function curveNumber(value,compact=false){if(value==null)return 'Not stored';if(typeof value!=='number'||!Number.isFinite(value)||!compact)return String(value);const magnitude=Math.abs(value);return magnitude&& (magnitude<.001||magnitude>=100000)?value.toExponential(3).replace(/\.?0+e/,'e'):Number(value.toPrecision(4)).toString()}
const curveMode=value=>typeof value==='string'?value.split('::').at(-1):null;
function curvePolicy(c){
  const points=curvePoints(c);
  if(!points.length)return {kind:'table',reason:'No stored keys'};
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return {kind:'table',reason:'All keys shown, including missing or nonfinite coordinates'};
  if(points.length===1)return {kind:'table',reason:'Single stored key'};
  if(c.type==='ordered_xy')return {kind:'pattern',reason:'Serialized point order; equal X/Y scale; no accumulation'};
  if(c.type==='curve_table_row')return {kind:'table',reason:'Shared spread/scalable row; input domain is not specified'};
  if(curveDescriptor(c).binding!=='DistanceDamageFalloffCurve')return {kind:'table',reason:'Authored parameter keys'};
  if(points.some((p,index)=>index&&p.x<=points[index-1].x))return {kind:'table',reason:'Stored key order retained; repeated or decreasing inputs'};
  for(let index=0;index<points.length-1;index++){
    const a=points[index].key,b=points[index+1].key,mode=curveMode(a.InterpMode||c.raw?.InterpMode);
    if(!['RCIM_Linear','RCIM_Constant','RCIM_Cubic'].includes(mode))return {kind:'table',reason:'Interpolation metadata retained in table'};
    if(mode==='RCIM_Cubic'&&(!Number.isFinite(a.LeaveTangent)||!Number.isFinite(b.ArriveTangent)||curveMode(a.TangentWeightMode)!=='RCTWM_WeightedNone'||curveMode(b.TangentWeightMode)!=='RCTWM_WeightedNone'))return {kind:'table',reason:'Weighted or incomplete cubic metadata retained in table'};
  }
  if(points.every(p=>p.y===points[0].y)&&points.slice(0,-1).every((p,index)=>curveMode(p.key.InterpMode||c.raw?.InterpMode)!=='RCIM_Cubic'||p.key.LeaveTangent===0&&points[index+1].key.ArriveTangent===0))return {kind:'table',reason:'Constant stored value'};
  return {kind:'curve',reason:'Stored falloff function within authored key bounds'};
}
// Unweighted rich-curve tangents are slopes. This is the Hermite polynomial, not smoothing.
function curveSegment(a,b,mode,t){
  if(mode==='RCIM_Constant')return t===1?b.y:a.y;
  if(mode==='RCIM_Linear')return (1-t)*a.y+t*b.y;
  const delta=b.x-a.x,m0=a.key.LeaveTangent*delta,m1=b.key.ArriveTangent*delta;
  return (2*t*t*t-3*t*t+1)*a.y+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*b.y+(t*t*t-t*t)*m1;
}
function curveExtentValues(c){
  const points=curvePoints(c),values=points.map(p=>p.y);
  for(let index=0;index<points.length-1;index++){
    const a=points[index],b=points[index+1],mode=curveMode(a.key.InterpMode||c.raw?.InterpMode);
    if(mode!=='RCIM_Cubic')continue;
    const delta=b.x-a.x,m0=a.key.LeaveTangent*delta,m1=b.key.ArriveTangent*delta;
    const A=2*a.y-2*b.y+m0+m1,B=-3*a.y+3*b.y-2*m0-m1,C=m0;
    const discriminant=4*B*B-12*A*C;
    const roots=A===0?(B===0?[]:[-C/(2*B)]):discriminant<0?[]:[(-2*B+Math.sqrt(discriminant))/(6*A),(-2*B-Math.sqrt(discriminant))/(6*A)];
    for(const t of roots)if(t>0&&t<1)values.push(curveSegment(a,b,mode,t));
  }
  return values;
}
function curveGroups(bindings){
  const groups=[];
  for(const binding of bindings){
    const c=binding.curve,signature=JSON.stringify([c.type,c.keys,c.raw,c.axes,c.units]);
    let group=groups.find(g=>g.signature===signature);
    if(!group){group={signature,curve:c,bindings:[],policy:curvePolicy(c)};groups.push(group)}
    group.bindings.push(binding);
  }
  return groups;
}
function curveKeyTable(c){
  const points=curvePoints(c),pattern=c.type==='ordered_xy',tangents=points.some(p=>p.key&&('ArriveTangent' in p.key||'LeaveTangent' in p.key));
  return `<div class="scrolltable curve-key-table"><table><thead><tr><th>Stored key</th><th>${esc(pattern?'Pattern X / raw':c.axes?.x||'Key input / raw')}</th><th>${esc(pattern?'Pattern Y / raw':c.axes?.y||'Key value / raw')}</th>${pattern?'':'<th>Interpolation</th>'}${tangents?'<th>Arrive tangent</th><th>Leave tangent</th>':''}</tr></thead><tbody>${points.length?points.map(p=>`<tr><td>${p.index}</td><td>${esc(curveNumber(p.x))}</td><td>${esc(curveNumber(p.y))}</td>${pattern?'':`<td>${esc(curveMode(p.key?.InterpMode||c.raw?.InterpMode)||'Not stored')}</td>`}${tangents?`<td>${esc(curveNumber(p.key?.ArriveTangent))}</td><td>${esc(curveNumber(p.key?.LeaveTangent))}</td>`:''}</tr>`).join(''):`<tr><td colspan="${pattern?3:tangents?6:4}">No stored keys</td></tr>`}</tbody></table></div>`;
}
function curveSourceIdentity(c){const s=c.source;return typeof s?.path==='string'&&s.path.trim()&&typeof s.pointer==='string'&&s.pointer.trim()?JSON.stringify([s.path,s.export,s.pointer]):null}
function curveGroupLabel(group){
  const names=[...new Set(group.bindings.map(b=>b.item.name))].join(' / ');
  return (group.bindings.length>1?(group.bindings.every(b=>curveSourceIdentity(b.curve))&&new Set(group.bindings.map(b=>curveSourceIdentity(b.curve))).size===1?'Shared source: ':'Identical stored data: '):'')+names;
}
function curveGeometry(entries,extents,equalUnits,layout={}){
  if(!entries.length||[...entries.flatMap(p=>[p.x,p.y]),...extents].some(v=>!Number.isFinite(v)))return null;
  const xmin=Math.min(...entries.map(p=>p.x)),xmax=Math.max(...entries.map(p=>p.x)),ymin=Math.min(...extents),ymax=Math.max(...extents);
  const width=layout.width||760,left=layout.left||100,right=width-56,top=38,bottom=208,cx=(left+right)/2,cy=(top+bottom)/2;
  const fraction=(value,min,max)=>{if(min===max)return .5;const scale=Math.max(Math.abs(min),Math.abs(max),1);return (value/scale-min/scale)/(max/scale-min/scale)};
  let x=value=>left+fraction(value,xmin,xmax)*(right-left),y=value=>bottom-fraction(value,ymin,ymax)*(bottom-top),axisXMin=xmin,axisXMax=xmax,axisYMin=ymin,axisYMax=ymax;
  if(equalUnits){
    const scale=Math.max(Math.abs(xmin),Math.abs(xmax),Math.abs(ymin),Math.abs(ymax),1),dx=xmax/scale-xmin/scale,dy=ymax/scale-ymin/scale,centerX=(xmin/scale+xmax/scale)/2,centerY=(ymin/scale+ymax/scale)/2;
    const factor=dx===0&&dy===0?0:Math.min(dx===0?Infinity:(right-left)/dx,dy===0?Infinity:(bottom-top)/dy);
    x=value=>cx+(value/scale-centerX)*factor;y=value=>cy-(value/scale-centerY)*factor;
    // Tick the visible equal-unit domain, rather than squeezing data extrema together.
    if(factor){const values=[(centerX+(left-cx)/factor)*scale,(centerX+(right-cx)/factor)*scale,(centerY+(cy-bottom)/factor)*scale,(centerY+(cy-top)/factor)*scale];if(values.every(Number.isFinite))[axisXMin,axisXMax,axisYMin,axisYMax]=values;}
  }
  return {x,y,xmin,xmax,ymin,ymax,axisXMin,axisXMax,axisYMin,axisYMax,equalUnits,width,left,right,top,bottom};
}
function curveAxisTicks(min,max,position,axis='x'){
  for(let count=axis==='x'?5:3;count>=2;count--){
    const values=Array.from({length:count},(_,index)=>min*(1-index/(count-1))+max*index/(count-1));
    const ticks=values.map(value=>({value,label:curveNumber(value,true),position:position(value)}));
    if(new Set(ticks.map(t=>t.label)).size!==ticks.length||ticks.some(t=>!Number.isFinite(t.position)))continue;
    const ordered=[...ticks].sort((a,b)=>a.position-b.position);
    if(ordered.slice(1).every((tick,index)=>tick.position-ordered[index].position>=(axis==='x'?(tick.label.length+ordered[index].label.length)*3.6+12:22)))return ticks;
  }
  const value=min/2+max/2;return [{value,label:curveNumber(value,true),position:position(value)}];
}
function curvePlot(groups){
  const plotted=groups.filter(g=>g.policy.kind!=='table');if(!plotted.length)return '';
  const entries=plotted.flatMap(group=>curvePoints(group.curve)),extents=plotted.flatMap(group=>group.policy.kind==='curve'?curveExtentValues(group.curve):curvePoints(group.curve).map(p=>p.y));
  const width=Math.max(320,Math.min(900,$('#compare-plot')?.clientWidth||760)),equalUnits=plotted.every(g=>g.policy.kind==='pattern');
  const provisional=curveGeometry(entries,extents,equalUnits,{width});if(!provisional)return '';
  const labelWidth=Math.max(...curveAxisTicks(provisional.axisYMin,provisional.axisYMax,provisional.y,'y').map(t=>t.label.length))*7.2;
  const geometry=curveGeometry(entries,extents,equalUnits,{width,left:Math.max(94,labelWidth+24)});
  const {x,y,left,right,top,bottom,axisXMin,axisXMax,axisYMin,axisYMax}=geometry;
  let svg=`<svg viewBox="0 0 ${width} 260" role="img" aria-label="Stored curve comparison. Exact keys and sources available in tables below.">`;
  for(const tick of curveAxisTicks(axisXMin,axisXMax,x))svg+=`<path d="M${tick.position} ${top}V${bottom}" stroke="#3b4234"/><text data-axis="x" x="${tick.position}" y="228" text-anchor="middle">${esc(tick.label)}</text>`;
  for(const tick of curveAxisTicks(axisYMin,axisYMax,y,'y'))svg+=`<path d="M${left} ${tick.position}H${right}" stroke="#3b4234"/><text data-axis="y" x="${left-10}" y="${tick.position+4}" text-anchor="end">${esc(tick.label)}</text>`;
  svg+=`<path d="M${left} ${top}V${bottom}H${right}" fill="none" stroke="#8b957e"/>`;
  for(const group of plotted){
    const points=curvePoints(group.curve),label=curveGroupLabel(group);let d=`M${x(points[0].x)} ${y(points[0].y)}`;
    for(let index=1;index<points.length;index++){
      const a=points[index-1],b=points[index],mode=curveMode(a.key?.InterpMode||group.curve.raw?.InterpMode);
      if(group.policy.kind==='pattern'||mode==='RCIM_Linear')d+=` L${x(b.x)} ${y(b.y)}`;
      else if(mode==='RCIM_Constant')d+=` H${x(b.x)} M${x(b.x)} ${y(b.y)}`;
      else{const delta=(b.x-a.x)/3;d+=` C${x(a.x+delta)} ${y(a.y+delta*a.key.LeaveTangent)} ${x(b.x-delta)} ${y(b.y-delta*b.key.ArriveTangent)} ${x(b.x)} ${y(b.y)}`}
    }
    if(/NaN|Infinity/.test(d))return '';
    svg+=`<path d="${d}" fill="none" stroke="${group.colour}" stroke-width="2"${group.dash?` stroke-dasharray="${group.dash}"`:''}><title>${esc(label)}</title></path>`;
    for(let index=1;index<points.length;index++){const a=points[index-1],b=points[index];if(group.policy.kind==='curve'&&curveMode(a.key?.InterpMode||group.curve.raw?.InterpMode)==='RCIM_Constant'&&a.y!==b.y)svg+=`<circle cx="${x(b.x)}" cy="${y(a.y)}" r="3.6" fill="#181a15" stroke="${group.colour}"><title>Open step endpoint</title></circle>`;}
    for(const p of points)svg+=`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="3.6" fill="${group.colour}"><title>${esc(label)} / stored key ${p.index}: ${esc(curveNumber(p.x))}, ${esc(curveNumber(p.y))}</title></circle>`;
  }
  const axes=plotted.every(g=>g.policy.kind==='curve')?{x:'Distance input (raw)',y:'Stored falloff value (raw)'}:plotted[0].curve.axes||{};
  svg+=`<text x="${(left+right)/2}" y="251" text-anchor="middle">${esc(axes.x||'Stored input / raw')}</text><text x="${left}" y="20">${esc(axes.y||'Stored output / raw')}</text></svg>`;
  return `<div class="curveplot">${svg}</div><div class="plotlegend">${plotted.map(g=>`<span><svg viewBox="0 0 42 12" aria-hidden="true"><path d="M1 6H41" stroke="${g.colour}" stroke-width="2"${g.dash?` stroke-dasharray="${g.dash}"`:''}/><circle cx="21" cy="6" r="3" fill="${g.colour}"/></svg>${esc(curveGroupLabel(g))}</span>`).join('')}</div>`;
}
function renderComparisonCurves(items){
  const bindings=items.flatMap(item=>(M.weaponCurves?.[item.id]?.curves||[]).map(curve=>({item,curve}))),descriptors=new Map(bindings.map(b=>[curveMetric(b.curve),curveDescriptor(b.curve)]));
  $('#compare-curve-panel').hidden=!descriptors.size;
  if(!descriptors.size){$('#compare-plot').innerHTML='';return}
  if(!descriptors.has(comparisonCurve))comparisonCurve=[...descriptors].find(([,d])=>d.binding==='DistanceDamageFalloffCurve')?.[0]||descriptors.keys().next().value;
  $('#compare-curve').innerHTML=[...descriptors].map(([id,d])=>`<option value="${esc(id)}" ${id===comparisonCurve?'selected':''}>${esc(d.label)}</option>`).join('');
  const chosen=bindings.filter(b=>curveMetric(b.curve)===comparisonCurve),groups=curveGroups(chosen);
  groups.forEach((group,index)=>{group.colour=comparisonColours[index%comparisonColours.length];group.dash=['','7 3','2 3','9 3 2 3'][index%4]});
  const plot=curvePlot(groups);
  const bindingTable=group=>`<details><summary>Bindings and source values (${group.bindings.length})</summary>${group.bindings.map(b=>`<div class="curve-binding"><b>${esc(b.item.name)}</b>${b.curve.context?.rawScalableFloatValue!=null?kv('Raw scalable value',b.curve.context.rawScalableFloatValue):''}${curveDescriptor(b.curve).binding==='DistanceDamageFalloffCurve'?kv('Use distance damage falloff curve',M.weapons[b.item.id]?.stats.bUseDistanceDamageFalloffCurve):''}${source(b.curve.source)}${b.curve.edgeSource?source(b.curve.edgeSource):''}</div>`).join('')}</details>`;
  $('#compare-plot').innerHTML=plot+groups.map(group=>`<section class="curve-source-table"><h3>${esc(curveGroupLabel(group))}</h3><p class="small muted">${esc(group.policy.reason)}</p>${curveDescriptor(group.curve).binding==='DistanceDamageFalloffCurve'?`<p class="small">${group.bindings.map(b=>esc(b.item.name)+': '+(M.weapons[b.item.id]?.stats.bUseDistanceDamageFalloffCurve===true?'Enabled':M.weapons[b.item.id]?.stats.bUseDistanceDamageFalloffCurve===false?'Disabled':'Enable flag not stored')).join(' / ')}</p>`:''}${group.policy.kind==='table'||!plot?curveKeyTable(group.curve):`<details><summary>Exact stored keys (${curvePoints(group.curve).length})</summary>${curveKeyTable(group.curve)}</details>`}${bindingTable(group)}</section>`).join('')+raw(chosen.map(b=>({item:b.item.name,curve:b.curve})),'All selected bindings, original keys, interpolation and sources');
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
