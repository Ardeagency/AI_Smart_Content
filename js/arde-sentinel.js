/* ARDE sentinel — aviso ntfy cuando una persona INICIA SESION en la consola.
   Un solo aviso por sesion de navegador (nada de ruido mientras navega la app).
   Filtro de bots + auto-exclusion ARDE (geo Rionegro/Llanogrande, bypass ?test=1).
   El "quien" sale de la sesion propia de la app (user_session: email + nombre). */
(function(){
  try{
    /* modo test pegajoso: ?test=1 se recuerda toda la sesion del navegador,
       porque el login redirige y la URL pierde el query antes del aviso */
    var TESTMODE=false;
    try{ if(/[?&]test=1/i.test(location.search))sessionStorage.setItem('arde_test','1'); TESTMODE=!!sessionStorage.getItem('arde_test'); }
    catch(e){ TESTMODE=/[?&]test=1/i.test(location.search); }
    var ARDE_SELF=false;try{fetch('https://ipapi.co/json/').then(function(r){return r.json();}).then(function(d){if(/rionegro|llanogrande/i.test((d.city||'')+' '+(d.region||''))&&!TESTMODE)ARDE_SELF=true;}).catch(function(){});}catch(e){}
    var TOPIC='https://ntfy.sh/arde-cotizaciones-7k2pqz9x';
    var LABEL='Consola AISC', KEY='aisclogin';
    var ua=navigator.userAgent||'';
    var isBot = navigator.webdriver===true
      || /bot\b|crawl|spider|slurp|bingbot|yandex|baidu|duckduckbot|headless|phantom|puppeteer|playwright|python-|curl\/|wget|libwww|httpclient|okhttp|go-http|java\/|facebookexternalhit|embedly|telegrambot|whatsapp|discordbot|slackbot|twitterbot|linkedinbot|googlebot|applebot|lighthouse|pingdom|uptimerobot|datadog|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|ccbot|claudebot|amazonbot|zgrab|censys|shodan|expanse|netcraft|httpx|nmap|masscan|paloalto|internetmeasurement/i.test(ua)||(function(){var m=ua.match(/Chrome\/(\d+)/);return !!m&&+m[1]<90;})();
    if(isBot) return;
    function post(title,tags,body){if(ARDE_SELF)return; try{ fetch(TOPIC,{method:'POST',keepalive:true,headers:{'Title':title,'Tags':tags},body:body}); }catch(e){ try{navigator.sendBeacon(TOPIC,body);}catch(e2){} } }
    function currentUser(){
      try{
        var raw=localStorage.getItem('user_session')||sessionStorage.getItem('user_session');
        if(raw){var s=JSON.parse(raw); if(s&&s.email)return {email:s.email,name:s.full_name||''};}
      }catch(e){}
      try{
        for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
          if(/^sb-.*-auth-token$/.test(k)){var t=JSON.parse(localStorage.getItem(k));
            var u=(t&&(t.user||(t.currentSession&&t.currentSession.user)))||null;
            if(u&&u.email)return {email:u.email,name:(u.user_metadata&&u.user_metadata.full_name)||''};}}
      }catch(e){}
      return null;
    }
    var pinged=false;
    try{ pinged=!!sessionStorage.getItem('arde_s_'+KEY); }catch(e){}
    var gi=setInterval(function(){
      if(pinged){clearInterval(gi);return;}
      var u=currentUser(); if(!u)return;
      pinged=true; clearInterval(gi);
      try{ sessionStorage.setItem('arde_s_'+KEY,'1'); }catch(e){}
      var visits=0;
      try{ visits=(parseInt(localStorage.getItem('arde_v_'+KEY)||'0',10)||0)+1; localStorage.setItem('arde_v_'+KEY,String(visits)); }catch(e){}
      var quien=(u.name?u.name+' — ':'')+u.email;
      var rep=visits>=2?(' (sesion #'+visits+' en este navegador)'):'';
      function ping(loc){ post('ARDE - Sesion iniciada: '+LABEL,'unlock,bust_in_silhouette',
        'Inicio sesion en la consola: '+quien+rep+'\n'+loc+'\nLlego desde: '+(document.referrer||'enlace directo')+'\nDispositivo: '+ua.slice(0,90)); }
      fetch('https://ipapi.co/json/').then(function(r){return r.json();}).then(function(d){if(/rionegro|llanogrande/i.test((d.city||'')+' '+(d.region||''))&&!TESTMODE)ARDE_SELF=true;
        ping('Ubicacion: '+(d.city||'?')+', '+(d.region||'')+' '+(d.country_name||'?')+' (IP '+(d.ip||'?')+')');
      }).catch(function(){ ping('Ubicacion: no disponible'); });
    },1500);
  }catch(e){}
})();
