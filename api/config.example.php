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

return [
    'host'    => '127.0.0.1',
    'port'    => 3306,
    'nombre'  => 'u810534943_geoquiz',
    'usuario' => 'u810534943_geoquiz',
    'clave'   => 'PON_AQUI_LA_CONTRASENA',
    'sal_ip'  => 'PON_AQUI_UNA_SAL_ALEATORIA',
];
