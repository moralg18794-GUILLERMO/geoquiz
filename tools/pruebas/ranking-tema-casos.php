<?php
// Casos del ranking por temática de api/ranking.php. Los lanza tools/pruebas/ranking-tema.sh
// (que levanta el servidor y la base). No lo recoge revisar.sh por su cuenta: necesita el
// servidor y las variables que prepara el .sh.
declare(strict_types=1);
if (!getenv('GQ_URL')) {
    echo "Se lanza con: bash tools/pruebas/ranking-tema.sh\n";
    exit(0);
}
$url = (string) getenv('GQ_URL');
$dbf = (string) getenv('GQ_DB');
$bien = 0;
$mal = 0;

function post(array $d): array {
    global $url;
    $r = @file_get_contents($url, false, stream_context_create(['http' => [
        'method' => 'POST', 'header' => "Content-Type: application/json\r\n",
        'content' => json_encode($d), 'ignore_errors' => true,
    ]]));
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $m);
    return [(int) ($m[1] ?? 0), json_decode((string) $r, true) ?: []];
}
function get(string $query): array {
    global $url;
    $r = @file_get_contents("$url?$query", false, stream_context_create(['http' => [
        'method' => 'GET', 'ignore_errors' => true,
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
function db(): PDO { global $dbf; return new PDO("sqlite:$dbf"); }
// El límite es de 20 envíos por hora y por conexión, y aquí se mandan más: se vacía el
// contador entre bloques en vez de esperar una hora de verdad.
function olvidarEnvios(): void { db()->exec('DELETE FROM envios'); }
function filas(string $tabla): int { return (int) db()->query("SELECT COUNT(*) FROM $tabla")->fetchColumn(); }

// Una partida de UNA temática, tal y como la manda el juego (js/menu.js: selectionCode).
function partidaTema(string $nombre, string $tema, int $puntos, string $dif = 'all'): array {
    return post(['nombre' => $nombre, 'puntos' => $puntos, 'pct' => 80, 'modo' => 'solo',
                 'dif' => $dif, 'eje' => 't', 'nsel' => 1, 'ntot' => 9, 'tema' => $tema]);
}

// ── 1. Una partida de una temática va a su ranking, y solo ahí ────────────
[$h, $r] = partidaTema('Magui', 'bat', 4000);
ok('una partida de una temática se guarda', $h === 201 && ($r['ok'] ?? false) === true, $r);
ok('la respuesta dice de qué temática es', ($r['tema'] ?? '') === 'bat', $r);
ok('no se anuncia como partida oficial del ranking general', ($r['oficial'] ?? true) === false, $r);
ok('se anuncia el puesto dentro de la temática', ($r['pos'] ?? null) === 1, $r);
ok('la partida NO entra en la tabla general (no sale dos veces)', filas('partidas') === 0, filas('partidas'));
ok('la partida entra en la tabla de temáticas', filas('partidas_tema') === 1, filas('partidas_tema'));

// ── 2. Lo que NO es una partida de temática sigue su camino de siempre ────
// Dos temáticas a la vez: no hay un ranking al que pertenecer, así que va a "otras".
[$h, $r] = post(['nombre' => 'Gaso', 'puntos' => 3000, 'pct' => 70, 'modo' => 'solo',
                 'dif' => 'all', 'eje' => 't', 'nsel' => 2, 'ntot' => 9]);
ok('con dos temáticas la partida va a la tabla general', $h === 201 && filas('partidas') === 1, $r);
ok('y no se le atribuye ninguna temática', ($r['tema'] ?? '') === '', $r);

// Un código de temática que no existe no revienta el envío: se ignora y la partida se
// guarda igual, porque perder la partida de alguien es peor que guardarla con una etiqueta
// de menos (es el mismo criterio que ya se sigue con la dificultad).
[$h, $r] = partidaTema('Jorge H', 'xxx', 2500);
ok('una temática inventada no rechaza el envío', $h === 201, $r);
ok('y esa partida acaba en la tabla general', filas('partidas') === 2 && filas('partidas_tema') === 1, '');

// Blitz con una temática: el modo no es el oficial, así que tampoco entra.
[$h, $r] = post(['nombre' => 'Nico', 'puntos' => 9000, 'pct' => 90, 'modo' => 'blitz',
                 'dif' => 'all', 'eje' => 't', 'nsel' => 1, 'ntot' => 9, 'tema' => 'bat']);
ok('blitz con una temática no entra en el ranking de la temática', $h === 201 && filas('partidas_tema') === 1, $r);

// Un cliente con el JavaScript viejo en caché no manda `tema`: se comporta como antes.
[$h, $r] = post(['nombre' => 'Viejo', 'puntos' => 1000, 'pct' => 50, 'modo' => 'solo',
                 'dif' => 'all', 'eje' => 't', 'nsel' => 1, 'ntot' => 9]);
ok('un cliente viejo sin `tema` no pierde la partida', $h === 201 && ($r['pos'] ?? null) !== null, $r);

// La partida oficial de siempre (las 13 épocas) sigue siendo oficial.
[$h, $r] = post(['nombre' => 'Magui', 'puntos' => 5000, 'pct' => 85, 'modo' => 'solo',
                 'dif' => 'all', 'eje' => 'e', 'nsel' => 13, 'ntot' => 13]);
ok('la partida oficial por épocas sigue intacta', $h === 201 && ($r['oficial'] ?? false) === true, $r);

olvidarEnvios();

// ── 3. Cada temática es una lista aparte ──────────────────────────────────
// Esto es lo que hay que proteger: tres partidas de Espionaje con muchos más puntos no
// pueden borrar la mejor partida de Batallas de la misma persona. Es el mismo fallo que ya
// se arregló una vez separando las oficiales de las demás, y reaparecería aquí si el
// recorte no mirase la temática.
partidaTema('Magui', 'esp', 9000);
partidaTema('Magui', 'esp', 9100);
partidaTema('Magui', 'esp', 9200);
partidaTema('Magui', 'esp', 9300);
[, $r] = get('tema=bat');
$bat = $r['ranking'] ?? [];
ok('la mejor partida de Batallas sobrevive a cuatro de Espionaje', count($bat) === 1 && ($bat[0]['puntos'] ?? 0) === 4000, $bat);
ok('de cada jugador se guardan 3 partidas por temática, no más',
    (int) db()->query("SELECT COUNT(*) FROM partidas_tema WHERE nombre='Magui' AND tema='esp'")->fetchColumn() === 3, '');

[, $r] = get('tema=esp');
$esp = $r['ranking'] ?? [];
ok('en Espionaje solo sale una fila por jugador, la mejor', count($esp) === 1 && ($esp[0]['puntos'] ?? 0) === 9300, $esp);
ok('la lista de una temática no trae las partidas de otra',
    count(array_filter($esp, static fn($f) => (int) $f['puntos'] === 4000)) === 0, $esp);

olvidarEnvios();

// ── 4. Varios jugadores: orden, puestos y el mismo mote escrito distinto ──
partidaTema('Gaso', 'bat', 6000);
partidaTema('Jorge H', 'bat', 2000);
[, $r] = get('tema=bat');
$bat = $r['ranking'] ?? [];
ok('la tabla va ordenada de más a menos puntos',
    count($bat) === 3 && $bat[0]['nombre'] === 'Gaso' && (int) $bat[2]['puntos'] === 2000, $bat);
ok('los puestos se numeran del 1 en adelante',
    ($bat[0]['pos'] ?? 0) === 1 && ($bat[1]['pos'] ?? 0) === 2 && ($bat[2]['pos'] ?? 0) === 3, $bat);
ok('las filas llevan los datos que pinta la tabla del juego',
    ($bat[0]['modo'] ?? '') === 'solo' && ($bat[0]['eje'] ?? '') === 't' && ($bat[0]['nsel'] ?? 0) === 1
    && ($bat[0]['ntot'] ?? 0) === 9 && isset($bat[0]['dif'], $bat[0]['pct'], $bat[0]['fecha']), $bat[0] ?? []);

// 'magui' y 'Magui' son la misma persona: una fila, y el puesto que se le anuncia tiene
// que ser el de la fila que va a ver, no null.
[$h, $r] = partidaTema('magui', 'bat', 7000);
ok('el mismo mote en minúsculas no crea un segundo jugador', ($r['pos'] ?? null) === 1, $r);
[, $r] = get('tema=bat');
$bat = $r['ranking'] ?? [];
ok('sigue habiendo una fila por jugador', count($bat) === 3, $bat);
ok('y la mejor marca es la nueva', (int) ($bat[0]['puntos'] ?? 0) === 7000, $bat);

olvidarEnvios();

// ── 5. El GET: temáticas inventadas y el resumen de la portada ────────────
[$h, $r] = get('tema=noexiste');
ok('pedir una temática que no existe da error 400', $h === 400 && ($r['error'] ?? '') === 'tema', $r);
[$h, $r] = get('tema=rev');
ok('una temática sin partidas devuelve una lista vacía, no un error',
    $h === 200 && ($r['ranking'] ?? null) === [], $r);

[$h, $r] = get('split=1');
$temas = $r['temas'] ?? [];
ok('el ranking general trae el recuento de jugadores por temática',
    ($temas['bat'] ?? 0) === 3 && ($temas['esp'] ?? 0) === 1, $temas);
ok('las temáticas sin jugar no aparecen en el recuento', !isset($temas['rev']), $temas);
$otras = $r['otras'] ?? [];
$motesOtras = array_column($otras, 'nombre');
ok('las partidas de una temática no aparecen además en "otras partidas"',
    !in_array('Gaso', $motesOtras, true) || count(array_filter($otras, static fn($f) => $f['nombre'] === 'Gaso' && (int) $f['puntos'] === 6000)) === 0, $otras);
ok('en "otras partidas" sí está la de dos temáticas', in_array('Gaso', $motesOtras, true) || in_array('Jorge H', $motesOtras, true), $otras);
$oficiales = array_column($r['ranking'] ?? [], 'nombre');
ok('el ranking oficial por épocas solo tiene a quien jugó las 13 épocas',
    $oficiales === ['Magui'], $oficiales);

echo "  $bien bien, $mal mal\n";
exit($mal > 0 ? 1 : 0);
