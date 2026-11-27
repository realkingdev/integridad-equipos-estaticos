function scheduleSummary(e,r) {
 const point=r.points.find(point=>point.id===r.governing);
 return '<section class="panel plan-banner"><div class="row"><h2>Plan del equipo</h2>'+badge(r.status)+'</div>'+
   '<div class="plan-fields"><div><small>Punto gobernante</small><strong class="mono">'+esc(point?.id||'—')+'</strong></div>'+
   '<div><small>Próxima medición</small><strong class="table-number">'+dateLabel(r.due)+'</strong></div>'+
   '<div><small>Criterio</small><strong>'+esc(point?.governing||'Revisar antecedentes pendientes')+'</strong></div></div>'+
   wallGoverning(e,r)+'</section>';
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

