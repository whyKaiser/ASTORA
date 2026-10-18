import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../ui/ui-model.js', import.meta.url), 'utf8'), context);
const model = context.AstoraModel;
const entries = Array.from({length:5000}, (_,i)=>({id:String(i), title:'Game '+i, platform:i%2?'PS4':'PSP', description:'', translations:{}}));
test('TV pagination reaches every entry with at most four mounted cards',()=>{
  const result=[];
  for(let p=0;p<1250;p++) {const slice=model.page(entries,p,4);assert.ok(slice.items.length<=4);result.push(...slice.items.map(i=>i.id));}
  assert.equal(new Set(result).size,5000);assert.equal(result.at(-1),'4999');
});
test('Filtering and shrinking the list clamps an old page',()=>{
  const result=model.page(model.filter(entries,'Game 4999','PS4','ar'),1249,4);
  assert.equal(result.index,0);assert.equal(result.pages,1);assert.equal(result.items[0].id,'4999');
});
test('Arabic search ignores diacritics and alef variants',()=>{
  assert.equal(model.filter([{title:'أَلْعاب',platform:'PS4',description:'',translations:{}}],'العاب','ALL','ar').length,1);
});
test('Translation search and platform filter both apply',()=>{
  const item={title:'Tools',platform:'PS4',description:'',translations:{ar:{title:'أدوات الحفظ'}}};
  assert.equal(model.filter([item],'ادوات','PS4','ar').length,1);
  assert.equal(model.filter([item],'ادوات','PS5','ar').length,0);
});
test('Narrow layout returns two cards, empty library remains page one',()=>{
  assert.equal(model.page(entries,1,2).items[0].id,'2');
  assert.equal(model.page([],9,4).pages,1);assert.equal(model.page([],9,4).index,0);
});
test('Directional navigation follows physical geometry, including RTL shelves',()=>{
  const from={left:900,top:400,width:200,height:150};
  const left={left:670,top:400,width:200,height:150},above={left:900,top:330,width:100,height:30};
  assert.equal(model.nearest(from,[left,above],37),0);
  assert.equal(model.nearest(from,[left,above],38),1);
  assert.equal(model.nearest(from,[left,above],39),-1);
});
test('Artwork is local and unknown imported metadata cannot inject an image URL',()=>{
  assert.equal(model.art({titleId:'SKID02048'}),'/covers/2048.png');
  assert.equal(model.art({titleId:'https://example.org/track.svg'}),'/assets/astora-logo.png');
});
test('Five-cover store shelves and ten-cover library pages remain bounded',()=>{
  assert.equal(model.page(entries,1,5).items[0].id,'5');
  assert.equal(model.page(entries,1,10).items.length,10);
  assert.equal(model.page(entries,0,1000).items.length,12);
  assert.equal(model.filter([{...entries[0],kind:'game'}],'','GAMES','ar').length,1);
  assert.equal(model.filter([{...entries[0],kind:'game'}],'','APPS','ar').length,0);
});
test('Focus lift does not make adjacent cards look like a lower row',()=>{
  assert.equal(model.nearest({left:900,top:395,width:200,height:150},[{left:670,top:400,width:200,height:150}],40),-1);
});
