const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),M=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalogue.json'),'utf8')),before=JSON.stringify(M),elements=new Map();
const context=vm.createContext({M,renderGearEffects:()=>'',document:{querySelector(selector){if(!elements.has(selector))elements.set(selector,{value:selector==='#sort'?'unlock':selector==='#availability'?'visible':'',innerHTML:'',selectedOptions:[{textContent:'Unlock order'}]});return elements.get(selector)}}});
vm.runInContext(fs.readFileSync(path.join(root,'src/metrics.js'),'utf8'),context);
const runtime=fs.readFileSync(path.join(root,'src/runtime.js'),'utf8');
vm.runInContext(runtime.slice(runtime.indexOf('const $='),runtime.indexOf("document.addEventListener('click'")),context);
const run=code=>vm.runInContext(code,context);
const expected=[['id.item.45colt.tracer',33,6],['id.item.45colt.hollowpoint.tracer',50,6],['id.item.45colt.armorpiercing.tracer',66,6],['id.item.762x54mm.tracer',30,5],['id.item.762x54mm.hollowpoint.tracer',55,5],['id.item.762x54mm.armorpiercing.tracer',90,5],['id.item.155mm.expensive',120,2]];
for(const [id,price,amount]of expected){context.id=id;assert.equal(M.items.find(i=>i.id===id).visible,false);const projected=run('I.get(id)');assert.equal(projected.visible,true);assert(projected.offers.some(o=>o.id===id&&o.visible&&!o.previewOnly&&o.price===price&&o.amount===amount));assert.equal(projected.price,price);assert(run('uiShopVisible(I.get(id))'));assert(run('purchaseLabel(I.get(id))').includes('$'+price));}
run("view='loose-ammo';subcategory='All'");
assert.equal(run('rows().length'),45);
for(const id of ['id.item.45colt','id.item.762x54mm','id.item.155mm']){context.id=id;assert(run('I.get(id).shopFamily&&uiShopVisible(I.get(id))'));}
assert.equal(run("uiShopVisible(I.get('id.item.556mm'))"),false,'Hidden/preview base definition remains excluded');
const definitionOnly=Object.keys(M.ammo).find(id=>!M.items.some(i=>i.offers.some(o=>o.id===id)));context.definitionOnly=definitionOnly;assert(definitionOnly);assert.equal(run('uiShopVisible(I.get(definitionOnly))'),false);
for(const [id,price]of [['id.item.308win.tracer',40],['id.item.556mm.tracer',15],['id.item.9mm.tracer',10],['id.item.762mm.tracer',40]]){context.id=id;assert(run('uiShopVisible(I.get(id))'));assert(run('I.get(id).offers.some(o=>o.id===id&&o.visible&&o.previewOnly)'));assert.equal(run('activeOffers(I.get(id))[0].price'),price);assert(!run('purchaseLabel(I.get(id))').includes('Stored'));}
const visibleAmmo=new Set(M.items.flatMap(i=>i.offers).filter(o=>o.visible&&M.ammo[o.id]).map(o=>o.id));assert.equal(visibleAmmo.size,40);for(const id of visibleAmmo){context.id=id;assert(run('uiShopVisible(I.get(id))'));}
for(const id of ['id.item.battery','id.item.largebattery']){context.id=id;assert(run('uiShopVisible(I.get(id))'));assert.equal(run('uiCategory(I.get(id))'),'loose-ammo');}
context.id='id.item.556mm.tracer';run("selected=id;detailTab='offers';renderDetail()");assert(elements.get('#detail').innerHTML.includes('Shop offers (1)'));assert(elements.get('#detail').innerHTML.includes('$15'));assert(elements.get('#detail').innerHTML.includes('&quot;previewOnly&quot;: true'));
context.id='id.item.45colt.hollowpoint.tracer';run("selected=id;detailTab='offers';renderDetail()");assert(elements.get('#detail').innerHTML.includes('$50'));assert(elements.get('#detail').innerHTML.includes('6 rounds'));
const comparison=fs.readFileSync(path.join(root,'src/comparison.js'),'utf8');vm.runInContext(comparison.slice(0,comparison.indexOf("document.addEventListener('click'")),context);
assert.equal(run('comparisonFields(I.get(id)).get("price").value'),50);
assert.equal(run('ammoCardItem(M.ammo[id]).offers[0].price'),50);
assert.equal(JSON.stringify(M),before,'Reviewed model is not mutated by UI projection/rendering');
console.log(JSON.stringify({status:'passed',newActiveVariantCards:expected.length,sourceVisibleAmmo:visibleAmmo.size,previewFlaggedVisibleAmmo:23,shopLooseCards:run('rows().length'),rawDefinitionsWithoutOffersExcluded:true,sourceModelUnchanged:true,validation:'Source/data and production renderer checks; no browser UX'}));
