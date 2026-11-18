<?php
// GeoQuiz — cuentas de jugador, SIN contraseña: se entra con un código de seis cifras por correo.
//   POST {accion:'alta',     nombre, email, mayor:true}  → manda un código para CREAR la cuenta
//   POST {accion:'entrar',   email}                      → manda un código para ENTRAR en una cuenta
//   POST {accion:'verificar', email, codigo}             → comprueba el código y abre sesión
//   POST {accion:'perfil',   sesion}                     → nombre e historial guardados
//   POST {accion:'guardar',  sesion, stats}              → guarda el historial (JSON del navegador)
//   POST {accion:'nombre',   sesion, nombre}             → cambia el nombre
//   POST {accion:'salir',    sesion}                     → cierra la sesión de este dispositivo
//   POST {accion:'borrar',   sesion}                     → borra la cuenta y todo lo suyo
//
// Reglas que importan:
//  · La cuenta NO se crea al pedir el código sino al verificarlo: quien teclea un correo ajeno no
//    deja nada guardado a nombre de otro.
//  · «alta» y «entrar» responden SIEMPRE lo mismo, exista o no el correo: no se puede usar esto para
//    averiguar quién tiene cuenta.
//  · Del código solo se guarda un hash; dura 15 minutos y admite 5 intentos. De la sesión se guarda el
//    hash del testigo, no el testigo.
//  · Tener cuenta NO apunta a los avisos por correo: eso es otra casilla, otro permiso y otra tabla. Solo si
//    la persona marca esa casilla al crear el perfil (y verifica el código) se la apunta, ya confirmada.

declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/correo.php';

gq_blindar('cuenta');
gq_cors();

const GQ_CODIGO_MIN_ENTRE = 60;      // segundos entre dos códigos al mismo correo
const GQ_CODIGOS_EMAIL_HORA = 5;
const GQ_CODIGOS_IP_HORA = 10;
const GQ_CODIGO_INTENTOS = 5;
const GQ_CODIGO_MINUTOS = 15;
const GQ_SESION_DIAS = 180;
const GQ_STATS_MAX = 65536;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gq_error(405, 'metodo', 'Método no permitido.');
}
$crudo = file_get_contents('php://input');
if ($crudo === false || strlen($crudo) > GQ_STATS_MAX + 4096) {
    gq_error(400, 'peticion', 'Petición no válida.');
}
$d = json_decode($crudo, true);
if (!is_array($d)) {
    gq_error(400, 'peticion', 'Petición no válida.');
}
$accion = (string) ($d['accion'] ?? '');
$pdo = gq_db();
$ahora = gmdate('Y-m-d H:i:s');

// Limpieza barata en cada petición: códigos de más de un día y sesiones sin uso en seis meses.
gq_consulta($pdo, 'DELETE FROM cuenta_codigos WHERE creado_en < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]);
gq_consulta($pdo, 'DELETE FROM cuenta_sesiones WHERE ultimo_uso < ?', [gmdate('Y-m-d H:i:s', time() - GQ_SESION_DIAS * 86400)]);

function gq_cuenta_email(array $d): string {
    $e = strtolower(trim((string) ($d['email'] ?? '')));
    if ($e === '' || strlen($e) > 190 || filter_var($e, FILTER_VALIDATE_EMAIL) === false) {
        gq_error(400, 'email', 'Ese correo no parece válido.');
    }
    return $e;
}

function gq_cuenta_hash_codigo(string $codigo, string $email): string {
    $cfg = gq_config();
    return hash_hmac('sha256', $codigo, ($cfg['sal_ip'] ?? '') . '|cuenta|' . $email);
}

// ¿Hay ya una cuenta con ese nombre? La comparación la hace la base de datos (sin distinguir
// mayúsculas ni acentos). También se reservan los nombres de quien juega fuera de concurso.
function gq_cuenta_nombre_ocupado(PDO $pdo, string $nombre, string $exceptoEmail = ''): bool {
    foreach (GQ_AUTORES as $a) {
        if (gq_minus($a) === gq_minus($nombre)) {
            return true;
        }
    }
    $f = gq_consulta($pdo, 'SELECT email FROM cuentas WHERE nombre = ?', [$nombre])->fetch();
    return $f && $f['email'] !== $exceptoEmail;
}

// Devuelve la cuenta (fila) de una sesión válida o corta con 401.
function gq_cuenta_de_sesion(PDO $pdo, array $d, string $ahora): array {
    $t = (string) ($d['sesion'] ?? '');
    if (preg_match('/^[a-f0-9]{64}$/', $t) !== 1) {
        gq_error(401, 'sesion', 'Sesión no válida. Vuelve a entrar.');
    }
    $h = hash('sha256', $t);
    $s = gq_consulta($pdo, 'SELECT cuenta_id FROM cuenta_sesiones WHERE token_hash = ?', [$h])->fetch();
    if (!$s) {
        gq_error(401, 'sesion', 'Sesión no válida. Vuelve a entrar.');
    }
    gq_consulta($pdo, 'UPDATE cuenta_sesiones SET ultimo_uso = ? WHERE token_hash = ?', [$ahora, $h]);
    $c = gq_consulta($pdo, 'SELECT * FROM cuentas WHERE id = ?', [$s['cuenta_id']])->fetch();
    if (!$c) {
        gq_error(401, 'sesion', 'Sesión no válida. Vuelve a entrar.');
    }
    return $c;
}

// Crea un código y lo manda. Los límites se aplican igual exista o no la cuenta.
function gq_cuenta_mandar_codigo(PDO $pdo, string $email, ?string $nombre, string $ahora, bool $mandar): void {
    $ip = hash('sha256', 'cuenta|' . gq_ip_hash());
    $hora = gmdate('Y-m-d H:i:s', time() - 3600);
    $porIp = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM cuenta_codigos WHERE ip_hash = ? AND creado_en > ?', [$ip, $hora])->fetchColumn();
    $porEmail = (int) gq_consulta($pdo, 'SELECT COUNT(*) FROM cuenta_codigos WHERE email = ? AND creado_en > ?', [$email, $hora])->fetchColumn();
    if ($porIp >= GQ_CODIGOS_IP_HORA || $porEmail >= GQ_CODIGOS_EMAIL_HORA) {
        gq_error(429, 'limite', 'Demasiados intentos. Prueba más tarde.');
    }
    $ultimo = gq_consulta($pdo, 'SELECT creado_en FROM cuenta_codigos WHERE email = ? ORDER BY id DESC LIMIT 1', [$email])->fetch();
    if ($ultimo && strtotime($ultimo['creado_en'] . ' UTC') > time() - GQ_CODIGO_MIN_ENTRE) {
        return; // se pidió hace menos de un minuto: se responde igual y no se manda otro
    }
    $codigo = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    // Se registra SIEMPRE (también si no hay cuenta a la que entrar) para que los tiempos y los
    // límites sean los mismos y no delaten nada; solo el envío depende de $mandar.
    gq_consulta($pdo,
        'INSERT INTO cuenta_codigos (email, codigo_hash, nombre, intentos, creado_en, expira_en, ip_hash) VALUES (?, ?, ?, 0, ?, ?, ?)',
        [$email, gq_cuenta_hash_codigo($codigo, $email), $nombre, $ahora, gmdate('Y-m-d H:i:s', time() + GQ_CODIGO_MINUTOS * 60), $ip]);
    if (!$mandar) {
        return;
    }
    [$pieTxt, $pieHtml] = gq_pie_legal();
    $ok = gq_enviar_correo(
        $email,
        "Tu código de GeoQuiz: $codigo",
        '<p>Hola,</p><p>Tu código para entrar en GeoQuiz es:</p>'
        . '<p style="font-size:28px;letter-spacing:6px;font-weight:700">' . $codigo . '</p>'
        . '<p>Caduca en ' . GQ_CODIGO_MINUTOS . ' minutos. Si no lo has pedido tú, ignora este mensaje: nadie puede entrar sin el código.</p>' . $pieHtml,
        "Hola,\n\nTu código para entrar en GeoQuiz es: $codigo\n\nCaduca en " . GQ_CODIGO_MINUTOS . " minutos. Si no lo has pedido tú, ignora este mensaje: nadie puede entrar sin el código.\n\n—\n" . $pieTxt
    );
    if (!$ok) {
        gq_error(502, 'envio', 'No hemos podido enviar el correo. Prueba más tarde.');
    }
}

// Apunta el correo a los avisos por correo, YA confirmado: se llama solo después de verificar el código,
// que demuestra que quien lo pide es el dueño del correo, así que no hace falta otro correo de
// confirmación. La casilla es aparte de la de crear el perfil y viene desmarcada.
function gq_cuenta_suscribir_avisos(PDO $pdo, string $email, string $ahora): void {
    $fila = gq_consulta($pdo, 'SELECT estado FROM avisos WHERE email = ?', [$email])->fetch();
    if (!$fila) {
        gq_consulta($pdo,
            'INSERT INTO avisos (email, estado, token, texto_version, ip_hash, pedido_en, confirmado_en) VALUES (?, \'confirmado\', ?, ?, ?, ?, ?)',
            [$email, bin2hex(random_bytes(20)), GQ_TEXTO_VERSION, hash('sha256', 'avisos|' . gq_ip_hash()), $ahora, $ahora]);
    } elseif ($fila['estado'] !== 'confirmado') {
        gq_consulta($pdo, "UPDATE avisos SET estado = 'confirmado', confirmado_en = ?, texto_version = ? WHERE email = ?", [$ahora, GQ_TEXTO_VERSION, $email]);
    }
}

function gq_cuenta_stats_json(?string $s) {
    if ($s === null || $s === '') {
        return null;
    }
    $v = json_decode($s, true);
    return is_array($v) ? $v : null;
}

// ── ALTA: pide el código para crear una cuenta ────────────────────────────
if ($accion === 'alta') {
    if (!empty($d['web'])) {
        gq_json(200, ['ok' => true]); // trampa para bots
    }
    if (($d['mayor'] ?? false) !== true) {
        gq_error(400, 'mayor', 'Hace falta confirmar que tienes 14 años o más.');
    }
    $email = gq_cuenta_email($d);
    $nombre = gq_limpiar_nombre((string) ($d['nombre'] ?? ''));
    if ($nombre === '') {
        gq_error(400, 'nombre', 'Escribe un nombre.');
    }
    if (gq_cuenta_nombre_ocupado($pdo, $nombre, $email)) {
        gq_error(409, 'nombre_ocupado', 'Ese nombre ya lo usa otra persona. Elige otro.');
    }
    gq_cuenta_mandar_codigo($pdo, $email, $nombre, $ahora, true);
    gq_json(200, ['ok' => true]);
}

// ── ENTRAR: pide el código para una cuenta que ya existe ──────────────────
if ($accion === 'entrar') {
    $email = gq_cuenta_email($d);
    $existe = (bool) gq_consulta($pdo, 'SELECT 1 FROM cuentas WHERE email = ?', [$email])->fetch();
    gq_cuenta_mandar_codigo($pdo, $email, null, $ahora, $existe);
    gq_json(200, ['ok' => true]);
}

// ── VERIFICAR: comprueba el código y abre la sesión ───────────────────────
if ($accion === 'verificar') {
    $email = gq_cuenta_email($d);
    $codigo = preg_replace('/\D/', '', (string) ($d['codigo'] ?? '')) ?? '';
    if (strlen($codigo) !== 6) {
        gq_error(400, 'codigo', 'El código tiene seis cifras.');
    }
    $fila = gq_consulta($pdo, 'SELECT * FROM cuenta_codigos WHERE email = ? AND expira_en > ? ORDER BY id DESC LIMIT 1', [$email, $ahora])->fetch();
    if (!$fila) {
        gq_error(400, 'codigo', 'El código no es válido o ha caducado. Pide uno nuevo.');
    }
    if ((int) $fila['intentos'] >= GQ_CODIGO_INTENTOS) {
        gq_error(429, 'codigo_bloqueado', 'Demasiados intentos con este código. Pide uno nuevo.');
    }
    if (!hash_equals($fila['codigo_hash'], gq_cuenta_hash_codigo($codigo, $email))) {
        gq_consulta($pdo, 'UPDATE cuenta_codigos SET intentos = intentos + 1 WHERE id = ?', [$fila['id']]);
        gq_error(400, 'codigo', 'Ese código no es correcto.');
    }
    gq_consulta($pdo, 'DELETE FROM cuenta_codigos WHERE email = ?', [$email]);

    $cuenta = gq_consulta($pdo, 'SELECT * FROM cuentas WHERE email = ?', [$email])->fetch();
    if (!$cuenta) {
        $nombre = (string) ($fila['nombre'] ?? '');
        if ($nombre === '') {
            gq_error(400, 'sin_cuenta', 'No hay ninguna cuenta con ese correo. Créala primero.');
        }
        if (gq_cuenta_nombre_ocupado($pdo, $nombre, $email)) {
            gq_error(409, 'nombre_ocupado', 'Ese nombre lo acaba de coger otra persona. Elige otro.');
        }
        gq_consulta($pdo, 'INSERT INTO cuentas (email, nombre, creada_en, ultimo_acceso) VALUES (?, ?, ?, ?)', [$email, $nombre, $ahora, $ahora]);
        $cuenta = gq_consulta($pdo, 'SELECT * FROM cuentas WHERE email = ?', [$email])->fetch();
    } else {
        gq_consulta($pdo, 'UPDATE cuentas SET ultimo_acceso = ? WHERE id = ?', [$ahora, $cuenta['id']]);
    }
    $avisos = ($d['avisos'] ?? false) === true;
    if ($avisos) {
        gq_cuenta_suscribir_avisos($pdo, $email, $ahora);
    }
    $token = bin2hex(random_bytes(32));
    gq_consulta($pdo, 'INSERT INTO cuenta_sesiones (cuenta_id, token_hash, creada_en, ultimo_uso) VALUES (?, ?, ?, ?)',
        [$cuenta['id'], hash('sha256', $token), $ahora, $ahora]);
    gq_json(200, ['ok' => true, 'sesion' => $token, 'nombre' => $cuenta['nombre'], 'avisos' => $avisos, 'stats' => gq_cuenta_stats_json($cuenta['stats'])]);
}

// ── Desde aquí hace falta una sesión ──────────────────────────────────────
$cuenta = gq_cuenta_de_sesion($pdo, $d, $ahora);

if ($accion === 'perfil') {
    gq_json(200, ['ok' => true, 'nombre' => $cuenta['nombre'], 'stats' => gq_cuenta_stats_json($cuenta['stats'])]);
}

if ($accion === 'guardar') {
    $stats = $d['stats'] ?? null;
    if (!is_array($stats)) {
        gq_error(400, 'stats', 'Datos no válidos.');
    }
    $json = json_encode($stats, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > GQ_STATS_MAX) {
        gq_error(413, 'stats', 'El historial es demasiado grande.');
    }
    gq_consulta($pdo, 'UPDATE cuentas SET stats = ?, stats_en = ? WHERE id = ?', [$json, $ahora, $cuenta['id']]);
    gq_json(200, ['ok' => true]);
}

if ($accion === 'nombre') {
    $nombre = gq_limpiar_nombre((string) ($d['nombre'] ?? ''));
    if ($nombre === '') {
        gq_error(400, 'nombre', 'Escribe un nombre.');
    }
    if (gq_cuenta_nombre_ocupado($pdo, $nombre, $cuenta['email'])) {
        gq_error(409, 'nombre_ocupado', 'Ese nombre ya lo usa otra persona. Elige otro.');
    }
    gq_consulta($pdo, 'UPDATE cuentas SET nombre = ? WHERE id = ?', [$nombre, $cuenta['id']]);
    gq_json(200, ['ok' => true, 'nombre' => $nombre]);
}

if ($accion === 'salir') {
    gq_consulta($pdo, 'DELETE FROM cuenta_sesiones WHERE token_hash = ?', [hash('sha256', (string) $d['sesion'])]);
    gq_json(200, ['ok' => true]);
}

if ($accion === 'borrar') {
    gq_consulta($pdo, 'DELETE FROM cuenta_sesiones WHERE cuenta_id = ?', [$cuenta['id']]);
    gq_consulta($pdo, 'DELETE FROM cuenta_codigos WHERE email = ?', [$cuenta['email']]);
    gq_consulta($pdo, 'DELETE FROM cuentas WHERE id = ?', [$cuenta['id']]);
    gq_json(200, ['ok' => true]);
}

gq_error(400, 'accion', 'Acción no válida.');
