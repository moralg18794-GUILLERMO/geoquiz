<?php
// GeoQuiz — ranking global.
//   GET  /api/ranking.php?limit=50   devuelve la clasificación
//   POST /api/ranking.php            envía una puntuación (JSON en el cuerpo)
//
// El ranking de portada lista solo PARTIDAS OFICIALES: modo solo con las 13 épocas
// seleccionadas. Es la única forma de que dos filas sean comparables sin pedirle al
// jugador que entienda nada: mismo mazo y mismo modo por construcción. Todo lo demás
// (blitz, supervivencia, cronológico, fechas y las selecciones parciales) va a una
// segunda lista, para que nadie desaparezca por jugar a otra cosa.

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
const GQ_POR_JUGADOR = 10;       // mejores partidas que se conservan de cada uno y lista
const GQ_TOPE_FILAS  = 5000;     // la tabla no crece para siempre
const GQ_MODOS = ['solo', 'blitz', 'survival', 'duel', 'crono', 'fechas'];
// Códigos, no etiquetas: lo que se pinta se traduce en el cliente (diffLabel en
// js/storage.js). 'na' es "no aplica", que es lo que mandan cronológico y fechas.
const GQ_DIFS = ['all', 'facil', 'medio', 'dificil', 'na'];
const GQ_EJES = ['e', 't', 'n'];
// Mínimo de épocas para que una partida cuente como oficial. Es >= y no == para que
// el día que el banco gane una 14ª categoría, una partida de 14/14 siga siendo oficial.
const GQ_EPOCAS_MIN = 13;

// Clientes con el JavaScript viejo en caché siguen mandando la ETIQUETA de la
// dificultad en vez del código. Se traducen en vez de rechazarlos: un 400 aquí se le
// enseña al jugador como "sin conexión" (js/storage.js) y perdería la partida creyendo
// que es cosa del wifi.
const GQ_DIFS_VIEJAS = [
    'Todas' => 'all', 'Fácil' => 'facil', 'Medio' => 'medio', 'Difícil' => 'dificil',
    '—' => 'na', '' => 'na',
];

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

// Una fila por jugador: su MEJOR partida dentro de la lista pedida. Se filtra por id de
// la mejor en vez de agrupar para no depender de ONLY_FULL_GROUP_BY, que viene activado
// por defecto en MySQL 8 y tumbaría un GROUP BY con columnas sueltas.
function gq_listar(PDO $pdo, int $oficial, int $limite): array {
    $limite = max(1, min($limite, GQ_TOPE_LISTA));
    // El límite va interpolado y no como parámetro porque MySQL no admite marcadores
    // en LIMIT; queda a salvo porque antes se fuerza a entero acotado.
    $sql = 'SELECT p.nombre, p.puntos, p.pct, p.modo, p.dif, p.eje, p.nsel, p.ntot, p.creado_en
            FROM partidas p
            WHERE p.oficial = :of
              AND p.id = (SELECT p2.id FROM partidas p2
                          WHERE p2.oficial = :of2 AND p2.nombre = p.nombre
                          ORDER BY p2.puntos DESC, p2.id ASC LIMIT 1)
            ORDER BY p.puntos DESC, p.id ASC
            LIMIT ' . $limite;
    $filas = gq_consulta($pdo, $sql, ['of' => $oficial, 'of2' => $oficial])->fetchAll();
    $salida = [];
    foreach ($filas as $i => $f) {
        $salida[] = [
            'pos'    => $i + 1,
            'nombre' => $f['nombre'],
            'puntos' => (int) $f['puntos'],
            'pct'    => (int) $f['pct'],
            'modo'   => $f['modo'],
            'dif'    => $f['dif'],
            'eje'    => $f['eje'],
            'nsel'   => (int) $f['nsel'],
            'ntot'   => (int) $f['ntot'],
            'fecha'  => substr((string) $f['creado_en'], 0, 10),
        ];
    }
    return $salida;
}

$pdo = gq_db();

// ── GET: clasificación ────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $limite = (int) ($_GET['limit'] ?? 50);
    // La clave `ranking` conserva el nombre y la forma de siempre para que los clientes
    // con el JavaScript viejo en caché sigan pintando la tabla sin enterarse del cambio.
    gq_json(200, [
        'ok'      => true,
        'ranking' => gq_listar($pdo, 1, $limite),
        'otras'   => gq_listar($pdo, 0, $limite),
    ]);
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

// Listas blancas, no recortes: así no hay forma de meter aquí nada raro. Lo que no se
// reconoce se degrada a "no aplica" en vez de rechazar el envío, porque perder la
// partida de alguien es peor que guardarla con una etiqueta de menos.
$dif = isset($datos['dif']) && is_string($datos['dif']) ? trim($datos['dif']) : '';
if (!in_array($dif, GQ_DIFS, true)) {
    $dif = GQ_DIFS_VIEJAS[$dif] ?? 'na';
}

$eje = isset($datos['eje']) && is_string($datos['eje']) ? $datos['eje'] : '';
if (!in_array($eje, GQ_EJES, true)) {
    $eje = 'n';
}

$nsel = filter_var($datos['nsel'] ?? 0, FILTER_VALIDATE_INT);
$ntot = filter_var($datos['ntot'] ?? 0, FILTER_VALIDATE_INT);
if ($nsel === false || $nsel === null || $nsel < 0 || $nsel > 255) { $nsel = 0; }
if ($ntot === false || $ntot === null || $ntot < 0 || $ntot > 255) { $ntot = 0; }
if ($nsel > $ntot) { $nsel = $ntot; }

// La partida oficial: modo solo, eje de épocas y todas las épocas seleccionadas. Un
// cliente viejo no manda eje ni recuentos, así que sus partidas caen en la otra lista;
// es preferible a colarlas en la oficial sin saber a qué jugó.
$oficial = ($modo === 'solo' && $eje === 'e' && $ntot >= GQ_EPOCAS_MIN && $nsel === $ntot) ? 1 : 0;

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

gq_consulta(
    $pdo,
    'INSERT INTO partidas (nombre, puntos, pct, modo, dif, eje, nsel, ntot, oficial, ip_hash, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [$nombre, $puntos, $pct, $modo, $dif, $eje, $nsel, $ntot, $oficial, $ipHash]
);

// De cada jugador se conservan sus mejores partidas DE CADA LISTA por separado. Recortar
// por puntos sin separar las dos listas volvería a borrar la mejor partida oficial de
// alguien en cuanto acumulara partidas de supervivencia con más puntos, que es justo el
// problema que esta tabla viene a arreglar.
gq_consulta(
    $pdo,
    'DELETE FROM partidas WHERE nombre = ? AND oficial = ? AND id NOT IN (
        SELECT id FROM (SELECT id FROM partidas WHERE nombre = ? AND oficial = ?
                        ORDER BY puntos DESC, id ASC LIMIT ' . GQ_POR_JUGADOR . ') x)',
    [$nombre, $oficial, $nombre, $oficial]
);

// Tope global, solo como red de seguridad: con el límite por jugador de arriba haría
// falta que jugaran cientos de personas distintas para llegar aquí. Se borran las filas
// más antiguas que no sean la mejor de nadie, para no dejar a ningún jugador fuera.
$total = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM partidas')->fetchColumn();
if ($total > GQ_TOPE_FILAS) {
    $sobran = $total - GQ_TOPE_FILAS;
    gq_consulta(
        $pdo,
        'DELETE FROM partidas WHERE id IN (
            SELECT id FROM (
                SELECT p.id FROM partidas p
                WHERE p.id <> (SELECT p2.id FROM partidas p2
                               WHERE p2.nombre = p.nombre AND p2.oficial = p.oficial
                               ORDER BY p2.puntos DESC, p2.id ASC LIMIT 1)
                ORDER BY p.id ASC LIMIT ' . $sobran . ') y)'
    );
}

// El puesto se saca de la MISMA lista que se devuelve, buscando al jugador en ella. Así
// el número que se le anuncia al terminar no puede discrepar de la tabla que ve después,
// que es lo que pasaba antes al calcularlo con una consulta aparte.
$lista = gq_listar($pdo, $oficial, GQ_TOPE_LISTA);
$posicion = null;
foreach ($lista as $fila) {
    if ($fila['nombre'] === $nombre) {
        $posicion = $fila['pos'];
        break;
    }
}

gq_json(201, [
    'ok'      => true,
    'pos'     => $posicion,
    'oficial' => $oficial === 1,
    'ranking' => $oficial === 1 ? $lista : gq_listar($pdo, 1, 50),
    'otras'   => $oficial === 1 ? gq_listar($pdo, 0, 50) : $lista,
]);
