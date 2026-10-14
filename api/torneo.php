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

// ── PUNTUACIÓN, EN EL SERVIDOR ────────────────────────────────────────────
// Mismo baremo que el juego normal, pero calculado aquí: 100/200/300 por dificultad, un
// bonus de hasta el 30% por contestar rápido y un multiplicador por racha (x2 desde la
// tercera seguida, x3 desde la sexta). El multiplicador se mira ANTES de sumar esta
// respuesta a la racha, igual que en js/game.js.
const GQ_T_SEGUNDOS_PREGUNTA = 20;
const GQ_T_GRACIA = 5;   // margen por la latencia de la red antes de darlo por agotado

function gq_t_multiplicador(int $racha): int {
    if ($racha >= 6) { return 3; }
    if ($racha >= 3) { return 2; }
    return 1;
}

// Permutación de las cuatro opciones para ESTE jugador y ESTA pregunta. Se guarda, porque
// sin ella el índice que devuelve el navegador no significa nada.
function gq_t_barajar(): string {
    $o = [0, 1, 2, 3];
    shuffle($o);
    return implode(',', $o);
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
        'SELECT id, nombre, terminado, empezado_en FROM torneo_partidas
         WHERE torneo_id = ? AND nombre = ? LIMIT 1',
        [$torneoId, $nombre]
    )->fetch();
    return $f === false ? null : $f;
}

// Cómo va la partida: cuántas preguntas se han contestado ya, los puntos acumulados, los
// aciertos y la racha viva. Todo sale de torneo_respuestas, que es la única fuente.
function gq_t_progreso(PDO $pdo, int $partidaId): array {
    $filas = gq_consulta(
        $pdo,
        'SELECT orden, acertada, puntos, respondida_en FROM torneo_respuestas
         WHERE partida_id = ? ORDER BY orden ASC',
        [$partidaId]
    )->fetchAll();
    $contestadas = 0; $puntos = 0; $aciertos = 0; $racha = 0;
    foreach ($filas as $f) {
        if ($f['respondida_en'] === null) { continue; }   // servida pero sin contestar
        $contestadas++;
        $puntos += (int) $f['puntos'];
        if ((int) $f['acertada'] === 1) { $aciertos++; $racha++; } else { $racha = 0; }
    }
    return ['contestadas' => $contestadas, 'puntos' => $puntos, 'aciertos' => $aciertos, 'racha' => $racha];
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

    // Las preguntas NO viajan aquí. Antes se mandaban las quince de golpe, con su respuesta
    // correcta y su explicación dentro, así que cualquiera con las herramientas del
    // navegador las leía sin jugar. Ahora se sirven de una en una, ya empezada la partida y
    // sin decir cuál es la buena: lo único que se adelanta es cuántas son.
    $torneo['n_preguntas'] = (int) gq_consulta(
        $pdo, 'SELECT COUNT(*) FROM torneo_preguntas WHERE torneo_id = ?', [$id]
    )->fetchColumn();

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
    $fila = gq_t_fila_jugador($pdo, $torneoId, $nombre);
    $prog = $fila === null ? ['contestadas' => 0, 'puntos' => 0, 'aciertos' => 0, 'racha' => 0]
                           : gq_t_progreso($pdo, (int) $fila['id']);
    gq_json(200, [
        'ok'          => true,
        'reanudado'   => $prog['contestadas'] > 0,
        'nombre'      => (string) ($fila['nombre'] ?? $nombre),
        'siguiente'   => $prog['contestadas'] + 1,
        'n_preguntas' => $nPreguntas,
        'puntos'      => $prog['puntos'],
        'aciertos'    => $prog['aciertos'],
    ]);
}

// ── PREGUNTA: se sirve de una en una y SIN la respuesta ───────────────────
// Esto es lo que cierra la trampa de verdad. La pregunta 15 no existe para el navegador
// hasta que se ha contestado la 14, y en ningún momento viaja cuál es la correcta ni la
// explicación. Mirar la pestaña de red ya no adelanta nada.
if (($datos['accion'] ?? '') === 'pregunta') {
    $fila = gq_t_fila_jugador($pdo, $torneoId, $nombre);
    if ($fila === null) { gq_error(409, 'sin_reserva', 'Esa partida no está empezada.'); }
    if ((int) $fila['terminado'] === 1) { gq_error(409, 'ya_jugado', 'Ya has jugado este torneo.'); }
    $partidaId = (int) $fila['id'];

    $prog = gq_t_progreso($pdo, $partidaId);
    $orden = $prog['contestadas'] + 1;   // el servidor decide cuál toca, no el navegador
    if ($orden > $nPreguntas) { gq_error(409, 'terminada', 'Ya has contestado todas.'); }

    $p = gq_consulta(
        $pdo,
        'SELECT cat, diff, pts, q, opts FROM torneo_preguntas WHERE torneo_id = ? AND orden = ?',
        [$torneoId, $orden]
    )->fetch();
    if ($p === false) { gq_error(500, 'sin_pregunta', 'Falta una pregunta del torneo.'); }

    // Si ya se había servido y no se contestó (una recarga a media pregunta), se repite con
    // la MISMA baraja y sin reiniciar el reloj: recargar no regala tiempo.
    $r = gq_consulta(
        $pdo,
        'SELECT opciones, servida_en FROM torneo_respuestas WHERE partida_id = ? AND orden = ?',
        [$partidaId, $orden]
    )->fetch();
    if ($r === false) {
        $baraja = gq_t_barajar();
        gq_consulta(
            $pdo,
            'INSERT INTO torneo_respuestas (partida_id, orden, opciones, servida_en) VALUES (?, ?, ?, UTC_TIMESTAMP())',
            [$partidaId, $orden, $baraja]
        );
        $transcurrido = 0;
    } else {
        $baraja = (string) $r['opciones'];
        $transcurrido = (int) gq_consulta(
            $pdo, 'SELECT TIMESTAMPDIFF(SECOND, ?, UTC_TIMESTAMP())', [$r['servida_en']]
        )->fetchColumn();
    }

    $opts = json_decode((string) $p['opts'], true);
    $orig = is_array($opts) ? $opts : [];
    $perm = array_map('intval', explode(',', $baraja));
    $servidas = [];
    foreach ($perm as $i) { $servidas[] = $orig[$i] ?? ''; }

    gq_json(200, [
        'ok'       => true,
        'orden'    => $orden,
        'total'    => $nPreguntas,
        'cat'      => $p['cat'],
        'diff'     => $p['diff'],
        'pts'      => (int) $p['pts'],
        'q'        => $p['q'],
        'opts'     => $servidas,
        'quedan'   => max(0, GQ_T_SEGUNDOS_PREGUNTA - $transcurrido),
        'puntos'   => $prog['puntos'],
        'racha'    => $prog['racha'],
        'mult'     => gq_t_multiplicador($prog['racha']),
    ]);
}

// ── RESPONDER: corrige el servidor ────────────────────────────────────────
if (($datos['accion'] ?? '') === 'responder') {
    $fila = gq_t_fila_jugador($pdo, $torneoId, $nombre);
    if ($fila === null) { gq_error(409, 'sin_reserva', 'Esa partida no está empezada.'); }
    if ((int) $fila['terminado'] === 1) { gq_error(409, 'ya_jugado', 'Ya has jugado este torneo.'); }
    $partidaId = (int) $fila['id'];

    $prog  = gq_t_progreso($pdo, $partidaId);
    $orden = $prog['contestadas'] + 1;
    $r = gq_consulta(
        $pdo,
        'SELECT opciones, servida_en, TIMESTAMPDIFF(SECOND, servida_en, UTC_TIMESTAMP()) AS tardado
         FROM torneo_respuestas WHERE partida_id = ? AND orden = ? AND respondida_en IS NULL',
        [$partidaId, $orden]
    )->fetch();
    if ($r === false) { gq_error(409, 'sin_pregunta', 'No hay ninguna pregunta pendiente.'); }

    $p = gq_consulta(
        $pdo,
        'SELECT pts, ans, exp FROM torneo_preguntas WHERE torneo_id = ? AND orden = ?',
        [$torneoId, $orden]
    )->fetch();

    $perm    = array_map('intval', explode(',', (string) $r['opciones']));
    $tardado = max(0, (int) $r['tardado']);
    $elegida = filter_var($datos['elegida'] ?? -1, FILTER_VALIDATE_INT);
    if ($elegida === false || $elegida === null || $elegida < 0 || $elegida > 3) { $elegida = -1; }

    // Se agotó el tiempo si lo dice el navegador o si el reloj del servidor se pasó del
    // límite con su margen. Mandar una respuesta tardísima no cuela.
    $aTiempo = $tardado <= (GQ_T_SEGUNDOS_PREGUNTA + GQ_T_GRACIA);
    $real    = $elegida >= 0 ? ($perm[$elegida] ?? -1) : -1;
    $acerto  = $aTiempo && $real === (int) $p['ans'];

    // El multiplicador se mira con la racha que había ANTES de esta respuesta, igual que en
    // js/game.js. Hay que guardarlo aquí porque abajo se recalcula el progreso.
    $multAplicado = gq_t_multiplicador($prog['racha']);
    $pts = 0;
    if ($acerto) {
        $quedan = max(0, GQ_T_SEGUNDOS_PREGUNTA - $tardado);
        $bonus  = (int) floor($quedan / GQ_T_SEGUNDOS_PREGUNTA * (int) $p['pts'] * 0.3);
        $pts    = ((int) $p['pts'] + $bonus) * $multAplicado;
    }

    gq_consulta(
        $pdo,
        'UPDATE torneo_respuestas SET elegida = ?, acertada = ?, puntos = ?, respondida_en = UTC_TIMESTAMP()
          WHERE partida_id = ? AND orden = ?',
        [$elegida, $acerto ? 1 : 0, $pts, $partidaId, $orden]
    );

    $prog = gq_t_progreso($pdo, $partidaId);
    $ultima = $orden >= $nPreguntas;

    if ($ultima) {
        // Se cierra la partida con los puntos que ha ido sumando el servidor. El navegador
        // no ha llegado a tocar la puntuación en ningún momento.
        gq_consulta(
            $pdo,
            'UPDATE torneo_partidas
                SET puntos = ?, correctas = ?, total = ?,
                    segundos = LEAST(GREATEST(TIMESTAMPDIFF(SECOND, empezado_en, UTC_TIMESTAMP()), 0), 65535),
                    terminado = 1, creado_en = UTC_TIMESTAMP()
              WHERE id = ? AND terminado = 0',
            [$prog['puntos'], $prog['aciertos'], $nPreguntas, $partidaId]
        );
    }

    // Qué casilla de las que ÉL vio era la buena: el navegador no conoce la permutación.
    // Con ?: no valdría, porque el índice 0 es legítimo y se confundiría con no encontrado.
    $idxCorrecta = array_search((int) $p['ans'], $perm, true);
    $salida = [
        'ok'       => true,
        'acerto'   => $acerto,
        'correcta' => $idxCorrecta === false ? 0 : (int) $idxCorrecta,
        'exp'      => $p['exp'],
        'ganados'  => $pts,
        'mult'     => $multAplicado,
        'puntos'   => $prog['puntos'],
        'aciertos' => $prog['aciertos'],
        'racha'    => $prog['racha'],
        'tardado'  => $tardado,
        'ultima'   => $ultima,
    ];
    if ($ultima) {
        $clasificacion = gq_t_clasificacion($pdo, $torneoId);
        $salida['clasificacion'] = $clasificacion;
        $salida['yo'] = gq_t_buscar($clasificacion, (string) $fila['nombre']);
        $salida['pos'] = $salida['yo']['pos'] ?? null;
    }
    gq_json(200, $salida);
}


// ── CUALQUIER OTRO POST ───────────────────────────────────────────────────
// Antes se aceptaba un envío con la puntuación ya calculada por el navegador. Con el
// servidor corrigiendo eso era un agujero de par en par: bastaba un curl con el máximo
// para encabezar la clasificación sin contestar nada. Ya no existe esa puerta.
//
// Un navegador con el JavaScript viejo cae aquí. No pierde nada: como tampoco recibe las
// preguntas, no ha llegado a jugar; solo tiene que recargar.
gq_json(409, [
    'ok'      => false,
    'error'   => 'version',
    'mensaje' => 'Esta versión del juego ya no vale para el torneo. Recarga la página.',
]);
