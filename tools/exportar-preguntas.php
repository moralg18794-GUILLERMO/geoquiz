<?php
// GeoQuiz — exporta js/data/questions.js (JS) a api/preguntas.json (JSON).
//
// api/duelo.php necesita elegir preguntas y conocer la respuesta correcta en el
// servidor (nunca se fía del navegador, igual que el torneo), pero el banco de 521
// preguntas solo existe como literal JavaScript para el cliente. En vez de mantener
// una segunda copia a mano -que un día se olvida actualizar y el duelo se queda jugando
// con preguntas viejas sin que nadie lo note-, este script la regenera siempre desde
// el mismo origen. tools/version.sh lo llama en cada despliegue.
//
//   php tools/exportar-preguntas.php
//
// Depende de la convención que el propio banco declara en su cabecera: una pregunta,
// una línea, sin objetos anidados. Si esa convención cambiara, hay que revisar esto.
declare(strict_types=1);

$origen  = __DIR__ . '/../js/data/questions.js';
$destino = __DIR__ . '/../api/preguntas.json';

$txt = file_get_contents($origen);
if ($txt === false) {
    fwrite(STDERR, "No se pudo leer $origen\n");
    exit(1);
}

// Solo estas claves se convierten a JSON ("clave": en vez de clave:), y solo cuando
// van pegadas a un { o una , que abre campo. Así no hay riesgo de tocar un texto de
// pregunta que por casualidad contuviera alguna de estas palabras seguida de ":".
$claves = ['cat', 'diff', 'pts', 'q', 'opts', 'ans', 'hint', 'exp', 't'];
$patron = '/([{,])(' . implode('|', $claves) . '):/';

$preguntas = [];
foreach (explode("\n", $txt) as $n => $linea) {
    $linea = trim($linea);
    if ($linea === '' || $linea[0] !== '{') {
        continue;   // comentarios, "const ALL_Q=[" y el "];" final
    }
    $linea = rtrim($linea, ',');
    $json = preg_replace($patron, '$1"$2":', $linea);
    $obj = json_decode($json, true);
    if (!is_array($obj) || !isset($obj['cat'], $obj['q'], $obj['opts'], $obj['ans'])) {
        fwrite(STDERR, 'Línea ' . ($n + 1) . ' no se pudo convertir: ' . json_last_error_msg() . "\n");
        exit(1);
    }
    $preguntas[] = $obj;
}

if (!$preguntas) {
    fwrite(STDERR, "No se extrajo ninguna pregunta de $origen\n");
    exit(1);
}

$ok = file_put_contents(
    $destino,
    json_encode($preguntas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);
if ($ok === false) {
    fwrite(STDERR, "No se pudo escribir $destino\n");
    exit(1);
}

fwrite(STDERR, count($preguntas) . " preguntas exportadas a api/preguntas.json\n");
