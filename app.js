'use strict';
const APPS_SCRIPT_URL='https://script.google.com/macros/s/AKfycbwoQGcqyrHgXTc4f17Qp_HCpX0qz5ZV6fU5EW_VnIzuIKp4zG0VDJGSjYcZLBm7ay2avA/exec';
const $=id=>document.getElementById(id);
let busy=false,pending=null,scanner=null,starting=false,cameraRunning=false;
function show(state,title,detail=''){$('result').dataset.state=state;$('heading').textContent=title;$('detail').textContent=detail;}
function buttons(){const blocked=busy||!!pending||!$('next').hidden;$('check').disabled=blocked;$('camera').disabled=blocked||starting||cameraRunning;}
function save(){try{if(pending)sessionStorage.setItem('gala-github-pending',JSON.stringify(pending));else sessionStorage.removeItem('gala-github-pending');}catch(e){}}
try{const p=JSON.parse(sessionStorage.getItem('gala-github-pending'));if(p&&/^(GALA-\d{4}|GALA-D-[A-F0-9]{32})$/.test(p.code)&&/^[a-zA-Z0-9_-]{16,80}$/.test(p.id)){pending=p;$('retry').hidden=false;show('error','Ingreso pendiente de confirmar','Ingresá la clave y recuperá la respuesta antes de continuar.');}}catch(e){}buttons();
function startCheck(raw){
 if(busy||pending||!$('next').hidden)return;
 if(!$('pin').value){show('error','Falta la clave','Ingresá la clave del equipo de puerta.');return;}
 const code=String(raw).trim().toUpperCase();
 if(!/^(GALA-\d{4}|GALA-D-[A-F0-9]{32})$/.test(code)){show('no_encontrado','Formato de código incorrecto','Usá el código de una entrada de Gala.');return;}
 if(!window.isSecureContext||!crypto.subtle){show('error','Abrí la página publicada','Usá el enlace HTTPS de GitHub Pages en Chrome o Safari.');return;}
 pending={code,id:crypto.randomUUID()};save();request();
}
async function sign(code,id,tiempo,pin){
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',enc.encode(pin),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,enc.encode(code+'\n'+id+'\n'+tiempo));
 return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
async function request(){
 if(busy||!pending)return;
 if(!$('pin').value){show('error','Falta la clave','Ingresá la clave y recuperá la respuesta.');return;}
 busy=true;buttons();$('retry').hidden=true;show('esperando','Verificando…',pending.code);
 const callback='gala_'+crypto.randomUUID().replace(/-/g,'');
 const script=document.createElement('script');let timer,settled=false;
 function cleanup(){clearTimeout(timer);script.remove();window[callback]=()=>{};setTimeout(()=>{delete window[callback];},60000);}
 function uncertain(message){if(settled)return;settled=true;cleanup();busy=false;$('retry').hidden=false;buttons();show('error','Ingreso sin confirmar',message+'\nTocá «Recuperar respuesta» antes de permitir el ingreso o escanear otra entrada.');}
 window[callback]=res=>{
   if(settled)return;
   if(!res||!['valido','usado','no_pagado','no_encontrado'].includes(res.estado)){uncertain(res&&res.mensaje||'Respuesta no reconocida.');return;}
   settled=true;cleanup();busy=false;
   const titles={valido:'ENTRADA VÁLIDA',usado:'ENTRADA YA UTILIZADA',no_pagado:'PAGO PENDIENTE',no_encontrado:'CÓDIGO NO ENCONTRADO'};
   show(res.estado,titles[res.estado],[res.nombre,res.logia,res.cantidad?'Personas: '+res.cantidad:'',res.fechaUso?'Ingreso: '+res.fechaUso:'',res.recuperado?'Respuesta recuperada del mismo ingreso.':''].filter(Boolean).join('\n'));
   pending=null;save();$('next').hidden=false;buttons();
   if(navigator.vibrate)navigator.vibrate(res.estado==='valido'?180:[180,80,180]);
 };
 try{
   const tiempo=String(Date.now()),firma=await sign(pending.code,pending.id,tiempo,$('pin').value);
   const params=new URLSearchParams({codigo:pending.code,solicitud:pending.id,tiempo,firma,callback});
   script.src=APPS_SCRIPT_URL+'?'+params.toString();script.referrerPolicy='no-referrer';
   script.onerror=()=>uncertain('No se pudo recibir la respuesta de Google.');
   timer=setTimeout(()=>uncertain('Google no respondió a tiempo. El ingreso podría haberse registrado.'),30000);
   document.body.appendChild(script);
 }catch(e){uncertain('No se pudo preparar la consulta. Usá un navegador actualizado.');}
}
$('manual').addEventListener('submit',e=>{e.preventDefault();startCheck($('code').value);});
$('retry').onclick=request;
$('next').onclick=()=>{$('next').hidden=true;$('code').value='';buttons();show('esperando','Listo para verificar','Retirá la entrada anterior y acercá la siguiente.');};
$('camera').onclick=async()=>{
 if(starting||cameraRunning||busy||pending)return;
 if(!$('pin').value){show('error','Falta la clave','Ingresá la clave antes de activar la cámara.');return;}
 if(typeof Html5Qrcode==='undefined'){show('error','Escáner no disponible','Revisá internet o escribí el código manualmente.');return;}
 starting=true;buttons();
 try{
   scanner=scanner||new Html5Qrcode('reader');
   await scanner.start({facingMode:'environment'},{fps:8,qrbox:(w,h)=>({width:Math.min(w,h,280)*.8,height:Math.min(w,h,280)*.8})},startCheck,()=>{});
   cameraRunning=true;$('camera').textContent='Cámara activa';
 }catch(e){show('error','No se pudo abrir la cámara','Abrí el enlace de GitHub Pages en Chrome o Safari y permití el acceso a la cámara. Podés usar el código manual.');}
 finally{starting=false;buttons();}
};
