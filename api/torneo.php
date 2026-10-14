<?php
// GeoQuiz — torneo de la semana.
//   GET  /api/torneo.php                 el torneo vigente y sus preguntas
//   GET  /api/torneo.php?nombre=Guille   además, si ese nick ya jugó y en qué puesto
//   GET  /api/torneo.php?clasificacion=1 solo la tabla, sin preguntas
//   POST /api/torneo.php                 enviar el resultado (JSON en el cuerpo)
//
// UNA PARTIDA POR NICK Y TORNEO, y no lo decide el navegador: lo impone la clave única
// uq_jugador de torneo_partidas (api/db.php). Un segundo envío con el mismo nick no se
// guarda y responde 409. Quien quiera puede volver a jugar con otro nombre, pero entonces
// no es su marca, que es justo el trato.
//
// Todos reciben LAS MISMAS preguntas en el MISMO orden. Es lo que diferencia un torneo del
// ranking normal: con un solo intento, que a uno le toquen diez fáciles y a otro diez
// difíciles convertiría el torneo en una tómbola.

declare(strict_types=1);
require __DIR__ . '/db.php';

gq_blindar('torneo');
gq_cors();

// ── LÍMITES ───────────────────────────────────────────────────────────────
const GQ_T_TOPE_LISTA   = 100;
const GQ_T_ENVIOS_HORA  = 20;     // por conexión, compartido con el ranking normal
const GQ_T_MAX_SEGUNDOS = 7200;

// El torneo vigente es el único que está dentro de su ventana y no es borrador. Si no hay
// ninguno abierto se devuelve el último que cerró, para poder seguir enseñando el podio
// unos días: el final del torneo es lo que vende el siguiente.
function gq_torneo_vigente(PDO $pdo): ?array {
    $abierto = gq_consulta(
        $pdo,
        'SELECT * FROM torneos
         WHERE borrador = 0 AND empieza_en <= UTC_TIMESTAMP() AND acaba_en > UTC_TIMESTAMP()
         ORDER BY empieza_en DESC LIMIT 1'
    )->fetch();
    if ($abierto !== false) {
        $abierto['estado'] = 'activo';
        return $abierto;
    }
    $cerrado = gq_consulta(
        $pdo,
        'SELECT * FROM torneos WHERE borrador = 0 AND acaba_en <= UTC_TIMESTAMP()
         ORDER BY acaba_en DESC LIMIT 1'
    )->fetch();
    if ($cerrado !== false) {
        $cerrado['estado'] = 'cerrado';
        return $cerrado;
    }
    return null;
}

// Las fechas salen en ISO 8601 con zona, para que el navegador pinte la hora local y la
// cuenta atrás sin que el servidor tenga que saber dónde está cada jugador.
function gq_iso(string $utc): string {
    return gmdate('c', (int) strtotime($utc . ' UTC'));
}

function gq_t_preguntas(PDO $pdo, int $torneoId): array {
    $filas = gq_consulta(
        $pdo,
        'SELECT orden, cat, diff, pts, q, opts, ans, hint, exp
         FROM torneo_preguntas WHERE torneo_id = ? ORDER BY orden ASC',
        [$torneoId]
    )->fetchAll();
    $salida = [];
    foreach ($filas as $f) {
        $opts = json_decode((string) $f['opts'], true);
        $salida[] = [
            'cat'  => $f['cat'],
            'diff' => $f['diff'],
            'pts'  => (int) $f['pts'],
            'q'    => $f['q'],
            'opts' => is_array($opts) ? $opts : [],
            'ans'  => (int) $f['ans'],
            'hint' => $f['hint'],
            'exp'  => $f['exp'],
        ];
    }
    return $salida;
}

function gq_t_clasificacion(PDO $pdo, int $torneoId, int $limite = GQ_T_TOPE_LISTA): array {
    $limite = max(1, min($limite, GQ_T_TOPE_LISTA));
    // La clave única ya garantiza una fila por jugador, así que no hace falta agrupar.
    // El límite va interpolado porque MySQL no admite marcadores en LIMIT; va a salvo
    // porque antes se fuerza a entero acotado.
    // Solo las terminadas: una partida reservada y a medias no es una marca, y si saliera
    // en la tabla el que está jugando aparecería el último con cero puntos.
    $filas = gq_consulta(
        $pdo,
        'SELECT nombre, puntos, correctas, total, segundos, creado_en
         FROM torneo_partidas WHERE torneo_id = ? AND terminado = 1
         ORDER BY puntos DESC, id ASC LIMIT ' . $limite,
        [$torneoId]
    )->fetchAll();
    $salida = [];
    foreach ($filas as $i => $f) {
        $salida[] = [
            'pos'       => $i + 1,
            'nombre'    => $f['nombre'],
            'puntos'    => (int) $f['puntos'],
            'correctas' => (int) $f['correctas'],
            'total'     => (int) $f['total'],
            'segundos'  => (int) $f['segundos'],
            'fecha'     => substr((string) $f['creado_en'], 0, 10),
        ];
    }
    return $salida;
}

// La grafía guardada puede no ser la que el jugador acaba de teclear: la colación de MySQL
// ignora mayúsculas y acentos, así que 'Guille', 'guille' y 'GUILLE' son el mismo jugador.
// Se le pregunta a la base de datos cuál tiene guardada, en vez de imitar su colación en
// PHP, que ni sería exacto ni funcionaría sin mbstring.
function gq_t_fila_jugador(PDO $pdo, int $torneoId, string $nombre): ?array {
    $f = gq_consulta(
        $pdo,
        'SELECT nombre, terminado, empezado_en FROM torneo_partidas
         WHERE torneo_id = ? AND nombre = ? LIMIT 1',
        [$torneoId, $nombre]
    )->fetch();
    return $f === false ? null : $f;
}

function gq_t_nombre_guardado(PDO $pdo, int $torneoId, string $nombre): ?string {
    $f = gq_t_fila_jugador($pdo, $torneoId, $nombre);
    return $f === null ? null : (string) $f['nombre'];
}

function gq_t_buscar(array $clasificacion, ?string $guardado): ?array {
    if ($guardado === null) {
        return null;
    }
    foreach ($clasificacion as $fila) {
        if ($fila['nombre'] === $guardado) {
            return $fila;
        }
    }
    return null;
}

// Techo de puntuación posible en ESTE torneo, para que nadie mande un número inventado.
// Es generoso a propósito: la suma de los puntos base, con el bonus de tiempo máximo
// (30%) y el multiplicador de racha más alto (x3) aplicados a todas las preguntas, cosa
// que en la práctica es inalcanzable porque las tres primeras van siempre a x1.
function gq_t_techo(PDO $pdo, int $torneoId): int {
    $suma = (int) gq_consulta($pdo, 'SELECT COALESCE(SUM(pts),0) FROM torneo_preguntas WHERE torneo_id = ?', [$torneoId])->fetchColumn();
    return (int) ceil($suma * 1.3 * 3) + 100;
}

// El método se comprueba antes de conectar: una petición con un verbo que no admitimos no
// tiene por qué abrir una conexión a MySQL, y así el 405 es un 405 y no un 500 cuando la
// base de datos no está disponible.
$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
if ($metodo !== 'GET' && $metodo !== 'POST') {
    gq_error(405, 'metodo', 'Solo se admiten GET y POST.');
}

$pdo = gq_db();

// ── GET ───────────────────────────────────────────────────────────────────
if ($metodo === 'GET') {
    $t = gq_torneo_vigente($pdo);
    if ($t === null) {
        gq_json(200, ['ok' => true, 'torneo' => null]);
    }
    $id = (int) $t['id'];

    $torneo = [
        'slug'       => $t['slug'],
        'titulo'     => $t['titulo'],
        'tema'       => $t['tema'],
        'estado'     => $t['estado'],
        'empieza_en' => gq_iso((string) $t['empieza_en']),
        'acaba_en'   => gq_iso((string) $t['acaba_en']),
        'jugadores'  => (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM torneo_partidas WHERE torneo_id = ?', [$id])->fetchColumn(),
    ];

    // Las preguntas solo viajan mientras el torneo está abierto: cerrado no hay nada que
    // jugar y no tiene sentido repartirlas.
    if ($t['estado'] === 'activo' && ($_GET['clasificacion'] ?? '') !== '1') {
        $torneo['preguntas'] = gq_t_preguntas($pdo, $id);
    }

    $respuesta = ['ok' => true, 'torneo' => $torneo, 'clasificacion' => gq_t_clasificacion($pdo, $id)];

    // ?nombre=X dice si ese nick ya gastó su intento, que es lo que el aviso de la portada
    // necesita saber para enseñar "ya jugaste, vas 4º" en vez de invitarle otra vez.
    $nombre = isset($_GET['nombre']) && is_string($_GET['nombre']) ? gq_limpiar_nombre($_GET['nombre']) : '';
    if ($nombre !== '') {
        // `jugado` sale de preguntarle a la tabla, NO de buscar en la clasificación: esa
        // viene recortada (50 filas por defecto) y un jugador que quedara por debajo del
        // corte parecería no haber jugado. Se le dejaría empezar y perdería su único
        // intento al enviar. `yo` sí puede venir vacío: es solo su fila si está a la vista.
        $fila = gq_t_fila_jugador($pdo, $id, $nombre);
        // libre: nunca ha empezado · enCurso: reservado y a medias · terminado: ya envió
        $respuesta['estado_jugador'] = $fila === null ? 'libre' : ((int) $fila['terminado'] === 1 ? 'terminado' : 'enCurso');
        $respuesta['jugado'] = $respuesta['estado_jugador'] === 'terminado';
        $respuesta['yo'] = gq_t_buscar($respuesta['clasificacion'], $fila === null ? null : (string) $fila['nombre']);
    }

    gq_json(200, $respuesta);
}

// ── POST: enviar el resultado ─────────────────────────────────────────────
$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > 2048) {
    gq_error(400, 'cuerpo', 'Cuerpo de la petición ausente o demasiado grande.');
}
$datos = json_decode($crudo, true);
if (!is_array($datos)) {
    gq_error(400, 'json', 'El cuerpo debe ser un objeto JSON.');
}

$t = gq_torneo_vigente($pdo);
if ($t === null || $t['estado'] !== 'activo') {
    gq_error(409, 'cerrado', 'El torneo ya ha terminado.');
}
$torneoId = (int) $t['id'];

// El slug viaja en el cuerpo para que una partida empezada antes del cierre no acabe
// guardada en el torneo siguiente si alguien la termina el lunes por la mañana.
$slug = isset($datos['slug']) && is_string($datos['slug']) ? $datos['slug'] : '';
if ($slug !== $t['slug']) {
    gq_error(409, 'otro_torneo', 'Esa partida era de un torneo que ya ha cerrado.');
}

if (!isset($datos['nombre']) || !is_string($datos['nombre'])) {
    gq_error(400, 'nombre', 'Hace falta un nombre.');
}
$nombre = gq_limpiar_nombre($datos['nombre']);
if ($nombre === '') {
    gq_error(400, 'nombre_vacio', 'Ese nombre no tiene ningún carácter válido.');
}

$nPreguntas = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM torneo_preguntas WHERE torneo_id = ?', [$torneoId])->fetchColumn();
$ipHash = gq_ip_hash();

// ── EMPEZAR: se reserva el mote antes de enseñar ninguna pregunta ─────────
// Sin esto se puede entrar, leer las quince, salir sin enviar y volver a jugarlas ya
// sabidas. Reservando aquí, ese segundo intento tendría que ir con otro mote, y eso se ve
// en la clasificación. No lo impide del todo —una ventana de incógnito sigue valiendo—,
// pero obliga a quererlo de verdad.
if (($datos['accion'] ?? '') === 'empezar') {
    $fila = gq_t_fila_jugador($pdo, $torneoId, $nombre);
    if ($fila !== null && (int) $fila['terminado'] === 1) {
        $clasificacion = gq_t_clasificacion($pdo, $torneoId);
        gq_json(409, [
            'ok'            => false,
            'error'         => 'ya_jugado',
            'mensaje'       => 'Ese nombre ya ha jugado este torneo. Solo vale un intento.',
            'yo'            => gq_t_buscar($clasificacion, (string) $fila['nombre']),
            'clasificacion' => $clasificacion,
        ]);
    }
    if ($fila === null) {
        try {
            gq_consulta(
                $pdo,
                'INSERT INTO torneo_partidas
                   (torneo_id, nombre, puntos, correctas, total, segundos, empezado_en, terminado, ip_hash, creado_en)
                 VALUES (?, ?, 0, 0, ?, 0, UTC_TIMESTAMP(), 0, ?, UTC_TIMESTAMP())',
                [$torneoId, $nombre, $nPreguntas, $ipHash]
            );
        } catch (PDOException $e) {
            // 23000: alguien reservó ese mismo mote entre la consulta y el INSERT. No es un
            // error: es la carrera resuelta por MySQL, y el de abajo ya lo trata como reanudación.
            if ($e->getCode() !== '23000') { throw $e; }
        }
    }
    gq_json(200, [
        'ok'        => true,
        'reanudado' => $fila !== null,
        'nombre'    => (string) (gq_t_fila_jugador($pdo, $torneoId, $nombre)['nombre'] ?? $nombre),
    ]);
}

$techo  = gq_t_techo($pdo, $torneoId);
$puntos = filter_var($datos['puntos'] ?? null, FILTER_VALIDATE_INT);
if ($puntos === false || $puntos === null || $puntos < 0 || $puntos > $techo) {
    gq_error(400, 'puntos', 'Puntuación fuera de rango.');
}

$correctas = filter_var($datos['correctas'] ?? 0, FILTER_VALIDATE_INT);
if ($correctas === false || $correctas === null || $correctas < 0 || $correctas > $nPreguntas) {
    $correctas = 0;
}
$segundos = filter_var($datos['segundos'] ?? 0, FILTER_VALIDATE_INT);
if ($segundos === false || $segundos === null || $segundos < 0 || $segundos > GQ_T_MAX_SEGUNDOS) {
    $segundos = 0;
}

// Mismo límite por conexión que el ranking normal, con la misma tabla.
gq_consulta($pdo, 'DELETE FROM envios WHERE creado_en < (UTC_TIMESTAMP() - INTERVAL 1 HOUR)');
$recientes = (int) gq_consulta(
    $pdo,
    'SELECT COUNT(*) FROM envios WHERE ip_hash = ? AND creado_en > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)',
    [$ipHash]
)->fetchColumn();
if ($recientes >= GQ_T_ENVIOS_HORA) {
    gq_error(429, 'demasiados', 'Demasiados envíos desde esta conexión. Prueba dentro de un rato.');
}

$fila = gq_t_fila_jugador($pdo, $torneoId, $nombre);
if ($fila !== null && (int) $fila['terminado'] === 1) {
    // Ese mote ya envió su marca. No es un error del servidor: es la regla funcionando.
    $clasificacion = gq_t_clasificacion($pdo, $torneoId);
    gq_json(409, [
        'ok'            => false,
        'error'         => 'ya_jugado',
        'mensaje'       => 'Ya has jugado este torneo. Solo vale un intento.',
        'yo'            => gq_t_buscar($clasificacion, (string) $fila['nombre']),
        'clasificacion' => $clasificacion,
    ]);
}

if ($fila === null) {
    // No hay reserva: es un navegador con el JavaScript viejo, que envía directamente al
    // terminar. Se le acepta la partida y se le cree el tiempo que diga, porque no hay otro.
    gq_consulta(
        $pdo,
        'INSERT INTO torneo_partidas
           (torneo_id, nombre, puntos, correctas, total, segundos, empezado_en, terminado, ip_hash, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, UTC_TIMESTAMP())',
        [$torneoId, $nombre, $puntos, $correctas, $nPreguntas, $segundos, $ipHash]
    );
} else {
    // Hay reserva: el tiempo lo calcula el SERVIDOR desde que se empezó, no el navegador.
    // Así ni se puede falsear ni sale gratis salirse a mirar las preguntas y volver: el
    // cronómetro ha seguido corriendo. El LEAST acota a lo que cabe en la columna, por si
    // alguien deja la partida abierta un día entero.
    gq_consulta(
        $pdo,
        'UPDATE torneo_partidas
            SET puntos = ?, correctas = ?, total = ?,
                segundos = LEAST(GREATEST(TIMESTAMPDIFF(SECOND, empezado_en, UTC_TIMESTAMP()), 0), 65535),
                terminado = 1, creado_en = UTC_TIMESTAMP()
          WHERE torneo_id = ? AND nombre = ? AND terminado = 0',
        [$puntos, $correctas, $nPreguntas, $torneoId, $nombre]
    );
}
gq_consulta($pdo, 'INSERT INTO envios (ip_hash, creado_en) VALUES (?, UTC_TIMESTAMP())', [$ipHash]);

// El puesto se saca de la misma lista que se devuelve, para que el número que se anuncia
// no pueda discrepar de la tabla que el jugador ve justo después.
$clasificacion = gq_t_clasificacion($pdo, $torneoId);
$yo = gq_t_buscar($clasificacion, gq_t_nombre_guardado($pdo, $torneoId, $nombre));

gq_json(201, [
    'ok'            => true,
    'pos'           => $yo === null ? null : $yo['pos'],
    'yo'            => $yo,
    'clasificacion' => $clasificacion,
]);
