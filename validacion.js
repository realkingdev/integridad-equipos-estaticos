function validationPanel(){
 const refs=[['Tubería · ASME B31.3 §304.1.2','P 1,5 MPa · De 114,3 mm · CA 1 mm',1.618975,call('_evaluate',template[0]).design.required_mm,'mm'],
 ['Recipiente · Certamen 1 / UG-27','200 psi · diámetro interior 48 in · E 0,85 · CA 1/16 in',0.461336726*25.4,call('_evaluate',template[1]).design.required_mm,'mm'],
 ['Tanque · API 650 §5.6.3.2','Prueba hidrostática · D 34 m · H 22 m · St 154 MPa',23.475455,call('_evaluate',template[2]).design.required_mm,'mm'],
 ['Factor de daño · API 581 §4.5.7','Integración independiente de tres estados · UT 6 mm · 0,20 mm/a · 5 años',52.13919,call('_risk',{}).df,'']];
 return '<details class="panel"><summary>Verificación de los cálculos de referencia</summary><p class="muted">Comparación sobre los casos originales, con tolerancia absoluta de 0,0001.</p><div class="scroll"><table><tr><th>Cálculo</th><th>Entradas</th><th>Esperado</th><th>Calculado</th><th>Resultado</th></tr>'+refs.map(([name,inputs,v,n,u])=>'<tr><td>'+name+'</td><td>'+inputs+'</td><td>'+fmt(v,5)+' '+u+'</td><td>'+fmt(n,5)+' '+u+'</td><td>'+badge(Math.abs(v-n)<.0001?'Verificado':'Revisar')+'</td></tr>').join('')+'</table></div></details>'
}
