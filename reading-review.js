"use strict";

function readingReviewPanel(equipment, point, status) {
  const dates = point.measurements.map(row => row.date).sort().reverse();
  if (!dates.length) return '';
  const selector = '<label class="review-selector">Medición a comparar<select id="review-date">' +
    opts(dates.map(date => [date, dateLabel(date)]), dates[0]) + '</select></label>';
  return '<section class="panel reading-review" aria-labelledby="review-title"><div class="row panel-heading">' +
    '<div><h2 id="review-title" tabindex="-1">Medición frente a proyección</h2><p class="muted">' +
    esc(point.id) + ' · Comparación con la tendencia disponible antes de esta lectura.</p></div>' +
    selector + '</div><div id="review-result" aria-live="polite">' +
    readingReviewResult(equipment, point, status, dates[0]) + '</div></section>';
}

function readingReviewResult(equipment, point, status, date) {
  const result = call('_compare_reading', {family: equipment.family, point, design: status.design, date});
  const hasEstimate = result.expected_mm !== null;
  const delta = result.difference_mm;
  const direction = !hasEstimate ? '' : Math.abs(delta) < 0.005 ? 'Coincide al centésimo de milímetro.'
    : 'La lectura quedó ' + fmt(Math.abs(delta)) + ' mm ' + (delta < 0 ? 'por debajo' : 'por encima') + ' de lo previsto.';
  const cells = metric('Espesor previsto', hasEstimate ? fmt(result.expected_mm) + ' mm' : 'Sin estimación') +
    metric('Espesor medido', fmt(result.measured_mm) + ' mm');
  const before = result.previous_minimum, after = result.revised_minimum;
  const shift = result.shift_days;
  let change = '';
  if (shift !== null) {
    const days = Math.abs(shift);
    const length = days < 31 ? days + (days === 1 ? ' día' : ' días') : fmt(days / 30.4375, 1) + ' meses';
    change = days === 0 ? 'Se mantiene la fecha estimada del mínimo.'
      : 'El mínimo se ' + (shift < 0 ? 'adelanta' : 'posterga') + ' ' + length + ' en la proyección actualizada.';
  } else if (after?.kind === 'measured') {
    change = 'La nueva lectura ya alcanza el mínimo en servicio.';
  }
  return '<div class="metrics review-values">' + cells + '</div><p class="review-observation">' +
    esc(result.reason || direction) + '</p>' +
    (before && after ? '<dl class="review-dates"><div><dt>Mínimo con lecturas anteriores</dt><dd>' +
      wallDateCell(before) + '</dd></div><div><dt>Mínimo al incluir esta lectura</dt><dd>' + wallDateCell(after) +
      '</dd></div></dl>' : '') + (change ? '<p class="review-change">' + esc(change) + '</p>' : '') +
    (result.previous_date ? '<small class="muted">Proyección reconstruida con las mediciones hasta el ' +
      dateLabel(result.previous_date) + ', la tasa adoptada y los umbrales vigentes del punto.</small>' : '');
}

function updateReadingReview(date) {
  const [equipment, result] = current();
  const target = $('review-result');
  if (target && equipment) {
    target.innerHTML = readingReviewResult(equipment, equipment.points[pointIndex], result.points[pointIndex], date);
  }
}

function revealReadingReview(date) {
  const selector = $('review-date');
  if (!selector) return;
  selector.value = date;
  updateReadingReview(date);
  $('review-title').focus({preventScroll:true});
  $('review-title').scrollIntoView({block:'center'});
}

document.addEventListener('change', event => {
  if (event.target.id === 'review-date') updateReadingReview(event.target.value);
});
