"""Deterministic package assembly. Original identity master is never modified."""
from pathlib import Path
from PIL import Image
import json, shutil, subprocess, sys, hashlib, os
import xml.etree.ElementTree as ET

# The bundled .NET packaging tool does not need locale-aware operations.
os.environ['DOTNET_SYSTEM_GLOBALIZATION_INVARIANT'] = '1'

root=Path(__file__).resolve().parent
repo=root.parent
sdk=Path(sys.argv[1]).resolve()
out=root/'build/package'
out.mkdir(parents=True,exist_ok=True)
for folder in ('sce_sys/about','sce_module','astora-ui/assets'):
    (out/folder).mkdir(parents=True,exist_ok=True)
shutil.copytree(root/'notices',out/'notices',dirs_exist_ok=True)
for name in ('libc.prx','libSceFios2.prx'):
    shutil.copy2(sdk/'src/modules'/name,out/'sce_module'/name)
shutil.copy2(sdk/'src/modules/right.sprx',out/'sce_sys/about/right.sprx')
for path in (root/'ui').iterdir():
    if path.is_file():shutil.copy2(path,out/'astora-ui'/path.name)
shutil.copytree(root/'ui/covers',out/'astora-ui/covers',dirs_exist_ok=True)
for obsolete in (out/'astora-ui').glob('art-*.svg'):
    obsolete.unlink()
for name in ('astora-logo.png','weave.svg','NotoSansArabic-Regular.ttf'):
    shutil.copy2(repo/'web/assets'/name,out/'astora-ui/assets'/name)
# Technical console-icon export only: maintain the master proportions and black padding.
source=Image.open(repo/'web/assets/astora-logo.png').convert('RGB')
source.thumbnail((512,512),Image.Resampling.LANCZOS)
icon=Image.new('RGB',(512,512),(0,0,0));icon.paste(source,((512-source.width)//2,(512-source.height)//2))
icon.save(out/'sce_sys/icon0.png',optimize=True)
catalog=json.loads((repo/'catalogs/homebrew.json').read_text(encoding='utf-8'))
extra=repo/'catalogs/free-games-candidates.json'
if extra.exists():
    # Only ready-to-fetch base games are bundled; engines requiring extra data remain in the research catalog.
    catalog['items'] += [i for i in json.loads(extra.read_text(encoding='utf-8'))['items'] if i['kind']=='game']
catalog['id']='astora-console-free';catalog['name']='ASTORA · Free developer sources'
(out/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
tool=sdk/'bin/linux/PkgTool.Core'
sfo=out/'sce_sys/param.sfo'
content='IV0000-ASTR00001_00-ASTORA0000000000'
subprocess.run([str(tool),'sfo_new',str(sfo)],check=True)
# Follow the system's confirm-button assignment for common dialogs (ATTRIBUTE bit 5).
# A zero ATTRIBUTE makes Cross cancel in the embedded browser on this console.
entries={'APP_TYPE':('Integer',4,'1'),'APP_VER':('Utf8',8,'00.70'),'ATTRIBUTE':('Integer',4,'32'),'CATEGORY':('Utf8',4,'gd'),'CONTENT_ID':('Utf8',48,content),'DOWNLOAD_DATA_SIZE':('Integer',4,'0'),'SYSTEM_VER':('Integer',4,'0'),'TITLE':('Utf8',128,'ASTORA'),'TITLE_ID':('Utf8',12,'ASTR00001'),'VERSION':('Utf8',8,'00.70')}
for key,(kind,size,value) in entries.items():
    subprocess.run([str(tool),'sfo_setentry',str(sfo),key,'--type',kind,'--maxsize',str(size),'--value',value],check=True,stdout=subprocess.DEVNULL)
files=sorted(str(p.relative_to(out)).replace('\\','/') for p in out.rglob('*') if p.is_file() and p.name!='package.gp4')
subprocess.run([str(sdk/'bin/linux/create-gp4'),'-out','package.gp4','--content-id='+content,'--files',' '.join(files)],cwd=out,check=True)
# create-gp4 ships a fixed sample rootdir; reconstruct the actual hierarchy.
project=ET.parse(out/'package.gp4')
directories=project.getroot().find('rootdir')
directories.clear()
for file in files:
    parent=directories
    for component in Path(file).parts[:-1]:
        child=next((node for node in parent if node.get('targ_name')==component),None)
        if child is None:child=ET.SubElement(parent,'dir',{'targ_name':component})
        parent=child
project.write(out/'package.gp4',encoding='utf-8',xml_declaration=True)
manifest={'titleId':'ASTR00001','contentId':content,'version':'00.70','consoleTested':False,'files':[{'path':p,'bytes':(out/p).stat().st_size,'sha256':hashlib.sha256((out/p).read_bytes()).hexdigest()} for p in files]}
(root/'build/build-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Prepared',len(files),'files. Native execution still requires console verification.')
