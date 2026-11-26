"use strict";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const family={pipe:'Tubería',vessel:'Recipiente',tank:'Tanque'};
const navNames={inicio:'Vista general',equipos:'Registro de equipos',agenda:'Inspecciones',riesgo:'Análisis RBI'};
const key='estrato-project-v1';
let py, project, analysis=[], tab='monitoreo', pointIndex=0, currentId='', template, filter='', familyFilter='', statusFilter='', saveForm, assessmentDate='', initialCase;
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('es-CL',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Santiago'});
const dateLabel=s=>s?s.split('-').reverse().join('/'):'Por determinar';
const action=(label,id,primary=false)=>`<button type="button" data-act="${id}" class="${primary?'primary':''}">${esc(label)}</button>`;
const badge=s=>`<span class="pill ${({Normal:'ok',Alerta:'warn','Bajo mínimo':'bad','Inspección vencida':'bad',Alta:'bad',Media:'warn',Baja:'ok'})[s]||''}">${esc(s)}</span>`;
const metric=(label,val)=>`<div class="metric"><small>${esc(label)}</small><b>${esc(val)}</b></div>`;
const link=e=>'#equipo/'+encodeURIComponent(e.tag);
const photo=e=>e.image||'./assets/'+e.family+'.png';
const hero=(over,title,sub,buttons='')=>`<div class="hero"><div><div class="eyebrow">${esc(over)}</div><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div><div class="buttons">${buttons}</div></div>`;
function call(name,arg){py.globals.set('_payload',JSON.stringify(arg??null));return JSON.parse(py.runPython(`json.dumps(${name}(json.loads(_payload)),allow_nan=False)`))}
function notify(msg){$('toast').textContent=msg;$('toast').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').style.display='none',3400)}
function message(err){return String(err.message||err).split('\n').findLast(s=>s.startsWith('ValueError:'))?.replace('ValueError: ','')||String(err.message||err).split('\n')[0]}
const validText=value=>typeof value==='string'&&Boolean(value.trim());
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
 try{localStorage.setItem(key,JSON.stringify(copy))}catch{throw Error('No se pudo guardar en el navegador. Reduzca el tamaño de la imagen o exporte el caso.')}
 project=copy;analysis=result;$('saved').textContent='Guardado en este navegador';render()
}
function dialog(title,body,callback,submit='Guardar'){
 $('fields').innerHTML='<h2>'+esc(title)+'</h2><div class="gridform">'+body+'</div>';$('error').textContent='';$('submit').textContent=submit;saveForm=callback;$('modal').showModal()
}
$('cancel').onclick=()=>$('modal').close();
$('form').onsubmit=async e=>{e.preventDefault();$('submit').disabled=true;try{await saveForm(new FormData(e.target));$('modal').close()}catch(err){$('error').textContent=message(err)}finally{$('submit').disabled=false}};
const field=(name,label,value,type='text',attrs='required')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''} ${attrs}></label>`;
const opts=(values,selected)=>values.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(l)}</option>`).join('');
const select=(name,label,list,value)=>`<label>${esc(label)}<select name="${name}">${opts(list,value)}</select></label>`;
function route(){const [name,id]=location.hash.slice(1).split('/');try{return [name||'inicio',id?decodeURIComponent(id):'']}catch{return ['equipos','']}}
function current(){const [,id]=route();const i=project.equipment.findIndex(e=>e.tag===id);return [project.equipment[i],analysis[i],i]}
function cards(list){return '<div class="assets">'+list.map(([e,r])=>`<a class="card" href="${esc(link(e))}"><img src="${esc(photo(e))}" alt="Esquema de ${esc(e.tag)}"><div class="cardbody"><div class="row"><span class="mono">${esc(e.tag)}</span>${badge(r.status)}</div><h3>${esc(e.name)}</h3><small>${esc(family[e.family])} · ${e.points.length} ubicaciones</small><div class="card-meta"><span>Próxima medición</span><strong>${dateLabel(r.due)}</strong></div></div></a>`).join('')+'</div>'}
function schedule(rows){return '<div class="scroll"><table><thead><tr><th>Equipo / punto</th><th>Componente</th><th>Condición</th><th>Próxima medición</th><th>Criterio gobernante</th></tr></thead><tbody>'+rows.map(({e,p,r})=>`<tr><td><a href="${esc(link(e))}" data-point="${esc(p.id)}">${esc(e.tag)} · ${esc(p.id)}</a></td><td>${esc(p.name)}</td><td>${badge(r.status)}${r.overdue && r.status!=='Inspección vencida'?'<small class="overdue-text">Fecha vencida</small>':''}</td><td>${dateLabel(r.due)}</td><td>${esc(r.governing||'Revisar historial')}</td></tr>`).join('')+'</tbody></table></div>'}
function allRows(){return project.equipment.flatMap((e,i)=>e.points.map((p,j)=>({e,p,r:analysis[i].points[j]}))).sort((a,b)=>(a.r.due||'9999').localeCompare(b.r.due||'9999'))}
function overview(){
 const rows=allRows(),eq=project.equipment;
 return '<div class="dashboard-intro">'+hero('CONTROL DE INTEGRIDAD','Vista general','Condición y seguimiento de los equipos estáticos.',action('Exportar caso','export')+action('＋ Registrar medición','measureAny',true))+'</div>'+
 '<div class="kpis">'+[['Equipos registrados',eq.length],['Puntos de monitoreo',rows.length],['Puntos que requieren revisión',rows.filter(x=>x.r.status!=='Normal'||x.r.overdue).length]].map(([l,v])=>`<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join('')+'</div>'+statusSummary(rows)+'<div class="row"><h2>Equipos monitoreados</h2><a class="link" href="#equipos">Ver registro →</a></div>'+cards(eq.slice(0,3).map((e,i)=>[e,analysis[i]]))+'<div class="panel"><div class="row"><h2>Próximas inspecciones</h2><a class="link" href="#agenda">Ver todas →</a></div>'+schedule(rows.filter(x=>x.r.due).slice(0,5))+'</div>'
}
function listPage(name){
 const isEq=name==='equipos',states=['Normal','Alerta','Bajo mínimo','Inspección vencida','Información insuficiente'];
 const rows=visibleSchedule();
 const entries=project.equipment.map((e,i)=>[e,analysis[i]]).filter(([e,r])=>matchesAsset(e)&&matchesCondition(r,statusFilter));
 return hero('GESTIÓN DE ACTIVOS',navNames[name],isEq?'Antecedentes, esquemas y mediciones por equipo.':'Fechas y criterios de inspección por punto de monitoreo.',isEq?action('Caso original','reset')+action('Importar caso','import')+action('Exportar','export')+action('＋ Crear equipo','new',true):action('Exportar agenda CSV','csv'))+
 `<div class="filters"><input id="filter" aria-label="Buscar por TAG o ubicación" placeholder="Buscar TAG, planta o área" value="${esc(filter)}"><select id="familyFilter" aria-label="Familia">${opts([['','Todas las familias'],...Object.entries(family)],familyFilter)}</select><select id="statusFilter" aria-label="Condición">${opts([['','Todas las condiciones'],...states.map(s=>[s,s])],statusFilter)}</select>${isEq?'':'<label class="assessment">Evaluar a la fecha <input id="assessment" type="date" min="'+today()+'" value="'+(assessmentDate||today())+'"></label>'}</div>`+
 (isEq?(entries.length?cards(entries):'<p class="empty">Sin equipos para este filtro.</p>'):(rows.length?'<div class="panel">'+schedule(rows)+'</div>':'<p class="empty">Sin puntos para este filtro.</p>'))
}

