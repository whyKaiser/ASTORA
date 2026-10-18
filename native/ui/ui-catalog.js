/* Bounded text-only ASTORA / FPKGi adapter, shared with host tests. ES5. */
var AstoraCatalog = (function () {
'use strict';
function text(v,n){return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n):'';}
function validUrl(v){
 if(typeof v!=='string'||v.length>8192||/[\s\\#\u0000-\u001f]/.test(v))return false;
 var m=/^https?:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(?:\/[^\s\\]*)?$/i.exec(v);
 return !!m&&m[1].indexOf('..')<0&&m[1].charAt(0)!=='.'&&(!m[2]||Number(m[2])<=65535);
}
function artwork(v){return typeof v==='string'&&v.length<=2048&&/^https:\/\/(?:raw\.githubusercontent\.com|github\.com|release-assets\.githubusercontent\.com)\/[A-Za-z0-9_./%?=&+-]+\.(?:png|jpe?g|webp)(?:\?[^\s\\#]*)?$/i.test(v)&&v.indexOf('/../')<0?v:'';}
function translations(v,fields){var out={},langs=['ar','en'],i,j,s;for(i=0;v&&i<langs.length;i++){s=v[langs[i]];if(s&&typeof s==='object'){out[langs[i]]={};for(j=0;j<fields.length;j++)if(typeof s[fields[j]]==='string')out[langs[i]][fields[j]]=text(s[fields[j]],fields[j]==='description'?600:160);}}return out;}
function normalize(input,origin){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INVALID_CATALOG');
 var result={id:text(input.id,160)||text(origin,160),name:text(input.name,160)||'Catalog',items:[],translations:translations(input.translations,['name']),enabled:input.enabled!==false,origin:text(input.origin||origin,8192)},list=input.items,keys,i,j,value,entry,sources,seen,s,art;
 if(!list&&input.DATA&&typeof input.DATA==='object'&&!Array.isArray(input.DATA)){
  keys=Object.keys(input.DATA);if(keys.length>5000)throw new Error('CATALOG_LIMIT');list=[];
  for(i=0;i<keys.length;i++){value=input.DATA[keys[i]];if(value&&typeof value==='object')list.push({id:'fpkg-'+i,title:value.name||value.title,platform:value.platform||'PS4',kind:value.kind||'game',titleId:value.title_id||value.titleId||'',size:Number(value.size)||null,description:value.description||'',sources:[{name:'Catalog source',url:keys[i]}]});}
 }
 if(!Array.isArray(list)||list.length>5000)throw new Error('INVALID_CATALOG');
 for(i=0;i<list.length;i++){
  entry=list[i];if(!entry||!text(entry.title,160)||['PS1','PS2','PSP','PS3','PS4','PS5'].indexOf(entry.platform)<0||!Array.isArray(entry.sources))continue;
  sources=[];seen={};for(j=0;j<entry.sources.length&&j<12;j++){s=entry.sources[j];if(s&&validUrl(s.url)&&!seen['$'+s.url]){seen['$'+s.url]=true;sources.push({name:text(s.name,100)||'Source',url:s.url});}}
  if(!sources.length)continue;art=entry.art||{};
  result.items.push({id:text(entry.id,160)||String(i),title:text(entry.title,160),platform:entry.platform,kind:entry.kind==='app'?'app':'game',titleId:/^[A-Z]{4}[0-9]{5}$/.test(entry.titleId)?entry.titleId:'',size:typeof entry.size==='number'&&isFinite(entry.size)&&Math.floor(entry.size)===entry.size&&entry.size>=8192&&entry.size<=1099511627776?entry.size:null,description:text(entry.description,600),sources:sources,translations:translations(entry.translations,['title','description']),art:{cover:artwork(art.cover),hero:artwork(art.hero)}});
 }
 if(!result.items.length)throw new Error('INVALID_CATALOG');return result;
}
function key(item){return item.platform+':'+(item.titleId||item.sources[0].url);}
function merge(catalogs){
 var result=[],seen={},i,j,k,c,item,copy,index,urls,s;
 for(i=0;i<catalogs.length;i++){c=catalogs[i];if(c.enabled===false)continue;
  for(j=0;j<c.items.length;j++){item=c.items[j];k='$'+key(item);index=seen[k];
   if(index!==undefined){copy=result[index];urls={};for(s=0;s<copy.sources.length;s++)urls['$'+copy.sources[s].url]=true;for(s=0;s<item.sources.length&&copy.sources.length<12;s++)if(!urls['$'+item.sources[s].url]){copy.sources.push(item.sources[s]);urls['$'+item.sources[s].url]=true;}continue;}
   if(result.length>=5000)throw new Error('CATALOG_LIMIT');copy={};for(s in item)if(Object.prototype.hasOwnProperty.call(item,s))copy[s]=item[s];copy.sources=item.sources.slice();copy.catalogName=c.name;seen[k]=result.length;result.push(copy);
  }
 }return result;
}
return {validUrl:validUrl,artwork:artwork,normalize:normalize,key:key,merge:merge};
})();
