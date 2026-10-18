/* ASTORA TV interface. ES5, bounded DOM, local assets; no companion computer. */
(function () {
'use strict';
var byId=function(id){return document.getElementById(id);}, model=AstoraModel, texts=AstoraText;
var extra={
 ar:{caption:'عالمك، على طريقتك.',featured:'اختيارك التالي',collection:'في مكتبتك',browse:'تصفح المكتبة',details:'عرض التفاصيل',game:'لعبة',app:'تطبيق',reduce:'تقليل الحركة',animate:'تفعيل الحركة',searchButton:'بحث',clear:'مسح البحث',reset:'عرض الكل',emptyTitle:'مساحة لاختيارك القادم',emptyDescription:'ما لقينا عناصر هنا. جرّب منصة ثانية أو امسح البحث.',sourcesKicker:'مكتبة على مزاجك',jobsKicker:'خطوة أقرب للعب',detailKicker:'كل شيء قبل أن تبدأ',close:'إغلاق',navigation:'التنقل الرئيسي',platformLabel:'المنصة',transfer:'متابعة التنزيل',requestBusy:'هناك عملية قيد التنفيذ. يمكنك الرجوع للمكتبة والانتظار.',readyShort:'على جهازك · متصل',previewShort:'معاينة الكمبيوتر · ليست شاشة السوني',baseShort:'حزم PS4 · افحص المصدر قبل التنزيل',homeHint:'المكتبة أمامك. اختر بطاقة لعرض تفاصيلها.',freeGame:'اجمع الأرقام. خطط لخطوتك التالية.',saveTool:'ملفات حفظك، مرتبة وفي متناولك.',remoteTool:'ملفاتك تتنقل. وأنت في مكانك.',installerTool:'أداة إضافية لإدارة تثبيت حزم PS4.',uiError:'تعذر عرض التفاصيل. ارجع للمكتبة وحاول مجددًا.',countLabel:'عدد العناصر'},
 en:{caption:'Your world. Your way.',featured:'Your next pick',collection:'In your library',browse:'Browse library',details:'View details',game:'Game',app:'App',reduce:'Reduce motion',animate:'Enable motion',searchButton:'Search',clear:'Clear search',reset:'Show all',emptyTitle:'Room for your next discovery',emptyDescription:'No entries here. Try another platform or clear your search.',sourcesKicker:'Make it yours',jobsKicker:'One step closer to play',detailKicker:'Everything before you begin',close:'Close',navigation:'Main navigation',platformLabel:'Platform',transfer:'View transfer',requestBusy:'An operation is in progress. You can return to the library while it finishes.',readyShort:'On your console · Connected',previewShort:'Computer preview · Not the PS4 screen',baseShort:'PS4 packages · Check the source before downloading',homeHint:'Your library is here. Choose a card to see its details.',freeGame:'Merge the numbers. Plan your next move.',saveTool:'Your save files, organized and within reach.',remoteTool:'Move your files. Stay in your seat.',installerTool:'An additional tool for installing PS4 packages.',uiError:'Could not display details. Return to the library and try again.',countLabel:'Item count'}
};
var key, language;
for(language in extra)if(extra.hasOwnProperty(language))for(key in extra[language])if(extra[language].hasOwnProperty(key))texts[language][key]=extra[language][key];
var lang='ar',theme='dark',reduced=false,preview=false,token='',catalogs=[],items=[],filtered=[],page=0,capacity=4,platform='ALL',featured=null,selected=null,checked=null,busy=false,detailEpoch=0,lastFocus=null,current='library',connected=false,featureTimer=0,jobsPending=false,lastJobMarkup='',searchTimer=0,diagnostics=0;
function t(k){return texts[lang][k]||k;}
function set(id,text){byId(id).textContent=text;}
function element(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function clear(e){while(e.firstChild)e.removeChild(e.firstChild);}
function save(k,v){try{localStorage.setItem('astora.console.'+k,JSON.stringify(v));}catch(ignore){}}
function load(k,fallback){try{var s=localStorage.getItem('astora.console.'+k);return s?JSON.parse(s):fallback;}catch(ignore){return fallback;}}
function size(n){return typeof n==='number'&&isFinite(n)&&n>=0?n>=1073741824?(n/1073741824).toFixed(2)+' GiB':(n/1048576).toFixed(1)+' MiB':t('unknownSize');}
function localized(item,name){return item.translations&&item.translations[lang]&&item.translations[lang][name]||item[name]||'';}
function request(path,data,done){
 var xhr=new XMLHttpRequest(),completed=false,timer;
 function finish(error,result){if(completed)return;completed=true;clearTimeout(timer);done(error,result);}
 try{
  xhr.open(data===null?'GET':'POST',path,true);
  if(data!==null){xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('X-Astora-Token',token);}
  xhr.onload=function(){var r;try{r=JSON.parse(xhr.responseText);}catch(e){finish('INVALID_RESPONSE');return;}if(xhr.status<200||xhr.status>=300){finish((r.error||'REQUEST_FAILED')+(r.code?' (0x'+(r.code>>>0).toString(16).toUpperCase()+')':''));return;}finish(null,r);};
  xhr.onerror=function(){finish('NETWORK_ERROR');};xhr.onabort=function(){finish('REQUEST_ABORTED');};
  timer=setTimeout(function(){finish('TIMEOUT — '+t('unknown'));xhr.abort();},45000);
  xhr.send(data===null?null:JSON.stringify(data));
 }catch(e){finish('REQUEST_FAILED');}
}
function trace(event){if(!token||preview||diagnostics++>=64)return;request('/api/ui-event',{event:event},function(){});}
function status(text,state){set('status',text);byId('status-dot').className='status-dot '+(state||'');}
function appearance(){document.body.className=(theme==='sand'?'sand ':'')+(reduced?'reduced-motion':'full-motion');}
function setPlatform(){var buttons=byId('platforms').children;for(var i=0;i<buttons.length;i++){var p=buttons[i].getAttribute('data-platform');buttons[i].className=p===platform?'active':'';buttons[i].setAttribute('aria-pressed',String(p===platform));buttons[i].textContent=p==='ALL'?t('all'):p;}}
function updateLocale(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';appearance();
 var mapping={'brand-caption':'caption','label-library':'library','label-jobs':'jobs','label-sources':'sources','feature-label':'featured','collection-label':'collection','feature-action-label':'details','browse-label':'browse','search-label':'searchButton','search-input-label':'search','clear-search':'clear','empty-title':'emptyTitle','empty-description':'emptyDescription','reset-filter':'reset','sources-title':'sourcesTitle','sources-kicker':'sourcesKicker','sources-description':'sourcesDescription','source-label':'sourceLabel','import':'add','source-limit':'sourceLimit','jobs-title':'jobsTitle','jobs-kicker':'jobsKicker','jobs-note':'jobsNote','refresh-jobs':'refresh','controls':'controls','detail-kicker':'detailKicker','size-label':'size','source-detail-label':'source','inspect':'inspect','install':'install','view-transfer':'transfer'};
 for(var id in mapping)if(mapping.hasOwnProperty(id))set(id,t(mapping[id]));
 set('language',lang==='ar'?'English':'العربية');byId('language').lang=lang==='ar'?'en':'ar';
 set('theme',t(theme==='sand'?'dark':'sand'));set('motion',t(reduced?'animate':'reduce'));
 byId('motion').setAttribute('aria-pressed',String(reduced));byId('search').placeholder=t('search');
 byId('navigation').setAttribute('aria-label',t('navigation'));byId('platforms').setAttribute('aria-label',t('platformLabel'));
 byId('previous').setAttribute('aria-label',t('previous'));byId('next').setAttribute('aria-label',t('next'));byId('close').setAttribute('aria-label',t('close'));
 if(connected)status(t(preview?'previewShort':'readyShort'),preview?'preview':'connected');
 setPlatform();render(false);renderSources();lastJobMarkup='';if(current==='jobs')renderJobs();
}
function rebuild(){
 items=[];for(var i=0;i<catalogs.length;i++)for(var j=0;j<catalogs[i].items.length;j++){var it=catalogs[i].items[j];it.catalogName=catalogs[i].name;items.push(it);}
 /* Real games first, preserving catalog order within each group. */
 var games=[],apps=[];for(i=0;i<items.length;i++)(items[i].kind==='game'?games:apps).push(items[i]);items=games.concat(apps);
 render(true);renderSources();
}
function render(animate){
 filtered=model.filter(items,byId('search').value,platform,lang);
 var result=model.page(filtered,page,capacity);page=result.index;
 set('count',String(filtered.length));byId('count').setAttribute('aria-label',t('countLabel')+': '+filtered.length);set('page',(page+1)+' / '+result.pages);
 byId('previous').disabled=page===0;byId('next').disabled=page===result.pages-1;
 set('platform-note',platform==='PS3'||platform==='PS5'?t('unsupported'):platform==='PS1'||platform==='PS2'||platform==='PSP'?t('emulator'):t('baseShort'));
 clear(byId('cards'));byId('cards').hidden=!result.items.length;byId('empty-library').hidden=!!result.items.length;
 for(var i=0;i<result.items.length;i++)card(result.items[i],animate);
 var active=featured&&result.items.indexOf(featured)>=0?featured:result.items[0];
 updateFeature(active,false);
}
function card(item,animate){
 var e=element('button','card'+(animate?' card-intro':'')),art=element('div','card-art'),img=element('img'),info=element('div','card-info'),label=element('div'),title=element('strong','',localized(item,'title')),bytes=element('small','',size(item.size));
 img.src=model.art(item);img.alt='';art.appendChild(img);art.appendChild(element('span','card-platform',item.platform));
 title.dir='auto';bytes.dir='ltr';label.appendChild(title);label.appendChild(bytes);info.appendChild(label);info.appendChild(element('span','card-arrow',lang==='ar'?'‹':'›'));e.appendChild(art);e.appendChild(info);
 e.setAttribute('data-item',item.id);e.onclick=function(){openItem(item,e);};e.onfocus=function(){updateFeature(item,true);};e.onmouseenter=function(){updateFeature(item,true);};byId('cards').appendChild(e);
}
function updateFeature(item,animate){
 var changed=item!==featured;featured=item||null;byId('feature-open').disabled=!item;
 var children=byId('cards').children;for(var i=0;i<children.length;i++){var selectedCard=!!item&&children[i].getAttribute('data-item')===item.id;children[i].className='card'+(selectedCard?' selected':'');}
 if(!item){set('feature-title','ASTORA');set('feature-description',t('homeHint'));set('feature-kind',t('collection'));set('feature-size','');set('feature-source','');set('feature-number','');byId('feature-image').src='/art-generic.svg';return;}
 set('feature-title',localized(item,'title'));set('feature-platform',item.platform);set('feature-kind',t(item.kind==='game'?'game':'app'));set('feature-size',size(item.size));
 var summaries={SKID02048:'freeGame',APOL00004:'saveTool',RMTC00001:'remoteTool',PGIN00001:'installerTool'};
 set('feature-description',summaries[item.titleId]?t(summaries[item.titleId]):localized(item,'description'));
 set('feature-source',t('source')+' · '+item.sources[0].name);var ordinal=filtered.indexOf(item)+1;set('feature-number',(ordinal<10?'0':'')+ordinal+' / '+(filtered.length<10?'0':'')+filtered.length);
 byId('feature-image').src=model.art(item);
 clearTimeout(featureTimer);byId('feature-copy').className='feature-copy';byId('feature-image').className='';
 if(changed&&animate&&!reduced){featureTimer=setTimeout(function(){byId('feature-copy').className='feature-copy feature-swap';byId('feature-image').className='art-swap';},16);}
}
function renderSources(){
 clear(byId('source-list'));
 for(var i=0;i<catalogs.length;i++)(function(index){
  var c=catalogs[index],row=element('div','source-row'),label=element('div','',c.name);label.dir='auto';label.appendChild(element('small','',t('countLabel')+': '+c.items.length));row.appendChild(label);
  if(index){var b=element('button','quiet-button',t('remove'));b.onclick=function(){catalogs.splice(index,1);save('catalogs',catalogs.slice(1));rebuild();byId('source-url').focus();};row.appendChild(b);}byId('source-list').appendChild(row);
 })(i);
}
function show(view,focus){
 current=view;var names=['library','sources','jobs'];
 for(var i=0;i<names.length;i++){byId('view-'+names[i]).hidden=names[i]!==view;byId('nav-'+names[i]).className='nav-button'+(names[i]===view?' active':'');if(names[i]===view)byId('nav-'+names[i]).setAttribute('aria-current','page');else byId('nav-'+names[i]).removeAttribute('aria-current');}
 if(view==='jobs')renderJobs();if(focus)byId('nav-'+view).focus();
}
function detailStatus(text,cls){set('detail-status',text);byId('detail-status').className='detail-status'+(cls?' '+cls:'');}
function syncButtons(){var unsupported=!selected||selected.platform==='PS3'||selected.platform==='PS5';byId('inspect').disabled=busy||unsupported;byId('install').disabled=busy||!checked||unsupported;}
function openItem(item,focus){
 try{
  detailEpoch++;selected=item;checked=null;lastFocus=focus;byId('view-transfer').hidden=true;
  /* Populate first: an unexpected rendering error must not leave a blank overlay. */
  set('detail-title',localized(item,'title'));set('detail-description',localized(item,'description'));set('detail-platform',item.platform);set('detail-source',item.sources[0].name);set('detail-size',size(item.size));byId('detail-image').src=model.art(item);
  detailStatus(busy?t('requestBusy'):item.platform==='PS3'||item.platform==='PS5'?t('unsupported'):t('pending'));
  syncButtons();byId('modal').hidden=false;byId('close').focus();trace('detail_opened');
 }catch(e){byId('modal').hidden=true;status(t('uiError'),'offline');trace('ui_error');}
}
function closeDetail(){detailEpoch++;byId('modal').hidden=true;checked=null;selected=null;if(lastFocus&&document.documentElement.contains(lastFocus))lastFocus.focus();else byId('feature-open').focus();trace('detail_closed');}
byId('inspect').onclick=function(){
 if(!selected||busy)return;busy=true;checked=null;syncButtons();detailStatus(t('checking'),'checking');var item=selected,epoch=detailEpoch;trace('inspect_clicked');
 request('/api/inspect',{url:item.sources[0].url,platform:item.platform},function(err,r){
  busy=false;syncButtons();if(epoch!==detailEpoch){if(selected)detailStatus(t('pending'));return;}
  if(err){detailStatus(t('failed')+err,'error');byId('inspect').focus();return;}
  if((item.titleId&&item.titleId!==r.titleId)||(item.size&&item.size!==r.size)){detailStatus(t('mismatch'),'error');return;}
  checked=r;syncButtons();set('detail-size',size(r.size)+' · '+r.titleId);detailStatus(t('verified'));byId('install').focus();
 });
};
byId('install').onclick=function(){
 if(!selected||!checked||busy)return;busy=true;syncButtons();var item=selected,epoch=detailEpoch,packageInfo=checked;checked=null;detailStatus(t('checking'),'checking');trace('install_clicked');
 request('/api/install',{url:item.sources[0].url,name:item.title,titleId:packageInfo.titleId,size:packageInfo.size,platform:item.platform},function(err,r){
  busy=false;syncButtons();lastJobMarkup='';if(epoch!==detailEpoch){if(selected)detailStatus(t('pending'));return;}
  detailStatus(err?t('failed')+err:r.stateSaved?t('accepted'):t('notSaved'),err?'error':'');
  if(!err){byId('view-transfer').hidden=false;byId('view-transfer').focus();}else byId('inspect').focus();
 });
};
byId('view-transfer').onclick=function(){closeDetail();show('jobs',true);};byId('close').onclick=closeDetail;
function renderJobs(){
 if(jobsPending||!token)return;jobsPending=true;
 request('/api/jobs',null,function(err,list){
  jobsPending=false;if(current!=='jobs')return;var signature=lang+JSON.stringify(err||list);if(signature===lastJobMarkup)return;lastJobMarkup=signature;clear(byId('jobs'));
  if(err){byId('jobs').appendChild(element('p','error',t('failed')+err));return;}
  if(!list.length){var empty=element('div','job-empty');empty.appendChild(element('span','','↓'));empty.appendChild(element('p','',t('emptyJobs')));byId('jobs').appendChild(empty);}
  for(var i=list.length-1;i>=0;i--){var j=list[i],row=element('div','job'),name=element('strong','',j.name),progress=element('progress');name.dir='auto';row.appendChild(name);progress.max=j.total||1;progress.value=j.transferred||0;progress.setAttribute('aria-label',j.name);row.appendChild(progress);row.appendChild(element('p',j.error?'error':'',t(j.state)+(j.error?' (0x'+(j.error>>>0).toString(16).toUpperCase()+')':'')));var amounts=element('p','',size(j.transferred)+' / '+size(j.total));amounts.dir='ltr';row.appendChild(amounts);byId('jobs').appendChild(row);}
 });
}
byId('source-form').onsubmit=function(event){
 event.preventDefault();var url=byId('source-url').value;if(!AstoraCatalog.validUrl(url)){set('source-result',t('noUrl'));return;}set('source-result',t('fetching'));byId('import').disabled=true;
 request('/api/import',{url:url},function(err,result){byId('import').disabled=false;if(err){set('source-result',t('failed')+err);return;}try{var c=AstoraCatalog.normalize(result,url);c.id=url;for(var i=1;i<catalogs.length;i++)if(catalogs[i].id===url){catalogs.splice(i,1);break;}catalogs.push(c);save('catalogs',catalogs.slice(1));rebuild();set('source-result',t('added'));}catch(e){set('source-result',t('invalid'));}});
};
function searchOpen(open){byId('search-bar').hidden=!open;byId('view-library').className='library-view'+(open?' searching':'');byId('search-toggle').setAttribute('aria-expanded',String(open));if(open)byId('search').focus();else byId('search-toggle').focus();}
function focusFirst(){var first=byId('cards').querySelector('button');if(first)first.focus();else byId('reset-filter').focus();}
function movePage(delta){page+=delta;render(true);focusFirst();}
byId('feature-open').onclick=function(){if(featured)openItem(featured,byId('feature-open'));};
byId('browse').onclick=focusFirst;byId('search-toggle').onclick=function(){searchOpen(byId('search-bar').hidden);};
byId('clear-search').onclick=function(){byId('search').value='';page=0;render(false);byId('search').focus();};
byId('reset-filter').onclick=function(){platform='ALL';byId('search').value='';page=0;setPlatform();render(true);focusFirst();};
byId('language').onclick=function(){lang=lang==='ar'?'en':'ar';save('language',lang);updateLocale();};
byId('theme').onclick=function(){theme=theme==='sand'?'dark':'sand';save('theme',theme);appearance();set('theme',t(theme==='sand'?'dark':'sand'));};
byId('motion').onclick=function(){reduced=!reduced;save('reducedMotion',reduced);appearance();set('motion',t(reduced?'animate':'reduce'));byId('motion').setAttribute('aria-pressed',String(reduced));};
byId('search').oninput=function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){page=0;render(false);},90);};
byId('previous').onclick=function(){movePage(-1);};byId('next').onclick=function(){movePage(1);};
byId('nav-library').onclick=function(){show('library');};byId('nav-sources').onclick=function(){show('sources');};byId('nav-jobs').onclick=function(){show('jobs');};byId('refresh-jobs').onclick=function(){lastJobMarkup='';renderJobs();};
function focusable(root){var all=root.querySelectorAll('button,input'),result=[];for(var i=0;i<all.length;i++)if(!all[i].disabled&&all[i].offsetWidth&&all[i].offsetHeight)result.push(all[i]);return result;}
document.addEventListener('keydown',function(e){
 var code=e.keyCode,modalOpen=!byId('modal').hidden;
 if(code===27){if(modalOpen){e.preventDefault();closeDetail();}else if(!byId('search-bar').hidden){e.preventDefault();searchOpen(false);}else if(current!=='library'){e.preventDefault();show('library',true);}return;}
 if(modalOpen&&code===9){var tabs=focusable(byId('modal')),index=tabs.indexOf(document.activeElement);e.preventDefault();if(tabs.length)tabs[(index+(e.shiftKey?-1:1)+tabs.length)%tabs.length].focus();return;}
 if(code<37||code>40||e.target.tagName==='INPUT')return;
 var nodes=focusable(modalOpen?byId('modal'):document),from=document.activeElement,rect=from.getBoundingClientRect(),candidates=[],rects=[];
 for(var i=0;i<nodes.length;i++)if(nodes[i]!==from){candidates.push(nodes[i]);rects.push(nodes[i].getBoundingClientRect());}
 var best=model.nearest(rect,rects,code);e.preventDefault();if(best>=0)candidates[best].focus();
});
window.addEventListener('error',function(){status(t('uiError'),'offline');if(!byId('detail-title').textContent)byId('modal').hidden=true;trace('ui_error');});
var ps=['ALL','PS1','PS2','PSP','PS3','PS4','PS5'];for(var i=0;i<ps.length;i++)(function(p){var b=element('button');b.setAttribute('data-platform',p);b.onclick=function(){platform=p;page=0;setPlatform();render(true);};byId('platforms').appendChild(b);})(ps[i]);
lang=load('language','ar')==='en'?'en':'ar';theme=load('theme','dark')==='sand'?'sand':'dark';reduced=load('reducedMotion',!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches));capacity=window.innerWidth<=800?2:4;
updateLocale();
request('/api/config',null,function(err,config){
 if(err){status(t('offline'),'offline');return;}token=config.token;preview=config.mode==='browser-preview';connected=true;status(t(preview?'previewShort':'readyShort'),preview?'preview':'connected');
 request('/api/catalog',null,function(error,catalog){if(error){status(t('failed')+error,'offline');return;}try{catalogs=[AstoraCatalog.normalize(catalog,'astora-bundled')];var saved=load('catalogs',[]);for(var i=0;i<saved.length&&i<20;i++){try{catalogs.push(AstoraCatalog.normalize(saved[i],saved[i].id));}catch(ignore){}}rebuild();trace('library_ready');if(document.activeElement===document.body)focusFirst();}catch(e){status(t('invalid'),'offline');}});
});
var resizeTimer;window.addEventListener('resize',function(){clearTimeout(resizeTimer);resizeTimer=setTimeout(function(){var next=window.innerWidth<=800?2:4;if(next!==capacity){capacity=next;page=0;render(false);}},120);});
setInterval(function(){if(current==='jobs'&&byId('modal').hidden&&!document.hidden&&!busy)renderJobs();},3000);
})();
