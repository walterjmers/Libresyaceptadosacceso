const CONFIG = Object.freeze({
  spreadsheetId: '1xe8BoV6h2eL4dFSv8UoRWvugEMxEBJjXlF5hJJMSCZw',
  fisicas: 'codigos gala fisico', digitales: 'Respuestas de formulario 1',
  titulo: 'Control Gran Logia de Libres y Aceptados masones de la republica del paraguay',
  zona: 'America/Asuncion'
});

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle(CONFIG.titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function normalizar_(v) {
  return String(v == null ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function si_(v) { return ['si', 'true', '1'].indexOf(normalizar_(v)) >= 0; }
function usado_(v) { return normalizar_(v) !== '' && !['no', 'false', '0'].includes(normalizar_(v)); }
function hoja_(nombre) {
  const s = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheetByName(nombre);
  if (!s) throw new Error('No se encuentra la pestaña: ' + nombre);
  return s;
}
function columnas_(s) {
  const headers = s.getRange(1, 1, 1, s.getLastColumn()).getDisplayValues()[0];
  const cols = {};
  headers.forEach((v, i) => {
    const key = normalizar_(v);
    if (key && cols[key]) throw new Error('Encabezado duplicado: ' + v);
    if (key) cols[key] = i + 1;
  });
  return cols;
}
function asegurar_(s, nombres) {
  const cols = columnas_(s);
  nombres.forEach(n => {
    if (!cols[normalizar_(n)]) {
      const col = s.getLastColumn() + 1;
      s.getRange(1, col).setValue(n);
      cols[normalizar_(n)] = col;
    }
  });
  return cols;
}
function exigir_(cols, nombres) {
  nombres.forEach(n => { if (!cols[normalizar_(n)]) throw new Error('Falta la columna ' + n + '. Ejecutá prepararPlanilla.'); });
}

// Ejecutar manualmente una vez. Agrega columnas; no importa ni cambia entradas.
function prepararPlanilla() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    asegurar_(hoja_(CONFIG.fisicas), ['Codigo', 'Usado', 'Fecha_hora_uso', 'Nombre', 'Logia', 'Pagado', 'Solicitud_ingreso']);
    asegurar_(hoja_(CONFIG.digitales), ['Pagado', 'Envio entrada', 'Codigo', 'Usado', 'Fecha_hora_uso', 'Solicitud_ingreso']);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function autorizar_(pin) {
  const esperado = PropertiesService.getScriptProperties().getProperty('PIN_OPERADOR');
  if (!esperado || esperado.length < 8) throw new Error('Configurá PIN_OPERADOR de al menos 8 caracteres en las propiedades del proyecto.');
  if (String(pin) !== esperado) throw new Error('Clave de operador incorrecta.');
}

function validarEntrada(codigo, pin, solicitud) {
  autorizar_(pin);
  codigo = String(codigo || '').trim().toUpperCase();
  if (!/^(GALA-\d{4}|GALA-D-[A-F0-9]{32})$/.test(codigo)) return {estado:'no_encontrado'};
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(solicitud))) throw new Error('Solicitud inválida.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistema ocupado. Reintentá con el mismo código.');
  try {
    const fisica = /^GALA-\d{4}$/.test(codigo);
    const sheet = hoja_(fisica ? CONFIG.fisicas : CONFIG.digitales);
    const cols = columnas_(sheet);
    exigir_(cols, ['Codigo','Usado','Fecha_hora_uso','Pagado','Solicitud_ingreso']);
    if (sheet.getLastRow() < 2) return {estado:'no_encontrado'};
    const matches = sheet.getRange(2, cols.codigo, sheet.getLastRow()-1, 1)
      .createTextFinder(codigo).matchEntireCell(true).matchCase(false).findAll();
    if (!matches.length) return {estado:'no_encontrado'};
    if (matches.length !== 1) throw new Error('Código duplicado en la planilla. Revisar antes del ingreso.');
    const fila = matches[0].getRow();
    const rangoFila = sheet.getRange(fila,1,1,sheet.getLastColumn());
    const row = rangoFila.getValues()[0];
    const get = key => cols[normalizar_(key)] ? row[cols[normalizar_(key)]-1] : '';
    const cantidad = fisica ? 1 : Number(get('Cantidad de adhesión'));
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 800) throw new Error('Cantidad de adhesión inválida.');
    const fecha = get('Fecha_hora_uso');
    const data = {codigo, nombre: String(get(fisica?'Nombre':'Nombre y Apellido') || 'Entrada física'),
      logia: String(get(fisica?'Logia':'Log.:') || ''), cantidad,
      fechaUso: fecha instanceof Date ? Utilities.formatDate(fecha,CONFIG.zona,'dd/MM/yyyy HH:mm:ss') : String(fecha || '')};
    if (usado_(get('Usado')) || usado_(fecha)) {
      return Object.assign(data,{estado: String(get('Solicitud_ingreso')) === solicitud ? 'valido' : 'usado', recuperado: String(get('Solicitud_ingreso')) === solicitud});
    }
    if (!si_(get('Pagado'))) return Object.assign(data,{estado:'no_pagado'});
    // Una sola escritura para conservar juntos marca, fecha y solicitud.
    row[cols.usado-1] = 'Sí';
    row[cols.fecha_hora_uso-1] = new Date();
    row[cols.solicitud_ingreso-1] = solicitud;
    const formulas = rangoFila.getFormulas()[0];
    formulas.forEach((formula,i) => {
      if (formula && ![cols.usado,cols.fecha_hora_uso,cols.solicitud_ingreso].includes(i+1)) row[i]=formula;
    });
    rangoFila.setValues([row]);
    SpreadsheetApp.flush();
    data.fechaUso = Utilities.formatDate(row[cols.fecha_hora_uso-1],CONFIG.zona,'dd/MM/yyyy HH:mm:ss');
    return Object.assign(data,{estado:'valido'});
  } finally { lock.releaseLock(); }
}

// Activador instalable «Al editar». No se envían correos al instalar el código.
function enviarEntradaSiPago(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getParent().getId() !== CONFIG.spreadsheetId || sheet.getName() !== CONFIG.digitales) return;
  const cols = columnas_(sheet);
  exigir_(cols,['Pagado','Envio entrada','Codigo','Nombre y Apellido','Correo electrónico','Cantidad de adhesión']);
  if (e.range.getColumn() > cols.pagado || e.range.getLastColumn() < cols.pagado) return;
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    for (let r=Math.max(2,e.range.getRow());r<=e.range.getLastRow();r++) {
      const row = sheet.getRange(r,1,1,sheet.getLastColumn()).getValues()[0];
      const get = n => row[cols[normalizar_(n)]-1];
      if (!si_(get('Pagado')) || normalizar_(get('Envio entrada')) !== '') continue;
      const email = String(get('Correo electrónico')).trim();
      const cantidad = Number(get('Cantidad de adhesión'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 800) continue;
      const codigo = String(get('Codigo') || ('GALA-D-'+Utilities.getUuid().replace(/-/g,'').toUpperCase()));
      if (!/^GALA-D-[A-F0-9]{32}$/.test(codigo)) throw new Error('Código digital incompatible en fila '+r);
      sheet.getRange(r,cols.codigo).setValue(codigo);
      // Estado previo evita duplicar correos si el proveedor acepta y luego falla la respuesta.
      sheet.getRange(r,cols['envio entrada']).setValue('En proceso — revisar antes de reintentar');
      SpreadsheetApp.flush();
      try {
        const qr = UrlFetchApp.fetch('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(codigo)).getBlob().setName(codigo+'.png');
        const texto = 'Cena de Gala — Gran Logia de Libres y Aceptados Masones de la República del Paraguay\nTitular: '+get('Nombre y Apellido')+'\nCantidad: '+cantidad+'\nCódigo: '+codigo+'\nEl grupo debe ingresar junto. Presentá este QR en puerta.';
        GmailApp.sendEmail(email,'Tu entrada — Cena de Gala Gran Logia',texto,{attachments:[qr]});
        sheet.getRange(r,cols['envio entrada']).setValue('Sí');
      } catch (err) {
        sheet.getRange(r,cols['envio entrada']).setValue('Revisar envío — no reenviar sin comprobar Gmail');
        throw err;
      }
    }
  } finally { lock.releaseLock(); }
}
