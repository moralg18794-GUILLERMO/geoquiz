<?php
// Casos de api/torneo.php sobre REPETIR torneos (abiertos y cerrados). Los lanza
// tools/pruebas/torneo-repeticion.sh, que levanta el servidor y la base. Solo no hacen nada si se
// lanzan a pelo, para que revisar.sh pueda recorrer esta carpeta sin tropezar con ellos.
declare(strict_types=1);
if (!getenv('GQ_URL')) {
    echo "Se lanza con: bash tools/pruebas/torneo-repeticion.sh\n";
    exit(0);
}
$url = (string) getenv('GQ_URL');
$dbf = (string) getenv('GQ_DB');
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
function get(string $q = ''): array { global $url; return llamar('GET', $url . $q); }
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
function cuenta(string $sql, array $par = []): int { $s = db()->prepare($sql); $s->execute($par); return (int) $s->fetchColumn(); }
function hace(int $seg): string { return gmdate('Y-m-d H:i:s', time() + $seg); }

// ── Datos de partida ──────────────────────────────────────────────────────
// Dos torneos de tres preguntas: uno abierto y uno cerrado hace tres días. Más un borrador y uno que
// todavía no ha empezado, que no deben existir para nadie.
$SLUG_A = '2026-11-19-prueba-abierto';
$SLUG_C = '2026-10-12-prueba-cerrado';
$p = db();
$crear = function (string $slug, string $titulo, int $desde, int $hasta, int $borrador) use ($p): int {
    $p->prepare('INSERT INTO torneos (slug, titulo, tema, empieza_en, acaba_en, borrador, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
      ->execute([$slug, $titulo, 'Tema de ' . $titulo, hace($desde), hace($hasta), $borrador, hace(0)]);
    $id = (int) $p->lastInsertId();
    for ($n = 1; $n <= 3; $n++) {
        $p->prepare('INSERT INTO torneo_preguntas (torneo_id, orden, cat, diff, pts, q, opts, ans, hint, exp) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
          ->execute([$id, $n, 'Torneo', 'medio', 200, "Pregunta $n", json_encode(["P$n-buena", "P$n-b", "P$n-c", "P$n-d"]), '', "Explicación $n"]);
    }
    return $id;
};
$idA = $crear($SLUG_A, 'Torneo abierto', -86400, 2 * 86400, 0);
$idC = $crear($SLUG_C, 'Torneo cerrado', -10 * 86400, -3 * 86400, 0);
$crear('2026-11-25-prueba-borrador', 'Borrador', -86400, 86400, 1);
$crear('2026-12-01-prueba-futuro', 'Futuro', 86400, 3 * 86400, 0);
// Dos jugadores de verdad en el cerrado (a mano, como si hubieran jugado en su día).
foreach ([['Ana', 500, 3], ['Beto', 300, 2]] as [$nom, $pts, $cor]) {
    $p->prepare('INSERT INTO torneo_partidas (torneo_id, nombre, puntos, correctas, total, segundos, empezado_en, terminado, ip_hash, creado_en) VALUES (?, ?, ?, ?, 3, 60, ?, 1, ?, ?)')
      ->execute([$idC, $nom, $pts, $cor, hace(-5 * 86400), 'x', hace(-5 * 86400)]);
}

// Juega una partida entera ya empezada. $aciertos dice, pregunta a pregunta, si se acierta o se falla.
// Devuelve la respuesta de la última.
function jugar(string $slug, string $alias, string $token, array $aciertos): array {
    $ult = [];
    foreach ($aciertos as $i => $bueno) {
        $n = $i + 1;
        [$h, $q] = post(['accion' => 'pregunta', 'slug' => $slug, 'nombre' => $alias, 'token' => $token]);
        ok("pregunta $n servida a $alias", $h === 200 && isset($q['opts']), [$h, $q]);
        $buena = array_search("P$n-buena", $q['opts'] ?? [], true);
        $mala = array_search("P$n-b", $q['opts'] ?? [], true);
        [$h, $ult] = post(['accion' => 'responder', 'slug' => $slug, 'nombre' => $alias, 'token' => $token, 'elegida' => $bueno ? $buena : $mala]);
        ok("respuesta $n de $alias", $h === 200, [$h, $ult]);
    }
    return $ult;
}
function empezar(string $slug, string $nombre, bool $repetir = false): array {
    $d = ['accion' => 'empezar', 'slug' => $slug, 'nombre' => $nombre];
    if ($repetir) { $d['repetir'] = true; }
    return post($d);
}
function nombres(array $filas): array { return array_map(fn($f) => $f['nombre'], $filas); }

// ── 1. Qué se ve ──────────────────────────────────────────────────────────
[$h, $r] = get();
ok('sin slug sale el vigente (el abierto)', $h === 200 && ($r['torneo']['slug'] ?? '') === $SLUG_A && ($r['torneo']['estado'] ?? '') === 'activo', $r);
ok('el abierto no trae repeticiones', !isset($r['repeticiones']), $r);

[$h, $r] = get("?slug=$SLUG_C");
ok('?slug= devuelve un torneo cerrado concreto', $h === 200 && ($r['torneo']['slug'] ?? '') === $SLUG_C && ($r['torneo']['estado'] ?? '') === 'cerrado', $r);
ok('el cerrado trae su clasificación de verdad', nombres($r['clasificacion'] ?? []) === ['Ana', 'Beto'], $r['clasificacion'] ?? []);
ok('el cerrado trae la lista de repeticiones, vacía al principio', ($r['repeticiones'] ?? null) === [], $r);
ok('el cerrado dice cuántas preguntas tiene', ($r['torneo']['n_preguntas'] ?? 0) === 3, $r['torneo'] ?? []);
ok('«jugadores» cuenta los de verdad', ($r['torneo']['jugadores'] ?? 0) === 2, $r['torneo'] ?? []);

foreach (['2026-11-25-prueba-borrador', '2026-12-01-prueba-futuro', '2020-01-01-no-existe', '../etc', 'MAYUS'] as $malo) {
    [$h, $r] = get('?slug=' . rawurlencode($malo));
    ok("un torneo borrador, futuro o inexistente no existe para nadie ($malo)", $h === 200 && array_key_exists('torneo', $r) && $r['torneo'] === null, $r);
}

// ── 2. El cerrado NO se puede jugar en serio ──────────────────────────────
[$h, $r] = empezar($SLUG_C, 'Cris');
ok('empezar de verdad un torneo cerrado se rechaza', $h === 409 && ($r['error'] ?? '') === 'cerrado', [$h, $r]);
[$h, $r] = post(['accion' => 'pregunta', 'slug' => $SLUG_C, 'nombre' => 'Ana', 'token' => 'x']);
ok('pedir una pregunta de un cerrado con un nombre de verdad se rechaza', $h === 409 && ($r['error'] ?? '') === 'cerrado', [$h, $r]);
[$h, $r] = post(['accion' => 'responder', 'slug' => $SLUG_C, 'nombre' => 'Ana', 'token' => 'x', 'elegida' => 0]);
ok('responder en un cerrado con un nombre de verdad se rechaza', $h === 409 && ($r['error'] ?? '') === 'cerrado', [$h, $r]);
ok('no se ha creado ninguna fila por el camino', cuenta('SELECT COUNT(*) FROM torneo_partidas WHERE torneo_id = ?', [$idC]) === 2);
[$h, $r] = post(['accion' => 'empezar', 'slug' => 'no-existe-este', 'nombre' => 'Cris', 'repetir' => true]);
ok('empezar un torneo que no existe se rechaza', $h === 409 && ($r['error'] ?? '') === 'otro_torneo', [$h, $r]);

// ── 3. Repetir un cerrado: cualquiera, sin haberlo jugado ─────────────────
[$h, $r] = empezar($SLUG_C, '~p~Cris', true);
ok('un nombre con el prefijo reservado se rechaza', $h === 400, [$h, $r]);
[$h, $r] = empezar($SLUG_C, '~s~Cris', true);
ok('el otro prefijo reservado también', $h === 400, [$h, $r]);

[$h, $r] = empezar($SLUG_C, 'Cris', true);
ok('repetir un cerrado sin haberlo jugado vale', $h === 200 && ($r['practica'] ?? false) === true && ($r['cerrado'] ?? false) === true, [$h, $r]);
ok('la repetición va con el alias interno', ($r['nombre'] ?? '') === '~p~Cris', $r);
$tokC = (string) ($r['token'] ?? '');
[$h, $c] = get("?slug=$SLUG_C");
ok('mientras juega, su alias no sale en la clasificación', nombres($c['clasificacion'] ?? []) === ['Ana', 'Beto'], $c['clasificacion'] ?? []);
ok('mientras juega, tampoco en las repeticiones (no ha terminado)', ($c['repeticiones'] ?? null) === [], $c);

// Primera repetición: acierta solo una (baja).
$fin = jugar($SLUG_C, '~p~Cris', $tokC, [true, false, false]);
ok('la última respuesta cierra la repetición', ($fin['ultima'] ?? false) === true && ($fin['practica'] ?? false) === true, $fin);
$p1 = (int) ($fin['puntos'] ?? 0);
ok('lleva puntos', $p1 > 0, $fin);
ok('dice que es de un torneo cerrado y su mejor marca', ($fin['cerrado'] ?? false) === true && ($fin['mejor'] ?? -1) === $p1 && ($fin['record'] ?? true) === false && ($fin['primera'] ?? false) === true, $fin);
ok('no devuelve «yo» ni puesto en el podio', array_key_exists('yo', $fin) && $fin['yo'] === null && array_key_exists('pos', $fin) && $fin['pos'] === null, $fin);
ok('la clasificación de verdad no cambia', nombres($fin['clasificacion'] ?? []) === ['Ana', 'Beto'], $fin['clasificacion'] ?? []);
ok('trae la lista de repeticiones con ella, sin prefijo', nombres($fin['repeticiones'] ?? []) === ['Cris'] && ($fin['repeticiones'][0]['puntos'] ?? 0) === $p1, $fin['repeticiones'] ?? []);
ok('en la base queda UNA fila de subpartida y ninguna de en curso', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre = '~s~Cris' AND terminado = 1") === 1 && cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre LIKE '~p~%'") === 0);
ok('el podio oficial del cerrado sigue con 2 filas', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE torneo_id = ? AND nombre NOT LIKE '~p~%' AND nombre NOT LIKE '~s~%'", [$idC]) === 2);

[$h, $c] = get("?slug=$SLUG_C");
ok('el cerrado enseña ya la repetición de Cris, aparte', nombres($c['repeticiones'] ?? []) === ['Cris'] && nombres($c['clasificacion'] ?? []) === ['Ana', 'Beto'], $c);
ok('«jugadores» sigue siendo 2', ($c['torneo']['jugadores'] ?? 0) === 2, $c['torneo'] ?? []);

// Segunda repetición, mejor: acierta todas → nuevo récord, la anterior se sustituye.
[$h, $r] = empezar($SLUG_C, 'Cris', true);
ok('se puede repetir otra vez', $h === 200 && ($r['nombre'] ?? '') === '~p~Cris', [$h, $r]);
$fin = jugar($SLUG_C, '~p~Cris', (string) $r['token'], [true, true, true]);
$p2 = (int) ($fin['puntos'] ?? 0);
ok('la segunda es mejor y es récord', $p2 > $p1 && ($fin['record'] ?? false) === true && ($fin['primera'] ?? true) === false && ($fin['mejor'] ?? 0) === $p2, [$p1, $p2, $fin]);
ok('sigue habiendo UNA sola subpartida de Cris, la buena', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre = '~s~Cris'") === 1 && cuenta("SELECT puntos FROM torneo_partidas WHERE nombre = '~s~Cris'") === $p2);

// Tercera, peor: no la sustituye.
[$h, $r] = empezar($SLUG_C, 'Cris', true);
$fin = jugar($SLUG_C, '~p~Cris', (string) $r['token'], [true, false, true]);
ok('una repetición peor no baja la marca', ($fin['record'] ?? true) === false && ($fin['mejor'] ?? 0) === $p2, $fin);
ok('y no deja filas sueltas', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre LIKE '~p~%'") === 0 && cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre = '~s~Cris'") === 1);
ok('nada de respuestas huérfanas de las partidas descartadas', cuenta('SELECT COUNT(*) FROM torneo_respuestas WHERE partida_id NOT IN (SELECT id FROM torneo_partidas)') === 0);

// Alguien que se llama igual que un jugador de verdad no le toca la marca.
[$h, $r] = empezar($SLUG_C, 'Ana', true);
ok('un homónimo de un jugador de verdad puede repetir', $h === 200 && ($r['nombre'] ?? '') === '~p~Ana', [$h, $r]);
$fin = jugar($SLUG_C, '~p~Ana', (string) $r['token'], [true, true, true]);
ok('su repetición se anota aparte', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre = '~s~Ana'") === 1);
ok('y la marca de verdad de Ana sigue intacta (500)', cuenta("SELECT puntos FROM torneo_partidas WHERE torneo_id = ? AND nombre = 'Ana' AND terminado = 1", [$idC]) === 500);
[$h, $c] = get("?slug=$SLUG_C");
ok('el podio sigue Ana, Beto', nombres($c['clasificacion'] ?? []) === ['Ana', 'Beto'], $c['clasificacion'] ?? []);
ok('las repeticiones salen ordenadas por puntos: Cris y Ana', nombres($c['repeticiones'] ?? []) === ['Cris', 'Ana'] || nombres($c['repeticiones'] ?? []) === ['Ana', 'Cris'], $c['repeticiones'] ?? []);
$rep = $c['repeticiones'] ?? [];
ok('con la posición y de mayor a menor', ($rep[0]['pos'] ?? 0) === 1 && ($rep[1]['pos'] ?? 0) === 2 && ($rep[0]['puntos'] ?? 0) >= ($rep[1]['puntos'] ?? 0), $rep);

// Una repetición a medias que se abandona no estorba ni sale, y se puede volver a empezar.
[$h, $r] = empezar($SLUG_C, 'Dora', true);
[$h2, $q] = post(['accion' => 'pregunta', 'slug' => $SLUG_C, 'nombre' => '~p~Dora', 'token' => (string) $r['token']]);
ok('una repetición abandonada a medias no sale en ninguna lista', !in_array('Dora', nombres(get("?slug=$SLUG_C")[1]['repeticiones'] ?? []), true));
[$h, $r] = empezar($SLUG_C, 'Dora', true);
ok('y se puede empezar de nuevo (la anterior se descarta)', $h === 200 && cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre = '~p~Dora'") === 1, [$h, $r]);

// Un testigo ajeno no sirve para jugar la repetición de otro.
[$h, $r] = post(['accion' => 'pregunta', 'slug' => $SLUG_C, 'nombre' => '~p~Dora', 'token' => 'ajeno']);
ok('sin el testigo de la repetición no se sirven preguntas', $h === 403, [$h, $r]);

// ── 4. El torneo ABIERTO: lo de siempre, más repetir lo ya jugado ─────────
[$h, $r] = empezar($SLUG_A, 'Eva', true);
ok('en un abierto no se puede repetir lo que no se ha jugado', $h === 409 && ($r['error'] ?? '') === 'no_jugado', [$h, $r]);
ok('y no se crea ninguna fila por intentarlo', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE torneo_id = ?", [$idA]) === 0);

[$h, $r] = empezar($SLUG_A, 'Eva');
ok('jugar en serio un abierto funciona como siempre', $h === 200 && ($r['practica'] ?? false) === false && ($r['nombre'] ?? '') === 'Eva', [$h, $r]);
$tokEva = (string) $r['token'];
$fin = jugar($SLUG_A, 'Eva', $tokEva, [true, true, false]);
ok('y puntúa: sale en la clasificación en 1.º', ($fin['pos'] ?? 0) === 1 && nombres($fin['clasificacion'] ?? []) === ['Eva'], $fin);

[$h, $r] = empezar($SLUG_A, 'Eva');
ok('volver a empezar en serio sigue dando «ya jugado» y permite repetir', $h === 409 && ($r['error'] ?? '') === 'ya_jugado' && ($r['puede_repetir'] ?? false) === true, [$h, $r]);

[$h, $r] = empezar($SLUG_A, 'Eva', true);
ok('quien ya lo jugó sí puede repetir un abierto', $h === 200 && ($r['practica'] ?? false) === true && ($r['cerrado'] ?? true) === false && ($r['nombre'] ?? '') === '~p~Eva', [$h, $r]);
$fin = jugar($SLUG_A, '~p~Eva', (string) $r['token'], [true, true, true]);
ok('la práctica de un abierto no deja huella (ni lista ni «mejor»)', !isset($fin['mejor']) && !isset($fin['repeticiones']) && array_key_exists('yo', $fin) && $fin['yo'] === null, $fin);
ok('se borra del todo al terminar', cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre LIKE '~p~%' AND torneo_id = ?", [$idA]) === 0 && cuenta("SELECT COUNT(*) FROM torneo_partidas WHERE nombre LIKE '~s~%' AND torneo_id = ?", [$idA]) === 0);
[$h, $c] = get();
ok('la marca de Eva en el abierto no cambió', nombres($c['clasificacion'] ?? []) === ['Eva'] && ($c['clasificacion'][0]['correctas'] ?? 0) === 2, $c['clasificacion'] ?? []);
ok('el abierto sigue sin repeticiones y con 1 jugador', !isset($c['repeticiones']) && ($c['torneo']['jugadores'] ?? 0) === 1, $c);

// ── 4b. La lista de torneos publicados (para jugar los anteriores) ────────
[$h, $r] = get('?lista=1');
$lis = $r['torneos'] ?? [];
ok('?lista=1 responde con los torneos publicados, del más reciente al más antiguo', $h === 200 && array_column($lis, 'slug') === [$SLUG_A, $SLUG_C], $lis);
ok('no salen el borrador ni el que aún no ha empezado', !in_array('2026-11-25-prueba-borrador', array_column($lis, 'slug'), true) && !in_array('2026-12-01-prueba-futuro', array_column($lis, 'slug'), true), $lis);
ok('cada uno dice si está abierto o cerrado', ($lis[0]['estado'] ?? '') === 'activo' && ($lis[1]['estado'] ?? '') === 'cerrado', $lis);
ok('con su número, de más antiguo a más reciente (el cerrado es el 1.º y el abierto el 2.º)', ($lis[1]['numero'] ?? 0) === 1 && ($lis[0]['numero'] ?? 0) === 2, $lis);
ok('y el número de preguntas', ($lis[0]['n_preguntas'] ?? 0) === 3 && ($lis[1]['n_preguntas'] ?? 0) === 3, $lis);
ok('«jugadores» cuenta solo los que terminaron de verdad, sin repeticiones (cerrado: Ana y Beto; abierto: Eva)', ($lis[1]['jugadores'] ?? -1) === 2 && ($lis[0]['jugadores'] ?? -1) === 1, $lis);
ok('la lista no lleva preguntas ni respuestas', strpos(json_encode($lis), 'P1-buena') === false && !isset($lis[0]['preguntas']), $lis);
ok('las fechas salen en ISO', preg_match('/^\d{4}-\d{2}-\d{2}T/', (string) ($lis[0]['empieza_en'] ?? '')) === 1, $lis);

// ── 5. Un cliente viejo (sin slug de torneo cerrado) no cuela nada ────────
[$h, $r] = post(['accion' => 'empezar', 'nombre' => 'Fran']);
ok('un envío sin slug se rechaza', $h === 409, [$h, $r]);
[$h, $r] = post(['accion' => 'empezar', 'slug' => $SLUG_C, 'nombre' => 'Fran', 'repetir' => 'true']);
ok('«repetir» tiene que ser un verdadero, no un texto', $h === 409 && ($r['error'] ?? '') === 'cerrado', [$h, $r]);

echo "  $bien bien, $mal mal\n";
exit($mal === 0 ? 0 : 1);
