<?php
declare(strict_types=1);

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ÍNDICE DE index.php  — router puro (261 L)                                 ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  BOOTSTRAP                                                      L.22–239    ║
// ║    Verificar config.php                                          L.22        ║
// ║    require_once conexion.php + require_login()                   L.40        ║
// ║    Carpetas de escritura + includes src/                         L.44        ║
// ║    CLI static, base path, cabeceras CORS                         L.64        ║
// ║    jsonOk, jsonErr, jsonPy, bodyJson                             L.88        ║
// ║    gd(), getLz(), _lzInfoEntre()                                L.117        ║
// ║    seleccionarTds(), filtrarMeses(), nomAlimDeNumalim()         L.204        ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  ROUTER                                                        L.240–264    ║
// ║    GET /  → sirve templates/index.html con shim base-path       L.252       ║
// ║    /api/* → require api/feeders … api/vcc.php                   L.278       ║
// ║    404 fallback                                                  L.287       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ── Verificar config.php ──────────────────────────────────────────────────────
if (!file_exists(__DIR__ . '/config.php')) {
    header('Content-Type: text/html; charset=utf-8');
    http_response_code(503);
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Configuración pendiente</title>'
       . '<style>body{font-family:sans-serif;max-width:600px;margin:80px auto;padding:0 20px}'
       . 'pre{background:#f4f4f4;padding:12px;border-radius:4px;font-size:.9em}'
       . '.warn{background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;border-radius:4px}</style></head>'
       . '<body><h2>&#9888; Aplicación no configurada</h2>'
       . '<p class="warn">No se encontró el archivo <strong>config.php</strong> con las credenciales de base de datos.</p>'
       . '<h3>Pasos para configurar:</h3><ol>'
       . '<li>Copie <code>config.example.php</code> → <code>config.php</code></li>'
       . '<li>Edite <code>config.php</code> y complete host, usuario y contraseña de cada conexión MySQL</li>'
       . '<li>Recargue esta página</li>'
       . '</ol></body></html>';
    exit;
}

// ── Conexión y helpers de autenticación ──────────────────────────────────────
require_once __DIR__ . '/conexion.php';
require_login(); // stub hoy; activa al migrar al sistema central

// ── Crear carpetas de escritura si no existen ─────────────────────────────────
foreach ([
    __DIR__ . '/data/cache',
    __DIR__ . '/feeders_nuevos',
    __DIR__ . '/vcc_evaluaciones',
] as $_dir) {
    if (!is_dir($_dir)) mkdir($_dir, 0755, true);
}

// ── Includes src/ ─────────────────────────────────────────────────────────────
require_once __DIR__ . '/src/Datos.php';
require_once __DIR__ . '/src/Simulacion.php';
require_once __DIR__ . '/src/Matching.php';
require_once __DIR__ . '/src/Memoria.php';
require_once __DIR__ . '/src/Ajustes.php';
require_once __DIR__ . '/src/EquiposConfig.php';
require_once __DIR__ . '/src/AlimentadoresConfig.php';
require_once __DIR__ . '/src/Vcc.php';
require_once __DIR__ . '/src/Reportes.php';

// ── Servidor embebido: archivos estáticos se sirven directamente ──────────────
if (PHP_SAPI === 'cli-server') {
    $static = __DIR__ . parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (is_file($static)) return false;
}

// ── Base path (subfolder en servidor de producción) ───────────────────────────
// En CLI server con router, SCRIPT_NAME = URI de la request (no el path del router),
// por lo que no sirve para calcular el basePath → siempre ''.
// En IIS/Apache: SCRIPT_NAME=/AMEyAO/graficos_traspasos/index.php → basePath='/AMEyAO/graficos_traspasos'
if (PHP_SAPI === 'cli-server') {
    $_basePath = '';
} else {
    $_basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');
    if ($_basePath === '.') $_basePath = '';
}

// ── Cabeceras globales ────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204); exit;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function jsonOk(mixed $data): never {
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function jsonErr(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Retorna JSON plano (formato Python): sin wrapper {ok,data}. */
function jsonPy(mixed $data): never {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function bodyJson(): array {
    $raw = (string)file_get_contents('php://input');
    if ($raw === '') return [];
    try {
        return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?? [];
    } catch (\JsonException $e) {
        jsonErr('JSON inválido en el body: ' . $e->getMessage());
    }
}

// Carga lazy de datos globales. Se reutiliza en el request.
$_G = null;
function gd(): array {
    global $_G;
    if ($_G === null) {
        [$dfAlim, $dfTrafo] = cargarDemandas();
        $dfAb = cargarAguasAbajo();
        $_G = ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo, 'dfAb' => $dfAb];
    }
    return $_G;
}

// Carga lazy de límite de zona (tabla separada, solo para endpoints LZ).
$_LZ = null;
function getLz(): array {
    global $_LZ;
    if ($_LZ === null) $_LZ = cargarLimiteZona();
    return $_LZ;
}

/**
 * Devuelve info LZ entre dos alimentadores (perspectiva del receptor = numalim_b).
 * Equivalente a _lz_info_entre() de Python.
 */
function _lzInfoEntre(?int $numalimA, ?int $numalimB): array {
    if ($numalimA === null || $numalimB === null)
        return ['tiene_lz' => null, 'dispositivos' => []];

    $dfLz  = getLz();
    $filas = array_values(array_filter(
        $dfLz,
        fn($r) => $r['numalim'] === $numalimA && in_array($numalimB, $r['vecinos'], true)
    ));
    if (!$filas) return ['tiene_lz' => false, 'dispositivos' => []];

    // Mapa numalim → nom_alim para el campo tercero (solo se construye si hay 3 ramas)
    $numalimMap = null;

    $dispositivos = [];
    foreach ($filas as $row) {
        $d = [
            'numpos_lz'            => $row['numpos_lz'],
            'tipo'                 => $row['tipo'],
            'excepcion'            => (bool)$row['excepcion'],
            'equipos_troncal_orig' => (array)$row['equipos_troncal'],
        ];

        // Campo "tercero" para subterraneo_3ramas
        if ($row['tipo'] === 'subterraneo_3ramas') {
            $terceros = array_values(array_filter($row['vecinos'], fn($v) => $v !== $numalimB));
            if ($terceros) {
                $t = $terceros[0];
                if ($numalimMap === null) {
                    $numalimMap = [];
                    foreach (gd()['dfAb'] as $abRow) {
                        $nm = $abRow['numalim'] ?? null;
                        if ($nm !== null && !isset($numalimMap[(int)$nm])) {
                            $numalimMap[(int)$nm] = $abRow['nom_alim'] ?? '';
                        }
                    }
                }
                $d['tercero'] = [
                    'numalim' => $t,
                    'nombre'  => $numalimMap[$t] ?? (string)$t,
                ];
            }
        }

        // Viabilidad desde perspectiva del receptor (numalimB)
        $bRows = array_values(array_filter(
            $dfLz,
            fn($r) => $r['numalim'] === $numalimB && $r['numpos_lz'] === $row['numpos_lz']
        ));
        if ($bRows) {
            $br = $bRows[0];
            $d['viable']          = (bool)$br['viable'];
            $d['n_troncal']       = (int)$br['n_troncal'];
            $d['equipos_troncal'] = (array)$br['equipos_troncal'];
        } else {
            $d['viable']          = true;
            $d['n_troncal']       = 0;
            $d['equipos_troncal'] = [];
        }
        $dispositivos[] = $d;
    }
    return ['tiene_lz' => (bool)$dispositivos, 'dispositivos' => $dispositivos];
}

// Selecciona TDs según modo del body (acepta Python y PHP field names).
function seleccionarTds(array $dfAb, string $nomAlim, array $b): array {
    $modo = $b['modo'] ?? null;
    if (!$modo) {
        $tipoIsla = $b['tipo_isla'] ?? 'equipo';
        $modo = ($tipoIsla === 'tds') ? 'manual' : $tipoIsla;
    }
    $listaNumpos = $b['lista_numpos'] ?? $b['tds_numpos'] ?? [];
    $tds = match($modo) {
        'equipo' => tdsDeEquipo($dfAb, $b['equipo_nombre'] ?? null, $b['equipo_numpos'] ?? null),
        'manual' => tdsSeleccionados($dfAb, $listaNumpos),
        default  => tdsDeFeeder($dfAb, $nomAlim),
    };
    // Excluir TDs explicitamente (Python: tds_excluidos)
    if (!empty($b['tds_excluidos'])) {
        $exc = $b['tds_excluidos'];
        $tds = array_values(array_filter($tds, fn($t) => !in_array($t['numpos_td'] ?? '', $exc, true)));
    }
    return $tds;
}

// Filtra tabla mensual por lista de meses (array vacío = sin filtro).
function filtrarMeses(array $tabla, array $mesesSel): array {
    if (empty($mesesSel)) return $tabla;
    return array_values(array_filter($tabla, fn($r) => in_array($r['mes'] ?? '', $mesesSel, true)));
}

/** Busca nom_alim en dfAb a partir de un numalim numérico. */
function nomAlimDeNumalim(array $dfAb, int $numalim): ?string {
    foreach ($dfAb as $row) {
        if (($row['numalim'] ?? null) === $numalim && isset($row['nom_alim'])) {
            return (string)$row['nom_alim'];
        }
    }
    return null;
}

// ── Router ────────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// Obtener URI y eliminar el prefijo del subfolder si corresponde
$_rawUri = rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/') ?: '/';
$uri     = ($_basePath !== '' && str_starts_with($_rawUri, $_basePath))
    ? (substr($_rawUri, strlen($_basePath)) ?: '/')
    : $_rawUri;
$segs   = array_values(array_filter(explode('/', $uri)));
$s      = $segs;

try {

// ── Raíz: sirve el frontend ────────────────────────────────────────────────────
if ($uri === '/') {
    $htmlFile = __DIR__ . '/templates/index.html';
    if (is_file($htmlFile)) {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        // Inyectar shim que prepende el base path a todas las llamadas /api/*
        // Así el mismo HTML funciona en localhost Y en /AMEyAO/subcarpeta/
        $bJson = json_encode($_basePath, JSON_UNESCAPED_UNICODE);
        $shim  = "<script>(function(){var b={$bJson},f=window.fetch.bind(window);" .
                 "window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/api/'))u=b+u;return f(u,o);};}());</script>";
        $html  = (string) file_get_contents($htmlFile);
        echo str_replace('</head>', $shim . '</head>', $html);
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
    echo "graficos_traspasos PHP 1.0 — API activa.\n";
    exit;
}

if (($s[0] ?? '') !== 'api') jsonErr('Ruta no encontrada', 404);

// Segmentos sin el prefijo 'api'
[$a, $b0, $b1, $b2] = array_pad(array_slice($s, 1), 4, '');

// ── Módulos de endpoints ───────────────────────────────────────────────────────
require __DIR__ . '/api/feeders.php';
require __DIR__ . '/api/traspaso.php';
require __DIR__ . '/api/feeders_nuevos.php';
require __DIR__ . '/api/ajustes.php';
require __DIR__ . '/api/config_equip.php';
require __DIR__ . '/api/config_alim.php';
require __DIR__ . '/api/vcc.php';

// ── 404 ────────────────────────────────────────────────────────────────────────
jsonErr('Endpoint no encontrado: ' . $method . ' ' . $uri, 404);

} catch (RuntimeException $e) {
    jsonErr($e->getMessage(), 422);
} catch (\JsonException $e) {
    jsonErr('Error serializando respuesta: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    jsonErr($e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine(), 500);
}
