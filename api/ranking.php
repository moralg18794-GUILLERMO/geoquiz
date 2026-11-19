<?php
// GeoQuiz — ranking global.
//   GET  /api/ranking.php?limit=50     devuelve la clasificación
//   GET  /api/ranking.php?tema=bat     devuelve la clasificación de una temática
//   POST /api/ranking.php              envía una puntuación (JSON en el cuerpo)
//
// El ranking de portada lista solo PARTIDAS OFICIALES: modo solo con las 13 épocas
// seleccionadas. Todo lo demás (blitz, supervivencia, cronológico, fechas y las selecciones
// parciales) va a una segunda lista, para que nadie desaparezca por jugar a otra cosa.
//
// Y HAY UNA TERCERA FAMILIA: las partidas de UNA temática (modo solo, eje de temáticas, una
// sola temática elegida). Tienen clasificación propia, una por temática, en la tabla
// `partidas_tema`. El motivo es que antes no la tenían: cualquier partida por temática caía
// en la lista de "otras", revuelta con supervivencia, así que jugar por temáticas no competía
// con nada y la sección estaba muerta. Una partida de una temática NO entra además en
// `partidas`: va a un sitio y solo a uno, para que nadie salga dos veces.
//
// OJO CON LO QUE ESTO GARANTIZA Y LO QUE NO. La condición de oficial fija el modo y el
// temario, pero NO la dificultad, y la dificultad multiplica los puntos: una pregunta vale
// 100, 200 o 300 según sea fácil, media o difícil. El techo de una partida perfecta de 10
// preguntas es 2.730 en Fácil, 5.460 en Medio y 8.190 en Difícil, así que la lista está
// ordenada por puntos entre partidas que NO valen lo mismo y quien juega en Fácil no puede
// alcanzar a quien juega en Difícil ni jugando perfecto. Es deliberado: Guillermo prefirió
// una sola lista con la dificultad a la vista antes que cuatro listas separadas, sabiendo
// esto. Si algún día se quiere comparabilidad estricta, hay que añadir $dif a la condición
// de abajo o clasificar por grupos de dificultad en vez de por puntos crudos.

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

gq_cors();

// ── LÍMITES ───────────────────────────────────────────────────────────────
// GQ_MAX_NOMBRE, gq_recortar() y gq_limpiar_nombre() viven ahora en db.php, compartidos
// con el endpoint de torneos.
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

// Partidas por temática que se conservan de cada jugador EN CADA TEMÁTICA. Son menos que
// las diez de la lista general porque hay nueve temáticas: a diez cada una serían noventa
// filas por persona, y en la tabla solo se ve la mejor de cada uno de todas formas.
const GQ_POR_TEMA        = 3;
const GQ_TOPE_FILAS_TEMA = 5000;

// Clientes con el JavaScript viejo en caché siguen mandando la ETIQUETA de la
// dificultad en vez del código. Se traducen en vez de rechazarlos: un 400 aquí se le
// enseña al jugador como "sin conexión" (js/storage.js) y perdería la partida creyendo
// que es cosa del wifi.
const GQ_DIFS_VIEJAS = [
    'Todas' => 'all', 'Fácil' => 'facil', 'Medio' => 'medio', 'Difícil' => 'dificil',
    '—' => 'na', '' => 'na',
];


// Una fila por jugador: su MEJOR partida dentro de la lista pedida. Se filtra por id de
// la mejor en vez de agrupar para no depender de ONLY_FULL_GROUP_BY, que viene activado
// por defecto en MySQL 8 y tumbaría un GROUP BY con columnas sueltas.
//
// $oficial vale 1 (oficiales), 0 (el resto) o null (todas mezcladas, que es lo que reciben
// los clientes con el JavaScript viejo en caché: ellos no saben pintar dos listas y así
// siguen viendo el ranking de siempre, con sus propias partidas dentro).
function gq_listar(PDO $pdo, ?int $oficial, int $limite): array {
    $limite = max(1, min($limite, GQ_TOPE_LISTA));
    $filtro = $oficial === null ? '' : 'p.oficial = :of AND ';
    $sub    = $oficial === null ? '' : 'p2.oficial = :of2 AND ';
    // El límite va interpolado y no como parámetro porque MySQL no admite marcadores
    // en LIMIT; queda a salvo porque antes se fuerza a entero acotado.
    $sql = 'SELECT p.nombre, p.puntos, p.pct, p.modo, p.dif, p.eje, p.nsel, p.ntot, p.creado_en
            FROM partidas p
            WHERE ' . $filtro . 'p.id = (SELECT p2.id FROM partidas p2
                          WHERE ' . $sub . 'p2.nombre = p.nombre
                          ORDER BY p2.puntos DESC, p2.id ASC LIMIT 1)
            ORDER BY p.puntos DESC, p.id ASC
            LIMIT ' . $limite;
    $params = $oficial === null ? [] : ['of' => $oficial, 'of2' => $oficial];
    $filas = gq_consulta($pdo, $sql, $params)->fetchAll();
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

// La clasificación de UNA temática, con la misma forma que la de arriba: una fila por
// jugador, su mejor partida, y los mismos campos aunque aquí tres sean siempre lo mismo
// (modo solo, eje de temáticas, una de nueve). Se mandan igual para que el navegador pinte
// las tres listas con la misma función y no puedan divergir entre ellas.
//
// $tema entra ya comprobado contra GQ_TEMAS por quien llama: aquí no se valida otra vez
// porque viaja como parámetro de la consulta, pero tampoco debe llegar nada sin filtrar.
function gq_listar_tema(PDO $pdo, string $tema, int $limite): array {
    $limite = max(1, min($limite, GQ_TOPE_LISTA));
    $sql = 'SELECT p.nombre, p.puntos, p.pct, p.dif, p.creado_en
            FROM partidas_tema p
            WHERE p.tema = :t AND p.id = (SELECT p2.id FROM partidas_tema p2
                          WHERE p2.tema = :t2 AND p2.nombre = p.nombre
                          ORDER BY p2.puntos DESC, p2.id ASC LIMIT 1)
            ORDER BY p.puntos DESC, p.id ASC
            LIMIT ' . $limite;
    $filas = gq_consulta($pdo, $sql, ['t' => $tema, 't2' => $tema])->fetchAll();
    $salida = [];
    foreach ($filas as $i => $f) {
        $salida[] = [
            'pos'    => $i + 1,
            'nombre' => $f['nombre'],
            'puntos' => (int) $f['puntos'],
            'pct'    => (int) $f['pct'],
            'modo'   => 'solo',
            'dif'    => $f['dif'],
            'eje'    => 't',
            'nsel'   => 1,
            'ntot'   => count(GQ_TEMAS),
            'fecha'  => substr((string) $f['creado_en'], 0, 10),
        ];
    }
    return $salida;
}

// Cuánta gente ha jugado cada temática. Lo usa el menú del ranking para enseñar las nueve
// pestañas con su número y para abrir por la que tiene movimiento en vez de por una vacía:
// sin esto, quien entra al ranking por temáticas se encuentra una tabla vacía la primera
// vez y se va pensando que no funciona. Cuenta jugadores distintos, no partidas, porque es
// lo que luego se ve en la tabla: una fila por persona.
function gq_resumen_temas(PDO $pdo): array {
    $filas = gq_consulta(
        $pdo,
        'SELECT tema, COUNT(DISTINCT nombre) AS jugadores FROM partidas_tema GROUP BY tema'
    )->fetchAll();
    $salida = [];
    foreach ($filas as $f) {
        $cod = (string) $f['tema'];
        if (in_array($cod, GQ_TEMAS, true)) {
            $salida[$cod] = (int) $f['jugadores'];
        }
    }
    return $salida;
}

$pdo = gq_db();

// ── GET: clasificación ────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $limite = (int) ($_GET['limit'] ?? 50);

    // ?tema=bat — la clasificación de una temática, que se pide aparte y a demanda: son
    // nueve y mandarlas todas en cada visita al ranking sería nueve veces el trabajo para
    // enseñar una.
    $temaPedido = isset($_GET['tema']) && is_string($_GET['tema']) ? $_GET['tema'] : '';
    if ($temaPedido !== '') {
        if (!in_array($temaPedido, GQ_TEMAS, true)) {
            gq_error(400, 'tema', 'Esa temática no existe.');
        }
        gq_json(200, [
            'ok'      => true,
            'tema'    => $temaPedido,
            'ranking' => gq_listar_tema($pdo, $temaPedido, $limite),
        ]);
    }

    // Solo el cliente nuevo pide la lista partida en dos (`split=1`). Al que tiene el
    // JavaScript viejo en caché se le devuelve todo mezclado bajo la clave `ranking`, que
    // es la única que sabe pintar: si se le mandaran solo las oficiales vería una tabla
    // donde sus propias partidas no aparecen nunca, sin entender por qué.
    if (($_GET['split'] ?? '') === '1') {
        gq_json(200, [
            'ok'      => true,
            'ranking' => gq_listar($pdo, 1, $limite),
            'otras'   => gq_listar($pdo, 0, $limite),
            'temas'   => gq_resumen_temas($pdo),
        ]);
    }
    gq_json(200, ['ok' => true, 'ranking' => gq_listar($pdo, null, $limite)]);
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

// La partida oficial DE UNA TEMÁTICA: modo solo, eje de temáticas y una sola temática. El
// código tiene que estar en GQ_TEMAS; lo que no se reconozca se trata como si no viniera, y
// entonces la partida sigue el camino de siempre y acaba en la lista de "otras". Un cliente
// con el JavaScript viejo en caché no manda `tema` y cae justo ahí, que es lo que hacía
// antes: nadie pierde su partida por tener el navegador desactualizado.
$tema = isset($datos['tema']) && is_string($datos['tema']) ? $datos['tema'] : '';
if (!in_array($tema, GQ_TEMAS, true)) { $tema = ''; }
$esTema = ($modo === 'solo' && $eje === 't' && $nsel === 1 && $tema !== '');

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

// ── Camino de las partidas de una temática ────────────────────────────────
// Van a su propia tabla y se responde aquí mismo: no pasan por `partidas`, así que no
// aparecen además en la lista de "otras partidas". El puesto que se anuncia se busca en la
// MISMA lista que el jugador va a ver después, igual que abajo, y por el mismo motivo: un
// número calculado con otra consulta puede no coincidir con la tabla que se abre luego.
if ($esTema) {
    gq_consulta(
        $pdo,
        'INSERT INTO partidas_tema (nombre, tema, puntos, pct, dif, ip_hash, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
        [$nombre, $tema, $puntos, $pct, $dif, $ipHash]
    );

    // De cada jugador, sus mejores partidas de ESTA temática. Separar por temática no es un
    // detalle: sin ello, la mejor partida de Espionaje de alguien se borraría sola en cuanto
    // acumulara partidas de Batallas con más puntos, que es el mismo fallo que ya se arregló
    // una vez separando las partidas oficiales de las demás.
    gq_consulta(
        $pdo,
        'DELETE FROM partidas_tema WHERE nombre = ? AND tema = ? AND id NOT IN (
            SELECT id FROM (SELECT id FROM partidas_tema WHERE nombre = ? AND tema = ?
                            ORDER BY puntos DESC, id ASC LIMIT ' . GQ_POR_TEMA . ') x)',
        [$nombre, $tema, $nombre, $tema]
    );

    // Tope global, solo como red de seguridad: se borran las filas más antiguas que no sean
    // la mejor de nadie en su temática, para no dejar a ningún jugador fuera de ninguna lista.
    $totalTema = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM partidas_tema')->fetchColumn();
    if ($totalTema > GQ_TOPE_FILAS_TEMA) {
        $sobranTema = $totalTema - GQ_TOPE_FILAS_TEMA;
        gq_consulta(
            $pdo,
            'DELETE FROM partidas_tema WHERE id IN (
                SELECT id FROM (
                    SELECT p.id FROM partidas_tema p
                    WHERE p.id <> (SELECT p2.id FROM partidas_tema p2
                                   WHERE p2.nombre = p.nombre AND p2.tema = p.tema
                                   ORDER BY p2.puntos DESC, p2.id ASC LIMIT 1)
                    ORDER BY p.id ASC LIMIT ' . $sobranTema . ') y)'
        );
    }

    $listaTema = gq_listar_tema($pdo, $tema, GQ_TOPE_LISTA);
    // Igual que abajo: MySQL agrupa los nombres ignorando mayúsculas y acentos, así que se
    // le pregunta cuál es la grafía que ha sobrevivido antes de buscar el puesto.
    $canonTema = gq_consulta(
        $pdo,
        'SELECT nombre FROM partidas_tema WHERE tema = ? AND nombre = ?
         ORDER BY puntos DESC, id ASC LIMIT 1',
        [$tema, $nombre]
    )->fetchColumn();
    $buscadoTema = $canonTema === false ? $nombre : (string) $canonTema;
    $posTema = null;
    foreach ($listaTema as $fila) {
        if ($fila['nombre'] === $buscadoTema) { $posTema = $fila['pos']; break; }
    }
    gq_json(201, [
        'ok'      => true,
        'pos'     => $posTema,
        'oficial' => false,
        'tema'    => $tema,
        'ranking' => $listaTema,
    ]);
}

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

// El puesto se saca de la MISMA lista que el jugador va a ver, buscándolo en ella. Así el
// número que se le anuncia al terminar no puede discrepar de la tabla que abre después, que
// es lo que pasaba antes al calcularlo con una consulta aparte. Un cliente con el JavaScript
// viejo solo sabe pintar una lista mezclada, así que su puesto se calcula sobre esa.
$clienteNuevo = array_key_exists('eje', $datos);
$lista = gq_listar($pdo, $clienteNuevo ? $oficial : null, GQ_TOPE_LISTA);

// La grafía que sobrevive en la lista es la de la partida con más puntos, y MySQL agrupa los
// nombres con una colación que ignora mayúsculas y acentos: 'Guille' y 'guille' son el mismo
// jugador. Comparar con === el nombre recién enviado dejaría el puesto en null cada vez que
// alguien lo escribiera de otra forma, así que primero se le pregunta a MySQL cuál es la suya.
$canon = gq_consulta(
    $pdo,
    'SELECT nombre FROM partidas WHERE ' . ($clienteNuevo ? 'oficial = ? AND ' : '') . 'nombre = ?
     ORDER BY puntos DESC, id ASC LIMIT 1',
    $clienteNuevo ? [$oficial, $nombre] : [$nombre]
)->fetchColumn();
$buscado = $canon === false ? $nombre : (string) $canon;

$posicion = null;
foreach ($lista as $fila) {
    if ($fila['nombre'] === $buscado) {
        $posicion = $fila['pos'];
        break;
    }
}

$salida = ['ok' => true, 'pos' => $posicion, 'oficial' => $oficial === 1];
if ($clienteNuevo) {
    $salida['ranking'] = $oficial === 1 ? $lista : gq_listar($pdo, 1, GQ_TOPE_LISTA);
    $salida['otras']   = $oficial === 1 ? gq_listar($pdo, 0, GQ_TOPE_LISTA) : $lista;
} else {
    $salida['ranking'] = $lista;
}
gq_json(201, $salida);
