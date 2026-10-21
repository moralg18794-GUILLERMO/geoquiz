<?php
// GeoQuiz — el mínimo para escribir aserciones sin instalar nada.
//
// No es PHPUnit ni quiere serlo: son tres funciones y un contador. Lo que se gana es que
// las pruebas se ejecutan con el mismo `php` que ya hay en el portátil y que el día que se
// toque este archivo se entienda entero de una lectura.
//
// Cada prueba termina llamando a gq_p_final(), que sale con código distinto de cero si algo
// ha fallado. Así tools/revisar.sh puede encadenarlas igual que version.sh.

declare(strict_types=1);

$GQ_P = ['ok' => 0, 'mal' => 0, 'avisos' => 0, 'titulo' => ''];

function gq_p_titulo(string $t): void {
    global $GQ_P;
    $GQ_P['titulo'] = $t;
    echo "\n── $t\n";
}

// El mensaje describe lo que DEBERÍA pasar, en presente y en español, porque es lo único
// que se lee cuando la prueba falla seis meses después.
function gq_p_es(string $que, $esperado, $obtenido): void {
    global $GQ_P;
    if ($esperado === $obtenido) {
        $GQ_P['ok']++;
        return;
    }
    $GQ_P['mal']++;
    echo "  FALLA: $que\n";
    echo "     esperado: " . gq_p_ver($esperado) . "\n";
    echo "     obtenido: " . gq_p_ver($obtenido) . "\n";
}

function gq_p_cierto(string $que, bool $cond): void {
    gq_p_es($que, true, $cond);
}

// Un aviso no rompe el despliegue: señala algo que conviene mirar pero que no es un error
// (por ejemplo, preguntas sin temática). Si se contara como fallo, el dueño aprendería a
// ignorar la salida entera, que es la forma más rápida de que unas pruebas dejen de servir.
function gq_p_aviso(string $texto): void {
    global $GQ_P;
    $GQ_P['avisos']++;
    echo "  aviso: $texto\n";
}

function gq_p_ver($v): string {
    if (is_bool($v)) { return $v ? 'true' : 'false'; }
    if (is_array($v)) { return json_encode($v, JSON_UNESCAPED_UNICODE); }
    return (string) $v;
}

function gq_p_final(): void {
    global $GQ_P;
    echo "\n";
    if ($GQ_P['mal'] > 0) {
        echo "FALLO · {$GQ_P['ok']} bien, {$GQ_P['mal']} mal";
    } else {
        echo "BIEN · {$GQ_P['ok']} comprobaciones";
    }
    if ($GQ_P['avisos'] > 0) { echo ", {$GQ_P['avisos']} aviso(s)"; }
    echo "\n";
    exit($GQ_P['mal'] > 0 ? 1 : 0);
}

// Leer un archivo del proyecto. Las pruebas viven en tools/pruebas/, así que la raíz está
// dos carpetas arriba; se resuelve aquí para que ninguna prueba dependa de desde dónde se
// la lance.
function gq_p_raiz(): string {
    // GQ_RAIZ existe para poder apuntar las pruebas a otra copia del proyecto (por ejemplo
    // una sacada de git para comparar). Sin ella, la raíz es la del repositorio.
    $env = getenv('GQ_RAIZ');
    return is_string($env) && $env !== '' ? rtrim($env, '/\\') : dirname(__DIR__, 2);
}

function gq_p_leer(string $rel): string {
    $ruta = gq_p_raiz() . '/' . $rel;
    $t = @file_get_contents($ruta);
    if ($t === false) {
        echo "  FALLA: no encuentro $rel\n";
        global $GQ_P; $GQ_P['mal']++;
        gq_p_final();
    }
    return $t;
}
