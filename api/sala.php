<?php
// GeoQuiz — torneo de duelos: una sala junta a 2-8 jugadores, los sortea en un cuadro de
// eliminatoria y cada partido es un duelo normal (api/duelo.php) que crea el servidor.
//   POST /api/sala.php  {accion:'crear',    nombre, cats:[...], dif}   → abre la sala; devuelve la llave
//   POST /api/sala.php  {accion:'unirse',   codigo, nombre[, token]}   → apuntarse (con token = volver a entrar)
//   POST /api/sala.php  {accion:'estado',   codigo, nombre, token}     → sondeo: apuntados, cuadro, mi partido
//   POST /api/sala.php  {accion:'empezar',  codigo, nombre, token}     → el organizador lanza la llamada
//   POST /api/sala.php  {accion:'listo',    codigo, nombre, token}     → «estoy aquí» durante la llamada
//   POST /api/sala.php  {accion:'expulsar', codigo, nombre, token, objetivo}
//   POST /api/sala.php  {accion:'salir',    codigo, nombre, token}
//   POST /api/sala.php  {accion:'cancelar', codigo, nombre, token}     → el organizador cierra la sala
//   GET  /api/sala.php  ?campeones=1                                   → lista de campeones
//   POST /api/sala.php  {accion:'admin_cancelar', codigo}  con la cabecera X-GQ-Admin
//
// Cómo funciona, en corto:
//  · Cada jugador recibe una LLAVE (token) al apuntarse, una sola vez, y se exige en todo lo demás:
//    los nombres de la sala se ven, la llave no, así que nadie puede jugar con el nombre de otro.
//  · El organizador pulsa «Empezar»: empieza una llamada de GQ_S_LLAMADA_SEG segundos en la que cada
//    uno confirma «estoy aquí». Quien no confirma se queda fuera del sorteo.
//  · El cuadro avanza SOLO cuando alguien sondea (no hay cron): cada sondeo cierra los partidos que
//    hayan terminado, rellena el hueco siguiente y crea el duelo cuando un partido tiene ya a sus dos
//    jugadores. Todas las escrituras llevan un «candado» (UPDATE … WHERE ya-no-está-hecho) para que dos
//    sondeos simultáneos no avancen el cuadro dos veces.
//  · El código del duelo de cada partido solo se enseña a sus dos jugadores.

declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/duelo-lib.php';

gq_blindar('sala');
gq_cors();

const GQ_S_PLAZAS_MIN     = 2;
const GQ_S_PLAZAS_MAX     = 8;
const GQ_S_LLAMADA_SEG    = 30;
const GQ_S_PRESENTE_SEG   = 20;    // «presente» = ha sondeado hace menos de esto
const GQ_S_ORGANIZADOR_SEG = 300;  // si el organizador lleva tanto sin sondear, organiza el siguiente
const GQ_S_MISMA_IP_MAX   = 3;     // jugadores desde una misma conexión en una sala (una casa, un bar)
const GQ_S_TOPE_CAMPEONES = 50;

// Orden de los cabezas de serie en el cuadro: el 1 contra el último, etc.
const GQ_S_SIEMBRA = [2 => [1, 2], 4 => [1, 4, 2, 3], 8 => [1, 8, 4, 5, 2, 7, 3, 6]];

function gq_s_ahora(): string { return gmdate('Y-m-d H:i:s'); }

// ── CARGA ─────────────────────────────────────────────────────────────────
function gq_s_por_codigo(PDO $pdo, string $codigo): ?array {
    $f = gq_consulta($pdo, 'SELECT * FROM salas WHERE codigo = ? LIMIT 1', [$codigo])->fetch();
    return $f === false ? null : $f;
}

function gq_s_jugadores(PDO $pdo, int $salaId): array {
    return gq_consulta($pdo, 'SELECT * FROM sala_jugadores WHERE sala_id = ? ORDER BY orden, id', [$salaId])->fetchAll();
}

function gq_s_partidos(PDO $pdo, int $salaId): array {
    return gq_consulta($pdo, 'SELECT * FROM sala_partidos WHERE sala_id = ? ORDER BY ronda, pos', [$salaId])->fetchAll();
}

// Quien «puede organizar»: el organizador, salvo que lleve GQ_S_ORGANIZADOR_SEG sin dar señales de vida;
// entonces, el primero que se apuntó de los que sí están. Se calcula al vuelo: no se guarda nada.
function gq_s_organizador(array $sala, array $jugadores): string {
    $ahora = time();
    foreach ($jugadores as $j) {
        if ($j['nombre'] === $sala['organizador']
            && $ahora - gq_d_hora_utc((string) $j['visto_en']) < GQ_S_ORGANIZADOR_SEG) {
            return $sala['organizador'];
        }
    }
    foreach ($jugadores as $j) {
        if ($ahora - gq_d_hora_utc((string) $j['visto_en']) < GQ_S_PRESENTE_SEG * 3) {
            return (string) $j['nombre'];
        }
    }
    return (string) $sala['organizador'];
}

// Identifica a quien llama: sala + nombre + llave. Corta con un error si algo no encaja.
function gq_s_autenticar(PDO $pdo, array $datos, string $nombre): array {
    $codigo = isset($datos['codigo']) && is_string($datos['codigo']) ? strtoupper(trim($datos['codigo'])) : '';
    if ($codigo === '') { gq_error(400, 'codigo', 'Hace falta el código de la sala.'); }
    $sala = gq_s_por_codigo($pdo, $codigo);
    if ($sala === null) { gq_error(404, 'no_existe', 'Esa sala no existe.'); }
    // El nombre lo compara MySQL (colación sin mayúsculas ni acentos), igual que en el resto del juego.
    $yo = gq_consulta(
        $pdo, 'SELECT * FROM sala_jugadores WHERE sala_id = ? AND nombre = ? LIMIT 1', [$sala['id'], $nombre]
    )->fetch();
    if ($yo === false) { gq_error(403, 'no_estas', 'Ya no estás en esta sala.'); }
    $token = isset($datos['token']) && is_string($datos['token']) ? $datos['token'] : '';
    if ($token === '' || !hash_equals((string) $yo['token'], $token)) {
        gq_error(403, 'token', 'La llave de esta sala no es la tuya.');
    }
    return [$sala, $yo];
}

function gq_s_tocar(PDO $pdo, array $sala, array $yo): void {
    $ahora = gq_s_ahora();
    gq_consulta($pdo, 'UPDATE sala_jugadores SET visto_en = ? WHERE id = ?', [$ahora, $yo['id']]);
    gq_consulta($pdo, 'UPDATE salas SET ultima_actividad_en = ? WHERE id = ?', [$ahora, $sala['id']]);
}

// ── EL CUADRO ─────────────────────────────────────────────────────────────
function gq_s_insertar_duelo(PDO $pdo, array $sala, array $p, string $codigo): void {
    try {
        gq_consulta(
            $pdo,
            'INSERT INTO duelos
               (codigo, j1_nombre, j2_nombre, cats, dif, turno, j1_vidas, j2_vidas, j1_aciertos, j2_aciertos,
                estado, ultimo_movimiento_en, creado_en, ip_hash_creador, ip_hash_rival)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, 0, "jugando", UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?)',
            [$codigo, $p['j1'], $p['j2'], $sala['cats'], $sala['dif'], $sala['vidas'], $sala['vidas'],
             $sala['ip_hash_creador'], $sala['ip_hash_creador']]
        );
    } catch (PDOException $e) {
        if ($e->getCode() !== '23000') { throw $e; }   // ya existía: otro sondeo lo creó a la vez
    }
}

// Crea el duelo de un partido que ya tiene a sus dos jugadores. Primero se «reclama» el partido con un
// código (el candado: solo uno de los sondeos simultáneos lo consigue) y luego se crea el duelo.
function gq_s_crear_duelo(PDO $pdo, array $sala, array $p): bool {
    for ($i = 0; $i < 5; $i++) {
        $codigo = gq_d_codigo();
        $n = gq_consulta(
            $pdo, 'UPDATE sala_partidos SET duelo_codigo = ? WHERE id = ? AND duelo_codigo IS NULL AND ganador IS NULL',
            [$codigo, $p['id']]
        )->rowCount();
        if ($n !== 1) { return false; }
        if (gq_d_por_codigo($pdo, $codigo) !== null) {   // el código ya lo usa otro duelo: se suelta y se reintenta
            gq_consulta($pdo, 'UPDATE sala_partidos SET duelo_codigo = NULL WHERE id = ? AND duelo_codigo = ?', [$p['id'], $codigo]);
            continue;
        }
        gq_s_insertar_duelo($pdo, $sala, $p, $codigo);
        return true;
    }
    return false;
}

// Reparte a los jugadores en el cuadro. Tamaño = la potencia de 2 que los contiene; los huecos que
// sobran son «pase directo» (los reciben los cabezas de serie, que salen del sorteo). Se crean ya todos
// los partidos de todas las rondas; los de rondas posteriores se irán rellenando con los ganadores.
function gq_s_armar_cuadro(PDO $pdo, array $sala, array $nombres): void {
    $n = count($nombres);
    $tam = 2;
    while ($tam < $n) { $tam *= 2; }
    shuffle($nombres);   // el sorteo
    $orden = GQ_S_SIEMBRA[$tam];
    $nombre_de = fn(int $semilla): ?string => $semilla <= $n ? $nombres[$semilla - 1] : null;

    $ronda = 1;
    for ($cuantos = intdiv($tam, 2); $cuantos >= 1; $cuantos = intdiv($cuantos, 2), $ronda++) {
        for ($pos = 0; $pos < $cuantos; $pos++) {
            $j1 = $j2 = null;
            if ($ronda === 1) {
                $j1 = $nombre_de($orden[2 * $pos]);
                $j2 = $nombre_de($orden[2 * $pos + 1]);
            }
            try {
                gq_consulta(
                    $pdo, 'INSERT INTO sala_partidos (sala_id, ronda, pos, j1, j2) VALUES (?, ?, ?, ?, ?)',
                    [$sala['id'], $ronda, $pos, $j1, $j2]
                );
            } catch (PDOException $e) {
                if ($e->getCode() !== '23000') { throw $e; }
            }
        }
    }
    // Pase directo: partidos de la primera ronda con un solo jugador.
    gq_consulta(
        $pdo,
        "UPDATE sala_partidos SET ganador = COALESCE(j1, j2), motivo = 'pase'
          WHERE sala_id = ? AND ronda = 1 AND ganador IS NULL AND (j1 IS NULL OR j2 IS NULL)",
        [$sala['id']]
    );
}

// Cierra los partidos terminados, pasa a los ganadores al hueco siguiente y crea los duelos que ya
// puedan jugarse. Se repite hasta que no hay nada que mover (un solo sondeo puede resolver varios
// pasos, p. ej. un pase directo seguido de un partido ya listo). Devuelve la sala al día.
function gq_s_avanzar(PDO $pdo, array $sala): array {
    for ($vuelta = 0; $vuelta < 12; $vuelta++) {
        $partidos = gq_s_partidos($pdo, (int) $sala['id']);
        if (!$partidos) { break; }
        $rondas = (int) max(array_column($partidos, 'ronda'));
        $cambio = false;

        foreach ($partidos as $p) {
            if ($p['ganador'] !== null) {
                if ((int) $p['ronda'] < $rondas) {
                    $col = ((int) $p['pos']) % 2 === 0 ? 'j1' : 'j2';
                    $n = gq_consulta(
                        $pdo, "UPDATE sala_partidos SET $col = ? WHERE sala_id = ? AND ronda = ? AND pos = ? AND $col IS NULL",
                        [$p['ganador'], $sala['id'], (int) $p['ronda'] + 1, intdiv((int) $p['pos'], 2)]
                    )->rowCount();
                    if ($n > 0) { $cambio = true; }
                }
                continue;
            }
            if ($p['j1'] === null || $p['j2'] === null) { continue; }

            if ($p['duelo_codigo'] === null) {
                if (gq_s_crear_duelo($pdo, $sala, $p)) { $cambio = true; }
                continue;
            }
            $du = gq_d_por_codigo($pdo, (string) $p['duelo_codigo']);
            if ($du === null) {
                // Reclamado pero sin duelo: otro sondeo está a medias, o murió entre medias. Crearlo aquí es
                // inofensivo (el código es único) y cura el segundo caso.
                gq_s_insertar_duelo($pdo, $sala, $p, (string) $p['duelo_codigo']);
                continue;
            }
            $du = gq_d_revisar_abandono($pdo, $du);
            if ($du['estado'] !== 'terminado') { continue; }

            $g = $du['ganador'] === null ? 0 : (int) $du['ganador'];
            if ($g === 0) {
                // En un cuadro no debería haber empates (duelo.php hace muerte súbita). Si aun así llega uno,
                // se rejuega el partido en un duelo nuevo en vez de dejar el cuadro parado.
                gq_consulta($pdo, 'UPDATE sala_partidos SET duelo_codigo = NULL WHERE id = ? AND ganador IS NULL', [$p['id']]);
                $cambio = true;
                continue;
            }
            $perdedorVidas = (int) ($g === 1 ? $du['j2_vidas'] : $du['j1_vidas']);
            $n = gq_consulta(
                $pdo, 'UPDATE sala_partidos SET ganador = ?, motivo = ? WHERE id = ? AND ganador IS NULL',
                [$g === 1 ? $p['j1'] : $p['j2'], $perdedorVidas > 0 ? 'abandono' : 'juego', $p['id']]
            )->rowCount();
            if ($n > 0) { $cambio = true; }
        }
        if (!$cambio) { break; }
    }

    // ¿Ha terminado la final?
    $partidos = gq_s_partidos($pdo, (int) $sala['id']);
    if ($partidos) {
        $final = end($partidos);
        if ($final['ganador'] !== null) {
            gq_consulta(
                $pdo, "UPDATE salas SET estado = 'terminada', ganador = ? WHERE id = ? AND estado = 'jugando'",
                [$final['ganador'], $sala['id']]
            );
        }
    }
    return gq_s_por_codigo($pdo, (string) $sala['codigo']) ?? $sala;
}

// Lo que hay que hacer «solo» en cada sondeo: la llamada que vence y el cuadro que avanza.
function gq_s_mantener(PDO $pdo, array $sala): array {
    if ($sala['estado'] === 'llamando') {
        $jug = gq_s_jugadores($pdo, (int) $sala['id']);
        $listos = array_filter($jug, fn($j) => (int) $j['listo'] === 1);
        $vencida = $sala['llamada_en'] !== null
            && time() - gq_d_hora_utc((string) $sala['llamada_en']) >= GQ_S_LLAMADA_SEG;
        if (count($listos) === count($jug) || $vencida) {
            // Quien no ha confirmado se queda fuera: no se espera a quien no está.
            gq_consulta($pdo, 'DELETE FROM sala_jugadores WHERE sala_id = ? AND listo = 0', [$sala['id']]);
            $nombres = array_map(fn($j) => (string) $j['nombre'], array_values($listos));
            if (count($nombres) >= GQ_S_PLAZAS_MIN) {
                $n = gq_consulta(
                    $pdo, "UPDATE salas SET estado = 'jugando' WHERE id = ? AND estado = 'llamando'", [$sala['id']]
                )->rowCount();
                if ($n === 1) { gq_s_armar_cuadro($pdo, $sala, $nombres); }
            } else {
                // Sin gente suficiente, la sala vuelve a esperar jugadores en vez de morir.
                gq_consulta(
                    $pdo, "UPDATE salas SET estado = 'abierta', llamada_en = NULL WHERE id = ? AND estado = 'llamando'", [$sala['id']]
                );
                gq_consulta($pdo, 'UPDATE sala_jugadores SET listo = 0 WHERE sala_id = ?', [$sala['id']]);
            }
            $sala = gq_s_por_codigo($pdo, (string) $sala['codigo']) ?? $sala;
        }
    }
    if ($sala['estado'] === 'jugando') {
        $sala = gq_s_avanzar($pdo, $sala);
    }
    return $sala;
}

// ── LO QUE VE EL CLIENTE ──────────────────────────────────────────────────
function gq_s_estado_publico(PDO $pdo, array $sala, array $yo): array {
    $jug = gq_s_jugadores($pdo, (int) $sala['id']);
    $organizador = gq_s_organizador($sala, $jug);
    $ahora = time();

    // Partidos con el marcador del duelo que se está jugando (vidas y aciertos), para poder mirar.
    $filas = gq_consulta(
        $pdo,
        'SELECT p.*, d.estado AS d_estado, d.j1_vidas, d.j2_vidas, d.j1_aciertos, d.j2_aciertos
           FROM sala_partidos p LEFT JOIN duelos d ON d.codigo = p.duelo_codigo
          WHERE p.sala_id = ? ORDER BY p.ronda, p.pos',
        [$sala['id']]
    )->fetchAll();

    $cuadro = [];
    $perdedores = [];
    $mi = ['nombre' => $yo['nombre'], 'eliminado' => false, 'campeon' => false, 'partido' => null];
    foreach ($filas as $p) {
        $listo = $p['j1'] !== null && $p['j2'] !== null;
        $estado = $p['ganador'] !== null ? 'terminado' : ($listo && $p['duelo_codigo'] !== null ? 'jugando' : 'pendiente');
        $cuadro[] = [
            'ronda' => (int) $p['ronda'], 'pos' => (int) $p['pos'],
            'j1' => $p['j1'], 'j2' => $p['j2'], 'ganador' => $p['ganador'], 'motivo' => $p['motivo'],
            'estado' => $estado,
            'v1' => $p['d_estado'] === null ? null : (int) $p['j1_vidas'],
            'v2' => $p['d_estado'] === null ? null : (int) $p['j2_vidas'],
            'a1' => $p['d_estado'] === null ? null : (int) $p['j1_aciertos'],
            'a2' => $p['d_estado'] === null ? null : (int) $p['j2_aciertos'],
        ];
        if ($p['ganador'] !== null && $p['motivo'] !== 'pase') {
            $perdedores[] = $p['ganador'] === $p['j1'] ? $p['j2'] : $p['j1'];
        }
        // El código del duelo SOLO se da a quien juega ese partido.
        if ($estado === 'jugando' && ($p['j1'] === $yo['nombre'] || $p['j2'] === $yo['nombre'])) {
            $mi['partido'] = [
                'ronda' => (int) $p['ronda'], 'pos' => (int) $p['pos'],
                'rival' => $p['j1'] === $yo['nombre'] ? $p['j2'] : $p['j1'],
                'codigo' => $p['duelo_codigo'],
            ];
        }
    }
    $mi['eliminado'] = in_array($yo['nombre'], $perdedores, true);
    $mi['campeon'] = $sala['estado'] === 'terminada' && $sala['ganador'] === $yo['nombre'];

    $jugadores = [];
    foreach ($jug as $j) {
        $jugadores[] = [
            'nombre'      => $j['nombre'],
            'listo'       => (int) $j['listo'] === 1,
            'presente'    => $ahora - gq_d_hora_utc((string) $j['visto_en']) < GQ_S_PRESENTE_SEG,
            'organizador' => $j['nombre'] === $organizador,
            'eliminado'   => in_array($j['nombre'], $perdedores, true),
            'campeon'     => $sala['estado'] === 'terminada' && $sala['ganador'] === $j['nombre'],
        ];
    }

    $restante = null;
    if ($sala['estado'] === 'llamando' && $sala['llamada_en'] !== null) {
        $restante = max(0, GQ_S_LLAMADA_SEG - (time() - gq_d_hora_utc((string) $sala['llamada_en'])));
    }
    return [
        'sala' => [
            'codigo'      => $sala['codigo'],
            'estado'      => $sala['estado'],
            'organizador' => $organizador,
            'plazas'      => (int) $sala['plazas'],
            'vidas'       => (int) $sala['vidas'],
            'cats'        => json_decode((string) $sala['cats'], true) ?: [],
            'dif'         => $sala['dif'],
            'ganador'     => $sala['ganador'],
            'llamada_restante' => $restante,
            'soy_organizador'  => $organizador === $yo['nombre'],
        ],
        'jugadores' => $jugadores,
        'cuadro'    => $cuadro,
        'mi'        => $mi,
    ];
}

// ── CAMPEONES ─────────────────────────────────────────────────────────────
// Lista aparte de la clasificación de duelos (que no cuenta partidos de torneo). Solo cuentan los torneos
// de 3 o más jugadores: con 2 es un duelo con otro nombre.
function gq_s_campeones(PDO $pdo): array {
    $gan = gq_consulta(
        $pdo,
        "SELECT s.ganador AS nombre, COUNT(*) AS ganados, MAX(s.id) AS ultimo FROM salas s
          WHERE s.estado = 'terminada' AND s.ganador IS NOT NULL
            AND (SELECT COUNT(*) FROM sala_jugadores x WHERE x.sala_id = s.id) >= 3
          GROUP BY s.ganador ORDER BY ganados DESC, ultimo DESC LIMIT " . GQ_S_TOPE_CAMPEONES
    )->fetchAll();
    $jug = gq_consulta(
        $pdo,
        "SELECT j.nombre AS nombre, COUNT(*) AS jugados FROM sala_jugadores j JOIN salas s ON s.id = j.sala_id
          WHERE s.estado = 'terminada' AND (SELECT COUNT(*) FROM sala_jugadores x WHERE x.sala_id = s.id) >= 3
          GROUP BY j.nombre"
    )->fetchAll();
    $jugados = [];
    foreach ($jug as $f) { $jugados[gq_minus((string) $f['nombre'])] = (int) $f['jugados']; }
    $salida = [];
    foreach ($gan as $i => $f) {
        $salida[] = [
            'pos'     => $i + 1,
            'nombre'  => $f['nombre'],
            'ganados' => (int) $f['ganados'],
            'jugados' => $jugados[gq_minus((string) $f['nombre'])] ?? (int) $f['ganados'],
        ];
    }
    return $salida;
}

// ── PETICIÓN ──────────────────────────────────────────────────────────────
$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
if ($metodo !== 'GET' && $metodo !== 'POST') {
    gq_error(405, 'metodo', 'Solo se admiten GET y POST.');
}
$pdo = gq_db();

if ($metodo === 'GET') {
    if (($_GET['campeones'] ?? '') === '1') {
        gq_json(200, ['ok' => true, 'campeones' => gq_s_campeones($pdo)]);
    }
    gq_error(400, 'peticion', 'Petición no válida.');
}

$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > 2048) {
    gq_error(400, 'cuerpo', 'Cuerpo de la petición ausente o demasiado grande.');
}
$datos = json_decode($crudo, true);
if (!is_array($datos)) { gq_error(400, 'json', 'El cuerpo debe ser un objeto JSON.'); }
$accion = $datos['accion'] ?? '';

// ── Administrador: cerrar cualquier sala (sin nombre ni llave) ────────────
if ($accion === 'admin_cancelar') {
    $cfg = gq_config();
    $esperado = (string) ($cfg['token_admin'] ?? '');
    $dado = (string) ($_SERVER['HTTP_X_GQ_ADMIN'] ?? '');
    if ($esperado === '' || strlen($esperado) < 32 || $dado === '' || !hash_equals($esperado, $dado)) {
        gq_error(404, 'no', 'No encontrado.');   // desde fuera, esta acción no existe
    }
    $codigo = isset($datos['codigo']) && is_string($datos['codigo']) ? strtoupper(trim($datos['codigo'])) : '';
    $n = gq_consulta(
        $pdo, "UPDATE salas SET estado = 'cancelada' WHERE codigo = ? AND estado IN ('abierta', 'llamando', 'jugando')", [$codigo]
    )->rowCount();
    gq_json(200, ['ok' => true, 'cancelada' => $n === 1]);
}

if (!isset($datos['nombre']) || !is_string($datos['nombre'])) { gq_error(400, 'nombre', 'Hace falta un nombre.'); }
$nombre = gq_limpiar_nombre($datos['nombre']);
if ($nombre === '') { gq_error(400, 'nombre_vacio', 'Ese nombre no tiene ningún carácter válido.'); }
$ipHash = gq_ip_hash();

// ── CREAR ─────────────────────────────────────────────────────────────────
if ($accion === 'crear') {
    gq_consulta($pdo, 'DELETE FROM envios WHERE creado_en < (UTC_TIMESTAMP() - INTERVAL 1 HOUR)');
    $recientes = (int) gq_consulta(
        $pdo, 'SELECT COUNT(*) FROM envios WHERE ip_hash = ? AND creado_en > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)', [$ipHash]
    )->fetchColumn();
    if ($recientes >= GQ_D_CREACIONES_HORA) {
        gq_error(429, 'demasiados', 'Demasiados torneos creados desde esta conexión. Prueba dentro de un rato.');
    }

    $cats = $datos['cats'] ?? null;
    if (!is_array($cats) || !$cats) { gq_error(400, 'cats', 'Elige al menos una categoría.'); }
    $cats = array_values(array_unique(array_filter($cats, 'is_string')));
    $banco = json_decode((string) @file_get_contents(__DIR__ . '/preguntas.json'), true);
    if (!is_array($banco)) { gq_error(500, 'sin_banco', 'Falta el banco de preguntas en el servidor.'); }
    $catsBanco = array_unique(array_column($banco, 'cat'));
    foreach ($cats as $c) {
        if (!in_array($c, $catsBanco, true)) { gq_error(400, 'cat_desconocida', 'Categoría desconocida: ' . $c); }
    }
    $dif = isset($datos['dif']) && is_string($datos['dif']) ? $datos['dif'] : 'all';
    if (!in_array($dif, GQ_D_DIFS, true)) { $dif = 'all'; }
    $hay = array_filter($banco, fn($q) => in_array($q['cat'], $cats, true) && ($dif === 'all' || $q['diff'] === $dif));
    if (count($hay) < 30) { gq_error(400, 'sin_preguntas', 'Hay muy pocas preguntas con esos filtros para un torneo.'); }

    gq_consulta($pdo, 'INSERT INTO envios (ip_hash, creado_en) VALUES (?, UTC_TIMESTAMP())', [$ipHash]);

    // Un organizador, una sala abierta: quien abre otra deja la anterior (mismo nombre y misma conexión).
    gq_consulta(
        $pdo,
        "UPDATE salas SET estado = 'cancelada'
          WHERE estado IN ('abierta', 'llamando') AND organizador = ? AND ip_hash_creador = ?",
        [$nombre, $ipHash]
    );

    $codigo = null;
    $ahora = gq_s_ahora();
    for ($i = 0; $i < 5 && $codigo === null; $i++) {
        $intento = gq_d_codigo();
        try {
            gq_consulta(
                $pdo,
                'INSERT INTO salas (codigo, organizador, cats, dif, plazas, vidas, estado, creado_en, ultima_actividad_en, ip_hash_creador)
                 VALUES (?, ?, ?, ?, ?, ?, "abierta", ?, ?, ?)',
                [$intento, $nombre, json_encode($cats, JSON_UNESCAPED_UNICODE), $dif, GQ_S_PLAZAS_MAX, GQ_D_VIDAS_SALA, $ahora, $ahora, $ipHash]
            );
            $codigo = $intento;
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') { throw $e; }
        }
    }
    if ($codigo === null) { gq_error(500, 'codigo', 'No se pudo generar un código. Vuelve a intentarlo.'); }

    $sala = gq_s_por_codigo($pdo, $codigo);
    $token = bin2hex(random_bytes(16));
    gq_consulta(
        $pdo, 'INSERT INTO sala_jugadores (sala_id, nombre, token, orden, visto_en, ip_hash) VALUES (?, ?, ?, 1, ?, ?)',
        [$sala['id'], $nombre, $token, $ahora, $ipHash]
    );
    $yo = gq_consulta($pdo, 'SELECT * FROM sala_jugadores WHERE sala_id = ? AND nombre = ?', [$sala['id'], $nombre])->fetch();
    gq_json(201, ['ok' => true, 'codigo' => $codigo, 'token' => $token] + gq_s_estado_publico($pdo, $sala, $yo));
}

// A partir de aquí, todas las acciones necesitan una sala existente.
if ($accion === 'unirse') {
    $codigo = isset($datos['codigo']) && is_string($datos['codigo']) ? strtoupper(trim($datos['codigo'])) : '';
    if ($codigo === '') { gq_error(400, 'codigo', 'Hace falta el código de la sala.'); }
    $sala = gq_s_por_codigo($pdo, $codigo);
    if ($sala === null) { gq_error(404, 'no_existe', 'Esa sala no existe.'); }

    $yaEsta = gq_consulta(
        $pdo, 'SELECT * FROM sala_jugadores WHERE sala_id = ? AND nombre = ? LIMIT 1', [$sala['id'], $nombre]
    )->fetch();
    if ($yaEsta !== false) {
        // Volver a entrar (recarga, otro móvil con la llave guardada): solo con la llave de ese nombre.
        $token = isset($datos['token']) && is_string($datos['token']) ? $datos['token'] : '';
        if ($token === '' || !hash_equals((string) $yaEsta['token'], $token)) {
            gq_error(409, 'nombre_ocupado', 'Ese nombre ya está en esta sala. Usa otro.');
        }
        gq_s_tocar($pdo, $sala, $yaEsta);
        $sala = gq_s_mantener($pdo, $sala);
        gq_json(200, ['ok' => true, 'token' => $token] + gq_s_estado_publico($pdo, $sala, $yaEsta));
    }

    if ($sala['estado'] !== 'abierta') {
        $msg = match ($sala['estado']) {
            'llamando'  => 'Este torneo está a punto de empezar: ya no admite a nadie más.',
            'jugando'   => 'Este torneo ya ha empezado.',
            'terminada' => 'Este torneo ya ha terminado.',
            default     => 'Este torneo ya no está disponible.',
        };
        gq_error(409, 'cerrada', $msg);
    }
    $jug = gq_s_jugadores($pdo, (int) $sala['id']);
    if (count($jug) >= (int) $sala['plazas']) { gq_error(409, 'llena', 'Este torneo está completo.'); }
    $mismaIp = 0;
    foreach ($jug as $j) { if ($j['ip_hash'] === $ipHash) { $mismaIp++; } }
    if ($mismaIp >= GQ_S_MISMA_IP_MAX) {
        gq_error(429, 'misma_conexion', 'Ya hay varios jugadores desde esta conexión en este torneo.');
    }

    $token = bin2hex(random_bytes(16));
    $ahora = gq_s_ahora();
    try {
        gq_consulta(
            $pdo, 'INSERT INTO sala_jugadores (sala_id, nombre, token, orden, visto_en, ip_hash) VALUES (?, ?, ?, ?, ?, ?)',
            [$sala['id'], $nombre, $token, count($jug) + 1, $ahora, $ipHash]
        );
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') { gq_error(409, 'nombre_ocupado', 'Ese nombre ya está en esta sala. Usa otro.'); }
        throw $e;
    }
    $yo = gq_consulta($pdo, 'SELECT * FROM sala_jugadores WHERE sala_id = ? AND nombre = ?', [$sala['id'], $nombre])->fetch();

    // Si dos se apuntan a la vez, la última plaza puede pasarse: el que llegó tarde se queda fuera.
    $ahoraJug = gq_s_jugadores($pdo, (int) $sala['id']);
    if (count($ahoraJug) > (int) $sala['plazas']) {
        gq_consulta($pdo, 'DELETE FROM sala_jugadores WHERE id = ?', [$yo['id']]);
        gq_error(409, 'llena', 'Este torneo está completo.');
    }
    gq_s_tocar($pdo, $sala, $yo);
    // Sala llena: la llamada empieza sola, sin esperar a que el organizador pulse nada.
    if (count($ahoraJug) === (int) $sala['plazas']) {
        gq_consulta(
            $pdo, "UPDATE salas SET estado = 'llamando', llamada_en = ? WHERE id = ? AND estado = 'abierta'", [$ahora, $sala['id']]
        );
    }
    $sala = gq_s_por_codigo($pdo, $codigo) ?? $sala;
    gq_json(200, ['ok' => true, 'token' => $token] + gq_s_estado_publico($pdo, $sala, $yo));
}

[$sala, $yo] = gq_s_autenticar($pdo, $datos, $nombre);
gq_s_tocar($pdo, $sala, $yo);
$sala = gq_s_mantener($pdo, $sala);
// Quien llama puede haber sido sacado por no confirmar durante esta misma llamada.
$yo = gq_consulta($pdo, 'SELECT * FROM sala_jugadores WHERE id = ?', [$yo['id']])->fetch();
if ($yo === false) { gq_error(403, 'no_estas', 'Ya no estás en esta sala: no confirmaste a tiempo.'); }

$jugadores = gq_s_jugadores($pdo, (int) $sala['id']);
$soyOrg = gq_s_organizador($sala, $jugadores) === $yo['nombre'];

if ($accion === 'estado') {
    gq_json(200, ['ok' => true] + gq_s_estado_publico($pdo, $sala, $yo));
}

if ($accion === 'listo') {
    if ($sala['estado'] === 'llamando') {
        gq_consulta($pdo, 'UPDATE sala_jugadores SET listo = 1 WHERE id = ?', [$yo['id']]);
        $sala = gq_s_mantener($pdo, $sala);
    }
    gq_json(200, ['ok' => true] + gq_s_estado_publico($pdo, $sala, $yo));
}

if ($accion === 'empezar') {
    if (!$soyOrg) { gq_error(403, 'no_organizas', 'Solo quien organiza el torneo puede empezarlo.'); }
    if ($sala['estado'] !== 'abierta') { gq_error(409, 'no_abierta', 'Este torneo ya no está esperando jugadores.'); }
    if (count($jugadores) < GQ_S_PLAZAS_MIN) { gq_error(409, 'pocos', 'Hacen falta al menos 2 jugadores.'); }
    gq_consulta($pdo, 'UPDATE sala_jugadores SET listo = 0 WHERE sala_id = ?', [$sala['id']]);
    gq_consulta($pdo, 'UPDATE sala_jugadores SET listo = 1 WHERE id = ?', [$yo['id']]);   // quien la lanza está, evidentemente
    gq_consulta(
        $pdo, "UPDATE salas SET estado = 'llamando', llamada_en = ? WHERE id = ? AND estado = 'abierta'", [gq_s_ahora(), $sala['id']]
    );
    $sala = gq_s_mantener($pdo, gq_s_por_codigo($pdo, (string) $sala['codigo']) ?? $sala);
    gq_json(200, ['ok' => true] + gq_s_estado_publico($pdo, $sala, $yo));
}

if ($accion === 'expulsar') {
    if (!$soyOrg) { gq_error(403, 'no_organizas', 'Solo quien organiza el torneo puede echar a alguien.'); }
    if ($sala['estado'] !== 'abierta') { gq_error(409, 'no_abierta', 'Ya no se puede echar a nadie.'); }
    $objetivo = isset($datos['objetivo']) && is_string($datos['objetivo']) ? gq_limpiar_nombre($datos['objetivo']) : '';
    if ($objetivo === '') { gq_error(400, 'objetivo', 'Hace falta saber a quién.'); }
    $fila = gq_consulta(
        $pdo, 'SELECT id FROM sala_jugadores WHERE sala_id = ? AND nombre = ? LIMIT 1', [$sala['id'], $objetivo]
    )->fetch();
    if ($fila !== false && (int) $fila['id'] === (int) $yo['id']) { gq_error(400, 'a_ti_mismo', 'No puedes echarte a ti mismo: usa «Salir».'); }
    if ($fila !== false) { gq_consulta($pdo, 'DELETE FROM sala_jugadores WHERE id = ?', [$fila['id']]); }
    gq_json(200, ['ok' => true] + gq_s_estado_publico($pdo, $sala, $yo));
}

if ($accion === 'salir') {
    // Solo mientras se está recogiendo gente. A mitad de torneo no se «sale»: quien deja de mover ficha
    // pierde su partido por abandono, como en cualquier duelo.
    if ($sala['estado'] === 'abierta' || $sala['estado'] === 'llamando') {
        gq_consulta($pdo, 'DELETE FROM sala_jugadores WHERE id = ?', [$yo['id']]);
        $quedan = gq_s_jugadores($pdo, (int) $sala['id']);
        if (!$quedan) {
            gq_consulta($pdo, "UPDATE salas SET estado = 'cancelada' WHERE id = ?", [$sala['id']]);
        } elseif ($sala['organizador'] === $yo['nombre']) {
            gq_consulta($pdo, 'UPDATE salas SET organizador = ? WHERE id = ?', [$quedan[0]['nombre'], $sala['id']]);
        }
    }
    gq_json(200, ['ok' => true]);
}

if ($accion === 'cancelar') {
    if (!$soyOrg) { gq_error(403, 'no_organizas', 'Solo quien organiza el torneo puede cancelarlo.'); }
    gq_consulta(
        $pdo, "UPDATE salas SET estado = 'cancelada' WHERE id = ? AND estado IN ('abierta', 'llamando')", [$sala['id']]
    );
    gq_json(200, ['ok' => true]);
}

gq_error(400, 'accion', 'Acción de sala desconocida.');
