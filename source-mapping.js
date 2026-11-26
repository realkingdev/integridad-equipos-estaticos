const sourceFields=[
  ['tag','TAG',['tag','equipo','codigo_activo','id_activo','asset','asset_tag']],
  ['tml','TML',['tml','point_id','punto','punto_medicion','punto_ut','location']],
  ['date','Fecha',['fecha','date','fecha_medicion','measurement_date']],
  ['thickness','Espesor',['espesor','thickness','espesor_mm','espesor_in','reading']],
  ['unit','Unidad',['unidad','unit','unidad_espesor']],
  ['technique','Técnica',['tecnica','technique','metodo']],
  ['notes','Observaciones',['observaciones','notes','notas','comentario']]
];
const requiredSourceFields=sourceFields.slice(0,4);
const profileKey='estrato-source-profiles-v1';
let sourcePayload, sourceMapping, sourceTable, sourceDb, sourceTables=[], sourceProfile='';

function sourceProfiles() {
  try {
    const profiles=JSON.parse(localStorage.getItem(profileKey)||'[]');
    return Array.isArray(profiles)?profiles.filter(p=>p&&validText(p.name)&&p.columns&&typeof p.columns==='object'):[];
  } catch {return []}
}

function discoverColumns(rows) {
  const columns=new Set();
  for (const row of rows) {
    if (!row || typeof row!=='object' || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) {
      columns.add(key);
      if (columns.size>200) throw Error('El origen supera 200 columnas. Reduce la selección de la fuente.');
    }
  }
  return [...columns];
}

function inferredSourceMapping(columns) {
  const normalized=new Map(columns.map(c=>[labelKey(c).replace(/[\s-]+/g,'_'),c]));
  const matched=Object.fromEntries(sourceFields.map(([key,,names])=>[key,names.map(n=>normalized.get(n)).find(Boolean)||'']));
  return {...matched,dateFormat:'iso',defaultUnit:labelKey(matched.thickness).endsWith('_in')?'in':'mm'};
}

function matchesSourceProfile(profile,columns) {
  return !!profile&&requiredSourceFields.every(([key])=>columns.includes(profile.columns[key]));
}

function applySourceProfile(profile,columns) {
  const mapping=inferredSourceMapping(columns);
  if (!matchesSourceProfile(profile,columns)) return mapping;
  for (const [key] of sourceFields) {
    const old=profile.columns[key];
    if (old===''&&!requiredSourceFields.some(([required])=>required===key)) mapping[key]='';
    else if (typeof old==='string'&&columns.includes(old)) mapping[key]=old;
  }
  return {...mapping,dateFormat:profile.dateFormat==='dmy'?'dmy':'iso',defaultUnit:profile.defaultUnit==='in'?'in':'mm'};
}

function refreshSourcePreview() {
  sourcePreview=null;
  sourceError='';
  if (!sourcePayload) return;
  const selected=requiredSourceFields.map(([key])=>sourceMapping?.[key]);
  if (!sourcePayload.backup && selected.some(s=>!s)) return;
  if (!sourcePayload.backup && new Set(sourceFields.map(([key])=>sourceMapping[key]).filter(Boolean)).size!==
      sourceFields.filter(([key])=>Boolean(sourceMapping[key])).length) {
    sourceError='Asigna cada columna del origen a un solo campo.';
    return;
  }
  try {sourcePreview=importPlan(sourcePayload,sourcePayload.label,sourceMapping)}
  catch (err) {sourceError=message(err)}
}

function setSourcePayload(payload,label) {
  if (payload.rows?.length>sourceRowLimit) throw Error('El origen supera 5.000 filas.');
  sourcePayload={...payload,label,columns:payload.rows?discoverColumns(payload.rows):[]};
  const profiles=sourceProfiles();
  const compatible=profiles.filter(profile=>matchesSourceProfile(profile,sourcePayload.columns));
  const selected=compatible.find(p=>p.name===sourceProfile)||(compatible.length===1?compatible[0]:null);
  sourceProfile=selected?.name||'';
  sourceMapping=applySourceProfile(selected,sourcePayload.columns);
  refreshSourcePreview();
}

function resolvedSourceRecord(record,mapping) {
  if (!record || typeof record!=='object' || Array.isArray(record)) return null;
  const read=key=>{
    const column=mapping[key];
    const value=column&&Object.hasOwn(record,column)?record[column]:'';
    return typeof value==='string'||typeof value==='number'?String(value).trim():'';
  };
  const rawDate=read('date');
  const local=rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const date=mapping.dateFormat==='dmy' ?
    (local?local[3]+'-'+local[2].padStart(2,'0')+'-'+local[1].padStart(2,'0'):'') : rawDate;
  const val=read('thickness');
  const rawUnit=read('unit').toLowerCase()||mapping.defaultUnit;
  const unit=({pulg:'in',pulgadas:'in','"':'in',milimetros:'mm','milímetros':'mm'})[rawUnit]||rawUnit;
  return {tag:read('tag'),tml:read('tml'),date,raw:val,thickness:localizedNumber(val),
    unit,technique:read('technique')||'UT',notes:read('notes')};
}

function sourceMappingPanel() {
  if (!sourcePayload||sourcePayload.backup) return '';
  const {columns,label,rows}=sourcePayload;
  const profiles=sourceProfiles();
  const matched=requiredSourceFields.filter(([key])=>sourceMapping[key]).length;
  const mapping=sourceFields.map(([key,title])=>select('map-'+key,title+
    (requiredSourceFields.some(([required])=>required===key)?' · obligatorio':''),
    [['','Seleccionar columna'],...columns.map(c=>[c,c])],sourceMapping[key])).join('');
  const sample=rows.find(r=>r&&typeof r==='object'&&!Array.isArray(r));
  return '<section class="panel source-mapping"><div class="row"><div><div class="section-kicker">2 · COLUMNAS</div>'+
    '<h2>Vincular columnas</h2><p class="muted">'+esc(label)+' · '+rows.length+' filas · '+columns.length+' columnas</p></div>'+
    '<span class="pill '+(matched===4?'ok':'warn')+'">'+matched+' de 4 campos obligatorios</span></div>'+
    '<div class="profile-bar">'+select('source-profile','Configuración guardada',
    [['','Detectar automáticamente'],...profiles.map(p=>[p.name,p.name])],sourceProfile)+
    '<button type="button" data-profile-save '+(matched<4?'disabled':'')+'>Guardar configuración</button></div>'+
    '<div class="mapping-fields">'+mapping+
    select('map-dateFormat','Formato de fecha',[['iso','AAAA-MM-DD'],['dmy','Día / Mes / Año']],sourceMapping.dateFormat)+
    select('map-defaultUnit','Unidad si la fila viene vacía',[['mm','Milímetros (mm)'],['in','Pulgadas (in)']],sourceMapping.defaultUnit)+'</div>'+
    (sample?'<p class="note mapping-sample"><b>Primera fila</b> '+requiredSourceFields.map(([key,title])=>esc(title)+
      ' '+esc(String(sample[sourceMapping[key]]??'—').slice(0,70))).join(' · ')+'</p>':'<p class="note">La fuente no contiene filas de mediciones.</p>')+
    '<p class="muted">Guarda la selección para reutilizarla con archivos o consultas que tengan estos encabezados.</p></section>';
}

function saveSourceProfile() {
  if (!sourceMapping||!sourcePayload||requiredSourceFields.some(([key])=>!sourceMapping[key])) return;
  dialog('Guardar configuración de columnas',
    field('profileName','Nombre de la configuración',sourceProfile,'text','required maxlength="70"')+
    '<small class="wide">Se guarda el vínculo entre campos y columnas, el formato de fecha y la unidad predeterminada.</small>',
    form=>{
      const name=form.get('profileName').trim();
      if (!name) throw Error('Ingresa un nombre para esta configuración.');
      const profiles=sourceProfiles();
      const existing=profiles.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
      const profile={name,columns:Object.fromEntries(sourceFields.map(([key])=>[key,sourceMapping[key]])),
        dateFormat:sourceMapping.dateFormat,defaultUnit:sourceMapping.defaultUnit};
      if (existing!==-1) profiles[existing]=profile;
      else profiles.push(profile);
      localStorage.setItem(profileKey,JSON.stringify(profiles));
      sourceProfile=name;
      render();
      notify('Configuración de columnas guardada');
    });
}

async function readSqlTable(name) {
  const path='/tmp/estrato-tabular.sqlite';
  py.FS.writeFile(path,sourceDb);
  try {return call('_read_sqlite_table',{path,table:name})}
  finally {py.FS.unlink(path)}
}

async function prepareSqlSource(file) {
  await py.loadPackage('sqlite3');
  sourceDb=new Uint8Array(await file.arrayBuffer());
  const path='/tmp/estrato-tabular.sqlite';
  py.FS.writeFile(path,sourceDb);
  try {sourceTables=call('_read_sqlite_catalog',path)}
  finally {py.FS.unlink(path)}
  if (!sourceTables.length) throw Error('La base SQLite no contiene tablas ordinarias.');
  const selected=sourceTables.includes('mediciones')?'mediciones':sourceTables[0];
  sourceTable={file:file.name,name:selected};
  return {rows:await readSqlTable(selected)};
}

function sqliteTablePanel() {
  if (!sourceTable) return '';
  return '<div class="panel row"><div><div class="section-kicker">TABLAS EN SQLITE</div><h2>'+esc(sourceTable.file)+'</h2></div>'+
    select('sqlite-table','Tabla de origen',sourceTables.map(s=>[s,s]),sourceTable.name)+'</div>';
}

document.addEventListener('change',async event=>{
  const input=event.target;
  if (route()[0]!=='fuentes') return;
  if (input.name==='sqlite-table' && sourceTable&&!sourceReading) {
    sourceReading=true;
    sourceTable.name=input.value;
    try {setSourcePayload({rows:await readSqlTable(input.value)},sourceTable.file)}
    catch (err) {sourcePreview=null;sourcePayload=null;sourceError=message(err)}
    finally {sourceReading=false;render()}
  } else if (sourceMapping&&input.name==='source-profile') {
    const selected=sourceProfiles().find(p=>p.name===input.value);
    sourceProfile=matchesSourceProfile(selected,sourcePayload.columns)?selected.name:'';
    if (selected&&!sourceProfile) notify('Los encabezados no coinciden con esa configuración.');
    sourceMapping=applySourceProfile(selected,sourcePayload.columns);
    refreshSourcePreview();
    render();
    document.querySelector('[name="source-profile"]')?.focus();
  } else if (sourceMapping&&input.name?.startsWith('map-')) {
    sourceMapping[input.name.slice(4)]=input.value;
    refreshSourcePreview();
    render();
    document.getElementsByName(input.name)[0]?.focus();
  }
});
document.addEventListener('click',event=>{
  if (event.target.closest('[data-profile-save]')) saveSourceProfile();
});

