<?php
// GeoQuiz — envío de correo. Lo incluyen avisos.php y avisos-admin.php.
//
// Se envía con un buzón de correo de Hostinger (SMTP con login), no con mail() del hosting:
// el buzón sale con las firmas del dominio y llega mucho mejor que un correo suelto del
// servidor web. Los datos viven en api/config.php, que no está en el repositorio, bajo 'correo':
//
//   'correo' => [
//       'smtp_host'        => 'smtp.hostinger.com',
//       'smtp_puerto'      => 465,
//       'smtp_usuario'     => 'avisos@tunegocioconestrategia.com',   // el buzón
//       'smtp_clave'       => '…',                                   // su contraseña
//       'remitente_nombre' => 'GeoQuiz',
//       'contacto'         => 'correo al que escribir para dudas o borrar datos',
//       'base'             => 'https://geoquiz.tunegocioconestrategia.com',   // opcional
//   ],
//
// Sin esos datos los avisos quedan DESACTIVADOS: el juego no muestra el recuadro y la API
// responde que no están disponibles. Es el estado en el que se despliega por defecto.

declare(strict_types=1);

const GQ_TEXTO_VERSION = 'v1-2026-11';

function gq_correo_cfg(): array {
    // Los datos del buzón viven en api/correo-config.php (que devuelve directamente el array
    // de abajo) para no tener que reescribir config.php, que lleva la base de datos. Si no
    // existe, se mira la clave 'correo' de config.php.
    $propio = __DIR__ . '/correo-config.php';
    $ruta = __DIR__ . '/config.php';
    if (is_file($propio)) {
        $c = require $propio;
    } else {
        $cfg = is_file($ruta) ? require $ruta : [];
        $c = is_array($cfg) && isset($cfg['correo']) && is_array($cfg['correo']) ? $cfg['correo'] : [];
    }
    $c = is_array($c) ? $c : [];
    $c += ['smtp_host' => 'smtp.hostinger.com', 'smtp_puerto' => 465, 'smtp_usuario' => '', 'smtp_clave' => '',
           'remitente_nombre' => 'GeoQuiz', 'contacto' => '',
           'base' => 'https://geoquiz.tunegocioconestrategia.com'];
    return $c;
}

function gq_correo_activo(): bool {
    $c = gq_correo_cfg();
    return $c['smtp_usuario'] !== '' && $c['smtp_clave'] !== '' && $c['contacto'] !== '';
}

// Lee la respuesta SMTP (puede venir en varias líneas "250-…") y devuelve su código.
function gq_smtp_leer($f): int {
    $codigo = 0;
    while (($linea = fgets($f, 515)) !== false) {
        $codigo = (int) substr($linea, 0, 3);
        if (strlen($linea) < 4 || $linea[3] !== '-') {
            break;
        }
    }
    return $codigo;
}

function gq_smtp_cmd($f, string $cmd, int $espera): bool {
    fwrite($f, $cmd . "\r\n");
    return gq_smtp_leer($f) === $espera;
}

// Devuelve true si el servidor aceptó el mensaje. Nunca lanza: quien llama decide qué hacer.
function gq_enviar_correo(string $para, string $asunto, string $html, string $texto, array $cabeceras = []): bool {
    if (!gq_correo_activo()) {
        return false;
    }
    $c = gq_correo_cfg();
    // Sin saltos de línea en nada que vaya a una cabecera: es como se cuela un segundo destinatario.
    $limpio = static fn(string $s): string => str_replace(["\r", "\n"], ' ', $s);
    $para = $limpio($para);
    $de = $c['smtp_usuario'];
    $nombre = '=?UTF-8?B?' . base64_encode($limpio($c['remitente_nombre'])) . '?=';
    $lim = 'gq' . bin2hex(random_bytes(8));
    $dominio = substr(strrchr($de, '@') ?: '@localhost', 1);

    $cab = [
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        "From: $nombre <$de>",
        "To: <$para>",
        'Subject: =?UTF-8?B?' . base64_encode($limpio($asunto)) . '?=',
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $dominio . '>',
        'MIME-Version: 1.0',
        "Content-Type: multipart/alternative; boundary=\"$lim\"",
    ];
    foreach ($cabeceras as $k => $v) {
        $cab[] = $limpio((string) $k) . ': ' . $limpio((string) $v);
    }
    $parte = static fn(string $tipo, string $cuerpo): string =>
        "Content-Type: $tipo; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($cuerpo));
    $mensaje = implode("\r\n", $cab) . "\r\n\r\n"
        . "--$lim\r\n" . $parte('text/plain', $texto)
        . "--$lim\r\n" . $parte('text/html', $html)
        . "--$lim--\r\n";

    $f = @stream_socket_client('ssl://' . $c['smtp_host'] . ':' . (int) $c['smtp_puerto'], $en, $es, 10);
    if (!$f) {
        error_log("GeoQuiz correo: sin conexión SMTP ($en)");
        return false;
    }
    stream_set_timeout($f, 15);
    $ok = gq_smtp_leer($f) === 220
        && gq_smtp_cmd($f, 'EHLO ' . $dominio, 250)
        && gq_smtp_cmd($f, 'AUTH LOGIN', 334)
        && gq_smtp_cmd($f, base64_encode($c['smtp_usuario']), 334)
        && gq_smtp_cmd($f, base64_encode($c['smtp_clave']), 235)
        && gq_smtp_cmd($f, "MAIL FROM:<$de>", 250)
        && gq_smtp_cmd($f, "RCPT TO:<$para>", 250)
        && gq_smtp_cmd($f, 'DATA', 354);
    if ($ok) {
        // Un punto solo al principio de línea terminaría el mensaje antes de tiempo.
        $ok = gq_smtp_cmd($f, preg_replace('/^\./m', '..', $mensaje) . "\r\n.", 250);
    }
    @fwrite($f, "QUIT\r\n");
    fclose($f);
    if (!$ok) {
        // Sin el destinatario en el registro: es un dato personal.
        error_log('GeoQuiz correo: el servidor SMTP no aceptó el mensaje.');
    }
    return $ok;
}

function gq_enlace_aviso(string $accion, string $token): string {
    $c = gq_correo_cfg();
    return rtrim($c['base'], '/') . '/api/avisos.php?a=' . $accion . '&t=' . $token;
}
