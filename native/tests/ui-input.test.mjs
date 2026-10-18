import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const listeners={},nodes=[];
 const doc={addEventListener(type,fn){(listeners[type]??=[]).push(fn);}};
 let scope={contains:n=>nodes.includes(n)};
 function emit(type,target,props={}){
  const event={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};
  for(const fn of listeners[type]||[]){fn(event);if(event.stopped)break;}
  if(type==='click'&&!event.stopped)target.onClick?.();
  return event;
 }
 function button(){const node={offsetWidth:100,offsetHeight:40,disabled:false,clicks:0,contains:n=>n===node,
  focus(){doc.activeElement=node;emit('focus',node);},click(){emit('click',node);},onClick(){node.clicks++;}};nodes.push(node);return node;}
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../ui/ui-input.js',import.meta.url),'utf8'),context);
 return {emit,button,doc,input:context.AstoraInput.bind(doc,()=>scope),setScope(value){scope=value;}};
}
test('PS4 pointer click activates directional selection exactly once, preserving focus',()=>{
 const f=fixture(),selected=f.button(),underPointer=f.button();f.input.select(selected);
 assert.equal(f.emit('mousedown',underPointer).prevented,true);
 f.emit('click',underPointer);assert.equal(selected.clicks,1);assert.equal(underPointer.clicks,0);
 assert.equal(f.doc.activeElement,selected);
});
test('Click already on selection is not duplicated',()=>{
 const f=fixture(),b=f.button();f.input.select(b);f.emit('click',b);assert.equal(b.clicks,1);
});
test('Moving the stick returns to ordinary pointer targeting',()=>{
 const f=fixture(),selected=f.button(),pointer=f.button();f.emit('mousemove',pointer,{clientX:10,clientY:10});
 f.input.select(selected);f.emit('mousemove',pointer,{clientX:11,clientY:10});f.emit('click',pointer);
 assert.equal(selected.clicks,0);assert.equal(pointer.clicks,1);
});
test('Stationary pointer event does not override directional selection',()=>{
 const f=fixture(),selected=f.button(),pointer=f.button();f.emit('mousemove',pointer,{clientX:10,clientY:10});
 f.input.select(selected);f.emit('mousemove',pointer,{clientX:10,clientY:10});f.emit('click',pointer);
 assert.equal(selected.clicks,1);assert.equal(pointer.clicks,0);
});
test('Opening modal follows new focus and cannot activate a background selection',()=>{
 const f=fixture(),card=f.button(),close=f.button(),pointer=f.button();f.input.select(card);
 f.setScope({contains:n=>n===close});close.focus();f.emit('click',pointer);
 assert.equal(card.clicks,0);assert.equal(close.clicks,1);
});
test('Disabled or detached directional targets never receive activation',()=>{
 const f=fixture(),selected=f.button(),pointer=f.button();f.input.select(selected);selected.disabled=true;f.emit('click',pointer);
 assert.equal(selected.clicks,0);selected.disabled=false;f.setScope({contains:()=>false});f.emit('click',pointer);assert.equal(selected.clicks,0);
});
