// GeoQuiz — ranking global. Habla con la API PHP alojada en Hostinger.
//
// El juego se sirve desde dos dominios y la API vive solo en uno, así que la URL
// es absoluta. Desde el propio Hostinger la petición sigue siendo del mismo
// origen; desde GitHub Pages es cruzada y la resuelve el CORS de ranking.php.
// Si algún día cambia el dominio, este es el único sitio donde tocarlo.
const GQ_API='https://mediumturquoise-dugong-529601.hostingersite.com/api/ranking.php';
const GQ_TIMEOUT=8000;

// Nada de esto debe poder tumbar la partida: si la API falla, el juego sigue
// funcionando con el ranking local de siempre.
async function gqFetch(url,opciones){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),GQ_TIMEOUT);
  try{
    const res=await fetch(url,{...opciones,signal:ctrl.signal});
    const cuerpo=await res.json().catch(()=>null);
    if(!res.ok||!cuerpo||!cuerpo.ok){
      return{ok:false,estado:res.status,cuerpo};
    }
    return{ok:true,cuerpo};
  }catch(e){
    return{ok:false,estado:0,error:e&&e.name};
  }finally{
    clearTimeout(t);
  }
}

function cargarRankingGlobal(limite){
  return gqFetch(`${GQ_API}?limit=${limite||50}`,{method:'GET'});
}

function enviarPuntuacionGlobal(datos){
  return gqFetch(GQ_API,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(datos),
  });
}
