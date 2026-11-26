function render(){
 const [name]=route();$('crumb').textContent=name==='equipo'?'Ficha de equipo':navNames[name]||navNames.inicio;
 document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('on',a.hash==='#'+(name==='equipo'?'equipos':name)));
 $('app').innerHTML=name==='equipo'?detail():name==='riesgo'?riskPage():['equipos','agenda'].includes(name)?listPage(name):overview()+validationPanel();
 drawTrend()
}
function editAsset(index,newFamily){
 const isNew=index<0,e=structuredClone(isNew?template.find(e=>e.family===newFamily):project.equipment[index]);
 if(isNew){e.tag='';e.name='';e.points=e.points.slice(0,1);e.points[0].measurements=[]}
 const fields=metaKeys(e).map(k=>{
 let name=metaLabels[k];
 if(k==='diameter_mm')name+=' · '+({pipe:'exterior',vessel:'interior corroído',tank:'nominal'}[e.family]);
 if(k==='temp_c')name+=' · '+({pipe:'20 a 148',vessel:'20 a 150',tank:'20 a 40'}[e.family]);
 return field(k,name,e[k],typeof e[k]==='number'?'number':'text',k==='material'?'readonly':'required')}).join('');
 dialog(isNew?'Crear '+family[e.family].toLowerCase():'Editar '+e.tag,fields,f=>{
 for(const k of metaKeys(e))e[k]=typeof e[k]==='number'?Number(f.get(k)):String(f.get(k)).trim();
 commit(p=>{if(isNew)p.equipment.push(e);else p.equipment[index]=e});location.hash=link(e);notify('Equipo guardado')
 })
}
function measure(i,j){
 const e=project.equipment[i];const p=e.points[j];const latest=[...p.measurements].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
 dialog('Registrar medición',`<p class="wide muted">${esc(e.tag)} · ${esc(p.id+' · '+p.name)}</p>`+
 field('date','Fecha de medición',today(),'date',`required max="${today()}"`)+field('thickness','Espesor medido','','number','required min="0"')+
 select('unit','Unidad',[['mm','Milímetros'],['in','Pulgadas']],'mm')+field('technique','Técnica','UT')+
 select('newSeries','Comparabilidad',[['no','Continuar la misma serie'],['yes','Nueva serie por reparación, reemplazo o reubicación']],'no')+
 field('notes','Observación','','text','maxlength="500"'),f=>{
 const date=f.get('date');if(latest&&date<=latest.date)throw Error('La nueva campaña debe ser posterior a la última lectura del punto.');
 const restart=f.get('newSeries')==='yes',notes=f.get('notes').trim();if(restart&&!notes)throw Error('Describa el cambio que da inicio a la nueva serie.');
 commit(pr=>pr.equipment[i].points[j].measurements.push({date,thickness:Number(f.get('thickness')),unit:f.get('unit'),technique:f.get('technique').trim(),notes,epoch:restart?Number(latest?.epoch||0)+1:(latest?.epoch||0)}));
 currentId=e.tag;tab='monitoreo';pointIndex=j;location.hash=link(e);render();notify('Medición guardada y evaluación actualizada')
 })
}
function chooseMeasurement(){
 const entries=project.equipment.flatMap((e,i)=>e.points.map((p,j)=>[i+','+j,e.tag+' · '+p.id+' · '+p.name]));
 dialog('Seleccionar ubicación',select('location','Equipo y punto',entries,entries[0][0]),f=>{const [i,j]=f.get('location').split(',').map(Number);setTimeout(()=>measure(i,j),0)},'Continuar')
}
function pointForm(i,j){
 const e=project.equipment[i],isNew=j<0,p=isNew?{id:'',name:'',x:50,y:50,minimum_mm:'',alert_mm:'',elevation_m:0,measurements:[]}:structuredClone(e.points[j]);
 dialog(isNew?'Crear punto de monitoreo':'Editar punto',field('id','Identificador TML',p.id)+field('cml','Identificador CML',p.cml||'')+field('name','Componente y orientación',p.name)+field('x','Posición horizontal (%)',p.x,'number','required min="0" max="100"')+
 field('y','Posición vertical (%)',p.y,'number','required min="0" max="100"')+field('minimum_mm','Mínimo documentado (mm)',p.minimum_mm,'number','required min="0.001"')+field('alert_mm','Alerta (mm)',p.alert_mm,'number','required min="0.001"')+
 field('basis','Fuente del mínimo y criterio de alerta',p.basis||'Expediente académico del caso')+(e.family==='tank'?field('elevation_m','Cota inferior de la virola (m)',p.elevation_m,'number','required min="0"'):'')+
 '<small class="wide">Si cambia la ubicación física, cree otro punto para conservar el historial anterior.</small>',f=>{
 for(const k of ['name','id','cml','basis'])p[k]=f.get(k).trim();for(const k of ['x','y','minimum_mm','alert_mm','elevation_m'])if(f.has(k))p[k]=Number(f.get(k));
 if(p.alert_mm<=p.minimum_mm)throw Error('La alerta debe superar el mínimo documentado.');
 commit(pr=>{const pts=pr.equipment[i].points;if(isNew)pts.push(p);else pts[j]=p});
 pointIndex=isNew?e.points.length:j;render()
 })
}
function imageForm(index){
 dialog('Cambiar esquema','<label class="wide">Esquema PNG o JPG · hasta 1,5 MB<input type="file" name="image" accept="image/png,image/jpeg" required></label><p class="wide muted">Revise las posiciones de los marcadores al cambiar el esquema. La imagen se incluye en el archivo de respaldo.</p>',async f=>{
 const file=f.get('image');if(file.size>1500000||!['image/png','image/jpeg'].includes(file.type))throw Error('Use PNG o JPG de hasta 1,5 MB.');
 const bitmap=await createImageBitmap(file);bitmap.close();const url=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)});commit(p=>p.equipment[index].image=url)
 })
}
function handleAction(act){
 const [e,,i]=current();
 if(act==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='estrato-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return}
 if(act==='import'){$('restore').click();return}
 if(act==='riskEdit'){dialog('Editar escenario RBI',Object.keys(rbiLabels).map(k=>field(k,rbiLabels[k],project.rbi[k],'number','required min="0"')).join(''),f=>commit(p=>{for(const k of Object.keys(rbiLabels))p.rbi[k]=Number(f.get(k))}));return}
 if(act==='new'){dialog('Familia del equipo',select('family','Familia',Object.entries(family),'pipe'),f=>setTimeout(()=>editAsset(-1,f.get('family')),0),'Continuar');return}
 if(act==='measureAny')return chooseMeasurement();
 if(!e)return;
 if(act==='measure')return measure(i,pointIndex);
 if(act==='edit')return editAsset(i);
 if(act==='point'||act==='editpoint')return pointForm(i,act==='point'?-1:pointIndex);
 if(act==='image')return imageForm(i)
}
$('restore').onchange=async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 try{if(file.size>10000000)throw Error('El proyecto supera 10 MB.');const data=JSON.parse(await file.text());evaluateAll(data);
 dialog('Recuperar proyecto','<p class="wide">El archivo contiene '+data.equipment.length+' equipos. Al recuperar el caso se reemplazarán los datos guardados en este navegador.</p>',()=>{commit(pr=>{Object.assign(pr,data)});location.hash='#equipos';notify('Proyecto recuperado')},'Recuperar')
 }catch(err){notify(message(err))}
};
document.addEventListener('click',event=>{
 const a=event.target.closest('[data-act],[data-tab],[data-pin],[data-point]');if(!a||!project)return;
 if(a.dataset.act){handleAction(a.dataset.act);return}
 if(a.dataset.tab){tab=a.dataset.tab;render();return}
 if(a.dataset.pin!==undefined){pointIndex=Number(a.dataset.pin);render();return}
 if(a.dataset.point){const tag=decodeURIComponent(a.hash.slice(8));const e=project.equipment.find(e=>e.tag===tag);if(e){currentId=tag;tab='monitoreo';pointIndex=e.points.findIndex(p=>p.id===a.dataset.point);if(location.hash===a.hash)render()}}
});
document.addEventListener('input',ev=>{if(ev.target.id==='filter'){filter=ev.target.value;render();$('filter').focus();$('filter').setSelectionRange(filter.length,filter.length)}});
document.addEventListener('change',ev=>{if(ev.target.id==='familyFilter'){familyFilter=ev.target.value;render()}if(ev.target.id==='statusFilter'){statusFilter=ev.target.value;render()}});
window.addEventListener('hashchange',()=>{if(project){render();scrollTo(0,0)}});
window.addEventListener('resize',()=>{if(project)drawTrend()});
async function start(){
 try{
 py=await loadPyodide({indexURL:new URL('runtime/',document.baseURI).href});
 for(const name of ['engineering','rbi']){const res=await fetch('./'+name+'.py');if(!res.ok)throw Error('No se pudo cargar '+name);py.FS.writeFile('/home/pyodide/'+name+'.py',await res.text())}
 py.runPython('import json\nfrom engineering import demo_equipment, evaluate\nfrom rbi import rbi as _risk, DEFAULTS\ndef _evaluate(obj): return evaluate(obj, _today)');
 py.globals.set('_today',today());template=JSON.parse(py.runPython('json.dumps(demo_equipment())'));
 const coords={pipe:[[27.5,48.6],[36.9,49.3],[74.6,44.2]],vessel:[[27.1,43.1],[44.5,51.3],[62.1,51.5]],tank:[[41,75.2],[45.6,59.2],[50.5,40.9]]};
 template.forEach(e=>e.points.forEach((p,i)=>{[p.x,p.y]=coords[e.family][i];p.cml='CML-0'+(i+1);p.basis='Mínimo del expediente académico; alerta con margen de '+fmt(p.alert_mm-p.minimum_mm)+' mm para intervención.'}));
 const defaultCase={version:1,equipment:structuredClone(template),rbi:JSON.parse(py.runPython('json.dumps(DEFAULTS)'))};
 project=defaultCase;analysis=evaluateAll(project);const raw=localStorage.getItem(key);
 if(raw){try{const temp=JSON.parse(raw);analysis=evaluateAll(temp);project=temp;$('saved').textContent='Caso recuperado'}catch{notify('Respaldo local incompatible. Se muestra el caso de demostración.')}}
 render()
 }catch(err){$('app').innerHTML='<h1>No se pudo abrir la aplicación</h1><p>'+esc(message(err))+'</p><p>Abra el enlace publicado o inicie el servidor local desde la carpeta del proyecto.</p>'}
}
start();

