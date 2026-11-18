<?php
// Casos de api/duelo.php sobre RETOS ABIERTOS: lista pública, presencia del creador, caducidad,
// cancelar y unirse desde la lista. Los lanza tools/pruebas/duelo-abiertos.sh, que levanta el
// servidor y la base. Lanzados a pelo no hacen nada, para que revisar.sh pueda recorrer esta
// carpeta sin tropezar con ellos.
declare(strict_types=1);
if (!getenv('GQ_URL')) {
    echo "Se lanza con: bash tools/pruebas/duelo-abiertos.sh\n";
    exit(0);
}
$url = (string) getenv('GQ_URL');
$dbf = (string) getenv('GQ_DB');
$banco = json_decode((string) file_get_contents((string) getenv('GQ_BANCO')), true);
$CAT = (string) $banco[0]['cat'];
$bien = 0;
$mal = 0;

function llamar(string $metodo, string $dir, ?array $cuerpo = null): array {
    $op = ['method' => $metodo, 'ignore_errors' => true];
    if ($cuerpo !== null) {
        $op['header'] = "Content-Type: application/json\r\n";
        $op['content'] = json_encode($cuerpo);
    }
    $r = @file_get_contents($dir, false, stream_context_create(['http' => $op]));
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $m);
    return [(int) ($m[1] ?? 0), json_decode((string) $r, true) ?: []];
}
function post(array $d): array { global $url; return llamar('POST', $url, $d); }
function get(string $q): array { global $url; return llamar('GET', $url . $q); }
function ok(string $que, bool $cond, $extra = ''): void {
    global $bien, $mal;
    if ($cond) { $bien++; return; }
    $mal++;
    echo "  FALLA: $que " . (is_string($extra) ? $extra : json_encode($extra, JSON_UNESCAPED_UNICODE)) . "\n";
}
function db(): PDO {
    global $dbf;
    $p = new PDO("sqlite:$dbf");
    $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $p;
}
function hace(int $seg): string { return gmdate('Y-m-d H:i:s', time() - $seg); }
function estado(string $codigo): string {
    $s = db()->prepare('SELECT estado FROM duelos WHERE codigo = ?');
    $s->execute([$codigo]);
    return (string) $s->fetchColumn();
}
function envejecer(string $codigo, string $col, int $seg): void {
    db()->prepare("UPDATE duelos SET $col = ? WHERE codigo = ?")->execute([hace($seg), $codigo]);
}
function nombres_abiertos(string $para = ''): array {
    [, $r] = get('?abiertos=1' . ($para !== '' ? '&nombre=' . rawurlencode($para) : ''));
    return array_map(fn($x) => $x['j1_nombre'], $r['abiertos'] ?? []);
}
function crear(string $nombre, bool|string $abierto = false): array {
    global $CAT;
    $c = ['accion' => 'crear', 'nombre' => $nombre, 'cats' => [$CAT], 'dif' => 'all'];
    if ($abierto !== false) { $c['abierto'] = $abierto; }
    return post($c);
}

// ── 1. Un duelo por enlace no sale en la lista; uno abierto sí ────────────
[$h, $r] = crear('Ana');
ok('crear sin abierto → 201', $h === 201 && ($r['abierto'] ?? null) === false, [$h, $r]);
$privado = $r['codigo'] ?? '';
ok('la lista está vacía si solo hay duelos por enlace', nombres_abiertos() === [], nombres_abiertos());

[$h, $r] = crear('Beto', true);
ok('crear con abierto:true → 201 y abierto:true', $h === 201 && ($r['abierto'] ?? null) === true, [$h, $r]);
$abBeto = $r['codigo'] ?? '';
ok('el reto de Beto sale en la lista', nombres_abiertos() === ['Beto'], nombres_abiertos());
ok('y el de Ana, que va por enlace, no', !in_array('Ana', nombres_abiertos(), true));

[$h, $r] = get('?abiertos=1');
$f = $r['abiertos'][0] ?? [];
ok('cada reto trae código, nombre, épocas, dificultad y antigüedad',
    ($f['codigo'] ?? '') === $abBeto && ($f['cats'] ?? []) === [$CAT] && ($f['dif'] ?? '') === 'all' && is_int($f['hace'] ?? null), $f);

ok('quien tiene un reto no lo ve en SU lista (no puede retarse a sí mismo)', nombres_abiertos('Beto') === [], nombres_abiertos('Beto'));
ok('el filtro de nombre no distingue mayúsculas', nombres_abiertos('beto') === [], nombres_abiertos('beto'));
ok('los demás sí lo ven', nombres_abiertos('Cris') === ['Beto'], nombres_abiertos('Cris'));

[$h, $r] = crear('Dani', 'true');
ok('abierto:"true" (texto) no abre el reto: solo vale el booleano', $h === 201 && ($r['abierto'] ?? null) === false, [$h, $r]);
ok('…y no sale en la lista', !in_array('Dani', nombres_abiertos(), true));

// ── 2. Presencia: sin creador conectado, el reto desaparece de la lista ───
envejecer($abBeto, 'ultimo_movimiento_en', 60);
ok('a los 60 s sin sondeo del creador, el reto sale de la lista', nombres_abiertos() === [], nombres_abiertos());
get("?codigo=$abBeto");
ok('un sondeo SIN nombre no cuenta como presencia', nombres_abiertos() === [], nombres_abiertos());
get("?codigo=$abBeto&nombre=Cris");
ok('un sondeo de otra persona tampoco', nombres_abiertos() === [], nombres_abiertos());
get("?codigo=$abBeto&nombre=beto");
ok('el sondeo del creador (aunque escriba su nombre en minúscula) lo devuelve a la lista', nombres_abiertos() === ['Beto'], nombres_abiertos());

// ── 3. Unirse desde la lista ──────────────────────────────────────────────
[$h, $r] = post(['accion' => 'unirse', 'codigo' => $abBeto, 'nombre' => 'Cris']);
ok('Cris se une al reto de Beto', $h === 200 && ($r['duelo']['estado'] ?? '') === 'jugando' && ($r['duelo']['mi_lado'] ?? 0) === 2, [$h, $r]);
ok('el reto ya no está en la lista (ha empezado)', nombres_abiertos() === [], nombres_abiertos());
[$h, $r] = post(['accion' => 'unirse', 'codigo' => $abBeto, 'nombre' => 'Eva']);
ok('una tercera persona recibe duelo_lleno', $h === 409 && ($r['error'] ?? '') === 'duelo_lleno', [$h, $r]);

// ── 4. Cancelar ───────────────────────────────────────────────────────────
[$h, $r] = post(['accion' => 'cancelar', 'codigo' => $abBeto, 'nombre' => 'Cris']);
ok('el rival no puede cancelar el duelo del creador', $h === 403 && ($r['error'] ?? '') === 'no_eres_creador', [$h, $r]);
[$h, $r] = post(['accion' => 'cancelar', 'codigo' => $abBeto, 'nombre' => 'Beto']);
ok('cancelar un duelo ya empezado no lo toca (y no es un error)', $h === 200 && ($r['duelo']['estado'] ?? '') === 'jugando' && estado($abBeto) === 'jugando', [$h, $r]);

[$h, $r] = crear('Fran', true);
$abFran = $r['codigo'] ?? '';
[$h, $r] = post(['accion' => 'cancelar', 'codigo' => $abFran, 'nombre' => 'Gema']);
ok('un desconocido no puede cancelar el reto de otro', $h === 403 && ($r['error'] ?? '') === 'no_eres_jugador', [$h, $r]);
ok('…y el reto sigue en la lista', in_array('Fran', nombres_abiertos(), true));
[$h, $r] = post(['accion' => 'cancelar', 'codigo' => $abFran, 'nombre' => 'fran']);
ok('el creador cancela su reto (nombre en minúscula)', $h === 200 && ($r['duelo']['estado'] ?? '') === 'cancelado' && estado($abFran) === 'cancelado', [$h, $r]);
ok('un reto cancelado desaparece de la lista', !in_array('Fran', nombres_abiertos(), true));
[$h, $r] = post(['accion' => 'cancelar', 'codigo' => $abFran, 'nombre' => 'Fran']);
ok('cancelar otra vez es inofensivo', $h === 200 && estado($abFran) === 'cancelado', [$h, $r]);
[$h, $r] = post(['accion' => 'unirse', 'codigo' => $abFran, 'nombre' => 'Gema']);
ok('unirse a un reto cancelado da un error claro (cancelado)', $h === 409 && ($r['error'] ?? '') === 'cancelado', [$h, $r]);
[$h, $r] = get("?codigo=$abFran&nombre=Fran");
ok('el sondeo del creador ve el estado cancelado', ($r['duelo']['estado'] ?? '') === 'cancelado', $r);

// ── 5. Caducidad: 15 minutos sin rival ────────────────────────────────────
[$h, $r] = crear('Hugo', true);
$abHugo = $r['codigo'] ?? '';
envejecer($abHugo, 'creado_en', 14 * 60);
ok('a los 14 min el reto sigue abierto', in_array('Hugo', nombres_abiertos(), true));
envejecer($abHugo, 'creado_en', 16 * 60);
ok('a los 16 min ya no sale en la lista', !in_array('Hugo', nombres_abiertos(), true));
ok('…y queda cancelado en la base', estado($abHugo) === 'cancelado', estado($abHugo));

[$h, $r] = crear('Iris', true);
$abIris = $r['codigo'] ?? '';
envejecer($abIris, 'creado_en', 16 * 60);
[$h, $r] = get("?codigo=$abIris&nombre=Iris");
ok('el sondeo del propio creador también ve que ha caducado', ($r['duelo']['estado'] ?? '') === 'cancelado', $r);
[$h, $r] = post(['accion' => 'unirse', 'codigo' => $abIris, 'nombre' => 'Hugo']);
ok('y no se puede entrar en un reto caducado', $h === 409 && ($r['error'] ?? '') === 'cancelado', [$h, $r]);

// El duelo por enlace de Ana lleva «esperando» desde el principio: no caduca nunca.
envejecer($privado, 'creado_en', 3 * 3600);
[$h, $r] = get("?codigo=$privado&nombre=Ana");
ok('un duelo por enlace no caduca aunque lleve horas esperando', ($r['duelo']['estado'] ?? '') === 'esperando', $r);
[$h, $r] = post(['accion' => 'unirse', 'codigo' => $privado, 'nombre' => 'Hugo']);
ok('y se puede entrar con su enlace como siempre', $h === 200 && ($r['duelo']['estado'] ?? '') === 'jugando', [$h, $r]);

// ── 6. Un reto nuevo sustituye al anterior del mismo jugador ──────────────
[$h, $r] = crear('Jaime', true);
$ab1 = $r['codigo'] ?? '';
[$h, $r] = crear('Jaime', false);
$prJaime = $r['codigo'] ?? '';
[$h, $r] = crear('Jaime', true);
$ab2 = $r['codigo'] ?? '';
ok('abrir un segundo reto cancela el primero (nada de retos fantasma)', estado($ab1) === 'cancelado' && estado($ab2) === 'esperando', [estado($ab1), estado($ab2)]);
ok('…y solo queda uno en la lista', array_count_values(nombres_abiertos())['Jaime'] === 1, nombres_abiertos());
ok('pero el duelo por enlace del mismo jugador no se toca', estado($prJaime) === 'esperando', estado($prJaime));

// ── 7. Lo de siempre sigue funcionando ────────────────────────────────────
[$h, $r] = get('?ranking=1');
ok('la clasificación de duelos responde y no cuenta retos cancelados ni en espera', $h === 200 && ($r['clasificacion'] ?? null) === [], [$h, $r]);
[$h, $r] = get('?abiertos=1&nombre=' . rawurlencode(str_repeat('x', 200)));
ok('un nombre larguísimo en la lista no rompe nada', $h === 200, [$h, $r]);

echo "\n";
if ($mal > 0) {
    echo "FALLO · $bien bien, $mal mal\n";
    exit(1);
}
echo "BIEN · $bien comprobaciones\n";
exit(0);
