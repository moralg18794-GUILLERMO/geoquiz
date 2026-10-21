<?php
// GeoQuiz — que el baremo de puntos sea EL MISMO en el navegador y en el servidor.
//
// Por qué esta prueba y no otra: la fórmula está escrita dos veces, en js/game.js (modo
// solo) y en api/torneo.php (torneo). Si alguien ajusta el bonus en una y se olvida de la
// otra, nada se rompe: el juego sigue funcionando, los dos siguen dando números creíbles y
// simplemente dejan de ser el mismo juego. Nadie lo nota hasta que alguien compara su
// partida de solo con su puesto en el torneo y no le cuadra. Eso es exactamente lo que una
// prueba automática tiene que coger y un humano no.
//
// Cómo lo comprueba: no copia la fórmula aquí (si la copiara, al cambiarla habría tres
// sitios que mantener en vez de dos). Lee las dos expresiones DEL CÓDIGO REAL, las traduce
// a un dialecto común y las evalúa sobre una tabla de casos. Si las dos dan lo mismo en los
// 100 casos, son la misma fórmula; si divergen, la prueba dice en qué caso y con qué
// números. La tabla incluye además unos cuantos valores fijados a mano, para que cambiar el
// baremo a propósito obligue a re-bendecirlos y no se cuele de tapadillo.

declare(strict_types=1);
require __DIR__ . '/afirmar.php';

gq_p_titulo('Paridad del baremo de puntos entre js/game.js y api/torneo.php');

$js    = gq_p_leer('js/game.js');
$state = gq_p_leer('js/state.js');
$php   = gq_p_leer('api/torneo.php');

// ── 1. El multiplicador por racha ─────────────────────────────────────────
// De las dos implementaciones se saca la lista ordenada de (umbral => multiplicador) y el
// valor por defecto. Se comparan las listas, no el texto: así da igual que una use llaves
// y la otra no, y sigue cogiendo un 6 cambiado por un 5.
function gq_p_escalones(string $fuente, string $nombreFuncion): array {
    // Recortar al cuerpo de la función contando llaves, para no pescar returns de otro
    // sitio del archivo. Hace falta contar y no buscar un "\n}" porque getMultiplier() cabe
    // en una sola línea y gq_t_multiplicador() no.
    $i = strpos($fuente, $nombreFuncion);
    if ($i === false) { return ['escalones' => [], 'defecto' => null]; }
    $abre = strpos($fuente, '{', $i);
    if ($abre === false) { return ['escalones' => [], 'defecto' => null]; }
    $nivel = 0; $cierra = null;
    for ($k = $abre, $n = strlen($fuente); $k < $n; $k++) {
        if ($fuente[$k] === '{') { $nivel++; }
        elseif ($fuente[$k] === '}') { $nivel--; if ($nivel === 0) { $cierra = $k; break; } }
    }
    if ($cierra === null) { return ['escalones' => [], 'defecto' => null]; }
    $trozo = substr($fuente, $abre + 1, $cierra - $abre - 1);
    $trozo = str_replace('$', '', $trozo);

    $escalones = [];
    if (preg_match_all('/>=\s*(\d+)\s*\)?\s*\{?\s*return\s+(\d+)/', $trozo, $m, PREG_SET_ORDER)) {
        foreach ($m as $g) { $escalones[] = [(int) $g[1], (int) $g[2]]; }
    }
    // El último return sin condición es el multiplicador cuando no hay racha.
    $pordefecto = null;
    if (preg_match('/return\s+(\d+)\s*;\s*$/', rtrim($trozo), $m2)) {
        $pordefecto = (int) $m2[1];
    }
    return ['escalones' => $escalones, 'defecto' => $pordefecto];
}

$mJs  = gq_p_escalones($state, 'function getMultiplier');
$mPhp = gq_p_escalones($php, 'function gq_t_multiplicador');

gq_p_es('el navegador declara escalones de racha', true, !empty($mJs['escalones']));
gq_p_es('el servidor declara escalones de racha', true, !empty($mPhp['escalones']));
gq_p_es('los escalones de racha son los mismos en los dos', $mJs['escalones'], $mPhp['escalones']);
gq_p_es('el multiplicador sin racha es el mismo en los dos', $mJs['defecto'], $mPhp['defecto']);
// Fijados a mano: el día que se quiera un x4, hay que venir aquí a decirlo.
gq_p_es('los escalones son los acordados (x2 a la 3.ª, x3 a la 6.ª)', [[6, 3], [3, 2]], $mPhp['escalones']);
gq_p_es('sin racha se multiplica por 1', 1, $mPhp['defecto']);

// ── 2. Las expresiones de bonus y de puntos ───────────────────────────────
// Se traducen las dos a PHP evaluable sobre tres variables comunes: QUEDAN (segundos que
// sobran, 0..20), PTS (100/200/300) y MULT. Después se evalúan. Traducir y evaluar es más
// fiable que comparar textos: las dos escriben lo mismo de formas distintas y lo que
// importa es el número, no la grafía.
function gq_p_normalizar(string $expr): string {
    $r = [
        'Math.floor' => 'floor', 'Math.max' => 'max', 'Math.min' => 'min',
        '(int)' => '', '(float)' => '',
        'GQ_T_SEGUNDOS_PREGUNTA' => '20',
        "p['pts']" => 'PTS', 'q.pts' => 'PTS',
        'timeLeft' => 'QUEDAN', 'quedan' => 'QUEDAN',
        'multAplicado' => 'MULT', 'mult' => 'MULT',
        'bonus' => 'BONUS',
    ];
    $e = str_replace(array_keys($r), array_values($r), $expr);
    $e = str_replace('$', '', $e);                 // fuera los sigilos de PHP
    $e = preg_replace('/\s+/', '', $e) ?? $e;      // fuera el espaciado, que no significa nada
    $e = rtrim($e, ';');
    // Devolver las variables como variables de PHP para poder evaluar.
    return preg_replace('/\b(QUEDAN|PTS|MULT|BONUS)\b/', '\$$1', $e) ?? $e;
}

// Saca el lado derecho de la asignación a una variable dada, en la primera aparición.
function gq_p_lado_derecho(string $fuente, string $patron): string {
    if (preg_match($patron, $fuente, $m) !== 1) { return ''; }
    return trim($m[1]);
}

$bonusJs = gq_p_lado_derecho($js,  '/const\s+bonus\s*=\s*(.+?);/');
$ptsJs   = gq_p_lado_derecho($js,  '/const\s+pts\s*=\s*(.+?);/');
$bonusPhp = gq_p_lado_derecho($php, '/\$bonus\s*=\s*(.+?);/');
$ptsPhp   = gq_p_lado_derecho($php, '/\$pts\s*=\s*\(\(int\)(.+?);/');
if ($ptsPhp !== '') { $ptsPhp = '((int)' . $ptsPhp; }   // devolver el paréntesis recortado

gq_p_cierto('se encuentra el bonus en js/game.js', $bonusJs !== '');
gq_p_cierto('se encuentra el total en js/game.js', $ptsJs !== '');
gq_p_cierto('se encuentra el bonus en api/torneo.php', $bonusPhp !== '');
gq_p_cierto('se encuentra el total en api/torneo.php', $ptsPhp !== '');

$bonusJsN  = gq_p_normalizar($bonusJs);
$ptsJsN    = gq_p_normalizar($ptsJs);
$bonusPhpN = gq_p_normalizar($bonusPhp);
$ptsPhpN   = gq_p_normalizar($ptsPhp);

echo "  bonus (navegador): $bonusJsN\n";
echo "  bonus (servidor):  $bonusPhpN\n";
echo "  total (navegador): $ptsJsN\n";
echo "  total (servidor):  $ptsPhpN\n";

// eval() sobre expresiones sacadas de archivos del propio repositorio. No hay entrada de
// usuario por medio: esto se ejecuta en el portátil, sobre el código que uno acaba de
// escribir. Es el precio de no tener que copiar la fórmula una tercera vez.
function gq_p_calcular(string $exprBonus, string $exprTotal, int $QUEDAN, int $PTS, int $MULT): int {
    $BONUS = 0;
    $BONUS = (int) eval("return $exprBonus;");
    return (int) eval("return $exprTotal;");
}

// ── 3. La tabla de casos ──────────────────────────────────────────────────
$divergencias = 0;
$casos = 0;
foreach ([100, 200, 300] as $PTS) {
    foreach (range(0, 20) as $QUEDAN) {
        foreach ([1, 2, 3] as $MULT) {
            $casos++;
            $a = gq_p_calcular($bonusJsN, $ptsJsN, $QUEDAN, $PTS, $MULT);
            $b = gq_p_calcular($bonusPhpN, $ptsPhpN, $QUEDAN, $PTS, $MULT);
            if ($a !== $b) {
                $divergencias++;
                if ($divergencias <= 5) {
                    echo "  DIVERGEN con pts=$PTS, quedan=$QUEDAN, mult=x$MULT: navegador=$a, servidor=$b\n";
                }
            }
        }
    }
}
gq_p_es("las dos fórmulas coinciden en los $casos casos de la tabla", 0, $divergencias);

// ── 4. Valores fijados a mano ─────────────────────────────────────────────
// Esto es el baremo acordado, en números. Si mañana se cambia el 0.3 por un 0.4, la prueba
// anterior seguiría pasando (las dos fórmulas cambiarían juntas) y esta no: obliga a
// decidirlo a propósito en vez de descubrirlo en el ranking.
$esperados = [
    // [quedan, pts, mult, total]
    [20, 100, 1, 130],   // acierto instantáneo en una fácil: 30% de bonus
    [20, 300, 1, 390],   // lo mismo en una difícil
    [20, 300, 3, 1170],  // con racha de 6: el techo por pregunta
    [10, 200, 1, 230],   // a mitad de tiempo: 15% de bonus (floor de 30)
    [0,  200, 1, 200],   // contestar al límite: sin bonus, pero el acierto cuenta entero
    [0,  100, 2, 200],   // sin bonus, con racha de 3
    [7,  300, 1, 331],   // el caso de coma flotante: 7/20*300*0.3 = 31,49... -> 31
    [1,  100, 1, 101],   // un segundo de sobra en una fácil: 1 punto de bonus
];
foreach ($esperados as [$QUEDAN, $PTS, $MULT, $total]) {
    gq_p_es(
        "con pts=$PTS, quedan={$QUEDAN}s y mult=x$MULT el servidor da $total",
        $total,
        gq_p_calcular($bonusPhpN, $ptsPhpN, $QUEDAN, $PTS, $MULT)
    );
}

// ── 5. Los puntos por dificultad ──────────────────────────────────────────
// Los 100/200/300 están en tres sitios: el banco de preguntas (campo pts), el validador de
// torneos (que los deriva de diff) y la tabla de arriba. Aquí se comprueba el validador,
// que es el que puede desalinearse sin que se vea.
$admin = gq_p_leer('api/torneo-admin.php');
gq_p_cierto(
    "el validador de torneos deriva los puntos como 100/200/300",
    preg_match("/'facil'\s*=>\s*100\s*,\s*'medio'\s*=>\s*200\s*,\s*'dificil'\s*=>\s*300/", $admin) === 1
);

gq_p_final();
