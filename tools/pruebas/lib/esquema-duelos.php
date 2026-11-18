<?php
// SOLO PARA PRUEBAS LOCALES. Crea en SQLite las tablas de los duelos y de los torneos de duelos
// (el equivalente de lo que api/db.php crea en MySQL, que el traductor de pruebas no sabe leer).
//   php tools/pruebas/lib/esquema-duelos.php /ruta/a/prueba.sqlite
declare(strict_types=1);
$p = new PDO('sqlite:' . ($argv[1] ?? ''));
$p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$p->exec("CREATE TABLE envios (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, creado_en TEXT NOT NULL)");
$p->exec("CREATE TABLE duelos (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, j1_nombre TEXT NOT NULL COLLATE NOCASE, j2_nombre TEXT COLLATE NOCASE, cats TEXT NOT NULL, dif TEXT NOT NULL DEFAULT 'all', turno INTEGER NOT NULL DEFAULT 1, j1_vidas INTEGER NOT NULL DEFAULT 5, j2_vidas INTEGER NOT NULL DEFAULT 5, j1_aciertos INTEGER NOT NULL DEFAULT 0, j2_aciertos INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'esperando', ganador INTEGER, ultimo_movimiento_en TEXT NOT NULL, creado_en TEXT NOT NULL, ip_hash_creador TEXT NOT NULL, ip_hash_rival TEXT)");
$p->exec("CREATE TABLE duelo_respuestas (id INTEGER PRIMARY KEY AUTOINCREMENT, duelo_id INTEGER NOT NULL REFERENCES duelos(id) ON DELETE CASCADE, orden INTEGER NOT NULL, turno_jugador INTEGER NOT NULL, cat TEXT NOT NULL DEFAULT '', diff TEXT NOT NULL DEFAULT 'medio', pts INTEGER NOT NULL DEFAULT 200, q TEXT NOT NULL, opts TEXT NOT NULL, ans INTEGER NOT NULL, exp TEXT NOT NULL DEFAULT '', opciones TEXT NOT NULL DEFAULT '', servida_en TEXT NOT NULL, elegida INTEGER NOT NULL DEFAULT -1, acertada INTEGER NOT NULL DEFAULT 0, respondida_en TEXT, UNIQUE (duelo_id, orden))");
$p->exec("CREATE TABLE duelo_abiertos (duelo_id INTEGER PRIMARY KEY REFERENCES duelos(id) ON DELETE CASCADE, publicado_en TEXT NOT NULL)");
$p->exec("CREATE TABLE salas (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, organizador TEXT NOT NULL COLLATE NOCASE, cats TEXT NOT NULL, dif TEXT NOT NULL DEFAULT 'all', plazas INTEGER NOT NULL DEFAULT 8, vidas INTEGER NOT NULL DEFAULT 3, estado TEXT NOT NULL DEFAULT 'abierta', ganador TEXT COLLATE NOCASE, llamada_en TEXT, creado_en TEXT NOT NULL, ultima_actividad_en TEXT NOT NULL, ip_hash_creador TEXT NOT NULL)");
$p->exec("CREATE TABLE sala_jugadores (id INTEGER PRIMARY KEY AUTOINCREMENT, sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE, nombre TEXT NOT NULL COLLATE NOCASE, token TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0, listo INTEGER NOT NULL DEFAULT 0, visto_en TEXT NOT NULL, ip_hash TEXT NOT NULL, UNIQUE (sala_id, nombre))");
$p->exec("CREATE TABLE sala_partidos (id INTEGER PRIMARY KEY AUTOINCREMENT, sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE, ronda INTEGER NOT NULL, pos INTEGER NOT NULL, j1 TEXT COLLATE NOCASE, j2 TEXT COLLATE NOCASE, duelo_codigo TEXT, ganador TEXT COLLATE NOCASE, motivo TEXT, UNIQUE (sala_id, ronda, pos))");
$p->exec("CREATE INDEX idx_sp_duelo ON sala_partidos (duelo_codigo)");
echo "esquema creado\n";
