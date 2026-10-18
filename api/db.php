<?php
// GeoQuiz — conexión a MySQL y esquema del ranking.
// Este archivo no responde por sí solo: lo incluye ranking.php.

declare(strict_types=1);

function gq_config(): array {
    $ruta = __DIR__ . '/config.php';
    if (!is_file($ruta)) {
        gq_error(500, 'config_ausente', 'Falta api/config.php en el servidor.');
    }
    return require $ruta;
}

function gq_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $cfg = gq_config();
    // 127.0.0.1 y no "localhost": localhost puede resolverse a ::1 y el usuario de
    // la base de datos solo tiene permiso desde la IPv4 local.
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $cfg['host'], $cfg['port'], $cfg['nombre']);
    try {
        $pdo = new PDO($dsn, $cfg['usuario'], $cfg['clave'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        // El mensaje de PDO puede llevar credenciales: no sale nunca al cliente.
        error_log('GeoQuiz ranking: sin conexión a la base de datos: ' . $e->getMessage());
        gq_error(500, 'sin_conexion', 'No se pudo conectar con la base de datos.');
    }
    return $pdo;
}

// Las tablas se crean solas en la primera petición.
//
// `partidas` guarda UNA FILA POR PARTIDA, no una por jugador. La tabla vieja `ranking`
// guardaba solo la mejor marca global de cada uno, así que la mejor partida de alguien
// en Difícil se borraba sola en cuanto hacía una mejor en Supervivencia: el dato que
// hace falta para comparar se destruía justo al guardarlo. Aquí no se pierde nada.
//
// Es una tabla NUEVA y no un ALTER de la vieja a propósito. gq_consulta() solo sabe
// reintentar cuando MySQL dice que la tabla no existe (42S02); una columna que falta es
// 42S22 y acabaría en 500 en todos los envíos hasta entrar a phpMyAdmin a mano. Creando
// una tabla nueva se usa el mismo mecanismo que ya funciona en este servidor, y `ranking`
// se queda intacta por si algún día hay que mirarla.
//
// `dif` y `modo` guardan CÓDIGOS ('dificil', 'solo'), nunca la etiqueta que se pinta:
// si se guardara 'Difícil' con su acento, cambiar el texto en pantalla dejaría huérfanas
// todas las filas anteriores y sin dar ningún error.
//
// `envios` existe aparte para poder contar cuántas veces ha enviado alguien en la última
// hora sin que las propias partidas sirvan de contador.
function gq_crear_tablas(PDO $pdo): void {
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS partidas (
            id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
            nombre    VARCHAR(24)  NOT NULL,
            puntos    INT UNSIGNED NOT NULL,
            pct       TINYINT UNSIGNED NOT NULL,
            modo      VARCHAR(12)  NOT NULL,
            dif       VARCHAR(8)   NOT NULL DEFAULT "",
            eje       CHAR(1)      NOT NULL DEFAULT "",
            nsel      TINYINT UNSIGNED NOT NULL DEFAULT 0,
            ntot      TINYINT UNSIGNED NOT NULL DEFAULT 0,
            oficial   TINYINT UNSIGNED NOT NULL DEFAULT 0,
            ip_hash   CHAR(64)     NOT NULL,
            creado_en DATETIME     NOT NULL,
            PRIMARY KEY (id),
            KEY idx_oficial (oficial, puntos DESC, id),
            KEY idx_jugador (nombre, oficial, puntos DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS ranking (
            id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
            nombre      VARCHAR(24)  NOT NULL,
            puntos      INT UNSIGNED NOT NULL,
            pct         TINYINT UNSIGNED NOT NULL,
            modo        VARCHAR(12)  NOT NULL,
            dificultad  VARCHAR(20)  NOT NULL DEFAULT "",
            ip_hash     CHAR(64)     NOT NULL,
            creado_en   DATETIME     NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_nombre (nombre),
            KEY idx_puntos (puntos DESC, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS envios (
            id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
            ip_hash   CHAR(64)     NOT NULL,
            creado_en DATETIME     NOT NULL,
            PRIMARY KEY (id),
            KEY idx_ip_fecha (ip_hash, creado_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // ── TORNEOS ───────────────────────────────────────────────────────────
    // Los torneos viven aquí y no en el código a propósito: publicar uno tiene que ser
    // meter filas, no volver a desplegar el sitio entero. Si cada torneo costara un
    // despliegue, la idea se abandona a las tres semanas.
    //
    // Las fechas se guardan en UTC, igual que creado_en en el resto de tablas. Quien
    // publica el torneo las escribe en hora de Madrid y torneo-admin.php las convierte:
    // así el cambio de hora de octubre no mueve el cierre del domingo.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS torneos (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            slug       VARCHAR(64)  NOT NULL,
            titulo     VARCHAR(80)  NOT NULL,
            tema       VARCHAR(400) NOT NULL DEFAULT "",
            empieza_en DATETIME     NOT NULL,
            acaba_en   DATETIME     NOT NULL,
            borrador   TINYINT UNSIGNED NOT NULL DEFAULT 0,
            creado_en  DATETIME     NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_slug (slug),
            KEY idx_ventana (borrador, empieza_en, acaba_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    // Las preguntas del torneo son suyas y no salen del banco general: el torneo es el
    // mismo para todo el mundo, así que la lista tiene que estar fija y ordenada.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS torneo_preguntas (
            id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
            torneo_id INT UNSIGNED NOT NULL,
            orden     TINYINT UNSIGNED NOT NULL,
            cat       VARCHAR(40)  NOT NULL DEFAULT "",
            diff      VARCHAR(8)   NOT NULL DEFAULT "medio",
            pts       SMALLINT UNSIGNED NOT NULL DEFAULT 200,
            q         VARCHAR(400) NOT NULL,
            opts      VARCHAR(800) NOT NULL,
            ans       TINYINT UNSIGNED NOT NULL,
            hint      VARCHAR(300) NOT NULL DEFAULT "",
            exp       VARCHAR(600) NOT NULL DEFAULT "",
            PRIMARY KEY (id),
            UNIQUE KEY uq_orden (torneo_id, orden),
            CONSTRAINT fk_tp_torneo FOREIGN KEY (torneo_id) REFERENCES torneos (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    // UNA FILA POR JUGADOR Y TORNEO, y la clave única es la regla: quien ya jugó no puede
    // volver a entrar con el mismo nick. No lo decide el navegador, lo decide MySQL. Y como
    // la colación ignora mayúsculas y acentos, "Guille" y "guille" son la misma persona,
    // que aquí es justo lo que se busca.
    //
    // La fila se crea al EMPEZAR, no al terminar. Si se creara al final, se podría entrar,
    // leer las quince preguntas, salir sin enviar y volver a jugarlas ya sabidas. Con la
    // reserva, ese segundo intento tendría que ir con otro mote, y eso se ve.
    //   empezado_en  cuándo arrancó: el reloj lo lleva el servidor, no el navegador
    //   terminado    0 mientras está a medias, 1 cuando se ha enviado el resultado
    // Una partida a medias se puede reanudar con el mismo mote —nadie pierde el torneo por
    // quedarse sin batería—, pero el cronómetro sigue corriendo desde el primer arranque.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS torneo_partidas (
            id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
            torneo_id INT UNSIGNED NOT NULL,
            nombre    VARCHAR(24)  NOT NULL,
            puntos    INT UNSIGNED NOT NULL,
            correctas TINYINT UNSIGNED NOT NULL DEFAULT 0,
            total     TINYINT UNSIGNED NOT NULL DEFAULT 0,
            segundos  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            empezado_en DATETIME   NULL,
            terminado TINYINT UNSIGNED NOT NULL DEFAULT 0,
            ip_hash   CHAR(64)     NOT NULL,
            creado_en DATETIME     NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_jugador (torneo_id, nombre),
            KEY idx_clasificacion (torneo_id, puntos DESC, id),
            CONSTRAINT fk_tpa_torneo FOREIGN KEY (torneo_id) REFERENCES torneos (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    // Una fila por pregunta servida. Aquí es donde el servidor lleva la partida: qué
    // pregunta se ha enseñado, cuándo, en qué orden se barajaron sus opciones, qué se
    // respondió y cuántos puntos valió. La puntuación deja de calcularla el navegador.
    //
    // `opciones` guarda la permutación con la que se enviaron las opciones a ESE jugador
    // ("2,0,3,1"). Sin ella el servidor no sabría qué significa el índice que le devuelven,
    // y con ella cada uno ve las opciones en un orden distinto: no se puede cantar «la
    // tercera» por el grupo.
    //
    // `servida_en` es lo que permite calcular el bonus por rapidez en el servidor, que es
    // el único sitio donde no se puede falsear.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS torneo_respuestas (
            id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
            partida_id    INT UNSIGNED NOT NULL,
            orden         TINYINT UNSIGNED NOT NULL,
            opciones      VARCHAR(16)  NOT NULL DEFAULT "",
            servida_en    DATETIME     NOT NULL,
            elegida       TINYINT      NOT NULL DEFAULT -1,
            acertada      TINYINT UNSIGNED NOT NULL DEFAULT 0,
            puntos        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            respondida_en DATETIME     NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_pregunta (partida_id, orden),
            CONSTRAINT fk_tr_partida FOREIGN KEY (partida_id) REFERENCES torneo_partidas (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // ── DUELO ONLINE ──────────────────────────────────────────────────────
    // Sustituye al duelo del mismo móvil: dos jugadores, cada uno en su dispositivo,
    // conectados por un código de 6 caracteres. Turnos remotos (no simultáneos): se
    // alternan, y el que se queda a 0 vidas pierde. Al ser por turnos, nunca pueden
    // llegar los dos a 0 a la vez, así que no hace falta desempate por tiempo.
    //
    // A diferencia del torneo, aquí SÍ se guardan los totales en la propia fila
    // (vidas, puntos, turno): no hay que recalcularlos sumando duelo_respuestas en
    // cada petición, porque un duelo se consulta mucho más seguido (sondeo cada
    // 2-3 segundos mientras dura la partida).
    //   estado    esperando (creado, sin rival) · jugando · terminado
    //   ganador   1 o 2 cuando termina; null mientras no ha terminado
    //   ultimo_movimiento_en  se toca en cada acción; si pasan 5 min sin que el
    //     jugador en turno responda, pierde por abandono (lo mira gq_d_estado())
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS duelos (
            id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
            codigo        CHAR(6)      NOT NULL,
            j1_nombre     VARCHAR(24)  NOT NULL,
            j2_nombre     VARCHAR(24)  NULL,
            cats          VARCHAR(400) NOT NULL,
            dif           VARCHAR(8)   NOT NULL DEFAULT "all",
            turno         TINYINT UNSIGNED NOT NULL DEFAULT 1,
            j1_vidas      TINYINT UNSIGNED NOT NULL DEFAULT 3,
            j2_vidas      TINYINT UNSIGNED NOT NULL DEFAULT 3,
            j1_puntos     INT UNSIGNED NOT NULL DEFAULT 0,
            j2_puntos     INT UNSIGNED NOT NULL DEFAULT 0,
            estado        VARCHAR(10)  NOT NULL DEFAULT "esperando",
            ganador       TINYINT UNSIGNED NULL,
            ultimo_movimiento_en DATETIME NOT NULL,
            creado_en     DATETIME     NOT NULL,
            ip_hash_creador CHAR(64)   NOT NULL,
            ip_hash_rival   CHAR(64)   NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_codigo (codigo),
            KEY idx_estado (estado, ultimo_movimiento_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    // Una fila por pregunta servida, numerada de corrido para todo el duelo (1 la
    // primera de J1, 2 la primera de J2, 3 la segunda de J1...), igual que el
    // torneo guarda la permutación de opciones y la hora de servido para poder
    // calcular el bonus por rapidez sin fiarse del navegador.
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS duelo_respuestas (
            id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
            duelo_id       INT UNSIGNED NOT NULL,
            orden          SMALLINT UNSIGNED NOT NULL,
            turno_jugador  TINYINT UNSIGNED NOT NULL,
            cat            VARCHAR(40)  NOT NULL DEFAULT "",
            diff           VARCHAR(8)   NOT NULL DEFAULT "medio",
            pts            SMALLINT UNSIGNED NOT NULL DEFAULT 200,
            q              VARCHAR(400) NOT NULL,
            opts           VARCHAR(800) NOT NULL,
            ans            TINYINT UNSIGNED NOT NULL,
            exp            VARCHAR(600) NOT NULL DEFAULT "",
            opciones       VARCHAR(16)  NOT NULL DEFAULT "",
            servida_en     DATETIME     NOT NULL,
            elegida        TINYINT      NOT NULL DEFAULT -1,
            acertada       TINYINT UNSIGNED NOT NULL DEFAULT 0,
            puntos_ganados SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            respondida_en  DATETIME     NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_orden (duelo_id, orden),
            CONSTRAINT fk_dr_duelo FOREIGN KEY (duelo_id) REFERENCES duelos (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

// Se intenta la consulta y solo si MySQL responde "la tabla no existe"
// (SQLSTATE 42S02) se crean las tablas y se reintenta, para no lanzar un CREATE
// en cada petición.
function gq_consulta(PDO $pdo, string $sql, array $params = []): PDOStatement {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st;
    } catch (PDOException $e) {
        if ($e->getCode() === '42S02') {
            gq_crear_tablas($pdo);
            $st = $pdo->prepare($sql);
            $st->execute($params);
            return $st;
        }
        throw $e;
    }
}

// ── COSAS COMPARTIDAS POR LOS ENDPOINTS ───────────────────────────────────
// Viven aquí y no en ranking.php porque ahora hay dos endpoints públicos. Tener dos
// copias del saneado de nombres o dos listas de orígenes es cómo una de ellas se queda
// atrás: se añade un dominio en un sitio y no en el otro, o se tapa un agujero a medias.
const GQ_MAX_NOMBRE = 24;
const GQ_ORIGENES = [
    'https://mediumturquoise-dugong-529601.hostingersite.com',
    'https://moralg18794-guillermo.github.io',
];

// El juego se sirve desde dos dominios y la API vive solo en uno de ellos. Responde al
// preflight y corta la ejecución si la petición era un OPTIONS.
function gq_cors(string $cabeceras = 'Content-Type'): void {
    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origen, GQ_ORIGENES, true)) {
        header('Access-Control-Allow-Origin: ' . $origen);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: ' . $cabeceras);
    header('Access-Control-Max-Age: 86400');
    header('Cache-Control: no-store');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

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

// Largo en CARACTERES, con red por si el servidor no tiene mbstring: el resto del archivo
// ya se protege así en gq_recortar(), y una llamada suelta a mb_* sin comprobar sería un
// error fatal, es decir un 500 en vez de un mensaje.
function gq_largo(string $s): int {
    if (function_exists('mb_strlen')) {
        return mb_strlen($s, 'UTF-8');
    }
    return (int) preg_match_all('/./us', $s);
}

// Minúsculas para comparar. Sin mbstring solo baja las ASCII, que basta para lo único que
// se usa: detectar que dos preguntas de un mismo torneo son un copia y pega. Para comparar
// NOMBRES no se usa esto, se le pregunta a MySQL, que sí sabe de acentos.
function gq_minus(string $s): string {
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
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

// Todo endpoint responde JSON pase lo que pase. Sin esto, una excepción de la base de
// datos saldría como un error de PHP, rompiendo el contrato de la API y pudiendo filtrar
// la consulta y la ruta absoluta del servidor.
function gq_blindar(string $etiqueta): void {
    ini_set('display_errors', '0');
    error_reporting(E_ALL);
    set_exception_handler(function (Throwable $e) use ($etiqueta): void {
        error_log("GeoQuiz $etiqueta: " . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        gq_error(500, 'servidor', 'Error interno. Vuelve a intentarlo.');
    });
    register_shutdown_function(function () use ($etiqueta): void {
        $e = error_get_last();
        if ($e !== null && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            error_log("GeoQuiz $etiqueta (fatal): " . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
            if (!headers_sent()) {
                gq_error(500, 'servidor', 'Error interno. Vuelve a intentarlo.');
            }
        }
    });
}

function gq_ip_hash(): string {
    $cfg = gq_config();
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    // Se guarda el hash, no la IP: sirve igual para limitar envíos y no almacena
    // un dato personal identificable.
    return hash('sha256', $cfg['sal_ip'] . '|' . $ip);
}

function gq_json(int $codigo, array $cuerpo): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    $txt = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($txt === false) {
        // Alguna fila trae bytes que no son UTF-8 válido. Antes de devolver un
        // cuerpo vacío a todo el mundo, se sustituyen y se deja constancia.
        error_log('GeoQuiz ranking: json_encode falló: ' . json_last_error_msg());
        $txt = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    if ($txt === false) {
        $txt = '{"ok":false,"error":"codificacion","mensaje":"Respuesta no codificable."}';
    }
    echo $txt;
    exit;
}

function gq_error(int $codigo, string $clave, string $mensaje): void {
    gq_json($codigo, ['ok' => false, 'error' => $clave, 'mensaje' => $mensaje]);
}
