"use strict";

const wallProfiles = [
  {key: 'moderate', label: 'Moderada', color: '#477f57', dash: [3, 4]},
  {key: 'adopted', label: 'Adoptada', color: '#235994', dash: [8, 4]},
  {key: 'accelerated', label: 'Acelerada', color: '#875398', dash: [10, 3, 2, 3]}
];

function wallDate(crossing) {
  if (crossing.kind === 'calendar') return 'Fuera del calendario';
  return crossing.date ? dateLabel(crossing.date) : 'Por determinar';
}

function wallDateCell(crossing) {
  return (crossing.date ? '<strong class="table-number">' + wallDate(crossing) + '</strong>'
    : '<span class="missing-wall-date">' + wallDate(crossing) + '</span>') +
    (crossing.kind === 'measured' ? '<small>Medido</small>' : '');
}

function wallIntervention(point, cutoff = assessmentDate || today()) {
  const {minimum, alert} = point.wall_scenarios.adopted;
  if (minimum.kind === 'measured') {
    return {rank: 0, tone: 'bad', label: 'Evaluación inmediata',
      advice: 'La última lectura alcanza o cruza el mínimo. Evalúa el componente y define si requiere reparación o reemplazo.'};
  }
  if (minimum.date && minimum.date <= cutoff) {
    return {rank: 1, tone: 'bad', label: 'Mínimo proyectado al corte',
      advice: 'Prioriza una medición de verificación y evalúa la reparación o el reemplazo del componente.'};
  }
  if (alert.kind === 'measured') {
    return {rank: 2, tone: 'warn', label: 'Alerta medida',
      advice: 'Verifica el espesor y planifica la intervención con el margen disponible hasta el mínimo.'};
  }
  if (alert.date && alert.date <= cutoff) {
    return {rank: 3, tone: 'warn', label: 'Alerta proyectada al corte',
      advice: 'Programa una medición para confirmar la condición y revisar el plazo de intervención.'};
  }
  if (minimum.date) {
    return {rank: 4, tone: 'planned', label: 'Planificar intervención',
      advice: 'Usa la fecha de alerta para preparar la intervención antes del mínimo estimado.'};
  }
  if (minimum.kind === 'calendar') {
    return {rank: 5, tone: 'pending', label: 'Revisar horizonte',
      advice: 'La tasa disponible ubica el cruce del mínimo fuera del calendario. Revisa la tendencia con nuevas mediciones.'};
  }
  return {rank: 6, tone: 'pending', label: 'Completar mediciones',
    advice: 'Para estimar una fecha hace falta una tasa positiva obtenida de mediciones comparables.'};
}

function rankedWallRows(rows) {
  const cutoff = assessmentDate || today();
  return rows.map(row => ({...row, action: wallIntervention(row.r, cutoff), limits: row.r.wall_scenarios.adopted}))
    .sort((a, b) => a.action.rank - b.action.rank ||
      (a.limits.minimum.date || a.limits.alert.date || '9999-12-31')
        .localeCompare(b.limits.minimum.date || b.limits.alert.date || '9999-12-31'));
}

function wallPortfolio(rows, compact = false) {
  if (!rows.length) return '';
  const ranked = rankedWallRows(rows);
  const title = compact ? 'Prioridades por espesor' : 'Plan de intervención por espesor';
  const body = (compact ? ranked.slice(0, 3) : ranked).map(({e,p,action,limits}) =>
    '<tr><td class="asset-cell"><a href="' + esc(equipmentScreen(e,p)) + '" class="table-number">' +
    esc(e.tag) + ' · ' + esc(p.id) + '</a><small>' + esc(p.name) + '</small></td>' +
    '<td class="wall-alert-column">' + wallDateCell(limits.alert) + '</td><td>' + wallDateCell(limits.minimum) +
    '<small class="wall-mobile-alert">Alerta ' + wallDate(limits.alert) +
    (limits.alert.kind === 'measured' ? ' (medida)' : '') + '</small></td>' +
    '<td><span class="pill ' + action.tone + '">' + action.label + '</span></td></tr>').join('');
  return '<section class="panel wall-portfolio">' + panelHeading(title, 'Fechas según la tasa adoptada. “Medido” indica que la última lectura ya alcanzó el umbral.',
    compact ? '<a href="#agenda" class="link">Ver plan de intervención →</a>' : '') +
    '<div class="scroll table-frame"><table class="data-table wall-table"><thead><tr><th scope="col">Equipo / punto</th>' +
    '<th scope="col" class="wall-alert-column">Alerta</th><th scope="col">Mínimo</th><th scope="col">Acción</th></tr></thead>' +
    '<tbody>' + body + '</tbody></table></div></section>';
}

function wallGoverning(equipment, result) {
  const first = rankedWallRows(equipment.points.map((p,i) => ({p,r:result.points[i]})))[0];
  if (first.action.rank > 4) return '';
  const minimum = first.limits.minimum;
  return '<div class="wall-governing"><strong>Prioridad de intervención</strong>' +
    '<a href="' + esc(equipmentScreen(equipment,first.p)) + '">' + esc(first.p.id) + ' · ' + esc(first.p.name) + '</a>' +
    '<span class="pill ' + first.action.tone + '">' + first.action.label + '</span>' +
    (minimum.date ? '<small>' + (minimum.kind === 'measured' ? 'Mínimo en la medición del ' : 'Mínimo estimado al ') +
      wallDate(minimum) + '</small>' : '') + '</div>';
}

function wallScenarioRows(scenarios) {
  return wallProfiles.map(({key,label,color}) => {
    const {rate,alert,minimum} = scenarios[key];
    return '<tr class="' + (key==='adopted'?'wall-adopted':'') + '"><th scope="row"><i class="wall-scenario-line" style="--scenario-color:' +
      color + '"></i>' + label + '</th><td class="table-number">' + fmt(rate,3) + '</td><td>' + wallDateCell(alert) +
      '</td><td>' + wallDateCell(minimum) + '</td></tr>';
  }).join('');
}

function wallResponse(state) {
  const action = wallIntervention(state);
  const {minimum} = state.wall_scenarios.adopted;
  const life = minimum.date ? '<div class="wall-life"><small>' +
    (minimum.kind === 'measured' ? 'Mínimo medido el' : 'Mínimo estimado al') + '</small>' +
    '<strong class="table-number">' + wallDate(minimum) + '</strong><small>' +
    fmt(minimum.years,2) + ' años desde la última lectura</small></div>' : '';
  return '<div class="wall-response ' + action.tone + '"><div><h3>' + action.label + '</h3><p>' + action.advice + '</p></div>' + life + '</div>';
}
