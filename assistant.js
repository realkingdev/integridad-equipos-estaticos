const chatMessages=[];
let chatDraft='', chatFocus;
const examples=[
  '¿Qué punto debería revisar primero?',
  '¿Qué puntos están bajo el mínimo?',
  '¿Cuál es el riesgo económico RBI?',
  '¿Qué inspecciones de tubería vencen en 90 días?',
  '¿Qué pasa si el codo L-101 mide 4,4 mm?',
  '¿Dónde conecto una base de datos?'
];
const chatNormalize = text=>labelKey(text).replace(/[^a-z0-9]+/g,' ').trim();
const containsPhrase = (haystack,needle)=>(' '+haystack+' ').includes(' '+needle+' ');
const chatLink=(label,href)=>({label,href});
const pointHref=(e,p)=>link(e)+'/'+encodeURIComponent(p.id);
const rowLink=({e,p})=>chatLink(e.tag+' · '+p.id+' · '+p.name,pointHref(e,p));
const chatReading=(n,unit,d=2)=>Number.isFinite(n)?fmt(n,d)+' '+unit:'sin cálculo';
const chatDate=()=>dateLabel(assessmentDate||today());

function renderAssistant() {
  const turns=chatMessages.map((reply,index)=>{
    const {role,body,links}=reply;
    return (
    '<article class="chat-message '+role+'"><span class="chat-avatar" aria-hidden="true">'+(role==='user'?'T':'E')+'</span>'+
    '<div class="chat-bubble"><small>'+(role==='user'?'Tú':'Estrato')+'</small><p>'+esc(body)+'</p>'+
    (links?.length?'<div class="chat-links">'+links.map(({label,href})=>'<a href="'+esc(href)+'">'+esc(label)+' ↗</a>').join('')+'</div>':'')+guideControls(reply,index)+'</div></article>');
  }).join('');
  return hero('CONSULTA DEL CASO','Asistente de Estrato','Encuentra datos de equipos, lecturas, próximas inspecciones y resultados RBI.')+
    '<section class="panel chat-panel"><div class="row chat-header"><div><h2>Consulta tus registros</h2>'+
    '<p class="muted">Caso guardado · Evaluado al '+chatDate()+'</p></div>'+
    '<button type="button" data-chat-clear '+(chatMessages.length?'':'disabled')+'>Limpiar conversación</button></div>'+
    guideSelector()+'<div class="guide-tasks" aria-label="Consultas rápidas">'+
    [['measure','Registrar una medición'],['due','Explicar la inspección'],['zero','Marcar el cero en 3D'],['shutdown','Simular una parada']].map(([key,label])=>
      '<button type="button" data-chat-question="'+esc(guideTopics[key].question)+'">'+label+'</button>').join('')+'</div>'+
    '<div class="chat-stream" id="chat-stream" tabindex="0" aria-label="Conversación" role="log">'+
    (turns||'<div class="chat-empty"><h3>¿Qué necesitas encontrar?</h3><div class="chat-examples">'+
      examples.map(q=>'<button type="button" data-chat-question="'+esc(q)+'">'+esc(q)+'</button>').join('')+'</div></div>')+'</div>'+
    '<form id="chat-form" class="chat-form"><label class="sr-only" for="chat-question">Pregunta sobre el caso</label>'+
    '<input id="chat-question" name="question" value="'+esc(chatDraft)+'" maxlength="350" placeholder="Ej. ¿Cuánto espesor tiene TML-02 de L-101?" required>'+
    '<button class="primary" type="submit">Enviar ↑</button></form>'+
    '<small class="muted">Respuestas calculadas en este navegador con los datos del caso.</small></section>'+assistantFaq();
}

function chatPointAnswer(row, query) {
  const {e,p,r}=row;
  const lines=[];
  if (/inspeccion|vence|fecha|agenda|plazo|cuando/.test(query)) {
    lines.push(r.due ? 'Próxima medición '+dateLabel(r.due)+'. '+r.governing+'.' : 'La próxima medición queda por determinar. '+r.governing+'.');
    if(r.overdue) lines.push('Fecha vencida al '+chatDate()+'.');
  }
  if (/corrosion|tasa/.test(query)) lines.push('Tasa adoptada '+chatReading(r.rate,'mm/año',3)+'. Largo plazo '+chatReading(r.long_rate,'mm/año',3)+'. Corto plazo '+chatReading(r.short_rate,'mm/año',3)+'.');
  if (/vida|remanente/.test(query)) lines.push('Vida remanente '+chatReading(r.life_years,'años')+'.');
  if (/espesor|umbral|minimo|alerta|lectura|medicion/.test(query) || !lines.length) {
    lines.push('Condición '+r.status+'. Espesor medido '+chatReading(r.current_mm,'mm')+
      (r.date?' en la campaña del '+dateLabel(r.date):'')+'. Mínimo efectivo '+chatReading(r.minimum_mm,'mm')+' y alerta '+chatReading(r.alert_mm,'mm')+'.');
  }
  if (/fuente|origen|importad/.test(query)) {
    const latest=p.measurements.find(m=>m.date===r.date);
    lines.push(latest?.source?'Fuente de la última lectura: '+latest.source+'.':'La última lectura carece de origen de importación registrado.');
  }
  if (/historial|campana|cuantas/.test(query)) lines.push('El punto tiene '+p.measurements.length+' mediciones registradas.');
  return {body:e.tag+' · '+p.id+' · '+p.name+'\n\n'+lines.join('\n'),links:[rowLink(row)]};
}

function chatList(rows, headline, links=true) {
  if (!rows.length) return {body:headline+'\nNo encontré registros que coincidan.',links:[chatLink('Abrir la agenda','#agenda')]};
  return {body:headline+'\n\n'+rows.slice(0,6).map(({e,p,r})=>e.tag+' · '+p.id+' · '+p.name+' · '+r.status+
      (r.due?' · '+dateLabel(r.due):'')).join('\n')+(rows.length>6?'\nY '+(rows.length-6)+' puntos más.':''),
    links:links?rows.slice(0,4).map(rowLink):[chatLink('Abrir la agenda','#agenda')]};
}

function chatHelp(query) {
  if (/base de datos|sqlite|csv|api rest|conect|importa|fuente de datos/.test(query)) return {
    body:'En Fuentes de datos puedes consultar un endpoint REST de lectura o seleccionar un archivo SQLite, CSV o JSON. La vista previa identifica las filas nuevas, las coincidencias por TAG/TML y las fechas en conflicto.',
    links:[chatLink('Abrir Fuentes de datos','#fuentes')]
  };
  if (/guardar|respaldo|exportar/.test(query)) return {
    body:'Desde Registro de equipos puedes exportar el caso JSON con esquemas, documentos, mediciones y correcciones. En Inspecciones puedes exportar a CSV las filas visibles.',
    links:[chatLink('Registro de equipos','#equipos'),chatLink('Inspecciones','#agenda')]
  };
  if (/como.*(?:cambia|simul|ajusta|prueba|edita)/.test(query)) return {
    body:'En Análisis RBI puedes cambiar directamente los parámetros. Para un equipo, abre Cálculo de diseño o Simular lectura. El panel actualiza los resultados mientras escribes. Usa Guardar o Aplicar para conservar el cambio.',
    links:[chatLink('Análisis RBI','#riesgo'),chatLink('Registro de equipos','#equipos')]
  };
  if (/que es (?:un |una )?cml|que es (?:un |una )?tml|diferencia.*cml/.test(query)) return {
    body:'CML identifica una ubicación de monitoreo y TML identifica el punto físico donde se repite la medición de espesor. En cada equipo puedes seleccionar los puntos sobre su esquema.',
    links:[chatLink('Ver equipos y esquemas','#equipos')]
  };
  if (/como se calcula.*vida|formula.*vida/.test(query)) return {
    body:'Estrato estima la vida remanente dividiendo la diferencia entre el espesor actual y el mínimo efectivo por la tasa de corrosión adoptada, en mm/año. La proyección usa lecturas comparables y una tasa positiva.',
    links:[chatLink('Consulta el modelo de un equipo','#equipos')]
  };
  if (/que es rbi|que significa rbi/.test(query)) return {
    body:'RBI significa inspección basada en riesgo. El caso académico de Estrato evalúa adelgazamiento generalizado y multiplica la frecuencia anual de falla por la consecuencia de cada evento, en área y en costo.',
    links:[chatLink('Abrir el análisis RBI','#riesgo')]
  };
}

function answerCase(question) {
  const q=chatNormalize(question);
  const topic=guideIntent(q);
  const help=!topic && chatHelp(q);
  if (help) return help;
  const all=allRows();
  const byAsset=project.equipment.filter(e=>containsPhrase(q,chatNormalize(e.tag))||containsPhrase(q,chatNormalize(e.tag).replaceAll(' ',''))||
    (e.name&&containsPhrase(q,chatNormalize(e.name))));
  const assets=byAsset.length?byAsset:project.equipment.filter(e=>
    ({pipe:/tuberia|caneria|circuito/,tank:/tanque|estanque|virola/,vessel:/recipiente|separador/})[e.family].test(q));
  let rows=assets.length?all.filter(row=>assets.includes(row.e)):all;
  const scope=currentGuideRow(all);
  if (/\b(?:l|v|tk)\s*\d+\b/.test(q) && !byAsset.length) {
    return {body:'Ese TAG no figura en el registro activo.',links:[chatLink('Ver equipos','#equipos')]};
  }
  const matchTml=q.match(/\btml\s*0*(\d+)\b/);
  let namedRows=rows.filter(({p})=>containsPhrase(q,chatNormalize(p.id))||
    (matchTml && Number(chatNormalize(p.id).match(/\btml\s*0*(\d+)\b/)?.[1])===Number(matchTml[1]))||
    (p.name && containsPhrase(q,chatNormalize(p.name)))||
    (/codo/.test(q)&&/codo/i.test(p.name)));
  if(scope&&!assets.length&&!matchTml&&!namedRows.length) { rows=[scope]; namedRows=rows; }
  if(scope&&!assets.length&&namedRows.some(row=>row.e===scope.e&&row.p===scope.p)) namedRows=[scope];
  if (namedRows.length) rows=namedRows;
  else if (matchTml || /\b(?:[a-z]{1,4}\s)\d{2,}\b/.test(q)&&/\b(?:l|v|tk|tag)\s+\d+\b/.test(q)&&!byAsset.length) {
    return {body:'No encontré ese TAG o TML en el caso activo. Revisa el identificador en el registro de equipos.',
      links:[chatLink('Buscar el equipo','#equipos')]};
  }

  if (topic) return rows.length===1?guideAnswer(topic,rows[0],question):guideChoose(topic,rows,question);
  if (/prioridad|mas urgente|primero|mas critico/.test(q)&&!/riesgo|rbi/.test(q)) {
    const ranked=rankedWallRows(rows).slice(0,3);
    return {body:'Prioridad por espesor al '+chatDate()+'\n\n'+ranked.map(({e,p,action})=>
      e.tag+' · '+p.id+' · '+action.label+'\n'+action.advice).join('\n\n'),
      links:[...ranked.map(rowLink),chatLink('Ver plan de intervención','#agenda')]};
  }
  if (/rbi|riesgo economico|riesgo de area|factor de dano|probabilidad de falla|frecuencia de falla/.test(q)) {
    const result=call('_risk',rbiValues());
    return {body:'Escenario RBI guardado\n\nPrioridad '+result.priority+
      '. Riesgo económico '+fmt(result.cost_risk,0)+' CLP/año. Riesgo de área '+fmt(result.area_risk,4)+
      ' m²/año. Factor de daño '+fmt(result.df,4)+' y frecuencia '+fmt(result.frequency,7)+' año⁻¹.',
      links:[chatLink('Abrir el escenario RBI','#riesgo')]};
  }

  if (/document|informe|pdf|ficha|plano/.test(q)) {
    const pool=assets.length?assets:project.equipment;
    const documents=pool.flatMap(e=>(e.documents||[]).map(doc=>({e,doc})));
    const matching=documents.filter(({doc})=>containsPhrase(q,chatNormalize(doc.name.replace(/\.pdf$/i,''))));
    const found=(matching.length?matching:documents).slice(0,6);
    return {body:found.length?'Documentos asociados\n\n'+found.map(({e,doc})=>e.tag+' · '+doc.name).join('\n'):
      'No encontré documentos PDF asociados a esa consulta. Puedes revisar la ficha técnica del equipo.',
      links:found.length?found.map(({e})=>chatLink('Documentos de '+e.tag,link(e)+'/~/documentos')):
        (assets.length?assets.map(e=>chatLink('Ficha de '+e.tag,link(e)+'/~/ficha')):[chatLink('Registro de equipos','#equipos')])};
  }

  if (/(?:diseno|nominal|requerido|admisible|b31|ug 27|api 650)/.test(q) && (namedRows.length===1||assets.length===1)) {
    const e=namedRows[0]?.e||assets[0];
    const p=namedRows[0]?.p||e.points[0];
    const d=namedRows[0]?.r.design||analysis[project.equipment.indexOf(e)].points[0].design;
    return {body:e.tag+' · '+p.id+'\n\nEspesor nominal '+fmt(e.nominal_mm,3)+' mm. Requerido '+fmt(d.required_mm,3)+
      ' mm. Esfuerzo admisible '+fmt(d.allowable_mpa,2)+' MPa.\n'+d.reference,
      links:[chatLink('Abrir cálculo de diseño',pointHref(e,p)+'/diseno')]};
  }

  const action=simulationAnswer(question,namedRows,assets)||agendaAnswer(question,rows,assets);
  if (action) return action;
  if (namedRows.length===1) return chatPointAnswer(namedRows[0],q);
  if (matchTml && namedRows.length>1) return chatList(rows,'Ese TML aparece en varios equipos. Selecciona el TAG que quieres consultar.');
  if (/cuant[oa]s|cantidad|total|numero de/.test(q)) {
    const count = /mediciones|lecturas/.test(q)?rows.reduce((n,row)=>n+row.p.measurements.length,0):/puntos|tml/.test(q)?rows.length:(assets.length||project.equipment.length);
    const kind=/mediciones|lecturas/.test(q)?'mediciones':/puntos|tml/.test(q)?'puntos de monitoreo':'equipos';
    return {body:'Encontré '+count+' '+kind+' en '+(assets.length===1?assets[0].tag:'la selección del caso activo')+'.',
      links:assets.length===1?[chatLink('Abrir '+assets[0].tag,link(assets[0]))]:[chatLink('Abrir el registro','#equipos')]};
  }

  const condition = /bajo.*minimo/.test(q)?'Bajo mínimo':/vencid|atrasad/.test(q)?'Inspección vencida':
    /insuficiente|sin datos/.test(q)?'Información insuficiente':/alerta/.test(q)?'Alerta':/normal/.test(q)?'Normal':null;
  if (condition) return chatList(rows.filter(({r})=>matchesCondition(r,condition)),'Puntos · '+condition+' · Evaluación al '+chatDate());
  const bound=question.match(/(?:menor|menos|inferior|por debajo|bajo|mayor|m[aá]s|superior|por encima|sobre)\s*(?:(?:a|de|que|del)\s+)?(\d+(?:[.,]\d+)?)/i);
  if (bound) {
    const metricName=/vida|remanente/.test(q)?'life_years':/tasa|corrosion/.test(q)?'rate':/espesor|medicion/.test(q)?'current_mm':null;
    if (metricName) {
      const target=localizedNumber(bound[1]);
      const below=/menor|menos|inferior|debajo|bajo/i.test(bound[0]);
      const match=rows.filter(({r})=>Number.isFinite(r[metricName]) && (below?r[metricName]<target:r[metricName]>target));
      const [label,unit,digits]={life_years:['Vida remanente','años',2],rate:['Tasa de corrosión','mm/año',3],
        current_mm:['Espesor medido','mm',2]}[metricName];
      const title=label+' '+(below?'por debajo de ':'por encima de ')+chatReading(target,unit,digits);
      return match.length?{body:title+'\n\n'+match.slice(0,6).map(row=>row.e.tag+' · '+row.p.id+' · '+chatReading(row.r[metricName],unit,digits)).join('\n')+
          (match.length>6?'\nY '+(match.length-6)+' puntos más.':''),
        links:match.slice(0,4).map(rowLink)}:chatList([],title);
    }
  }
  if (/mayor|menor|mas |menos |peor|rapida/.test(q)) {
    const field=/vida|remanente/.test(q)?'life_years':/tasa|corrosion/.test(q)?'rate':/espesor/.test(q)?'current_mm':null;
    if (field) {
      const sorted=rows.filter(({r})=>Number.isFinite(r[field])).sort((a,b)=>a.r[field]-b.r[field]);
      const lowest=/menor|menos|peor/.test(q);
      const found=lowest?sorted[0]:sorted.at(-1);
      return found?chatPointAnswer(found,q):{body:'No encontré valores calculables para esa comparación.',links:[chatLink('Revisar equipos','#equipos')]};
    }
  }
  if (/inspeccion|agenda|fecha|cuando|proxim/.test(q)) {
    return chatList(rows.filter(({r})=>r.due),assets.length===1?'Fechas de inspección · '+assets[0].tag:'Fechas programadas de medición');
  }
  if (assets.length||namedRows.length||/puntos|equipo|lecturas|espesores/.test(q)) return chatList(rows,assets.length===1?'Puntos de '+assets[0].tag:'Equipos y puntos encontrados');
  return {body:'No encontré un registro que responda esa consulta. Puedes usar un TAG, el nombre de un equipo o un TML. También puedes preguntar por espesores, fechas, alertas, vida remanente, RBI y documentos.',
    links:[chatLink('Buscar en el registro','#equipos')]};
}

function askChat(question) {
  const clean=question.trim();
  if (!clean) return;
  const q=chatNormalize(clean);
  const followUp=/\b(?:su|ese punto|esa lectura|ese mismo)\b|^y (?:cuando|cuanto|por que|la tasa|la vida|su |el espesor|la fecha|si (?:mide|midiera))/.test(q);
  const anotherPoint=/\b(?:tml|cml|codo|virola|tanque|recipiente|tuberia|separador|circuito)\b/.test(q) ||
    project.equipment.some(e=>containsPhrase(q,chatNormalize(e.tag))||containsPhrase(q,chatNormalize(e.tag).replaceAll(' ','')));
  const contextual=chatFocus && followUp && !anotherPoint && !currentGuideRow(allRows());
  const reply=answerCase(contextual?clean+' '+chatFocus:clean);
  appendChat(clean,reply);
}
function appendChat(clean,reply) {
  const location=reply.links?.find(l=>l.href.startsWith('#equipo/'))?.href.split('/');
  chatFocus=!reply.choices&&reply.links?.filter(l=>l.href.startsWith('#equipo/')).length===1&&location?.[0]==='#equipo'&&location[2]&&location[2]!=='~'?
    decodeURIComponent(location[1])+' '+decodeURIComponent(location[2]):null;
  chatMessages.push({role:'user',body:clean},{role:'assistant',...reply});
  if(chatMessages.length>80) chatMessages.splice(0,2);
  chatDraft='';
  render();
  $('chat-stream').scrollTop=$('chat-stream').scrollHeight;
  $('chat-question').focus({preventScroll:true});
}

document.addEventListener('submit',event=>{
  if (event.target.id!=='chat-form') return;
  event.preventDefault();
  askChat(event.target.elements.question.value);
});
document.addEventListener('input',event=>{if(event.target.id==='chat-question')chatDraft=event.target.value});
document.addEventListener('click',event=>{
  const example=event.target.closest('[data-chat-question]');
  if (example) {
    const fromFaq=Boolean(example.closest('.guide-faq'));
    askChat(example.dataset.chatQuestion);
    if(fromFaq) $('chat-form').scrollIntoView({block:'nearest'});
    return;
  }
  if (!event.target.closest('[data-chat-clear]')) return;
  chatMessages.length=0;
  chatFocus=null;
  chatDraft='';
  render();
  $('chat-question').focus({preventScroll:true});
});

