function render(){
 const [name]=route();$('crumb').textContent=screenTitle();updateBackButton();
 document.querySelectorAll('#nav a').forEach(a=>{
  const active=a.hash==='#'+(name==='equipo'?'equipos':name);
  a.classList.toggle('on',active);
  if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 });
 $('app').innerHTML=name==='equipo'?detail():name==='parada'?renderShutdown():name==='riesgo'?renderRbiWorkbench():name==='fuentes'?sourcePage():name==='asistente'?renderAssistant():['equipos','agenda'].includes(name)?listPage(name):overview()+validationPanel();
 if(name==='parada') bindShutdown();
 initializeScenario();
 drawTrend()
}
function editAsset(index,newFamily){
 const isNew=index<0,e=structuredClone(isNew?template.find(e=>e.family===newFamily):project.equipment[index]);
 const projectTag=e.tag;
 if(isNew){e.tag='';e.name='';e.points=e.points.slice(0,1);e.points[0].measurements=[];e.points[0].x=50;e.points[0].y=50;e.points[0].basis='Definir fuente del mínimo y criterio de alerta'}
 if(isNew) delete e.points[0].location3d;
 const fields=metaKeys(e).map(k=>{
 let name=metaLabels[k];
 if(k==='diameter_mm')name+=' · '+({pipe:'exterior',vessel:'interior corroído',tank:'nominal'}[e.family]);
 if(k==='temp_c')name+=' · '+({pipe:'20 a 148',vessel:'20 a 150',tank:'20 a 40'}[e.family]);
 return field(k,name,e[k],typeof e[k]==='number'?'number':'text',(k==='material'||(e.family==='tank'&&k.includes('pressure')))?'readonly':'required')}).join('');
 dialog(isNew?'Crear '+family[e.family].toLowerCase():'Editar '+e.tag,fields,f=>{
 for(const k of metaKeys(e))e[k]=typeof e[k]==='number'?Number(f.get(k)):String(f.get(k)).trim();
 commit(p=>{if(isNew)p.equipment.push(e);else p.equipment[index]=e});
 if(isNew) navigate(link(e));
 else if(e.tag!==projectTag) navigate(equipmentScreen(e,e.points[pointIndex],tab),{replace:true,keepScroll:true});
 notify('Equipo guardado')
 })
}
function chooseMeasurement(){
 const entries=project.equipment.flatMap((e,i)=>e.points.map((p,j)=>[i+','+j,e.tag+' · '+p.id+' · '+p.name]));
 dialog('Seleccionar ubicación',select('location','Equipo y punto',entries,entries[0][0]),f=>{const [i,j]=f.get('location').split(',').map(Number);setTimeout(()=>measure(i,j),0)},'Continuar')
}
function pointForm(i,j){
 const e=project.equipment[i],isNew=j<0,p=isNew?{id:'',name:'',x:50,y:50,minimum_mm:'',alert_mm:'',elevation_m:0,measurements:[]}:structuredClone(e.points[j]);
 dialog(isNew?'Crear punto de monitoreo':'Editar punto',pointLocationFields(e,p)+
 field('id','Identificador TML',p.id)+field('cml','Identificador CML',p.cml||'')+field('name','Componente y orientación',p.name)+
 field('minimum_mm','Mínimo documentado (mm)',p.minimum_mm,'number','required min="0.001"')+field('alert_mm','Alerta (mm)',p.alert_mm,'number','required min="0.001"')+
 (e.family==='pipe'?select('geometry','Geometría del punto',[['supported','Tramo recto'],['accessory','Accesorio / codo']],p.geometry||(/codo/i.test(p.name)?'accessory':'supported')):'')+
 field('basis','Fuente del mínimo y criterio de alerta',p.basis||'Expediente académico del caso')+(e.family==='tank'?field('elevation_m','Cota inferior de la virola (m)',p.elevation_m,'number','required min="0"'):'')+
 '<small class="wide">Para medir en otra ubicación física, crea un TML nuevo y conserva este historial.</small>',f=>{
 const location=readLocation();
 if(location)p.location3d=location;else delete p.location3d;
 for(const k of ['name','id','cml','basis'])p[k]=f.get(k).trim();for(const k of ['x','y','minimum_mm','alert_mm','elevation_m'])if(f.has(k))p[k]=Number(f.get(k));
 if(f.has('geometry'))p.geometry=f.get('geometry');
 if(p.alert_mm<=p.minimum_mm)throw Error('La alerta debe superar el mínimo documentado.');
 commit(pr=>{const pts=pr.equipment[i].points;if(isNew)pts.push(p);else {
   auditThresholds(pts[j],p.minimum_mm,p.alert_mm,p.basis);
   pts[j]={...p,thresholdHistory:pts[j].thresholdHistory};
 }});
 if(isNew) navigate(equipmentScreen(e,p));
 else if(e.points[j].id!==p.id) navigate(equipmentScreen(e,p,tab),{replace:true,keepScroll:true});
 notify('Punto guardado');
 });
 const readLocation=initializePointLocation(e,p);
}
function imageForm(index){
 dialog('Cambiar esquema','<label class="wide">Esquema PNG o JPG · hasta 1,5 MB<input type="file" name="image" accept="image/png,image/jpeg" required></label><p class="wide muted">Revise las posiciones de los marcadores al cambiar el esquema. La imagen se incluye en el archivo de respaldo.</p>',async f=>{
 const file=f.get('image');if(file.size>1500000||!['image/png','image/jpeg'].includes(file.type))throw Error('Use PNG o JPG de hasta 1,5 MB.');
 const bitmap=await createImageBitmap(file);bitmap.close();const url=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)});commit(p=>p.equipment[index].image=url)
 })
}
function handleAction(act){
 const [e,,i]=current();
 if(act==='export')return projectBackup();
 if(act==='csv')return csvExport();
 if(act==='reset'){dialog('Recuperar demostración','<p class="wide">Se reemplazará el contenido guardado por el caso académico original. Exporta una copia desde el registro si necesitas conservar tus cambios.</p>',()=>{commit(p=>Object.assign(p,structuredClone(initialCase)));notify('Caso original recuperado')},'Recuperar');return}
 if(act==='import'){$('restore').click();return}
 if(act==='new'){dialog('Familia del equipo',select('family','Familia',Object.entries(family),'pipe'),f=>setTimeout(()=>editAsset(-1,f.get('family')),0),'Continuar');return}
 if(act==='measureAny')return chooseMeasurement();
 if(!e)return;
 if(act==='measure')return measure(i,pointIndex);
 if(act==='edit')return editAsset(i);
 if(act==='point'||act==='editpoint')return pointForm(i,act==='point'?-1:pointIndex);
 if(act==='image')return imageForm(i);
 if(act==='attach')return attachPdf(i)
}
$('restore').onchange=async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 try{if(file.size>10000000)throw Error('El proyecto supera 10 MB.');const data=JSON.parse(await file.text());evaluateAll(data);
 dialog('Recuperar proyecto','<p class="wide">El archivo contiene '+data.equipment.length+' equipos. Al recuperar el caso se reemplazarán los datos guardados en este navegador.</p>',()=>{commit(pr=>{Object.assign(pr,data);pr.comparisons=data.comparisons??[]});navigate('#equipos');notify('Proyecto recuperado')},'Recuperar')
 }catch(err){notify(message(err))}
};
document.addEventListener('click',event=>{
 const a=event.target.closest('[data-act],[data-tab],[data-pin],[data-status],[data-reading],[data-doc]');if(!a||!project)return;
 if(a.dataset.status) return navigate('#agenda',{filters:{statusFilter:a.dataset.status}});
 if(a.dataset.reading){const [,,i]=current();return measure(i,pointIndex,a.dataset.reading)}
 if(a.dataset.doc!==undefined)return openDocument(Number(a.dataset.doc));
 if(a.dataset.act){handleAction(a.dataset.act);return}
 if(a.dataset.tab||a.dataset.pin!==undefined){
  const [equipment]=current();
  const point=equipment?.points[a.dataset.pin===undefined?pointIndex:Number(a.dataset.pin)];
  if(equipment&&point) openEquipmentScreen(equipment,point,a.dataset.tab||tab,{keepScroll:a.dataset.pin!==undefined});
 }
});
document.addEventListener('input',ev=>{if(ev.target.id==='filter'){scheduleTag='';filter=ev.target.value;render();$('filter').focus();$('filter').setSelectionRange(filter.length,filter.length)}});
document.addEventListener('change', event => {
 const {id,value}=event.target;
 if(id==='designPoint'){
  const [equipment]=current();
  const point=equipment?.points[Number(value)];
  if(point) openEquipmentScreen(equipment,point,'diseno',{keepScroll:true});
  $('designPoint')?.focus();
  return;
 }
 if(id==='assessment') return dueDate(value);
 if(id==='familyFilter'){
  familyFilter=value;
  render();
 }
 if(id==='statusFilter'){
  statusFilter=value;
  render();
 }
});
function activateDeepLink(){
 const routeInfo=route();
 activateAssistantRoute(routeInfo);
 const [name,id,point,view]=routeInfo;
 if (name!=='equipo') return;
 const equipment=project.equipment.find(e=>e.tag===id);
 if (!equipment) return;
 currentId=id;
 const index=equipment.points.findIndex(p=>p.id===point);
 pointIndex=Math.max(0,index);
 tab=Object.hasOwn(equipmentTabs,view)?view:'monitoreo';
}
window.addEventListener('resize',()=>{if(project)drawTrend()});
async function start(){
 try{
 py=await loadPyodide({indexURL:new URL('runtime/',document.baseURI).href});
 for(const name of ['engineering','rbi','data_import']){const res=await fetch('./'+name+'.py?v='+(name==='engineering'?6:4));if(!res.ok)throw Error('No se pudo cargar '+name);py.FS.writeFile('/home/pyodide/'+name+'.py',await res.text())}
 py.runPython('from engineering import shutdown_forecast as _shutdown, compare_reading as _compare_reading');
 py.runPython('import json\nfrom engineering import demo_equipment, evaluate, wall_scenarios\nfrom rbi import rbi as _risk, DEFAULTS\nfrom data_import import read_measurements_csv as _read_csv, read_sqlite_catalog as _read_sqlite_catalog, read_sqlite_table as _read_sqlite_table\ndef _evaluate(obj): return evaluate(obj, _today)\ndef _simulate(obj): return evaluate(obj[\'equipment\'], max(_today, obj[\'date\']))\ndef _wall_scenarios(obj): return wall_scenarios(obj["point"], obj["lower"], obj["higher"])');
 py.globals.set('_today',today());template=JSON.parse(py.runPython('json.dumps(demo_equipment())'));
 const coords={pipe:[[27.5,48.6],[36.9,49.3],[74.6,44.2]],vessel:[[27.1,43.1],[44.5,51.3],[62.1,51.5]],tank:[[41,75.2],[45.6,59.2],[50.5,40.9]]};
 template.forEach(e=>e.points.forEach((p,i)=>{[p.x,p.y]=coords[e.family][i];p.cml='CML-0'+(i+1);p.basis='Mínimo del expediente académico; alerta con margen de '+fmt(p.alert_mm-p.minimum_mm)+' mm para intervención.'}));
 const defaultCase={version:1,equipment:structuredClone(template),rbi:{...JSON.parse(py.runPython('json.dumps(DEFAULTS)')),costBasis:defaultCostBasis}};
 defaultCase.comparisons=[];initialCase=structuredClone(defaultCase);project=defaultCase;analysis=evaluateAll(project);const raw=localStorage.getItem(key);storedCase=raw;
 if(raw){try{const temp=JSON.parse(raw);analysis=evaluateAll(temp);project=temp;$('saved').textContent='Caso recuperado'}catch{notify('Respaldo local incompatible. Se muestra el caso de demostración.')}}
 startNavigation()
 }catch(err){$('app').innerHTML='<h1>No se pudo abrir la aplicación</h1><p>'+esc(message(err))+'</p><p>Abra el enlace publicado o inicie el servidor local desde la carpeta del proyecto.</p>'}
}
start();

