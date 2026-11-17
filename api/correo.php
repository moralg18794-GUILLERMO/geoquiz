<?php
// GeoQuiz — envío de correo. Lo incluyen avisos.php y avisos-admin.php.
//
// Se envía por la API de Brevo (plan gratuito), no con mail() del hosting: desde un hosting
// compartido los correos caen en spam o no salen. Las claves viven en api/config.php, que
// no está en el repositorio, bajo la clave 'correo':
//
//   'correo' => [
//       'brevo_clave'      => 'xkeysib-...',                      // API key de Brevo
//       'remitente'        => 'avisos@geoquiz.tunegocioconestrategia.com',
//       'remitente_nombre' => 'GeoQuiz',
//       'contacto'         => 'correo al que escribir para dudas o borrar datos',
//       'base'             => 'https://geoquiz.tunegocioconestrategia.com',   // opcional
//   ],
//
// Sin esa clave los avisos quedan DESACTIVADOS: el juego no muestra el recuadro y la API
// responde que no están disponibles. Es el estado en el que se despliega por defecto.

declare(strict_types=1);

const GQ_TEXTO_VERSION = 'v1-2026-11';

function gq_correo_cfg(): array {
    $ruta = __DIR__ . '/config.php';
    $cfg = is_file($ruta) ? require $ruta : [];
    $c = is_array($cfg) && isset($cfg['correo']) && is_array($cfg['correo']) ? $cfg['correo'] : [];
    $c += ['brevo_clave' => '', 'remitente' => '', 'remitente_nombre' => 'GeoQuiz', 'contacto' => '',
           'base' => 'https://geoquiz.tunegocioconestrategia.com'];
    return $c;
}

function gq_correo_activo(): bool {
    $c = gq_correo_cfg();
    return $c['brevo_clave'] !== '' && $c['remitente'] !== '' && $c['contacto'] !== '';
}

// Devuelve true si Brevo aceptó el mensaje. Nunca lanza: quien llama decide qué hacer.
function gq_enviar_correo(string $para, string $asunto, string $html, string $texto, array $cabeceras = []): bool {
    $c = gq_correo_cfg();
    if (!gq_correo_activo() || !function_exists('curl_init')) {
        return false;
    }
    $cuerpo = [
        'sender'      => ['name' => $c['remitente_nombre'], 'email' => $c['remitente']],
        'to'          => [['email' => $para]],
        'subject'     => $asunto,
        'htmlContent' => $html,
        'textContent' => $texto,
    ];
    if ($cabeceras) {
        $cuerpo['headers'] = $cabeceras;
    }
    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => ['api-key: ' . $c['brevo_clave'], 'Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($cuerpo, JSON_UNESCAPED_UNICODE),
    ]);
    $resp = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($codigo < 200 || $codigo >= 300) {
        // Sin el destinatario en el registro: es un dato personal.
        error_log('GeoQuiz correo: Brevo respondió ' . $codigo . ' ' . substr((string) $resp, 0, 200));
        return false;
    }
    return true;
}

function gq_enlace_aviso(string $accion, string $token): string {
    $c = gq_correo_cfg();
    return rtrim($c['base'], '/') . '/api/avisos.php?a=' . $accion . '&t=' . $token;
}
