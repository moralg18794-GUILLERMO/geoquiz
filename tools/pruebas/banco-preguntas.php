<?php
// GeoQuiz — comprobaciones estructurales del banco de preguntas.
//
// Por qué esta prueba: js/data/questions.js son 521 preguntas escritas a mano y crece a
// mano. Los fallos que mete esa clase de edición no revientan el juego, lo degradan en
// silencio: una pregunta con 3 opciones en vez de 4 descoloca la rejilla, un `ans` apuntando
// fuera deja una pregunta sin respuesta correcta, dos enunciados iguales salen dos veces en
// la misma partida, una categoría mal escrita se queda sin color de cabecera y una temática
// inventada hace la pregunta inalcanzable. Nada de eso se ve salvo que te toque esa pregunta
// justo esa partida, y con 521 preguntas eso puede tardar meses.
//
// Lo que NO hace esta prueba: decir si la respuesta marcada es la verdadera. Eso no lo sabe
// una máquina, lo sabe quien escribió la pregunta. Aquí solo se comprueba la forma.

declare(strict_types=1);
require __DIR__ . '/afirmar.php';

gq_p_titulo('Estructura del banco js/data/questions.js');

// ── Leer el banco ─────────────────────────────────────────────────────────
// questions.js no es JSON: las claves van sin comillas, porque es un objeto de JavaScript.
// Se convierte a JSON poniéndole comillas a las claves, y para eso hay que ir carácter a
// carácter sabiendo si estamos dentro de una cadena o no: hay enunciados y explicaciones con
// dos puntos dentro ("victoria perfecta: Aníbal rodeó..."), y un reemplazo a lo bruto los
// partiría por la mitad.
function gq_p_js_a_json(string $linea): string {
    $salida = '';
    $enCadena = false;
    $n = strlen($linea);
    for ($i = 0; $i < $n; $i++) {
        $c = $linea[$i];
        if ($enCadena) {
            $salida .= $c;
            if ($c === '\\' && $i + 1 < $n) { $salida .= $linea[++$i]; continue; }
            if ($c === '"') { $enCadena = false; }
            continue;
        }
        if ($c === '"') { $enCadena = true; $salida .= $c; continue; }
        // Fuera de cadena: un identificador seguido de ':' es una clave y hay que entrecomillarla.
        if (preg_match('/[A-Za-z_$]/', $c) === 1) {
            $j = $i;
            while ($j < $n && preg_match('/[A-Za-z0-9_$]/', $linea[$j]) === 1) { $j++; }
            $ident = substr($linea, $i, $j - $i);
            $k = $j;
            while ($k < $n && ($linea[$k] === ' ' || $linea[$k] === "\t")) { $k++; }
            if ($k < $n && $linea[$k] === ':') {
                $salida .= '"' . $ident . '"';
            } else {
                $salida .= $ident;   // true, false, null...
            }
            $i = $j - 1;
            continue;
        }
        $salida .= $c;
    }
    return $salida;
}

$fuente = gq_p_leer('js/data/questions.js');
$preguntas = [];
$lineasMalas = [];
foreach (explode("\n", $fuente) as $nLinea => $linea) {
    $t = trim($linea);
    if ($t === '' || $t[0] !== '{') { continue; }        // comentarios, 'const ALL_Q=[', '];'
    $t = rtrim($t, ',');
    $obj = json_decode(gq_p_js_a_json($t), true);
    if (!is_array($obj)) { $lineasMalas[] = $nLinea + 1; continue; }
    $obj['_linea'] = $nLinea + 1;
    $preguntas[] = $obj;
}

gq_p_es('todas las líneas de pregunta se entienden', [], $lineasMalas);
// Fijado a mano: si el número baja, se ha borrado algo sin querer. Si sube, se actualiza
// aquí a propósito, que es la ocasión de mirar la salida del resto de la prueba.
gq_p_es('el banco tiene 521 preguntas', 521, count($preguntas));

// ── Las listas buenas salen de js/theme.js, no de aquí ────────────────────
// Copiar las categorías en esta prueba sería crear una tercera lista que mantener. Se leen
// de donde el juego las lee, así que una categoría nueva en questions.js sin su color en
// theme.js sale como fallo, que es justo el síntoma: cabecera sin etiqueta ni degradado.
$temaJs = gq_p_leer('js/theme.js');

$bloque = static function (string $src, string $nombre): string {
    $i = strpos($src, $nombre);
    if ($i === false) { return ''; }
    $fin = strpos($src, "\n};", $i);
    return $fin === false ? '' : substr($src, $i, $fin - $i);
};

$catsOk = [];
if (preg_match_all('/"([^"]+)"\s*:\s*\{/', $bloque($temaJs, 'const CAT_STYLES='), $m)) {
    $catsOk = $m[1];
}
$temasOk = [];
if (preg_match_all('/^\s*([a-z]{3})\s*:\s*\{/m', $bloque($temaJs, 'const THEMES='), $m)) {
    $temasOk = $m[1];
}
$geosOk = [];
if (preg_match_all('/^\s*([a-z]{2})\s*:\s*\{/m', $bloque($temaJs, 'const GEOS='), $m)) {
    $geosOk = $m[1];
}
gq_p_es('theme.js declara 9 categorías (épocas)', 9, count($catsOk));
gq_p_es('theme.js declara 9 temáticas', 9, count($temasOk));
gq_p_es('theme.js declara 6 continentes', 6, count($geosOk));

// El ranking de portada solo acepta como oficial una partida con TODAS las épocas, y el
// servidor lo decide con su propio número (GQ_EPOCAS_MIN en api/ranking.php) porque el
// recuento lo manda el navegador y no se puede fiar de él. Si las dos cifras se separan,
// el fallo es mudo y de los peores: el cliente manda ntot=9, el servidor exige otra cosa
// y ninguna partida vuelve a entrar en el ranking global, sin un solo error por ningún
// lado. Pasó justo al separar las categorías en tres ejes, cuando las épocas bajaron de
// 13 a 9 y este número se quedó en 13.
$epocasMin = null;
if (preg_match('/const GQ_EPOCAS_MIN = (\d+);/', gq_p_leer('api/ranking.php'), $m)) {
    $epocasMin = (int) $m[1];
}
gq_p_es('GQ_EPOCAS_MIN (api/ranking.php) es el número de épocas de theme.js', count($catsOk), $epocasMin);

// El servidor tiene su propia lista cerrada de temáticas (GQ_TEMAS en api/db.php) porque el
// código llega del navegador y acaba en la tabla que ven todos. Si las dos listas se separan,
// el fallo es mudo y de los malos: las partidas de la temática que falte en el servidor se
// rechazan en silencio y caen en la lista de "otras partidas", y nadie entiende por qué esa
// temática no tiene ranking. Aquí se comparan las dos.
$temasServidor = [];
if (preg_match("/const GQ_TEMAS = \[(.*?)\];/s", gq_p_leer('api/db.php'), $m)
    && preg_match_all("/'([a-z]{3})'/", $m[1], $m2)) {
    $temasServidor = $m2[1];
}
sort($temasServidor);
$temasOrdenados = $temasOk;
sort($temasOrdenados);
gq_p_es('GQ_TEMAS (api/db.php) dice lo mismo que THEMES (js/theme.js)', $temasOrdenados, $temasServidor);

// ── Recorrer pregunta a pregunta ──────────────────────────────────────────
const GQ_P_PTS_POR_DIFF = ['facil' => 100, 'medio' => 200, 'dificil' => 300];

$malOpts = []; $malAns = []; $optsRepes = []; $malCat = []; $malDiff = [];
$malPts = []; $malTema = []; $sinExp = []; $sinTema = [];
$malGeo = [];
$vistos = []; $duplicadas = [];
$porCat = []; $porTema = []; $porGeo = [];

foreach ($preguntas as $p) {
    $ln = $p['_linea'];
    $q = (string) ($p['q'] ?? '');

    // 4 opciones exactas: la rejilla del juego pinta cuatro botones y `ans` es un índice
    // de 0 a 3. Con tres opciones el cuarto botón sale vacío.
    $opts = $p['opts'] ?? null;
    if (!is_array($opts) || count($opts) !== 4) {
        $malOpts[] = $ln;
    } else {
        // Opciones repetidas dentro de una pregunta: la respuesta deja de ser única y el
        // jugador que acierta "la otra igual" la ve marcada como fallo.
        $fold = array_map(static fn($s) => strtolower(trim((string) $s)), $opts);
        if (count(array_unique($fold)) !== 4) { $optsRepes[] = $ln; }
    }

    $ans = $p['ans'] ?? null;
    if (!is_int($ans) || $ans < 0 || $ans > 3) { $malAns[] = $ln; }

    $diff = (string) ($p['diff'] ?? '');
    if (!isset(GQ_P_PTS_POR_DIFF[$diff])) {
        $malDiff[] = $ln;
    } elseif (($p['pts'] ?? null) !== GQ_P_PTS_POR_DIFF[$diff]) {
        // pts y diff tienen que concordar. Si no, la misma pregunta vale una cosa en el modo
        // solo (que usa pts tal cual) y otra en un torneo (que deriva pts de diff).
        $malPts[] = $ln;
    }

    $cat = (string) ($p['cat'] ?? '');
    if (!in_array($cat, $catsOk, true)) { $malCat[] = "$ln ($cat)"; }
    $porCat[$cat] = ($porCat[$cat] ?? 0) + 1;

    $t = $p['t'] ?? null;
    if (!is_array($t)) {
        $malTema[] = "$ln (sin campo t)";
    } elseif ($t === []) {
        $sinTema[] = $ln;
    } else {
        foreach ($t as $cod) {
            if (!in_array($cod, $temasOk, true)) { $malTema[] = "$ln ($cod)"; }
            else { $porTema[$cod] = ($porTema[$cod] ?? 0) + 1; }
        }
    }

    // El continente es obligatorio, al contrario que la temática: una pregunta sin `g` no
    // sale NUNCA jugando por geografía, y el eje entero depende de que estén las 521.
    $g = $p['g'] ?? null;
    if (!is_array($g) || $g === []) {
        $malGeo[] = "$ln (sin campo g)";
    } else {
        foreach ($g as $cod) {
            if (!in_array($cod, $geosOk, true)) { $malGeo[] = "$ln ($cod)"; }
            else { $porGeo[$cod] = ($porGeo[$cod] ?? 0) + 1; }
        }
    }

    if (trim((string) ($p['exp'] ?? '')) === '') { $sinExp[] = $ln; }

    // Enunciados duplicados entre preguntas: en una partida pueden salir las dos y parece
    // un fallo del juego. Se comparan sin tildes ni mayúsculas... hasta donde se puede sin
    // mbstring: se normalizan los espacios y se bajan las ASCII, igual que hace gq_minus()
    // en el servidor. No coge "Qué" vs "QUÉ", y está bien: coge el copia y pega, que es el
    // caso real.
    $clave = strtolower(preg_replace('/\s+/u', ' ', trim($q)) ?? $q);
    if (isset($vistos[$clave])) {
        $duplicadas[] = "líneas {$vistos[$clave]} y $ln";
    } else {
        $vistos[$clave] = $ln;
    }
}

gq_p_es('todas las preguntas tienen 4 opciones', [], $malOpts);
gq_p_es('ningún enunciado está repetido', [], $duplicadas);
gq_p_es('ninguna pregunta repite opciones', [], $optsRepes);
gq_p_es('todas las preguntas tienen ans entre 0 y 3', [], $malAns);
gq_p_es('todas las dificultades son facil/medio/dificil', [], $malDiff);
gq_p_es('los puntos concuerdan con la dificultad (100/200/300)', [], $malPts);
gq_p_es('todas las categorías existen en theme.js', [], $malCat);
gq_p_es('todas las temáticas existen en theme.js', [], $malTema);
gq_p_es('todas las preguntas tienen continente y existe en theme.js', [], $malGeo);

// ── Avisos: no rompen el despliegue, pero conviene verlos ─────────────────
// Las preguntas con t:[] son inalcanzables en el modo Temáticas. Eran 74 —el 14% del banco—
// hasta que se etiquetaron el 19/11/2026; quedan 4 que no encajan en ninguna de las nueve
// temáticas: dos de religión (la Contrarreforma y el cisma de 1054) y dos pandemias (la Peste
// Negra y la gripe de 1918). Esperan a que exista una temática que las acoja. El número está
// fijado para que no crezca sin que nadie se dé cuenta: si se añaden preguntas nuevas sin
// temática, esta prueba falla y hay que etiquetarlas o actualizar el número aquí.
gq_p_es('siguen siendo 4 las preguntas sin temática (inalcanzables en modo Temáticas)', 4, count($sinTema));
if ($sinTema !== []) {
    gq_p_aviso(count($sinTema) . ' preguntas con t:[] no salen nunca en el modo Temáticas. '
        . 'Primeras líneas: ' . implode(', ', array_slice($sinTema, 0, 12)) . '...');
}
if ($sinExp !== []) {
    gq_p_aviso(count($sinExp) . ' preguntas sin explicación (el jugador acierta y no aprende nada): líneas '
        . implode(', ', array_slice($sinExp, 0, 10)));
}

// Una categoría o temática con muy pocas preguntas da partidas repetitivas a quien la elija
// sola. 10 es el tamaño de una partida corta.
foreach ($porCat as $c => $n) {
    if ($n < 10) { gq_p_aviso("la categoría «$c» solo tiene $n preguntas: jugada en solitario se repite"); }
}
foreach ($temasOk as $c) {
    $n = $porTema[$c] ?? 0;
    if ($n < 10) { gq_p_aviso("la temática «$c» solo tiene $n preguntas: jugada en solitario se repite"); }
}

echo "  reparto por categoría: " . json_encode($porCat, JSON_UNESCAPED_UNICODE) . "\n";
echo "  reparto por temática:  " . json_encode($porTema, JSON_UNESCAPED_UNICODE) . "\n";
echo "  reparto por continente: " . json_encode($porGeo, JSON_UNESCAPED_UNICODE) . "\n";

gq_p_final();
