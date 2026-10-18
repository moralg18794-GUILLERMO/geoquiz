<?php
// GeoQuiz — duelo online: 2 jugadores, cada uno en su dispositivo, turnos remotos.
//   POST /api/duelo.php   {accion:'crear',    nombre, cats:[...], dif}
//   POST /api/duelo.php   {accion:'unirse',   codigo, nombre}
//   GET  /api/duelo.php   ?codigo=XXXXXX&nombre=...          estado del duelo (sondeo)
//   POST /api/duelo.php   {accion:'pregunta', codigo, nombre}
//   POST /api/duelo.php   {accion:'responder',codigo, nombre, elegida}
//   GET  /api/duelo.php   ?ranking=1                         clasificación de duelos
//
// 3 vidas por jugador; el primero que llega a 0 pierde. Como se juega por turnos
// alternados (nunca a la vez), no hace falta desempate por tiempo ni por aciertos:
// no pueden quedarse los dos a 0 vidas en el mismo instante.
//
// El servidor corrige cada respuesta, igual que el torneo: la pregunta se sirve sin
// decir cuál es la correcta, y lo que el navegador manda se compara aquí contra el
// banco real. El banco vive en api/preguntas.json, que tools/exportar-preguntas.php
// regenera desde js/data/questions.js en cada despliegue (ver tools/version.sh):
// así nunca hay dos copias que se puedan desincronizar.

declare(strict_types=1);
require __DIR__ . '/db.php';

gq_blindar('duelo');
gq_cors();

// ── LÍMITES ───────────────────────────────────────────────────────────────
const GQ_D_CREACIONES_HORA   = 20;   // solo se cuenta "crear": lo demás ya lo limita el propio duelo
const GQ_D_SEGUNDOS_PREGUNTA = 20;
const GQ_D_GRACIA            = 5;
const GQ_D_ABANDONO_MIN      = 5;
const GQ_D_TOPE_LISTA        = 100;
const GQ_D_DIFS              = ['all', 'facil', 'medio', 'dificil'];
// Sin O/0/I/1: se leen en voz alta o se copian de un mensaje de WhatsApp, y esos
// cuatro son los que más se confunden entre sí.
const GQ_D_ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function gq_d_codigo(): string {
    $n = strlen(GQ_D_ALFABETO);
    $c = '';
    for ($i = 0; $i < 6; $i++) {
        $c .= GQ_D_ALFABETO[random_int(0, $n - 1)];
    }
    return $c;
}

// ── BANCO DE PREGUNTAS ────────────────────────────────────────────────────
function gq_d_banco(): array {
    static $banco = null;
    if ($banco !== null) {
        return $banco;
    }
    $ruta = __DIR__ . '/preguntas.json';
    if (!is_file($ruta)) {
        gq_error(500, 'sin_banco', 'Falta el banco de preguntas en el servidor.');
    }
    $banco = json_decode((string) file_get_contents($ruta), true);
    if (!is_array($banco)) {
        gq_error(500, 'banco_invalido', 'El banco de preguntas no se pudo leer.');
    }
    return $banco;
}

// Una al azar que cumpla categorías y dificultad y que no se haya hecho ya en este
// duelo. Si el filtro se queda sin preguntas frescas (categorías muy estrechas y
// partida muy larga), se repite antes que cortar el duelo en seco.
function gq_d_elegir_pregunta(array $cats, string $dif, array $usadas): ?array {
    $pool = array_values(array_filter(gq_d_banco(), function (array $q) use ($cats, $dif): bool {
        if (!in_array($q['cat'], $cats, true)) { return false; }
        if ($dif !== 'all' && $q['diff'] !== $dif) { return false; }
        return true;
    }));
    if (!$pool) { return null; }
    $frescas = array_values(array_filter($pool, fn(array $q): bool => !in_array($q['q'], $usadas, true)));
    $candidatas = $frescas ?: $pool;
    return $candidatas[array_random_index($candidatas)];
}
function array_random_index(array $a): int {
    return random_int(0, count($a) - 1);
}

function gq_d_barajar(): string {
    $o = [0, 1, 2, 3];
    shuffle($o);
    return implode(',', $o);
}

// Puntos de una respuesta correcta: base según dificultad + hasta un 30% de bonus
// por rapidez. Sin multiplicador de racha a propósito: un corte de conexión no debe
// poder romper una racha que el jugador no ha perdido jugando.
function gq_d_puntos(int $basePts, int $tardado): int {
    $quedan = max(0, GQ_D_SEGUNDOS_PREGUNTA - $tardado);
    $bonus  = (int) floor($quedan / GQ_D_SEGUNDOS_PREGUNTA * $basePts * 0.3);
    return $basePts + $bonus;
}

// ── DUELO: CARGA Y PERTENENCIA ────────────────────────────────────────────
function gq_d_por_codigo(PDO $pdo, string $codigo): ?array {
    $f = gq_consulta($pdo, 'SELECT * FROM duelos WHERE codigo = ? LIMIT 1', [$codigo])->fetch();
    return $f === false ? null : $f;
}

// 1 si $nombre es el jugador 1 de este duelo, 2 si es el jugador 2, null si no es
// ninguno de los dos. Se pregunta a la tabla y no se compara en PHP porque la
// colación de MySQL es la que decide que "Guille" y "guille" son la misma persona.
function gq_d_mi_lado(PDO $pdo, int $id, string $nombre): ?int {
    if ((bool) gq_consulta($pdo, 'SELECT 1 FROM duelos WHERE id = ? AND j1_nombre = ?', [$id, $nombre])->fetchColumn()) {
        return 1;
    }
    if ((bool) gq_consulta($pdo, 'SELECT 1 FROM duelos WHERE id = ? AND j2_nombre = ?', [$id, $nombre])->fetchColumn()) {
        return 2;
    }
    return null;
}

// Si el jugador en turno lleva más de GQ_D_ABANDONO_MIN sin mover (ni pedir
// pregunta ni responder), pierde por abandono. Se comprueba aquí y no en un cron:
// el sondeo del cliente (cada 2-3s mientras el duelo está abierto) ya pasa por aquí
// con la frecuencia que hace falta.
function gq_d_revisar_abandono(PDO $pdo, array $d): array {
    if ($d['estado'] !== 'jugando') { return $d; }
    $pasados = (int) gq_consulta(
        $pdo, 'SELECT TIMESTAMPDIFF(MINUTE, ?, UTC_TIMESTAMP())', [$d['ultimo_movimiento_en']]
    )->fetchColumn();
    if ($pasados < GQ_D_ABANDONO_MIN) { return $d; }
    $ganador = (int) $d['turno'] === 1 ? 2 : 1;
    gq_consulta(
        $pdo, 'UPDATE duelos SET estado = "terminado", ganador = ? WHERE id = ? AND estado = "jugando"',
        [$ganador, $d['id']]
    );
    $d['estado']  = 'terminado';
    $d['ganador'] = $ganador;
    return $d;
}

function gq_d_fila_publica(array $d, ?int $miLado): array {
    return [
        'codigo'     => $d['codigo'],
        'j1_nombre'  => $d['j1_nombre'],
        'j2_nombre'  => $d['j2_nombre'],
        'cats'       => json_decode((string) $d['cats'], true) ?: [],
        'dif'        => $d['dif'],
        'estado'     => $d['estado'],
        'turno'      => (int) $d['turno'],
        'j1_vidas'   => (int) $d['j1_vidas'],
        'j2_vidas'   => (int) $d['j2_vidas'],
        'j1_puntos'  => (int) $d['j1_puntos'],
        'j2_puntos'  => (int) $d['j2_puntos'],
        'ganador'    => $d['ganador'] === null ? null : (int) $d['ganador'],
        'mi_lado'    => $miLado,
    ];
}

// ── CLASIFICACIÓN DE DUELOS ───────────────────────────────────────────────
// Aparte del ranking oficial: no toca partidas ni api/ranking.php, que son solo de
// Solo/Blitz/Supervivencia/Cronológico/Fechas. Un jugador puede salir dos veces en
// las filas de abajo (una como J1, otra como J2 de otro duelo); se agrupan por
// nombre con la misma colación que agrupa el resto de tablas.
function gq_d_clasificacion(PDO $pdo, int $limite = GQ_D_TOPE_LISTA): array {
    $limite = max(1, min($limite, GQ_D_TOPE_LISTA));
    $filas = gq_consulta(
        $pdo,
        'SELECT nombre, SUM(puntos) AS puntos, SUM(gano) AS ganados, COUNT(*) AS jugados FROM (
            SELECT j1_nombre AS nombre, j1_puntos AS puntos, (ganador = 1) AS gano FROM duelos WHERE estado = "terminado"
            UNION ALL
            SELECT j2_nombre AS nombre, j2_puntos AS puntos, (ganador = 2) AS gano FROM duelos WHERE estado = "terminado" AND j2_nombre IS NOT NULL
         ) x GROUP BY nombre ORDER BY ganados DESC, puntos DESC LIMIT ' . $limite
    )->fetchAll();
    $salida = [];
    foreach ($filas as $i => $f) {
        $salida[] = [
            'pos'     => $i + 1,
            'nombre'  => $f['nombre'],
            'ganados' => (int) $f['ganados'],
            'jugados' => (int) $f['jugados'],
            'puntos'  => (int) $f['puntos'],
        ];
    }
    return $salida;
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
if ($metodo !== 'GET' && $metodo !== 'POST') {
    gq_error(405, 'metodo', 'Solo se admiten GET y POST.');
}

$pdo = gq_db();

// ── GET: estado de un duelo, o la clasificación ───────────────────────────
if ($metodo === 'GET') {
    if (($_GET['ranking'] ?? '') === '1') {
        gq_json(200, ['ok' => true, 'clasificacion' => gq_d_clasificacion($pdo)]);
    }

    $codigo = isset($_GET['codigo']) && is_string($_GET['codigo']) ? strtoupper(trim($_GET['codigo'])) : '';
    if ($codigo === '') { gq_error(400, 'codigo', 'Hace falta un código de duelo.'); }
    $d = gq_d_por_codigo($pdo, $codigo);
    if ($d === null) { gq_error(404, 'no_existe', 'Ese código de duelo no existe.'); }
    $d = gq_d_revisar_abandono($pdo, $d);

    $nombre  = isset($_GET['nombre']) && is_string($_GET['nombre']) ? gq_limpiar_nombre($_GET['nombre']) : '';
    $miLado  = $nombre === '' ? null : gq_d_mi_lado($pdo, (int) $d['id'], $nombre);

    $pendiente = false;
    if ($d['estado'] === 'jugando') {
        $pendiente = (bool) gq_consulta(
            $pdo, 'SELECT 1 FROM duelo_respuestas WHERE duelo_id = ? AND respondida_en IS NULL LIMIT 1', [$d['id']]
        )->fetchColumn();
    }

    gq_json(200, ['ok' => true, 'duelo' => gq_d_fila_publica($d, $miLado), 'pendiente' => $pendiente]);
}

// ── POST ──────────────────────────────────────────────────────────────────
$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > 2048) {
    gq_error(400, 'cuerpo', 'Cuerpo de la petición ausente o demasiado grande.');
}
$datos = json_decode($crudo, true);
if (!is_array($datos)) {
    gq_error(400, 'json', 'El cuerpo debe ser un objeto JSON.');
}
$accion = $datos['accion'] ?? '';
$ipHash = gq_ip_hash();

if (!isset($datos['nombre']) || !is_string($datos['nombre'])) {
    gq_error(400, 'nombre', 'Hace falta un nombre.');
}
$nombre = gq_limpiar_nombre($datos['nombre']);
if ($nombre === '') {
    gq_error(400, 'nombre_vacio', 'Ese nombre no tiene ningún carácter válido.');
}

// ── CREAR ─────────────────────────────────────────────────────────────────
if ($accion === 'crear') {
    gq_consulta($pdo, 'DELETE FROM envios WHERE creado_en < (UTC_TIMESTAMP() - INTERVAL 1 HOUR)');
    $recientes = (int) gq_consulta(
        $pdo, 'SELECT COUNT(*) FROM envios WHERE ip_hash = ? AND creado_en > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)', [$ipHash]
    )->fetchColumn();
    if ($recientes >= GQ_D_CREACIONES_HORA) {
        gq_error(429, 'demasiados', 'Demasiados duelos creados desde esta conexión. Prueba dentro de un rato.');
    }

    $cats = $datos['cats'] ?? null;
    if (!is_array($cats) || !$cats) { gq_error(400, 'cats', 'Elige al menos una categoría.'); }
    $cats = array_values(array_unique(array_filter($cats, 'is_string')));
    $catsBanco = array_unique(array_column(gq_d_banco(), 'cat'));
    foreach ($cats as $c) {
        if (!in_array($c, $catsBanco, true)) { gq_error(400, 'cat_desconocida', 'Categoría desconocida: ' . $c); }
    }

    $dif = isset($datos['dif']) && is_string($datos['dif']) ? $datos['dif'] : 'all';
    if (!in_array($dif, GQ_D_DIFS, true)) { $dif = 'all'; }

    if (gq_d_elegir_pregunta($cats, $dif, []) === null) {
        gq_error(400, 'sin_preguntas', 'No hay preguntas con esos filtros.');
    }

    gq_consulta($pdo, 'INSERT INTO envios (ip_hash, creado_en) VALUES (?, UTC_TIMESTAMP())', [$ipHash]);

    $codigo = null;
    for ($i = 0; $i < 5 && $codigo === null; $i++) {
        $intento = gq_d_codigo();
        try {
            gq_consulta(
                $pdo,
                'INSERT INTO duelos
                   (codigo, j1_nombre, cats, dif, turno, j1_vidas, j2_vidas, j1_puntos, j2_puntos,
                    estado, ultimo_movimiento_en, creado_en, ip_hash_creador)
                 VALUES (?, ?, ?, ?, 1, 3, 3, 0, 0, "esperando", UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?)',
                [$intento, $nombre, json_encode($cats, JSON_UNESCAPED_UNICODE), $dif, $ipHash]
            );
            $codigo = $intento;
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') { throw $e; }   // otro código coincidió; se reintenta
        }
    }
    if ($codigo === null) { gq_error(500, 'codigo', 'No se pudo generar un código. Vuelve a intentarlo.'); }

    gq_json(201, ['ok' => true, 'codigo' => $codigo]);
}

// A partir de aquí todas las acciones necesitan un duelo ya existente.
$codigo = isset($datos['codigo']) && is_string($datos['codigo']) ? strtoupper(trim($datos['codigo'])) : '';
if ($codigo === '') { gq_error(400, 'codigo', 'Hace falta un código de duelo.'); }
$d = gq_d_por_codigo($pdo, $codigo);
if ($d === null) { gq_error(404, 'no_existe', 'Ese código de duelo no existe.'); }
$d = gq_d_revisar_abandono($pdo, $d);
$duId = (int) $d['id'];

// ── UNIRSE ────────────────────────────────────────────────────────────────
if ($accion === 'unirse') {
    $yaSoy = gq_d_mi_lado($pdo, $duId, $nombre);
    if ($yaSoy === 2) {
        // Recarga de quien ya se había unido: no es un error, es la misma partida.
        gq_json(200, ['ok' => true, 'duelo' => gq_d_fila_publica($d, 2)]);
    }
    if ($d['estado'] !== 'esperando') {
        gq_error(409, 'duelo_lleno', 'Ese duelo ya tiene dos jugadores o ha terminado.');
    }
    if ($yaSoy === 1) {
        gq_error(400, 'mismo_nombre', 'Usa un nombre distinto al de quien creó el duelo.');
    }

    // La condición WHERE estado="esperando" es lo que de verdad decide: si dos personas
    // se unen a la vez, solo una de las dos UPDATE afecta a alguna fila. La otra no lanza
    // ningún error -no hay clave única que lo impida-, así que hay que comprobar después
    // quién ganó la carrera antes de darle la bienvenida a alguien que en realidad se quedó
    // fuera.
    gq_consulta(
        $pdo,
        'UPDATE duelos SET j2_nombre = ?, estado = "jugando", turno = 1,
            ultimo_movimiento_en = UTC_TIMESTAMP(), ip_hash_rival = ?
         WHERE id = ? AND estado = "esperando"',
        [$nombre, $ipHash, $duId]
    );
    $d = gq_d_por_codigo($pdo, $codigo) ?? $d;
    if (gq_d_mi_lado($pdo, $duId, $nombre) !== 2) {
        gq_error(409, 'duelo_lleno', 'Ese duelo ya tiene dos jugadores o ha terminado.');
    }
    gq_json(200, ['ok' => true, 'duelo' => gq_d_fila_publica($d, 2)]);
}

// Las acciones de juego exigen saber de qué lado se está.
$lado = gq_d_mi_lado($pdo, $duId, $nombre);
if ($lado === null) { gq_error(403, 'no_eres_jugador', 'Ese nombre no está en este duelo.'); }

// ── PREGUNTA ──────────────────────────────────────────────────────────────
if ($accion === 'pregunta') {
    if ($d['estado'] !== 'jugando') { gq_error(409, 'no_jugando', 'Este duelo no está en juego.'); }
    if ((int) $d['turno'] !== $lado) { gq_error(409, 'no_es_tu_turno', 'No es tu turno.'); }

    $pend = gq_consulta(
        $pdo, 'SELECT * FROM duelo_respuestas WHERE duelo_id = ? AND respondida_en IS NULL ORDER BY orden DESC LIMIT 1',
        [$duId]
    )->fetch();

    if ($pend !== false) {
        // Recarga a media pregunta: se repite con la misma baraja y sin reiniciar el reloj.
        $p = $pend;
        $transcurrido = (int) gq_consulta(
            $pdo, 'SELECT TIMESTAMPDIFF(SECOND, ?, UTC_TIMESTAMP())', [$p['servida_en']]
        )->fetchColumn();
    } else {
        $cats = json_decode((string) $d['cats'], true) ?: [];
        $usadas = gq_consulta($pdo, 'SELECT q FROM duelo_respuestas WHERE duelo_id = ?', [$duId])->fetchAll(PDO::FETCH_COLUMN);
        $q = gq_d_elegir_pregunta($cats, (string) $d['dif'], $usadas);
        if ($q === null) { gq_error(500, 'sin_preguntas', 'Se acabaron las preguntas de estas categorías.'); }

        $orden  = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM duelo_respuestas WHERE duelo_id = ?', [$duId])->fetchColumn() + 1;
        $baraja = gq_d_barajar();
        gq_consulta(
            $pdo,
            'INSERT INTO duelo_respuestas
               (duelo_id, orden, turno_jugador, cat, diff, pts, q, opts, ans, exp, opciones, servida_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [$duId, $orden, $lado, $q['cat'], $q['diff'], $q['pts'], $q['q'],
             json_encode($q['opts'], JSON_UNESCAPED_UNICODE), $q['ans'], $q['exp'] ?? '', $baraja]
        );
        gq_consulta($pdo, 'UPDATE duelos SET ultimo_movimiento_en = UTC_TIMESTAMP() WHERE id = ?', [$duId]);

        $p = [
            'orden' => $orden, 'cat' => $q['cat'], 'diff' => $q['diff'], 'pts' => $q['pts'],
            'q' => $q['q'], 'opts' => json_encode($q['opts'], JSON_UNESCAPED_UNICODE), 'opciones' => $baraja,
        ];
        $transcurrido = 0;
    }

    $orig = json_decode((string) $p['opts'], true) ?: [];
    $perm = array_map('intval', explode(',', (string) $p['opciones']));
    $servidas = [];
    foreach ($perm as $i) { $servidas[] = $orig[$i] ?? ''; }

    gq_json(200, [
        'ok'     => true,
        'orden'  => (int) $p['orden'],
        'cat'    => $p['cat'],
        'diff'   => $p['diff'],
        'pts'    => (int) $p['pts'],
        'q'      => $p['q'],
        'opts'   => $servidas,
        'quedan' => max(0, GQ_D_SEGUNDOS_PREGUNTA - $transcurrido),
    ]);
}

// ── RESPONDER ─────────────────────────────────────────────────────────────
if ($accion === 'responder') {
    if ($d['estado'] !== 'jugando') { gq_error(409, 'no_jugando', 'Este duelo no está en juego.'); }
    if ((int) $d['turno'] !== $lado) { gq_error(409, 'no_es_tu_turno', 'No es tu turno.'); }

    $r = gq_consulta(
        $pdo,
        'SELECT *, TIMESTAMPDIFF(SECOND, servida_en, UTC_TIMESTAMP()) AS tardado
         FROM duelo_respuestas WHERE duelo_id = ? AND respondida_en IS NULL ORDER BY orden DESC LIMIT 1',
        [$duId]
    )->fetch();
    if ($r === false) { gq_error(409, 'sin_pregunta', 'No hay ninguna pregunta pendiente.'); }

    $perm    = array_map('intval', explode(',', (string) $r['opciones']));
    $tardado = max(0, (int) $r['tardado']);
    $elegida = filter_var($datos['elegida'] ?? -1, FILTER_VALIDATE_INT);
    if ($elegida === false || $elegida === null || $elegida < 0 || $elegida > 3) { $elegida = -1; }

    $aTiempo = $tardado <= (GQ_D_SEGUNDOS_PREGUNTA + GQ_D_GRACIA);
    $real    = $elegida >= 0 ? ($perm[$elegida] ?? -1) : -1;
    $acerto  = $aTiempo && $real === (int) $r['ans'];
    $pts     = $acerto ? gq_d_puntos((int) $r['pts'], $tardado) : 0;

    // El WHERE respondida_en IS NULL es el candado: si esta respuesta ya se había
    // guardado -una red lenta que reintenta el mismo POST, dos toques seguidos-, aquí
    // no afecta a ninguna fila y se corta antes de aplicar vidas o puntos dos veces.
    $filas = gq_consulta(
        $pdo,
        'UPDATE duelo_respuestas SET elegida = ?, acertada = ?, puntos_ganados = ?, respondida_en = UTC_TIMESTAMP()
          WHERE id = ? AND respondida_en IS NULL',
        [$elegida, $acerto ? 1 : 0, $pts, $r['id']]
    )->rowCount();
    if ($filas === 0) {
        gq_error(409, 'ya_respondida', 'Esa pregunta ya se había contestado.');
    }

    $colPuntos = $lado === 1 ? 'j1_puntos' : 'j2_puntos';
    $colVidas  = $lado === 1 ? 'j1_vidas'  : 'j2_vidas';
    $vidasAhora = (int) $d[$colVidas];

    if ($acerto) {
        gq_consulta($pdo, "UPDATE duelos SET $colPuntos = $colPuntos + ? WHERE id = ?", [$pts, $duId]);
    } else {
        $vidasAhora = max(0, $vidasAhora - 1);
        gq_consulta($pdo, "UPDATE duelos SET $colVidas = ? WHERE id = ?", [$vidasAhora, $duId]);
    }

    $terminado = $vidasAhora <= 0;
    if ($terminado) {
        $ganador = $lado === 1 ? 2 : 1;
        gq_consulta(
            $pdo, 'UPDATE duelos SET estado = "terminado", ganador = ?, ultimo_movimiento_en = UTC_TIMESTAMP() WHERE id = ?',
            [$ganador, $duId]
        );
    } else {
        $siguienteTurno = $lado === 1 ? 2 : 1;
        gq_consulta(
            $pdo, 'UPDATE duelos SET turno = ?, ultimo_movimiento_en = UTC_TIMESTAMP() WHERE id = ?',
            [$siguienteTurno, $duId]
        );
    }

    $d = gq_d_por_codigo($pdo, $codigo) ?? $d;
    $idxCorrecta = array_search((int) $r['ans'], $perm, true);
    gq_json(200, [
        'ok'        => true,
        'acerto'    => $acerto,
        'correcta'  => $idxCorrecta === false ? 0 : (int) $idxCorrecta,
        'exp'       => $r['exp'],
        'ganados'   => $pts,
        'tardado'   => $tardado,
        'terminado' => $terminado,
        'duelo'     => gq_d_fila_publica($d, $lado),
    ]);
}

gq_error(400, 'accion', 'Acción de duelo desconocida.');
