<?php
// Casos del torneo de duelos (api/sala.php) y de los partidos de torneo (api/duelo.php): salas, llave
// secreta, llamada «estoy aquí», cuadro con pases directos, avance de ronda, abandono, muerte súbita,
// tope de rondas, organizador de relevo y campeones. Los lanza tools/pruebas/sala.sh, que levanta el
// servidor y la base. Lanzados a pelo no hacen nada, para que revisar.sh pueda recorrer esta carpeta.
//
// Los partidos se juegan de verdad por la API (pedir pregunta, responder), pero como el servidor no
// dice cuál es la correcta hasta después de contestar, la prueba la lee de la base: así puede acertar
// o fallar a voluntad y llevar cada partido al final que quiere comprobar.
declare(strict_types=1);
if (!getenv('GQ_URL')) {
    echo "Se lanza con: bash tools/pruebas/sala.sh\n";
    exit(0);
}
$url_sala = (string) getenv('GQ_URL');
$url_duelo = str_replace('sala.php', 'duelo.php', $url_sala);
$dbf = (string) getenv('GQ_DB');
$banco = json_decode((string) file_get_contents((string) getenv('GQ_BANCO')), true);
$CAT = (string) $banco[0]['cat'];
$bien = 0;
$mal = 0;

function llamar(string $metodo, string $dir, ?array $cuerpo = null, array $cabeceras = []): array {
    $op = ['method' => $metodo, 'ignore_errors' => true];
    $h = '';
    if ($cuerpo !== null) {
        $h .= "Content-Type: application/json\r\n";
        $op['content'] = json_encode($cuerpo);
    }
    foreach ($cabeceras as $k => $v) { $h .= "$k: $v\r\n"; }
    if ($h !== '') { $op['header'] = $h; }
    $r = @file_get_contents($dir, false, stream_context_create(['http' => $op]));
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $m);
    return [(int) ($m[1] ?? 0), json_decode((string) $r, true) ?: []];
}
function S(array $d, array $cab = []): array { global $url_sala; return llamar('POST', $url_sala, $d, $cab); }
function SG(string $q): array { global $url_sala; return llamar('GET', $url_sala . $q); }
function DP(array $d): array { global $url_duelo; return llamar('POST', $url_duelo, $d); }
function DG(string $q): array { global $url_duelo; return llamar('GET', $url_duelo . $q); }
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
function fila(string $sql, array $par = []): ?array { $s = db()->prepare($sql); $s->execute($par); $f = $s->fetch(); return $f === false ? null : $f; }
function valor(string $sql, array $par = []) { $f = fila($sql, $par); return $f === null ? null : array_values($f)[0]; }
function sql(string $sql, array $par = []): void { db()->prepare($sql)->execute($par); }
function hace(int $seg): string { return gmdate('Y-m-d H:i:s', time() - $seg); }

// ── Montaje de salas ──────────────────────────────────────────────────────
// Todas las peticiones salen de la misma IP, y una sala solo admite 3 jugadores por conexión: después
// de apuntar a cada uno se le «cambia la IP» en la base, como si cada uno jugara desde su casa.
function dispersar(string $codigo): void {
    sql("UPDATE sala_jugadores SET ip_hash = 'ip-' || id WHERE sala_id = (SELECT id FROM salas WHERE codigo = ?)", [$codigo]);
}
function armar_sala(string $org, array $otros): array {
    global $CAT;
    sql('DELETE FROM envios');   // el límite de creaciones por hora no es lo que se prueba aquí
    [$h, $r] = S(['accion' => 'crear', 'nombre' => $org, 'cats' => [$CAT], 'dif' => 'all']);
    ok("crear sala de $org", $h === 201 && !empty($r['token']), [$h, $r]);
    $cod = (string) ($r['codigo'] ?? '');
    $tok = [$org => (string) ($r['token'] ?? '')];
    dispersar($cod);
    foreach ($otros as $n) {
        [$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => $n]);
        ok("$n se apunta a la sala de $org", $h === 200 && !empty($r['token']), [$h, $r]);
        $tok[$n] = (string) ($r['token'] ?? '');
        dispersar($cod);
    }
    return [$cod, $tok];
}
function estado(string $cod, string $n, array $tok): array {
    [$h, $r] = S(['accion' => 'estado', 'codigo' => $cod, 'nombre' => $n, 'token' => $tok[$n] ?? '']);
    return [$h, $r];
}
// El organizador lanza la llamada y todos confirman. Devuelve el estado final visto por el organizador.
function arrancar(string $cod, string $org, array $tok): array {
    // Con la sala llena la llamada ya empezó sola: el organizador no tiene nada que pulsar.
    if (sala_fila($cod)['estado'] === 'abierta') {
        [$h, $r] = S(['accion' => 'empezar', 'codigo' => $cod, 'nombre' => $org, 'token' => $tok[$org]]);
        ok('el organizador lanza la llamada', $h === 200 && ($r['sala']['estado'] ?? '') === 'llamando', [$h, $r]);
    }
    foreach ($tok as $n => $t) {

        S(['accion' => 'listo', 'codigo' => $cod, 'nombre' => $n, 'token' => $t]);
    }
    return estado($cod, $org, $tok);
}

// ── Jugar partidos de verdad ──────────────────────────────────────────────
function respuesta_buena(string $cod): int {
    $f = fila('SELECT ans, opciones FROM duelo_respuestas WHERE duelo_id = (SELECT id FROM duelos WHERE codigo = ?) AND respondida_en IS NULL ORDER BY orden DESC LIMIT 1', [$cod]);
    $perm = array_map('intval', explode(',', (string) $f['opciones']));
    return (int) array_search((int) $f['ans'], $perm, true);
}
// Una contestación de $n en el duelo $cod. $bien = acierta o falla a propósito. Devuelve la respuesta del servidor.
function contestar(string $cod, string $n, bool $bien): array {
    [$h, $q] = DP(['accion' => 'pregunta', 'codigo' => $cod, 'nombre' => $n]);
    ok("$n recibe pregunta en $cod", $h === 200, [$h, $q]);
    $buena = respuesta_buena($cod);
    [$h, $r] = DP(['accion' => 'responder', 'codigo' => $cod, 'nombre' => $n, 'elegida' => $bien ? $buena : ($buena + 1) % 4]);
    ok("$n responde en $cod", $h === 200, [$h, $r]);
    return $r;
}
// Una ronda entera: primero J1, luego J2.
function ronda(string $cod, bool $b1, bool $b2): array {
    $d = fila('SELECT j1_nombre, j2_nombre FROM duelos WHERE codigo = ?', [$cod]);
    contestar($cod, (string) $d['j1_nombre'], $b1);
    return contestar($cod, (string) $d['j2_nombre'], $b2);
}
// Lleva el partido a su final: gana quien se diga (acierta siempre; el otro falla siempre).
function jugar_hasta_el_final(string $cod, string $ganador): void {
    $d = fila('SELECT j1_nombre, j2_nombre FROM duelos WHERE codigo = ?', [$cod]);
    $g1 = strcasecmp((string) $d['j1_nombre'], $ganador) === 0;
    for ($i = 0; $i < 10; $i++) {
        $r = ronda($cod, $g1, !$g1);
        if (!empty($r['terminado'])) { return; }
    }
    ok("el partido $cod debería haber terminado", false);
}
// El código del duelo que le toca jugar a $n ahora mismo (o null).
function partido_de(string $cod, string $n, array $tok): ?array {
    [, $r] = estado($cod, $n, $tok);
    return $r['mi']['partido'] ?? null;
}
function sala_fila(string $cod): array { return fila('SELECT * FROM salas WHERE codigo = ?', [$cod]); }

// ══ 1. Crear, apuntarse y la llave secreta ════════════════════════════════
[$cod, $tok] = armar_sala('Ana', []);
$f = sala_fila($cod);
ok('la sala nace abierta, con 8 plazas y 3 vidas por partido', $f['estado'] === 'abierta' && (int) $f['plazas'] === 8 && (int) $f['vidas'] === 3, $f);
ok('la llave es de 32 caracteres', strlen($tok['Ana']) === 32 && ctype_xdigit($tok['Ana']), $tok);
[$h, $r] = estado($cod, 'Ana', $tok);
ok('el creador ve la sala y es el organizador', $h === 200 && ($r['sala']['soy_organizador'] ?? false) === true && count($r['jugadores'] ?? []) === 1, [$h, $r]);

[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'Beto']);
$tokBeto = (string) ($r['token'] ?? '');
ok('Beto se apunta y recibe su llave', $h === 200 && strlen($tokBeto) === 32 && count($r['jugadores'] ?? []) === 2, [$h, $r]);
[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'beto']);
ok('otro que se llama igual (aunque en minúscula) no puede apuntarse', $h === 409 && ($r['error'] ?? '') === 'nombre_ocupado', [$h, $r]);
[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'Beto', 'token' => $tokBeto]);
ok('Beto vuelve a entrar con su llave (recarga) y recupera el estado', $h === 200 && ($r['mi']['nombre'] ?? '') === 'Beto' && count($r['jugadores']) === 2, [$h, $r]);
[$h, $r] = S(['accion' => 'estado', 'codigo' => $cod, 'nombre' => 'Beto', 'token' => str_repeat('0', 32)]);
ok('con una llave que no es la suya no se pasa', $h === 403 && ($r['error'] ?? '') === 'token', [$h, $r]);
[$h, $r] = S(['accion' => 'estado', 'codigo' => $cod, 'nombre' => 'Beto']);
ok('sin llave tampoco', $h === 403 && ($r['error'] ?? '') === 'token', [$h, $r]);
[$h, $r] = S(['accion' => 'estado', 'codigo' => $cod, 'nombre' => 'Zoe', 'token' => $tokBeto]);
ok('quien no está en la sala recibe no_estas', $h === 403 && ($r['error'] ?? '') === 'no_estas', [$h, $r]);
[$h, $r] = S(['accion' => 'estado', 'codigo' => 'ZZZZZZ', 'nombre' => 'Ana', 'token' => $tok['Ana']]);
ok('una sala que no existe da 404', $h === 404, [$h, $r]);

// Tres de la misma conexión caben; el cuarto no (se apunta ya con IPs mezcladas a propósito).
sql("UPDATE sala_jugadores SET ip_hash = 'la-misma' WHERE sala_id = (SELECT id FROM salas WHERE codigo = ?)", [$cod]);
sql("UPDATE sala_jugadores SET ip_hash = 'otra' WHERE sala_id = (SELECT id FROM salas WHERE codigo = ?) AND nombre = 'Beto'", [$cod]);
S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'Cris']);   // misma IP del test
$ipTest = (string) valor("SELECT ip_hash FROM sala_jugadores WHERE nombre = 'Cris' AND sala_id = (SELECT id FROM salas WHERE codigo = ?)", [$cod]);
sql("UPDATE sala_jugadores SET ip_hash = ? WHERE sala_id = (SELECT id FROM salas WHERE codigo = ?) AND nombre IN ('Ana','Beto')", [$ipTest, $cod]);
[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'Dani']);
ok('el 4.º jugador desde una misma conexión recibe misma_conexion', $h === 429 && ($r['error'] ?? '') === 'misma_conexion', [$h, $r]);
dispersar($cod);

// ══ 2. La lista de torneos abiertos ═══════════════════════════════════════
[, $r] = DG('?abiertos=1&nombre=Fulano');
$s = array_values(array_filter($r['salas'] ?? [], fn($x) => $x['codigo'] === $cod))[0] ?? null;
ok('la sala sale en la lista con su organizador y 3 apuntados', $s !== null && $s['organizador'] === 'Ana' && $s['apuntados'] === 3 && $s['plazas'] === 8, $r);
[, $r] = DG('?abiertos=1&nombre=beto');
ok('quien ya está apuntado no la ve en su lista (nombre en minúscula)', count(array_filter($r['salas'] ?? [], fn($x) => $x['codigo'] === $cod)) === 0, $r);
sql("UPDATE salas SET ultima_actividad_en = ? WHERE codigo = ?", [hace(120), $cod]);
[, $r] = DG('?abiertos=1&nombre=Fulano');
ok('sin nadie conectado (2 min) la sala desaparece de la lista', count(array_filter($r['salas'] ?? [], fn($x) => $x['codigo'] === $cod)) === 0, $r);
estado($cod, 'Ana', $tok);
[, $r] = DG('?abiertos=1&nombre=Fulano');
ok('en cuanto alguien sondea, vuelve a la lista', count(array_filter($r['salas'] ?? [], fn($x) => $x['codigo'] === $cod)) === 1, $r);
sql("UPDATE salas SET ultima_actividad_en = ? WHERE codigo = ?", [hace(3 * 3600), $cod]);
DG('?abiertos=1');
ok('una sala abandonada 3 horas se cierra sola', sala_fila($cod)['estado'] === 'cancelada', sala_fila($cod)['estado']);

// ══ 3. Empezar: quién puede, y la llamada ═════════════════════════════════
[$cod, $tok] = armar_sala('Ana', ['Beto', 'Cris']);
[$h, $r] = S(['accion' => 'empezar', 'codigo' => $cod, 'nombre' => 'Beto', 'token' => $tok['Beto']]);
ok('quien no organiza no puede empezar', $h === 403 && ($r['error'] ?? '') === 'no_organizas', [$h, $r]);
[$solo, $tokSolo] = armar_sala('Solo', []);
[$h, $r] = S(['accion' => 'empezar', 'codigo' => $solo, 'nombre' => 'Solo', 'token' => $tokSolo['Solo']]);
ok('con un solo jugador no se puede empezar', $h === 409 && ($r['error'] ?? '') === 'pocos', [$h, $r]);

[$h, $r] = S(['accion' => 'empezar', 'codigo' => $cod, 'nombre' => 'Ana', 'token' => $tok['Ana']]);
ok('el organizador lanza la llamada de 30 s', $h === 200 && $r['sala']['estado'] === 'llamando' && $r['sala']['llamada_restante'] > 0 && $r['sala']['llamada_restante'] <= 30, [$h, $r]);
[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'Dani']);
ok('durante la llamada ya no entra nadie', $h === 409 && ($r['error'] ?? '') === 'cerrada', [$h, $r]);
// Beto confirma, Cris no: pasados 30 s, Cris queda fuera y los otros dos empiezan.
S(['accion' => 'listo', 'codigo' => $cod, 'nombre' => 'Beto', 'token' => $tok['Beto']]);
ok('con uno sin confirmar la llamada sigue abierta', sala_fila($cod)['estado'] === 'llamando', sala_fila($cod)['estado']);
sql('UPDATE salas SET llamada_en = ? WHERE codigo = ?', [hace(40), $cod]);
[$h, $r] = estado($cod, 'Ana', $tok);
ok('vencida la llamada, empieza el torneo con los que confirmaron', $h === 200 && $r['sala']['estado'] === 'jugando' && count($r['jugadores']) === 2, [$h, $r]);
[$h, $r] = estado($cod, 'Cris', $tok);
ok('quien no confirmó recibe no_estas', $h === 403 && ($r['error'] ?? '') === 'no_estas', [$h, $r]);
ok('con 2 jugadores el cuadro es solo la final', (int) valor('SELECT COUNT(*) FROM sala_partidos WHERE sala_id = (SELECT id FROM salas WHERE codigo = ?)', [$cod]) === 1);

// Si tras la llamada no quedan dos, la sala vuelve a esperar (no muere).
[$cod2, $tok2] = armar_sala('Eva', ['Fran']);
S(['accion' => 'empezar', 'codigo' => $cod2, 'nombre' => 'Eva', 'token' => $tok2['Eva']]);
sql('UPDATE salas SET llamada_en = ? WHERE codigo = ?', [hace(40), $cod2]);
[$h, $r] = estado($cod2, 'Eva', $tok2);
ok('si solo confirma el organizador, la sala vuelve a «abierta» con él dentro', $h === 200 && $r['sala']['estado'] === 'abierta' && count($r['jugadores']) === 1, [$h, $r]);

// ══ 4. Un torneo de 4 entero: semifinales, final y campeón ════════════════
[$cod, $tok] = armar_sala('Ana', ['Beto', 'Cris', 'Dani']);
[$h, $r] = arrancar($cod, 'Ana', $tok);
ok('4 jugadores: empieza el torneo con 3 partidos (2 semis y final)', ($r['sala']['estado'] ?? '') === 'jugando' && count($r['cuadro'] ?? []) === 3, $r);
$semis = array_values(array_filter($r['cuadro'], fn($p) => $p['ronda'] === 1));
ok('las dos semifinales tienen a sus dos jugadores y están en juego', count($semis) === 2 && $semis[0]['estado'] === 'jugando' && $semis[1]['estado'] === 'jugando', $semis);
$jugaron = array_merge([$semis[0]['j1'], $semis[0]['j2']], [$semis[1]['j1'], $semis[1]['j2']]);
sort($jugaron);
ok('cada jugador está en una semifinal', $jugaron === ['Ana', 'Beto', 'Cris', 'Dani'], $jugaron);
ok('se han creado 2 duelos, uno por semifinal', (int) valor('SELECT COUNT(*) FROM duelos') >= 2);

// El código del duelo solo lo ve quien juega.
$mp = [];
foreach (['Ana', 'Beto', 'Cris', 'Dani'] as $n) { $mp[$n] = partido_de($cod, $n, $tok); }
ok('cada uno recibe el código de su duelo', !in_array(null, $mp, true) && strlen((string) $mp['Ana']['codigo']) === 6, $mp);
$codsDistintos = array_unique(array_map(fn($x) => $x['codigo'], $mp));
ok('dos duelos distintos, compartidos por parejas', count($codsDistintos) === 2, $mp);
[, $r] = estado($cod, 'Ana', $tok);
ok('el cuadro público NO trae códigos de duelo', strpos(json_encode($r['cuadro']), (string) $mp['Ana']['codigo']) === false, $r['cuadro']);
[, $dr] = DG('?codigo=' . $mp['Ana']['codigo'] . '&nombre=Ana');
ok('un partido de torneo anuncia 3 vidas máximas y que es de una sala', ($dr['duelo']['vidas_max'] ?? 0) === 3 && ($dr['duelo']['en_sala'] ?? false) === true && $dr['duelo']['j1_vidas'] === 3, $dr);

// El sorteo es aleatorio: Ana puede coincidir en semifinal con cualquiera. La prueba no da nada por
// supuesto: Ana gana la suya y gana la otra semifinal alguno de los dos que juegan en ella ($camp).
$codAna = $mp['Ana']['codigo'];
$camp = null;
foreach (['Beto', 'Cris', 'Dani'] as $n) { if ($mp[$n]['codigo'] !== $codAna) { $camp = $n; break; } }
$rivalAna = $mp['Ana']['rival'];
jugar_hasta_el_final($codAna, 'Ana');
[, $r] = estado($cod, 'Dani', $tok);
$semi1 = array_values(array_filter($r['cuadro'], fn($p) => $p['ronda'] === 1 && ($p['j1'] === 'Ana' || $p['j2'] === 'Ana')))[0];
ok('Ana gana su semifinal por juego (no por abandono)', $semi1['ganador'] === 'Ana' && $semi1['motivo'] === 'juego', $semi1);
$final = array_values(array_filter($r['cuadro'], fn($p) => $p['ronda'] === 2))[0];
ok('la final espera a la otra semifinal (Ana ya está en ella, en el hueco que le toca por su semifinal)', (($final['j1'] === 'Ana') xor ($final['j2'] === 'Ana')) && ($final['j1'] === null || $final['j2'] === null) && $final['estado'] === 'pendiente', $final);
ok('el eliminado lo sabe', (function () use ($cod, $rivalAna, $tok) { [, $x] = estado($cod, $rivalAna, $tok); return ($x['mi']['eliminado'] ?? false) === true; })());
ok('y Ana, no', (function () use ($cod, $tok) { [, $x] = estado($cod, 'Ana', $tok); return ($x['mi']['eliminado'] ?? true) === false; })());

jugar_hasta_el_final($mp[$camp]['codigo'], $camp);
[, $r] = estado($cod, $camp, $tok);
$final = array_values(array_filter($r['cuadro'], fn($p) => $p['ronda'] === 2))[0];
ok("terminadas las dos semis, la final ya tiene a Ana y a $camp y su duelo", $final['j1'] !== null && $final['j2'] !== null && $final['estado'] === 'jugando', $final);
$pf = partido_de($cod, 'Ana', $tok);
ok("Ana ve a $camp como rival en la final", $pf !== null && $pf['rival'] === $camp && $pf['ronda'] === 2, $pf);
ok('el eliminado de semis no tiene partido', partido_de($cod, $rivalAna, $tok) === null);

jugar_hasta_el_final($pf['codigo'], $camp);
[, $r] = estado($cod, 'Dani', $tok);
ok("la sala termina con $camp campeón", $r['sala']['estado'] === 'terminada' && $r['sala']['ganador'] === $camp, $r['sala']);
ok('el campeón figura como campeón en la lista de jugadores', count(array_filter($r['jugadores'], fn($j) => $j['campeon'])) === 1);
[, $r2] = estado($cod, $camp, $tok);
ok('y se ve a sí mismo como campeón', ($r2['mi']['campeon'] ?? false) === true, $r2['mi']);
ok('no se crearon más duelos que partidos (los sondeos repetidos no duplican)', (int) valor('SELECT COUNT(*) FROM duelos WHERE codigo IN (SELECT duelo_codigo FROM sala_partidos WHERE sala_id = (SELECT id FROM salas WHERE codigo = ?))', [$cod]) === 3);

[, $r] = SG('?campeones=1');
ok("$camp sale en la lista de campeones con 1 título", ($r['campeones'][0]['nombre'] ?? '') === $camp && ($r['campeones'][0]['ganados'] ?? 0) === 1 && ($r['campeones'][0]['jugados'] ?? 0) === 1, $r);
[, $r] = DG('?ranking=1');
ok('los partidos de torneo NO cuentan en la clasificación de duelos', ($r['clasificacion'] ?? null) === [], $r);

// ══ 5. Un torneo de 2 no es campeonato ════════════════════════════════════
// (el de «Ana y Beto» de arriba quedó a medias; se hace uno nuevo)
[$cod, $tok] = armar_sala('Gema', ['Hugo']);
arrancar($cod, 'Gema', $tok);
$p = partido_de($cod, 'Gema', $tok);
jugar_hasta_el_final($p['codigo'], 'Hugo');
[, $r] = estado($cod, 'Gema', $tok);
ok('con 2 jugadores la sala termina con el ganador del duelo', $r['sala']['estado'] === 'terminada' && $r['sala']['ganador'] === 'Hugo', $r['sala']);
[, $r] = SG('?campeones=1');
ok('…pero Hugo no suma como campeón (un duelo de 2 no es un torneo)', !in_array('Hugo', array_column($r['campeones'] ?? [], 'nombre'), true), $r);

// ══ 6. Pases directos: 3, 5, 6 y 8 jugadores ══════════════════════════════
foreach ([3 => [2, 1, 1], 5 => [4, 2, 1], 6 => [4, 2, 1], 8 => [4, 2, 1]] as $n => $esperado) {
    $nombres = array_slice(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], 1, $n - 1);
    [$cod, $tok] = armar_sala('P1', $nombres);
    [, $r] = arrancar($cod, 'P1', $tok);
    $porRonda = array_count_values(array_column($r['cuadro'], 'ronda'));
    ksort($porRonda);
    $forma = array_values($porRonda);
    $tam = $n <= 2 ? 2 : ($n <= 4 ? 4 : 8);
    ok("$n jugadores: cuadro de " . ($tam) . " plazas (" . implode('-', $esperado) . " partidos por ronda)",
        $forma === ($tam === 4 ? [2, 1] : [4, 2, 1]), $forma);
    $pases = count(array_filter($r['cuadro'], fn($p) => $p['motivo'] === 'pase'));
    ok("$n jugadores: " . ($tam - $n) . " pases directos", $pases === $tam - $n, $r['cuadro']);
    $conDuelo = count(array_filter($r['cuadro'], fn($p) => $p['estado'] === 'jugando'));
    ok("$n jugadores: hay " . intdiv($n - ($tam - $n) * 1, 1) . " duelos en marcha desde el principio", $conDuelo >= 1);
    // Todos están o jugando o con pase directo: nadie se queda fuera del cuadro.
    $enCuadro = [];
    foreach ($r['cuadro'] as $p) { if ($p['ronda'] === 1) { foreach (['j1', 'j2'] as $c) { if ($p[$c] !== null) { $enCuadro[] = $p[$c]; } } } }
    sort($enCuadro);
    $todos = array_merge(['P1'], $nombres); sort($todos);
    ok("$n jugadores: todos aparecen en la primera ronda", $enCuadro === $todos, [$enCuadro, $todos]);
}
// 3 jugadores: el del pase directo llega a la final sin jugar.
[$cod, $tok] = armar_sala('Q1', ['Q2', 'Q3']);
[, $r] = arrancar($cod, 'Q1', $tok);
$pase = array_values(array_filter($r['cuadro'], fn($p) => $p['motivo'] === 'pase'))[0];
$final = array_values(array_filter($r['cuadro'], fn($p) => $p['ronda'] === 2))[0];
ok('el jugador con pase directo ya está en la final, esperando', $final['j1'] === $pase['ganador'] || $final['j2'] === $pase['ganador'], [$pase, $final]);

// 8 jugadores desde cero: la llamada empieza sola al llenarse la sala.
[$cod, $tok] = armar_sala('R1', ['R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
ok('con 7 sigue abierta', sala_fila($cod)['estado'] === 'abierta');
S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'R8']);
ok('al entrar el 8.º, la llamada empieza sola', sala_fila($cod)['estado'] === 'llamando', sala_fila($cod)['estado']);
[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'R9']);
ok('y el 9.º no entra', $h === 409, [$h, $r]);

// ══ 7. Abandono ═══════════════════════════════════════════════════════════
[$cod, $tok] = armar_sala('S1', ['S2', 'S3', 'S4']);
arrancar($cod, 'S1', $tok);
$p = partido_de($cod, 'S1', $tok);
$dd = fila('SELECT j1_nombre, j2_nombre, turno FROM duelos WHERE codigo = ?', [$p['codigo']]);
sql('UPDATE duelos SET ultimo_movimiento_en = ? WHERE codigo = ?', [hace(100), $p['codigo']]);
estado($cod, 'S3', $tok);
ok('a los 100 s sin mover, el partido sigue (el margen es de 2 minutos)', fila('SELECT estado FROM duelos WHERE codigo = ?', [$p['codigo']])['estado'] === 'jugando');
sql('UPDATE duelos SET ultimo_movimiento_en = ? WHERE codigo = ?', [hace(130), $p['codigo']]);
[, $r] = estado($cod, 'S1', $tok);
$part = array_values(array_filter($r['cuadro'], fn($x) => $x['ronda'] === 1 && ($x['j1'] === 'S1' || $x['j2'] === 'S1')))[0];
$esperadoGana = (string) ($dd['turno'] == 1 ? $dd['j2_nombre'] : $dd['j1_nombre']);
ok('pasados 2 min, pierde por abandono el que tenía el turno, y lo cierra el sondeo de la sala', $part['ganador'] === $esperadoGana && $part['motivo'] === 'abandono', [$part, $dd]);

// Un duelo suelto (fuera de sala) conserva sus 5 minutos de margen.
sql('DELETE FROM envios');
[$h, $r] = DP(['accion' => 'crear', 'nombre' => 'Suelto1', 'cats' => [$CAT], 'dif' => 'all']);
$dSuelto = (string) $r['codigo'];
DP(['accion' => 'unirse', 'codigo' => $dSuelto, 'nombre' => 'Suelto2']);
sql('UPDATE duelos SET ultimo_movimiento_en = ? WHERE codigo = ?', [hace(200), $dSuelto]);
[, $r] = DG("?codigo=$dSuelto&nombre=Suelto1");
ok('un duelo suelto NO pierde por abandono a los 200 s (sigue siendo 5 min)', $r['duelo']['estado'] === 'jugando' && $r['duelo']['vidas_max'] === 5 && $r['duelo']['en_sala'] === false, $r);
sql('UPDATE duelos SET ultimo_movimiento_en = ? WHERE codigo = ?', [hace(310), $dSuelto]);
[, $r] = DG("?codigo=$dSuelto&nombre=Suelto1");
ok('…y a los 5 min sí', $r['duelo']['estado'] === 'terminado', $r);

// ══ 8. Muerte súbita: en un cuadro no se empata ═══════════════════════════
[$cod, $tok] = armar_sala('T1', ['T2']);
arrancar($cod, 'T1', $tok);
$p = partido_de($cod, 'T1', $tok);
$dc = $p['codigo'];
for ($i = 1; $i <= 3; $i++) { $r = ronda($dc, false, false); }
$d = fila('SELECT estado, ganador, j1_vidas, j2_vidas, turno FROM duelos WHERE codigo = ?', [$dc]);
ok('los dos se quedan sin vidas a la vez: NO hay empate, sigue en muerte súbita (1 vida cada uno)', $d['estado'] === 'jugando' && (int) $d['j1_vidas'] === 1 && (int) $d['j2_vidas'] === 1 && (int) $d['turno'] === 1 && $d['ganador'] === null, $d);
ok('y el servidor no dice que haya terminado', empty($r['terminado']), $r);
$r = ronda($dc, true, true);
$d = fila('SELECT estado, j1_vidas, j2_vidas FROM duelos WHERE codigo = ?', [$dc]);
ok('si los dos aciertan en la muerte súbita, se sigue', $d['estado'] === 'jugando' && empty($r['terminado']), $d);
$r = ronda($dc, true, false);
$d = fila('SELECT estado, ganador FROM duelos WHERE codigo = ?', [$dc]);
ok('cuando uno acierta y el otro falla, gana el que acierta', $d['estado'] === 'terminado' && (int) $d['ganador'] === 1 && !empty($r['terminado']), $d);

// Lo mismo en un duelo SUELTO sigue acabando en empate de verdad.
[$h, $r] = DP(['accion' => 'crear', 'nombre' => 'Emp1', 'cats' => [$CAT], 'dif' => 'all']);
$dE = (string) $r['codigo'];
DP(['accion' => 'unirse', 'codigo' => $dE, 'nombre' => 'Emp2']);
for ($i = 1; $i <= 5; $i++) { $r = ronda($dE, false, false); }
$d = fila('SELECT estado, ganador FROM duelos WHERE codigo = ?', [$dE]);
ok('un duelo suelto con los dos a 0 vidas sigue acabando en empate (ganador 0)', $d['estado'] === 'terminado' && (int) $d['ganador'] === 0 && !empty($r['terminado']), $d);

// ══ 9. Tope de 15 rondas ══════════════════════════════════════════════════
[$cod, $tok] = armar_sala('U1', ['U2']);
arrancar($cod, 'U1', $tok);
$p = partido_de($cod, 'U1', $tok);
$dc = $p['codigo'];
$j1 = (string) fila('SELECT j1_nombre FROM duelos WHERE codigo = ?', [$dc])['j1_nombre'];
// J1 acierta siempre; J2 falla dos veces (le queda 1 vida) y acierta el resto: tras 15 rondas gana J1 por aciertos.
for ($i = 1; $i <= 15; $i++) {
    $r = ronda($dc, true, !($i === 3 || $i === 7));
    if ($i < 15) { ok("ronda $i: la partida sigue", empty($r['terminado'])); }
}
$d = fila('SELECT estado, ganador, j1_aciertos, j2_aciertos FROM duelos WHERE codigo = ?', [$dc]);
ok('a las 15 rondas, con los dos vivos, gana quien lleva más aciertos', $d['estado'] === 'terminado' && (int) $d['ganador'] === 1 && (int) $d['j1_aciertos'] === 15 && (int) $d['j2_aciertos'] === 13, $d);

[$cod, $tok] = armar_sala('V1', ['V2']);
arrancar($cod, 'V1', $tok);
$dc = partido_de($cod, 'V1', $tok)['codigo'];
for ($i = 1; $i <= 15; $i++) { $r = ronda($dc, true, true); }
$d = fila('SELECT estado, j1_vidas, j2_vidas, ganador FROM duelos WHERE codigo = ?', [$dc]);
ok('a las 15 rondas con los dos igualados no se cierra: muerte súbita con 1 vida cada uno', $d['estado'] === 'jugando' && (int) $d['j1_vidas'] === 1 && (int) $d['j2_vidas'] === 1 && empty($r['terminado']), $d);

// ══ 10. Organizador de relevo, expulsar, salir, cancelar y administrador ══
[$cod, $tok] = armar_sala('W1', ['W2', 'W3']);
sql("UPDATE sala_jugadores SET visto_en = ? WHERE nombre = 'W1' AND sala_id = (SELECT id FROM salas WHERE codigo = ?)", [hace(400), $cod]);
[, $r] = estado($cod, 'W2', $tok);
ok('si el organizador lleva 6 min sin dar señales, organiza el siguiente que sí está (W2)', ($r['sala']['organizador'] ?? '') === 'W2' && ($r['sala']['soy_organizador'] ?? false) === true, $r['sala'] ?? $r);
[$h, $r] = S(['accion' => 'empezar', 'codigo' => $cod, 'nombre' => 'W2', 'token' => $tok['W2']]);
ok('y W2 puede empezar el torneo', $h === 200 && $r['sala']['estado'] === 'llamando', [$h, $r]);

[$cod, $tok] = armar_sala('X1', ['X2', 'X3']);
[$h, $r] = S(['accion' => 'expulsar', 'codigo' => $cod, 'nombre' => 'X2', 'token' => $tok['X2'], 'objetivo' => 'X3']);
ok('quien no organiza no puede echar a nadie', $h === 403, [$h, $r]);
[$h, $r] = S(['accion' => 'expulsar', 'codigo' => $cod, 'nombre' => 'X1', 'token' => $tok['X1'], 'objetivo' => 'x1']);
ok('el organizador no puede echarse a sí mismo', $h === 400 && ($r['error'] ?? '') === 'a_ti_mismo', [$h, $r]);
[$h, $r] = S(['accion' => 'expulsar', 'codigo' => $cod, 'nombre' => 'X1', 'token' => $tok['X1'], 'objetivo' => 'x3']);
ok('el organizador echa a X3 (aunque escriba su nombre en minúscula)', $h === 200 && count($r['jugadores']) === 2, [$h, $r]);
[$h, $r] = estado($cod, 'X3', $tok);
ok('X3 ya no está en la sala', $h === 403 && ($r['error'] ?? '') === 'no_estas', [$h, $r]);
[$h, $r] = S(['accion' => 'salir', 'codigo' => $cod, 'nombre' => 'X1', 'token' => $tok['X1']]);
ok('el organizador sale y el siguiente pasa a organizar', $h === 200 && sala_fila($cod)['organizador'] === 'X2', sala_fila($cod));
[, $r] = estado($cod, 'X2', $tok);
ok('…y X2 es ahora el organizador', ($r['sala']['soy_organizador'] ?? false) === true, $r);
[$h, $r] = S(['accion' => 'salir', 'codigo' => $cod, 'nombre' => 'X2', 'token' => $tok['X2']]);
ok('si sale el último, la sala se cierra', sala_fila($cod)['estado'] === 'cancelada', sala_fila($cod)['estado']);

[$cod, $tok] = armar_sala('Y1', ['Y2']);
[$h, $r] = S(['accion' => 'cancelar', 'codigo' => $cod, 'nombre' => 'Y2', 'token' => $tok['Y2']]);
ok('quien no organiza no puede cancelar', $h === 403, [$h, $r]);
[$h, $r] = S(['accion' => 'cancelar', 'codigo' => $cod, 'nombre' => 'Y1', 'token' => $tok['Y1']]);
ok('el organizador cancela la sala', $h === 200 && sala_fila($cod)['estado'] === 'cancelada', [$h, $r]);
[$h, $r] = S(['accion' => 'unirse', 'codigo' => $cod, 'nombre' => 'Y3']);
ok('a una sala cancelada no se entra', $h === 409 && ($r['error'] ?? '') === 'cerrada', [$h, $r]);

[$cod, $tok] = armar_sala('Z1', ['Z2']);
[$h, $r] = S(['accion' => 'admin_cancelar', 'codigo' => $cod]);
ok('sin la cabecera de administrador, admin_cancelar «no existe» (404)', $h === 404 && sala_fila($cod)['estado'] === 'abierta', [$h, $r]);
[$h, $r] = S(['accion' => 'admin_cancelar', 'codigo' => $cod], ['X-GQ-Admin' => 'token-de-pruebas-0123456789abcdef']);
ok('con la cabecera de administrador cancela cualquier sala', $h === 200 && ($r['cancelada'] ?? false) === true && sala_fila($cod)['estado'] === 'cancelada', [$h, $r]);

// ══ 11. Una sala por organizador ══════════════════════════════════════════
[$a, $ta] = armar_sala('Org1', ['Otro1']);
[$b, $tb] = armar_sala('Org1', []);
ok('abrir otra sala cancela la anterior del mismo organizador', sala_fila($a)['estado'] === 'cancelada' && sala_fila($b)['estado'] === 'abierta', [sala_fila($a)['estado'], sala_fila($b)['estado']]);

// ══ 12. Límites de creación y datos inválidos ═════════════════════════════
sql('DELETE FROM envios');
$codes = 0;
for ($i = 0; $i < 22; $i++) {
    [$h, ] = S(['accion' => 'crear', 'nombre' => "Spam$i", 'cats' => [$CAT], 'dif' => 'all']);
    if ($h === 201) { $codes++; }
}
ok('desde una misma conexión solo se pueden crear 20 salas por hora', $codes === 20, $codes);
sql('DELETE FROM envios');
[$h, $r] = S(['accion' => 'crear', 'nombre' => 'Malo', 'cats' => ['No existe'], 'dif' => 'all']);
ok('una categoría inventada se rechaza', $h === 400 && ($r['error'] ?? '') === 'cat_desconocida', [$h, $r]);
[$h, $r] = S(['accion' => 'crear', 'nombre' => "\u{200B}\u{200B}", 'cats' => [$CAT]]);
ok('un nombre invisible se rechaza', $h === 400, [$h, $r]);
[$h, $r] = S(['accion' => 'crear', 'cats' => [$CAT]]);
ok('sin nombre se rechaza', $h === 400, [$h, $r]);
[$h, $r] = S(['accion' => 'nada', 'codigo' => 'ZZZZZZ', 'nombre' => 'Ana', 'token' => 'x']);
ok('una acción desconocida da error, no 500', $h >= 400 && $h < 500, [$h, $r]);
[$h, $r] = SG('?x=1');
ok('un GET sin sentido da 400', $h === 400, [$h, $r]);

echo "\n";
if ($mal > 0) {
    echo "FALLO · $bien bien, $mal mal\n";
    exit(1);
}
echo "BIEN · $bien comprobaciones\n";
exit(0);
