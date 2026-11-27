function withMeasurementRevision(original, updated, reason) {
  const {revisions = [], ...previous} = original;
  return {...previous,...updated,revisions:[...revisions,{date:today(),reason,previous}]};
}

function measure(equipmentIndex, locationIndex, originalDate) {
  const equipment = project.equipment[equipmentIndex];
  const point = equipment.points[locationIndex];
  const sorted = [...point.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const original = sorted.find(reading => reading.date === originalDate);
  const latest = sorted.at(-1);
  const editing = Boolean(original);
  const options = [['same','Serie correspondiente a la fecha'], ['restart','Iniciar serie por intervención']];
  dialog(editing ? 'Corregir medición' : 'Registrar medición',
    '<p class="wide muted">' + esc(equipment.tag + ' · ' + point.id + ' · ' + point.name) + '</p>' +
    field('date','Fecha de medición',original?.date || today(),'date','required max="' + today() + '"') +
    field('thickness','Espesor medido',original?.thickness ?? '','number','required min="0"') +
    select('unit','Unidad',[['mm','Milímetros'],['in','Pulgadas']],original?.unit || 'mm') +
    field('technique','Técnica',original?.technique || 'UT') +
    (editing ? '' : select('newSeries','Comparabilidad',options,'same')) +
    field('notes','Observación',original?.notes || '','text','maxlength="500"') +
    (editing ? field('reason','Motivo de la corrección','','text','required maxlength="500"') : '') +
    '<small class="wide">Una lectura anterior se ubica por fecha. Las intervenciones inician series nuevas a partir de su propia fecha.</small>',
    form => {
      const date = form.get('date');
      const notes = form.get('notes').trim();
      const technique = form.get('technique').trim();
      const restart = form.get('newSeries') === 'restart';
      if (!technique) throw Error('Indica la técnica de medición.');
      if (sorted.some(m => m.date === date && m !== original)) throw Error('Ya existe una lectura para esa fecha en este TML.');
      if (restart && (!notes || (latest && date <= latest.date))) throw Error('Para iniciar una serie, ingresa una fecha posterior a la última lectura y describe la intervención.');
      const previous = sorted.findLast(m => m.date < date);
      const following = sorted.find(m => m.date > date);
      let epoch = measurementEpochAt(point, date, previous, following);
      if (editing) {
        const series = original.epoch ?? 0;
        const priorBoundary = sorted.findLast(m => m.date < original.date && (m.epoch ?? 0) !== series);
        const nextBoundary = sorted.find(m => m.date > original.date && (m.epoch ?? 0) !== series);
        if ((priorBoundary && date <= priorBoundary.date) || (nextBoundary && date >= nextBoundary.date))
          throw Error('La fecha corregida debe quedar dentro de su serie original.');
        epoch = series;
      }
      if (restart) epoch = (latest?.epoch ?? 0) + 1;
      const reading = {date, thickness:Number(form.get('thickness')), unit:form.get('unit'), technique, notes, epoch};
      if (editing) {
        const reason = form.get('reason').trim();
        if (!reason) throw Error('Describe el motivo de la corrección.');
        Object.assign(reading,withMeasurementRevision(original,reading,reason));
      }
      commit(draft => {
        const readings = draft.equipment[equipmentIndex].points[locationIndex].measurements;
        if (editing) readings.splice(readings.findIndex(m => m.date === originalDate), 1, reading);
        else readings.push(reading);
      });
      openEquipmentScreen(equipment, point, 'monitoreo');
      revealReadingReview(date);
      notify(editing ? 'Corrección guardada con trazabilidad' : 'Medición guardada y evaluación actualizada');
    });
}

function revisionCell(reading) {
  if (!reading.revisions?.length) return '';
  return '<details class="revisions"><summary>' + reading.revisions.length + ' corrección(es)</summary>' +
    reading.revisions.map(entry => '<p>' + esc(dateLabel(entry.date) + ' · ' + entry.reason + ' · Antes: ' +
      dateLabel(entry.previous.date) + ', ' + fmt(entry.previous.thickness, 3) + ' ' + entry.previous.unit +
      ' · ' + entry.previous.technique + (entry.previous.notes ? ' · ' + entry.previous.notes : '')) + '</p>').join('') + '</details>';
}

