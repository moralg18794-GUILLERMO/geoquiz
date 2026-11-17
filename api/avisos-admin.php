<?php
// GeoQuiz — envío de un aviso a la lista confirmada. Solo con la cabecera X-GQ-Admin
// (el token_admin de config.php, el mismo de torneo-admin.php).
//
//   POST {"asunto":"…","texto":"…"}                 → prueba: cuenta a quién llegaría, no envía
//   POST {"asunto":"…","texto":"…","enviar":true}   → envía de verdad, un correo por persona
//   POST {"asunto":"…","texto":"…","solo_a":"x@y.z"} → envía SOLO a esa dirección (para probar)
//
// El texto es texto plano: los saltos de línea se respetan y cada correo lleva al pie el
// enlace de baja de esa persona (y la cabecera List-Unsubscribe que piden Gmail y Outlook).

declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/correo.php';

gq_blindar('avisos-admin');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gq_error(405, 'metodo', 'Método no permitido.');
}
$cfg = gq_config();
$esperado = (string) ($cfg['token_admin'] ?? '');
$dado = (string) ($_SERVER['HTTP_X_GQ_ADMIN'] ?? '');
if (strlen($esperado) < 16) {
    gq_error(500, 'sin_token', 'Falta token_admin en api/config.php (o es demasiado corto).');
}
if ($dado === '' || !hash_equals($esperado, $dado)) {
    gq_error(403, 'prohibido', 'No autorizado.');
}
if (!gq_correo_activo()) {
    gq_error(503, 'no_disponible', 'El envío de correo no está configurado.');
}

$d = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($d)) {
    gq_error(400, 'peticion', 'Petición no válida.');
}
$asunto = trim((string) ($d['asunto'] ?? ''));
$texto = trim((string) ($d['texto'] ?? ''));
if ($asunto === '' || $texto === '' || strlen($asunto) > 200 || strlen($texto) > 5000) {
    gq_error(400, 'contenido', 'Faltan asunto o texto (o son demasiado largos).');
}

$pdo = gq_db();
if (!empty($d['solo_a'])) {
    $filas = gq_consulta($pdo, "SELECT email, token FROM avisos WHERE estado = 'confirmado' AND email = ?",
        [strtolower(trim((string) $d['solo_a']))])->fetchAll();
} else {
    $filas = gq_consulta($pdo, "SELECT email, token FROM avisos WHERE estado = 'confirmado' ORDER BY id LIMIT 300")->fetchAll();
}
if (empty($d['enviar']) && empty($d['solo_a'])) {
    gq_json(200, ['ok' => true, 'prueba' => true, 'destinatarios' => count($filas)]);
}

$enviados = 0;
$fallos = 0;
foreach ($filas as $f) {
    $baja = gq_enlace_aviso('baja', $f['token']);
    $cuerpoTxt = $texto . "\n\n—\nRecibes esto porque pediste avisos de GeoQuiz. Para darte de baja: $baja\n";
    $cuerpoHtml = nl2br(htmlspecialchars($texto, ENT_QUOTES, 'UTF-8'))
        . '<hr><p style="font-size:12px;color:#666">Recibes esto porque pediste avisos de GeoQuiz. '
        . '<a href="' . htmlspecialchars($baja, ENT_QUOTES, 'UTF-8') . '">Darme de baja</a></p>';
    $ok = gq_enviar_correo($f['email'], $asunto, $cuerpoHtml, $cuerpoTxt, [
        'List-Unsubscribe' => '<' . $baja . '>',
    ]);
    $ok ? $enviados++ : $fallos++;
}
gq_json(200, ['ok' => true, 'enviados' => $enviados, 'fallos' => $fallos]);
