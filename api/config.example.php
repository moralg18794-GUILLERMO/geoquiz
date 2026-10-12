<?php
// Plantilla de api/config.php.
//
// El archivo real NO está en el repositorio (lo excluye .gitignore): vive solo en
// el servidor, dentro de public_html/api/, y el .htaccess de esa carpeta impide
// servirlo. Para recrearlo, copia este archivo como config.php y rellena los
// valores desde hPanel → Bases de datos.
//
// La sal se usa para hashear la IP de quien envía una puntuación: sirve para
// limitar envíos sin guardar la IP en claro. Genera una nueva con:
//   openssl rand -hex 32
//
// token_admin es la contraseña para publicar torneos (api/torneo-admin.php). Es lo
// único que separa a cualquiera de poder cambiar el torneo de la semana, así que
// genérala igual de larga y no la pegues nunca en el navegador ni en un mensaje.

return [
    'host'    => '127.0.0.1',
    'port'    => 3306,
    'nombre'  => 'TU_USUARIO_NOMBRE_BD',
    'usuario' => 'TU_USUARIO_BD',
    'clave'   => 'PON_AQUI_LA_CONTRASENA',
    'sal_ip'  => 'PON_AQUI_UNA_SAL_ALEATORIA',
    'token_admin' => 'PON_AQUI_OTRO_VALOR_ALEATORIO',
];
