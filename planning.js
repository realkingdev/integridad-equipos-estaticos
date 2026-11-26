function scheduleSummary(e,r){
 const p=r.points.find(p=>p.id===r.governing);
 return '<div class="panel row"><div><div class="eyebrow">PLAN DEL EQUIPO</div><strong>'+esc(r.governing)+' · '+dateLabel(r.due)+'</strong><p class="muted">'+esc(p?.governing||'Revisar antecedentes pendientes')+'</p></div>'+badge(r.status)+'</div>'
}
function designPointChooser(e,index) {
 const locations=e.points.map((p,i)=>[i,p.id+' · '+p.name]);
 return '<label class="design-location">Ubicación de evaluación <select id="designPoint">'+opts(locations,index)+'</select></label>';
}
function designComment(e,p,d){
 const target=e.family==='pipe'?d.required_mm/.875:d.required_mm;
 const compare=e.nominal_mm>=target?'El nominal registrado cubre el requisito mostrado.':'El nominal registrado queda por debajo del requisito mostrado.';
 return '<div class="note"><p>'+esc(p.id+' · '+p.name)+' · '+esc(compare)+'</p><p>Nominal registrado '+fmt(e.nominal_mm,3)+' mm · referencia de selección '+fmt(target,3)+' mm.</p>'+
 (e.family==='pipe'?'<p>El cálculo de diseño corresponde al tramo recto. Los accesorios del circuito requieren su propia verificación de diseño.</p>':'')+'</div>'
}

