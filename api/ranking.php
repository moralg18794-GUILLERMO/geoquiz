<?php
// GeoQuiz — ranking global.
//   GET  /api/ranking.php?limit=50   devuelve la clasificación
//   POST /api/ranking.php            envía una puntuación (JSON en el cuerpo)

declare(strict_types=1);
require __DIR__ . '/db.php';

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
const GQ_MAX_NOMBRE   = 24;
const GQ_MAX_PUNTOS   = 500000;   // Supervivencia no tiene techo, pero sí sentido común.
const GQ_TOPE_LISTA   = 100;
const GQ_ENVIOS_HORA  = 20;       // por IP
const GQ_MODOS = ['solo', 'blitz', 'survival', 'duel', 'crono', 'fechas'];

function gq_limpiar_nombre(string $bruto): string {
    // Fuera etiquetas y caracteres de control; el cliente además escapa al pintar.
    $n = strip_tags($bruto);
    $n = preg_replace('/[\x00-\x1F\x7F]/u', '', $n) ?? '';
    $n = preg_replace('/\s+/u', ' ', $n) ?? '';
    $n = trim($n);
    if (function_exists('mb_substr')) {
        $n = mb_substr($n, 0, GQ_MAX_NOMBRE, 'UTF-8');
    } else {
        $n = substr($n, 0, GQ_MAX_NOMBRE);
    }
    return $n;
}

function gq_listar(PDO $pdo, int $limite): array {
    $limite = max(1, min($limite, GQ_TOPE_LISTA));
    // El límite va interpolado y no como parámetro porque MySQL no admite
    // marcadores en LIMIT; queda a salvo porque antes se fuerza a entero acotado.
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

$nombre = gq_limpiar_nombre((string) ($datos['nombre'] ?? ''));
if ($nombre === '') {
    gq_error(400, 'nombre', 'Hace falta un nombre.');
}

$puntos = filter_var($datos['puntos'] ?? null, FILTER_VALIDATE_INT);
if ($puntos === false || $puntos < 0 || $puntos > GQ_MAX_PUNTOS) {
    gq_error(400, 'puntos', 'Puntuación fuera de rango.');
}

$pct = filter_var($datos['pct'] ?? 0, FILTER_VALIDATE_INT);
if ($pct === false || $pct < 0 || $pct > 100) {
    gq_error(400, 'pct', 'Porcentaje fuera de rango.');
}

$modo = (string) ($datos['modo'] ?? '');
if (!in_array($modo, GQ_MODOS, true)) {
    gq_error(400, 'modo', 'Modo de juego desconocido.');
}

$dif = gq_limpiar_nombre((string) ($datos['dif'] ?? ''));
$dif = substr($dif, 0, 20);

// Límite de envíos por IP, para que nadie llene la tabla desde una pestaña.
$ipHash = gq_ip_hash();
$recientes = (int) gq_consulta(
    $pdo,
    'SELECT COUNT(*) FROM ranking WHERE ip_hash = ? AND creado_en > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)',
    [$ipHash]
)->fetchColumn();
if ($recientes >= GQ_ENVIOS_HORA) {
    gq_error(429, 'demasiados', 'Demasiados envíos desde esta conexión. Prueba dentro de un rato.');
}

gq_consulta(
    $pdo,
    'INSERT INTO ranking (nombre, puntos, pct, modo, dificultad, ip_hash, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [$nombre, $puntos, $pct, $modo, $dif, $ipHash]
);

$posicion = (int) gq_consulta(
    $pdo,
    'SELECT COUNT(*) + 1 FROM ranking WHERE puntos > ?',
    [$puntos]
)->fetchColumn();

gq_json(201, [
    'ok'      => true,
    'pos'     => $posicion,
    'ranking' => gq_listar($pdo, 50),
]);
