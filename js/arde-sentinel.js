/* ARDE sentinel — aviso ntfy cuando alguien llega al login de la consola.
   Solo corre en rutas públicas de entrada (/, /login, /signin, /demo); nunca dentro de la app.
   Filtro de bots + gate humano + auto-exclusión ARDE (geo Rionegro/Llanogrande, bypass ?test=1).
   Apertura → ntfy + email info@ardeagency.com; al ocultar la pestaña → tiempo activo. */
(function(){
  try{
    var path=location.pathname.replace(/\/+$/,'')||'/';
    if(['/','/login','/signin','/demo'].indexOf(path)===-1) return;
    var ARDE_SELF=false;try{fetch('https://ipapi.co/json/').then(function(r){return r.json();}).then(function(d){if(/rionegro|llanogrande/i.test((d.city||'')+' '+(d.region||''))&&!/[?&]test=1/i.test(location.search))ARDE_SELF=true;}).catch(function(){});}catch(e){}
    var TOPIC='https://ntfy.sh/arde-cotizaciones-7k2pqz9x';
    var LABEL='Login Consola AISC', KEY='aisclogin';
    var ua=navigator.userAgent||'';
    var isBot = navigator.webdriver===true
      || /bot\b|crawl|spider|slurp|bingbot|yandex|baidu|duckduckbot|headless|phantom|puppeteer|playwright|python-|curl\/|wget|libwww|httpclient|okhttp|go-http|java\/|facebookexternalhit|embedly|telegrambot|whatsapp|discordbot|slackbot|twitterbot|linkedinbot|googlebot|applebot|lighthouse|pingdom|uptimerobot|datadog|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|ccbot|claudebot|amazonbot|zgrab|censys|shodan|expanse|netcraft|httpx|nmap|masscan|paloalto|internetmeasurement/i.test(ua)||(function(){var m=ua.match(/Chrome\/(\d+)/);return !!m&&+m[1]<90;})();
    if(isBot) return;
    /* ntfy.sh rechaza publicaciones anonimas con header Email (400) — el correo lo hace un flujo n8n que vigila el topic */
    function post(title,tags,body){if(ARDE_SELF)return; try{ fetch(TOPIC,{method:'POST',keepalive:true,headers:{'Title':title,'Tags':tags},body:body}); }catch(e){ try{navigator.sendBeacon(TOPIC,body);}catch(e2){} } }
    var interacted=false;
    ['scroll','mousemove','touchstart','keydown','pointerdown'].forEach(function(ev){window.addEventListener(ev,function(){interacted=true;},{passive:true});});
    var vis=0,lastV=Date.now();
    function vtick(){ if(document.visibilityState==='visible')vis+=Date.now()-lastV; lastV=Date.now(); }
    setInterval(vtick,1000);
    var openSent=false;
    function maybeOpen(){
      if(openSent)return; vtick();
      if((interacted && vis>=2500) || vis>=9000){
        openSent=true;
        var visits=0;
        try{ visits=parseInt(localStorage.getItem('arde_v_'+KEY)||'0',10)||0;
          if(!sessionStorage.getItem('arde_s_'+KEY)){ sessionStorage.setItem('arde_s_'+KEY,'1'); visits+=1; localStorage.setItem('arde_v_'+KEY,String(visits)); }
        }catch(e){}
        var rep=visits>=2?(' (visita #'+visits+', repetida)'):'';
        function openPing(loc){ post('ARDE - Entraron: '+LABEL,(visits>=2?'fire,eyes':'eyes'),
          'Entraron: '+LABEL+' ['+path+']'+rep+'\n'+loc+'\nLlego desde: '+(document.referrer||'enlace directo')+'\nDispositivo: '+ua.slice(0,90)); }
        fetch('https://ipapi.co/json/').then(function(r){return r.json();}).then(function(d){if(/rionegro|llanogrande/i.test((d.city||'')+' '+(d.region||''))&&!/[?&]test=1/i.test(location.search))ARDE_SELF=true;
          openPing('Ubicacion: '+(d.city||'?')+', '+(d.region||'')+' '+(d.country_name||'?')+' (IP '+(d.ip||'?')+')');
        }).catch(function(){ openPing('Ubicacion: no disponible'); });
      }
    }
    var gi=setInterval(function(){ maybeOpen(); if(openSent)clearInterval(gi); },1000);
    var sentH=false;
    function fmt(ms){var s=Math.round(ms/1000),m=Math.floor(s/60);return m+'m '+(s%60)+'s';}
    function sendH(){ if(sentH)return; sentH=true; vtick(); if(!openSent)return;
      post('ARDE - Sesion login: '+LABEL,'hourglass','Estuvo en '+LABEL+' ['+path+']\nTiempo activo: '+fmt(vis)); }
    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden')sendH(); });
    window.addEventListener('pagehide',sendH);
  }catch(e){}
})();
