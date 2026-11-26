# Estrato · Integridad de equipos estáticos

Aplicación académica MAN040-B para seguimiento de cañerías, recipientes y tanques. [Abrir la aplicación](https://realkingdev.github.io/integridad-equipos-estaticos/).

## Ejecución local

Con Python 3, ejecutar `python -m http.server 8000 --bind 127.0.0.1` desde este directorio y abrir http://127.0.0.1:8000. El repositorio incluye el runtime Pyodide 0.27.7 para ejecutar los cálculos en Python en el navegador y para usar el caso localmente sin conexión. Los cambios se conservan en el navegador. Registro de equipos permite exportar e importar un respaldo JSON, incluidas las imágenes personalizadas.

## Alcance académico

El catálogo incluye un material por familia. La ficha presenta los supuestos de presión, temperatura, geometría y juntas. En tuberías se calcula el tramo recto y se hace seguimiento de puntos del circuito. El tanque cubre las virolas del manto. Las referencias de inspección y las limitaciones del intervalo aparecen en cada punto. El caso RBI independiente representa un tramo recto con adelgazamiento generalizado y consecuencias medias por evento. Los equipos e imágenes del proyecto son ficticios.

## Verificación

Ejecutar `python -m unittest discover -v`. Las pruebas comparan los modelos de diseño y planificación con casos independientes y verifican el factor de daño con una integración numérica de referencia. La aplicación muestra los resultados del caso original en el panel de verificación.

Runtime tomado del paquete oficial pyodide 0.27.7. Se incluye su licencia en runtime/LICENSE.
