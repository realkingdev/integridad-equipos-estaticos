function detail() {
 const [equipment,result]=current();
 if (!equipment) return '<h1>Equipo no encontrado</h1><a href="#equipos" class="link">Volver al registro</a>';
 if (currentId!==equipment.tag) {currentId=equipment.tag;pointIndex=0;tab='monitoreo'}
 pointIndex=Math.min(pointIndex,equipment.points.length-1);
 const point=equipment.points[pointIndex], status=result.points[pointIndex];

 const header='<a class="back" href="#equipos">Registro de equipos</a>'+
   hero(equipment.tag+' / '+family[equipment.family],equipment.name,
     [equipment.plant,equipment.area,equipment.system].join(' · '),
     action('Editar equipo','edit')+action('＋ Medición','measure',true))+
   equipmentMeta(equipment)+
   '<div class="tabs" aria-label="Vistas del equipo">'+Object.entries(equipmentTabs).map(([key,title])=>
     '<button type="button" data-tab="'+key+'" class="'+(tab===key?'active':'')+'" aria-current="'+
     (tab===key?'page':'false')+'">'+esc(title)+'</button>').join('')+'</div>';

 if (tab==='documentos') return header+documentPanel(equipment);
 if (tab==='diseno') return header+renderDesignWorkbench(equipment,point);
 if (tab==='simular') return header+renderInspectionWorkbench(equipment,point);
 if (tab==='ficha') return header+equipmentProfile(equipment,status);
 return header+scheduleSummary(equipment,result)+
   '<div class="inspection-grid">'+pointMap(equipment)+pointCondition(equipment,point,status)+'</div>'+
   thicknessChart(point,status)+readingReviewPanel(equipment,point,status)+
   interventionPanel(equipment,point)+trendPanel(equipment,point,status)+measurementHistory(point);
}

function equipmentMeta(equipment) {
 const rows=[
   ['Material',equipment.material],['Código de diseño',designCodes[equipment.family]],
   equipment.circuit?['Circuito',equipment.circuit]:['Servicio',equipment.service]
 ];
 return '<dl class="equipment-meta">'+rows.map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';
}

function pointMap(equipment) {
 const drawing='<div class="drawing"><img src="'+esc(photo(equipment))+'" alt="'+esc('Esquema técnico de '+equipment.name)+'">'+
   equipment.points.map((point,i)=>'<button type="button" class="pin '+(i===pointIndex?'active':'')+'" data-pin="'+i+
     '" title="'+esc(point.id+' '+point.name)+'" aria-label="'+esc(point.id+' '+point.name)+'" aria-pressed="'+(i===pointIndex)+
     '" style="left:'+point.x+'%;top:'+point.y+'%">'+(i+1)+'</button>').join('')+'</div>';
 const links='<div class="tml-links" aria-label="Puntos de medición" role="group">'+equipment.points.map((point,i)=>
   '<a href="'+esc(equipmentScreen(equipment,point))+'" aria-current="'+(i===pointIndex)+'">'+esc(point.id)+'</a>').join('')+'</div>';
 return '<section class="panel">'+panelHeading('Ubicaciones de monitoreo','',action('＋ Punto','point'))+drawing+links+
   '<div class="row map-footer"><small>CML identifica la ubicación. TML identifica el punto medido.</small>'+
   action('Cambiar esquema','image')+'</div></section>';
}

function wallScale(s) {
 const {current_mm:measured,minimum_mm:minimum,alert_mm:alert}=s;
 if (!Number.isFinite(measured) || !Number.isFinite(minimum) || !Number.isFinite(alert) || minimum>=alert) return '';
 const upper=Math.max(measured,alert)*1.12;
 const stop=value=>100*value/upper+'%';
 const label='Lectura '+fmt(measured,2)+' mm. Mínimo '+fmt(minimum,2)+' mm. Alerta '+fmt(alert,2)+' mm.';
 return '<div class="wall-scale" role="img" aria-label="'+esc(label)+'" style="--min-stop:'+stop(minimum)+
   ';--alert-stop:'+stop(alert)+';--reading-stop:'+stop(measured)+'"><span class="wall-marker"></span></div>';
}

function pointCondition(equipment,point,s) {
 const label=[point.cml,point.id].filter(Boolean).join(' / ');
 const warnings=s.warnings||[];
 const trace=[s.governing,point.basis,...warnings].filter(Boolean).map(line=>'<p>'+esc(line)+'</p>').join('');
 return '<section class="panel condition-panel"><div class="row"><span class="eyebrow">'+esc(label)+'</span>'+badge(s.status)+'</div>'+
   '<h2 class="condition-title">'+esc(point.name)+'</h2>'+
   '<div class="point-readout"><div><small>Espesor medido</small><strong>'+fmt(s.current_mm)+' <span class="unit">mm</span></strong>'+
   (s.date?'<small>'+dateLabel(s.date)+'</small>':'')+'</div><div><small>Vida remanente</small><strong>'+fmt(s.life_years)+
   ' <span class="unit">años</span></strong></div></div>'+
   '<div class="metrics">'+metric('Mínimo en servicio',fmt(s.minimum_mm)+' mm')+metric('Alerta',fmt(s.alert_mm)+' mm')+'</div>'+
   wallScale(s)+'<div class="point-date"><span class="muted">Próxima medición</span><strong>'+dateLabel(s.due)+'</strong></div>'+
   pointLocationSummary(equipment,point)+
   (trace?'<details class="point-notes"'+(s.status!=='Normal'?' open':'')+
     '><summary>Criterio y observaciones</summary><div class="note">'+trace+'</div></details>':'')+
   '<div class="buttons monitor-actions"><button type="button" data-tab="simular" class="primary">Simular lectura</button>'+
   '<a class="button-link" href="#parada/'+esc(encodeURIComponent(equipment.tag))+'/'+esc(encodeURIComponent(point.id))+'">Simular parada en 3D</a>'+
   action('Editar punto','editpoint')+'<a class="button-link" href="'+esc(guideUrl(equipment,point))+'">Consultar este punto</a></div></section>';
}

function thicknessChart(point,state) {
 const projections = state.rate > 0 && state.current_mm > state.minimum_mm;
 return '<section class="panel thickness-panel" aria-labelledby="trend-title">' +
   '<div class="row chart-header"><div><h2 id="trend-title">Proyección de vida del punto</h2>' +
   '<p>Espesor medido y fecha estimada de llegada al mínimo en servicio.</p></div>' +
   '<span class="eyebrow">'+esc(point.id)+'</span></div>' + wallResponse(state) +
   (point.measurements.length ? '<div class="row trend-controls"><div class="trend-reading" aria-live="polite"></div>' +
     (projections ? '<div class="point-view-switch" role="group" aria-label="Vista de espesor">' +
     '<button type="button" data-trend-mode="all" aria-pressed="true">Historial y proyección</button>' +
     '<button type="button" data-trend-mode="history" aria-pressed="false">Solo historial</button></div>' : '') +
     '</div><canvas id="trend" class="plot" tabindex="0" aria-label="Gráfico de espesor. Usa las flechas para recorrer las lecturas."></canvas>' +
     '<div class="legend trend-key"><span><i></i>Mediciones</span>'+
     '<span class="threshold"><i></i>Alerta '+fmt(state.alert_mm)+' mm</span>'+
     '<span class="minimum"><i></i>Mínimo '+fmt(state.minimum_mm)+' mm</span></div>'
     : '<p class="empty">Registra mediciones para ver el historial de espesor.</p>') +
   '<div class="scroll table-frame"><table class="data-table wall-table wall-scenarios"><thead><tr><th scope="col">Escenario</th>' +
   '<th scope="col">Tasa <small class="wall-rate-unit">mm/año</small></th><th scope="col">Fecha de alerta</th><th scope="col">Fecha al mínimo</th></tr></thead>' +
   '<tbody data-wall-rows>'+wallScenarioRows(state.wall_scenarios)+'</tbody></table></div>'+
   (projections ? '<details class="wall-adjust"><summary>Ajustar escenarios</summary><p>Las tasas moderada y acelerada son hipótesis aplicadas a la tasa adoptada.</p>'+
     '<div class="row"><label>Tasa moderada (% de adoptada)<input type="number" inputmode="decimal" min="0.01" max="100" step="any" value="75" data-wall-factor="lower"></label>'+
     '<label>Tasa acelerada (% de adoptada)<input type="number" inputmode="decimal" min="100" step="any" value="125" data-wall-factor="higher"></label>'+
     '<button type="button" data-wall-reset>Restablecer</button></div><p role="status" class="wall-adjust-message"></p></details>' : '') +
   '<p class="wall-footnote">La proyección supone una tasa constante desde la última lectura. La evaluación técnica define si corresponde reparar o reemplazar el componente.</p></section>';
}

function trendPanel(equipment,point,s) {
 return '<section class="panel"><h2>Evaluación de la tendencia</h2><div class="metrics">'+
   metric('Largo plazo',fmt(s.long_rate,3)+' mm/a')+metric('Corto plazo',fmt(s.short_rate,3)+' mm/a')+
   metric('Tasa adoptada',fmt(s.rate,3)+' mm/a')+metric('Intervalo',fmt(s.interval_years)+' años')+'</div>'+
   trendBasis(s)+timing(s)+pointEvidence(equipment,point,s)+'</section>';
}

function measurementHistory(point) {
 const measurements=[...point.measurements].sort((a,b)=>b.date.localeCompare(a.date));
 const rows=measurements.map(m=>'<tr><td class="table-number">'+dateLabel(m.date)+'</td>'+
   '<td class="table-number align-right">'+fmt(m.thickness)+' '+esc(m.unit)+'</td>'+
   '<td>'+esc(m.technique)+'</td><td class="table-number">'+esc(m.epoch??0)+'</td>'+
   '<td>'+esc(m.notes)+(m.source?'<small class="source-origin">Fuente · '+esc(m.source)+'</small>':'')+revisionCell(m)+'</td>'+
   '<td><button type="button" data-reading="'+esc(m.date)+'">Corregir</button></td></tr>').join('');
 const table='<div class="scroll table-frame"><table class="data-table history-table"><thead><tr>'+
   '<th scope="col">Fecha</th><th scope="col" class="align-right">Espesor</th><th scope="col">Técnica</th><th scope="col">Serie</th>'+
   '<th scope="col">Observación</th><th scope="col">Acción</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
 return '<section class="panel history-panel">'+panelHeading('Historial de mediciones',
   point.id+' · '+measurements.length+' '+(measurements.length===1?'lectura':'lecturas'))+
   (measurements.length?table:'<p class="empty">Sin lecturas. Registra la primera medición para iniciar el historial.</p>')+'</section>';
}

const metaLabels={
 tag:'TAG',name:'Nombre del equipo',plant:'Planta',area:'Área',system:'Sistema',component:'Componente',service:'Servicio',fluid:'Fluido',
 circuit:'Circuito',material:'Material',temp_c:'Temperatura de diseño (°C)',pressure_mpa:'Presión de diseño (MPa)',
 operating_temp_c:'Temperatura de operación (°C)',operating_pressure_mpa:'Presión de operación (MPa)',diameter_mm:'Diámetro (mm)',
 nominal_mm:'Espesor nominal (mm)',ca_mm:'Sobreespesor por corrosión (mm)',efficiency:'Eficiencia de junta',
 liquid_height_m:'Altura de líquido (m)',sg:'Gravedad específica'
};

function metaKeys(e) {
 return Object.keys(metaLabels).filter(k=>e[k]!=null&&(e.family==='pipe'||k!=='circuit')&&
   (e.family==='tank'||!['liquid_height_m','sg'].includes(k)));
}

function equipmentProfile(e, status) {
 const permitted=metaKeys(e);
 const group=(title,fields)=>'<section class="info-group"><h3>'+esc(title)+'</h3><dl>'+
   fields.filter(k=>permitted.includes(k)).map(k=>{
     const numeric=typeof e[k]==='number';
     const value=numeric?fmt(e[k],['efficiency','sg'].includes(k)?2:3):e[k];
     return '<div class="info-pair"><dt>'+esc(metaLabels[k])+'</dt><dd'+(numeric?' class="mono"':'')+'>'+esc(value)+'</dd></div>';
   }).join('')+'</dl></section>';
 return '<section class="panel"><h2>Antecedentes del activo</h2><div class="info-grid"><div class="info-column">'+
   group('Identificación',['tag','name','component','service','fluid'])+
   group('Ubicación técnica',['plant','area','system','circuit'])+'</div><div class="info-column">'+
   group('Diseño',['material','diameter_mm','nominal_mm','ca_mm','efficiency','temp_c','pressure_mpa','liquid_height_m','sg'])+
   group('Operación',['operating_temp_c','operating_pressure_mpa'])+'</div></div>'+
   '<div class="note"><p><strong>Diseño</strong> · '+esc(status.design.reference)+'</p>'+
   '<p><strong>Inspección en servicio</strong> · '+esc(status.reference)+'</p></div></section>';
}

const defaultCostBasis='Valoración ficticia en CLP de noviembre de 2026';
