const interventionKinds = {repair: 'Reparación', replace: 'Reemplazo'};
const interventionStates = {planned: 'Planificada', active: 'En ejecución', closed: 'Cerrada'};

function interventionMilestones(order) {
  const days = [order.purchaseDays, order.installDays];
  if (!isCalendarDate(order.target) || !days.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 36500)) return null;
  const target = Date.parse(order.target + 'T00:00:00Z');
  const start = target - order.installDays * 86400000;
  const buy = start - order.purchaseDays * 86400000;
  if (buy < Date.parse('0001-01-01T00:00:00Z')) return null;
  const iso = stamp => new Date(stamp).toISOString().slice(0, 10);
  return {buy: iso(buy), start: iso(start)};
}

function measurementEpochAt(point, date, previous, following) {
  if (previous) return previous.epoch ?? 0;
  const epoch = following?.epoch ?? 0;
  if (!following?.readingId) return epoch;
  const boundary = point.interventions?.find(order => order.closure?.readingId === following.readingId)?.closure;
  return boundary?.series === 'restart' && date < boundary.workDate ? (epoch === 0 ? 1 : epoch - 1) : epoch;
}

function validatePointInterventions(point) {
  const orders = point.interventions ?? [];
  if (!Array.isArray(orders)) throw Error('El historial de intervenciones debe ser una lista.');
  const unique = new Set(), used = new Set(), readings = new Map();
  const currentDate = today();
  const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9.-]{1,100}$/.test(value);
  for (const reading of point.measurements) {
    if (!reading || reading.readingId === undefined) continue;
    if (!validKey(reading.readingId) || readings.has(reading.readingId)) throw Error('La identificación de una medición de verificación es inválida o está repetida.');
    readings.set(reading.readingId, reading);
  }
  for (const order of orders) {
    if (!order || !validKey(order.id) || unique.has(order.id) || !Object.hasOwn(interventionKinds, order.kind) ||
      !Object.hasOwn(interventionStates, order.status) || !validText(order.component) || !validText(order.owner) ||
      !isCalendarDate(order.created) || order.created > currentDate || !interventionMilestones(order)) throw Error('Revisa el componente, el responsable y las fechas de la intervención.');
    unique.add(order.id);
    const close = order.closure;
    if (order.status !== 'closed') {
      if (close != null) throw Error('Una intervención abierta contiene datos de cierre.');
      continue;
    }
    const reading = readings.get(close?.readingId);
    if (!reading || used.has(close.readingId) || !validText(close.work) || !isCalendarDate(close.workDate) ||
      !isCalendarDate(close.recorded) || close.recorded > currentDate || close.recorded < order.created ||
      close.workDate > reading.date || reading.date > close.recorded ||
      !['restart','same'].includes(close.series) || (order.kind === 'replace' && close.series !== 'restart'))
      throw Error('El cierre requiere una medición vinculada y fechas de trabajo y verificación coherentes.');
    if (close.series === 'restart') {
      const previous = point.measurements.reduce((nearest, entry) =>
        entry.date < reading.date && (!nearest || entry.date > nearest.date) ? entry : nearest, null);
      if (previous && (previous.date >= close.workDate || (previous.epoch ?? 0) === (reading.epoch ?? 0)))
        throw Error('La verificación del cambio de pared debe iniciar una serie tras la última lectura del componente anterior.');
    }
    used.add(close.readingId);
  }
}

function interventionOpenButton() {
  return '<button type="button" data-intervention-action="new">Abrir intervención</button>';
}

function interventionPanel(equipment, point) {
  const orders = [...(point.interventions || [])].sort((a,b) => {
    const closed = Number(a.status === 'closed') - Number(b.status === 'closed');
    return closed || (a.status === 'closed' ? b.closure.workDate.localeCompare(a.closure.workDate) : a.target.localeCompare(b.target));
  });
  const heading = panelHeading('Intervenciones del punto', equipment.tag + ' · ' + point.id, interventionOpenButton());
  const card = order => {
    const schedule = interventionMilestones(order);
    const closed = order.status === 'closed';
    const reading = closed ? point.measurements.find(m => m.readingId === order.closure.readingId) : null;
    const data = ' data-order="' + esc(order.id) + '"';
    const verification = closed ? '<div class="intervention-result"><strong>Trabajo realizado · ' + dateLabel(order.closure.workDate) +
      '</strong><p>' + esc(order.closure.work) + '</p><p>Verificación del ' + dateLabel(reading.date) + ' · ' + fmt(reading.thickness,3) +
      ' ' + esc(reading.unit) + ' · ' + esc(reading.technique) + ' · ' +
      (order.closure.series === 'restart' ? 'Inicio de serie' : 'Misma serie') + '</p></div>' : '';
    const buttons = closed ? '<button type="button" data-intervention-action="reading"' + data + '>Ver medición</button>' :
      '<button type="button" data-intervention-action="edit"' + data + '>Editar plan</button>' +
      '<button type="button" data-intervention-action="close"' + data + '>Registrar cierre</button>';
    return '<article class="intervention-record"><div class="row"><div><small>' + esc(interventionKinds[order.kind]) + '</small>' +
      '<h3>' + esc(order.component) + '</h3></div><span class="pill ' + (closed ? 'ok' : order.status === 'active' ? 'warn' : '') + '">' +
      esc(interventionStates[order.status]) + '</span></div><p>Responsable · ' + esc(order.owner) + '</p>' +
      '<dl class="intervention-dates"><div><dt>Iniciar compra</dt><dd>' + dateLabel(schedule.buy) + '</dd></div>' +
      '<div><dt>Iniciar montaje</dt><dd>' + dateLabel(schedule.start) + '</dd></div>' +
      '<div><dt>Término planificado</dt><dd>' + dateLabel(order.target) + '</dd></div></dl>' +
      verification + '<div class="buttons">' + buttons + '</div></article>';
  };
  return '<section class="panel interventions-panel">' + heading + (orders.length ? orders.map(card).join('') :
    '<p class="muted">Sin reparaciones ni reemplazos registrados para este punto.</p>') + '</section>';
}

function editIntervention(e, p, order, plannedDate) {
  const plan = order || {kind:'repair', status:'planned', component:p.name, owner:'',
    target:isCalendarDate(plannedDate) ? plannedDate : today(), purchaseDays:0, installDays:0};
  const leadInput = 'required min="0" max="36500" inputmode="numeric"';
  const fields = '<p class="wide muted">' + esc(e.tag + ' · ' + p.id) + '</p>' +
    select('kind', 'Intervención', Object.entries(interventionKinds), plan.kind) +
    select('status', 'Estado', Object.entries(interventionStates).filter(([key]) => key !== 'closed'), plan.status) +
    field('component','Componente a intervenir',plan.component,'text','required maxlength="180"') +
    field('owner','Responsable',plan.owner,'text','required maxlength="120"') +
    field('target','Término planificado',plan.target,'date') +
    field('purchaseDays','Plazo de compra (días corridos)',plan.purchaseDays,'number',leadInput) +
    field('installDays','Plazo de montaje (días corridos)',plan.installDays,'number',leadInput) +
    '<p class="wide note" data-logistics aria-live="polite"></p>';
  dialog(order ? 'Editar intervención' : 'Abrir intervención', fields, form => {
    const entry = {id: order?.id || screenId(), created: order?.created || today(), kind: form.get('kind'), status: form.get('status'),
      component: form.get('component').trim(), owner: form.get('owner').trim(), target: form.get('target'),
      purchaseDays: Number(form.get('purchaseDays')), installDays: Number(form.get('installDays'))};
    if (!interventionMilestones(entry)) throw Error('Indica fechas válidas y plazos en días enteros.');
    commit(draft => {
      const point = draft.equipment.find(asset => asset.tag === e.tag).points.find(it => it.id === p.id);
      const list = point.interventions ||= [];
      if (order) list[list.findIndex(it => it.id === order.id)] = entry;
      else list.push(entry);
    });
    notify('Intervención guardada');
  });
  const form = $('form');
  const logistics = () => {
    const dates = interventionMilestones({target:form.elements.target.value,purchaseDays:form.elements.purchaseDays.valueAsNumber,
      installDays:form.elements.installDays.valueAsNumber});
    form.querySelector('[data-logistics]').textContent = dates ?
      'Iniciar compra el ' + dateLabel(dates.buy) + ' e iniciar montaje el ' + dateLabel(dates.start) + '.' :
      'Completa la fecha de término y los plazos para calcular el inicio de cada etapa.';
  };
  form.querySelector('.gridform').addEventListener('input', logistics);
  logistics();
}

function verificationFields(p, order) {
  const claimed = new Set((p.interventions || []).map(it => it.closure?.readingId).filter(Boolean));
  const available = [...p.measurements].sort((a,b) => b.date.localeCompare(a.date)).filter(m => !claimed.has(m.readingId));
  return '<p class="wide muted">' + esc(p.id + ' · ' + order.component + ' · ' + interventionKinds[order.kind]) + '</p>' +
    field('workDate','Fecha del trabajo realizado',today(),'date','required max="' + today() + '"') +
    '<label class="wide">Trabajo realizado<textarea name="work" rows="2" required maxlength="600"></textarea></label>' +
    select('verification','Medición de verificación',[['new','Registrar nueva medición'], ...available.map(m =>
      [m.date, 'Usar ' + dateLabel(m.date) + ' · ' + fmt(m.thickness,3) + ' ' + m.unit])], 'new') +
    (order.kind === 'replace' ? '<p class="muted">El reemplazo inicia una serie para el componente instalado.</p>' :
      select('series','Comparabilidad',[['restart','Iniciar serie por cambio de pared'],['same','Conservar serie de la misma pared']], 'restart')) +
    '<div class="wide intervention-reading-fields">' +
    field('date','Fecha de verificación',today(),'date','required max="' + today() + '"') +
    field('thickness','Espesor verificado','','number','required min="0"') +
    select('unit','Unidad',[['mm','Milímetros'],['in','Pulgadas']], 'mm') +
    field('technique','Técnica','UT','text','required maxlength="80"') + '</div>';
}

function closeIntervention(e, p, order) {
  dialog('Cerrar intervención', verificationFields(p,order), form => {
    const work = form.get('work').trim();
    const workDate = form.get('workDate');
    const add = form.get('verification') === 'new';
    const date = add ? form.get('date') : form.get('verification');
    if (!work || !isCalendarDate(workDate) || !isCalendarDate(date) || date < workDate || date > today())
      throw Error('Describe el trabajo e indica una verificación realizada entre la fecha del trabajo y hoy.');
    const series = order.kind === 'replace' ? 'restart' : form.get('series');
    commit(draft => {
      const point = draft.equipment.find(asset => asset.tag === e.tag).points.find(it => it.id === p.id);
      const target = point.interventions.find(it => it.id === order.id);
      if (target.status === 'closed') throw Error('Esta intervención ya está cerrada.');
      const history = [...point.measurements].sort((a,b) => a.date.localeCompare(b.date));
      let reading = history.find(m => m.date === date);
      const previous = history.findLast(m => m.date < date);
      const following = history.find(m => m.date > date);
      if (add && reading) throw Error('Ya existe una lectura en esa fecha. Selecciónala en Medición de verificación.');
      if (add) {
        const technique = form.get('technique').trim();
        if (!technique) throw Error('Indica la técnica utilizada en la verificación.');
        reading = {date, thickness:Number(form.get('thickness')), unit:form.get('unit'), technique,
          notes:'Verificación de ' + interventionKinds[target.kind].toLowerCase() + ' · ' + target.component,
          epoch:measurementEpochAt(point,date,previous,following)};
        point.measurements.push(reading);
      }
      if (!reading || point.interventions.some(it => it.closure && it.closure.readingId === reading.readingId))
        throw Error('Selecciona una medición disponible para este cierre.');
      if (series === 'restart') {
        if (previous && previous.date >= workDate)
          throw Error('Selecciona la primera medición realizada después de intervenir este componente.');
        const startsSeries = !add && (!previous || (previous.epoch ?? 0) !== (reading.epoch ?? 0));
        if (!startsSeries && following) throw Error('Esta lectura tiene mediciones posteriores de la misma serie. Para cerrar un cambio de pared, vincula el inicio de una serie registrada o verifica el nuevo componente con una lectura posterior al historial.');
        if (!startsSeries) reading.epoch = previous ? (previous.epoch ?? 0) + 1 : 0;
      }
      reading.readingId ||= screenId();
      target.status = 'closed';
      target.closure = {workDate, work, recorded:today(), series, readingId:reading.readingId};
    });
    notify('Intervención cerrada y medición vinculada');
  },'Cerrar intervención');
  const form = $('form');
  const mode = form.elements.verification;
  const container = form.querySelector('.intervention-reading-fields');
  const update = () => {
    container.hidden = mode.value !== 'new';
    container.querySelectorAll('input,select').forEach(input => input.disabled = container.hidden);
  };
  mode.addEventListener('change', update);
  update();
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-intervention-action]');
  if (!button || !project) return;
  const [equipment] = current();
  const point = equipment?.points[pointIndex];
  if (!point) return;
  const kind = button.dataset.interventionAction;
  const order = point.interventions?.find(it => it.id === button.dataset.order);
  if (kind === 'new' || (kind === 'edit' && order && order.status !== 'closed')) return editIntervention(equipment,point,order);
  if (kind === 'close' && order && order.status !== 'closed') return closeIntervention(equipment,point,order);
  if (kind === 'reading' && order?.closure) {
    const reading = point.measurements.find(m => m.readingId === order.closure.readingId);
    const row = [...document.querySelectorAll('[data-reading]')].find(el => el.dataset.reading === reading?.date)?.closest('tr');
    if (row) { row.tabIndex = -1; row.focus(); row.scrollIntoView({block:'center'}); }
  }
});
