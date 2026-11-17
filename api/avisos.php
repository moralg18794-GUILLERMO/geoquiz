<?php
// GeoQuiz — lista opcional de avisos por correo (nuevos torneos y eventos).
//   GET  /api/avisos.php?estado          → {ok, activo}: si hay envío de correo configurado
//   POST /api/avisos.php  (JSON)         → {email, consentimiento:true, mayor:true}: pide el alta
//   GET  /api/avisos.php?a=confirmar&t=… → página con un botón para confirmar
//   GET  /api/avisos.php?a=baja&t=…      → página con un botón para darse de baja
//   POST /api/avisos.php  (formulario)   → a=confirmar|baja, t=…: ejecuta y muestra el resultado
//
// Doble confirmación: el alta deja la fila en 'pendiente' y no se escribe a nadie hasta que
// pulsa el botón del correo. El botón es un POST y no un GET a propósito: los antivirus y los
// clientes de correo abren los enlaces solos, y un GET que confirmara o diera de baja lo haría
// sin que la persona hiciera nada. Darse de baja borra la fila entera.
//
// La respuesta al alta es siempre la misma exista o no el correo: así nadie puede usar esto
// para averiguar quién está apuntado.

declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/correo.php';

gq_blindar('avisos');
gq_cors();

const GQ_AVISOS_POR_IP_HORA = 5;
const GQ_AVISOS_GLOBAL_HORA = 200;
const GQ_AVISOS_REENVIO_MIN = 1440; // un correo de confirmación al día como mucho por dirección
const GQ_AVISOS_PENDIENTE_DIAS = 7;  // lo no confirmado en una semana se borra

function gq_pagina(string $titulo, string $mensaje, string $formulario = ''): void {
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    $t = htmlspecialchars($titulo, ENT_QUOTES, 'UTF-8');
    $m = htmlspecialchars($mensaje, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . "<title>$t · GeoQuiz</title>"
        . '<style>body{font-family:system-ui,sans-serif;background:#0f1115;color:#eee;display:flex;min-height:100vh;'
        . 'align-items:center;justify-content:center;margin:0;padding:1rem}main{max-width:420px;text-align:center}'
        . 'button{font:inherit;padding:.8rem 1.4rem;border:0;border-radius:10px;background:#c9a84c;color:#111;cursor:pointer}'
        . 'a{color:#c9a84c}</style></head><body><main>'
        . "<h1>$t</h1><p>$m</p>$formulario"
        . '<p><a href="/">Volver a GeoQuiz</a></p></main></body></html>';
    exit;
}

function gq_token_valido(string $t): bool {
    return preg_match('/^[a-f0-9]{40}$/', $t) === 1;
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// Sin tocar la base de datos: el juego lo pregunta al cargar el resultado de cada partida.
if ($metodo === 'GET' && isset($_GET['estado'])) {
    gq_json(200, ['ok' => true, 'activo' => gq_correo_activo()]);
}
$pdo = gq_db();
$ahora = gmdate('Y-m-d H:i:s');
// Un correo sin confirmar no se guarda para siempre: a la semana se borra, y su enlace deja de valer.
gq_consulta($pdo, "DELETE FROM avisos WHERE estado = 'pendiente' AND pedido_en < ?", [gmdate('Y-m-d H:i:s', time() - GQ_AVISOS_PENDIENTE_DIAS * 86400)]);

// ── GET ───────────────────────────────────────────────────────────────────
if ($metodo === 'GET') {
    $a = (string) ($_GET['a'] ?? '');
    $t = (string) ($_GET['t'] ?? '');
    if (($a === 'confirmar' || $a === 'baja') && gq_token_valido($t)) {
        $boton = $a === 'confirmar' ? 'Sí, avisadme' : 'Darme de baja y borrar mi correo';
        $texto = $a === 'confirmar'
            ? 'Pulsa el botón para confirmar que quieres recibir avisos de torneos de GeoQuiz.'
            : 'Pulsa el botón y borraremos tu correo de la lista de avisos.';
        $form = '<form method="post" action="avisos.php"><input type="hidden" name="a" value="' . $a . '">'
              . '<input type="hidden" name="t" value="' . $t . '"><button type="submit">' . $boton . '</button></form>';
        gq_pagina($a === 'confirmar' ? 'Confirma tu correo' : 'Darte de baja', $texto, $form);
    }
    gq_error(400, 'peticion', 'Petición no válida.');
}

if ($metodo !== 'POST') {
    gq_error(405, 'metodo', 'Método no permitido.');
}

// ── POST desde el formulario de las páginas de confirmar / baja ───────────
$tipo = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if (strpos($tipo, 'application/x-www-form-urlencoded') === 0) {
    $a = (string) ($_POST['a'] ?? $_GET['a'] ?? '');
    $t = (string) ($_POST['t'] ?? $_GET['t'] ?? '');
    if (!gq_token_valido($t) || ($a !== 'confirmar' && $a !== 'baja')) {
        gq_pagina('Enlace no válido', 'Este enlace no es válido o ya se usó.');
    }
    if ($a === 'confirmar') {
        $st = gq_consulta($pdo, "UPDATE avisos SET estado = 'confirmado', confirmado_en = ? WHERE token = ? AND estado = 'pendiente'", [$ahora, $t]);
        if ($st->rowCount() > 0) {
            gq_pagina('¡Listo!', 'Te avisaremos cuando haya un torneo nuevo. En cada correo tendrás un enlace para darte de baja.');
        }
        $st = gq_consulta($pdo, "SELECT 1 FROM avisos WHERE token = ? AND estado = 'confirmado'", [$t]);
        if ($st->fetch()) {
            gq_pagina('Ya estaba confirmado', 'Tu correo ya está en la lista de avisos.');
        }
        gq_pagina('Enlace no válido', 'Este enlace no es válido o ya se usó.');
    }
    gq_consulta($pdo, 'DELETE FROM avisos WHERE token = ?', [$t]);
    gq_pagina('Baja hecha', 'Hemos borrado tu correo. No recibirás más avisos.');
}

// ── POST JSON: pedir el alta ──────────────────────────────────────────────
$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > 2048) {
    gq_error(400, 'peticion', 'Petición no válida.');
}
$d = json_decode($crudo, true);
if (!is_array($d)) {
    gq_error(400, 'peticion', 'Petición no válida.');
}
if (!gq_correo_activo()) {
    gq_error(503, 'no_disponible', 'Los avisos por correo no están disponibles todavía.');
}
// Trampa para bots: un campo que una persona no ve y por tanto no rellena.
if (!empty($d['web'])) {
    gq_json(200, ['ok' => true]);
}
if (($d['consentimiento'] ?? false) !== true || ($d['mayor'] ?? false) !== true) {
    gq_error(400, 'consentimiento', 'Hace falta aceptar y confirmar que tienes 14 años o más.');
}
$email = strtolower(trim((string) ($d['email'] ?? '')));
if ($email === '' || strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    gq_error(400, 'email', 'Ese correo no parece válido.');
}

// Huella propia de los avisos (otra sal que la del juego): así no puede unirse un correo con un mote.
$ip = hash('sha256', 'avisos|' . gq_ip_hash());
$hora = gmdate('Y-m-d H:i:s', time() - 3600);
$porIp = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM avisos WHERE ip_hash = ? AND pedido_en > ?', [$ip, $hora])->fetchColumn();
$global = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM avisos WHERE pedido_en > ?', [$hora])->fetchColumn();
if ($porIp >= GQ_AVISOS_POR_IP_HORA || $global >= GQ_AVISOS_GLOBAL_HORA) {
    gq_error(429, 'limite', 'Demasiados intentos. Prueba más tarde.');
}

$fila = gq_consulta($pdo, 'SELECT estado, pedido_en FROM avisos WHERE email = ?', [$email])->fetch();
$token = bin2hex(random_bytes(20));
$enviar = false;
if (!$fila) {
    gq_consulta($pdo,
        'INSERT INTO avisos (email, estado, token, texto_version, ip_hash, pedido_en) VALUES (?, \'pendiente\', ?, ?, ?, ?)',
        [$email, $token, GQ_TEXTO_VERSION, $ip, $ahora]);
    $enviar = true;
} elseif ($fila['estado'] === 'pendiente' && strtotime($fila['pedido_en'] . ' UTC') < time() - GQ_AVISOS_REENVIO_MIN * 60) {
    gq_consulta($pdo, 'UPDATE avisos SET token = ?, texto_version = ?, ip_hash = ?, pedido_en = ? WHERE email = ?',
        [$token, GQ_TEXTO_VERSION, $ip, $ahora, $email]);
    $enviar = true;
}
// Si ya estaba confirmado, o se pidió hace menos de 10 minutos, no se envía nada y se responde igual.

if ($enviar) {
    $enlace = gq_enlace_aviso('confirmar', $token);
    [$pieTxt, $pieHtml] = gq_pie_legal();
    $ok = gq_enviar_correo(
        $email,
        'Confirma tu correo para los avisos de GeoQuiz',
        '<p>Hola,</p><p>Alguien (esperamos que tú) ha pedido recibir avisos de los torneos de GeoQuiz en este correo.</p>'
        . '<p><a href="' . htmlspecialchars($enlace, ENT_QUOTES, 'UTF-8') . '">Confirmar mi correo</a></p>'
        . '<p>Si no has sido tú, ignora este mensaje: no te escribiremos más.</p>' . $pieHtml,
        "Hola,\n\nAlguien (esperamos que tú) ha pedido recibir avisos de los torneos de GeoQuiz en este correo.\n"
        . "Para confirmarlo, abre este enlace:\n$enlace\n\nSi no has sido tú, ignora este mensaje: no te escribiremos más.\n\n—\n" . $pieTxt
    );
    if (!$ok) {
        // No se deja una fila que nunca recibió su correo de confirmación.
        gq_consulta($pdo, "DELETE FROM avisos WHERE email = ? AND estado = 'pendiente'", [$email]);
        gq_error(502, 'envio', 'No hemos podido enviar el correo de confirmación. Prueba más tarde.');
    }
}
gq_json(200, ['ok' => true]);
