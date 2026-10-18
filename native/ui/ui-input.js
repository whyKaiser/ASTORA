/* PS4 browser confirm clicks its pointer, even after directional DOM focus. */
(function(root){
'use strict';
root.AstoraInput={bind:function(doc,scope){
 var directional=false,target=null,forwarding=false,lastX=null,lastY=null;
 function usable(node){return node&&!node.disabled&&node.offsetWidth&&node.offsetHeight&&scope().contains(node);}
 function cancel(event){event.preventDefault();event.stopImmediatePropagation();}
 doc.addEventListener('focus',function(event){if(directional)target=event.target;},true);
 doc.addEventListener('mousemove',function(event){
  if(lastX!==event.clientX||lastY!==event.clientY)directional=false;
  lastX=event.clientX;lastY=event.clientY;
 },true);
 doc.addEventListener('mousedown',function(event){
  /* Preserve the directional target until the browser emits its click. */
  if(directional&&usable(target))event.preventDefault();
 },true);
 doc.addEventListener('click',function(event){
  if(forwarding||!directional||!usable(target))return;
  if(target===event.target||target.contains(event.target))return;
  cancel(event);var chosen=target;forwarding=true;
  try{chosen.click();}finally{forwarding=false;}
 },true);
 return {select:function(node){directional=true;target=node;node.focus();}};
}};
})(this);
