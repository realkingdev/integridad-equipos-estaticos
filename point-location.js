"use strict";

function pointLocationFields(equipment, point) {
  const saved = point.location3d;
  const tank = equipment.family === 'tank';
  const pipe = equipment.family === 'pipe';
  const shape = saved?.shape ?? (pipe && /codo/i.test(point.name) ? 'elbow' : 'cylinder');
  const diameter = saved?.diameter_mm ?? (pipe ? equipment.diameter_mm : '');
  return '<section class="point-location wide" aria-label="Ubicación del punto">' +
    '<div class="row point-location-head"><strong>Ubicación del punto</strong>' +
    '<div class="point-view-switch" role="group" aria-label="Vista de ubicación">' +
    '<button type="button" data-location-view="3d" aria-pressed="true">Modelo 3D</button>' +
    '<button type="button" data-location-view="2d" aria-pressed="false">Esquema 2D</button></div></div>' +
    '<div class="point-location-layout" data-location-pane="3d"><div class="point-viewer">' +
    '<canvas class="point-surface" tabindex="0" aria-label="Superficie 3D. Usa las flechas para girar y más o menos para acercar o alejar."></canvas>' +
    '<div class="row point-view-tools">' +
    '<button type="button" data-location-zoom="out" aria-label="Alejar modelo">−</button>' +
    '<button type="button" data-location-zoom="in" aria-label="Acercar modelo">+</button>' +
    '<button type="button" data-location-reset>Vista inicial</button>' +
    '<button type="button" data-location-focus>Ver punto</button></div>' +
    '<small class="point-view-help">Pulsa sobre la pared para marcar. Arrastra para girar el modelo.</small>' +
    '<p class="point-selection" role="status"></p></div>' +
    '<div class="point-location-fields">' +
    (pipe ? select('location_shape', 'Superficie', [['cylinder', 'Tramo recto'], ['elbow', 'Codo circular']], shape) : '') +
    '<div class="location-dimensions">' +
    field('location_diameter', 'Diámetro exterior (mm)', diameter, 'number', 'inputmode="decimal"') +
    '<div data-location-size="cylinder">' +
    field('location_length', tank ? 'Altura de la virola (mm)' : 'Longitud de referencia (mm)', saved?.length_mm, 'number', 'inputmode="decimal"') + '</div>' +
    '<div class="location-bend" data-location-size="elbow" hidden>' +
    field('location_radius', 'Radio al eje (mm)', saved?.bend_radius_mm, 'number', 'inputmode="decimal"') +
    field('location_bend', 'Ángulo del codo (°)', saved?.bend_deg ?? 90, 'number', 'inputmode="decimal"') + '</div></div>' +
    '<button type="button" data-pick-zero aria-pressed="false">Marcar inicio (0°) en el modelo</button>' +
    '<small data-zero-help aria-live="polite"></small>' +
    field('location_reference', 'Referencia visible en terreno', saved?.reference, 'text',
      'placeholder="' + (tank ? 'Ej. borde inferior y soldadura norte' : 'Ej. brida B1 y marca superior') + '"') +
    '<div class="location-coordinates">' +
    field('location_position', tank ? 'Altura desde el borde inferior (mm)' : 'Distancia desde el origen (mm)', saved?.position_mm, 'number', 'inputmode="decimal"') +
    field('location_angle', 'Ángulo perimetral (°)', saved?.angle_deg, 'number', 'inputmode="decimal"') + '</div>' +
    '<small class="point-coordinate-help"></small>' +
    '<small>Usa cotas del plano o de terreno para volver al mismo punto.</small>' +
    '</div></div><div class="point-location-2d" data-location-pane="2d" hidden>' +
    '<div class="picker"><img src="' + esc(photo(equipment)) + '" alt="Esquema para ubicar el marcador">' +
    '<span class="pin" aria-hidden="true">+</span></div>' +
    '<div class="location-coordinates">' +
    field('x', 'Posición horizontal (%)', point.x, 'number', '') +
    field('y', 'Posición vertical (%)', point.y, 'number', '') + '</div>' +
    '<small>Ubicación del marcador sobre este esquema.</small></div></section>';
}

function initializePointLocation(equipment, point) {
  const root = $('fields').querySelector('.point-location');
  const form = $('form').elements;
  const selection = root.querySelector('.point-selection');
  const guidance = root.querySelector('.point-coordinate-help');
  const focus = root.querySelector('[data-location-focus]');
  const position = form.location_position;
  const angle = form.location_angle;
  let model, geometryReady = false, pickedFraction = null, mode = '3d';
  let zero = point.location3d?.zero_deg ?? 0, choosingZero = false;
  const zeroButton = root.querySelector('[data-pick-zero]');
  function zeroMode(active) {
    choosingZero = active;
    zeroButton.setAttribute('aria-pressed', String(active));
    zeroButton.textContent = active ? 'Cancelar selección de inicio' : 'Marcar inicio (0°) en el modelo';
    root.querySelector('[data-zero-help]').textContent = active
      ? 'Gira el equipo y toca la pared a la altura de una soldadura o marca visible. Esa dirección será tu 0°.'
      : (equipment.family === 'tank' ? 'La altura se mide desde el borde inferior. ' : 'La distancia se mide desde el extremo de entrada. ') +
        'El ángulo se mide desde la línea de 0°. Puedes describir la marca física para encontrarla en terreno.';
  }
  zeroButton.onclick = () => zeroMode(!choosingZero);
  zeroMode(false);
  const viewer = pointModelViewer(root.querySelector('canvas'), hit => {
    if (!hit) {
      selection.textContent = 'Pulsa sobre la pared lateral del equipo.';
      return;
    }
    if (choosingZero) {
      const offset = hit.angle_deg;
      const relative = v => Number(pointTurn(v).toFixed(6)) % 360;
      zero = relative(zero + offset);
      if (Number.isFinite(angle.valueAsNumber)) angle.value = relative(angle.valueAsNumber - offset);
      form.location_reference.value = 'Marca visual en el modelo a ' + fmt(zero,1) + '° desde la referencia inicial';
      zeroMode(false);
      refreshGeometry();
      root.querySelector('[data-zero-help]').textContent = 'Inicio marcado. Ahora toca el punto de medición o ajusta sus coordenadas. Pulsa Guardar para registrar los cambios.';
      return;
    }
    position.value = hit.position_mm;
    angle.value = hit.angle_deg;
    pickedFraction = hit.position_mm / model.length;
    refreshMarker();
  });
  $('modal').addEventListener('close', viewer.close, {once: true});
  const shape = () => form.location_shape?.value ?? 'cylinder';
  const readGeometry = () => ({
    shape: shape(), zero_deg: zero,
    diameter_mm: form.location_diameter.valueAsNumber,
    ...(shape() === 'elbow' ? {
      bend_radius_mm: form.location_radius.valueAsNumber,
      bend_deg: form.location_bend.valueAsNumber
    } : {length_mm: form.location_length.valueAsNumber})
  });
  const readCoordinates = () => ({position_mm: position.valueAsNumber, angle_deg: angle.valueAsNumber});
  function refreshMarker() {
    const marker = readCoordinates();
    const selected = marker.position_mm >= 0 && marker.position_mm <= model.length && marker.angle_deg >= 0 && marker.angle_deg < 360;
    focus.disabled = !selected;
    viewer.setMarker(selected ? marker : null);
    selection.classList.remove('invalid');
    selection.textContent = selected
      ? fmt(marker.position_mm, 2) + ' mm · ' + fmt(marker.angle_deg, 2) + '°' +
        (geometryReady ? '' : ' · Vista de referencia')
      : 'Marca el punto o escribe su distancia y ángulo.';
  }
  function refreshGeometry() {
    root.querySelectorAll('[data-location-size]').forEach(node => { node.hidden = node.dataset.locationSize !== shape(); });
    try {
      model = pointGeometry(equipment.family, readGeometry());
      geometryReady = true;
    } catch {
      const diameter = form.location_diameter.valueAsNumber;
      const d = diameter > 0 && diameter <= 1e9 ? diameter : equipment.diameter_mm;
      model = pointGeometry(equipment.family, {
        shape: shape(), zero_deg: zero, diameter_mm: d, length_mm: equipment.family === 'tank' ? 2500 : d * 4,
        bend_radius_mm: d * 1.5, bend_deg: 90
      });
      geometryReady = false;
    }
    if (pickedFraction !== null) position.value = Math.min(model.length, Math.round(pickedFraction * model.length * 10) / 10);
    const direction = equipment.family === 'tank'
      ? 'Ángulo horario visto desde arriba, a partir de la marca de 0°.'
      : '0° arriba. Ángulo horario mirando desde el origen hacia el tramo.';
    guidance.textContent = (geometryReady ? 'Distancia de 0 a ' + fmt(model.length, 1) + ' mm. ' : 'Completa las cotas para guardar. ') +
      (zero ? 'Ángulo desde tu marca de inicio.' : shape() === 'elbow' ? 'Distancia sobre el eje curvo. 0° arriba y 90° hacia el interior del codo.' : direction);
    viewer.setModel(model);
    refreshMarker();
  }
  function show(next) {
    mode = next;
    root.querySelectorAll('[data-location-view]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.locationView === mode)));
    root.querySelectorAll('[data-location-pane]').forEach(pane => { pane.hidden = pane.dataset.locationPane !== mode; });
  }
  root.querySelectorAll('[data-location-view]').forEach(button =>
    button.addEventListener('click', () => show(button.dataset.locationView)));
  root.querySelector('[data-location-zoom="in"]').addEventListener('click', () => viewer.zoomBy(1.2));
  root.querySelector('[data-location-zoom="out"]').addEventListener('click', () => viewer.zoomBy(1 / 1.2));
  root.querySelector('[data-location-reset]').addEventListener('click', () => viewer.reset());
  focus.addEventListener('click', () => viewer.reset(true));
  form.location_shape?.addEventListener('change', () => {
    zero = 0; zeroMode(false);
    position.value = angle.value = '';
    pickedFraction = null;
    refreshGeometry();
    viewer.reset();
  });
  for (const input of [form.location_diameter, form.location_length, form.location_radius, form.location_bend]) {
    input.addEventListener('input', refreshGeometry);
  }
  for (const input of [position, angle]) input.addEventListener('input', () => {
    pickedFraction = null;
    refreshMarker();
  });
  selectMarkerPosition(root.querySelector('.picker'), form.x, form.y);
  refreshGeometry();
  viewer.reset(Boolean(point.location3d));
  return () => {
    if (![form.x, form.y].every(input => input.valueAsNumber >= 0 && input.valueAsNumber <= 100)) {
      show('2d');
      [form.x, form.y].find(input => !(input.valueAsNumber >= 0 && input.valueAsNumber <= 100)).focus();
      throw Error('Las coordenadas del esquema deben estar entre 0 y 100 %.');
    }
    if (choosingZero) throw Error('Toca la pared para fijar el inicio o cancela la selección.');
    if (zero && !position.value && !angle.value) throw Error('Marca también el punto de medición antes de guardar.');
    if (!position.value && !angle.value && !position.validity.badInput && !angle.validity.badInput) return undefined;
    const location = {...readGeometry(), ...readCoordinates(), reference: form.location_reference.value.trim()};
    try {
      checkPointLocation(equipment, location);
    } catch (error) {
      show('3d');
      selection.textContent = error.message;
      selection.classList.add('invalid');
      selection.scrollIntoView({block: 'nearest'});
      throw error;
    }
    return location;
  };
}

function pointLocationSummary(equipment, point) {
  const location = point.location3d;
  if (!location) return '';
  const distance = location.shape === 'elbow' ? ' sobre el eje'
    : equipment.family === 'tank' ? ' de altura' : ' desde el origen';
  return '<dl class="point-location-summary"><div><dt>Ubicación 3D</dt>' +
    '<dd><strong class="mono">' + fmt(location.position_mm, 2) + ' mm</strong>' + distance + ' · <strong class="mono">' +
    fmt(location.angle_deg, 2) + '°</strong></dd></div>' +
    '<div><dt>Origen y 0°</dt><dd>' + esc(location.reference) + '</dd></div></dl>';
}
