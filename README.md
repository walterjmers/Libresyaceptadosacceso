# Control Gran Logia de Libres y Aceptados masones de la republica del paraguay

Aplicación de control de ingreso para la Cena de Gala, con el logo provisto, escáner QR, ingreso manual y registro en Google Sheets. Proyecto preparado para un repositorio independiente `control-gran-logia`.

## Archivos

- `apps-script/Code.gs`: validación y envío de entradas digitales.
- `apps-script/Index.html`: aplicación completa para alojar en Apps Script.
- `apps-script/appsscript.json`: zona horaria del proyecto.
- `index.html`: portada para GitHub Pages; abre el despliegue configurado. No valida desde GitHub Pages.
- `assets/logo.png`: logo original suministrado.
- `data/codigos_gala.csv`: copia sin modificar de los 800 códigos físicos. No es necesario volver a importarlos.
- `tests/access.test.cjs`: pruebas de las reglas de ingreso con una planilla simulada.

## Instalar en el proyecto de Google

1. Abrí la [planilla de Gala](https://docs.google.com/spreadsheets/d/1xe8BoV6h2eL4dFSv8UoRWvugEMxEBJjXlF5hJJMSCZw/edit) y entrá a **Extensiones → Apps Script**. Guardá una copia del código anterior.
2. Reemplazá el código del proyecto que corresponde a esta Gala por `apps-script/Code.gs`. Creá un archivo HTML llamado **Index** y pegá `apps-script/Index.html`. Evitá tener dos funciones `doGet` o dos `enviarEntradaSiPago`. No reemplaces el proyecto de La Piedra Bruta si es independiente.
3. En Configuración del proyecto, elegí `America/Asuncion` y agregá la propiedad de secuencia de comandos **PIN_OPERADOR**, con una clave privada de al menos 8 caracteres. No incluyas la clave en el HTML o en GitHub.
4. Ejecutá manualmente **prepararPlanilla** y autorizá el acceso. Solo agrega encabezados faltantes. Verificá los nombres exactos de las pestañas: `codigos gala fisico` y `Respuestas de formulario 1`.
5. En las entradas físicas vendidas o autorizadas, completá **Pagado = Sí**. Las celdas vacías se consideran pendientes y no permiten ingresar. No se marca ninguna entrada como pagada automáticamente.
6. Implementar → Administrar implementaciones → Editar → Nueva versión. Ejecutar como propietario. Limitá el acceso a las cuentas del equipo si tu configuración lo permite. Si necesitás acceso por enlace, la clave de operador sigue siendo obligatoria. Abrí el enlace desde el navegador del teléfono y probá la cámara.
7. El enlace proporcionado ya figura en la portada: `https://script.google.com/macros/s/AKfycbwoQGcqyrHgXTc4f17Qp_HCpX0qz5ZV6fU5EW_VnIzuIKp4zG0VDJGSjYcZLBm7ay2avA/exec`. Para conservarlo, actualizá esa implementación. Si creás otra, cambiá el enlace de la portada.

**La entrega no modifica la planilla ni instala el despliegue remoto.** El enlace suministrado no pudo verificarse desde el lector web. El código anterior del despliegue no queda reemplazado hasta realizar los pasos anteriores.

## Columnas

En la pestaña física se usan por encabezado: Codigo, Usado, Fecha_hora_uso, Nombre, Logia, Pagado. Se agrega Solicitud_ingreso.

En el formulario se conservan A:H: Marca temporal, Nombre y Apellido, Correo electrónico, Whatsapp, Log.:, Cantidad de adhesión, Acompañantes, Observación. Se agregan al final Pagado, Envio entrada, Codigo, Usado, Fecha_hora_uso, Solicitud_ingreso. No usar las posiciones del código de La Piedra Bruta: G y H contienen otros datos.

Un QR físico permite una persona. Un QR digital representa toda la cantidad de adhesiones y se utiliza una sola vez: el grupo entra junto. No se suman acompañantes a la cantidad para evitar contarlos dos veces. Confirmar esta interpretación con quien gestiona el formulario antes de vender entradas digitales.

## Correo opcional

Para habilitarlo, crear un activador instalable para **enviarEntradaSiPago**, origen «De hoja de cálculo», evento «Al editar». Marcar manualmente **Pagado = Sí** enviará la entrada a esa fila. Los cambios hechos por fórmulas u otros scripts no disparan ese evento. No se enviaron correos durante la preparación del proyecto.

El correo contiene el código y un PNG del QR. El QR se genera con api.qrserver.com, que recibe el código, sin nombre ni correo. Revisar si ese proveedor es adecuado para la organización antes de activar envíos. El estado «En proceso» o «Revisar envío» requiere comprobar Gmail antes de borrar el estado y reintentar; previene reenvíos automáticos ante respuestas inciertas.

## Revisión aplicada

- Se quitaron las planillas y los prefijos de otros eventos.
- Se cambió JSONP que consumía entradas por consultas internas de Apps Script con clave. Abrir un enlace GET no registra ingresos.
- Se agregó exclusión mutua entre teléfonos, búsqueda exacta y rechazo de códigos duplicados.
- Se interpretan «No» y FALSE como no utilizado.
- Se conserva la solicitud pendiente en la sesión para recuperar una respuesta tras un corte, sin volver a consumir la entrada. Recuperación solo desde el mismo navegador y sesión; otro dispositivo ve «ya utilizada».
- Los resultados se insertan como texto para impedir que nombres de la planilla se ejecuten como HTML.
- Se eliminó el borrado de cachés y de service workers ajenos.
- Las entradas no se validan sin conexión. No usar varios proyectos Apps Script distintos contra esta planilla: el bloqueo coordina instancias del mismo proyecto.

## Verificación y puesta en marcha

Ejecutar `node --test tests/access.test.cjs`. Las pruebas son simuladas; no equivalen a una prueba en Google.

Antes del evento, usar una copia de la planilla y una implementación de prueba: verificar un código pagado desde dos teléfonos al mismo tiempo (uno válido y otro usado), un impago, un inexistente, y recuperar una respuesta con el mismo identificador. Probar una entrada digital de varias adhesiones y el correo con una dirección propia. La cámara debe probarse en los teléfonos reales. No consumir entradas reales para ensayar.

El PDF tiene 200 páginas con numeración 0001–0800, que coincide con los 800 códigos únicos del CSV. La coincidencia de números impresos no acredita por sí sola el contenido de cada QR: queda pendiente comprobar los QR impresos con la cámara.

## Repositorio

Esta carpeta es un repositorio Git local con un commit inicial. Para publicarlo, crear un repositorio privado `control-gran-logia` en GitHub y subir el contenido. El conector disponible no ofrece crear repositorios; no se creó un repositorio remoto. Si se usa GitHub Pages para la portada, revisar la visibilidad del sitio y no publicar información de asistentes ni claves.
