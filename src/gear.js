function gearTagLabel(tag){
  const names={'State.Player.Ghilli.BodySuit':'Ghillie body suit','State.Player.Ghilli.Headwear':'Ghillie headwear','State.Player.Vehicle.Role.Driver':'Driver','State.Player.Vehicle.Role.Gunner':'Gunner','State.Player.Vehicle.Tracked':'Tracked vehicle','State.Player.Vehicle.Rotary':'Rotary aircraft','State.Player.PilotHelmet.Active':'Pilot helmet active','State.Player.Vitality.Dead':'Dead'};
  const armorStates={'State.Player.Armor.PilotHelmet.Active':'Pilot helmet active','State.Player.Armor.PilotHelmet.Passive':'Pilot helmet passive','State.Player.Armor.TankHelmet.Active':'Tank helmet active','State.Player.Armor.TankHelmet.Passive':'Tank helmet passive','State.Player.Armor.SuperHeavyHelmet.Passive':'Level 4 helmet passive'};
  return names[tag]||armorStates[tag]||tag;
}

function gearConditions(conditions){
  const result=[];
  for(const [key,label] of [['ApplicationRequirements','Apply'],['OngoingRequirements','While']]){
    const r=conditions?.[key];if(!r)continue;
    if(r.RequireTags?.length)result.push(label+': requires '+r.RequireTags.map(gearTagLabel).join(' + '));
    if(r.IgnoreTags?.length)result.push(label+': excludes '+r.IgnoreTags.map(gearTagLabel).join(', '));
    const query=r.TagQuery;
    if(query?.AutoDescription){let description=query.AutoDescription;for(const tag of query.TagDictionary||[])description=description.replaceAll(tag.TagName,gearTagLabel(tag.TagName));result.push(label+': '+description.trim().replace(/\s+/g,' '))}
    else if(query?.QueryTokenStream?.length)result.push(label+': '+JSON.stringify(query));
  }
  return result.join(' · ');
}

function gearAttributeLabel(attribute){return attribute.split('.').at(-1).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^Ads /,'ADS ')}

function renderGearEffects(id){
  const record=M.armorEffects?.[id];if(!record?.appliedEffects.length)return '';
  const groups=[...new Set(record.appliedEffects.map(e=>e.effectId))];
  return '<div class="sectionlabel">Equipped effects</div>'+groups.map(effectId=>{
    const modifiers=record.modifiers.filter(m=>m.effectId===effectId),definition=M.armorEffectDefinitions[effectId],conditions=gearConditions(definition.conditions);
    return `<div class="attachment">${conditions?`<div class="badge best">${esc(conditions)}</div>`:''}${definition.grantedTags?.length?kv('Granted state',definition.grantedTags.map(gearTagLabel).join(', ')):''}${modifiers.map(m=>kv(gearAttributeLabel(m.attribute)+' / '+m.operation.split('::').at(-1),m.value)).join('')}${raw({effect:effectId,conditions:definition.conditions,modifiers,conditionSources:definition.conditionSources},'Effect conditions and sources')}</div>`;
  }).join('');
}
