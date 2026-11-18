<?php
// Casos de api/cuenta.php. Los lanza tools/pruebas/cuenta.sh (que levanta el servidor y la base).
// No lo recoge revisar.sh por su cuenta: necesita el servidor y las variables que prepara el .sh.
declare(strict_types=1);
if (!getenv('GQ_URL')) {
    echo "Se lanza con: bash tools/pruebas/cuenta.sh\n";
    exit(0);
}
$url = (string) getenv('GQ_URL');
$correos = (string) getenv('GQ_CORREOS');
$dbf = (string) getenv('GQ_DB');
$bien = 0;
$mal = 0;

function post(array $d): array {
    global $url;
    $r = @file_get_contents($url, false, stream_context_create(['http' => [
        'method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => json_encode($d), 'ignore_errors' => true,
    ]]));
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $m);
    return [(int) ($m[1] ?? 0), json_decode((string) $r, true) ?: []];
}
function ok(string $que, bool $cond, $extra = ''): void {
    global $bien, $mal;
    if ($cond) { $bien++; return; }
    $mal++;
    echo "  FALLA: $que " . (is_string($extra) ? $extra : json_encode($extra)) . "\n";
}
function ultimoCodigo(string $para): ?string {
    global $correos;
    if (!is_file($correos)) return null;
    $ult = null;
    foreach (file($correos, FILE_IGNORE_NEW_LINES) as $l) {
        $j = json_decode($l, true);
        if ($j && $j['para'] === $para && preg_match('/Tu código de GeoQuiz: (\d{6})/', $j['asunto'], $m)) $ult = $m[1];
    }
    return $ult;
}
function db(): PDO { global $dbf; return new PDO("sqlite:$dbf"); }
// Salta el minuto de espera y los límites por hora (los códigos pasan a tener 2 horas), sin esperar de verdad.
function olvidarEspera(): void { db()->exec("UPDATE cuenta_codigos SET creado_en = '" . gmdate('Y-m-d H:i:s', time() - 7200) . "'"); }

// 1. Validaciones de entrada
[$h, $r] = post(['accion' => 'alta', 'nombre' => 'Ana', 'email' => 'no-es-correo', 'mayor' => true]);
ok('un correo mal escrito se rechaza', $h === 400 && ($r['error'] ?? '') === 'email', $r);
[$h, $r] = post(['accion' => 'alta', 'nombre' => 'Ana', 'email' => 'ana@prueba.es']);
ok('sin confirmar los 14 años se rechaza', $h === 400 && ($r['error'] ?? '') === 'mayor', $r);
[$h, $r] = post(['accion' => 'alta', 'nombre' => '   ', 'email' => 'ana@prueba.es', 'mayor' => true]);
ok('un nombre vacío se rechaza', $h === 400 && ($r['error'] ?? '') === 'nombre', $r);
[$h, $r] = post(['accion' => 'alta', 'nombre' => 'Weedllermo', 'email' => 'ana@prueba.es', 'mayor' => true]);
ok('un nombre reservado de autor se rechaza', $h === 409, $r);
[$h, $r] = post(['accion' => 'cosa']);
ok('una acción desconocida da error', $h === 401 || $h === 400, $r);

// 2. Alta: el código llega por correo y la cuenta solo existe tras verificarlo
[$h, $r] = post(['accion' => 'alta', 'nombre' => 'Ana', 'email' => 'ana@prueba.es', 'mayor' => true]);
ok('el alta responde bien', $h === 200 && ($r['ok'] ?? false), $r);
ok('antes de verificar NO hay cuenta', (int) db()->query('SELECT COUNT(*) FROM cuentas')->fetchColumn() === 0);
$c = ultimoCodigo('ana@prueba.es');
ok('llega un correo con un código de seis cifras', $c !== null);
ok('el código no se guarda en claro', (int) db()->query("SELECT COUNT(*) FROM cuenta_codigos WHERE codigo_hash = '$c'")->fetchColumn() === 0);

[$h, $r] = post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => $c === '000000' ? '111111' : '000000']);
ok('un código incorrecto se rechaza', $h === 400 && ($r['error'] ?? '') === 'codigo', $r);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => $c]);
ok('el código bueno abre sesión', $h === 200 && strlen($r['sesion'] ?? '') === 64 && ($r['nombre'] ?? '') === 'Ana', $r);
$sesion = $r['sesion'] ?? '';
ok('ahora sí existe la cuenta', (int) db()->query('SELECT COUNT(*) FROM cuentas')->fetchColumn() === 1);
ok('el testigo de sesión no se guarda en claro', (int) db()->query("SELECT COUNT(*) FROM cuenta_sesiones WHERE token_hash = '$sesion'")->fetchColumn() === 0);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => $c]);
ok('el código no se puede usar dos veces', $h === 400, $r);

// 3. Nombre único (sin distinguir mayúsculas)
olvidarEspera();
[$h, $r] = post(['accion' => 'alta', 'nombre' => 'ANA', 'email' => 'otra@prueba.es', 'mayor' => true]);
ok('el nombre repetido (en mayúsculas) se rechaza', $h === 409 && ($r['error'] ?? '') === 'nombre_ocupado', $r);

// 4. Perfil e historial
[$h, $r] = post(['accion' => 'perfil', 'sesion' => $sesion]);
ok('el perfil devuelve el nombre y aún no hay historial', $h === 200 && ($r['nombre'] ?? '') === 'Ana' && array_key_exists('stats', $r) && $r['stats'] === null, $r);
[$h, $r] = post(['accion' => 'guardar', 'sesion' => $sesion, 'stats' => ['v' => 2, 'dispositivos' => ['d1' => ['partidas' => 7]]]]);
ok('se guarda el historial', $h === 200, $r);
[$h, $r] = post(['accion' => 'perfil', 'sesion' => $sesion]);
ok('y se recupera igual', ($r['stats']['dispositivos']['d1']['partidas'] ?? 0) === 7, $r);
[$h, $r] = post(['accion' => 'guardar', 'sesion' => $sesion, 'stats' => 'no soy un objeto']);
ok('un historial que no es un objeto se rechaza', $h === 400, $r);
[$h, $r] = post(['accion' => 'guardar', 'sesion' => $sesion, 'stats' => ['x' => str_repeat('a', 70000)]]);
ok('un historial gigante se rechaza', $h === 413 || $h === 400, $r);
[$h, $r] = post(['accion' => 'perfil', 'sesion' => str_repeat('a', 64)]);
ok('una sesión inventada da 401', $h === 401, $r);
[$h, $r] = post(['accion' => 'perfil']);
ok('sin sesión da 401', $h === 401, $r);

// 5. Entrar desde otro dispositivo, sin poder averiguar quién tiene cuenta
olvidarEspera();
[$h, $r] = post(['accion' => 'entrar', 'email' => 'ana@prueba.es']);
ok('entrar con un correo que tiene cuenta responde bien', $h === 200 && ($r['ok'] ?? false), $r);
$c2 = ultimoCodigo('ana@prueba.es');
$lineas = count(file($correos));
olvidarEspera();
[$h2, $r2] = post(['accion' => 'entrar', 'email' => 'nadie@prueba.es']);
ok('entrar con un correo SIN cuenta responde exactamente igual', $h2 === $h && $r2 === $r, [$h2, $r2]);
ok('y no manda ningún correo', count(file($correos)) === $lineas);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => $c2]);
ok('el código de «entrar» abre otra sesión de la misma cuenta, con su historial', $h === 200 && ($r['nombre'] ?? '') === 'Ana' && ($r['stats']['dispositivos']['d1']['partidas'] ?? 0) === 7, $r);
$sesion2 = $r['sesion'] ?? '';
ok('son dos sesiones distintas', $sesion2 !== '' && $sesion2 !== $sesion);

// 6. Alta con un correo que ya tiene cuenta: no crea otra, entra en la existente
olvidarEspera();
[$h, $r] = post(['accion' => 'alta', 'nombre' => 'Intrusa', 'email' => 'ana@prueba.es', 'mayor' => true]);
ok('el alta sobre un correo existente responde igual', $h === 200, $r);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => ultimoCodigo('ana@prueba.es')]);
ok('entra en la cuenta existente, no crea otra', ($r['nombre'] ?? '') === 'Ana' && (int) db()->query('SELECT COUNT(*) FROM cuentas')->fetchColumn() === 1, $r);

// 7. Cinco intentos y se bloquea; un minuto entre códigos
olvidarEspera();
post(['accion' => 'entrar', 'email' => 'ana@prueba.es']);
$buen = ultimoCodigo('ana@prueba.es');
$malo = $buen === '123456' ? '654321' : '123456';
for ($i = 0; $i < 5; $i++) post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => $malo]);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'ana@prueba.es', 'codigo' => $buen]);
ok('tras cinco fallos el código se bloquea aunque el sexto sea el bueno', $h === 429, $r);
$antes = count(file($correos));
post(['accion' => 'entrar', 'email' => 'ana@prueba.es']);
ok('no se manda un segundo código antes de un minuto', count(file($correos)) === $antes);

// 8. Cambiar nombre, salir, borrar
olvidarEspera();
post(['accion' => 'alta', 'nombre' => 'Berta', 'email' => 'berta@prueba.es', 'mayor' => true]);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'berta@prueba.es', 'codigo' => ultimoCodigo('berta@prueba.es')]);
$sb = $r['sesion'] ?? '';
[$h, $r] = post(['accion' => 'nombre', 'sesion' => $sb, 'nombre' => 'Ana']);
ok('no se puede coger el nombre de otra persona', $h === 409, $r);
[$h, $r] = post(['accion' => 'nombre', 'sesion' => $sb, 'nombre' => 'Berta Gómez']);
ok('se puede cambiar a un nombre libre', $h === 200 && ($r['nombre'] ?? '') === 'Berta Gómez', $r);
post(['accion' => 'salir', 'sesion' => $sb]);
[$h, $r] = post(['accion' => 'perfil', 'sesion' => $sb]);
ok('tras salir la sesión ya no vale', $h === 401, $r);
olvidarEspera();
post(['accion' => 'entrar', 'email' => 'berta@prueba.es']);
[$h, $r] = post(['accion' => 'verificar', 'email' => 'berta@prueba.es', 'codigo' => ultimoCodigo('berta@prueba.es')]);
$sb = $r['sesion'] ?? '';
[$h, $r] = post(['accion' => 'borrar', 'sesion' => $sb]);
ok('borrar la cuenta responde bien', $h === 200, $r);
ok('y no queda nada de ella', (int) db()->query("SELECT COUNT(*) FROM cuentas WHERE email = 'berta@prueba.es'")->fetchColumn() === 0);

echo "\nBIEN · $bien comprobaciones" . ($mal ? " · $mal FALLAN" : '') . "\n";
exit($mal ? 1 : 0);
