"use strict";

const guideTopics = {
  measure: {
    question: '¿Cómo registro una medición?',
    answer: 'Selecciona el equipo y el TML. En Registrar medición, ingresa la fecha, el espesor, la unidad y la técnica. Si mediste la misma pared, conserva la serie y pulsa Guardar para recalcular.',
    label: 'Abrir formulario de medición',
    match: /(?:regist|agreg|anot|ingres|carg|guard|tomar|realiz|hacer|hago).*?(?:medici|lectura|espesor|\d+[.,]?\d*\s*mm)|nuev[oa]s? (?:lectura|medicion)|como (?:mido|medir)|\b(?:medi|medimos)\b/
  },
  zero: {
    question: '¿Dónde marco el inicio de los ángulos en 3D?',
    answer: 'En Editar punto, pulsa Marcar inicio (0°) en el modelo y toca la pared en la dirección de una marca reconocible. Luego toca el lugar de la medición y guarda. En un tanque, la altura se mide desde el borde inferior de la virola.',
    label: 'Editar ubicación en 3D',
    match: /(?:marca|marco|marcar|origen|inicio|angulo|cero|ubicacion).*?(?:0|3d|angulo|cero)|marca de 0|\borigen\b.*(?:punto|modelo)|como.*(?:origen|marco el inicio)|(?:ubicar|ubico|editar|seleccionar).*punto/
  },
  due: {
    question: '¿Por qué se eligió esa fecha de inspección?',
    answer: 'En Monitoreo puedes ver la última lectura, el criterio que gobierna el intervalo y la próxima medición. Si la pared ya alcanzó una alerta o el mínimo, revisa la condición medida y la fecha indicada.',
    label: 'Ver evaluación del punto',
    match: /(?:por que|explica|criterio|como se (?:elige|calcula|determina)).*(?:inspeccion|fecha|intervalo|revision|alerta|condicion)|(?:que|por que) cambio/
  },
  shutdown: {
    question: '¿Cómo sé si un punto llega a la próxima parada?',
    answer: 'Elige la fecha de parada y un escenario de corrosión. Compara el espesor proyectado con el mínimo y revisa el margen. El modelo termina la proyección cuando alcanza ese mínimo.',
    label: 'Abrir simulador de parada',
    match: /parada|fin de vida|termino de vida|cuando.*(?:reemplaz|cambiar el equipo|llega.*minimo)/
  },
  simulate: {
    question: '¿Cómo pruebo otro espesor sin cambiar el historial?',
    answer: 'En Simular lectura escribe el espesor hipotético y revisa la tasa, la vida remanente y la fecha calculada. Puedes probar otros valores en el mismo formulario. El historial solo cambia cuando eliges aplicar la lectura.',
    label: 'Simular una lectura',
    match: /como.*simul|(?:pruebo|probar|simul\w*) (?:otr[oa] |un[ao]? )?(?:lectura|espesor|medicion)|sin cambiar el historial/
  },
  series: {
    question: '¿Qué hago con la primera lectura después de un reemplazo?',
    answer: 'En Registrar medición, elige Iniciar serie por intervención y describe lo que se reemplazó. La primera lectura es la referencia del componente instalado. Otra medición comparable permitirá calcular una nueva tasa.',
    label: 'Abrir formulario de medición',
    match: /nueva serie|iniciar serie|comparabilidad|(?:reemplaz|reparaci|cambio de pared).*?(?:medici|lectura|serie)|(?:lectura|medici).*?(?:reemplaz|reparaci)/
  },
  missing: {
    question: '¿Por qué aparece información insuficiente?',
    answer: 'Revisa las fechas y las lecturas de la serie actual. El motor necesita al menos dos mediciones comparables y una tasa positiva para estimar la vida por corrosión. En el punto encontrarás el motivo registrado.',
    label: 'Revisar historial',
    match: /(?:por que|motivo|explica|que significa).*(?:insuficiente|sin tasa|sin datos|no (?:hay|aparece|calcula))/
  }
};

const reminderKey = 'estrato-ayuda-recordatorios';
const tipTimes = new Map();
function showTips() {
  try { return localStorage.getItem(reminderKey) !== 'off'; } catch { return true; }
}
function guideTip(key, text) {
  if (!showTips()) return '';
  let previous = tipTimes.get(key) || 0;
  try { previous = Math.max(previous,Number(sessionStorage.getItem(reminderKey + key)) || 0); } catch {}
  if (Date.now() - previous < 24 * 60 * 60 * 1000) return '';
  tipTimes.set(key, Date.now());
  try { sessionStorage.setItem(reminderKey + key, String(tipTimes.get(key))); } catch {}
  return '<div class="guide-tip wide"><span><b>Recuerda</b> · ' + esc(text) +
    '</span><button type="button" data-hide-tip aria-label="Ocultar este recordatorio">Entendido</button></div>';
}
function assistantFaq() {
  return '<section class="panel guide-faq"><div class="row"><h2>Preguntas frecuentes</h2>' +
    '<label class="tip-setting"><input type="checkbox" id="guide-tips" '+(showTips()?'checked':'')+'> Recordatorios al trabajar</label></div>' +
    Object.values(guideTopics).map(t=>'<details><summary>'+esc(t.question)+'</summary><p>'+esc(t.answer)+'</p>'+
      '<button type="button" data-chat-question="'+esc(t.question)+'">Consultar con mis datos</button></details>').join('') +
    '<details><summary>¿Cómo recupero el caso y sus adjuntos?</summary><p>En Registro de equipos, exporta el caso JSON. Para recuperarlo usa Importar caso y revisa el TAG, el TML y los documentos del equipo.</p></details></section>';
}
function guideUrl(e,p) {
  return '#asistente/'+encodeURIComponent(e.tag)+'/'+encodeURIComponent(p.id);
}
function currentGuideRow(rows) {
  const [page,tag,point] = route();
  return page==='asistente' && rows.find(({e,p})=>e.tag===tag && p.id===point);
}
function guideSelector() {
  const rows=allRows(), current=currentGuideRow(rows);
  return '<div class="guide-scope"><label for="guide-scope">Consultar sobre</label><select id="guide-scope">' +
    opts([['#asistente','Todo el registro'],...rows.map(({e,p})=>[guideUrl(e,p),e.tag+' · '+p.id+' · '+p.name])],
      current?guideUrl(current.e,current.p):'#asistente')+'</select></div>';
}
function guideIntent(q) {
  if (/rbi|diseno/.test(q)) return;
  if (guideTopics.shutdown.match.test(q)) return 'shutdown';
  if (/que pasa si|que pasaria si|si midiera|simul/.test(q) && /\d+(?: \d+)? (?:mm|in|milimetros?|pulgadas?)\b/.test(q)) return;
  return ['series','zero','missing','due','simulate','measure'].find(key=>guideTopics[key].match.test(q));
}
function guideDate(question) {
  const stamp=question.match(/\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
  return stamp && (stamp[1] || stamp[4]+'-'+stamp[3].padStart(2,'0')+'-'+stamp[2].padStart(2,'0'));
}
function guideAnswer(topic, row, question) {
  const t=guideTopics[topic], {e,p,r}=row, header=e.tag+' · '+p.id+' · '+p.name;
  const result={body:header+'\n\n'+t.answer, links:[rowLink(row)]};
  if (topic==='measure'||topic==='series'||topic==='zero') {
    const draft={};
    if(topic==='measure') {
      const values=[...question.matchAll(/(?<![\d.,-])(\d+(?:[.,]\d+)?)\s*(mm|mil[ií]metros?|in|pulgadas?)\b/gi)];
      const date=guideDate(question);
      if (date && (!isCalendarDate(date) || date>today())) {
        return {body:header+'\n\nPara registrar una medición, escribe una fecha válida hasta hoy, en formato día/mes/año. Para explorar una fecha futura, usa el simulador de parada.',
          links:[rowLink(row)]};
      }
      if (date && p.measurements.some(m=>m.date===date)) {
        return {body:header+'\n\nYa hay una lectura del '+dateLabel(date)+'. En Historial de mediciones puedes revisar el valor y usar Corregir si necesitas rectificarlo.',
          links:[rowLink(row)]};
      }
      if(values.length===1 && !/mm\s*\//i.test(question)) {
        draft.thickness=Number(values[0][1].replace(',','.'));
        draft.unit=/^(in|pulg)/i.test(values[0][2])?'in':'mm';
      }
      if(date) draft.date=date;
      if(draft.thickness!=null) result.body+='\n\nLectura para revisar: '+chatReading(draft.thickness,draft.unit,3)+
        (draft.date?' del '+dateLabel(draft.date):'. Confirma la fecha en el formulario')+'.';
    }
    result.commands=[{topic,tag:e.tag,point:p.id,label:t.label,draft}];
  } else if (topic==='due'||topic==='missing') {
    const date=r.due?'Próxima medición: '+dateLabel(r.due)+'.':'La próxima fecha queda por determinar.';
    result.body=header+'\n\n'+r.status+'. '+date+' '+r.governing+'\n'+
      (r.date?'Última lectura: '+chatReading(r.current_mm,'mm')+' el '+dateLabel(r.date)+'. ':'')+
      'Alerta: '+chatReading(r.alert_mm,'mm')+'. Mínimo: '+chatReading(r.minimum_mm,'mm')+'.'+
      (r.warnings.length?'\n'+r.warnings.join(' '):'');
    if(topic==='due' && r.date) {
      const earlier=p.measurements.filter(m=>m.date<r.date);
      const latest=latestMeasurement(p), previous=latestMeasurement({measurements:earlier});
      if(previous && (previous.epoch??0)===(latest.epoch??0)) {
        const prior=call('_evaluate',{...e,points:[{...p,measurements:earlier}]}).points[0];
        if(prior.due) result.body+='\nAntes de incluir la última lectura, con los umbrales vigentes, la fecha calculada era '+dateLabel(prior.due)+'.';
      }
    }
  } else if(topic==='simulate') {
    result.links.unshift(chatLink(t.label,pointHref(e,p)+'/simular'));
  } else {
    const date=guideDate(question);
    if(date&&!isCalendarDate(date)) return {body:header+'\n\nRevisa la fecha de parada. Puedes escribirla como día/mes/año.'};
    const q=chatNormalize(question);
    const scenario=/acelerad/.test(q)?'accelerated':/moderad/.test(q)?'moderate':'adopted';
    const limits=r.wall_scenarios[scenario];
    const crossing=limits.minimum;
    result.body=header+'\n\nEscenario '+wallProfiles.find(it=>it.key===scenario).label.toLowerCase()+'. '+
      (crossing.kind==='measured'?'El mínimo ya estaba alcanzado en la medición del '+wallDate(crossing)+'.':
      crossing.kind==='projected'?'Mínimo estimado para el '+wallDate(crossing)+'.':'Fecha del mínimo: '+wallDate(crossing)+'.');
    if(date) {
      const [forecast]=call('_shutdown',{points:[r],date,scenario});
      const text=({past:'La fecha es anterior a la última lectura.',ended:'El mínimo se alcanzó o se proyectó antes de esa parada.',
        unavailable:'Faltan lecturas comparables para proyectar.'})[forecast.kind];
      result.body+='\nParada del '+dateLabel(date)+'. '+(text || (forecast.kind==='measured'?'Espesor medido: ':'Espesor proyectado: ')+chatReading(forecast.thickness_mm,'mm')+'.');
    }
    const url='#parada/'+encodeURIComponent(e.tag)+'/'+encodeURIComponent(p.id);
    result.links.unshift(chatLink(t.label,url+(date||scenario!=='adopted'?'/'+(date||'')+'/'+scenario:'')));
  }
  return result;
}

function guideChoose(topic,rows,question) {
  return {body:'Selecciona el equipo y el punto para continuar.',choices:rows.map(({e,p})=>({
    tag:e.tag,point:p.id,label:e.tag+' · '+p.id+' · '+p.name})),topic,question};
}
function guideControls(reply,index) {
  if (reply.choices) return '<form class="guide-choice" data-guide-choice="'+index+'"><label>Punto de monitoreo<select required name="point">'+
    '<option value="">Elegir un punto…</option>'+reply.choices.map((c,i)=>'<option value="'+i+'">'+esc(c.label)+'</option>').join('')+
    '</select></label><button>Continuar</button></form>';
  return (reply.commands||[]).map((c,i)=>'<button type="button" class="guide-command" data-guide-command="'+index+'" data-choice="'+i+'">'+esc(c.label)+'</button>').join('');
}
function findGuideRow(c) {
  return c && allRows().find(({e,p})=>e.tag===c.tag && p.id===c.point);
}
document.addEventListener('submit', event=>{
  const form=event.target;
  if(!form.matches('[data-guide-choice]')) return;
  event.preventDefault();
  const reply=chatMessages[Number(form.dataset.guideChoice)];
  const row=findGuideRow(reply?.choices?.[Number(form.elements.point.value)]);
  if(!row) return notify('El punto cambió. Consulta el registro actualizado.');
  navigate(guideUrl(row.e,row.p));
  appendChat(reply.question+' · '+row.e.tag+' / '+row.p.id,guideAnswer(reply.topic,row,reply.question));
});
document.addEventListener('change',event=>{
  if(event.target.id==='guide-scope') {chatFocus=null; navigate(event.target.value);}
  if(event.target.id==='guide-tips') {
    try {localStorage.setItem(reminderKey,event.target.checked?'on':'off');}
    catch {notify('Este navegador no pudo guardar la preferencia.');}
  }
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-guide-command]');
  if(event.target.closest('[data-hide-tip]')) event.target.closest('.guide-tip').remove();
  if(!button) return;
  const c=chatMessages[Number(button.dataset.guideCommand)]?.commands?.[Number(button.dataset.choice)];
  const row=findGuideRow(c);
  if(!row) return notify('El punto cambió. Consulta el registro actualizado.');
  openEquipmentScreen(row.e,row.p,'monitoreo');
  const i=project.equipment.indexOf(row.e), j=row.e.points.indexOf(row.p);
  if(c.topic==='zero') pointForm(i,j);
  else {
    measure(i,j);
    for (const [name,value] of Object.entries(c.draft||{})) $('form').elements[name].value=value;
  }
});
