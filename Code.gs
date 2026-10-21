const GALA = {
  id: '1xe8BoV6h2eL4dFSv8UoRWvugEMxEBJjXlF5hJJMSCZw',
  fisicas: 'codigos gala fisico', digitales: 'Respuestas de formulario 1',
  zona: 'America/Asuncion', version: 'github-3'
};

// GitHub usa este servicio; la cámara NO se abre dentro de Google.
function doGet(e) {
  const p = e && e.parameter || {};
  if (!p.callback) return jsonGala_({estado:'listo',version:GALA.version,mensaje:'Servicio activo. Abrí la página de GitHub para escanear.'});
  if (!/^gala_[a-zA-Z0-9_]{10,100}$/.test(p.callback)) return jsonGala_({estado:'error',mensaje:'Solicitud inválida.'});
  let resultado;
  try {
    validarSolicitudGala_(p);
    resultado = registrarGala_(p.codigo,p.solicitud);
  } catch(err) { resultado = {estado:'error',mensaje:err.message || 'No se pudo verificar la entrada.'}; }
  return ContentService.createTextOutput(p.callback+'('+JSON.stringify(resultado).replace(/</g,'\\u003c')+');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function jsonGala_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
function normalGala_(v) {return String(v == null?'':v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function siGala_(v) {return ['si','true','1'].includes(normalGala_(v));}
function usadoGala_(v) {return !['','no','false','0'].includes(normalGala_(v));}
function hojaGala_(nombre) {
  const s=SpreadsheetApp.openById(GALA.id).getSheetByName(nombre);
  if(!s) throw new Error('No se encuentra la pestaña '+nombre);
  return s;
}
function columnasGala_(s) {
  const cols={};
  s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].forEach((v,i)=>{
    const key=normalGala_(v); if(!key)return;
    if(cols[key])throw new Error('Encabezado duplicado: '+v);
    cols[key]=i+1;
  });return cols;
}
function prepararPlanilla() {
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    [GALA.fisicas,GALA.digitales].forEach(nombre=>{
      const s=hojaGala_(nombre),cols=columnasGala_(s);
      const requeridas=['Pagado','Codigo','Usado','Fecha_hora_uso','Solicitud_ingreso'];
      if(nombre===GALA.digitales)requeridas.push('Envio entrada');
      requeridas.forEach(n=>{if(!cols[normalGala_(n)]){const c=s.getLastColumn()+1;s.getRange(1,c).setValue(n);cols[normalGala_(n)]=c;}});
    });SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
}

// Verifica el formato de la solicitud. Esta versión no requiere clave de operador.
function validarSolicitudGala_(p) {
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(String(p.solicitud)))throw new Error('Solicitud inválida.');
  if(!/^(GALA-\d{4}|GALA-D-[A-F0-9]{32})$/.test(String(p.codigo)))throw new Error('Formato de código inválido.');
}

function registrarGala_(codigo,solicitud) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('Sistema ocupado. Recuperá la respuesta para reintentar.');
  try {
    const fisica=/^GALA-\d{4}$/.test(codigo),s=hojaGala_(fisica?GALA.fisicas:GALA.digitales),cols=columnasGala_(s);
    ['codigo','usado','fecha_hora_uso','pagado','solicitud_ingreso'].forEach(k=>{if(!cols[k])throw new Error('Ejecutá prepararPlanilla: falta '+k);});
    if(s.getLastRow()<2)return {estado:'no_encontrado'};
    const matches=s.getRange(2,cols.codigo,s.getLastRow()-1,1).createTextFinder(codigo).matchEntireCell(true).matchCase(false).findAll();
    if(!matches.length)return {estado:'no_encontrado'};
    if(matches.length!==1)throw new Error('Código duplicado en la planilla. Revisar antes de permitir el ingreso.');
    const fila=matches[0].getRow(),rango=s.getRange(fila,1,1,s.getLastColumn()),row=rango.getValues()[0];
    const get=k=>cols[normalGala_(k)]?row[cols[normalGala_(k)]-1]:'';
    const cantidad=fisica?1:Number(get('Cantidad de adhesión'));
    if(!Number.isInteger(cantidad)||cantidad<1||cantidad>800)throw new Error('Revisar Cantidad de adhesión en la planilla.');
    const fecha=get('Fecha_hora_uso');
    const resultado={codigo,nombre:String(get(fisica?'Nombre':'Nombre y Apellido')||'Entrada física'),logia:String(get(fisica?'Logia':'Log.:')||''),cantidad,
      fechaUso:fecha instanceof Date?Utilities.formatDate(fecha,GALA.zona,'dd/MM/yyyy HH:mm:ss'):String(fecha||'')};
    if(usadoGala_(get('Usado'))||usadoGala_(fecha)) {
      const mismo=String(get('Solicitud_ingreso'))===solicitud;
      return Object.assign(resultado,{estado:mismo?'valido':'usado',recuperado:mismo});
    }
    if(!siGala_(get('Pagado')))return Object.assign(resultado,{estado:'no_pagado'});
    const ahora=new Date();
    const formulas=rango.getFormulas()[0];formulas.forEach((v,i)=>{if(v)row[i]=v;});
    row[cols.usado-1]='Sí';row[cols.fecha_hora_uso-1]=ahora;row[cols.solicitud_ingreso-1]=solicitud;
    rango.setValues([row]);SpreadsheetApp.flush();
    return Object.assign(resultado,{estado:'valido',fechaUso:Utilities.formatDate(ahora,GALA.zona,'dd/MM/yyyy HH:mm:ss')});
  } finally {lock.releaseLock();}
}

// Correo opcional: necesita un activador instalable «Al editar».
function enviarEntradaSiPago(e) {
  if(!e||!e.range)return;
  const s=e.range.getSheet();
  if(s.getParent().getId()!==GALA.id||s.getName()!==GALA.digitales)return;
  const cols=columnasGala_(s);
  if(!cols.pagado||e.range.getColumn()>cols.pagado||e.range.getLastColumn()<cols.pagado)return;
  ['envio entrada','codigo','correo electronico','cantidad de adhesion'].forEach(k=>{if(!cols[k])throw new Error('Falta encabezado: '+k);});
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try {for(let fila=Math.max(2,e.range.getRow());fila<=e.range.getLastRow();fila++){
    const row=s.getRange(fila,1,1,s.getLastColumn()).getValues()[0],get=k=>row[cols[k]-1];
    if(!siGala_(get('pagado'))||normalGala_(get('envio entrada'))!=='')continue;
    const email=String(get('correo electronico')).trim(),cantidad=Number(get('cantidad de adhesion'));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isInteger(cantidad)||cantidad<1||cantidad>800)continue;
    const codigo=String(get('codigo')||'GALA-D-'+Utilities.getUuid().replace(/-/g,'').toUpperCase());
    if(!/^GALA-D-[A-F0-9]{32}$/.test(codigo))throw new Error('Código digital incompatible en fila '+fila);
    s.getRange(fila,cols.codigo).setValue(codigo);
    s.getRange(fila,cols['envio entrada']).setValue('En proceso — revisar Gmail antes de reintentar');SpreadsheetApp.flush();
    try {
      const qr=UrlFetchApp.fetch('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(codigo)).getBlob().setName(codigo+'.png');
      GmailApp.sendEmail(email,'Tu entrada — Cena de Gala Gran Logia','Gran Logia de Libres y Aceptados Masones de la República del Paraguay\nCantidad de adhesiones: '+cantidad+'\nCódigo: '+codigo+'\nPresentá el QR adjunto. El grupo ingresa junto.',{attachments:[qr]});
      s.getRange(fila,cols['envio entrada']).setValue('Sí');
    }catch(err){s.getRange(fila,cols['envio entrada']).setValue('Revisar envío en Gmail antes de reintentar');throw err;}
  }}finally{lock.releaseLock();}
}
