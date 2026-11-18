<?php
// SOLO PARA PRUEBAS LOCALES. Un PDO de SQLite que traduce las pocas funciones de MySQL que usa
// api/torneo.php (la hora UTC, el intervalo de un día, la diferencia en segundos, LEAST/GREATEST),
// para poder probar el torneo entero en este portátil, que no tiene MySQL. El servidor de verdad
// nunca lo carga: el .sh lo engancha en una COPIA de api/db.php dentro de una carpeta temporal.
declare(strict_types=1);

class GQPdoSqliteMysql extends PDO {
    public function __construct($dsn, $usuario = null, $clave = null, $opciones = []) {
        parent::__construct($dsn, $usuario, $clave, $opciones);
        parent::exec('PRAGMA foreign_keys = ON');   // para que ON DELETE CASCADE funcione, como en MySQL
    }

    private static function traducir(string $sql): string {
        $sql = preg_replace('/\(UTC_TIMESTAMP\(\)\s*-\s*INTERVAL\s+(\d+)\s+(DAY|HOUR)\)/i', "datetime('now', '-\${1} \${2}')", $sql);
        $sql = preg_replace('/TIMESTAMPDIFF\(SECOND,\s*([^,()]+?)\s*,\s*UTC_TIMESTAMP\(\)\)/i', "CAST(strftime('%s','now') - strftime('%s', \${1}) AS INTEGER)", $sql);
        $sql = str_ireplace('UTC_TIMESTAMP()', "datetime('now')", $sql);
        $sql = preg_replace('/\bLEAST\(/i', 'MIN(', $sql);
        $sql = preg_replace('/\bGREATEST\(/i', 'MAX(', $sql);
        return $sql;
    }

    public function prepare(string $query, array $options = []): PDOStatement|false {
        return parent::prepare(self::traducir($query), $options);
    }
    public function exec(string $statement): int|false {
        return parent::exec(self::traducir($statement));
    }
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
        return $fetchMode === null ? parent::query(self::traducir($query)) : parent::query(self::traducir($query), $fetchMode, ...$fetchModeArgs);
    }
}
