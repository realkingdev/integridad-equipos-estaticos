function drawTrend() {
  const canvas = $('trend');
  if (!canvas) return;
  const [equipment, result] = current();
  const point = equipment.points[pointIndex];
  const state = result.points[pointIndex];
  const history = point.measurements.map(m => ({
    date:m.date, time:Date.parse(m.date), value:m.thickness * (m.unit === 'in' ? 25.4 : 1), epoch:m.epoch ?? 0
  })).sort((a,b) => a.time-b.time);
  const width = canvas.clientWidth, height = 238, ratio = Math.min(devicePixelRatio || 1, 2);
  if (!width) return;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.fillStyle = '#496675';
  if (!history.length) {
    ctx.fillText('El gráfico aparecerá al registrar una medición.', 10, 50);
    return;
  }

  const left = 46, right = width - 16, top = 18, bottom = height - 34;
  const latest = history.at(-1);
  const due = Date.parse(state.due);
  const projectTrend = state.rate > 0 && due > latest.time;
  const elapsed = projectTrend ? (due - latest.time) / (365.25 * 86400000) : 0;
  const estimate = latest.value - elapsed * state.rate;
  const values = [...history.map(row => row.value), state.minimum_mm, state.alert_mm, estimate];
  const max = Math.max(...values), min = Math.min(...values), pad = Math.max((max-min)*.12,0.15);
  const y1 = Math.max(0,min-pad), y2 = max+pad;
  const t1 = history[0].time, t2 = projectTrend ? due : latest.time;
  const x = time => t1===t2 ? (left+right)/2 : left+8+(time-t1)/(t2-t1)*(right-left-16);
  const y = thickness => bottom-(thickness-y1)/(y2-y1)*(bottom-top);
  function line(points, color, weight=1, dash=[]) {
    ctx.strokeStyle=color;
    ctx.lineWidth=weight;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(([px,py],i) => i ? ctx.lineTo(px,py) : ctx.moveTo(px,py));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.textAlign = 'right';
  for (let i=0;i<=4;i++) {
    const value=y1+(y2-y1)*(i/4);
    line([[left,y(value)],[right,y(value)]],'#dfe8ee');
    ctx.fillText(fmt(value,1),left-7,y(value)+4);
  }
  for (const [value,color] of [[state.minimum_mm,'#a54035'],[state.alert_mm,'#9f650f']]) {
    line([[left,y(value)],[right,y(value)]],color,1.4,[4,4]);
  }
  const dates = projectTrend ? [...history,{date:state.due,time:due}] : history;
  ctx.textAlign='center';
  const stride = Math.max(1, Math.ceil(dates.length / Math.max(2,Math.floor(width/117))));
  let lastX=-Infinity;
  dates.forEach((m,i)=>{
    const px=x(m.time), final=i===dates.length-1, lastPx=x(dates.at(-1).time);
    if (final || (i%stride===0 && px-lastX>55 && lastPx-px>55)) {
      ctx.fillText(m.date.slice(0,7).split('-').reverse().join('/'),px,bottom+20);
      lastX=px;
    }
  });
  history.forEach((m,i) => {
    const previous = history[i-1];
    if(previous?.epoch===m.epoch)line([[x(previous.time),y(previous.value)],[x(m.time),y(m.value)]],'#156b78',2.7);
  });
  if(projectTrend)line([[x(latest.time),y(latest.value)],[x(due),y(estimate)]],'#156b78',2,[6,5]);
  history.forEach(m => {
    ctx.fillStyle='#156b78';
    ctx.beginPath();
    ctx.arc(x(m.time),y(m.value),4,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle='#fff';
    ctx.lineWidth=1;
    ctx.stroke();
  });
}

