// Ordered raw fields only. Unknown or context-dependent quantities remain unranked.

const metricRules={
  MagazineReloadPlayRate:['high','Stored magazine reload animation play rate; not reload duration'],MagazineSwayMultiplier:['low','Stored magazine sway multiplier; character base not evaluated'],
  AmmoCapacity:['high','Authored ammo-container capacity; excludes reserve and vendor pack quantity'],ChamberCapacity:['high','Separate serialized chamber capacity; never added to magazine capacity'],MagazineWeight:['low','Stored magazine inventory weight'],

  rpm:['high','Configured fire rate'],RoundsPerMinute:['high','Configured fire rate'],

  aim:['low','Shorter aim duration'],AimTime:['low','Shorter aim duration'],IronSightsAimTime:['low','Shorter aim duration'],

  range:['high','Authored effective range; no damage calculation'],EffectiveRange:['high','Authored effective range; no damage calculation'],

  speed:['high','Higher initial projectile speed'],InitialBulletSpeed:['high','Higher initial projectile speed'],TypicalSpeed:['high','Higher projectile speed'],

  accuracy:['high','Higher authored accuracy value'],AccuracyValue:['high','Higher authored accuracy value'],

  VerticalRecoilMultiplier:['low','Smaller recoil multiplier; underlying recoil profiles remain separate'],

  HorizontalRecoilMultiplier:['low','Smaller recoil multiplier; underlying recoil profiles remain separate'],

  SpreadMultiplier:['low','Smaller spread multiplier'],ViewKickMagnitudeMultiplier:['low','Smaller view-kick multiplier'],

  RecoilPatternResetTime:['low','Shorter recoil reset duration'],RandomDeviationDegree:['low','Smaller random deviation'],

  AdsZoomMultiplier:['high','Higher optical zoom; does not change ballistic range'],zoomMax:['high','Highest available optical zoom'],

  EquipSpeedMultiplier:['high','Higher equip-speed multiplier'],HolsterSpeedMultiplier:['high','Higher holster-speed multiplier'],

  AimSwayScaleMultiplier:['low','Smaller sway amplitude'],AimSwayHorizontalMovementMultiplier:['low','Smaller horizontal sway movement'],AimSwayVerticalMovementMultiplier:['low','Smaller vertical sway movement'],

  Weight:['low','Lower inventory weight'],price:['low','Lower price only for equal currency and pack quantity'],

  Durability:['high','Higher stored durability'],MaxHealth:['high','Higher maximum health'],health:['high','Higher health'],

  DamagePercentageReduction:['high','Higher authored reduction percentage'],

  BaseDamage:['high','Higher projectile base value; final hit damage separate'],MeleeDamage:['high','Higher authored melee damage'],

  PenetrationExitSpeedMultiplier:['high','Higher exit-speed multiplier; not penetration probability'],

  ammoRange:['high','Higher named ammo effective-range multiplier; native dispatch separate'],ammoPenetration:['high','Higher named ammo penetration-effectiveness multiplier; native dispatch separate'],

  ImpulseScale:['high','Higher impact impulse; not a stopping-power formula'],BaseSuppression:['high','Higher base suppression'],

  MaxStackSize:['high','Larger stack capacity'],MaxListSize:['high','Larger list capacity'],

  ExplosiveRadius:['high','Larger authored blast radius'],EffectiveExplosiveRadius:['high','Larger authored effective blast radius'],

};

function metricDefinition(key){const leaf=key.split('.').at(-1),rule=metricRules[key]||metricRules[leaf];return {key,direction:rule?.[0]||null,note:rule?.[1]||'No single ordered preference proven for this raw field'};}

function scalarMetric(value){if(typeof value==='number')return Number.isFinite(value)?value:null;if(Array.isArray(value)&&value.length&&value.every(v=>typeof v==='number'&&Number.isFinite(v))&&value.every(v=>v===value[0]))return value[0];return null;}

function sameMetric(a,b){return Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));}

function metricWinners(values,definition,scopes=[]){

  const numbers=values.map(scalarMetric),present=numbers.map((n,i)=>n==null?-1:i).filter(i=>i>=0);

  if(!definition.direction)return {indices:[],status:'unordered'};

  if(present.length<2)return {indices:[],status:'insufficient'};

  if(new Set(present.map(i=>scopes[i]??'raw')).size>1)return {indices:[],status:'incomparable'};

  const best=definition.direction==='low'?Math.min(...present.map(i=>numbers[i])):Math.max(...present.map(i=>numbers[i]));

  const indices=present.filter(i=>sameMetric(numbers[i],best));

  return {indices,status:indices.length===present.length?'tie':indices.length>1?'best-tie':'best'};

}

function opticZoom(data){

  const profiles=(data?.SightsData||[]).flatMap((entry,index)=>{const sight=entry.Value,variable=sight?.VariableZoomData;const enabled=variable?.bCanVariableZoom===true;const maximum=enabled?variable.ZoomMultiplierMax:sight?.AdsZoomMultiplier,minimum=enabled?variable.ZoomMultiplierMin:sight?.AdsZoomMultiplier;return typeof maximum==='number'&&Number.isFinite(maximum)&&maximum>0?[{minimum,maximum,index,field:enabled?'VariableZoomData.ZoomMultiplierMax':'AdsZoomMultiplier'}]:[]});

  const minima=profiles.map(p=>p.minimum).filter(v=>typeof v==='number'&&Number.isFinite(v));return profiles.length?{minimum:minima.length?Math.min(...minima):null,maximum:Math.max(...profiles.map(p=>p.maximum)),profiles}:null;

}
