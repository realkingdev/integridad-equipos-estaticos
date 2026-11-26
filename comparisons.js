const comparisonSpecs={
  risk:[
    ['priority','Prioridad','','category'],['cost_risk','Riesgo económico','CLP/año',0],
    ['area_risk','Riesgo de área','m²/año',4],['df','Factor de daño','',4],
    ['frequency','Frecuencia de falla','año⁻¹',7],['wall_at_horizon','Espesor proyectado','mm',3]
  ],
  design:[
    ['required_mm','Espesor requerido','mm',3],['pressure_mm','Espesor por presión','mm',3],
    ['margin','Margen sobre el requisito','mm',3],['minimum_mm','Mínimo efectivo','mm',3],
    ['status','Condición del punto','','category']
  ],
  inspection:[
    ['current_mm','Espesor evaluado','mm',3],['rate','Tasa adoptada','mm/año',4],
    ['life_years','Vida remanente','años',2],['minimum_mm','Mínimo efectivo','mm',3],
    ['alert_mm','Alerta','mm',3],['due','Próxima medición','','date'],['status','Condición','','category']
  ]
};

function comparisonRecords() {
  const value=project.comparisons;
  return Array.isArray(value)?value:[];
}
function comparisonPair() {
  return comparisonRecords().find(entry=>entry?.id===activeScenario.context.id)?.slots||{};
}
function comparisonInputs(form) {
  return [...new FormData(form)].map(([key,value])=>{
    const input=form.elements[key];
    const label=input.closest('label');
    return {key,label:label?.querySelector('span')?.textContent||key,
      value,unit:label?.querySelector('.unit')?.textContent||''};
  });
}
function comparisonResult(kind,next) {
  if (kind==='design') {
    const point=next.result, d=point.design;
    const margin=next.equipment.nominal_mm-d.required_mm/(next.equipment.family==='pipe'?0.875:1);
    return {...d,margin,minimum_mm:point.minimum_mm,status:point.status};
  }
  return next.result;
}
function snapshotCell(snapshot,spec) {
  const [key,,unit,type]=spec;
  const value=snapshot?.results?.[key];
  if(type==='category') return validText(value)?esc(value):'—';
  if(type==='date') return validText(value)?esc(dateLabel(value)):'—';
  return Number.isFinite(value)?esc(fmt(value,type)+(unit?' '+unit:'')):'—';
}
function snapshotDelta(a,b,spec) {
  const [key,,unit,type]=spec;
  const first=a?.results?.[key], next=b?.results?.[key];
  if(type==='category') return validText(first)&&validText(next)?(first===next?'Igual':'Cambió'):'—';
  if(type==='date') {
    const diff=(Date.parse(next)-Date.parse(first))/86400000;
    return Number.isFinite(diff)?esc(signedDelta(diff,0,'días')):'—';
  }
  return Number.isFinite(first)&&Number.isFinite(next)?esc(signedDelta(next-first,type,unit)):'—';
}
function signedDelta(value,digits,unit) {
  const prefix=Math.abs(value)<0.5*10**(-digits)?'':value<0?'−':'+';
  return prefix+fmt(Math.abs(value),digits)+(unit?' '+unit:'');
}

function renderComparison() {
  const target=$('scenario-comparison');
  if (!target || !activeScenario) return;
  const {context,form}=activeScenario;
  const kind=form.dataset.scenario;
  const {A,B}=comparisonPair();
  const openDetails=target.querySelector('details')?.open;
  const scope=kind==='risk'?'Escenario RBI':context.equipment.tag+' · '+context.point.id;
  const top='<div class="row"><div><div class="section-kicker">ESCENARIOS GUARDADOS</div><h2>Comparar A y B</h2>'+
    '<p class="muted">'+esc(scope)+' · Captura dos alternativas y revisa la diferencia B − A.</p></div></div>';
  const slots='<div class="compare-slots">'+[['A',A],['B',B]].map(([slot,snapshot])=>
    '<div class="compare-slot"><span class="slot-letter">'+slot+'</span><div><strong>Escenario '+slot+'</strong><small>'+
    (snapshot?'Capturado '+esc(dateLabel(snapshot.date))+' · evaluación '+esc(dateLabel(snapshot.asOf)):'Disponible para capturar')+
    '</small></div><div class="buttons"><button type="button" data-snapshot="'+slot+'" '+(activeScenario.next?'':'disabled')+'>'+
    (snapshot?'Actualizar '+slot:'Capturar en '+slot)+'</button>'+
    (snapshot?'<button type="button" data-load-snapshot="'+slot+'">Cargar entradas '+slot+'</button>':'')+'</div></div>').join('')+'</div>';
  const metrics=A||B?'<div class="scroll"><table><thead><tr><th>Resultado</th><th>Escenario A</th><th>Escenario B</th><th>Diferencia B − A</th></tr></thead><tbody>'+
    comparisonSpecs[kind].map(spec=>'<tr><th>'+spec[1]+'</th><td>'+snapshotCell(A,spec)+'</td><td>'+snapshotCell(B,spec)+'</td><td>'+snapshotDelta(A,B,spec)+'</td></tr>').join('')+
    '</tbody></table></div>':'';
  const inputs=new Map();
  for (const s of [A,B]) {
    for (const input of Array.isArray(s?.inputs)?s.inputs:[]) {
      if (input&&typeof input.key==='string') inputs.set(input.key,input);
    }
  }
  const inputValue=(snapshot,key)=>{
    const input=Array.isArray(snapshot?.inputs)?snapshot.inputs.find(i=>i?.key===key):null;
    return input?esc(String(input.value??'')+(input.unit?' '+input.unit:'')):'—';
  };
  const evidence=inputs.size?'<details '+(openDetails?'open':'')+'><summary>Entradas guardadas de A y B</summary><div class="scroll"><table><thead>'+
    '<tr><th>Entrada</th><th>Escenario A</th><th>Escenario B</th></tr></thead><tbody>'+
    [...inputs].map(([key,input])=>'<tr><th>'+esc(input.label)+'</th><td>'+inputValue(A,key)+'</td><td>'+inputValue(B,key)+'</td></tr>').join('')+
    '</tbody></table></div></details>':'';
  target.innerHTML=top+slots+metrics+evidence;
}

function captureScenario(slot) {
  if (!activeScenario?.next) return;
  const {form,context,next}=activeScenario;
  const kind=form.dataset.scenario;
  const result=comparisonResult(kind,next);
  const results=Object.fromEntries(comparisonSpecs[kind].map(([key])=>[key,result[key]??null]));
  const simulatedDate=kind==='inspection'&&next.reading?.date;
  const ref=assessmentDate||today();
  const snapshot={date:today(),asOf:simulatedDate>ref?simulatedDate:ref,inputs:comparisonInputs(form),results};
  commit(draft=>{
    const comparisons=Array.isArray(draft.comparisons)?draft.comparisons:[];
    const current=comparisons.find(entry=>entry?.id===context.id);
    const value={id:context.id,slots:{...current?.slots,[slot]:snapshot}};
    draft.comparisons=[...comparisons.filter(entry=>entry?.id!==context.id),value];
  });
  notify('Escenario '+slot+' capturado');
}

document.addEventListener('click',event=>{
  if (event.target.closest('[data-show-comparison]')) {
    $('scenario-comparison')?.scrollIntoView({block:'start'});
    $('scenario-comparison')?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
    return;
  }
  const button=event.target.closest('[data-snapshot],[data-load-snapshot]');
  if(!button||!activeScenario) return;
  try {
    if(button.dataset.snapshot) return captureScenario(button.dataset.snapshot);
    const snapshot=comparisonPair()[button.dataset.loadSnapshot];
    if(!Array.isArray(snapshot?.inputs)) return;
    for (const {key,value} of snapshot.inputs) {
      const input=activeScenario.form.elements.namedItem(key);
      if(input?.tagName==='INPUT'&&typeof value==='string')input.value=value;
    }
    refreshScenario();
    activeScenario.form.scrollIntoView({block:'start'});
    activeScenario.form.querySelector('input')?.focus({preventScroll:true});
    notify('Entradas cargadas como simulación');
  } catch (err) {notify(message(err))}
});

