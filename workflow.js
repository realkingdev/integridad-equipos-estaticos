const mb = 1024 * 1024;
const fileUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsDataURL(file);
});

function download(data, type, filename) {
  const url = URL.createObjectURL(new Blob([data], {type}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csvExport() {
  const header = ['TAG', 'Familia', 'Planta', 'Área', 'Sistema', 'CML', 'TML', 'Componente',
    'Fecha lectura', 'Medido mm', 'Mínimo mm', 'Alerta mm', 'Tasa mm/año', 'Vida años',
    'Condición', 'Próxima medición', 'Criterio'];
  const rows = visibleSchedule().map(({e, p, r}) => [
    e.tag, family[e.family], e.plant, e.area, e.system, p.cml, p.id, p.name, r.date,
    r.current_mm, r.minimum_mm, r.alert_mm, r.rate, r.life_years, r.status, r.due, r.governing
  ]);
  const cell = value => {
    const raw = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
    const text = typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  download('\uFEFF' + [header, ...rows].map(row => row.map(cell).join(';')).join('\r\n'),
    'text/csv;charset=utf-8', 'estrato-inspecciones-' + today() + '.csv');
  notify('Agenda exportada');
}

function projectBackup() {
  download(JSON.stringify(project, null, 2), 'application/json', 'estrato-' + today() + '.json');
}

function documentPanel(e) {
  const entries = (e.documents || []).map((doc, index) =>
    '<tr><td>' + esc(doc.name) + '</td><td>' + fmt(doc.bytes / 1024, 0) + ' KB</td><td><button data-doc="' + index + '">Abrir PDF</button></td></tr>');
  return '<div class="panel"><div class="row"><div><h2>Documentos técnicos</h2><small>Planos, informes de inspección y fichas PDF.</small></div>' +
    action('＋ Adjuntar PDF','attach') + '</div>' +
    (entries.length ? '<div class="scroll"><table><tbody>' + entries.join('') + '</tbody></table></div>' :
      '<p class="empty">Este equipo aún no tiene documentos adjuntos.</p>') + '</div>';
}

function attachPdf(index) {
  dialog('Adjuntar documento', '<label class="wide">PDF de hasta 1 MB<input type="file" name="pdf" accept="application/pdf,.pdf" required></label>' +
    '<small class="wide">El documento se guarda en el navegador y se incluye en el respaldo JSON.</small>', async form => {
    const file = form.get('pdf');
    if (file.size > mb || await file.slice(0, 5).text() !== '%PDF-') throw Error('Seleccione un PDF válido de hasta 1 MB.');
    const data = await fileUrl(file);
    const doc = {name:file.name, bytes:file.size, data:data.replace(/^data:[^,]+,/, 'data:application/pdf;base64,')};
    commit(p => {
      const e = p.equipment[index];
      e.documents ??= [];
      e.documents.push(doc);
    });
    notify('Documento adjuntado');
  });
}

function openDocument(index) {
  const [equipment] = current();
  const doc = equipment?.documents?.[index];
  if (!doc) return;
  const bytes = Uint8Array.from(atob(doc.data.split(',')[1]), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function selectMarkerPosition(picker, x, y) {
  const pin = picker.querySelector('.pin');
  const update = () => {
    pin.style.left = Number(x.value) + '%';
    pin.style.top = Number(y.value) + '%';
  };
  x.addEventListener('input', update);
  y.addEventListener('input', update);
  picker.addEventListener('click', event => {
    const bounds = picker.getBoundingClientRect();
    x.value = Math.min(100, Math.max(0, (event.clientX - bounds.left) / bounds.width * 100)).toFixed(1);
    y.value = Math.min(100, Math.max(0, (event.clientY - bounds.top) / bounds.height * 100)).toFixed(1);
    update();
  });
  update();
}

