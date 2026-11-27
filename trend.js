"use strict";

let activeTrend;

function drawTrend() {
  const canvas = $('trend');
  if (!canvas) {
    activeTrend = undefined;
    return;
  }
  if (activeTrend?.canvas !== canvas) {
    const [equipment, result] = current();
    activeTrend = {canvas, redraw: mountTrend(canvas, equipment.points[pointIndex], result.points[pointIndex])};
  }
  activeTrend.redraw();
}

function mountTrend(canvas, point, state) {
  const panel = canvas.closest('.thickness-panel'), reading = panel.querySelector('.trend-reading');
  const ctx = canvas.getContext('2d');
  const history = point.measurements.map(m => ({
    date: m.date, time: Date.parse(m.date), value: m.thickness * (m.unit === 'in' ? 25.4 : 1),
    epoch: m.epoch ?? 0, label: 'Medición', detail: m.technique
  })).sort((a,b) => a.time - b.time);
  const latest = history.at(-1);
  latest.label = 'Última lectura';
  let scenarios = state.wall_scenarios, showProjections = true, selected = latest;
  let plotted = [], destinations = [];

  function refreshDestinations() {
    destinations = showProjections && latest.value > state.minimum_mm ? wallProfiles.map(profile => {
      const model = scenarios[profile.key];
      const stops = [['alert', 'Alerta estimada', state.alert_mm], ['minimum', 'Mínimo estimado', state.minimum_mm]]
        .flatMap(([key, label, value]) => {
          const crossing = model[key];
          return crossing.kind === 'projected' ? [{
            date: crossing.date, time: Date.parse(crossing.date), value,
            label, detail: profile.label, color: profile.color
          }] : [];
        });
      return {...profile, stops};
    }) : [];
    if (selected.epoch === undefined) selected = latest;
  }

  function showReading() {
    reading.innerHTML = '<span>' + esc(selected.label) + '</span><strong class="mono">' + fmt(selected.value) +
      ' mm</strong><span>' + dateLabel(selected.date) + ' · ' + esc(selected.detail) + '</span>';
  }

  function redraw() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height || !ctx) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = '11px Inter, sans-serif';
    ctx.lineJoin = 'round';
    const left = 52, right = width - 22, top = 30, bottom = height - 31;
    const firstTime = history[0].time;
    const estimates = destinations.flatMap(series => series.stops);
    const lastTime = Math.max(latest.time, ...estimates.map(stop => stop.time));
    const values = history.reduce(([min,max], row) => [Math.min(min,row.value),Math.max(max,row.value)],
      [Math.min(state.minimum_mm,state.alert_mm),Math.max(state.minimum_mm,state.alert_mm)]);
    const pad = Math.max((values[1]-values[0]) * 0.11, 0.08);
    const low = Math.max(0, values[0] - pad), high = values[1] + pad;
    const x = time => firstTime === lastTime ? (left+right)/2 : left + 6 + (right-left-12) * ((time-firstTime)/(lastTime-firstTime));
    const y = value => bottom - (value-low)/(high-low)*(bottom-top);
    const ink = '#476171', measured = '#12736e', minimum = '#aa3933', alert = '#946313';

    function line(points, color, weight=1, dash=[]) {
      ctx.lineWidth = weight;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath();
      points.forEach(([px,py], index) => index ? ctx.lineTo(px,py) : ctx.moveTo(px,py));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    function bubble(entry, radius, filled) {
      ctx.beginPath();
      ctx.arc(x(entry.time),y(entry.value),radius,0,Math.PI*2);
      ctx.fillStyle = filled ? entry.color || measured : '#fff';
      ctx.strokeStyle = filled ? '#fff' : entry.color || measured;
      ctx.lineWidth = filled ? 1.3 : 1.8;
      ctx.fill();
      ctx.stroke();
    }
    if (lastTime > latest.time) {
      ctx.fillStyle = '#edf4fb';
      ctx.fillRect(x(latest.time), top, right-x(latest.time), bottom-top);
    }
    ctx.fillStyle = '#b5484211';
    ctx.fillRect(left,y(state.minimum_mm),right-left,bottom-y(state.minimum_mm));
    if (state.alert_mm > state.minimum_mm) {
      ctx.fillStyle = '#bc8a2614';
      ctx.fillRect(left,y(state.alert_mm),right-left,y(state.minimum_mm)-y(state.alert_mm));
    }
    ctx.textAlign = 'right';
    const precision = high-low < 0.5 ? 2 : 1;
    for (let row = 0; row <= 4; row++) {
      const value = low + row*(high-low)/4;
      line([[left,y(value)],[right,y(value)]], '#dbe6ee');
      ctx.fillStyle = ink;
      ctx.fillText(fmt(value,precision),left-7,y(value)+4, left-9);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Espesor (mm)', 7, 16);
    line([[left,top],[left,bottom],[right,bottom]], '#9fb3c1');
    line([[left,y(state.alert_mm)],[right,y(state.alert_mm)]], alert,1.4,[5,4]);
    line([[left,y(state.minimum_mm)],[right,y(state.minimum_mm)]], minimum,1.4,[5,4]);
    if (lastTime > latest.time) {
      line([[x(latest.time),top],[x(latest.time),bottom]], '#98acbd',1,[3,3]);
      if (right-x(latest.time) > 65) {
        ctx.textAlign = 'right';
        ctx.fillStyle = ink;
        ctx.fillText('Proyección',right,16);
      }
    }
    const span = lastTime-firstTime;
    const density = Math.max(2,Math.min(9,Math.floor((right-left)/93)+1));
    const ticks = span ? Array.from({length:density}, (_, index) => firstTime+span*index/(density-1)) : [firstTime];
    const useMonth = span/(365.25*86400000) < density*1.7;
    ctx.textAlign = 'center';
    for (const time of ticks) {
      const [year,month] = new Date(time).toISOString().split('-');
      line([[x(time),bottom],[x(time),bottom+4]], '#9fb3c1');
      ctx.fillStyle = ink;
      ctx.fillText(useMonth ? month+'/'+year : year,x(time),bottom+18);
    }
    for (const series of destinations) {
      if (!series.stops.length) continue;
      line([latest, ...series.stops].map(entry => [x(entry.time),y(entry.value)]),series.color,
        series.key === 'adopted' ? 2.8 : 2.1,series.dash);
      series.stops.forEach(stop => bubble(stop,stop === series.stops.at(-1) ? 4.4 : 3.2,false));
    }
    history.forEach((entry,index) => {
      const previous = history[index-1];
      if (previous?.epoch === entry.epoch) line([[x(previous.time),y(previous.value)],[x(entry.time),y(entry.value)]],measured,2.7);
    });
    history.forEach(entry => bubble(entry,entry === latest ? 5.3 : 4.1,true));
    bubble(selected,6.8,false);
    plotted = [...history, ...estimates].sort((a,b) => a.time-b.time).map(entry => ({entry,x:x(entry.time),y:y(entry.value)}));
  }

  function selectReading(entry) {
    if (entry === selected) return;
    selected = entry;
    showReading();
    redraw();
  }
  canvas.addEventListener('pointerup', event => {
    const frame = canvas.getBoundingClientRect();
    const x = event.clientX-frame.left, y = event.clientY-frame.top;
    let closest = null, distance = 24;
    for (const point of plotted) {
      const offset = Math.hypot(x-point.x,y-point.y);
      if (offset < distance) {
        closest = point.entry;
        distance = offset;
      }
    }
    if (closest) selectReading(closest);
  });
  canvas.addEventListener('keydown', event => {
    const index = plotted.findIndex(({entry}) => entry === selected);
    const keys = {ArrowLeft: index-1, ArrowRight: index+1, Home: 0, End: plotted.length-1};
    if (!Object.hasOwn(keys,event.key) || !plotted.length) return;
    event.preventDefault();
    selectReading(plotted[Math.max(0,Math.min(plotted.length-1,keys[event.key]))].entry);
  });
  panel.querySelectorAll('[data-trend-mode]').forEach(button => button.addEventListener('click', () => {
    showProjections = button.dataset.trendMode === 'all';
    panel.querySelectorAll('[data-trend-mode]').forEach(item => item.setAttribute('aria-pressed',String(item===button)));
    refreshDestinations();
    showReading();
    redraw();
  }));

  const lower = panel.querySelector('[data-wall-factor="lower"]'), higher = panel.querySelector('[data-wall-factor="higher"]');
  if (lower && higher) {
    const status = panel.querySelector('.wall-adjust-message');
    const table = panel.querySelector('[data-wall-rows]');
    function changeScenarios() {
      if (![lower,higher].every(input => Number.isFinite(input.valueAsNumber) && input.validity.valid)) {
        status.textContent = 'Ingresa una tasa moderada entre 0,01 y 100 %, y una acelerada de al menos 100 %.';
        return;
      }
      try {
        const payload = {date:state.date, current_mm:state.current_mm, minimum_mm:state.minimum_mm, alert_mm:state.alert_mm, rate:state.rate};
        scenarios = call('_wall_scenarios',{point:payload,lower:lower.valueAsNumber/100,higher:higher.valueAsNumber/100});
        status.textContent = '';
        table.innerHTML = wallScenarioRows(scenarios);
        refreshDestinations();
        showReading();
        redraw();
      } catch (error) {
        status.textContent = message(error);
      }
    }
    [lower,higher].forEach(input => input.addEventListener('input',changeScenarios));
    panel.querySelector('[data-wall-reset]').addEventListener('click',() => {
      lower.value = '75';
      higher.value = '125';
      changeScenarios();
    });
  }
  refreshDestinations();
  showReading();
  return redraw;
}
