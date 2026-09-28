<?php
// GeoQuiz — ranking global.
//   GET  /api/ranking.php?limit=50   devuelve la clasificación
//   POST /api/ranking.php            envía una puntuación (JSON en el cuerpo)

declare(strict_types=1);
require __DIR__ . '/db.php';

// Pase lo que pase, este endpoint responde JSON. Sin esto, cualquier excepción de
// la base de datos saldría como un error de PHP, rompiendo el contrato de la API y
// pudiendo filtrar la consulta y la ruta absoluta del servidor.
ini_set('display_errors', '0');
error_reporting(E_ALL);
set_exception_handler(function (Throwable $e): void {
    error_log('GeoQuiz ranking: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    gq_error(500, 'servidor', 'Error interno. Vuelve a intentarlo.');
});
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e !== null && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('GeoQuiz ranking (fatal): ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            gq_error(500, 'servidor', 'Error interno. Vuelve a intentarlo.');
        }
    }
});

// ── CORS ──────────────────────────────────────────────────────────────────
// El juego se sirve desde dos dominios y la API vive solo en uno de ellos.
const GQ_ORIGENES = [
    'https://mediumturquoise-dugong-529601.hostingersite.com',
    'https://moralg18794-guillermo.github.io',
];
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origen, GQ_ORIGENES, true)) {
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── LÍMITES ───────────────────────────────────────────────────────────────
const GQ_MAX_NOMBRE  = 24;
const GQ_MAX_PUNTOS  = 500000;   // Supervivencia no tiene techo, pero sí sentido común.
const GQ_TOPE_LISTA  = 100;
const GQ_ENVIOS_HORA = 20;       // por conexión
const GQ_TOPE_FILAS  = 2000;     // el ranking no crece para siempre
const GQ_MODOS = ['solo', 'blitz', 'survival', 'duel', 'crono', 'fechas'];
// El cliente solo manda estas dificultades (diffLabel() en js/storage.js).
const GQ_DIFICULTADES = ['', '—', 'Todas', 'Fácil', 'Medio', 'Difícil'];

// Recorta por CARACTERES, nunca por bytes: cortar UTF-8 a mitad de secuencia deja
// un valor inválido que MySQL rechaza con el error 1366. Con el modificador /u,
// el punto de PCRE consume un carácter completo, así que el respaldo sin mbstring
// tampoco puede partir nada.
function gq_recortar(string $s, int $max): string {
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max, 'UTF-8');
    }
    return preg_match('/^.{0,' . $max . '}/us', $s, $m) ? $m[0] : '';
}

function gq_limpiar_nombre(string $bruto): string {
    // No se usa strip_tags: mutilaría nombres legítimos como "Ana <3". El nombre se
    // guarda tal cual y es el cliente quien lo escapa al pintarlo (esc() en
    // js/utils.js), que es donde de verdad importa.
    $n = preg_replace('/[\x{0000}-\x{001F}\x{007F}]/u', '', $bruto) ?? '';
    // Fuera caracteres de formato invisibles y de control bidireccional: si no,
    // alguien puede colarse en cabeza con una celda aparentemente vacía o dar la
    // vuelta al texto de la fila.
    $n = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{206F}\x{FEFF}]/u', '', $n) ?? '';
    $n = preg_replace('/\s+/u', ' ', $n) ?? '';
    $n = trim($n);
    $n = gq_recortar($n, GQ_MAX_NOMBRE);
    // Tiene que quedar algo visible de verdad.
    if (preg_match('/\p{L}|\p{N}|\p{S}|\p{P}/u', $n) !== 1) {
        return '';
    }
    return $n;
}

function gq_listar(PDO $pdo, int $limite): array {
    $limite = max(1, min($limite, GQ_TOPE_LISTA));
    // El límite va interpolado y no como parámetro porque MySQL no admite
    // marcadores en LIMIT; queda a salvo porque antes se fuerza a entero acotado.
    // Una fila por jugador (nombre es ÚNICO), así que no hace falta agrupar.
    $sql = 'SELECT nombre, puntos, pct, modo, dificultad, creado_en
            FROM ranking ORDER BY puntos DESC, id ASC LIMIT ' . $limite;
    $filas = gq_consulta($pdo, $sql)->fetchAll();
    $salida = [];
    foreach ($filas as $i => $f) {
        $salida[] = [
            'pos'    => $i + 1,
            'nombre' => $f['nombre'],
            'puntos' => (int) $f['puntos'],
            'pct'    => (int) $f['pct'],
            'modo'   => $f['modo'],
            'dif'    => $f['dificultad'],
            'fecha'  => substr((string) $f['creado_en'], 0, 10),
        ];
    }
    return $salida;
}

$pdo = gq_db();

// ── GET: clasificación ────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $limite = (int) ($_GET['limit'] ?? 50);
    gq_json(200, ['ok' => true, 'ranking' => gq_listar($pdo, $limite)]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gq_error(405, 'metodo', 'Solo se admiten GET y POST.');
}

// ── POST: enviar puntuación ───────────────────────────────────────────────
$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > 2048) {
    gq_error(400, 'cuerpo', 'Cuerpo de la petición ausente o demasiado grande.');
}
$datos = json_decode($crudo, true);
if (!is_array($datos)) {
    gq_error(400, 'json', 'El cuerpo debe ser un objeto JSON.');
}

// is_string antes de convertir: si llega un array, (string) lanzaría un error y
// además acabaría guardándose un jugador llamado "Array".
if (!isset($datos['nombre']) || !is_string($datos['nombre'])) {
    gq_error(400, 'nombre', 'Hace falta un nombre.');
}
$nombre = gq_limpiar_nombre($datos['nombre']);
if ($nombre === '') {
    gq_error(400, 'nombre_vacio', 'Ese nombre no tiene ningún carácter válido.');
}

$puntos = filter_var($datos['puntos'] ?? null, FILTER_VALIDATE_INT);
if ($puntos === false || $puntos === null || $puntos < 0 || $puntos > GQ_MAX_PUNTOS) {
    gq_error(400, 'puntos', 'Puntuación fuera de rango.');
}

$pct = filter_var($datos['pct'] ?? 0, FILTER_VALIDATE_INT);
if ($pct === false || $pct === null || $pct < 0 || $pct > 100) {
    gq_error(400, 'pct', 'Porcentaje fuera de rango.');
}

$modo = isset($datos['modo']) && is_string($datos['modo']) ? $datos['modo'] : '';
if (!in_array($modo, GQ_MODOS, true)) {
    gq_error(400, 'modo', 'Modo de juego desconocido.');
}

// Lista blanca, no recorte: así no hay forma de meter aquí nada raro.
$dif = isset($datos['dif']) && is_string($datos['dif']) ? trim($datos['dif']) : '';
if (!in_array($dif, GQ_DIFICULTADES, true)) {
    $dif = '';
}

// Límite de envíos por conexión, para que nadie llene la tabla desde una pestaña.
$ipHash = gq_ip_hash();
gq_consulta($pdo, 'DELETE FROM envios WHERE creado_en < (UTC_TIMESTAMP() - INTERVAL 1 HOUR)');
$recientes = (int) gq_consulta(
    $pdo,
    'SELECT COUNT(*) FROM envios WHERE ip_hash = ? AND creado_en > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)',
    [$ipHash]
)->fetchColumn();
if ($recientes >= GQ_ENVIOS_HORA) {
    gq_error(429, 'demasiados', 'Demasiados envíos desde esta conexión. Prueba dentro de un rato.');
}
gq_consulta($pdo, 'INSERT INTO envios (ip_hash, creado_en) VALUES (?, UTC_TIMESTAMP())', [$ipHash]);

// Una fila por jugador con su mejor marca. El resto de campos solo se actualizan
// si la partida nueva supera a la anterior; `puntos` va el último porque las
// comparaciones de arriba miran todavía el valor viejo.
gq_consulta(
    $pdo,
    'INSERT INTO ranking (nombre, puntos, pct, modo, dificultad, ip_hash, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
        pct        = IF(VALUES(puntos) > puntos, VALUES(pct), pct),
        modo       = IF(VALUES(puntos) > puntos, VALUES(modo), modo),
        dificultad = IF(VALUES(puntos) > puntos, VALUES(dificultad), dificultad),
        ip_hash    = IF(VALUES(puntos) > puntos, VALUES(ip_hash), ip_hash),
        creado_en  = IF(VALUES(puntos) > puntos, VALUES(creado_en), creado_en),
        puntos     = GREATEST(puntos, VALUES(puntos))',
    [$nombre, $puntos, $pct, $modo, $dif, $ipHash]
);

// Tope global de filas: se quedan las mejores. Sin cron ni proceso persistente.
$total = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM ranking')->fetchColumn();
if ($total > GQ_TOPE_FILAS) {
    $corte = (int) gq_consulta(
        $pdo,
        'SELECT puntos FROM ranking ORDER BY puntos DESC, id ASC LIMIT 1 OFFSET ' . (GQ_TOPE_FILAS - 1)
    )->fetchColumn();
    gq_consulta($pdo, 'DELETE FROM ranking WHERE puntos < ?', [$corte]);
}

// La posición se calcula con el mismo orden que usa la lista (puntos DESC, id ASC),
// para que el puesto que se anuncia coincida con el que se ve en la tabla.
$posicion = (int) gq_consulta(
    $pdo,
    'SELECT COUNT(*) + 1 FROM ranking r
     WHERE r.puntos > (SELECT puntos FROM ranking WHERE nombre = ?)
        OR (r.puntos = (SELECT puntos FROM ranking WHERE nombre = ?)
            AND r.id < (SELECT id FROM ranking WHERE nombre = ?))',
    [$nombre, $nombre, $nombre]
)->fetchColumn();

gq_json(201, [
    'ok'      => true,
    'pos'     => $posicion,
    'ranking' => gq_listar($pdo, 50),
]);
