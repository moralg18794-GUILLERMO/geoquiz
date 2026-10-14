<?php
// GeoQuiz — publicar el torneo de la semana.
//   POST /api/torneo-admin.php            con la cabecera X-GQ-Admin y el torneo en JSON
//   GET  /api/torneo-admin.php?listar=1   qué torneos hay, para no pisar ninguno
//
// No emite cabeceras CORS a propósito: esto no se llama desde el navegador, se llama con
// curl desde fuera. Sin Access-Control-Allow-Origin, ninguna página puede invocarlo aunque
// alguien se haga con el token.
//
// El token vive en api/config.php, que no está en el repositorio y que el .htaccess de
// esta carpeta impide servir. Es lo único que separa a cualquiera de poder cambiar el
// torneo de la semana.

declare(strict_types=1);
require __DIR__ . '/db.php';

gq_blindar('torneo-admin');
header('Cache-Control: no-store');

const GQ_TA_MAX_PREGUNTAS = 50;
const GQ_TA_ZONA = 'Europe/Madrid';

// Comparación en tiempo constante: con == o ===, el tiempo que tarda en fallar delata
// cuántos caracteres iniciales se han acertado y el token se puede adivinar a trocitos.
function gq_ta_autorizar(): void {
    $cfg = gq_config();
    $esperado = (string) ($cfg['token_admin'] ?? '');
    $dado = (string) ($_SERVER['HTTP_X_GQ_ADMIN'] ?? '');
    if ($esperado === '' || strlen($esperado) < 32) {
        gq_error(500, 'sin_token', 'Falta token_admin en api/config.php (o es demasiado corto).');
    }
    if ($dado === '' || !hash_equals($esperado, $dado)) {
        // 404 y no 401: desde fuera, este archivo no existe.
        gq_error(404, 'no', 'No encontrado.');
    }
}

// Las fechas se escriben en hora de Madrid, que es como piensa quien monta el torneo
// ("cierra el domingo a las 22:00"), y se guardan en UTC. Convertir aquí y no a mano es lo
// que hace que el cambio de hora de octubre no mueva el cierre.
function gq_ta_utc(string $local, string $campo): string {
    $dt = DateTime::createFromFormat('Y-m-d H:i', $local, new DateTimeZone(GQ_TA_ZONA));
    if ($dt === false) {
        gq_error(400, 'fecha', "El campo $campo tiene que ser 'AAAA-MM-DD HH:MM' en hora de Madrid.");
    }
    $dt->setTimezone(new DateTimeZone('UTC'));
    return $dt->format('Y-m-d H:i:s');
}

function gq_ta_texto($v, string $campo, int $max, bool $obligatorio = true): string {
    if (!is_string($v)) {
        if ($obligatorio) { gq_error(400, 'campo', "Falta $campo o no es texto."); }
        return '';
    }
    $v = trim($v);
    if ($obligatorio && $v === '') { gq_error(400, 'campo', "$campo está vacío."); }
    if (gq_largo($v) > $max) {
        gq_error(400, 'largo', "$campo pasa de $max caracteres (" . gq_largo($v) . ').');
    }
    return $v;
}

// Primero el token, y solo después la base de datos: una petición sin autorizar no debe
// llegar siquiera a abrir una conexión, y así todo el validador de abajo se puede probar
// en local sin MySQL delante.
gq_ta_autorizar();

// ── GET: qué hay publicado ────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $pdo = gq_db();
    $filas = gq_consulta(
        $pdo,
        'SELECT t.id, t.slug, t.titulo, t.tema, t.empieza_en, t.acaba_en, t.borrador,
                (SELECT COUNT(*) FROM torneo_preguntas p WHERE p.torneo_id = t.id) AS preguntas,
                (SELECT COUNT(*) FROM torneo_partidas j WHERE j.torneo_id = t.id) AS jugadores,
                (t.borrador = 0 AND t.empieza_en <= UTC_TIMESTAMP() AND t.acaba_en > UTC_TIMESTAMP()) AS activo
         FROM torneos t ORDER BY t.empieza_en DESC LIMIT 50'
    )->fetchAll();
    gq_json(200, ['ok' => true, 'ahora_utc' => gmdate('Y-m-d H:i:s'), 'torneos' => $filas]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gq_error(405, 'metodo', 'Solo se admiten GET y POST.');
}

// ── POST: publicar ────────────────────────────────────────────────────────
$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > 262144) {
    gq_error(400, 'cuerpo', 'Cuerpo ausente o demasiado grande.');
}
$d = json_decode($crudo, true);
if (!is_array($d)) {
    gq_error(400, 'json', 'El cuerpo debe ser un objeto JSON.');
}

$slug = gq_ta_texto($d['slug'] ?? null, 'slug', 64);
if (preg_match('/^[a-z0-9][a-z0-9-]{2,63}$/', $slug) !== 1) {
    gq_error(400, 'slug', 'El slug solo admite minúsculas, números y guiones (3-64).');
}
$titulo = gq_ta_texto($d['titulo'] ?? null, 'titulo', 80);
$tema   = gq_ta_texto($d['tema'] ?? null, 'tema', 400, false);

$empieza = gq_ta_utc(gq_ta_texto($d['empieza_en'] ?? null, 'empieza_en', 16), 'empieza_en');
$acaba   = gq_ta_utc(gq_ta_texto($d['acaba_en'] ?? null, 'acaba_en', 16), 'acaba_en');
if ($acaba <= $empieza) {
    gq_error(400, 'ventana', 'acaba_en tiene que ser posterior a empieza_en.');
}
$borrador = !empty($d['borrador']) ? 1 : 0;
$forzar   = !empty($d['forzar']);

// ── Las preguntas ─────────────────────────────────────────────────────────
$preguntas = $d['preguntas'] ?? null;
if (!is_array($preguntas) || count($preguntas) === 0) {
    gq_error(400, 'preguntas', 'Hace falta al menos una pregunta.');
}
if (count($preguntas) > GQ_TA_MAX_PREGUNTAS) {
    gq_error(400, 'preguntas', 'Demasiadas preguntas (máximo ' . GQ_TA_MAX_PREGUNTAS . ').');
}

$vistas = [];
$limpias = [];
foreach (array_values($preguntas) as $i => $p) {
    $n = $i + 1;
    if (!is_array($p)) { gq_error(400, 'pregunta', "La pregunta $n no es un objeto."); }

    $q = gq_ta_texto($p['q'] ?? null, "pregunta $n (q)", 400);
    // Dos preguntas iguales en el mismo torneo es un fallo de copiar y pegar, y el jugador
    // lo nota en el acto.
    $clave = gq_minus(preg_replace('/\s+/u', ' ', $q) ?? $q);
    if (isset($vistas[$clave])) {
        gq_error(400, "repetida", "Las preguntas {$vistas[$clave]} y $n son la misma.");
    }
    $vistas[$clave] = $n;

    $opts = $p['opts'] ?? null;
    if (!is_array($opts) || count($opts) !== 4) {
        gq_error(400, 'opts', "La pregunta $n tiene que tener exactamente 4 opciones.");
    }
    $opts = array_values($opts);
    $textos = [];
    foreach ($opts as $j => $o) {
        $textos[] = gq_ta_texto($o, "opción " . ($j + 1) . " de la pregunta $n", 180);
    }
    // Opciones repetidas: si dos son iguales, una respuesta correcta aparece dos veces y la
    // pregunta no tiene solución única.
    if (count(array_unique(array_map(fn($s) => gq_minus($s), $textos))) !== 4) {
        gq_error(400, 'opts', "La pregunta $n tiene opciones repetidas.");
    }
    $json = json_encode($textos, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 800) {
        gq_error(400, 'opts', "Las opciones de la pregunta $n no caben (máx. 800 bytes).");
    }

    $ans = filter_var($p['ans'] ?? null, FILTER_VALIDATE_INT);
    if ($ans === false || $ans === null || $ans < 0 || $ans > 3) {
        gq_error(400, 'ans', "La pregunta $n necesita ans entre 0 y 3.");
    }

    $diff = is_string($p['diff'] ?? null) ? $p['diff'] : 'medio';
    if (!in_array($diff, ['facil', 'medio', 'dificil'], true)) {
        gq_error(400, 'diff', "La pregunta $n tiene una dificultad desconocida: $diff");
    }
    // Los puntos por dificultad son los mismos que en el juego (100/200/300), así que no
    // se piden: se derivan. Un torneo con otra escala no sería comparable con nada.
    $pts = ['facil' => 100, 'medio' => 200, 'dificil' => 300][$diff];

    $limpias[] = [
        'orden' => $n,
        'cat'   => gq_ta_texto($p['cat'] ?? '', "categoría de la pregunta $n", 40, false),
        'diff'  => $diff,
        'pts'   => $pts,
        'q'     => $q,
        'opts'  => $json,
        'ans'   => $ans,
        'hint'  => gq_ta_texto($p['hint'] ?? '', "pista de la pregunta $n", 300, false),
        'exp'   => gq_ta_texto($p['exp'] ?? '', "explicación de la pregunta $n", 600, false),
    ];
}

// ── Guardar ───────────────────────────────────────────────────────────────
// Validado todo, ahora sí hace falta la base de datos.
$pdo = gq_db();
$existe = gq_consulta($pdo, 'SELECT id FROM torneos WHERE slug = ?', [$slug])->fetch();
if ($existe !== false) {
    $jugadores = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM torneo_partidas WHERE torneo_id = ?', [(int) $existe['id']])->fetchColumn();
    // Cambiar las preguntas de un torneo que ya ha jugado gente deja sus puntuaciones sin
    // significado: habrían competido contra otro examen. Hay que pedirlo a propósito.
    if ($jugadores > 0 && !$forzar) {
        gq_error(409, 'en_juego', "Ese torneo ya lo han jugado $jugadores personas. Si de verdad quieres rehacerlo, manda \"forzar\": true (sus puntuaciones se borran).");
    }
}

$pdo->beginTransaction();
try {
    if ($existe === false) {
        gq_consulta(
            $pdo,
            'INSERT INTO torneos (slug, titulo, tema, empieza_en, acaba_en, borrador, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [$slug, $titulo, $tema, $empieza, $acaba, $borrador]
        );
        $torneoId = (int) $pdo->lastInsertId();
    } else {
        $torneoId = (int) $existe['id'];
        gq_consulta(
            $pdo,
            'UPDATE torneos SET titulo = ?, tema = ?, empieza_en = ?, acaba_en = ?, borrador = ? WHERE id = ?',
            [$titulo, $tema, $empieza, $acaba, $borrador, $torneoId]
        );
        gq_consulta($pdo, 'DELETE FROM torneo_preguntas WHERE torneo_id = ?', [$torneoId]);
        if ($forzar) {
            gq_consulta($pdo, 'DELETE FROM torneo_partidas WHERE torneo_id = ?', [$torneoId]);
        }
    }
    foreach ($limpias as $p) {
        gq_consulta(
            $pdo,
            'INSERT INTO torneo_preguntas (torneo_id, orden, cat, diff, pts, q, opts, ans, hint, exp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$torneoId, $p['orden'], $p['cat'], $p['diff'], $p['pts'], $p['q'], $p['opts'], $p['ans'], $p['hint'], $p['exp']]
        );
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

gq_json(201, [
    'ok'         => true,
    'slug'       => $slug,
    'id'         => $torneoId,
    'preguntas'  => count($limpias),
    'borrador'   => (bool) $borrador,
    'empieza_utc' => $empieza,
    'acaba_utc'  => $acaba,
    'ahora_utc'  => gmdate('Y-m-d H:i:s'),
]);
