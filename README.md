# Estrato · Integridad de equipos estáticos

Aplicación académica MAN040-B para seguimiento de cañerías, recipientes y tanques. [Abrir la aplicación](https://realkingdev.github.io/integridad-equipos-estaticos/).

## Ejecución local

Con Python 3, ejecutar `python -m http.server 8000 --bind 127.0.0.1` desde este directorio y abrir http://127.0.0.1:8000. El repositorio incluye el runtime Pyodide 0.27.7 para ejecutar los cálculos en Python en el navegador y para usar el caso localmente sin conexión. Los cambios se conservan en el navegador. Desde Registro de equipos se puede exportar e importar un respaldo JSON con esquemas, documentos PDF, mediciones y correcciones. La agenda exporta los resultados filtrados como CSV.

## Uso

- Usa Volver en la barra superior para regresar a la vista anterior. Las listas recuperan sus filtros y la conversación del asistente queda disponible durante la sesión.
- Vista general enlaza cada estado con su filtro en la agenda.
- En el equipo, selecciona un marcador para abrir su punto. En Editar punto, ingresa las cotas y la referencia de terreno, gira el modelo 3D y marca la pared. Puedes ajustar la distancia y el ángulo en los campos. El modelo cubre tramos rectos, codos circulares, mantos cilíndricos y virolas.
- Registra campañas anteriores por fecha. Para corregir una lectura ya guardada, indica el motivo y conserva el valor anterior en el historial de correcciones.
- En Inspecciones, cambia la fecha de evaluación para explorar vencimientos. La fecha simulada afecta las vistas durante la sesión.
- En Proyección de vida del punto, compara la fecha de alerta y de mínimo para las tasas moderada, adoptada y acelerada. Ajusta las tasas hipotéticas en el gráfico. El plan por espesor usa la tasa adoptada y distingue cruces medidos de cruces proyectados.
- Cambia las variables directamente en Análisis RBI, Cálculo de diseño o Simular lectura para ver una comparación inmediata con el caso guardado. Los cambios se conservan al seleccionar Guardar o Aplicar.
- En RBI, Calcular para un objetivo obtiene la consecuencia por evento que corresponde a un riesgo anual dado y a la frecuencia del escenario activo.
- En cada simulador, captura las entradas y resultados en las alternativas A y B. Las capturas se guardan con el caso y Cargar entradas devuelve una alternativa al formulario para recalcularla.
- En Fuentes de datos, consulta un endpoint REST con CORS o lee un archivo CSV, JSON o SQLite. Vincula tus encabezados, elige revisar la fecha y unidad de origen y guarda la configuración en el navegador. La vista previa distingue nuevas lecturas, duplicados y conflictos.
- En Asistente, pregunta por TAG o TML, condición, lecturas, pendientes o riesgo. Las respuestas consultan los registros guardados y enlazan a su fuente. Las consultas por plazo abren la agenda filtrada y las lecturas hipotéticas abren el simulador con la propuesta cargada.

- Abre la evidencia de cada resultado para ver sus entradas, unidades, criterios y referencias.

## Fuentes de datos

Las mediciones tabulares requieren TAG, TML, fecha y espesor. El formato mostrado en la aplicación usa `tag;tml;fecha;espesor;unidad;tecnica;observaciones`. SQLite permite elegir cualquier tabla ordinaria de la base. El ejemplo utiliza `mediciones`. La API debe permitir solicitudes GET de lectura desde la app mediante CORS. El token Bearer se usa en la solicitud y se mantiene fuera de los datos guardados. La vista previa acepta hasta 5.000 filas y 2 MB por consulta o archivo. Un respaldo JSON de Estrato también permite incorporar equipos y puntos nuevos.

## Alcance académico

El catálogo incluye un material por familia. La ficha presenta los supuestos de presión, temperatura, geometría y juntas. En tuberías se calcula el tramo recto. Los accesorios utilizan el mínimo de servicio documentado para su ubicación. El tanque cubre las virolas del manto. Las referencias de inspección y las limitaciones del intervalo aparecen en cada punto. El caso RBI independiente representa un tramo recto con adelgazamiento generalizado y consecuencias medias por evento. Los equipos e imágenes del proyecto son ficticios.

## Verificación

Ejecutar `python -m unittest discover -v`. Las pruebas comparan los modelos de diseño y planificación con casos independientes y verifican el factor de daño con una integración numérica de referencia. La aplicación muestra los resultados del caso original en el panel de verificación.

Runtime y módulo SQLite tomados del paquete oficial Pyodide 0.27.7. Se incluye su licencia en runtime/LICENSE.
