"use strict";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const family={pipe:'Tubería',vessel:'Recipiente',tank:'Tanque'};
const navNames={inicio:'Vista general',equipos:'Registro de equipos',agenda:'Inspecciones',parada:'Simular parada',riesgo:'Análisis RBI',fuentes:'Fuentes de datos',asistente:'Asistente'};
const equipmentTabs={monitoreo:'Monitoreo',diseno:'Cálculo de diseño',simular:'Simular lectura',ficha:'Ficha técnica',documentos:'Documentos'};
const key='estrato-project-v1';
let py, project, analysis=[], tab='monitoreo', pointIndex=0, currentId='', template, filter='', familyFilter='', statusFilter='', saveForm, assessmentDate='', initialCase, storedCase;
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('es-CL',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Santiago'});
const dateLabel=s=>typeof s==='string'&&s?s.split('-').reverse().join('/'):'Por determinar';
const action=(label,id,primary=false)=>`<button type="button" data-act="${id}" class="${primary?'primary':''}">${esc(label)}</button>`;
const badge=s=>`<span class="pill ${({Normal:'ok',Alerta:'warn','Bajo mínimo':'bad','Inspección vencida':'bad','Con fecha vencida':'warn','Información insuficiente':'pending',Alta:'bad',Media:'warn',Baja:'ok','Nominal suficiente':'ok','Nominal bajo el requisito':'bad',Verificado:'ok',Revisar:'warn'})[s]||''}">${esc(s)}</span>`;
const metric=(label,val)=>`<div class="metric"><small>${esc(label)}</small><b>${esc(val)}</b></div>`;
const link=e=>'#equipo/'+encodeURIComponent(e.tag);
const photo=e=>e.image||'./assets/'+e.family+'.png';
const hero=(over,title,sub,buttons='')=>`<div class="hero"><div><div class="eyebrow">${esc(over)}</div><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div><div class="buttons">${buttons}</div></div>`;
function call(name,arg){py.globals.set('_payload',JSON.stringify(arg??null));return JSON.parse(py.runPython(`json.dumps(${name}(json.loads(_payload)),allow_nan=False)`))}
function notify(msg){$('toast').textContent=msg;$('toast').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').style.display='none',3400)}
function message(err){return String(err.message||err).split('\n').findLast(s=>s.startsWith('ValueError:'))?.replace('ValueError: ','')||String(err.message||err).split('\n')[0]}
const validText=value=>typeof value==='string'&&Boolean(value.trim());
function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function evaluateAll(p){
 if(!p||p.version!==1||!Array.isArray(p.equipment)||!p.equipment.length||!p.rbi)throw Error('Formato de proyecto incompatible.');
 const tags=new Set();
 if(p.rbi.costBasis!==undefined && !validText(p.rbi.costBasis))throw Error('Indica la base de valoración económica.');
 const results=p.equipment.map(e=>{
 if(!e || !Object.hasOwn(family,e.family)||!validText(e.tag)||!validText(e.name)||tags.has(e.tag.toUpperCase())||!Array.isArray(e.points)||!e.points.length)throw Error('Revise los TAG, familias y puntos del archivo.');
 tags.add(e.tag.toUpperCase());
 if(e.documents!==undefined && (!Array.isArray(e.documents) || e.documents.some(doc =>
 !doc || !validText(doc.name) || !Number.isInteger(doc.bytes) || doc.bytes<=0 || doc.bytes>mb ||
 typeof doc.data!=='string' || !/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=]+$/.test(doc.data) ||
 atob(doc.data.split(',')[1]).length!==doc.bytes))) throw Error('Documento PDF incompatible.');

 if(e.image&&!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(e.image))throw Error('El esquema debe ser PNG o JPG.');
 const ids=new Set();
 for(const p of e.points){if(!p||!validText(p.id)||!validText(p.name)||ids.has(p.id.toUpperCase())||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100)||!Array.isArray(p.measurements))throw Error('Punto o coordenada inválidos.');ids.add(p.id.toUpperCase());
 checkPointLocation(e,p.location3d);
 validatePointInterventions(p);
 for(const m of p.measurements){
  if(!m||typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||m.date>today()||!Number.isFinite(m.thickness)||
    !validText(m.technique)||(m.epoch!=null&&(!Number.isInteger(m.epoch)||m.epoch<0))||
    (m.revisions!==undefined&&(!Array.isArray(m.revisions)||m.revisions.some(rev=>!rev?.previous||!validText(rev.reason)||typeof rev.date!=='string'||typeof rev.previous.date!=='string'))))
  throw Error('Revise las mediciones y correcciones del archivo.');
 }}

 return call('_evaluate',e)});
 if(typeof p.rbi!=='object'||Array.isArray(p.rbi))throw Error('Escenario RBI incompatible.');
 call('_risk',p.rbi);return results;
}
function commit(change){
 const copy=structuredClone(project);change(copy);const result=evaluateAll(copy);
 if(localStorage.getItem(key)!==storedCase)throw Error('El caso cambió en otra pestaña. Recarga la aplicación para abrir la versión guardada.');
 const serialized=JSON.stringify(copy);
 try{localStorage.setItem(key,serialized)}catch{throw Error('No se pudo guardar en el navegador. Reduzca el tamaño de la imagen o exporte el caso.')}
 storedCase=serialized;project=copy;analysis=result;$('saved').textContent='Guardado en este navegador';render()
}
function dialog(title,body,callback,submit='Guardar'){
 $('fields').innerHTML='<h2 id="dialog-title">'+esc(title)+'</h2><div class="gridform">'+body+'</div>';$('error').textContent='';$('submit').textContent=submit;saveForm=callback;$('modal').showModal()
}
$('cancel').onclick=()=>$('modal').close();
$('form').onsubmit=async e=>{e.preventDefault();$('submit').disabled=true;try{await saveForm(new FormData(e.target));$('modal').close()}catch(err){$('error').textContent=message(err)}finally{$('submit').disabled=false}};
const field=(name,label,value,type='text',attrs='required')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''} ${attrs}></label>`;
const opts=(values,selected)=>values.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(l)}</option>`).join('');
const select=(name,label,list,value)=>`<label>${esc(label)}<select name="${name}">${opts(list,value)}</select></label>`;
function route(){
 const [name,id,point='',view='',proposal='']=location.hash.slice(1).split('/');
 try{return [name||'inicio',id?decodeURIComponent(id):'',decodeURIComponent(point),decodeURIComponent(view),proposal]}catch{return ['equipos','']}
}
function current(){const [,id]=route();const i=project.equipment.findIndex(e=>e.tag===id);return [project.equipment[i],analysis[i],i]}
const designCodes = {pipe:'ASME B31.3', vessel:'ASME VIII-1', tank:'API 650'};

function panelHeading(title, detail='', actionMarkup='') {
 return '<div class="row panel-heading section-heading"><div><h2>'+esc(title)+'</h2>'+
   (detail?'<p class="muted">'+esc(detail)+'</p>':'')+'</div>'+actionMarkup+'</div>';
}

function cards(list) {
 return '<div class="assets">'+list.map(([e,result])=>`<a class="card" href="${esc(link(e))}">
   <div class="asset-visual"><img src="${esc(photo(e))}" alt="Esquema de ${esc(e.tag)}"></div>
   <div class="cardbody">
    <div class="row"><span class="mono">${esc(e.tag)}</span>${badge(result.status)}</div>
    <h3>${esc(e.name)}</h3>
    <small>${esc(family[e.family])} · ${esc(designCodes[e.family])} · ${e.points.length} TML</small>
    <div class="card-meta"><span>Próxima medición</span><strong class="table-number">${dateLabel(result.due)}</strong></div>
   </div>
  </a>`).join('')+'</div>';
}

function schedule(rows, compact=false) {
 if (!rows.length) return '<p class="empty">Sin fechas programadas.</p>';
 const headings='<th scope="col" class="col-asset">Equipo / punto</th><th scope="col" class="col-state">Condición</th>'+
   '<th scope="col" class="align-right col-thickness">Espesor [mm]</th><th scope="col" class="col-date">Próxima medición</th>'+
   (compact?'':'<th scope="col" class="col-rule">Criterio gobernante</th>');
 const body=rows.map(({e,p,r})=>`<tr>
   <td class="asset-cell"><a href="${esc(equipmentScreen(e,p))}" class="table-number">${esc(e.tag)} · ${esc(p.id)}</a><small>${esc(p.name)}</small>
     <small class="agenda-mobile-reading">${Number.isFinite(r.current_mm)?fmt(r.current_mm,2)+' mm':'Sin lectura'}</small>
     ${compact?'':'<details class="agenda-mobile-rule"><summary>Criterio</summary><small>'+esc(r.governing||'Revisar historial')+'</small></details>'}</td>
   <td>${badge(r.status)}${r.overdue && r.status!=='Inspección vencida'?'<small class="overdue-text">Fecha vencida</small>':''}</td>
   <td class="table-number align-right col-thickness">${fmt(r.current_mm,2)}</td>
   <td class="table-number">${dateLabel(r.due)}</td>
   ${compact?'':'<td class="col-rule">'+esc(r.governing||'Revisar historial')+'</td>'}
  </tr>`).join('');
 return '<div class="scroll table-frame"><table class="data-table agenda-table'+(compact?' compact-table':'')+'"><thead><tr>'+
   headings+'</tr></thead><tbody>'+body+'</tbody></table></div>';
}

function allRows() {
 return project.equipment.flatMap((e,i)=>e.points.map((p,j)=>({e,p,r:analysis[i].points[j]})))
   .sort((a,b)=>(a.r.due||'9999').localeCompare(b.r.due||'9999'));
}

function overview() {
 const rows=allRows(), assets=project.equipment;
 const review=rows.filter(({r})=>r.status!=='Normal'||r.overdue).length;
 const counts=[['Equipos registrados',assets.length],['Puntos de monitoreo',rows.length],['Puntos que requieren revisión',review]];
 const metrics=counts.map(([label,count],i)=>`<div class="kpi ${i===2?'priority'+(review?' has-review':''):''}">
   <small>${label}</small><b>${count}</b></div>`).join('');
 const headline=hero('CONTROL DE INTEGRIDAD','Vista general',
   'Estado de los equipos, mediciones y próximas inspecciones.',
   '<a href="#asistente" class="button-link">Consultar al asistente</a><a href="#parada" class="button-link">Simular parada</a>'+action('Exportar caso','export')+action('＋ Registrar medición','measureAny',true));
 return '<div class="dashboard-intro">'+headline+'</div><div class="kpis">'+metrics+'</div>'+
   '<div class="overview-workspace"><section class="panel">'+
   panelHeading('Agenda de inspección','Evaluación al '+dateLabel(assessmentDate||today()),'<a href="#agenda" class="link">Ver agenda →</a>')+
   schedule(rows.filter(({r})=>r.due).slice(0,5),true)+'</section>'+
   '<section class="panel">'+panelHeading('Condición de los puntos','Filtra la agenda por condición.')+statusSummary(rows)+'</section></div>'+
   wallPortfolio(rows,true)+
   panelHeading('Equipos monitoreados','', '<a href="#equipos" class="link">Ver registro →</a>')+
   cards(assets.slice(0,3).map((e,i)=>[e,analysis[i]]));
}

function listPage(name) {
 const isEquipment=name==='equipos';
 const states=['Normal','Alerta','Bajo mínimo','Inspección vencida','Información insuficiente'];
 const rows=visibleSchedule();
 const entries=project.equipment.map((e,i)=>[e,analysis[i]]).filter(([e,r])=>matchesAsset(e)&&matchesCondition(r,statusFilter));
 const actions=isEquipment
   ?action('Caso original','reset')+action('Importar caso','import')+action('Exportar','export')+action('＋ Crear equipo','new',true)
   :'<a href="#parada" class="button-link">Simular parada</a>'+action('Exportar agenda CSV','csv');
 const heading=hero(isEquipment?'GESTIÓN DE ACTIVOS':'PLANIFICACIÓN',navNames[name],
   isEquipment?'Antecedentes, esquemas y mediciones por equipo.':'Fechas y criterios de inspección por punto de monitoreo.',actions);
 const filters=`<div class="filters">
  <label class="filter-field"><span>Equipo, punto o ubicación</span><input id="filter" aria-label="Buscar por equipo, punto o ubicación" placeholder="Ej. codo, virola o TML-02" value="${esc(filter)}"></label>
  <label class="filter-field"><span>Familia</span><select id="familyFilter" aria-label="Familia">${opts([['','Todas las familias'],...Object.entries(family)],familyFilter)}</select></label>
  <label class="filter-field"><span>${isEquipment?"Condición global del equipo":"Condición del punto"}</span><select id="statusFilter" aria-label="Condición">${opts([['','Todas las condiciones'],...states.map(s=>[s,s])],statusFilter)}</select></label>
  ${isEquipment?'':'<label class="assessment">Evaluar a la fecha <input id="assessment" type="date" min="'+today()+'" value="'+(assessmentDate||today())+'"></label>'+scheduleWindowInput()}
 </div>`;
 const content=isEquipment
   ?entries.length
     ?panelHeading('Equipos registrados',entries.length+' de '+project.equipment.length+' equipos')+cards(entries)
     :'<p class="empty panel">Sin equipos para este filtro.</p>'
   :'<section class="panel">'+panelHeading('Programación de inspecciones',rows.length+' '+(rows.length===1?'punto de monitoreo':'puntos de monitoreo'))+
     (rows.length?schedule(rows):'<p class="empty">'+(scheduleDays?'Sin inspecciones programadas en este plazo.':'Sin puntos para este filtro.')+'</p>')+'</section>';
 const interventions=isEquipment?'':wallPortfolio(allRows().filter(({e,p,r})=>
   matchesAsset(e,p)&&matchesCondition(r,statusFilter)&&(!scheduleTag||e.tag===scheduleTag)));
 const count=isEquipment && statusFilter ? allRows().filter(({e,p,r})=>matchesAsset(e,p)&&matchesCondition(r,statusFilter)).length : 0;
 const pointLink=isEquipment && statusFilter ? '<p class="note">La condición global resume el estado más crítico del equipo. '+(count?action('Ver puntos con este filtro ('+count+')','filteredPoints'):'Ningún punto coincide con estos filtros.')+'</p>' : '';
 return heading+filters+pointLink+interventions+content;
}
