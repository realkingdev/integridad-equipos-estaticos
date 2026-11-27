function demoThresholdBasis(e,p) {
  const origin='Caso ficticio · '+e.tag+' / '+p.id+'. Se especifica un mínimo de servicio de '+fmt(p.minimum_mm)+' mm para este punto.';
  if(e.tag==='L-101' && p.id==='TML-02') return origin+
    ' El codo usa este límite como dato de entrada. Para la alerta se adopta una reserva de un ciclo de planificación de 5 años, entre la campaña de 2026 y la parada supuesta de 2031. La tasa base de 0,30 mm/año proviene de (6,00 − 4,80) / 4 entre 2022 y 2026. Alerta = 3,00 + 0,30 × 5 = 4,50 mm. Las nuevas UT actualizan la proyección; el umbral se revisa por separado.';
  return origin+' La alerta de '+fmt(p.alert_mm)+' mm es un umbral fijo de planificación del caso. Reserva respecto del mínimo documentado: '+fmt(p.alert_mm-p.minimum_mm)+' mm.';
}

function pointBasis(e,p) {
  const legacy='Mínimo del expediente académico; alerta con margen de '+fmt(p.alert_mm-p.minimum_mm)+' mm para intervención.';
  if(p.basis!==legacy || p.thresholdHistory?.length) return p.basis;
  const seed=template.find(asset=>asset.tag===e.tag && asset.family===e.family)?.points.find(point=>point.id===p.id);
  return seed && seed.minimum_mm===p.minimum_mm && seed.alert_mm===p.alert_mm ? seed.basis : p.basis;
}

function evidenceValue(n,unit,digits=4) {
  return Number.isFinite(n)?fmt(n,digits)+(unit?' '+unit:''):'Sin cálculo';
}
function evidenceSection(title,rows,formula,reference,notes) {
  return '<details class="evidence"><summary>'+esc(title)+'</summary>'+
    (formula?'<p class="equation mono">'+esc(formula)+'</p>':'')+
    '<div class="scroll"><table><tbody>'+rows.map(([label,value])=>'<tr><th scope="row">'+esc(label)+'</th><td>'+esc(value)+'</td></tr>').join('')+'</tbody></table></div>'+
    (reference?'<p class="evidence-reference">'+esc(reference)+'</p>':'')+
    (notes?.length?'<div class="note">'+notes.filter(Boolean).map(note=>'<p>'+esc(note)+'</p>').join('')+'</div>':'')+'</details>';
}

function readingEvidence(reading, normalized, hypothetical) {
  if (!reading) return 'Sin lectura';
  const origin=hypothetical?'Lectura simulada':reading.source?'Fuente '+reading.source:'Registro del punto';
  const asMm=reading.unit==='in'?' = '+evidenceValue(normalized,'mm'):'';
  return dateLabel(reading.date)+' · '+evidenceValue(reading.thickness,reading.unit||'mm')+asMm+' · Serie '+(reading.epoch??0)+
    ' · '+(reading.technique||'Técnica sin especificar')+' · '+origin;
}

function auditThresholds(point, minimum, alert, basis, previousBasis=point.basis) {
  if (point.minimum_mm!==minimum||point.alert_mm!==alert || previousBasis!==basis) {
    const history=Array.isArray(point.thresholdHistory)?point.thresholdHistory:[];
    point.thresholdHistory=[...history,{date:today(),minimum:point.minimum_mm,alert:point.alert_mm,
      nextMinimum:minimum,nextAlert:alert,previousBasis,basis}];
  }
  point.minimum_mm=minimum;
  point.alert_mm=alert;
  point.basis=basis;
}

function thresholdHistory(p) {
  const entries=Array.isArray(p.thresholdHistory)?p.thresholdHistory.filter(Boolean).slice(-12).reverse():[];
  if (!entries.length)return '';
  return '<details class="evidence"><summary>Historial de umbrales</summary><div class="scroll"><table><thead>'+
    '<tr><th>Fecha</th><th>Mínimo anterior y nuevo</th><th>Alerta anterior y nueva</th><th>Motivo y fuente</th></tr></thead><tbody>'+
    entries.map(i=>'<tr><td>'+esc(dateLabel(i.date))+'</td><td>'+esc(evidenceValue(i.minimum,'mm',3)+' → '+evidenceValue(i.nextMinimum,'mm',3))+
      '</td><td>'+esc(evidenceValue(i.alert,'mm',3)+' → '+evidenceValue(i.nextAlert,'mm',3))+'</td><td>'+(i.previousBasis?'<small>Anterior · '+esc(i.previousBasis)+'</small><br>':'')+esc(i.basis)+'</td></tr>').join('')+
    '</tbody></table></div></details>';
}

function pointEvidence(e,p,s,hypothetical=false) {
  const find=date=>p.measurements.find(m=>m.date===date);
  const basis=s.calculation||{};
  const measured=find(s.date);
  const rows=[
    ['Ubicación',e.tag+' · '+p.id],
    ['Lectura evaluada',readingEvidence(measured,s.current_mm,hypothetical)],
    ['Mínimo documentado',evidenceValue(p.minimum_mm,'mm')],
    ['Mínimo efectivo',evidenceValue(s.minimum_mm,'mm')],
    ['Espesor de alerta',evidenceValue(s.alert_mm,'mm')]
  ];
  const reserve=s.alert_mm-s.minimum_mm;
  rows.push(['Margen de alerta sobre el mínimo efectivo',evidenceValue(reserve,'mm')]);
  if(reserve>0 && s.rate>0) rows.push(['Tiempo entre alerta y mínimo a la tasa actual',evidenceValue(reserve/s.rate,'años')]);
  const revision=Array.isArray(measured?.revisions)?measured.revisions.at(-1):null;
  if (revision?.previous) {
    const old=revision.previous;
    rows.push(['Última corrección',dateLabel(revision.date)+' · Lectura anterior '+evidenceValue(old.thickness,old.unit,4)+' · '+revision.reason]);
  }
  for (const [key,label] of [['long_rate','Tasa de largo plazo'],['short_rate','Tasa de corto plazo']]) {
    const source=basis[key];
    if (!source) continue;
    rows.push([label,readingEvidence(find(source.from_date),source.start_mm,false)+' · Δt '+
      evidenceValue(source.years,'años')+' · '+evidenceValue(s[key],'mm/año',6)]);
  }
  rows.push(['Tasa adoptada',evidenceValue(s.rate,'mm/año',6)],
    ['Vida remanente',evidenceValue(s.life_years,'años')],
    ['Intervalo adoptado',evidenceValue(s.interval_years,'años')],
    ['Próxima medición',dateLabel(s.due)+' · '+s.governing]);
  if(Number.isFinite(s.half_life_years))rows.push(['Candidatos al intervalo','Mitad de vida '+
    evidenceValue(s.half_life_years,'años')+' · Tope '+evidenceValue(s.cap_years,'años')+' · Hasta alerta '+evidenceValue(s.alert_years,'años')]);
  return evidenceSection('Cómo se obtuvo la evaluación',rows,
    'Tasa = (espesor anterior − espesor actual) / Δt. Vida remanente = (espesor actual − mínimo efectivo) / tasa. El menor intervalo aplicable gobierna la fecha.',
    s.inspection_type+' · '+s.reference,[pointBasis(e,p),s.rate_basis,...s.warnings])+thresholdHistory(p);
}

function designEvidence(e,p,s) {
  const d=s.design;
  const data=designDefinitions(e).map(({key,label,unit})=>[label,evidenceValue(e[key],unit)]);
  if (e.family==='tank') data.push(['Altura de la virola sobre el fondo',evidenceValue(p.elevation_m??0,'m')]);
  if (e.family==='pipe') data.push(['Coeficientes','E = 1 · W = 1 · Y = 0,4'],['Tolerancia adoptada','12,5 %']);
  data.push(['Material del equipo',e.material],['Esfuerzo admisible',evidenceValue(d.allowable_mpa,'MPa')],
    ['Espesor por presión',evidenceValue(d.pressure_mm,'mm')],['Espesor requerido',evidenceValue(d.required_mm,'mm')],
    ['Alcance',p.id+' · '+p.name]);
  return evidenceSection('Abrir evidencia del cálculo',data,d.equation,d.reference,d.details);
}

function riskEvidence(values,r) {
  const inputs=rbiDefinitions.map(({key,label,unit})=>[label,evidenceValue(values[key],unit,key==='cost'||key==='inspections'?0:4)]);
  const rows=[...inputs,['Base de valoración',values.costBasis],
    ['Frecuencia genérica',evidenceValue(r.gff,'año⁻¹',9)],['Factor de daño',evidenceValue(r.df,'',6)],
    ['Factor de gestión',evidenceValue(r.fms,'',0)],['Frecuencia de falla calculada',evidenceValue(r.frequency,'año⁻¹',9)],
    ['Riesgo de área',evidenceValue(r.area_risk,'m²/año')],['Riesgo económico',evidenceValue(r.cost_risk,'CLP/año',2)]];
  return evidenceSection('Cómo se obtuvo el riesgo',rows,
    'Frecuencia de falla = frecuencia genérica × factor de daño × factor de gestión. Riesgo anual = frecuencia de falla × consecuencia por evento.',
    'API RP 580 (2016) · API RP 581, 3.ª edición, parte 2, §4.5.7, ecuaciones 2.12–2.20.',
    ['Escenario académico de adelgazamiento generalizado en tramo recto. La prioridad adopta la mayor clasificación entre área y economía.']);
}

function copyEvidenceState(result, markup) {
  const wasOpen=result.querySelector('.evidence')?.open;
  result.innerHTML=markup;
  if (wasOpen&&result.querySelector('.evidence'))result.querySelector('.evidence').open=true;
}

