import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../ui/ui-catalog.js',import.meta.url),'utf8'),context);
const catalog=context.AstoraCatalog;
const entry={id:'game',title:'Example',platform:'PS4',kind:'game',titleId:'GAME00001',size:16384,sources:[{name:'Original',url:'https://github.com/dev/game/releases/download/v1/game.pkg'}]};
const fixture=(items=[entry])=>({id:'example',name:'Example',items});
test('ASTORA and FPKGi catalogs keep usable titles, valid metadata and disabled state',()=>{
 const a=catalog.normalize({...fixture(),enabled:false,translations:{ar:{name:'ألعاب'}}},'usb0:example.json');assert.equal(a.enabled,false);assert.equal(a.translations.ar.name,'ألعاب');assert.equal(a.origin,'usb0:example.json');
 const f=catalog.normalize({DATA:{[entry.sources[0].url]:{name:'Game',title_id:'GAME00001',size:'16384'}}},'https://github.com/catalog.json');assert.equal(f.items[0].titleId,'GAME00001');assert.equal(f.items[0].size,16384);
});
test('Malformed sources are dropped, duplicate mirrors bounded, unknown artwork rejected',()=>{
 const a=catalog.normalize(fixture([{...entry,sources:[null,{url:'javascript:alert(1)'},...entry.sources,...entry.sources],art:{cover:'https://example.org/track.png'},translations:{ar:{title:'لعبة',description:{html:'<x>'}}}}]),'x');assert.equal(a.items[0].sources.length,1);assert.equal(a.items[0].art.cover,'');assert.equal(a.items[0].translations.ar.title,'لعبة');assert.equal(a.items[0].translations.ar.description,undefined);
 for(const url of ['https://user:secret@github.com/game.pkg','https://github.com\\@127.0.0.1/x','https://github.com:99999/a','file:///x','https://github.com/a\n'])assert.equal(catalog.validUrl(url),false,url);
 assert.equal(catalog.artwork('https://raw.githubusercontent.com/dev/game/main/cover.png'),'https://raw.githubusercontent.com/dev/game/main/cover.png');
});
test('Duplicate games merge mirrors without mutating source catalogs; disabled catalogs excluded',()=>{
 const a=catalog.normalize(fixture(),'a'),b=catalog.normalize(fixture([{...entry,sources:[{name:'Mirror',url:'https://github.com/dev/game/mirror.pkg'}]}]),'b');const merged=catalog.merge([a,b]);assert.equal(merged.length,1);assert.equal(merged[0].sources.length,2);assert.equal(a.items[0].sources.length,1);b.enabled=false;assert.equal(catalog.merge([a,b])[0].sources.length,1);
});
test('Catalog limits reject oversized lists and merged libraries beyond 5000 entries',()=>{
 assert.throws(()=>catalog.normalize(fixture(Array(5001).fill(entry)),'x'));
 const a=catalog.normalize(fixture(Array.from({length:5000},(_,i)=>({...entry,titleId:'',sources:[{url:'https://github.com/dev/game/'+i+'.pkg'}]}))),'a');
 const b=catalog.normalize(fixture([{...entry,titleId:'OTHR00001'}]),'b');assert.throws(()=>catalog.merge([a,b]),/CATALOG_LIMIT/);
});
