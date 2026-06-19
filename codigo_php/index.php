<?php
declare(strict_types=1);

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

// ── Crear carpetas de escritura si no existen ─────────────────────────────────
foreach ([
    __DIR__ . '/data/cache',
    __DIR__ . '/feeders_nuevos',
    __DIR__ . '/vcc_evaluaciones',
] as $_dir) {
    if (!is_dir($_dir)) mkdir($_dir, 0755, true);
}

require_once __DIR__ . '/src/Datos.php';
require_once __DIR__ . '/src/Simulacion.php';
require_once __DIR__ . '/src/Matching.php';
require_once __DIR__ . '/src/Memoria.php';
require_once __DIR__ . '/src/Ajustes.php';
require_once __DIR__ . '/src/Vcc.php';
require_once __DIR__ . '/src/Reportes.php';

// ── Servidor embebido: archivos estáticos se sirven directamente ──────────────
if (PHP_SAPI === 'cli-server') {
    $static = __DIR__ . parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (is_file($static)) return false;
}

// ── Base path (subfolder en servidor de producción) ───────────────────────────
// Detecta automáticamente el directorio donde está index.php dentro del servidor.
// En CLI: SCRIPT_NAME=/index.php  → basePath=''
// En IIS: SCRIPT_NAME=/AMEyAO/graficos_traspasos/index.php → basePath='/AMEyAO/graficos_traspasos'
$_basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');
if ($_basePath === '.') $_basePath = '';

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

// ══════════════════════════════════════════════════════════════════════════════
// COMPATIBILIDAD PYTHON — endpoints que usa el frontend
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/feeders ── todos los alimentadores desde dfAlim (Python compat) ──
// Retorna: [{numalim, nombre, cn, nom_alim, subestacion, cn_trafo, barra_trafo}]
if ($method === 'GET' && $a === 'feeders' && !$b0) {
    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo, 'dfAb' => $dfAb] = gd();
    // Mapa inverso numalim → nom_alim desde dfAb
    $nomAlimMap = [];
    foreach ($dfAb as $row) {
        $nm = $row['numalim'] ?? null;
        if ($nm !== null && !isset($nomAlimMap[(int)$nm])) {
            $nomAlimMap[(int)$nm] = $row['nom_alim'] ?? null;
        }
    }
    $result = [];
    foreach ($dfAlim as $numalim => $row) {
        $trafoRow   = $dfTrafo[$numalim] ?? null;
        $cnTrafo    = ($trafoRow && isset($trafoRow['cn']) && is_numeric($trafoRow['cn'])) ? (float)$trafoRow['cn'] : null;
        $barraTrafo = $trafoRow ? (trim((string)($trafoRow['barra'] ?? '')) ?: null) : null;
        $sub        = trim((string)($row['subestacion'] ?? ''));
        $result[] = [
            'numalim'    => (int)$numalim,
            'nombre'     => nombreDisplayAlim($row),
            'cn'         => (isset($row['cn']) && is_numeric($row['cn'])) ? (float)$row['cn'] : null,
            'nom_alim'   => $nomAlimMap[(int)$numalim] ?? null,
            'subestacion'=> $sub === '' ? null : $sub,
            'cn_trafo'   => $cnTrafo,
            'barra_trafo'=> $barraTrafo,
        ];
    }
    usort($result, fn($a, $b) => strcmp((string)($a['nombre'] ?? ''), (string)($b['nombre'] ?? '')));
    jsonPy($result);
}

// ── GET /api/meses ─────────────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'meses' && !$b0) {
    ['dfAlim' => $dfAlim] = gd();
    jsonPy(mesesDisponibles($dfAlim));
}

// ── GET /api/feeder/{nom}/tds?equipo=X ─────────────────────────────────────────
// Retorna: [{numpos, nombre, kva, clientes}] ordenado por kva desc
if ($method === 'GET' && $a === 'feeder' && $b0 && $b1 === 'tds' && !$b2) {
    $nomAlim = urldecode($b0);
    $equipo  = $_GET['equipo'] ?? '';
    ['dfAb' => $dfAb] = gd();
    $tds = $equipo
        ? tdsDeEquipo($dfAb, $equipo, null)
        : tdsDeFeeder($dfAb, $nomAlim);
    $result = [];
    foreach ($tds as $row) {
        $result[] = [
            'numpos'   => (string)($row['numpos_td'] ?? ''),
            'nombre'   => (string)($row['nombre'] ?? $row['numpos_td'] ?? ''),
            'kva'      => (isset($row['potencia']) && is_numeric($row['potencia'])) ? (float)$row['potencia'] : 0.0,
            'clientes' => (int)($row['clientes'] ?? 0),
        ];
    }
    usort($result, fn($a, $b) => ($b['kva'] ?? 0) <=> ($a['kva'] ?? 0));
    jsonPy($result);
}

// ── GET /api/feeder/{nom}/equipos ──────────────────────────────────────────────
// Retorna: [{nombre, numpos, n_tds, kva, kva_feeder, pct_feeder}]
if ($method === 'GET' && $a === 'feeder' && $b0 && $b1 === 'equipos' && !$b2) {
    $nomAlim = urldecode($b0);
    ['dfAb' => $dfAb] = gd();
    $equipos = equiposDeFeeder($dfAb, $nomAlim);
    // KVA total del feeder
    $allTds    = tdsDeFeeder($dfAb, $nomAlim);
    $kvaFeeder = 0.0;
    foreach ($allTds as $td) { $kvaFeeder += (float)($td['potencia'] ?? 0); }
    $kvaFeeder = round($kvaFeeder, 0);
    $result = [];
    foreach ($equipos as $row) {
        $nombre = (string)($row['nombre_equip'] ?? '');
        $tdsEq  = tdsDeEquipo($dfAb, $nombre, null);
        $kvaEq  = 0.0;
        foreach ($tdsEq as $td) { $kvaEq += (float)($td['potencia'] ?? 0); }
        $kvaEq = round($kvaEq, 0);
        $result[] = [
            'nombre'     => $nombre,
            'numpos'     => (string)($row['numpos_equip'] ?? ''),
            'n_tds'      => count($tdsEq),
            'kva'        => $kvaEq,
            'kva_feeder' => $kvaFeeder,
            'pct_feeder' => $kvaFeeder > 0 ? round($kvaEq / $kvaFeeder * 100, 1) : 0.0,
        ];
    }
    usort($result, fn($a, $b) => ($b['pct_feeder'] ?? 0) <=> ($a['pct_feeder'] ?? 0));
    jsonPy($result);
}

// ── POST /api/isla/preview ─────────────────────────────────────────────────────
// Body: {nom_alim_orig, tipo_isla?, equipo_nombre?, tds_numpos?}
// Retorna Python flat: {n_td, kva_isla, kva_feeder, p_pct, clientes, detalle_tds}
if ($method === 'POST' && $a === 'isla' && $b0 === 'preview' && !$b1) {
    $b       = bodyJson();
    $nomAlim = $b['nom_alim_orig'] ?? $b['nom_alim_origen'] ?? '';
    if (!$nomAlim) jsonErr('nom_alim_orig requerido');
    ['dfAb' => $dfAb] = gd();
    $tds = seleccionarTds($dfAb, $nomAlim, $b);
    if (empty($tds)) jsonErr('Sin TDs para el modo/equipo indicado');
    $previewIsla  = infoIsla($tds, $nomAlim, $dfAb);
    $_eqAbreP     = $b['equipo_nombre'] ?? '';
    $eqsTrsp      = ($_eqAbreP !== '' && ($b['tipo_isla'] ?? 'equipo') === 'equipo')
        ? equiposEnIsla($dfAb, $tds, $_eqAbreP, $nomAlim)
        : [];
    $previewOut   = $previewIsla;
    unset($previewOut['detalle_tds']);
    $previewOut['equipos_traspasados'] = $eqsTrsp;
    $previewOut['detalle_tds']         = $previewIsla['detalle_tds'] ?? [];
    jsonPy($previewOut);
}

// ── GET /api/destinos/existentes ───────────────────────────────────────────────
// Retorna: [{numalim, nombre, cn}]
if ($method === 'GET' && $a === 'destinos' && $b0 === 'existentes' && !$b1) {
    ['dfAlim' => $dfAlim] = gd();
    $result = [];
    foreach ($dfAlim as $numalim => $row) {
        $result[] = [
            'numalim' => (int)$numalim,
            'nombre'  => nombreDisplayAlim($row),
            'cn'      => (isset($row['cn']) && is_numeric($row['cn'])) ? (float)$row['cn'] : null,
        ];
    }
    usort($result, fn($a, $b) => strcmp((string)($a['nombre'] ?? ''), (string)($b['nombre'] ?? '')));
    jsonPy($result);
}

// ── GET /api/destinos/nuevos ───────────────────────────────────────────────────
// Retorna feeders en comisionamiento con {nombre, cn, acumulado, uso_pct, n_transf}
if ($method === 'GET' && $a === 'destinos' && $b0 === 'nuevos' && !$b1) {
    $feeders = listarFeeders();
    $result  = [];
    foreach ($feeders as $nombre) {
        try {
            $d    = cargarFeeder($nombre);
            $acum = deltaAcumulado($nombre);
            $cn   = (float)($d['cn'] ?? 0);
            $result[] = [
                'nombre'   => $nombre,
                'cn'       => $cn,
                'acumulado'=> round($acum, 2),
                'uso_pct'  => $cn > 0 ? round($acum / $cn * 100, 1) : null,
                'n_transf' => count($d['transferencias'] ?? []),
            ];
        } catch (Throwable) {}
    }
    jsonPy($result);
}

// ── GET /api/subestaciones ─────────────────────────────────────────────────────
// Retorna lista de trafos: [{numalim, nombre, cn, subestacion}]
if ($method === 'GET' && $a === 'subestaciones' && !$b0) {
    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo] = gd();
    $result = [];
    $seen   = [];
    foreach ($dfTrafo as $numalim => $row) {
        $barra = trim((string)($row['barra'] ?? ''));
        if ($barra === '' || isset($seen[$barra])) continue;
        $seen[$barra] = true;
        $cn      = (isset($row['cn']) && is_numeric($row['cn'])) ? (float)$row['cn'] : null;
        $alimRow = $dfAlim[$numalim] ?? null;
        $sub     = $alimRow ? trim((string)($alimRow['subestacion'] ?? '')) : '';
        $result[] = [
            'numalim'    => (int)$numalim,
            'nombre'     => $barra,
            'cn'         => $cn,
            'subestacion'=> $sub === '' ? null : $sub,
        ];
    }
    usort($result, fn($a, $b) =>
        strcmp(($a['subestacion'] ?? '') . ($a['nombre'] ?? ''), ($b['subestacion'] ?? '') . ($b['nombre'] ?? ''))
    );
    jsonPy($result);
}

// ── POST /api/guardar_transferencia ────────────────────────────────────────────
// Guarda resultado de simulación en un feeder en comisionamiento.
// Body Python: {feeder_nombre, origen, delta_A, kva_isla, kva_origen, p_pct, n_td, ...}
if ($method === 'POST' && $a === 'guardar_transferencia' && !$b0) {
    $b = bodyJson();
    $feederNombre = $b['feeder_nombre'] ?? '';
    if (!$feederNombre) jsonErr('feeder_nombre requerido');
    agregarTransferencia(
        $feederNombre,
        $b['origen']      ?? '',
        (float)($b['delta_A']    ?? 0),
        (float)($b['kva_isla']   ?? 0),
        (float)($b['kva_origen'] ?? 0),
        (float)($b['p_pct']      ?? 0),
        (int)($b['n_td']         ?? 0),
        isset($b['clientes'])        ? (int)$b['clientes']         : null,
        $b['descripcion']            ?? '',
        $b['tabla']                  ?? null,
        $b['tabla_mam']              ?? null,
        isset($b['cn_orig'])         ? (float)$b['cn_orig']        : null,
        isset($b['cn_dest'])         ? (float)$b['cn_dest']        : null,
        $b['nombre_dest']            ?? null,
        $b['resumen']                ?? null,
        $b['trafo_orig']             ?? null,
        $b['trafo_dest']             ?? null,
        $b['trafo_orig_mam']         ?? null,
        $b['trafo_dest_mam']         ?? null,
        $b['meses_sel']              ?? null,
        $b['detalle_tds']            ?? null,
        $b['equipo_abre']            ?? '',
        $b['equipo_cierra']          ?? '',
        $b['escenario']              ?? 'normal',
        isset($b['n_td_equipo_total']) ? (int)$b['n_td_equipo_total'] : null,
        $b['cambio_topologico']      ?? '',
        $b['equipos_traspasados']    ?? null,
    );
    jsonPy(['ok' => true]);
}

// ── POST /api/descargar_html ────────────────────────────────────────────────────
// Genera el reporte HTML de un traspaso y lo retorna como descarga.
if ($method === 'POST' && $a === 'descargar_html' && !$b0) {
    $b   = bodyJson();

    // ── Multi-caso (cadena de corrimiento) ─────────────────────────────────
    $casosRaw = $b['casos'] ?? null;
    if ($casosRaw && count($casosRaw) > 1) {
        $slug = 'corrimiento_' . date('Ymd_His');
        $ruta = tempnam(sys_get_temp_dir(), 'rpt');
        generarReporteCadenaHtml($casosRaw, $ruta);
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $slug . '.html"');
        readfile($ruta);
        unlink($ruta);
        exit;
    }

    $slug = slugFeeder($b['nombre_orig'] ?? 'rep') . '_' . slugFeeder($b['nombre_dest'] ?? '') . '_' . date('Ymd_His');
    $ruta = tempnam(sys_get_temp_dir(), 'rpt');

    // Construir ajustesInfo (tabla de ajustes de demanda para el reporte, igual que Python)
    $_ajActivos = $b['ajustes_activos'] ?? [];
    $_seriesRaw = [
        'alim_orig'  => $b['serie_raw_orig']      ?? [],
        'alim_dest'  => $b['serie_raw_dest']       ?? [],
        'trafo_orig' => $b['serie_raw_trafo_orig'] ?? [],
        'trafo_dest' => $b['serie_raw_trafo_dest'] ?? [],
    ];
    $_tOrigBarra = trim((string)(($b['trafo_orig'] ?? [])['barra'] ?? ''));
    $_tDestBarra = trim((string)(($b['trafo_dest'] ?? [])['barra'] ?? ''));
    $_labels = [
        'alim_orig'  => 'Alim. Origen ('  . ($b['nombre_orig'] ?? '') . ')',
        'alim_dest'  => 'Alim. Destino (' . ($b['nombre_dest'] ?? '') . ')',
        'trafo_orig' => $_tOrigBarra ? "Trafo Origen ($_tOrigBarra)" : 'Trafo Origen',
        'trafo_dest' => $_tDestBarra ? "Trafo Destino ($_tDestBarra)" : 'Trafo Destino',
    ];
    $_ajustesInfo = [];
    foreach ($_ajActivos as $_key => $_aj) {
        if (empty($_aj)) continue;
        $_raw = $_seriesRaw[$_key] ?? [];
        ksort($_aj);
        $_mesesAj = [];
        foreach ($_aj as $_mes => $_val) {
            $_mesesAj[] = ['mes' => $_mes, 'valor_sql' => $_raw[$_mes] ?? null, 'valor_ajustado' => $_val];
        }
        $_ajustesInfo[] = ['label' => $_labels[$_key] ?? $_key, 'meses' => $_mesesAj];
    }

    generarReporteHtml(
        $b['tabla']       ?? [],
        $b['isla']        ?? [],
        $b['nombre_orig'] ?? '',
        $b['nombre_dest'] ?? '',
        (float)($b['cn_orig']    ?? 0),
        (float)($b['cn_dest']    ?? 0),
        (float)($b['delta_max']  ?? 0),
        $b['resumen']     ?? [],
        $ruta,
        $b['descripcion'] ?? '',
        null,
        $b['trafo_orig']  ?? null,
        $b['trafo_dest']  ?? null,
        $b['detalle_tds'] ?? [],
        $b['equipo_abre'] ?? '',
        $b['escenario']   ?? 'normal',
        $b['equipo_cierra']   ?? '',
        isset($b['n_td_equipo_total']) ? (int)$b['n_td_equipo_total'] : null,
        $b['tabla_mam']          ?? null,
        $b['trafo_orig_mam']     ?? null,
        $b['trafo_dest_mam']     ?? null,
        $b['cambio_topologico']  ?? '',
        $b['equipos_traspasados'] ?? null,
        $_ajustesInfo ?: null,
        $b['lz_info'] ?? null,
    );
    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $slug . '.html"');
    readfile($ruta);
    unlink($ruta);
    exit;
}

// ══════════════════════════════════════════════════════════════════════════════
// PHP ORIGINAL — recarga de caché, equipos, isla
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/reload ───────────────────────────────────────────────────────────
if ($method === 'POST' && $a === 'reload' && !$b0) {
    global $_G, $_LZ;
    cargarAguasAbajo(true);
    cargarDemandas(true);
    cargarLimiteZona(true);
    $_G = null; $_LZ = null;
    jsonOk(['message' => 'Caché recargado']);
}

// ── GET /api/equipos?nom_alim=XXX ──────────────────────────────────────────────
if ($method === 'GET' && $a === 'equipos' && !$b0) {
    $nomAlim = $_GET['nom_alim'] ?? '';
    if (!$nomAlim) jsonErr('Parámetro nom_alim requerido');
    ['dfAb' => $dfAb] = gd();
    jsonOk(equiposDeFeeder($dfAb, $nomAlim));
}

// ── POST /api/isla ─────────────────────────────────────────────────────────────
if ($method === 'POST' && $a === 'isla' && !$b0) {
    $b       = bodyJson();
    $nomAlim = $b['nom_alim_origen'] ?? $b['nom_alim_orig'] ?? '';
    if (!$nomAlim) jsonErr('nom_alim_origen requerido');
    ['dfAb' => $dfAb] = gd();
    $tds = seleccionarTds($dfAb, $nomAlim, $b);
    if (empty($tds)) jsonErr('Sin TDs para el modo/equipo indicado');
    jsonOk(infoIsla($tds, $nomAlim, $dfAb));
}

// ── POST /api/simular ──────────────────────────────────────────────────────────
// Acepta body Python (numalim_orig/dest, tipo_isla, tds_numpos)
// y retorna respuesta Python plana (delta, tabla, nombre_orig, feeder_nuevo, etc.)
if ($method === 'POST' && $a === 'simular' && !$b0) {
    $b = bodyJson();

    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo, 'dfAb' => $dfAb] = gd();

    // Resolver origen
    $nomOrig = $b['nom_alim_orig'] ?? $b['nom_alim_origen'] ?? '';
    if (!$nomOrig && !empty($b['numalim_orig'])) {
        $nomOrig = nomAlimDeNumalim($dfAb, (int)$b['numalim_orig']) ?? '';
    }
    if (!$nomOrig) jsonErr('nom_alim_orig / numalim_orig requerido');

    // Resolver destino según tipo_dest
    $tipoDest    = $b['tipo_dest'] ?? 'excel';
    $feederNuevo = null;
    $nomDest     = '';
    $nDest       = null;

    if ($tipoDest === 'excel') {
        $nomDest = $b['nom_alim_destino'] ?? $b['nom_alim_dest'] ?? '';
        if (!$nomDest && !empty($b['numalim_dest'])) {
            $nomDest = nomAlimDeNumalim($dfAb, (int)$b['numalim_dest']) ?? '';
        }
        if (!$nomDest) jsonErr('numalim_dest / nom_alim_destino requerido');
    } else {
        // nuevo o nuevo_crear
        $feederNuevo = strtoupper(trim($b['feeder_nuevo_nombre'] ?? ''));
        if (!$feederNuevo) jsonErr('feeder_nuevo_nombre requerido para tipo_dest=nuevo');
        if ($tipoDest === 'nuevo_crear') {
            try { cargarFeeder($feederNuevo); }
            catch (RuntimeException) {
                crearFeeder(
                    $feederNuevo,
                    (float)($b['feeder_nuevo_cn'] ?? 400.0),
                    !empty($b['feeder_nuevo_numalim_trafo']) ? (int)$b['feeder_nuevo_numalim_trafo'] : null
                );
            }
        }
        $nomDest = $feederNuevo;
    }

    $tds = seleccionarTds($dfAb, $nomOrig, $b);
    if (empty($tds)) jsonErr('Sin TDs para la selección indicada');

    $equipoAbre = $b['equipo_nombre'] ?? $b['equipo_abre'] ?? '';
    $equiposTrasp = ($equipoAbre !== '')
        ? equiposEnIsla($dfAb, $tds, $equipoAbre, $nomOrig)
        : [];

    $isla  = infoIsla($tds, $nomOrig, $dfAb);
    $nOrig = numalimDeNomAlim($dfAb, $nomOrig);
    if (!$nOrig) jsonErr("Alimentador origen '$nomOrig' no encontrado en aguas_abajo");

    $serieOrigRaw   = obtenerSerieAlim($dfAlim, $nOrig);
    $serieOrigClean = aplicarAjustes($serieOrigRaw['serie'], 'alim', $nOrig);
    $cnOrig         = $serieOrigRaw['cn'];

    // P2: delta acumulado de casos anteriores en cadena de corrimientos.
    // Se aplica SOLO al display (serieOrig); el delta transferido se calcula
    // siempre desde la BD limpia (serieOrigClean) para no sobreestimar la carga
    // de la isla con corriente de casos anteriores que no pertenece a ese tramo.
    $deltaAcumOrig = $b['delta_acum_orig'] ?? [];
    $serieOrig     = $serieOrigClean;
    if ($deltaAcumOrig) {
        foreach ($deltaAcumOrig as $_m => $_d) {
            if (array_key_exists($_m, $serieOrig)) {
                $serieOrig[$_m] = round((float)$serieOrig[$_m] - (float)$_d, 2);
            }
        }
    }

    // Series y CN del destino
    if ($tipoDest === 'excel') {
        $nDest = numalimDeNomAlim($dfAb, $nomDest);
        if (!$nDest) jsonErr("Alimentador destino '$nomDest' no encontrado en aguas_abajo");
        $serieDestRaw = obtenerSerieAlim($dfAlim, $nDest);
        $serieDest    = aplicarAjustes($serieDestRaw['serie'], 'alim', $nDest);
        $cnDest       = $serieDestRaw['cn'];
    } else {
        $feederData   = cargarFeeder($feederNuevo);
        $cnDest       = (float)$feederData['cn'];
        $mesesAll     = mesesDisponibles($dfAlim);
        $serieDest    = serieAcumulada($feederNuevo, $mesesAll);
        $serieDestRaw = ['serie' => $serieDest, 'cn' => $cnDest];
    }

    $mesesSel  = $b['meses_sel'] ?? [];
    // Delta siempre desde la serie limpia de BD: la isla solo lleva la carga propia del feeder,
    // no la corriente de casos anteriores que llegó al feeder pero no a este tramo específico.
    // Filtrar por meses seleccionados para que mes_peor y delta_max correspondan al periodo estudiado.
    $serieCleanSel = $mesesSel
        ? array_intersect_key($serieOrigClean, array_flip($mesesSel))
        : $serieOrigClean;
    $deltaInfo = calcularDelta($serieCleanSel, (float)($isla['p'] ?? 0.0));
    $deltaMax  = $deltaInfo['delta_max'];
    $isla['mes_peor'] = $deltaInfo['mes_peor'] ?? '';

    // simular(): deltaMax limpio + serieOrig ajustada → I_orig_antes muestra carga real de B
    $dfSim    = filtrarMeses(simular($serieOrig, $serieDest, $cnOrig, $cnDest, $deltaMax), $mesesSel);
    // simularMesAMes(): display desde ajustada, delta calculado desde limpia
    $dfSimMam = filtrarMeses(simularMesAMes($serieOrig, $serieDest, $cnOrig, $cnDest, (float)($isla['p'] ?? 0.0), 0.90, $serieOrigClean), $mesesSel);
    $resumen  = resumenEstados($dfSim);

    $trafoOrigRowRaw = trafoDeFeeder($dfTrafo, $nOrig);
    $trafoOrigRow    = $trafoOrigRowRaw ? aplicarAjustesFila($trafoOrigRowRaw, 'trafo', $nOrig) : null;
    // P2: propagar delta acumulado al trafo origen (solo si caso anterior NO era misma barra)
    $deltaAcumOrigMismaBarra = (bool)($b['delta_acum_orig_misma_barra'] ?? false);
    if ($trafoOrigRow && $deltaAcumOrig && !$deltaAcumOrigMismaBarra) {
        foreach ($deltaAcumOrig as $_m => $_d) {
            if (array_key_exists($_m, $trafoOrigRow) && preg_match('/^\d{4}-\d{2}$/', $_m)) {
                $trafoOrigRow[$_m] = round((float)$trafoOrigRow[$_m] - (float)$_d, 2);
            }
        }
    }
    $trafoOrig       = $trafoOrigRow ? analizarTrafo($trafoOrigRow, $deltaMax, 'alivio', 0.90, $mesesSel) : null;
    $trafoOrigMam    = $trafoOrigRow ? analizarTrafoMesAMes($trafoOrigRow, $deltaInfo['serie_deltas'], 'alivio', 0.90, $mesesSel) : null;

    if ($tipoDest === 'excel') {
        $trafoDestRowRaw = trafoDeFeeder($dfTrafo, $nDest);
        $trafoDestRow    = $trafoDestRowRaw ? aplicarAjustesFila($trafoDestRowRaw, 'trafo', $nDest) : null;
        $trafoDest       = $trafoDestRow ? analizarTrafo($trafoDestRow, $deltaMax, 'carga', 0.90, $mesesSel) : null;
        $trafoDestMam    = $trafoDestRow ? analizarTrafoMesAMes($trafoDestRow, $deltaInfo['serie_deltas'], 'carga', 0.90, $mesesSel) : null;
        $numalimTrafoOrig = $trafoOrigRow ? ($nOrig ?? null) : null;
        $numalimTrafoDest = $trafoDestRow ? ($nDest ?? null) : null;
    } else {
        $numalimTN       = $feederData['numalim_trafo'] ?? null;
        $trafoDestRowRaw = $numalimTN ? trafoDeFeeder($dfTrafo, (int)$numalimTN) : null;
        $acumActual      = deltaAcumulado($feederNuevo);
        if ($trafoDestRowRaw) {
            $trafoDestRow = aplicarAjustesFila($trafoDestRowRaw, 'trafo', (int)$numalimTN);
            $trafoDest    = analizarTrafo($trafoDestRow, $acumActual + $deltaMax, 'carga', 0.90, $mesesSel);
            $trafoDestMam = analizarTrafoMesAMes($trafoDestRow, $deltaInfo['serie_deltas'], 'carga', 0.90, $mesesSel);
        } else {
            $trafoDestRow = null;
            $trafoDest = $trafoDestMam = null;
        }
        $numalimTrafoOrig = $trafoOrigRow ? $nOrig : null;
        $numalimTrafoDest = $numalimTN ?? null;
    }

    // Misma barra: si ambos feeders cuelgan del mismo trafo, el impacto en SE es nulo.
    // Python: anula solo trafoDest y marca trafoOrig con mismo_trafo_destino=true.
    $mismaBarra = false;
    if (!empty($trafoOrigRowRaw) && !empty($trafoDestRowRaw)) {
        $_barraO = trim((string)($trafoOrigRowRaw['barra'] ?? ''));
        $_barraD = trim((string)($trafoDestRowRaw['barra'] ?? ''));
        $mismaBarra = $_barraO !== '' && $_barraO === $_barraD;
    }
    if ($mismaBarra) {
        if ($trafoOrig)    $trafoOrig['mismo_trafo_destino']    = true;
        if ($trafoOrigMam) $trafoOrigMam['mismo_trafo_destino'] = true;
        $trafoDest = $trafoDestMam = null;
    }

    // P1: propagar barra y subestacion a los objetos trafo para labels en reportes
    $_subOrig = trim((string)($dfAlim[$nOrig]['subestacion'] ?? ''));
    if ($trafoOrig)    { $trafoOrig['barra']    = trim((string)($trafoOrigRowRaw['barra'] ?? '')); $trafoOrig['subestacion']    = $_subOrig; }
    if ($trafoOrigMam) { $trafoOrigMam['barra'] = trim((string)($trafoOrigRowRaw['barra'] ?? '')); $trafoOrigMam['subestacion'] = $_subOrig; }
    $_subDest = ($tipoDest === 'excel' && $nDest) ? trim((string)($dfAlim[$nDest]['subestacion'] ?? '')) : '';
    if ($trafoDest)    { $trafoDest['barra']    = trim((string)(($trafoDestRowRaw ?? [])['barra'] ?? '')); $trafoDest['subestacion']    = $_subDest; }
    if ($trafoDestMam) { $trafoDestMam['barra'] = trim((string)(($trafoDestRowRaw ?? [])['barra'] ?? '')); $trafoDestMam['subestacion'] = $_subDest; }

    // LZ info entre origen y destino
    $lzInfo = _lzInfoEntre($nOrig, $nDest ?? null);
    $numposLzSel = $b['numpos_lz_sel'] ?? null;
    if ($numposLzSel && $lzInfo['tiene_lz']) {
        foreach ($lzInfo['dispositivos'] as &$_d) {
            $_d['seleccionado'] = ($_d['numpos_lz'] === $numposLzSel);
        }
        unset($_d);
    }
    $lzInfo['numpos_lz_sel'] = $numposLzSel;

    // Construir isla limpia: excluir detalle_tds (va top-level), agregar n_td_equipo_total
    $islaOut = $isla;
    unset($islaOut['detalle_tds']);
    if ($equipoAbre !== '') {
        $tdsTotalesEquipo = tdsDeEquipo($dfAb, $equipoAbre);
        $islaOut['n_td_equipo_total'] = count($tdsTotalesEquipo);
    }

    // Respuesta en formato Python plano
    jsonPy([
        'ok'                  => true,
        'lz_info'             => $lzInfo,
        'equipos_traspasados' => $equiposTrasp,
        'nombre_orig'         => $nomOrig,
        'nombre_dest'         => $nomDest,
        'cn_orig'             => is_nan($cnOrig) ? null : $cnOrig,
        'cn_dest'             => is_nan($cnDest) ? null : $cnDest,
        'isla'                => $islaOut,
        'detalle_tds'         => $isla['detalle_tds'] ?? [],
        'delta'               => [
            'delta_max'    => $deltaMax,
            'mes_peor'     => $deltaInfo['mes_peor'] ?? '',
            'serie_deltas' => $deltaInfo['serie_deltas'] ?? [],
        ],
        'resumen'             => $resumen,
        'tabla'               => $dfSim,
        'feeder_nuevo'        => $feederNuevo,
        'trafo_orig'          => $trafoOrig,
        'trafo_dest'          => $trafoDest,
        'misma_barra_se'      => $mismaBarra,
        'meses_sel'           => $mesesSel,
        'tabla_mam'           => $dfSimMam,
        'trafo_orig_mam'      => $trafoOrigMam,
        'trafo_dest_mam'      => $trafoDestMam,
        'numalim_orig'        => $b['numalim_orig'] ?? $nOrig,
        'numalim_dest'        => $b['numalim_dest'] ?? $nDest,
        'numalim_trafo_orig'  => $numalimTrafoOrig,
        'numalim_trafo_dest'  => $numalimTrafoDest,
        'ajustes_activos'     => [
            'alim_orig'  => $nOrig              ? getAjustes('alim',  $nOrig)                : [],
            'alim_dest'  => $nDest              ? getAjustes('alim',  $nDest)                : [],
            'trafo_orig' => $numalimTrafoOrig   ? getAjustes('trafo', $numalimTrafoOrig)     : [],
            'trafo_dest' => $numalimTrafoDest   ? getAjustes('trafo', $numalimTrafoDest)     : [],
        ],
        'serie_raw_orig'      => $serieOrigRaw['serie'] ?? [],
        'serie_raw_dest'      => $serieDestRaw['serie'] ?? [],
        'serie_raw_trafo_orig'=> serieRawDeFila($trafoOrigRowRaw ?? null),
        'serie_raw_trafo_dest'=> serieRawDeFila($trafoDestRowRaw ?? null),
    ]);
}

// ── GET /api/vecinos_lz/{numalim} ─────────────────────────────────────────────
// Dispositivos LZ del alimentador con vecinos, viabilidad y equipos troncales.
if ($method === 'GET' && $a === 'vecinos_lz' && $b0 && !$b1) {
    $numalim = (int)$b0;
    $dfLz    = getLz();
    // Mapa numalim → nom_alim para enriquecer vecinos
    ['dfAb' => $dfAb] = gd();
    $numalimMap = [];
    foreach ($dfAb as $row) {
        $nm = $row['numalim'] ?? null;
        if ($nm !== null && !isset($numalimMap[(int)$nm])) $numalimMap[(int)$nm] = $row['nom_alim'] ?? '';
    }

    $filas     = array_values(array_filter($dfLz, fn($r) => $r['numalim'] === $numalim));
    $resultado = [];
    foreach ($filas as $row) {
        $vecinos = [];
        foreach ($row['vecinos'] as $v) {
            $vRows = array_values(array_filter(
                $dfLz,
                fn($r) => $r['numalim'] === $v && $r['numpos_lz'] === $row['numpos_lz']
            ));
            if ($vRows) {
                $vr = $vRows[0];
                $vecinos[] = [
                    'numalim'         => $v,
                    'nom_alim'        => $numalimMap[$v] ?? (string)$v,
                    'viable'          => (bool)$vr['viable'],
                    'n_troncal'       => (int)$vr['n_troncal'],
                    'equipos_troncal' => (array)$vr['equipos_troncal'],
                ];
            } else {
                $vecinos[] = [
                    'numalim'         => $v,
                    'nom_alim'        => $numalimMap[$v] ?? (string)$v,
                    'viable'          => true,
                    'n_troncal'       => 0,
                    'equipos_troncal' => [],
                ];
            }
        }
        $resultado[] = [
            'numpos_lz'            => $row['numpos_lz'],
            'tipo'                 => $row['tipo'],
            'excepcion'            => (bool)$row['excepcion'],
            'equipos_troncal_orig' => $row['equipos_troncal'],
            'vecinos'              => $vecinos,
        ];
    }
    jsonPy($resultado);
}

// ── GET /api/corrimiento_candidatos/{numalim} ──────────────────────────────────
// Retorna alimentadores vecinos (vía LZ) con capacidad disponible para recibir
// un corrimiento de carga desde {numalim}. Ordenados por remanente_A desc.
if ($method === 'GET' && $a === 'corrimiento_candidatos' && $b0 && !$b1) {
    $numalim = (int)$b0;
    $dfLz    = getLz();
    if (!$dfLz) { jsonPy([]); }

    ['dfAlim' => $dfAlim] = gd();

    // Recopilar vecinos del alimentador dado
    $vecinosSet = [];
    foreach ($dfLz as $row) {
        if ($row['numalim'] !== $numalim) continue;
        foreach ($row['vecinos'] as $v) {
            $vecinosSet[(int)$v] = true;
        }
    }

    $meses     = mesesDisponibles($dfAlim);
    $resultado = [];

    foreach (array_keys($vecinosSet) as $nm) {
        $row = $dfAlim[$nm] ?? null;
        if ($row === null) continue;

        $cn = isset($row['cn']) ? (float)$row['cn'] : NAN;
        if (!is_finite($cn) || $cn <= 0) continue;

        // dem_max sobre meses disponibles
        $demMax = NAN;
        foreach ($meses as $mes) {
            $v = isset($row[$mes]) && $row[$mes] !== '' ? (float)$row[$mes] : NAN;
            if (is_finite($v) && (!is_finite($demMax) || $v > $demMax)) $demMax = $v;
        }

        $remanenteA   = is_finite($demMax) ? $cn - $demMax : NAN;
        $remanentesPct = is_finite($remanenteA) ? $remanenteA / $cn * 100 : NAN;

        // Vecinos propios del candidato (excluyendo el origen)
        $vecinosPropios = [];
        foreach ($dfLz as $fila) {
            if ($fila['numalim'] !== $nm) continue;
            foreach ($fila['vecinos'] as $vp) {
                if ((int)$vp !== $numalim) $vecinosPropios[(int)$vp] = true;
            }
        }

        $resultado[] = [
            'numalim'          => $nm,
            'nombre'           => nombreDisplayAlim($row),
            'cn'               => is_finite($cn)          ? round($cn, 3)           : null,
            'dem_max'          => is_finite($demMax)       ? round($demMax, 3)       : null,
            'remanente_A'      => is_finite($remanenteA)   ? round($remanenteA, 3)   : null,
            'remanente_pct'    => is_finite($remanentesPct)? round($remanentesPct, 2): null,
            'tiene_vecinos_lz' => count($vecinosPropios) > 0,
            'n_vecinos_lz'     => count($vecinosPropios),
        ];
    }

    usort($resultado, fn($a, $b) => ($b['remanente_A'] ?? PHP_INT_MIN) <=> ($a['remanente_A'] ?? PHP_INT_MIN));
    jsonPy($resultado);
}

// ══════════════════════════════════════════════════════════════════════════════
// FEEDERS NUEVOS (comisionamiento) — rutas /api/feeders_nuevos/{*}
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/feeders_nuevos ────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'feeders_nuevos' && !$b0) {
    jsonPy(listarFeeders());
}

// ── POST /api/feeders_nuevos ───────────────────────────────────────────────────
// Body: {nombre, cn, numalim_trafo?, nota?}
if ($method === 'POST' && $a === 'feeders_nuevos' && !$b0) {
    $b = bodyJson();
    if (!($b['nombre'] ?? '') || !isset($b['cn'])) jsonErr('nombre y cn requeridos');
    crearFeeder($b['nombre'], (float)$b['cn'], isset($b['numalim_trafo']) ? (int)$b['numalim_trafo'] : null, $b['nota'] ?? '');
    jsonPy(['ok' => true, 'nombre' => $b['nombre']]);
}

// ── GET /api/feeders_nuevos/{nombre}/informe ──────────────────────────────────
// Genera y descarga el reporte HTML del feeder.
if ($method === 'GET' && $a === 'feeders_nuevos' && $b0 && $b1 === 'informe' && !$b2) {
    $nombreFeeder = urldecode($b0);
    $feeder = cargarFeeder($nombreFeeder);
    $acum   = deltaAcumulado($nombreFeeder);
    $cn     = (float)$feeder['cn'];
    $usoPct = $cn > 0 ? round($acum / $cn * 100, 1) : null;

    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo] = gd();
    $trafoFinal = $trafoFinalMam = null;
    $numalimT   = $feeder['numalim_trafo'] ?? null;
    if ($numalimT) {
        $trafoRow = trafoDeFeeder($dfTrafo, (int)$numalimT);
        if ($trafoRow) {
            $trafoRow      = aplicarAjustesFila($trafoRow, 'trafo', (int)$numalimT);
            $meses         = mesesDisponibles($dfAlim);
            $serieDel      = serieAcumulada($nombreFeeder, $meses);
            $trafoFinal    = analizarTrafo($trafoRow, $acum, 'carga');
            $trafoFinalMam = analizarTrafoMesAMes($trafoRow, $serieDel, 'carga');
        }
    }

    $slug = slugFeeder($nombreFeeder) . '_' . date('Ymd_His');
    $ruta = tempnam(sys_get_temp_dir(), 'rpt');
    generarReporteFeeder($feeder, $acum, $usoPct, $ruta, $trafoFinal, $trafoFinalMam);

    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: attachment; filename="feeder_' . $slug . '.html"');
    readfile($ruta);
    unlink($ruta);
    exit;
}

// ── GET /api/feeders_nuevos/{nombre} ──────────────────────────────────────────
// Retorna objeto enriquecido Python con tabla_sim, resumen, trafo.
if ($method === 'GET' && $a === 'feeders_nuevos' && $b0 && !$b1) {
    $nombre = urldecode($b0);
    $d      = cargarFeeder($nombre);
    $acum   = deltaAcumulado($nombre);
    $cn     = (float)($d['cn'] ?? 0);

    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo] = gd();
    $meses = mesesDisponibles($dfAlim);

    // Últimos ~12 meses (criterio Python)
    if (!empty($meses)) {
        $maxMes     = max($meses);
        $iniMes     = sprintf('%04d-%02d', (int)substr($maxMes, 0, 4) - 1, (int)substr($maxMes, 5, 2));
        $mesesVista = array_values(array_filter($meses, fn($m) => $m >= $iniMes)) ?: $meses;
    } else {
        $mesesVista = $meses;
    }

    // Acumular delta mes a mes desde transferencias
    $acumMam = array_fill_keys($mesesVista, 0.0);
    foreach ($d['transferencias'] ?? [] as $t) {
        if (!empty($t['tabla_mam'])) {
            foreach ($t['tabla_mam'] as $trow) {
                $m = $trow['mes'] ?? '';
                if (array_key_exists($m, $acumMam)) {
                    $acumMam[$m] += (float)(($trow['I_dest_despues'] ?? 0) - ($trow['I_dest_antes'] ?? 0));
                }
            }
        } elseif (!empty($t['delta_A'])) {
            foreach ($mesesVista as $m) { $acumMam[$m] += (float)$t['delta_A']; }
        }
    }

    $tablaSim = [];
    foreach ($mesesVista as $m) {
        $i  = round($acumMam[$m], 1);
        $fu = $cn > 0 ? round($i / $cn * 100, 1) : null;
        $tablaSim[] = [
            'mes'                   => $m,
            'I_dest_antes'         => 0.0,
            'I_dest_despues'       => $i,
            'uso_dest_despues_pct' => $fu,
            'estado_dest'          => $fu === null ? 'sin_datos' : ($fu >= 100 ? 'critico' : ($fu >= 90 ? 'prealerta' : 'viable')),
        ];
    }
    $resumen = resumenEstados($tablaSim);

    // Trafo del feeder nuevo
    $trafoData = null;
    $nmTrafo   = $d['numalim_trafo'] ?? null;
    if ($nmTrafo) {
        $trafoRow = trafoDeFeeder($dfTrafo, (int)$nmTrafo);
        if ($trafoRow) {
            $trafoData = analizarTrafo($trafoRow, $acum, 'carga', 0.90, $mesesVista);
            $trafoData['barra']       = trim((string)($trafoRow['barra'] ?? '')) ?: null;
            $trafoData['subestacion'] = null;
        }
    }

    jsonPy([
        'ok'        => true,
        'data'      => $d,
        'acumulado' => $acum,
        'cn'        => $cn,
        'uso_pct'   => $cn > 0 ? round($acum / $cn * 100, 1) : null,
        'resumen'   => $resumen,
        'tabla_sim' => $tablaSim,
        'trafo'     => $trafoData,
    ]);
}

// ── PUT /api/feeders_nuevos/{nombre} ───────────────────────────────────────────
if ($method === 'PUT' && $a === 'feeders_nuevos' && $b0 && !$b1) {
    $b = bodyJson();
    actualizarFeeder(
        urldecode($b0),
        isset($b['cn'])           ? (float)$b['cn']           : null,
        isset($b['numalim_trafo'])? (int)$b['numalim_trafo']  : null,
        $b['nota'] ?? null,
    );
    jsonPy(['ok' => true]);
}

// ── DELETE /api/feeders_nuevos/{nombre} ────────────────────────────────────────
if ($method === 'DELETE' && $a === 'feeders_nuevos' && $b0 && !$b1) {
    eliminarFeeder(urldecode($b0));
    jsonPy(['ok' => true]);
}

// ── POST /api/feeders_nuevos/{nombre}/transferencias ───────────────────────────
// Simula y guarda un traspaso en el feeder en comisionamiento (flujo completo).
if ($method === 'POST' && $a === 'feeders_nuevos' && $b0 && $b1 === 'transferencias' && !$b2) {
    $nombreFeeder = urldecode($b0);
    $b = bodyJson();
    $nomOrig = $b['origen'] ?? $b['nom_alim_orig'] ?? '';
    if (!$nomOrig) jsonErr('origen requerido');

    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo, 'dfAb' => $dfAb] = gd();
    $feeder  = cargarFeeder($nombreFeeder);
    $nomDest = $feeder['nombre'];
    $cnDest  = (float)$feeder['cn'];

    $tds = seleccionarTds($dfAb, $nomOrig, $b);
    if (empty($tds)) jsonErr('Sin TDs para la selección indicada');

    $equipoAbre2  = $b['equipo_nombre'] ?? $b['equipo_abre'] ?? '';
    $equiposTrasp = ($equipoAbre2 !== '')
        ? equiposEnIsla($dfAb, $tds, $equipoAbre2, $nomOrig) : [];

    $isla  = infoIsla($tds, $nomOrig, $dfAb);
    $nOrig = numalimDeNomAlim($dfAb, $nomOrig);
    if (!$nOrig) jsonErr("Alimentador '$nomOrig' no encontrado");

    $serieOrigRaw = obtenerSerieAlim($dfAlim, $nOrig);
    $serieOrig    = aplicarAjustes($serieOrigRaw['serie'], 'alim', $nOrig);
    $cnOrig       = $serieOrigRaw['cn'];

    $meses     = mesesDisponibles($dfAlim);
    $mesesSel  = $b['meses_sel'] ?? [];
    $serieDest = serieAcumulada($nombreFeeder, $meses);
    $acumActual = deltaAcumulado($nombreFeeder);

    $serieOrigSel = $mesesSel
        ? array_intersect_key($serieOrig, array_flip($mesesSel))
        : $serieOrig;
    $deltaInfo = calcularDelta($serieOrigSel, (float)($isla['p'] ?? 0.0));
    $deltaMax  = $deltaInfo['delta_max'];
    $isla['mes_peor'] = $deltaInfo['mes_peor'] ?? '';

    $dfSim    = filtrarMeses(simular($serieOrig, $serieDest, $cnOrig, $cnDest, $deltaMax), $mesesSel);
    $dfSimMam = filtrarMeses(simularMesAMes($serieOrig, $serieDest, $cnOrig, $cnDest, (float)($isla['p'] ?? 0.0)), $mesesSel);
    $resumen  = resumenEstados($dfSim);

    $trafoOrigRow = trafoDeFeeder($dfTrafo, $nOrig);
    $trafoOrigRow = $trafoOrigRow ? aplicarAjustesFila($trafoOrigRow, 'trafo', $nOrig) : null;
    $trafoOrig    = $trafoOrigRow ? analizarTrafo($trafoOrigRow, $deltaMax, 'alivio', 0.90, $mesesSel) : null;
    $trafoOrigMam = $trafoOrigRow ? analizarTrafoMesAMes($trafoOrigRow, $deltaInfo['serie_deltas'], 'alivio', 0.90, $mesesSel) : null;

    $numalimTN    = $feeder['numalim_trafo'] ?? null;
    $trafoDestRow = $numalimTN ? trafoDeFeeder($dfTrafo, (int)$numalimTN) : null;
    $trafoDestRow = $trafoDestRow ? aplicarAjustesFila($trafoDestRow, 'trafo', (int)$numalimTN) : null;
    $trafoDest    = $trafoDestRow ? analizarTrafo($trafoDestRow, $acumActual + $deltaMax, 'carga', 0.90, $mesesSel) : null;
    $trafoDestMam = $trafoDestRow ? analizarTrafoMesAMes($trafoDestRow, $deltaInfo['serie_deltas'], 'carga', 0.90, $mesesSel) : null;

    $idx = agregarTransferencia(
        $nombreFeeder, $nomOrig, $deltaMax,
        $isla['kva_isla']   ?? 0.0,
        $isla['kva_feeder'] ?? 0.0,
        $isla['p_pct']      ?? 0.0,
        $isla['n_td']       ?? 0,
        $isla['clientes']   ?? null,
        $b['descripcion']   ?? '',
        $dfSim, $dfSimMam,
        is_nan($cnOrig) ? null : $cnOrig,
        $cnDest,
        $nomDest, $resumen,
        $trafoOrig, $trafoDest, $trafoOrigMam, $trafoDestMam,
        $mesesSel,
        $isla['detalle_tds']  ?? [],
        $equipoAbre2,
        $b['equipo_cierra']   ?? '',
        $b['escenario']       ?? 'normal',
        null,
        $b['cambio_topologico'] ?? '',
        $equiposTrasp,
    );
    jsonPy(['ok' => true, 'idx' => $idx, 'isla' => $isla, 'delta_max' => $deltaMax, 'resumen' => $resumen]);
}

// ── GET /api/feeders_nuevos/{nombre}/transferencias/{idx} ─────────────────────
if ($method === 'GET' && $a === 'feeders_nuevos' && $b0 && $b1 === 'transferencias' && $b2) {
    $feeder = cargarFeeder(urldecode($b0));
    $idx    = (int)$b2;
    $lista  = $feeder['transferencias'] ?? [];
    $found  = null;
    foreach ($lista as $t) {
        if (($t['idx'] ?? null) === $idx) { $found = $t; break; }
    }
    if ($found === null) jsonErr("Transferencia $idx no existe", 404);
    jsonPy(['ok' => true, 'transferencia' => $found]);
}

// ── DELETE /api/feeders_nuevos/{nombre}/transferencias/{idx} ──────────────────
if ($method === 'DELETE' && $a === 'feeders_nuevos' && $b0 && $b1 === 'transferencias' && $b2) {
    eliminarTransferencia(urldecode($b0), (int)$b2);
    jsonPy(['ok' => true]);
}

// ── POST /api/feeders_nuevos/{nombre}/cambios_topologicos ─────────────────────
if ($method === 'POST' && $a === 'feeders_nuevos' && $b0 && $b1 === 'cambios_topologicos' && !$b2) {
    $b = bodyJson();
    if (!($b['descripcion'] ?? '')) jsonErr('descripcion requerida');
    $idx = agregarCambioTopologico(urldecode($b0), $b['descripcion']);
    jsonPy(['ok' => true, 'idx' => $idx]);
}

// ── DELETE /api/feeders_nuevos/{nombre}/cambios_topologicos/{idx} ─────────────
if ($method === 'DELETE' && $a === 'feeders_nuevos' && $b0 && $b1 === 'cambios_topologicos' && $b2) {
    eliminarCambioTopologico(urldecode($b0), (int)$b2);
    jsonPy(['ok' => true]);
}

// ══════════════════════════════════════════════════════════════════════════════
// AJUSTES — rutas /api/ajustes
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ajustes ── lista todos los ajustes activos (Python compat) ────────
if ($method === 'GET' && $a === 'ajustes' && !$b0) {
    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo] = gd();
    // Carga interna del archivo de ajustes
    $ajPath = dirname(__DIR__ . '/src/') . '/data/ajustes_demanda.json';
    // Ruta correcta: data/ está a nivel de codigo_php/
    $ajPath2 = __DIR__ . '/data/ajustes_demanda.json';
    $rawData = [];
    if (is_file($ajPath2)) {
        $raw = file_get_contents($ajPath2);
        if ($raw !== false) {
            try { $rawData = json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?? []; } catch (\JsonException) {}
        }
    }
    $result = [];
    foreach ($rawData as $tipo => $porNumalim) {
        foreach ($porNumalim as $numalimStr => $ajustes) {
            if (empty($ajustes)) continue;
            $numalimInt = (int)$numalimStr;
            if ($tipo === 'alim') {
                $row    = $dfAlim[$numalimInt] ?? null;
                $nombre = $row ? nombreDisplayAlim($row) : $numalimStr;
            } else {
                $tRow   = $dfTrafo[$numalimInt] ?? null;
                $nombre = $tRow ? (trim((string)($tRow['barra'] ?? '')) ?: $numalimStr) : $numalimStr;
            }
            ksort($ajustes);
            $mesesAj = [];
            foreach ($ajustes as $mes => $valAj) {
                $valSql = null;
                try {
                    if ($tipo === 'alim' && isset($dfAlim[$numalimInt][$mes])) {
                        $v = $dfAlim[$numalimInt][$mes];
                        $valSql = is_numeric($v) ? (float)$v : null;
                    } elseif ($tipo === 'trafo' && isset($dfTrafo[$numalimInt][$mes])) {
                        $v = $dfTrafo[$numalimInt][$mes];
                        $valSql = is_numeric($v) ? (float)$v : null;
                    }
                } catch (Throwable) {}
                $mesesAj[] = ['mes' => $mes, 'valor_sql' => $valSql, 'valor_ajustado' => $valAj];
            }
            $result[] = ['tipo' => $tipo, 'numalim' => $numalimInt, 'nombre' => $nombre, 'ajustes' => $mesesAj];
        }
    }
    jsonPy($result);
}

// ── GET /api/ajustes/{tipo}/{numalim} ──────────────────────────────────────────
if ($method === 'GET' && $a === 'ajustes' && $b0 && $b1 && !$b2) {
    jsonOk(getAjustes($b0, (int)$b1));
}

// ── POST /api/ajustes/{tipo}/{numalim} ─────────────────────────────────────────
if ($method === 'POST' && $a === 'ajustes' && $b0 && $b1 && !$b2) {
    setAjustes($b0, (int)$b1, bodyJson());
    jsonPy(['ok' => true, 'ajustes' => getAjustes($b0, (int)$b1)]);
}

// ── DELETE /api/ajustes/{tipo}/{numalim}/{mes} ─────────────────────────────────
if ($method === 'DELETE' && $a === 'ajustes' && $b0 && $b1 && $b2) {
    if (!in_array($b0, ['alim', 'trafo'], true)) jsonErr("tipo debe ser 'alim' o 'trafo'");
    delAjuste($b0, (int)$b1, $b2);
    jsonPy(['ok' => true, 'ajustes' => getAjustes($b0, (int)$b1)]);
}

// ══════════════════════════════════════════════════════════════════════════════
// VCC — Validación de Conexión de Cliente
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/vcc/equipos/{nom_alim}?modo=equipos|tp ──────────────────────────
// modo=equipos (default): lista de equipos upstream enriquecida para el cache del JS
//   → {numpos, nombre, tipo, cn, cn_opcional, fraccion, kva_down, kva_total, tds_down, ...}
// modo=tp: lista de TDs del feeder → {numpos, nombre, kva, tipo}
if ($method === 'GET' && $a === 'vcc' && $b0 === 'equipos' && $b1 && !$b2) {
    $nomAlim = urldecode($b1);
    $modo    = $_GET['modo'] ?? 'equipos';
    ['dfAb' => $dfAb] = gd();
    $nomUp   = strtoupper(trim($nomAlim));

    if ($modo === 'tp') {
        // Retorna TDs únicos del feeder cuyo nombre empieza con "TP" (igual que Python)
        $seen   = [];
        $result = [];
        foreach ($dfAb as $row) {
            if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
            $np = trim($row['numpos_td'] ?? '');
            if ($np === '' || isset($seen[$np])) continue;
            $nombre = trim($row['nombre'] ?? '');
            if (!str_starts_with(strtoupper($nombre), 'TP')) continue;
            $seen[$np] = true;
            $kva = isset($row['potencia']) && is_numeric($row['potencia'])
                ? (float)$row['potencia'] : null;
            $result[] = ['numpos' => $np, 'nombre' => $nombre, 'kva' => $kva, 'tipo' => 'tp'];
        }
        // Ordenar: kVA DESC, nombre ASC (igual que Python)
        usort($result, function($a, $b) {
            $ka = $a['kva'] ?? 0; $kb = $b['kva'] ?? 0;
            return $ka !== $kb ? $kb <=> $ka : strcmp($a['nombre'], $b['nombre']);
        });
        jsonPy($result);
    }

    // modo=equipos — obtiene todos los numpos_equip únicos, los clasifica y enriquece con fracción
    $nombresEq = [];
    foreach ($dfAb as $row) {
        if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
        $ne = trim($row['numpos_equip'] ?? '');
        if ($ne !== '') $nombresEq[$ne] = true;
    }
    $clasificados = _vccClasificarUpstream(array_keys($nombresEq));
    $result = [];
    foreach ($clasificados as $eq) {
        $frac = in_array($eq['tipo'], ['reconectador', 'equipo_sub'], true)
            ? calcularFraccionReco($dfAb, $nomAlim, $eq['nombre'])
            : ['kva_down' => null, 'kva_total' => null, 'fraccion' => null,
               'tds_down' => null, 'tds_con_kva' => null, 'tds_sin_kva' => null];
        // 'numpos' es el identificador de equipo; 'nombre' es el mismo valor (numpos_equip)
        $result[] = array_merge($eq, $frac, ['numpos' => $eq['nombre']]);
    }
    // Ordenar: fracción descendente (igual que Python)
    usort($result, fn($a, $b) => ($b['fraccion'] ?? 0) <=> ($a['fraccion'] ?? 0));
    jsonPy($result);
}

// ── POST /api/vcc/punto ────────────────────────────────────────────────────────
// Busca el punto de conexión en la topología y retorna los equipos upstream.
// Body: {nom_alim, numpos}
// Retorna: {tipo, numpos_ref, nombre_ref, n_tds_aguas_abajo, upstream:[{nombre,tipo,cn,cn_opcional}]}
if ($method === 'POST' && $a === 'vcc' && $b0 === 'punto' && !$b1) {
    $b       = bodyJson();
    $nomAlim = $b['nom_alim'] ?? '';
    $numpos  = trim($b['numpos'] ?? '');
    if (!$nomAlim || !$numpos) jsonErr('nom_alim y numpos son requeridos');
    ['dfAb' => $dfAb] = gd();
    jsonPy(buscarPuntoConexion($dfAb, $nomAlim, $numpos));
}

// ── POST /api/vcc/evaluar ─────────────────────────────────────────────────────
// Alias Python de POST /api/vcc/calcular. Retorna formato Python plano.
// Body incluye: nom_alim, numalim, numpos, tension_kv, kva_empalme, kva_instalado?, etc.
if ($method === 'POST' && $a === 'vcc' && $b0 === 'evaluar' && !$b1) {
    $b         = bodyJson();
    $nomAlim   = $b['nom_alim']      ?? '';
    $numpos    = $b['numpos']        ?? '';
    $kvaEmp    = (float)($b['kva_empalme'] ?? 0);
    $tensionKv = (float)($b['tension_kv']  ?? 12);
    if (!$nomAlim || !$kvaEmp) jsonErr('nom_alim y kva_empalme son requeridos');

    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo, 'dfAb' => $dfAb] = gd();
    $numalim = (int)($b['numalim'] ?? 0) ?: numalimDeNomAlim($dfAb, $nomAlim) ?? 0;
    if (!$numalim) jsonErr("Alimentador '$nomAlim' no encontrado");

    // equipos_cn: lista enriquecida enviada por el JS (ya tiene fraccion + CN del usuario).
    // Si no viene, calculamos desde cero con buscarPuntoConexion.
    $upstream = (isset($b['equipos_cn']) && is_array($b['equipos_cn']) && count($b['equipos_cn']) > 0)
        ? $b['equipos_cn']
        : enriquecerUpstreamConFraccion(
            $dfAb, $nomAlim,
            ($numpos ? buscarPuntoConexion($dfAb, $nomAlim, $numpos) : [])['upstream'] ?? []
          );
    $deltaI    = deltaICliente($kvaEmp, $tensionKv);
    $mesesSel  = $b['meses_sel'] ?? [];
    $dtA       = (float)($b['delta_traspaso_a']   ?? 0);
    $dtPct     = (float)($b['delta_traspaso_pct'] ?? 0);
    $trafoRow  = trafoDeFeeder($dfTrafo, $numalim);
    $trafoRow  = $trafoRow ? aplicarAjustesFila($trafoRow, 'trafo', $numalim) : null;
    $serieAlim = obtenerSerieAlim($dfAlim, $numalim);
    // Aplicar alivio del traspaso a la serie antes de evaluar equipos (Enfoque B)
    $serieParaEquipos = $serieAlim['serie'];
    if ($dtPct > 0) {
        $serieParaEquipos = array_map(fn($v) => $v !== null ? round($v * (1 - $dtPct / 100), 2) : null, $serieParaEquipos);
    } elseif ($dtA > 0) {
        $serieParaEquipos = array_map(fn($v) => $v !== null ? max(0.0, round($v - $dtA, 2)) : null, $serieParaEquipos);
    }
    $equipos   = evaluarEquipos($upstream, $deltaI, $serieAlim['cn'], $serieParaEquipos, $mesesSel ?: null);
    $vcc       = calcularVcc($dfAlim, $numalim, $trafoRow, $deltaI, $mesesSel, $dtA, $dtPct);

    // Calcular pct_max_alim y mes_max_alim desde tabla_alim
    $pctMaxAlim = null; $mesMaxAlim = '';
    foreach ($vcc['tabla_alim'] ?? [] as $r) {
        $pct = $r['uso_despues_pct'] ?? null;
        if ($pct !== null && ($pctMaxAlim === null || $pct > $pctMaxAlim)) {
            $pctMaxAlim = $pct; $mesMaxAlim = $r['mes'] ?? '';
        }
    }

    $result = array_merge($vcc, [
        'ok'                  => true,
        'nombre_alim'         => $nomAlim,
        'cn_alim'             => is_nan($serieAlim['cn']) ? null : $serieAlim['cn'],
        'numalim'             => $numalim,
        'numpos'              => $numpos,
        'nombre_ref'          => $b['nombre_ref'] ?? $numpos,
        'tipo_ref'            => $b['tipo_ref']   ?? '',
        'n_tds_aguas_abajo'   => $b['n_tds_aguas_abajo'] ?? 0,
        'meses_sel'           => $mesesSel,
        'equipos_eval'        => $equipos,
        'delta_I'             => $deltaI,
        'delta_traspaso_a'    => $dtA,
        'delta_traspaso_pct'  => $dtPct,
        'delta_traspaso_modo' => $b['delta_traspaso_modo'] ?? '',
        'pct_max_alim'        => $pctMaxAlim,
        'mes_max_alim'        => $mesMaxAlim,
        'resumen_alim'        => resumenEstados($vcc['tabla_alim'] ?? []),
        'alivio_A_peor'       => (function() use ($vcc, $dtA, $dtPct, $mesMaxAlim): float {
            if (!($dtA > 0 || $dtPct > 0)) return 0.0;
            if (!$mesMaxAlim) return 0.0;
            $tablaIdx = [];
            foreach ($vcc['tabla_alim'] ?? [] as $r) {
                if (isset($r['mes'])) $tablaIdx[$r['mes']] = $r;
            }
            $iAdj = (float)(($tablaIdx[$mesMaxAlim] ?? [])['I_antes'] ?? 0);
            if ($dtPct > 0 && $dtPct < 100) {
                return round($iAdj / (1 - $dtPct / 100) - $iAdj, 1);
            }
            return round($dtA, 1);
        })(),
    ]);

    // Escenario 2 — kVA instalado
    if (!empty($b['kva_instalado'])) {
        $kvaInst    = (float)$b['kva_instalado'];
        $dISens     = deltaICliente($kvaInst, $tensionKv);
        $vccSens    = calcularVcc($dfAlim, $numalim, $trafoRow, $dISens, $mesesSel, $dtA, $dtPct);
        $eqSens = evaluarEquipos($upstream, $dISens, $serieAlim['cn'], $serieParaEquipos, $mesesSel ?: null);
        $pctMaxSens = null; $mesMaxSens = '';
        foreach ($vccSens['tabla_alim'] ?? [] as $r) {
            $pct = $r['uso_despues_pct'] ?? null;
            if ($pct !== null && ($pctMaxSens === null || $pct > $pctMaxSens)) {
                $pctMaxSens = $pct; $mesMaxSens = $r['mes'] ?? '';
            }
        }
        $result['kva_instalado']      = $kvaInst;
        $result['delta_I_sens']       = $dISens;
        $result['tabla_alim_sens']    = $vccSens['tabla_alim']  ?? [];
        $result['tabla_trafo_sens']   = $vccSens['tabla_trafo'] ?? null;
        $result['equipos_eval_sens']  = $eqSens;
        $result['pct_max_alim_sens']  = $pctMaxSens;
        $result['mes_max_alim_sens']  = $mesMaxSens;
    }

    // lz_info: disponible cuando hay traspaso simultáneo con origen conocido.
    // El receptor es siempre $numalim; el origen es opcional en el body.
    $numalimOrig = isset($b['numalim_orig']) ? (int)$b['numalim_orig'] : null;
    $result['lz_info'] = _lzInfoEntre($numalimOrig, $numalim);

    jsonPy($result);
}

// ── POST /api/vcc/guardar ─────────────────────────────────────────────────────
// Guarda evaluación VCC. Body Python con nom_alim, numalim, cn_alim, etc.
if ($method === 'POST' && $a === 'vcc' && $b0 === 'guardar' && !$b1) {
    $b       = bodyJson();
    $nomAlim = $b['nom_alim'] ?? '';
    $numalim = (int)($b['numalim'] ?? 0);
    $cnAlim  = (float)($b['cn_alim'] ?? 0);
    if (!$nomAlim) jsonErr('nom_alim requerido');
    if (!isset($b['fecha'])) $b['fecha'] = date('Y-m-d');
    $idx = guardarEvaluacion($nomAlim, $numalim, $cnAlim, $b);
    jsonPy(['ok' => true, 'idx' => $idx]);
}

// ── POST /api/vcc/descargar_html ───────────────────────────────────────────────
// Genera y descarga reporte VCC como HTML.
if ($method === 'POST' && $a === 'vcc' && $b0 === 'descargar_html' && !$b1) {
    $b       = bodyJson();
    $nomAlim = $b['nombre_alim'] ?? $b['nom_alim'] ?? '';
    if (!$nomAlim) jsonErr('nombre_alim requerido');
    $slug = slugFeeder($nomAlim) . '_vcc_' . date('Ymd_His');
    $ruta = tempnam(sys_get_temp_dir(), 'rpt');
    if (!isset($b['nombre_alim'])) $b['nombre_alim'] = $nomAlim;
    generarReporteVcc($b, $ruta);
    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $slug . '.html"');
    readfile($ruta);
    unlink($ruta);
    exit;
}

// ── GET /api/vcc/historial_global ──────────────────────────────────────────────
// Lista todas las evaluaciones VCC de todos los alimentadores.
if ($method === 'GET' && $a === 'vcc' && $b0 === 'historial_global' && !$b1) {
    $allEvs = [];
    foreach (listarAlimsConVcc() as $slug) {
        try {
            $data   = cargarEvaluaciones($slug);
            $nombre = $data['nombre'] ?? $slug;
            $cn     = $data['cn']     ?? null;
            foreach ($data['evaluaciones'] ?? [] as $ev) {
                $allEvs[] = array_merge(['nombre_alim' => $nombre, 'cn_alim' => $cn], $ev);
            }
        } catch (Throwable) {}
    }
    usort($allEvs, fn($a, $b) => strcmp(($b['fecha'] ?? '') . sprintf('%05d', $b['idx'] ?? 0), ($a['fecha'] ?? '') . sprintf('%05d', $a['idx'] ?? 0)));
    jsonPy($allEvs);
}

// ── POST /api/vcc/calcular ─────────────────────────────────────────────────────
// PHP original — retorna {ok, data} wrapper.
if ($method === 'POST' && $a === 'vcc' && $b0 === 'calcular' && !$b1) {
    $b         = bodyJson();
    $nomAlim   = $b['nom_alim']     ?? '';
    $numpos    = $b['numpos']       ?? '';
    $kvaEmp    = (float)($b['kva_empalme'] ?? 0);
    $tensionKv = (float)($b['tension_kv']  ?? 12);
    if (!$nomAlim || !$numpos || !$kvaEmp) jsonErr('nom_alim, numpos y kva_empalme son requeridos');

    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo, 'dfAb' => $dfAb] = gd();
    $numalim = numalimDeNomAlim($dfAb, $nomAlim);
    if (!$numalim) jsonErr("Alimentador '$nomAlim' no encontrado en aguas_abajo");

    $punto     = buscarPuntoConexion($dfAb, $nomAlim, $numpos);
    $upstream  = enriquecerUpstreamConFraccion($dfAb, $nomAlim, $punto['upstream'] ?? []);
    $deltaI    = deltaICliente($kvaEmp, $tensionKv);
    $mesesSel  = $b['meses_sel'] ?? [];
    $dtA       = (float)($b['delta_traspaso_a']   ?? 0);
    $dtPct     = (float)($b['delta_traspaso_pct'] ?? 0);
    $trafoRow  = trafoDeFeeder($dfTrafo, $numalim);
    $trafoRow  = $trafoRow ? aplicarAjustesFila($trafoRow, 'trafo', $numalim) : null;
    $serieAlim = obtenerSerieAlim($dfAlim, $numalim);
    $equipos   = evaluarEquipos($upstream, $deltaI, $serieAlim['cn'], $serieAlim['serie'], $mesesSel ?: null);
    $vcc       = calcularVcc($dfAlim, $numalim, $trafoRow, $deltaI, $mesesSel, $dtA, $dtPct);

    $result = array_merge($vcc, [
        'nombre_alim'        => $nomAlim,
        'numalim'            => $numalim,
        'punto'              => $punto,
        'upstream'           => $upstream,
        'equipos_eval'       => $equipos,
        'delta_I'            => $deltaI,
        'kva_empalme'        => $kvaEmp,
        'tension_kv'         => $tensionKv,
        'n_tds_aguas_abajo'  => $punto['n_tds_aguas_abajo'] ?? 0,
        'numpos'             => $numpos,
        'nombre_ref'         => $punto['nombre_ref'] ?? $numpos,
        'numpos_nuevo_tp'    => $b['numpos_nuevo_tp']  ?? '',
        'id_cliente'         => $b['id_cliente']       ?? '',
        'nombre_cliente'     => $b['nombre_cliente']   ?? '',
        'direccion'          => $b['direccion']        ?? '',
        'descripcion'        => $b['descripcion']      ?? '',
        'delta_traspaso_modo'=> $b['delta_traspaso_modo'] ?? '',
        'delta_traspaso_a'   => $dtA,
        'delta_traspaso_pct' => $dtPct,
    ]);

    if (!empty($b['kva_instalado'])) {
        $kvaInst    = (float)$b['kva_instalado'];
        $deltaISens = deltaICliente($kvaInst, $tensionKv);
        $vccSens    = calcularVcc($dfAlim, $numalim, $trafoRow, $deltaISens, $mesesSel, $dtA, $dtPct);
        $equipSens  = evaluarEquipos($upstream, $deltaISens, $serieAlim['cn'], $serieAlim['serie'], $mesesSel ?: null);
        $result['kva_instalado']     = $kvaInst;
        $result['delta_I_sens']      = $deltaISens;
        $result['tabla_alim_sens']   = $vccSens['tabla_alim']  ?? [];
        $result['tabla_trafo_sens']  = $vccSens['tabla_trafo'] ?? null;
        $result['equipos_eval_sens'] = $equipSens;
    }
    jsonOk($result);
}

// ── POST /api/vcc/reporte ──────────────────────────────────────────────────────
if ($method === 'POST' && $a === 'vcc' && $b0 === 'reporte' && !$b1) {
    $b = bodyJson();
    $nomAlim = $b['nombre_alim'] ?? '';
    if (!$nomAlim) jsonErr('nombre_alim requerido en el body');
    jsonOk(['ok' => true]);
}

// ── GET /api/vcc ───────────────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'vcc' && !$b0) {
    jsonOk(listarAlimsConVcc());
}

// ── GET /api/vcc/{nombre} ──────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'vcc' && $b0 && !$b1) {
    jsonOk(cargarEvaluaciones(urldecode($b0)));
}

// ── POST /api/vcc/{nombre} ─────────────────────────────────────────────────────
if ($method === 'POST' && $a === 'vcc' && $b0 && !$b1) {
    $b   = bodyJson();
    $idx = guardarEvaluacion(
        urldecode($b0),
        (int)($b['numalim']  ?? 0),
        (float)($b['cn_alim'] ?? $b['tabla_alim'][0]['cn'] ?? 0),
        $b,
    );
    jsonOk(['idx' => $idx]);
}

// ── DELETE /api/vcc/{nombre}/{idx} ─────────────────────────────────────────────
if ($method === 'DELETE' && $a === 'vcc' && $b0 && $b1 && !$b2) {
    eliminarEvaluacion(urldecode($b0), (int)$b1);
    jsonPy(['ok' => true]);
}

// ── GET /api/debug/status ──────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'debug' && $b0 === 'status' && !$b1) {
    $cacheAb  = D_CACHE . '/aguas_abajo.ser';
    $cacheDem = D_CACHE . '/demandas.ser';
    $abOk  = file_exists($cacheAb);
    $demOk = file_exists($cacheDem);
    if ($abOk && $demOk) {
        ['dfAlim' => $dfAlim, 'dfAb' => $dfAb] = gd();
        $feedersAb = count(array_unique(array_column($dfAb, 'nom_alim')));
        $tdsAb     = count(array_unique(array_column($dfAb, 'numpos_td')));
        $meses     = mesesDisponibles($dfAlim);
        jsonPy([
            'cargado'             => true,
            'feeders_aguas_abajo' => $feedersAb,
            'tds_aguas_abajo'     => $tdsAb,
            'alimentadores'       => count($dfAlim),
            'meses_disponibles'   => $meses,
            'cache_ab_mtime'      => date('Y-m-d H:i:s', (int)filemtime($cacheAb)),
            'cache_dem_mtime'     => date('Y-m-d H:i:s', (int)filemtime($cacheDem)),
        ]);
    }
    jsonPy(['cargado' => false, 'cache_ab' => $abOk, 'cache_dem' => $demOk]);
}

// ── GET /api/datos ─────────────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'datos' && !$b0) {
    ['dfAlim' => $dfAlim, 'dfAb' => $dfAb] = gd();
    $meses   = mesesDisponibles($dfAlim);
    $feeders = array_values(array_unique(array_column($dfAb, 'nom_alim')));
    sort($feeders);
    jsonOk(['meses' => $meses, 'feeders_origen' => $feeders, 'feeders_memoria' => listarFeeders()]);
}

// ── 404 ────────────────────────────────────────────────────────────────────────
jsonErr('Endpoint no encontrado: ' . $method . ' ' . $uri, 404);

} catch (RuntimeException $e) {
    jsonErr($e->getMessage(), 422);
} catch (\JsonException $e) {
    jsonErr('Error serializando respuesta: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    jsonErr($e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine(), 500);
}
