"use strict";

const timelineStates = {
  normal: {label: 'Sobre la alerta', color: '#167465'},
  alert: {label: 'En alerta', color: '#a96505'},
  minimum: {label: 'En el mínimo o por debajo', color: '#af3842'},
  unknown: {label: 'Datos insuficientes', color: '#606e79'}
};

function timelineSurfaceKey(equipment, point) {
  const loc = point.location3d;
  if (!loc) return '';
  return JSON.stringify([equipment.tag, loc.shape, loc.diameter_mm,
    loc.shape === 'elbow' ? [loc.bend_radius_mm, loc.bend_deg] : loc.length_mm,
    equipment.family === 'tank' ? point.elevation_m : null, loc.reference.trim()]);
}

function timelineWindow(row, date) {
  const baseline = row.r.date || today();
  const dates = [date, baseline, row.limits.alert.date, row.limits.minimum.date].filter(Boolean).sort();
  return [dates[0], dates.at(-1)];
}

function timelinePointCard(row) {
  const {e, p, r, forecast, limits} = row;
  const condition = timelineStates[forecast.state];
  const stamp = limits.minimum.date;
  const unit = value => Number.isFinite(value) ? fmt(value, 2) + ' mm' : 'Sin dato';
  const base = r.date ? unit(r.current_mm) + ' · ' + dateLabel(r.date) : 'Sin medición';
  let estimate;
  if (forecast.kind === 'projected') estimate = 'Espesor proyectado';
  else if (forecast.kind === 'measured') estimate = 'Espesor medido';
  else if (forecast.kind === 'ended') estimate = 'Proyección terminada';
  else estimate = 'Sin proyección';
  let value = unit(forecast.thickness_mm);
  if (forecast.kind === 'ended' && stamp) value = 'Mínimo ' + (limits.minimum.kind === 'measured' ? 'medido' : 'previsto') + ' el ' + dateLabel(stamp);
  if (forecast.kind === 'past') value = 'Fecha anterior a la última lectura';
  if (forecast.kind === 'unavailable') value = 'Sin tasa comparable para esta fecha';
  return '<div class="timeline-card-head"><span class="mono">' + esc(p.id) + '</span><h3>' + esc(p.name) + '</h3></div>' +
    '<p class="timeline-condition"><i style="background:' + condition.color + '"></i>' + condition.label + '</p>' +
    '<dl class="timeline-data"><div><dt>' + estimate + '</dt><dd>' + value + '</dd></div>' +
    '<div><dt>Última medición</dt><dd>' + base + '</dd></div>' +
    '<div><dt>Alerta / mínimo</dt><dd>' + unit(r.alert_mm) + ' / ' + unit(r.minimum_mm) + '</dd></div>' +
    (p.location3d ? '<div><dt>' + (e.family === 'tank' ? 'Altura / ángulo' : 'Recorrido / ángulo') +
      '</dt><dd>' + fmt(p.location3d.position_mm, 1) + ' mm / ' + fmt(p.location3d.angle_deg, 1) +
      '°</dd></div><div><dt>Origen y 0°</dt><dd>' + esc(p.location3d.reference) + '</dd></div>' : '') + '</dl>' +
    '<div class="buttons"><a class="link" href="' + esc(equipmentScreen(e, p)) + '">Ver mediciones del punto →</a>' +
    '<button type="button" data-map-action="intervene">Planificar intervención</button></div>';
}

function createTimelineModel(root) {
  root.innerHTML = '<section class="panel timeline-map" aria-labelledby="timeline-map-title">' +
    '<h2 id="timeline-map-title">Evolución del espesor en 3D</h2>' +
    '<div class="timeline-choices"><label>Equipo<select data-timeline="asset"></select></label>' +
    '<label>Punto de monitoreo<select data-timeline="point"></select></label></div>' +
    '<div class="timeline-window"><div><label for="timeline-range">Fecha en el modelo</label>' +
    '<output for="timeline-range" data-timeline="day"></output></div>' +
    '<input id="timeline-range" type="range" step="1"><div class="timeline-ends">' +
    '<span data-timeline="start"></span><span data-timeline="end"></span></div>' +
    '<div class="timeline-jumps" role="group" aria-label="Fechas del punto">' +
    '<button type="button" data-jump="reading">Última medición</button>' +
    '<button type="button" data-jump="alert">Alerta</button>' +
    '<button type="button" data-jump="minimum">Mínimo</button></div></div>' +
    '<div class="timeline-inspection"><div><div data-timeline="surface">' +
    '<canvas class="point-surface timeline-canvas" tabindex="0" aria-label="Vista 3D. Pulsa un marcador para ver el punto. Usa las flechas para girar y más o menos para ajustar el zoom."></canvas>' +
    '<div class="row point-view-tools"><button type="button" data-map-action="out" aria-label="Alejar modelo">−</button>' +
    '<button type="button" data-map-action="in" aria-label="Acercar modelo">+</button>' +
    '<button type="button" data-map-action="focus">Centrar punto</button><button type="button" data-map-action="reset">Vista inicial</button></div>' +
    '<small class="timeline-caption" data-timeline="caption"></small></div>' +
    '<div class="timeline-missing" data-timeline="missing" hidden><strong>Ubicación 3D pendiente</strong>' +
    '<p>Registra las cotas del componente, el origen y el ángulo de este punto para ubicarlo en el modelo.</p>' +
    '<button type="button" data-map-action="locate">Ubicar este punto</button></div></div>' +
    '<div class="timeline-point-card" data-timeline="detail"></div></div>' +
    '<div class="timeline-key" aria-label="Condición por espesor">' +
    Object.values(timelineStates).map(({color,label}) => '<span><i style="background:' + color + '"></i>' + label + '</span>').join('') +
    '</div></section>';
  const node = key => root.querySelector('[data-timeline="' + key + '"]');
  const assets = node('asset'), points = node('point'), surface = node('surface'), missing = node('missing');
  const day = node('day'), start = node('start'), end = node('end'), range = root.querySelector('#timeline-range');
  let options, selected, surfaceKey, viewer, pendingDate, updatingFromRange = false;
  const dayNumber = iso => Date.parse(iso + 'T00:00:00Z') / 86400000;
  function choose(tag, pointId) {
    const config = {...options, tag, pointId};
    update(config);
    config.onSelect?.(tag, pointId);
  }
  function update(config) {
    options = config;
    const {rows, date, tag, pointId} = options;
    if (!rows.length) return;
    const currentTag = rows.find(({e}) => e.tag === tag)?.e.tag || rows[0].e.tag;
    const group = rows.filter(({e}) => e.tag === currentTag).sort((a,b) =>
      a.p.id.localeCompare(b.p.id, 'es', {numeric:true}));
    const row = group.find(({p}) => p.id === pointId) || group[0];
    const {e, p} = row;
    const samePoint = selected?.e.tag === e.tag && selected?.p.id === p.id;
    selected = row;
    const equipment = [...new Map(rows.map(({e}) => [e.tag, e])).values()]
      .sort((a,b) => a.tag.localeCompare(b.tag, 'es', {numeric:true}));
    updateChoices(assets, equipment.map(item => [item.tag, item.tag + ' · ' + item.name]), currentTag);
    updateChoices(points, group.map(({p}) => [p.id, p.id + ' · ' + p.name]), p.id);
    if (!updatingFromRange) {
      const [first, last] = timelineWindow(row, date);
      range.min = dayNumber(first);
      range.max = dayNumber(last);
      range.disabled = first === last;
      start.textContent = dateLabel(first);
      end.textContent = dateLabel(last);
    }
    range.value = dayNumber(date);
    range.setAttribute('aria-valuetext', dateLabel(date));
    const jumps = {reading: row.r.date, alert: row.limits.alert.date, minimum: row.limits.minimum.date};
    for (const button of root.querySelectorAll('[data-jump]')) {
      const stamp = jumps[button.dataset.jump];
      button.hidden = !stamp;
      if (!stamp) continue;
      const label = button.textContent + ' · ' + dateLabel(stamp);
      button.dataset.date = stamp;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(stamp === date));
    }
    day.value = dateLabel(date) + ' · ' + wallProfiles.find(item => item.key === config.scenario).label;
    node('detail').innerHTML = timelinePointCard(row);
    surface.hidden = !p.location3d;
    missing.hidden = Boolean(p.location3d);
    if (!p.location3d) {
      surfaceKey = undefined;
      return;
    }
    const key = timelineSurfaceKey(e, p);
    const mounted = surfaceKey === key;
    surfaceKey = key;
    if (!viewer) viewer = pointModelViewer(root.querySelector('canvas'), null, id => choose(selected.e.tag, id));
    if (!mounted) viewer.setModel(pointGeometry(e.family, p.location3d));
    const peers = group.filter(item => timelineSurfaceKey(item.e, item.p) === key);
    viewer.setMarkers(peers.map(({p,forecast}) => ({
      id: p.id, position_mm: p.location3d.position_mm, angle_deg: p.location3d.angle_deg,
      color: timelineStates[forecast.state].color
    })), p.id);
    if (!mounted || !samePoint) centerPoint();
    const count = peers.length === 1 ? '1 punto registrado' : peers.length + ' puntos registrados';
    node('caption').textContent = count + ' en esta superficie y origen. Arrastra para girar y pulsa un marcador para seleccionarlo.';
  }
  function centerPoint() {
    viewer.reset(true);
    const location = selected.p.location3d;
    if (location.shape === 'elbow') {
      // An oblique view keeps side-wall markers visible while showing the bend in its plane.
      const pitch = Math.asin(Math.cos(location.angle_deg * Math.PI / 180));
      const tilt = Math.max(0, 0.7 - Math.abs(pitch));
      viewer.rotateBy(0, pitch < -0.01 ? -tilt : tilt);
    }
  }
  function updateChoices(select, choices, value) {
    const signature = JSON.stringify(choices);
    if (select.dataset.signature !== signature) {
      select.innerHTML = opts(choices, value);
      select.dataset.signature = signature;
    }
    select.value = value;
  }
  assets.addEventListener('change', () => {
    const first = options.rows.find(({e}) => e.tag === assets.value);
    if (first) choose(first.e.tag, first.p.id);
  });
  points.addEventListener('change', () => choose(assets.value, points.value));
  range.addEventListener('input', () => {
    if (pendingDate) cancelAnimationFrame(pendingDate);
    pendingDate = requestAnimationFrame(() => {
      pendingDate = 0;
      const date = new Date(range.valueAsNumber * 86400000).toISOString().slice(0, 10);
      if (options.date !== date) {
        updatingFromRange = true;
        try { options.onDate(date); } finally { updatingFromRange = false; }
      }
    });
  });
  root.addEventListener('click', event => {
    const jump = event.target.closest('[data-jump]');
    if (jump) {
      options.onDate(jump.dataset.date);
      return;
    }
    switch (event.target.closest('[data-map-action]')?.dataset.mapAction) {
      case 'in': viewer?.zoomBy(1.2); break;
      case 'out': viewer?.zoomBy(1 / 1.2); break;
      case 'reset': viewer?.reset(); break;
      case 'focus': centerPoint(); break;
      case 'intervene':
        openEquipmentScreen(selected.e, selected.p, 'monitoreo');
        editIntervention(selected.e, selected.p, null, options.date);
        break;
      case 'locate': {
        openEquipmentScreen(selected.e, selected.p, 'monitoreo');
        const index = project.equipment.findIndex(e => e.tag === selected.e.tag);
        pointForm(index, project.equipment[index].points.findIndex(p => p.id === selected.p.id));
        break;
      }
    }
  });
  // Navigation replaces the app's children; release the canvas observer when its view is detached.
  const detach = new MutationObserver(() => {
    if (root.isConnected) return;
    detach.disconnect();
    viewer?.close();
    if (pendingDate) cancelAnimationFrame(pendingDate);
  });
  detach.observe($('app'), {childList:true});
  return update;
}

const timelineModels = new WeakMap();
function updateTimelineModel(root, config) {
  if (!timelineModels.has(root)) timelineModels.set(root, createTimelineModel(root));
  timelineModels.get(root)(config);
}
