function visibleSchedule() {
  return allRows().filter(({e,p,r}) => matchesAsset(e,p) && matchesCondition(r,statusFilter) && matchesWindow(r,scheduleDays) && (!scheduleTag || e.tag===scheduleTag));
}

function matchesCondition(result,state) {
  return !state || (state === 'Inspección vencida' ? result.overdue : result.status === state);
}

function matchesAsset(e,point) {
  if(familyFilter && e.family!==familyFilter) return false;
  const words=chatNormalize(filter).split(' ').filter(Boolean);
  if(!words.length) return true;
  const asset=[e.tag,e.name,e.plant,e.area,e.system,e.circuit].join(' ');
  return (point?[point]:e.points).some(p=>{
    const location=chatNormalize([asset,p.id,p.cml,p.name].join(' '));
    return words.every(word=>/^\d+$/.test(word)?containsPhrase(location,word):location.includes(word));
  });
}

function statusSummary(rows) {
  const states = ['Bajo mínimo','Alerta','Inspección vencida','Información insuficiente','Normal'];
  return '<div class="condition-strip" aria-label="Condición de los puntos" role="group">' + states.map(state => {
    const count = rows.filter(({r}) => matchesCondition(r,state)).length;
    return '<button data-status="' + esc(state) + '">' + badge(state==='Inspección vencida'?'Con fecha vencida':state) + '<strong>' + count + '</strong></button>';
  }).join('') + '</div>';
}

function trendBasis(s) {
  if (!s.series_start) return '';
  return '<details><summary>Cómo se calculó la tasa</summary><p>Largo plazo desde ' +
    dateLabel(s.series_start) + '. Corto plazo desde ' + dateLabel(s.previous_date) + '. Ambas tasas terminan el ' +
    dateLabel(s.date) + '.</p><p>La tasa divide la pérdida de espesor por los años transcurridos. La vida remanente divide el margen al mínimo en servicio por la tasa adoptada.</p>' +
    (s.rate_basis ? '<p>' + esc(s.rate_basis) + '</p>' : '') + '</details>';
}

function timing(s) {
  const numeric = (n, unit) => Number.isFinite(n) ? fmt(n, 2) + ' ' + unit : '—';
  return '<div class="metrics">' + metric('Fecha de referencia', dateLabel(s.date)) +
    metric('Límite de familia', numeric(s.cap_years, 'años')) + metric('Mitad de vida remanente', numeric(s.half_life_years, 'años')) +
    metric('Tiempo hasta alerta', numeric(s.alert_years, 'años')) + '</div>' +
    '<p class="muted">' + esc(s.inspection_type) + ' · ' + esc(s.reference) + '</p>';
}

function riskCompare(v, current) {
  const alt = call('_risk',{...v,inspections:0});
  const emphasis = current.wall_at_horizon <= v.minimum ? '<p class="note warning">El espesor proyectado alcanza o cruza el mínimo gobernante en el horizonte evaluado.</p>' : '';
  const limitRows = [['Área', '0,1 m²/año', '1 m²/año', current.area_priority],
    ['Economía', '10.000 CLP/año','100.000 CLP/año',current.cost_priority]];
  return '<div class="twocol risk-extra"><div class="panel"><h2>Clasificación de riesgo</h2>' +
    '<div class="scroll"><table><thead><tr><th>Consecuencia</th><th>Desde media</th><th>Desde alta</th><th>Clasificación</th></tr></thead><tbody>' +
    limitRows.map(([label, middle, high, level]) => '<tr><td>'+label+'</td><td>'+middle+'</td><td>'+high+'</td><td>'+badge(level)+'</td></tr>').join('') +
    '</tbody></table></div><p class="muted">La prioridad de inspección toma la mayor categoría. Los límites corresponden al caso académico.</p></div>' +
    '<div class="panel"><h2>Efecto de la inspección</h2><div class="metrics">' +
    metric('Factor de daño con 0 inspecciones',fmt(alt.df,3)) + metric('Factor con ' + v.inspections + ' inspección(es) C',fmt(current.df,3)) +
    metric('Pared proyectada en ambos casos',fmt(current.wall_at_horizon,2)+' mm') + '</div>' +
    '<p class="muted">Se mantienen iguales la tasa y el horizonte. La evidencia de inspección modifica la incertidumbre sobre los estados de daño.</p>' +
    emphasis + '</div></div>';
}

function dueDate(value) {
  if (route()[0] !== 'agenda') return;
  if (value && value < today()) {
    notify('Selecciona la fecha actual o una posterior.');
    render();
    return;
  }
  py.globals.set('_today', value || today());
  try {
    const refreshed = evaluateAll(project);
    analysis = refreshed;
    assessmentDate = value;
  } catch (error) {
    py.globals.set('_today', assessmentDate || today());
    notify(message(error));
  }
  render();
}

