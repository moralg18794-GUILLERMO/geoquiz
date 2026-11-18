<?php
// GeoQuiz — piezas del duelo que comparten api/duelo.php (el duelo en sí) y api/sala.php (el
// torneo de duelos). No responde por sí solo: lo incluyen los dos y se limita a definir
// constantes y funciones, para que ninguno tenga que ejecutar el otro.
//
// Un partido de un torneo ES un duelo normal: la sala lo crea con los dos nombres ya puestos y
// desde ahí lo llevan duelo.php (preguntas, vidas, rondas) y los propios jugadores. Lo único
// distinto es lo que cambia aquí abajo: menos vidas, menos paciencia con quien no mueve, y que
// un partido de cuadro no puede acabar en empate.

declare(strict_types=1);

// ── LÍMITES ───────────────────────────────────────────────────────────────
const GQ_D_CREACIONES_HORA   = 20;   // solo se cuenta "crear": lo demás ya lo limita el propio duelo
const GQ_D_SEGUNDOS_PREGUNTA = 20;
const GQ_D_GRACIA            = 5;
const GQ_D_ABANDONO_MIN      = 5;
const GQ_D_VIDAS_INICIAL     = 5;
const GQ_D_TOPE_LISTA        = 100;
const GQ_D_DIFS              = ['all', 'facil', 'medio', 'dificil'];
// Retos abiertos: la lista solo enseña los que tienen a su creador conectado (su sondeo toca
// ultimo_movimiento_en cada 2-3 s; 45 s de margen para móviles que frenan el navegador al
// cambiar de app) y un reto sin rival se cierra solo a los 15 minutos.
const GQ_D_PRESENCIA_SEG     = 45;
const GQ_D_ABIERTO_MIN       = 15;
const GQ_D_TOPE_ABIERTOS     = 20;
// Partidos de un torneo de duelos: 3 vidas (unos 3 minutos por partido, no 5), 2 minutos de
// margen para quien no mueve (el cuadro no puede esperar 5), y un tope de rondas porque dos
// jugadores que acierten siempre no terminarían nunca.
const GQ_D_VIDAS_SALA        = 3;
const GQ_D_ABANDONO_SALA_SEG = 120;
const GQ_D_TOPE_RONDAS_SALA  = 15;
// Torneo de duelos (api/sala.php). Las salas se cierran solas tras 2 h sin actividad mientras
// esperan jugadores, y 10 minutos sin que nadie mueva ficha si ya están en juego.
const GQ_S_CADUCA_MIN        = 120;
const GQ_S_PARADA_MIN        = 10;
// Sin O/0/I/1: se leen en voz alta o se copian de un mensaje de WhatsApp, y esos
// cuatro son los que más se confunden entre sí.
const GQ_D_ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function gq_d_codigo(): string {
    $n = strlen(GQ_D_ALFABETO);
    $c = '';
    for ($i = 0; $i < 6; $i++) {
        $c .= GQ_D_ALFABETO[random_int(0, $n - 1)];
    }
    return $c;
}

function gq_d_hora_utc(string $dt): int {
    return (int) strtotime($dt . ' UTC');
}

// ── DUELO: CARGA ──────────────────────────────────────────────────────────
function gq_d_por_codigo(PDO $pdo, string $codigo): ?array {
    $f = gq_consulta($pdo, 'SELECT * FROM duelos WHERE codigo = ? LIMIT 1', [$codigo])->fetch();
    return $f === false ? null : $f;
}

// Si este duelo es un partido de un torneo, devuelve de qué sala y con cuántas vidas; si no, null.
// Es lo único que distingue a un partido de torneo de un duelo suelto, y va aparte para no tener
// que añadir columnas a `duelos` (ver el comentario de duelo_abiertos en db.php).
function gq_d_en_sala(PDO $pdo, string $codigo): ?array {
    static $memo = [];
    if (array_key_exists($codigo, $memo)) { return $memo[$codigo]; }
    $f = gq_consulta(
        $pdo,
        'SELECT p.sala_id, s.vidas FROM sala_partidos p JOIN salas s ON s.id = p.sala_id WHERE p.duelo_codigo = ? LIMIT 1',
        [$codigo]
    )->fetch();
    // Solo se recuerda el «sí»: un duelo que todavía no está en ninguna sala podría estarlo un
    // instante después, cuando la sala lo reclame.
    if ($f === false) { return null; }
    return $memo[$codigo] = ['sala_id' => (int) $f['sala_id'], 'vidas' => (int) $f['vidas']];
}

// Si el jugador en turno lleva más de GQ_D_ABANDONO_MIN sin mover (ni pedir
// pregunta ni responder), pierde por abandono. Se comprueba aquí y no en un cron:
// el sondeo del cliente (cada 2-3s mientras el duelo está abierto) ya pasa por aquí
// con la frecuencia que hace falta. En un partido de torneo el margen es de
// GQ_D_ABANDONO_SALA_SEG, y también lo comprueba el sondeo de la sala.
function gq_d_revisar_abandono(PDO $pdo, array $d): array {
    if ($d['estado'] !== 'jugando') { return $d; }
    if (gq_d_en_sala($pdo, (string) $d['codigo']) !== null) {
        if (time() - gq_d_hora_utc((string) $d['ultimo_movimiento_en']) < GQ_D_ABANDONO_SALA_SEG) { return $d; }
    } else {
        $pasados = (int) gq_consulta(
            $pdo, 'SELECT TIMESTAMPDIFF(MINUTE, ?, UTC_TIMESTAMP())', [$d['ultimo_movimiento_en']]
        )->fetchColumn();
        if ($pasados < GQ_D_ABANDONO_MIN) { return $d; }
    }
    $ganador = (int) $d['turno'] === 1 ? 2 : 1;
    gq_consulta(
        $pdo, 'UPDATE duelos SET estado = "terminado", ganador = ? WHERE id = ? AND estado = "jugando"',
        [$ganador, $d['id']]
    );
    $d['estado']  = 'terminado';
    $d['ganador'] = $ganador;
    return $d;
}
