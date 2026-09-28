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
        gq_error(500, 'sin_conexion', 'No se pudo conectar con la base de datos.');
    }
    return $pdo;
}

// La tabla se crea sola la primera vez. Se intenta la consulta y solo si MySQL
// responde "la tabla no existe" (SQLSTATE 42S02) se crea y se reintenta, para no
// lanzar un CREATE en cada petición.
function gq_crear_tabla(PDO $pdo): void {
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
            KEY idx_puntos (puntos DESC, id),
            KEY idx_ip_fecha (ip_hash, creado_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function gq_consulta(PDO $pdo, string $sql, array $params = []): PDOStatement {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st;
    } catch (PDOException $e) {
        if ($e->getCode() === '42S02') {
            gq_crear_tabla($pdo);
            $st = $pdo->prepare($sql);
            $st->execute($params);
            return $st;
        }
        throw $e;
    }
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
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function gq_error(int $codigo, string $clave, string $mensaje): void {
    gq_json($codigo, ['ok' => false, 'error' => $clave, 'mensaje' => $mensaje]);
}
