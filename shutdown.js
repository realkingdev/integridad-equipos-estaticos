"use strict";

const shutdownViews = new Map();
const shutdownScenarios = [
  ['moderate', 'Moderada · 75 % de la tasa'],
  ['adopted', 'Adoptada · 100 %'],
  ['accelerated', 'Acelerada · 125 % de la tasa']
];

function shutdownView() {
  const hash = screenHash();
  if (!shutdownViews.has(hash)) {
    const [, tag, pointId, targetDate, requestedScenario] = route();
    const equipment = project.equipment.find(e => e.tag === tag);
    const date = new Date(today() + 'T00:00:00Z');
    const month = date.getUTCMonth();
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    if (date.getUTCMonth() !== month) date.setUTCDate(0);
    shutdownViews.set(hash, {
      date: isCalendarDate(targetDate) ? targetDate : date.toISOString().slice(0,10),
      scenario: wallProfiles.some(profile => profile.key === requestedScenario) ? requestedScenario : 'adopted',
      filter: equipment?.tag || '',
      tag: equipment?.tag || '', pointId: equipment?.points.find(p => p.id === pointId)?.id || ''
    });
  }
  const view = shutdownViews.get(hash);
  if (!project.equipment.some(e => e.tag === view.filter)) view.filter = '';
  return view;
}

function renderShutdown() {
  const view = shutdownView();
  return hero('PLANIFICACIÓN', 'Simulador de parada',
    'Elige una fecha para comparar el espesor esperado con los límites de cada punto.') +
    '<div class="filters shutdown-controls"><label class="filter-field"><span>Fecha de parada</span>' +
    '<input type="date" id="shutdown-date" required min="0001-01-01" max="9999-12-31" value="' + esc(view.date) + '"></label>' +
    '<label class="filter-field"><span>Velocidad de corrosión</span><select id="shutdown-scenario">' +
    opts(shutdownScenarios, view.scenario) + '</select></label>' +
    '<label class="filter-field"><span>Equipo</span><select id="shutdown-filter">' +
    opts([['','Todos los equipos'], ...project.equipment.map(e => [e.tag, e.tag + ' · ' + e.name])], view.filter) +
    '</select></label><p id="shutdown-error" role="alert" hidden></p></div>' +
    guideTip('shutdown','La fecha de parada sirve para comparar escenarios. La próxima inspección programada está en la ficha del punto.')+
    '<div id="shutdown-summary" aria-live="polite" aria-atomic="true"></div>' +
    '<div id="shutdown-model" tabindex="-1"></div>' +
    '<section class="panel shutdown-results">' +
    panelHeading('Detalle por punto', 'El margen positivo indica cuánto falta para alcanzar el mínimo. El margen negativo indica cuánto antes de la parada se alcanzaría.') +
    '<div id="shutdown-table"></div></section>';
}

function shutdownPriority(row) {
  if (row.forecast.kind === 'past') return 5;
  if (row.limits.minimum.kind === 'measured') return 0;
  if (row.forecast.state === 'minimum') return 1;
  if (row.limits.minimum.date) return 2;
  return row.forecast.state === 'alert' ? 3 : 4;
}

function shutdownSort(a,b) {
  return shutdownPriority(a) - shutdownPriority(b) ||
    (a.limits.minimum.date || '9999-12-31').localeCompare(b.limits.minimum.date || '9999-12-31') ||
    a.e.tag.localeCompare(b.e.tag) || a.p.id.localeCompare(b.p.id);
}

function shutdownCondition(row) {
  const {kind, state} = row.forecast;
  if (kind === 'past') return ['pending', 'Anterior a la última lectura'];
  if (row.limits.minimum.kind === 'measured') return ['bad', 'Mínimo medido'];
  if (state === 'minimum') return ['bad', 'Mínimo proyectado'];
  if (state === 'alert') {
    return row.limits.alert.kind === 'measured' ? ['warn','Alerta medida'] : ['warn','Alerta proyectada'];
  }
  if (kind === 'unavailable') return ['pending','Sin proyección'];
  if (state === 'normal') return ['ok', 'Sobre la alerta'];
  return ['pending', 'Por determinar'];
}

function shutdownMargin(days) {
  if (!Number.isFinite(days)) return 'Por determinar';
  if (!days) return 'Coincide con la parada';
  const distance = Math.abs(days);
  const sign = days > 0 ? '+' : '−';
  if (distance < 30) return sign + distance + (distance === 1 ? ' día' : ' días');
  const months = Math.round(distance / 30.4375 * 10) / 10;
  return sign + fmt(months, Number.isInteger(months) ? 0 : 1) + (months === 1 ? ' mes' : ' meses');
}

function shutdownSummary(rows) {
  const known = rows.filter(row => row.forecast.kind !== 'past');
  const measured = known.filter(row => row.limits.minimum.kind === 'measured');
  const crossings = known.filter(row => row.limits.minimum.kind === 'projected');
  const byStop = crossings.filter(row => row.forecast.state === 'minimum');
  const first = crossings[0];
  const assetName = row => esc(row.e.tag + ' · ' + row.p.id);
  const openButton = (row,label) => '<button type="button" class="shutdown-focus" data-shutdown-focus="' +
    row.index + '">' + esc(label) + '</button>';
  return '<div class="shutdown-overview">' +
    (measured.length ? '<article class="shutdown-stat reached"><span>Mínimo ya medido</span><strong>' +
      measured.length + (measured.length === 1 ? ' punto' : ' puntos') + '</strong><small>' +
      assetName(measured[0]) + ' · ' + dateLabel(measured[0].limits.minimum.date) + '</small>' +
      openButton(measured[0],'Localizar punto') + '</article>' : '') +
    '<article class="shutdown-stat upcoming"><span>Primer mínimo proyectado</span><strong>' +
    (first ? assetName(first) : 'Sin fecha estimada') + '</strong><small>' +
    (first ? dateLabel(first.limits.minimum.date) + ' · ' + esc(shutdownMargin(first.forecast.margin_days)) : 'Revisa las mediciones de los puntos.') +
    '</small>' + (first ? openButton(first,'Localizar punto') : '') + '</article>' +
    '<article class="shutdown-stat"><span>Cruces proyectados hasta la parada</span><strong>' +
    byStop.length + (byStop.length === 1 ? ' punto' : ' puntos') + '</strong><small>' +
    rows.length + (rows.length === 1 ? ' punto en la selección' : ' puntos en la selección') + '</small></article></div>';
}

function shutdownTable(rows) {
  if (!rows.length) return '<p class="empty">Sin puntos en esta selección.</p>';
  const body = rows.map(row => {
    const {e,p,r,limits,forecast} = row;
    const [tone, condition] = shutdownCondition(row);
    const before = forecast.kind === 'past';
    const cutoff = limits.minimum;
    const thickness = Number.isFinite(forecast.thickness_mm) ? fmt(forecast.thickness_mm,2) + ' mm' : '—';
    const valueInfo = forecast.kind === 'ended' ? 'Proyección finalizada en el mínimo' :
      forecast.kind === 'measured' ? 'Medido en esa fecha' :
      forecast.kind === 'projected' ? 'Proyectado' : before ? 'Fecha previa a la lectura' : 'Sin tasa utilizable';
    const minimumDate = before ? '—' : wallDate(cutoff);
    const margin = before ? 'Por determinar' : cutoff.kind === 'measured' ? 'Ya alcanzado' : shutdownMargin(forecast.margin_days);
    const dateInfo = cutoff.kind === 'measured' ? 'Medido el ' + minimumDate : cutoff.date ? 'Mínimo el ' + minimumDate : minimumDate;
    return '<tr data-shutdown-row="' + row.index + '"><td class="asset-cell"><a href="' + esc(equipmentScreen(e,p)) +
      '" class="table-number">' + esc(e.tag + ' · ' + p.id) + '</a><small>' + esc(p.name) + '</small></td>' +
      '<td data-field="Condición"><span class="pill ' + tone + '">' + condition + '</span></td>' +
      '<td data-field="Espesor a la parada"><b class="table-number">' + thickness +
      '</b><small>' + valueInfo + '</small></td><td data-field="Mínimo efectivo"><span class="table-number">' +
      fmt(r.minimum_mm,2) + ' mm</span></td><td data-field="Margen al mínimo"><strong class="table-number">' + margin +
      '</strong>' + (before ? '' : '<small>' + dateInfo + '</small>') + '</td>' +
      '<td><button type="button" data-shutdown-focus="' + row.index + '" aria-label="Ver ' + esc(e.tag + ' · ' + p.id) +
      ' en el modelo">Ver en modelo</button></td></tr>';
  }).join('');
  return '<div class="table-frame shutdown-table-frame"><table class="data-table shutdown-table"><thead><tr>' +
    ['Equipo / punto','Condición','Espesor a la parada','Mínimo efectivo','Margen al mínimo','Ubicación'].map(label =>
      '<th scope="col">' + label + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function bindShutdown() {
  const dateInput = $('shutdown-date');
  if (!dateInput) return;
  const view = shutdownView();
  const scope = $('shutdown-filter'), scenario = $('shutdown-scenario'), error = $('shutdown-error');
  const summary = $('shutdown-summary'), table = $('shutdown-table'), model = $('shutdown-model');
  const source = allRows();
  let rows = [];

  function markPoint() {
    const selected = rows.find(row => row.e.tag === view.tag && row.p.id === view.pointId);
    table.querySelectorAll('[data-shutdown-row]').forEach(tr =>
      tr.classList.toggle('shutdown-selected', Number(tr.dataset.shutdownRow) === selected?.index));
  }

  function showTable() {
    const visible = rows.filter(row => !view.filter || row.e.tag === view.filter);
    summary.innerHTML = shutdownSummary(visible);
    table.innerHTML = shutdownTable(visible);
    markPoint();
  }

  function chooseFromModel(tag, pointId) {
    view.tag = tag;
    view.pointId = pointId;
    if (view.filter && view.filter !== tag) {
      view.filter = tag;
      scope.value = tag;
      showTable();
    } else markPoint();
  }

  function showMap() {
    updateTimelineModel(model, {rows, date: view.date, scenario: view.scenario, tag: view.tag,
      pointId: view.pointId, onDate: setDate, onSelect: chooseFromModel});
  }

  function refresh() {
    const values = call('_shutdown',{points: source.map(row => row.r), date: view.date, scenario: view.scenario});
    rows = source.map((row,i) => ({...row, index:i, forecast:values[i], limits:row.r.wall_scenarios[view.scenario]}))
      .sort(shutdownSort);
    const visible = rows.filter(row => !view.filter || row.e.tag === view.filter);
    const selected = visible.find(row => row.e.tag === view.tag && row.p.id === view.pointId) ||
      visible.find(row => row.e.tag === view.tag) || visible[0];
    if (selected) {
      view.tag = selected.e.tag;
      view.pointId = selected.p.id;
    }
    showTable();
    showMap();
  }

  function setDate(iso) {
    if (iso !== dateInput.value) dateInput.value = iso;
    const valid = dateInput.validity.valid && /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const previouslyInvalid = !error.hidden;
    error.hidden = valid;
    error.textContent = valid ? '' : 'Ingresa una fecha completa para actualizar la simulación.';
    summary.hidden = model.hidden = table.closest('section').hidden = !valid;
    if (!valid || (iso === view.date && !previouslyInvalid)) return;
    view.date = iso;
    refresh();
  }

  dateInput.oninput = dateInput.onchange = () => setDate(dateInput.value);
  scenario.onchange = () => {
    view.scenario = scenario.value;
    if (dateInput.validity.valid) refresh();
  };
  scope.onchange = () => {
    view.filter = scope.value;
    if (view.filter) {
      const first = rows.find(row => row.e.tag === view.filter);
      if (first) { view.tag = first.e.tag; view.pointId = first.p.id; }
    }
    if (dateInput.validity.valid) { showTable(); showMap(); }
  };
  function locate(event) {
    const button = event.target.closest('[data-shutdown-focus]');
    if (!button) return;
    const row = source[Number(button.dataset.shutdownFocus)];
    if (!row) return;
    chooseFromModel(row.e.tag,row.p.id);
    showMap();
    model.focus({preventScroll:true});
    model.scrollIntoView({block:'start'});
  }
  summary.onclick = table.onclick = locate;
  refresh();
}
