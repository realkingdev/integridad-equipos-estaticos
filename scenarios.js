const scenarioDrafts = new Map();

function scenarioInput(name, label, unit, value, type='numeric') {
  const inputMode = type==='numeric'?'decimal':type==='integer'?'numeric':'text';
  const kind = type==='date'?'date':'text';
  return '<label class="entry"><span>'+esc(label)+'</span><span class="entry-box">'+
    '<input name="'+esc(name)+'" type="'+kind+'" inputmode="'+inputMode+'" value="'+esc(value??'')+'" autocomplete="off" required>'+
    (unit?'<span class="unit" aria-hidden="true">'+esc(unit)+'</span>':'')+'</span></label>';
}

function readScenarioNumber(form, name, label) {
  const number = localizedNumber(form.elements[name].value, name==='cost');
  if (!Number.isFinite(number)) throw Error('Ingresa un número válido para '+label+'.');
  return number;
}

function localizedNumber(value, chileanAmount=false) {
  let raw=String(value).trim().replace(/\s+/g,'');
  if ((chileanAmount && /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) ||
      /^\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?$/.test(raw) || /^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) {
    raw=raw.replaceAll('.','');
  }
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(raw) ? Number(raw.replace(',','.')) : NaN;
}

function editableNumber(value) {
  return String(value ?? '').replace('.',',');
}

function scenarioNumbers(form, definitions) {
  return Object.fromEntries(definitions.map(({key,label})=>[key,readScenarioNumber(form,key,label.toLowerCase())]));
}

function comparisonItem(label, current, base, unit, digits) {
  const display = n => Number.isFinite(n) ? fmt(n,digits) + (unit?' '+unit:'') : '—';
  const delta = Number.isFinite(current) && Number.isFinite(base) ? current-base : null;
  const readout=Number.isFinite(current)?esc(fmt(current,digits))+(unit?' <span class="result-unit">'+esc(unit)+'</span>':''):'—';
  return '<div class="live-metric"><span>'+esc(label)+'</span><strong>'+readout+'</strong>'+
    '<small>Base '+esc(display(base))+
    (delta!==null && Math.abs(delta)>=0.5*10**(-digits) ? ' <span class="delta">'+(delta>0?'+':'−')+esc(display(Math.abs(delta)))+'</span>':'')+'</small></div>';
}

function scenarioShell(kind, title, description, inputs, saveLabel) {
  return '<div class="scenario-layout"><div class="mobile-result" id="mobile-result"></div>'+
    '<form class="panel scenario-form" data-scenario="'+kind+'" novalidate>'+
      '<div class="section-kicker"><i></i> ENTRADAS EDITABLES</div><h2>'+title+'</h2><p class="muted">'+description+'</p>'+
      inputs+'<p class="form-error" data-scenario-error role="alert" hidden></p>'+
      '<div class="scenario-actions"><button type="submit" class="primary" data-scenario-save disabled>'+saveLabel+'</button>'+
      '<button type="button" data-scenario-reset>Restablecer</button><button type="button" data-show-comparison>Escenarios A/B ↓</button></div>'+
      '<small class="scenario-note" data-scenario-note>Las simulaciones son temporales. Aplica los cambios para conservarlos.</small>'+
    '</form><section class="panel scenario-result" aria-label="Resultado del escenario" id="scenario-result"></section></div><section class="panel comparison-panel" id="scenario-comparison"></section>';
}

const rbiDefinitions = [
  {key:'thickness', label:'Espesor UT de referencia',unit:'mm'},
  {key:'minimum', label:'Mínimo gobernante',unit:'mm'},
  {key:'rate', label:'Tasa de adelgazamiento',unit:'mm/año'},
  {key:'years', label:'Horizonte desde la medición UT',unit:'años'},
  {key:'inspections', label:'Inspecciones clase C',unit:'',type:'integer'},
  {key:'area', label:'Área por evento',unit:'m²'},
  {key:'cost', label:'Costo por evento',unit:'CLP'}
];

function rbiValues() {
  return {...initialCase.rbi,...project.rbi};
}

function renderRbiWorkbench() {
  const values = rbiValues();
  const fields = defs=>defs.map(({key,label,unit,type})=>scenarioInput(key,label,unit,editableNumber(values[key]),type)).join('');
  return hero('INSPECCIÓN BASADA EN RIESGO','Análisis RBI','Adelgazamiento generalizado en un tramo recto de acero al carbono.')+
    scenarioShell('risk','Parámetros del escenario','Edita cualquier valor para recalcular la prioridad y el riesgo.',
      '<div class="input-section"><h3>Condición del componente</h3><div class="entries">'+fields(rbiDefinitions.slice(0,5))+'</div></div>'+
      '<div class="input-section"><h3>Consecuencia por pérdida de contención</h3><div class="entries">'+fields(rbiDefinitions.slice(5))+
      '<label class="entry wide"><span>Base de valoración en CLP</span><input name="costBasis" maxlength="180" value="'+esc(values.costBasis)+'" required></label></div></div>',
      'Guardar escenario')+
    '<div class="panel objective" id="rbi-objective"><div><div class="section-kicker">CÁLCULO INVERSO</div><h2>Calcular para un objetivo</h2>'+
    '<p class="muted">Ingresa el riesgo anual que buscas. Se mantiene fija la frecuencia calculada arriba.</p></div>'+
    '<div class="goal-controls"><label class="entry"><span>Indicador</span><select id="target-indicator"><option value="cost">Riesgo económico (CLP/año)</option>'+
    '<option value="area">Riesgo de área (m²/año)</option></select></label>'+ 
    '<label class="entry"><span>Riesgo anual objetivo</span><input id="target-value" type="text" inputmode="decimal" value="100000"></label>'+
    '<div id="target-answer" class="target-answer"></div><button type="button" data-target-apply>Usar en el escenario ↑</button></div></div>'+
    '<div id="scenario-extras"></div>';
}

function scopeHeader(dirty, title) {
  return '<div class="row"><div><div class="section-kicker"><i></i> RECÁLCULO INMEDIATO</div><h2>'+title+'</h2></div>'+
    '<span class="pill '+(dirty?'warn':'ok')+'">'+(dirty?'Simulación · sin guardar':'Caso guardado')+'</span></div>';
}

function renderRiskResult(values, result, saved, dirty) {
  const prior = result.priority!==saved.priority ? '<small>Prioridad guardada · '+esc(saved.priority)+'</small>' : '';
  const bound = result.wall_at_horizon <= values.minimum ? '<p class="note warning">El espesor proyectado alcanza o cruza el mínimo gobernante.</p>' : '';
  return scopeHeader(dirty,'Resultado de riesgo')+
    '<div class="priority-readout"><div><small>Prioridad de inspección</small><div>'+badge(result.priority)+'</div>'+prior+'</div>'+
    '<div class="priority-state"><span>Área '+badge(result.area_priority)+'</span><span>Economía '+badge(result.cost_priority)+'</span></div></div>'+
    '<div class="live-metrics">'+comparisonItem('Riesgo económico',result.cost_risk,saved.cost_risk,'CLP/año',0)+
    comparisonItem('Riesgo de área',result.area_risk,saved.area_risk,'m²/año',4)+
    comparisonItem('Factor de daño',result.df,saved.df,'',4)+
    comparisonItem('Frecuencia anual',result.frequency,saved.frequency,'año⁻¹',7)+
    comparisonItem('Espesor proyectado',result.wall_at_horizon,saved.wall_at_horizon,'mm',2)+
    comparisonItem('Pérdida relativa Art',result.art,saved.art,'',4)+'</div>'+bound+
    '<p class="muted result-context">Horizonte de '+fmt(values.years,2)+' años · Consecuencias por evento. '+esc(values.costBasis)+'.</p>';
}

function riskModelDetails(result) {
  return '<details class="panel technical-model"><summary>Modelo, ecuaciones y términos intermedios</summary>'+
    '<div class="equation mono">Art = tasa × horizonte / espesor UT<br>Factor de daño base = Σ peso posterior × Φ(−β) / 0,000156<br>'+
    'f = frecuencia genérica × factor de daño × factor de gestión<br>Riesgo anual = f × consecuencia por evento</div>'+
    '<p>API RP 580 (2016) para el proceso. API RP 581, 3.ª edición, parte 2, §4.5.7, ecuaciones 2.12–2.20, tablas 3.1, 4.5 y 4.6.</p>'+
    '<p>Escenario sin revestimiento, tasa de confianza media, sin monitoreo en línea. Fluencia, tracción y admisible de 240, 415 y 138 MPa. E = 1.</p>'+
    '<div class="live-metrics">'+comparisonValue('Frecuencia genérica',fmt(result.gff,7)+' año⁻¹')+
    comparisonValue('Factor de gestión',fmt(result.fms,0))+
    comparisonValue('Esfuerzo de flujo',fmt(result.flow,2)+' MPa')+
    comparisonValue('Relación de resistencia',fmt(result.strength_ratio,5))+'</div>'+
    '<p>Pesos posteriores '+result.posterior.map(n=>fmt(n,5)).join(' / ')+' · β '+result.beta.map(n=>fmt(n,4)).join(' / ')+'.</p></details>';
}

function comparisonValue(label, display) {
  return '<div class="live-metric"><span>'+esc(label)+'</span><strong>'+esc(display)+'</strong></div>';
}

let liveRbiResult;
let liveTargetState = {indicator:'cost',values:{cost:'100000',area:'1'}};

function rbiGoal() {
  const input = $('target-value'), indicator = $('target-indicator'), answer = $('target-answer');
  if (!input || !indicator || !answer) return;
  const key = indicator.value;
  const button = document.querySelector('[data-target-apply]');
  const annual = localizedNumber(input.value, key==='cost');
  if (annual<0) {
    button.disabled=true;
    answer.innerHTML='<small>El objetivo debe ser mayor o igual a cero.</small>';
    return;
  }
  const needed = annual / liveRbiResult?.frequency;
  const decimals = key==='cost' ? 0 : 4;
  const rounded = Number.isFinite(needed) ? Number(needed.toFixed(decimals)) : NaN;
  button.disabled = !Number.isFinite(rounded);
  button.dataset.goal = button.disabled?'':String(rounded);
  answer.innerHTML = button.disabled ? '<small>Se requiere un objetivo válido y un escenario calculado.</small>' :
    '<small>Consecuencia por evento requerida</small><strong>'+fmt(rounded,decimals)+(key==='cost'?' CLP':' m²')+'</strong>';
}

function designDefinitions(e) {
  const definitions = [
    {key:'diameter_mm',label:{pipe:'Diámetro exterior',vessel:'Diámetro interior corroído',tank:'Diámetro nominal'}[e.family],unit:'mm'},
    {key:'temp_c',label:'Temperatura de diseño',unit:'°C'},
    {key:'ca_mm',label:'Sobreespesor por corrosión',unit:'mm'},
    {key:'nominal_mm',label:'Espesor nominal',unit:'mm'}
  ];
  if (e.family==='tank') definitions.push({key:'liquid_height_m',label:'Nivel de líquido',unit:'m'},
    {key:'sg',label:'Gravedad específica',unit:''});
  else definitions.unshift({key:'pressure_mpa',label:'Presión de diseño',unit:'MPa'});
  if (e.family==='vessel') definitions.push({key:'efficiency',label:'Eficiencia de junta',unit:''});
  return definitions;
}

function operationDefinitions(e) {
  return [{key:'operating_temp_c',label:'Temperatura de operación',unit:'°C'},
    ...(e.family==='tank'?[]:[{key:'operating_pressure_mpa',label:'Presión de operación',unit:'MPa'}])];
}

function renderDesignWorkbench(e,p) {
  const definitions = designDefinitions(e);
  const inputs = definitions.map(({key,label,unit})=>scenarioInput(key,label,unit,editableNumber(e[key]))).join('')+
    (e.family==='tank'?scenarioInput('elevation_m','Cota inferior de virola','m',editableNumber(p.elevation_m??0)):'');
  return scenarioShell('design','Datos de diseño','Cambia las entradas y compara el espesor calculado con el nominal.',
    '<div class="input-section">'+designPointChooser(e,pointIndex)+'<p class="material-line">Material <b>'+esc(e.material)+'</b></p>'+
    '<div class="entries">'+inputs+'</div></div>'+
    '<div class="input-section"><h3>Condiciones de operación</h3><div class="entries">'+
    operationDefinitions(e).map(({key,label,unit})=>scenarioInput(key,label,unit,editableNumber(e[key]))).join('')+
    '</div></div>','Aplicar al equipo');
}

function renderDesignResult(e,p,current,base,baseEquipment,dirty) {
  const d = current.design, original = base.design;
  const target = item=>item.required_mm/(e.family==='pipe'?0.875:1);
  const margin = e.nominal_mm-target(d);
  return scopeHeader(dirty,'Resultado de diseño')+
    '<p class="result-context">'+esc(p.id+' · '+p.name)+' '+badge(margin>=0?'Nominal suficiente':'Nominal bajo el requisito')+'</p>'+
    '<div class="live-metrics">'+comparisonItem('Espesor requerido',d.required_mm,original.required_mm,'mm',3)+
    comparisonItem('Espesor por presión',d.pressure_mm,original.pressure_mm,'mm',3)+
    comparisonItem('Margen del nominal',margin,baseEquipment.nominal_mm-target(original),'mm',3)+
    comparisonValue('Esfuerzo admisible',fmt(d.allowable_mpa,2)+' MPa')+'</div>'+
    '<p class="equation mono">'+esc(d.equation)+'</p><p class="muted">'+esc(d.reference)+'</p>'+
    '<div class="note">'+d.details.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div>'+
    (e.family==='pipe'?'<p class="muted">Fórmula para tramo recto. El resultado del accesorio en servicio usa su mínimo documentado.</p>':'');
}

function renderInspectionWorkbench(e,p) {
  const latest = [...p.measurements].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  return scenarioShell('inspection','Probar lectura y umbrales','Evalúa el impacto sobre la condición, la vida remanente y la fecha límite.',
    '<div class="input-section"><h3>'+esc(p.id+' · '+p.name)+'</h3><div class="entries">'+
    scenarioInput('readingDate','Fecha de lectura','',latest?.date||today(),'date')+
    scenarioInput('reading','Espesor de lectura',latest?.unit||'mm',editableNumber(latest?.thickness))+
    scenarioInput('minWall','Mínimo documentado','mm',editableNumber(p.minimum_mm))+
    scenarioInput('alertWall','Umbral de alerta','mm',editableNumber(p.alert_mm))+'</div></div>',
    'Aplicar cambios');
}

function renderInspectionResult(result, saved, dirty) {
  return scopeHeader(dirty,'Evaluación del punto')+
    '<div class="priority-readout"><div><small>Condición del espesor</small><div>'+badge(result.status)+'</div></div>'+
      '<div><small>Próxima medición</small><strong>'+dateLabel(result.due)+'</strong><small>Base '+dateLabel(saved.due)+'</small></div></div>'+
    '<div class="live-metrics">'+comparisonItem('Espesor actual',result.current_mm,saved.current_mm,'mm',2)+
    comparisonItem('Tasa adoptada',result.rate,saved.rate,'mm/año',3)+
    comparisonItem('Vida remanente',result.life_years,saved.life_years,'años',2)+
    comparisonItem('Mínimo efectivo',result.minimum_mm,saved.minimum_mm,'mm',2)+'</div>'+
    '<p class="muted result-context">'+esc(result.governing)+'</p>'+
    (result.warnings.length?'<div class="note">'+result.warnings.map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>':'');
}
