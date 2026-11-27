const sourceLimit = 2 * 1024 * 1024;
const sourceRowLimit = 5000;
let sourcePreview, sourceReading=false, sourceError='', sourceInfo='';
let sourceUrl='';

function sourcePage() {
  return hero('CONEXIONES E IMPORTACIONES','Fuentes de datos','Consulta bases de datos y agrega sus lecturas al caso activo.')+
    '<div class="twocol source-grid"><form id="remote-source" class="panel scenario-form">'+
    '<div class="section-kicker"><i></i> 1 · API REST</div><h2>Consultar una fuente web</h2>'+
    '<p class="muted">El endpoint debe entregar JSON o CSV y permitir el acceso desde Estrato mediante CORS.</p>'+
    '<label class="entry"><span>URL del endpoint</span><input name="url" type="url" placeholder="https://datos.ejemplo.cl/mediciones" value="'+esc(sourceUrl)+'" required></label>'+
    '<label class="entry"><span>Token de lectura · opcional</span><input name="token" type="password" autocomplete="off" placeholder="Bearer"></label>'+
    '<div class="scenario-actions"><button class="primary" '+(sourceReading?'disabled':'')+'>Consultar y previsualizar</button></div>'+
    '<small class="scenario-note">El token se utiliza para esta consulta y se borra del campo después de enviarlo.</small></form>'+
    '<form id="file-source" class="panel scenario-form"><div class="section-kicker"><i></i> 1 · ARCHIVOS LOCALES</div><h2>Leer una base o un archivo</h2>'+
    '<p class="muted">SQLite, CSV de lecturas, JSON de una API o respaldo Estrato. Vincula tus columnas después de abrir la fuente.</p>'+
    '<label class="entry"><span>Seleccionar archivo · máximo 2 MB</span><input name="sourceFile" type="file" accept=".db,.sqlite,.sqlite3,.db3,.csv,.tsv,.json" required></label>'+
    '<div class="scenario-actions"><button class="primary" '+(sourceReading?'disabled':'')+'>Leer y previsualizar</button>'+
    '<button type="button" data-source-example>Descargar plantilla CSV</button></div></form></div>'+
    (sourceReading?'<p class="panel muted" role="status">Leyendo fuente de datos…</p>':'')+
    (sourceError?'<p class="panel form-error" role="alert">'+esc(sourceError)+'</p>':'')+
    (sourceInfo?'<p class="panel note" role="status">'+esc(sourceInfo)+'</p>':'')+
    sqliteTablePanel()+sourceMappingPanel()+sourcePreviewPanel()+
    '<details class="panel technical-model"><summary>Formato para conectar una fuente</summary>'+
    '<p>Vincula las columnas de tu origen con TAG, TML, fecha y espesor. Puedes elegir el formato de fecha y la unidad predeterminada. Son opcionales <code>unidad</code> (mm o in), <code>tecnica</code> y <code>observaciones</code>.</p>'+
    '<p>Una lista JSON puede venir directa o bajo <code>mediciones</code>, <code>measurements</code> o <code>data</code>. Un respaldo Estrato agrega equipos y puntos nuevos, además de lecturas faltantes.</p>'+
    '<pre class="equation mono">CREATE TABLE mediciones (\n  tag TEXT, tml TEXT, fecha TEXT, espesor REAL,\n  unidad TEXT, tecnica TEXT, observaciones TEXT\n);</pre>'+
    '<p>El TAG y el TML de cada lectura deben existir en el caso activo. La vista previa informa las coincidencias, los conflictos y las filas pendientes.</p></details>';
}

function sourcePreviewPanel() {
  if (!sourcePreview) return '';
  const {label, rows, rejected, conflicts, duplicate, added, assets, points} = sourcePreview;
  const summary = [
    comparisonValue('Lecturas nuevas',String(added)),comparisonValue('Ya registradas',String(duplicate)),
    comparisonValue('Conflictos',String(conflicts)),comparisonValue('Filas con observación',String(rejected)),
    ...(assets?[comparisonValue('Equipos nuevos',String(assets))]:[]),
    ...(points?[comparisonValue('Puntos nuevos',String(points))]:[])
  ].join('');
  return '<section class="panel"><div class="row"><div><div class="section-kicker">3 · VISTA PREVIA</div><h2>'+esc(label)+'</h2></div>'+
    '<button type="button" class="primary" data-source-apply '+(added||assets||points?'':'disabled')+'>Importar datos validados</button></div>'+
    '<div class="live-metrics">'+summary+'</div>'+
    '<div class="scroll"><table><thead><tr><th>Fila</th><th>TAG / TML</th><th>Fecha</th><th>Espesor</th><th>Resultado</th></tr></thead>'+
    '<tbody>'+rows.slice(0,30).map(r=>'<tr><td>'+esc(r.index)+'</td><td>'+esc(r.tag+' · '+r.tml)+'</td><td>'+esc(r.date||'—')+
    '</td><td>'+esc(r.thickness||'—')+'</td><td>'+esc(r.state)+'</td></tr>').join('')+'</tbody></table></div>'+
    (rows.length>30?'<p class="muted">Se muestran 30 de '+rows.length+' filas. La importación incluye todas las lecturas validadas.</p>':'')+
    '<p class="muted">Si una fecha ya existe en un punto, se conserva el registro del caso activo.</p></section>';
}

function requireSourceUrl(value) {
  const url=new URL(value);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.protocol!=='https:' && !(location.protocol==='http:' && loopback && url.protocol==='http:'))
    throw Error('Usa una URL HTTPS para conectar una fuente web.');
  if (url.username || url.password) throw Error('Ingresa la credencial en el campo de token.');
  return url;
}

async function getSourceResponse(url, token) {
  let response;
  try {
    response=await fetch(url.href,{method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
      signal:AbortSignal.timeout(15000),headers:{Accept:'application/json, text/csv',...(token?{Authorization:'Bearer '+token}:{})}});
  } catch (err) {
    throw Error('No se pudo contactar la fuente. Verifica la URL, el permiso CORS y que el endpoint responda directamente.');
  }
  if (!response.ok) throw Error('La fuente respondió con HTTP '+response.status+'.');
  const reader=response.body?.getReader();
  if (!reader) throw Error('La fuente no devolvió datos.');
  let total=0,text='';
  const decoder=new TextDecoder();
  try {
    for (;;) {
      const {value,done}=await reader.read();
      if (done) return text+decoder.decode();
      total+=value.length;
      if (total>sourceLimit) throw Error('La respuesta supera 2 MB. Reduce la consulta o pagina el origen.');
      text+=decoder.decode(value,{stream:true});
    }
  } finally {
    await reader.cancel().catch(()=>{});
  }
}

function parseTabular(text) {
  const data=text.trim().replace(/^\uFEFF/,'');
  if (!data) throw Error('El origen no contiene datos.');
  if (data.startsWith('{')||data.startsWith('[')) {
    let result;
    try {result=JSON.parse(data)} catch {throw Error('El origen devolvió un JSON inválido.')}
    if (result?.version===1&&Array.isArray(result.equipment)) return {backup:result};
    const rows=Array.isArray(result)?result:result.mediciones??result.measurements??result.data;
    if (!Array.isArray(rows)) throw Error('Usa una lista JSON de mediciones o un respaldo Estrato.');
    return {rows};
  }
  if (data.startsWith('<')) throw Error('La URL devolvió una página web. Usa el endpoint directo de JSON o CSV.');
  return {rows:call('_read_csv',text)};
}

async function readLocalSource(file) {
  if (!file.size || file.size>sourceLimit) throw Error('El archivo debe tener contenido y pesar hasta 2 MB.');
  const magic=await file.slice(0,16).text();
  if (magic==='SQLite format 3\u0000') {
    return prepareSqlSource(file);
  }
  return parseTabular(await file.text());
}

const labelKey = text=>String(text ?? '').normalize('NFD').replace(/\p{M}/gu,'').trim().toLowerCase();
function importPlan(payload,label,mapping) {
  const candidate=structuredClone(project);
  const registry=new Map(candidate.equipment.map(e=>[labelKey(e.tag),e]));
  const rows=[];
  let added=0,duplicate=0,rejected=0,conflicts=0,assets=0,points=0;
  const push=(row,state)=>rows.push({...row,index:rows.length+1,state});
  const toMm=(amount,unit)=>amount*(unit==='in'?25.4:1);

  function stage(item, measurement) {
    const {tag,tml,date,thickness,unit,technique,notes}=item;
    const row={tag,tml,date,thickness:item.raw===undefined?fmt(thickness,3):item.raw+' '+unit};
    const parsed=Date.parse(date+'T00:00:00Z');
    const invalidDate=!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date;
    const problem=invalidDate?'Fecha inválida para el formato seleccionado':date>today()?'Fecha posterior a hoy':
      !Number.isFinite(thickness)||thickness<0?'Espesor inválido':!['mm','in'].includes(unit)?'Unidad inválida · Usa mm o in':
      !technique?'Técnica de medición vacía':'';
    if (problem) {rejected++;push(row,problem);return}
    const e=registry.get(labelKey(tag));
    const p=e?.points.find(point=>labelKey(point.id)===labelKey(tml));
    if (!p) {rejected++;push(row,'TAG o TML sin coincidencia');return}
    const existing=p.measurements.find(m=>m.date===date);
    if (existing) {
      if (Math.abs(toMm(existing.thickness,existing.unit)-toMm(thickness,unit))<1e-9) {duplicate++;push(row,'Lectura existente')}
      else {conflicts++;push(row,'Conflicto con una lectura existente')}
      return;
    }
    const ordered=[...p.measurements].sort((a,b)=>a.date.localeCompare(b.date));
    const epoch=measurementEpochAt(p,date,ordered.findLast(m=>m.date<date),ordered.find(m=>m.date>date));
    if (measurement?.epoch != null && measurement.epoch!==epoch) {
      rejected++;push(row,'Serie histórica incompatible con el punto activo');return;
    }
    p.measurements.push({...measurement,date,thickness,unit,technique,notes,epoch,source:label});
    added++;push(row,'Lista para importar');
  }

  if (payload.backup) {
    evaluateAll(payload.backup);
    for (const asset of payload.backup.equipment) {
      let existing=registry.get(labelKey(asset.tag));
      if (!existing) {
        existing={...asset,points:[]};
        candidate.equipment.push(existing);
        registry.set(labelKey(asset.tag),existing);
        assets++;
      } else if (asset.family!==existing.family) {
        rejected++;push({tag:asset.tag,tml:'—'},'El TAG existe con otra familia de equipo');continue;
      }
      for (const point of asset.points) {
        if (!existing.points.some(p=>labelKey(p.id)===labelKey(point.id))) {
          existing.points.push({...point,measurements:point.measurements.map(m=>({...m,source:label}))});
          points++;
          added+=point.measurements.length;
          push({tag:asset.tag,tml:point.id},'Punto nuevo · '+point.measurements.length+' lecturas');continue;
        }
        for (const m of point.measurements) stage({...m,tag:asset.tag,tml:point.id},m);
      }
    }
  } else {
    if (payload.rows.length>sourceRowLimit) throw Error('La fuente excede 5.000 filas.');
    for (const record of payload.rows) {
      const item=resolvedSourceRecord(record,mapping);
      if (item) stage(item);
      else {rejected++;push({tag:'—',tml:'—'},'Fila incompatible')}
    }
  }
  if (added||assets||points) evaluateAll(candidate);
  return {base:project,candidate,label,rows,rejected,conflicts,duplicate,added,assets,points};
}

document.addEventListener('submit',async event=>{
  const form=event.target;
  if (!['remote-source','file-source'].includes(form.id)) return;
  event.preventDefault();
  if (sourceReading) return;
  const fields=inputsOf(form);
  sourceError='';sourceInfo='';sourcePreview=null;sourcePayload=null;sourceDb=null;sourceTables=[];sourceTable=null;
  try {
    sourceReading=true;
    const remote=form.id==='remote-source';
    if (remote) {
      const url=requireSourceUrl(String(fields.url).trim());
      sourceUrl=url.origin+url.pathname; // Los parámetros y credenciales quedan fuera de la vista persistente.
      form.elements.token.value='';
      render();
      setSourcePayload(parseTabular(await getSourceResponse(url,String(fields.token||'').trim())),url.hostname);
      sourceUrl=url.origin+url.pathname+url.search;
    } else {
      render();
      setSourcePayload(await readLocalSource(fields.sourceFile),fields.sourceFile.name);
    }
  } catch (err) {sourceError=message(err)}
  finally {sourceReading=false;if(route()[0]==='fuentes')render()}
});

document.addEventListener('click',event=>{
  if (event.target.closest('[data-source-example]')) {
    download('\uFEFFtag;tml;fecha;espesor;unidad;tecnica;observaciones\r\nL-101;TML-02;2024-10-01;5,40;mm;UT;Campaña de ejemplo\r\n',
      'text/csv;charset=utf-8','estrato-plantilla-mediciones.csv');
    return;
  }
  if (!event.target.closest('[data-source-apply]')||!sourcePreview) return;
  if (sourcePreview.base!==project) {
    sourceError='El caso cambió desde la vista previa. Vuelve a consultar la fuente.';
    sourcePreview=null;
    render();
    return;
  }
  try {
    const {candidate,added}=sourcePreview;
    commit(draft=>{draft.equipment=candidate.equipment});
    sourcePreview=null;sourcePayload=null;sourceDb=null;sourceTables=[];sourceTable=null;
    sourceInfo='Importación guardada · '+added+(added===1?' lectura nueva.':' lecturas nuevas.');
    render();
  } catch (err) {
    sourceError=message(err);
    render();
  }
});

