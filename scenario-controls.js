const inputsOf = form=>Object.fromEntries(new FormData(form));
let activeScenario;

function scenarioContext(form) {
  if (form.dataset.scenario==='risk') return {id:'risk',saved:rbiValues()};
  const [equipment,evaluation,index] = current();
  const point = equipment.points[pointIndex];
  return {
    id:JSON.stringify([form.dataset.scenario,equipment.tag,point.id]), equipment,evaluation,index,point,
    indexOfPoint:pointIndex, saved:evaluation.points[pointIndex]
  };
}

function initializeScenario() {
  const form = document.querySelector('[data-scenario]');
  if (!form) {
    activeScenario = null;
    return;
  }
  const context = scenarioContext(form);
  const base = inputsOf(form);
  const signature = JSON.stringify(base);
  const draft = scenarioDrafts.get(context.id);
  if (draft?.signature===signature) {
    for (const [name,value] of Object.entries(draft.values)) form.elements[name].value=value;
  } else scenarioDrafts.delete(context.id);
  if (form.dataset.scenario==='risk') {
    $('target-indicator').value=liveTargetState.indicator;
    $('target-value').value=liveTargetState.values[liveTargetState.indicator];
  }
  activeScenario = {form,context,base,signature};
  refreshScenario();
}

function draftInspection(form, context) {
  const {point} = context;
  const sorted = [...point.measurements].sort((a,b)=>a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  const date = form.elements.readingDate.value;
  const min = readScenarioNumber(form,'minWall','el mínimo documentado');
  const alert = readScenarioNumber(form,'alertWall','el umbral de alerta');
  if (min<=0 || alert<=0) throw Error('El mínimo y la alerta deben ser positivos.');
  if (alert<=min && (min!==point.minimum_mm||alert!==point.alert_mm)) throw Error('El umbral de alerta debe superar el mínimo documentado.');
  const hasReading = form.elements.reading.value.trim()!=='';
  if (!hasReading && last) throw Error('Ingresa el espesor de lectura.');
  let reading, correction=false, readingChanged=false;
  if (hasReading) {
    const thickness=readScenarioNumber(form,'reading','el espesor de lectura');
    if (thickness<0) throw Error('El espesor debe ser mayor o igual a cero.');
    if (!date) throw Error('Selecciona la fecha de lectura.');
    if (last && date<last.date) throw Error('Usa la fecha de la última lectura o una posterior. Para otras campañas, usa el historial.');
    correction = date===last?.date;
    readingChanged = !correction || thickness!==last.thickness;
    reading = {date,thickness,unit:last?.unit||'mm',technique:last?.technique||'UT',notes:'',epoch:last?.epoch||0};
  }
  const draftPoint={...point,minimum_mm:min,alert_mm:alert,measurements:
    readingChanged?[...sorted.slice(0,correction?-1:sorted.length),reading]:sorted};
  const points=context.equipment.points.map((pt,index)=>index===context.indexOfPoint?draftPoint:pt);
  const evaluation=call('_simulate',{equipment:{...context.equipment,points},date:hasReading?date:today()});
  const thresholdsChanged=min!==point.minimum_mm||alert!==point.alert_mm;
  const result=evaluation.points[context.indexOfPoint];
  if (thresholdsChanged && alert<=result.minimum_mm) throw Error('El umbral de alerta debe superar el mínimo efectivo de '+fmt(result.minimum_mm,3)+' mm.');
  return {draftPoint,result,last,reading,readingChanged,thresholdsChanged,correction,
    changed:thresholdsChanged||readingChanged,future:readingChanged&&date>today()};
}

function refreshScenario() {
  if (!activeScenario) return;
  const {form,context,signature} = activeScenario;
  const kind = form.dataset.scenario;
  const raw = inputsOf(form);
  const edited = JSON.stringify(raw)!==signature;
  if (edited) scenarioDrafts.set(context.id,{signature,values:raw});
  else scenarioDrafts.delete(context.id);
  const resetButton = form.querySelector('[data-scenario-reset]');
  const saveButton = form.querySelector('[data-scenario-save]');
  const error = form.querySelector('[data-scenario-error]');
  const note = form.querySelector('[data-scenario-note]');
  const result = $('scenario-result');
  const mobile = $('mobile-result');
  resetButton.disabled = !edited;
  error.hidden=true;
  saveButton.disabled=true;
  activeScenario.next=null;
  note.textContent='Los cambios afectan esta simulación hasta que los guardes.';
  try {
    if (kind==='risk') {
      const costBasis=raw.costBasis.trim();
      if (!costBasis) throw Error('Ingresa la base de valoración en CLP.');
      const values={...scenarioNumbers(form,rbiDefinitions),costBasis};
      const changed=Object.keys(values).some(name=>values[name]!==context.saved[name]);
      const outcome=call('_risk',values);
      result.innerHTML=renderRiskResult(values,outcome,call('_risk',context.saved),changed);
      const detailsOpen=$('scenario-extras').querySelector('.technical-model')?.open;
      $('scenario-extras').innerHTML=riskCompare(values,outcome)+riskModelDetails(outcome);
      if (detailsOpen) $('scenario-extras').querySelector('.technical-model').open=true;
      mobile.textContent='Riesgo '+fmt(outcome.cost_risk,0)+' CLP/año · Prioridad '+outcome.priority;
      liveRbiResult=outcome;
      activeScenario.next={values};
      saveButton.disabled=!changed;
    } else if (kind==='design') {
      const values=scenarioNumbers(form,[...designDefinitions(context.equipment),...operationDefinitions(context.equipment)]);
      const elevation=form.elements.elevation_m?readScenarioNumber(form,'elevation_m','la cota inferior'):null;
      const point = {...context.point};
      const pointChanged=elevation!==null && elevation!==(point.elevation_m??0);
      if (pointChanged) {
        point.elevation_m=elevation;
        delete point.height_m;
      }
      const changed=pointChanged||Object.keys(values).some(name=>values[name]!==context.equipment[name]);
      const equipment={...context.equipment,...values,points:context.equipment.points.map((p,i)=>i===context.indexOfPoint?point:p)};
      const evaluation=call('_evaluate',equipment);
      result.innerHTML=renderDesignResult(equipment,point,evaluation.points[context.indexOfPoint],context.saved,context.equipment,changed);
      mobile.textContent='Espesor requerido '+fmt(evaluation.points[context.indexOfPoint].design.required_mm,3)+' mm';
      activeScenario.next={values,point,pointChanged};
      saveButton.disabled=!changed;
    } else {
      const next=draftInspection(form,context);
      result.innerHTML=renderInspectionResult(next.result,context.saved,next.changed);
      mobile.textContent=next.result.status+' · '+(next.result.due?'Próxima '+dateLabel(next.result.due):'Fecha por determinar');
      activeScenario.next=next;
      saveButton.disabled=!next.changed||next.future;
      if (next.future) note.textContent='La fecha futura se usa como proyección. El historial registra lecturas hasta hoy.';
    }
  } catch (err) {
    error.textContent=message(err);
    error.hidden=false;
    mobile.textContent='Resultado pendiente · Revisa las entradas';
    if (kind==='risk') {
      liveRbiResult=null;
      $('scenario-extras').innerHTML='';
    }
    result.innerHTML='<div class="scenario-empty"><h2>Resultado pendiente</h2><p>Revisa el mensaje junto a las entradas.</p></div>';
  }
  rbiGoal();
}

function commitScenario(change, msg) {
  const {context}=activeScenario;
  commit(change);
  scenarioDrafts.delete(context.id);
  notify(msg);
}

function saveInspection(next, context) {
  const {draftPoint,reading,readingChanged,thresholdsChanged,correction,last}=next;
  const reasonNeeded=thresholdsChanged||correction&&readingChanged;
  const fields=reasonNeeded?field('reason',thresholdsChanged?'Motivo y fuente de los umbrales':'Motivo de la corrección','','text','required maxlength="500"'):'';
  dialog('Aplicar cambios de monitoreo',
    '<p class="wide muted">'+esc(context.equipment.tag+' · '+draftPoint.id)+
    (readingChanged?' · '+dateLabel(reading.date)+' · '+fmt(reading.thickness,3)+' '+esc(reading.unit):'')+'</p>'+
    (thresholdsChanged?'<p class="wide">Mínimo '+fmt(draftPoint.minimum_mm,3)+' mm · Alerta '+fmt(draftPoint.alert_mm,3)+' mm</p>':'')+
    fields+(readingChanged?field('technique','Técnica de medición',reading.technique)+field('notes','Observación',correction?last.notes:'','text','maxlength="500"'):''),
    form=>{
      const reason=String(form.get('reason')||'').trim();
      if (reasonNeeded && !reason) throw Error('Indica el motivo del cambio.');
      commitScenario(project=>{
        const point=project.equipment[context.index].points[context.indexOfPoint];
        if (thresholdsChanged) {
          point.minimum_mm=draftPoint.minimum_mm;
          point.alert_mm=draftPoint.alert_mm;
          point.basis=reason;
        }
        if (readingChanged) {
          const record={...reading,technique:form.get('technique').trim(),notes:form.get('notes').trim()};
          if (!record.technique) throw Error('Indica la técnica de medición.');
          if (correction) {
            const index=point.measurements.findIndex(m=>m.date===last.date);
            point.measurements[index]=withMeasurementRevision(last,record,reason);
          } else point.measurements.push(record);
        }
      },'Evaluación del punto guardada');
    });
}

document.addEventListener('submit',event=>{
  if (event.target!==activeScenario?.form) return;
  event.preventDefault();
  const {form,context,next}=activeScenario;
  if (!next || form.querySelector('[data-scenario-save]').disabled) return;
  try {
    const kind=form.dataset.scenario;
    if (kind==='inspection') return saveInspection(next,context);
    if (kind==='risk') return commitScenario(p=>Object.assign(p.rbi,next.values),'Escenario RBI guardado');
    commitScenario(p=>{
      const equipment=p.equipment[context.index];
      Object.assign(equipment,next.values);
      if (next.pointChanged) equipment.points[context.indexOfPoint]=next.point;
    },'Datos de diseño aplicados al equipo');
  } catch (err) {
    const error=form.querySelector('[data-scenario-error]');
    error.textContent=message(err);
    error.hidden=false;
  }
});

document.addEventListener('click',event=>{
  const what=event.target.closest('[data-scenario-reset],[data-target-apply]');
  if (!what || !activeScenario) return;
  if (what.hasAttribute('data-scenario-reset')) {
    scenarioDrafts.delete(activeScenario.context.id);
    render();
    document.querySelector('[data-scenario] input')?.focus();
  } else {
    const element=activeScenario.form.elements[$('target-indicator').value];
    element.value=editableNumber(what.dataset.goal);
    refreshScenario();
    activeScenario.form.scrollIntoView({block:'start'});
    element.focus({preventScroll:true});
  }
});

document.addEventListener('input',event=>{
  if (event.target.id==='target-value') {
    liveTargetState.values[$('target-indicator').value]=event.target.value;
    return rbiGoal();
  }
  if (event.target.form===activeScenario?.form) refreshScenario();
});
document.addEventListener('change',event=>{
  if (event.target.id!=='target-indicator') return;
  liveTargetState.indicator=event.target.value;
  $('target-value').value=liveTargetState.values[event.target.value];
  rbiGoal();
});

