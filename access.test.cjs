const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(rows,headers){
 const data=[headers||['Codigo','Usado','Fecha_hora_uso','Nombre','Logia','Pagado','Solicitud_ingreso'],...rows];
 let locked=false;
 const sheet={getLastColumn:()=>data[0].length,getLastRow:()=>data.length,getRange(r,c,n=1,m=1){return {
 getDisplayValues:()=>data.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+m).map(String)),
 getValues:()=>data.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+m)),
 getFormulas:()=>Array.from({length:n},()=>Array(m).fill('')),
 setValues(values){assert.ok(locked);values.forEach((row,i)=>row.forEach((v,j)=>data[r-1+i][c-1+j]=v));},
 createTextFinder(code){return {matchEntireCell(){return this},matchCase(){return this},findAll:()=>data.slice(1).flatMap((row,i)=>String(row[c-1]).toUpperCase()===code?[{getRow:()=>i+2}]:[])}}
 }}};
 const context=vm.createContext({SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},
 LockService:{getScriptLock:()=>({tryLock(){assert.equal(locked,false);locked=true;return true},releaseLock(){locked=false}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'clave-prueba-123'})},Utilities:{formatDate:()=> '21/10/2026 12:00:00'}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),context);
 return {data,run:(code,id='request_1234567890',pin='clave-prueba-123')=>context.validarEntrada(code,pin,id)};
}
test('registra pago, preserva nombre y logia, recupera solicitud y rechaza otro ingreso',()=>{
 const s=setup([['GALA-0001','','','Persona','Logia X','Sí','']]);
 assert.equal(s.run(' gala-0001 ').estado,'valido');
 assert.equal(s.data[1][3],'Persona');assert.equal(s.data[1][4],'Logia X');
 assert.equal(s.run('GALA-0001').recuperado,true);
 assert.equal(s.run('GALA-0001','other_request_123456').estado,'usado');
});
test('pago vacío no consume la entrada',()=>{
 const s=setup([['GALA-0001','','','Persona','','','']]);
 assert.equal(s.run('GALA-0001').estado,'no_pagado');assert.equal(s.data[1][1],'');
});
test('No y FALSE no significan usado',()=>{
 const s=setup([['GALA-0001','No','','Persona','','Sí','']]);
 assert.equal(s.run('GALA-0001').estado,'valido');
});
test('rechaza códigos duplicados sin consumir ninguno',()=>{
 const row=['GALA-0001','','','','','Sí',''];const s=setup([row.slice(),row.slice()]);
 assert.throws(()=>s.run('GALA-0001'),/duplicado/);assert.equal(s.data[1][1],'');
});
test('rechaza clave inválida y código ajeno',()=>{
 const s=setup([]);assert.throws(()=>s.run('GALA-0001',undefined,'incorrecta'),/incorrecta/);
 assert.equal(s.run('ARKHE-123').estado,'no_encontrado');assert.equal(s.run('GALA-0801').estado,'no_encontrado');
});
test('digital toma la cantidad y conserva acompañantes y observaciones',()=>{
 const headers=['Marca temporal','Nombre y Apellido','Correo electrónico','Whatsapp','Log.:','Cantidad de adhesión','Acompañantes','Observación','Pagado','Envio entrada','Codigo','Usado','Fecha_hora_uso','Solicitud_ingreso'];
 const code='GALA-D-'+ 'A'.repeat(32);
 const s=setup([['','Persona','correo@example.com','','Logia X',3,'Dos acompañantes','Mesa 4','Sí','Sí',code,'','','']],headers);
 const res=s.run(code);assert.equal(res.estado,'valido');assert.equal(res.cantidad,3);assert.equal(res.logia,'Logia X');
 assert.equal(s.data[1][6],'Dos acompañantes');assert.equal(s.data[1][7],'Mesa 4');
});
test('digital con cantidad inválida no registra uso',()=>{
 const code='GALA-D-'+ 'B'.repeat(32);
 const s=setup([[code,'','','Persona','','Sí','',0]],['Codigo','Usado','Fecha_hora_uso','Nombre y Apellido','Log.:','Pagado','Solicitud_ingreso','Cantidad de adhesión']);
 assert.throws(()=>s.run(code),/Cantidad/);assert.equal(s.data[1][1],'');
});
