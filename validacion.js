let independentResults;

function validationPanel() {
  if (!independentResults) independentResults = JSON.parse(py.runPython('json.dumps(reference_cases())'));
  const cases = [
    {
      id: 'pipe', title: 'Tubería · tramo recto', unit: 'mm',
      source: 'ASME B31.3 (2018), §304.1.2, ec. (3a), tablas A-1 y 304.1.1.',
      inputs: 'ASTM A106 Gr B a 80 °C. Presión de diseño 1,5 MPa, diámetro exterior 114,3 mm, esfuerzo admisible 20.000 psi, E = W = 1, Y = 0,4 y sobreespesor de corrosión 1 mm.',
      steps: [
        'Convertir a unidades US. P = 1.500.000 / 6.894,757293168 psi y De = 4,5 in.',
        'Pared por presión en pulgadas = P × 4,5 / [2 × (20.000 + 0,4 × P)]. Multiplicar por 25,4 y sumar 1 mm. El resultado es la pared requerida antes de la tolerancia de compra.'
      ]
    },
    {
      id: 'vessel', title: 'Recipiente · manto cilíndrico', unit: 'mm',
      source: 'ASME VIII-1 (2019), UG-27(c)(1) y (2), UW-12. ASME II-D (2019), tabla 1A.',
      inputs: 'SA-285 Gr B a 148,89 °C. Presión diferencial 200 psi, radio interior corroído 24 in, esfuerzo admisible 14.300 psi, eficiencia de junta 0,85 en ambas direcciones y sobreespesor 1/16 in.',
      steps: [
        'Por esfuerzo circunferencial, t₁ = 200 × 24 / (14.300 × 0,85 − 0,6 × 200) in.',
        'Por esfuerzo longitudinal, t₂ = 200 × 24 / (2 × 14.300 × 0,85 + 0,4 × 200) in.',
        'Gobierna t₁. Pared requerida en mm = [máx(t₁, t₂) + 1/16] × 25,4.'
      ]
    },
    {
      id: 'tank', title: 'Tanque · primera virola', unit: 'mm',
      source: 'API 650 (2013), §5.6.1.1 y §5.6.3.2, tabla 5.2a. Método de un pie.',
      inputs: 'ASTM A283M Gr C. Diámetro 34 m, altura de diseño y prueba 22 m, gravedad específica 0,8, Sd = 137 MPa, St = 154 MPa, sobreespesor 1 mm y mínimo de montaje 6 mm.',
      steps: [
        'Con producto, td = 4,9 × 34 × (22 − 0,3) × 0,8 / 137 + 1 mm.',
        'Con agua de prueba, tt = 4,9 × 34 × (22 − 0,3) / 154 mm.',
        'Comparar td, tt y 6 mm. Gobierna la prueba hidrostática.'
      ]
    },
    {
      id: 'rbi', title: 'RBI · factor de daño por adelgazamiento', unit: '',
      source: 'API RP 581, 3.ª edición con adendas 2019–2020, parte 2, §4.5.7. Modelo simplificado de un tramo recto.',
      inputs: 'Espesor de referencia 6 mm, mínimo 3 mm, tasa 0,20 mm/año, horizonte 5 años y una inspección de efectividad C. Límite elástico 240 MPa, resistencia a tracción 415 MPa, admisible 138 MPa y E = 1.',
      steps: [
        'Art = 0,20 × 5 / 6 = 1/6. FS = 1,1 × (240 + 415) / 2 = 360,25 MPa. SR = 138 × 3 / (360,25 × 6).',
        'Multiplicar las probabilidades iniciales (0,7 / 0,2 / 0,1) por las verosimilitudes de la inspección (0,5 / 0,3 / 0,2) y normalizar. Los pesos son 35/43, 6/43 y 2/43.',
        'Para cada pérdida L de 1/6, 1/3 y 2/3, calcular β = (1 − L − SR) / √[(0,20L)² + (0,20 × (1 − L))² + (0,05SR)²].',
        'Integrar la densidad normal desde cada β hasta 12 con la regla de Simpson (1.000 subintervalos). Multiplicar las tres colas por sus pesos, sumar y dividir por 0,000156. Se aplican ajustes unitarios y un piso de 0,1. El factor es adimensional.'
      ]
    }
  ];
  const tolerance = 0.0001;
  const rows = cases.map(c => {
    const original = template.find(e => e.family === c.id);
    const actual = c.id === 'rbi' ? call('_risk', {}).df : call('_evaluate', original).design.required_mm;
    const expected = independentResults[c.id];
    const delta = Math.abs(actual - expected);
    const difference = delta === 0 ? '0' : delta < 1e-6 ? '< 0,000001' : fmt(delta, 6);
    return '<tr><th scope="row">'+esc(c.title)+'</th><td>'+evidenceValue(expected,c.unit,6)+'</td><td>'+
      evidenceValue(actual,c.unit,6)+'</td><td>'+esc(difference)+'</td><td>'+
      badge(delta<=tolerance?'Verificado':'Revisar')+'</td></tr>';
  }).join('');
  const methods = cases.map(c =>
    '<details class="evidence"><summary>'+esc(c.title)+'</summary><p>'+esc(c.inputs)+'</p><ol>'+
    c.steps.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol><p class="evidence-reference">'+esc(c.source)+'</p></details>'
  ).join('');
  return '<details class="panel"><summary>Verificación de los cálculos de referencia</summary>'+
    '<p>Los cuatro casos originales tienen entradas fijas. Estrato los recalcula y los compara con una referencia independiente. Se admite una diferencia absoluta de hasta 0,0001 en la unidad del resultado.</p>'+
    '<div class="scroll"><table><thead><tr><th scope="col">Cálculo</th><th scope="col">Esperado</th><th scope="col">Estrato</th><th scope="col">Diferencia absoluta</th><th scope="col">Resultado</th></tr></thead><tbody>'+
    rows+'</tbody></table></div><h3>Cómo reproducir cada cálculo</h3>'+methods+
    '<p><a href="./reference_cases.py" download>Descargar los cálculos independientes en Python</a></p></details>';
}
