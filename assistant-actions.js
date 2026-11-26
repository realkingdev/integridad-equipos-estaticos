let scheduleDays=0, scheduleTag='';
let pendingReading;

function scheduleWindow(value) {
  const days=Number(value);
  return Number.isInteger(days)&&days>=1&&days<=730?days:0;
}

function scheduleEndDate(days,start=assessmentDate||today()) {
  const date=new Date(start+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function matchesWindow(result,days) {
  if (!days) return true;
  const start=assessmentDate||today();
  return !!result.due&&result.due>=start&&result.due<=scheduleEndDate(days,start);
}

function scheduleWindowInput() {
  return '<label class="schedule-window" title="Incluye fechas desde la evaluación hasta el fin del plazo">'+
    'Próximos días <input id="schedule-days" type="number" min="1" max="730" value="'+(scheduleDays||'')+'" placeholder="Todos">'+
    '</label>'+(scheduleDays?'<button type="button" data-clear-window>Quitar plazo</button>':'');
}

function openAgendaLink(familyName, days, tag='') {
  return '#agenda/'+familyName+'/'+days+(tag?'/'+encodeURIComponent(tag):'');
}

function validReadingProposal(raw) {
  const segments=raw?.match(/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)-(mm|in)$/i);
  if (!segments) return null;
  const value=Number(segments[1]);
  return Number.isFinite(value)&&value>=0?{value,unit:segments[2]}:null;
}

function activateAssistantRoute(routeInfo) {
  const [name,id,point,view,proposal]=routeInfo;
  pendingReading=null;
  if (name==='agenda') {
    scheduleDays=scheduleWindow(point);
    scheduleTag=point?view:'';
    if (point) {
      familyFilter=Object.hasOwn(family,id)?id:'';
      statusFilter='';
      filter=view;
    }
    return;
  }
  if (name==='equipo'&&view==='simular') {
    const parsed=validReadingProposal(proposal);
    if (parsed) pendingReading={tag:id,point,...parsed};
  }
}
function applyAssistantReading(form, context) {
  if (form.dataset.scenario!=='inspection'||pendingReading?.tag!==context.equipment.tag||
      pendingReading.point!==context.point.id) return;
  const reading=latestMeasurement(context.point);
  const storageUnit=reading?.unit||'mm';
  const scale=storageUnit===pendingReading.unit?1:storageUnit==='mm'?25.4:1/25.4;
  const raw=pendingReading.value*scale;
  if (Number.isFinite(raw)) {
    form.elements.reading.value=editableNumber(Number(raw.toPrecision(13)));
    notify('Lectura cargada en la simulación');
  }
  pendingReading=null;
}

function latestMeasurement(point) {
  return point.measurements.reduce((last,reading)=>!last||last.date<reading.date?reading:last,null);
}

function agendaAnswer(question, rows, assets) {
  const time=chatNormalize(question).match(/\b(\d+)\s+dias\b/);
  if (!time||!/venc|proxim|inspec|agenda|plazo/.test(chatNormalize(question))) return;
  const days=scheduleWindow(time[1]);
  if (!days) return {body:'Elige un plazo entre 1 y 730 días para consultar la agenda.',links:[chatLink('Abrir agenda','#agenda')]};
  const q=chatNormalize(question);
  const familyName=/tuberia|caneria|circuito/.test(q)?'pipe':/virola|tanque|estanque/.test(q)?'tank':
    /recipiente|separador/.test(q)?'vessel':'todas';
  const tag=assets.length===1&&containsPhrase(q,chatNormalize(assets[0].tag))?assets[0].tag:'';
  const scopedRows=rows.filter(({e,r})=>(familyName==='todas'||e.family===familyName)&&(!tag||e.tag===tag)&&matchesWindow(r,days));
  const title='Inspecciones en los próximos '+days+' días · Hasta '+dateLabel(scheduleEndDate(days));
  const report=chatList(scopedRows,title);
  return {...report,links:[chatLink('Abrir agenda de '+days+' días',openAgendaLink(familyName,days,tag)),...(scopedRows.length?report.links:[])]};
}

function simulationAnswer(question, namedRows, assets) {
  const q=chatNormalize(question);
  if (!/\b(?:simul\w*|que pasa si|que pasaria si|si midiera|si mide|probar)\b/.test(q)) return;
  const specified=question.match(/(?<![-\w])(\d+(?:[.,]\d+)?)\s*(mm|mil[ií]metros?|in|pulgadas?)\b/i);
  const implicit=question.match(/\b(?:mide|midiera|midiendo|espesor (?:de|a))\s+(\d+(?:[.,]\d+)?)/i);
  if (!specified&&!implicit) return;
  const value=localizedNumber((specified||implicit)[1]);
  if (!Number.isFinite(value)||value<0) return;
  const unit=specified&&/^(?:in|pulg)/i.test(specified[2])?'in':'mm';
  const use=namedRows.length?namedRows:assets.length===1?allRows().filter(({e})=>e===assets[0]):[];
  const title=fmt(value,3)+' '+unit;
  const links=use.slice(0,6).map(({e,p})=>chatLink('Simular '+e.tag+' · '+p.id,pointHref(e,p)+'/simular/'+value+'-'+unit));
  if (use.length===1) return {body:'Abre la simulación para evaluar '+title+' en '+use[0].e.tag+' · '+use[0].p.id+
    '. Puedes revisar la condición y fecha proyectada antes de aplicar cambios.',links};
  if (use.length) return {body:'Encontré varios puntos para evaluar '+title+'. Selecciona la ubicación que quieres simular.',links};
  return {body:'Indica el TAG y el TML o el nombre del punto para preparar la simulación de '+title+'.',links:[chatLink('Registro de equipos','#equipos')]};
}

document.addEventListener('change',event=>{
  const input=event.target;
  if (input.id!=='schedule-days') return;
  const days=scheduleWindow(input.value);
  if (!days&&input.value) notify('Ingresa un plazo entre 1 y 730 días.');
  scheduleDays=days;
  render();
  $('schedule-days')?.focus();
});
document.addEventListener('click',event=>{
  if (!event.target.closest('[data-clear-window]')) return;
  scheduleDays=0;
  render();
});

