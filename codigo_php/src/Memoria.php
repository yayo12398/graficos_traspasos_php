<?php
declare(strict_types=1);

/**
 * Memoria.php — Persistencia de feeders en comisionamiento.
 *
 * Equivalente PHP de traspaso/memoria.py.
 *
 * Cada feeder nuevo se guarda como JSON en feeders_nuevos/<SLUG>.json.
 * Las transferencias se acumulan, permitiendo simular el estado progresivo
 * del feeder a medida que recibe carga de distintos orígenes.
 *
 * Estructura JSON guardada:
 * {
 *   "nombre": "NUEVO_ALIM",
 *   "cn": 400.0,
 *   "numalim_trafo": null,
 *   "nota": "",
 *   "cambios_topologicos": [...],
 *   "transferencias": [...]
 * }
 */

// ─── Paths ────────────────────────────────────────────────────────────────

/** Directorio donde se guardan los JSON de feeders nuevos. */
function _memFeedersDir(): string
{
    // __DIR__ = codigo_php/src  →  sube a codigo_php  →  feeders_nuevos/
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'feeders_nuevos';
}

function _memPathFeeder(string $nombre): string
{
    return _memFeedersDir() . DIRECTORY_SEPARATOR . _memSlug($nombre) . '.json';
}

/**
 * Slug simple para nombres de archivo.
 * Equivalente a _slug() de memoria.py (sin stripping de acentos — solo upper + regex).
 */
function _memSlug(string $s): string
{
    $s = strtoupper(trim($s));
    $s = (string) preg_replace('/[^\w]+/u', '_', $s);
    return trim($s, '_');
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

/**
 * Lista los nombres de feeders guardados en disco.
 * Equivalente a listar_feeders() de Python.
 */
function listarFeeders(): array
{
    $dir = _memFeedersDir();
    if (!is_dir($dir)) return [];

    $nombres = [];
    $files   = glob($dir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    sort($files);
    foreach ($files as $f) {
        try {
            $data      = _memCargarJson($f);
            $nombres[] = $data['nombre'] ?? basename($f, '.json');
        } catch (Throwable) {}
    }
    return $nombres;
}

/**
 * Crea un nuevo feeder. Lanza RuntimeException si ya existe.
 * Equivalente a crear_feeder() de Python.
 */
function crearFeeder(
    string $nombre,
    float  $cn,
    ?int   $numalimTrafo = null,
    string $nota         = '',
): void {
    $path = _memPathFeeder($nombre);
    if (file_exists($path)) {
        throw new RuntimeException(
            "Ya existe el feeder '$nombre'. Use cargarFeeder() para editarlo."
        );
    }
    if (!is_dir(_memFeedersDir())) {
        mkdir(_memFeedersDir(), 0755, recursive: true);
    }
    _memGuardarJson($path, [
        'nombre'              => trim($nombre),
        'cn'                  => $cn,
        'numalim_trafo'       => $numalimTrafo,
        'nota'                => trim($nota),
        'cambios_topologicos' => [],
        'transferencias'      => [],
    ]);
}

/**
 * Carga el JSON de un feeder. Lanza RuntimeException si no existe.
 * Aplica migración automática si el primer idx es 0 (formato antiguo).
 * Equivalente a cargar_feeder() de Python.
 */
function cargarFeeder(string $nombre): array
{
    $path = _memPathFeeder($nombre);
    if (!file_exists($path)) {
        throw new RuntimeException(
            "Feeder '$nombre' no encontrado. " .
            "Feeders disponibles: " . implode(', ', listarFeeders())
        );
    }
    $data = _memCargarJson($path);

    // Migración: renumerar desde 1 si el primer idx es 0 (formato antiguo)
    $trs = $data['transferencias'] ?? [];
    if ($trs && ($trs[0]['idx'] ?? 1) === 0) {
        foreach ($data['transferencias'] as $i => &$t) {
            $t['idx'] = $i + 1;
        }
        unset($t);
        _memGuardarJson($path, $data);
    }
    return $data;
}

/**
 * Actualiza metadatos del feeder (cn, numalim_trafo, nota).
 * Equivalente a actualizar_feeder() de Python.
 */
function actualizarFeeder(
    string  $nombre,
    ?float  $cn           = null,
    ?int    $numalimTrafo = null,
    ?string $nota         = null,
): void {
    $data = cargarFeeder($nombre);
    if ($cn !== null)           $data['cn']            = $cn;
    if ($numalimTrafo !== null) $data['numalim_trafo'] = $numalimTrafo;
    if ($nota !== null)         $data['nota']          = trim($nota);
    _memGuardarJson(_memPathFeeder($nombre), $data);
}

/**
 * Agrega una transferencia al feeder nuevo.
 * Retorna el índice asignado (comienza en 1).
 * Equivalente a agregar_transferencia() de Python.
 */
function agregarTransferencia(
    string  $nombreFeeder,
    string  $origen,
    float   $deltaA,
    float   $kvaIsla,
    float   $kvaOrigen,
    float   $pPct,
    int     $nTd,
    ?int    $clientes,
    string  $descripcion        = '',
    ?array  $tabla              = null,
    ?array  $tablaMam           = null,
    ?float  $cnOrig             = null,
    ?float  $cnDest             = null,
    ?string $nombreDest         = null,
    ?array  $resumen            = null,
    ?array  $trafoOrig          = null,
    ?array  $trafoDest          = null,
    ?array  $trafoOrigMam       = null,
    ?array  $trafoDestMam       = null,
    ?array  $mesesSel           = null,
    ?array  $detalleTds         = null,
    string  $equipoAbre         = '',
    string  $equipoCierra       = '',
    string  $escenario          = 'normal',
    ?int    $nTdEquipoTotal     = null,
    string  $cambioTopologico   = '',
    ?array  $equiposTraspasados = null,
): int {
    $data = cargarFeeder($nombreFeeder);
    $idx  = count($data['transferencias']) + 1;

    $data['transferencias'][] = [
        'idx'                 => $idx,
        'origen'              => trim($origen),
        'descripcion'         => trim($descripcion),
        'delta_A'             => round($deltaA,    3),
        'kva_isla'            => round($kvaIsla,   1),
        'kva_origen'          => round($kvaOrigen, 1),
        'p_pct'               => round($pPct,      2),
        'n_td'                => $nTd,
        'clientes'            => $clientes,
        'fecha'               => date('Y-m-d'),
        'tabla'               => $tabla               ?? [],
        'tabla_mam'           => $tablaMam            ?? [],
        'cn_orig'             => $cnOrig,
        'cn_dest'             => $cnDest,
        'nombre_dest'         => $nombreDest,
        'resumen'             => $resumen             ?? [],
        'trafo_orig'          => $trafoOrig,
        'trafo_dest'          => $trafoDest,
        'trafo_orig_mam'      => $trafoOrigMam,
        'trafo_dest_mam'      => $trafoDestMam,
        'meses_sel'           => $mesesSel            ?? [],
        'detalle_tds'         => $detalleTds          ?? [],
        'equipo_abre'         => trim($equipoAbre),
        'equipo_cierra'       => trim($equipoCierra),
        'escenario'           => $escenario,
        'n_td_equipo_total'   => $nTdEquipoTotal,
        'cambio_topologico'   => trim($cambioTopologico),
        'equipos_traspasados' => $equiposTraspasados  ?? [],
    ];

    _memGuardarJson(_memPathFeeder($nombreFeeder), $data);
    return $idx;
}

/**
 * Elimina una transferencia por su índice y renumera desde 1.
 * Equivalente a eliminar_transferencia() de Python.
 */
function eliminarTransferencia(string $nombreFeeder, int $idx): void
{
    $data = cargarFeeder($nombreFeeder);
    $trs  = $data['transferencias'];
    $idxs = array_column($trs, 'idx');

    if (!in_array($idx, $idxs, strict: true)) {
        throw new RuntimeException(
            "Índice $idx no existe (transferencias: " . implode(', ', $idxs) . ")."
        );
    }

    $data['transferencias'] = array_values(
        array_filter($trs, fn($t) => $t['idx'] !== $idx)
    );
    foreach ($data['transferencias'] as $i => &$t) {
        $t['idx'] = $i + 1;
    }
    unset($t);

    _memGuardarJson(_memPathFeeder($nombreFeeder), $data);
}

/**
 * Elimina completamente el archivo de un feeder.
 * Equivalente a eliminar_feeder() de Python.
 */
function eliminarFeeder(string $nombre): void
{
    $path = _memPathFeeder($nombre);
    if (!file_exists($path)) {
        throw new RuntimeException("Feeder '$nombre' no encontrado.");
    }
    unlink($path);
}

// ─── Serie acumulada ──────────────────────────────────────────────────────

/**
 * Suma de todos los delta_A registrados en el feeder (corriente total acumulada).
 * Equivalente a delta_acumulado() de Python.
 */
function deltaAcumulado(string $nombreFeeder): float
{
    $data  = cargarFeeder($nombreFeeder);
    $puser = strtoupper(trim((string)($data['nombre'] ?? $nombreFeeder)));
    $sum   = 0.0;
    foreach ($data['transferencias'] ?? [] as $t) {
        // Solo la carga que recibe el PROPIO PUSER. Las transferencias del proyecto cuyo
        // destino es otro alimentador (rebalanceo multi-alim) NO cargan al PUSER.
        // Legacy: nombre_dest vacío/null = carga hacia el PUSER.
        $dest = strtoupper(trim((string)($t['nombre_dest'] ?? '')));
        if ($dest === '' || $dest === $puser) $sum += (float)($t['delta_A'] ?? 0);
    }
    return round($sum, 3);
}

/**
 * Serie mensual acumulada: delta total aplicado a TODOS los meses (escenario conservador).
 * Equivalente a serie_acumulada() de Python → retorna ['YYYY-MM' => float].
 */
function serieAcumulada(string $nombreFeeder, array $meses): array
{
    return array_fill_keys($meses, deltaAcumulado($nombreFeeder));
}

/**
 * Transferencias como tabla plana (array de arrays asociativos).
 * Equivalente a tabla_transferencias() de Python → reemplaza DataFrame.
 */
function tablaTransferencias(string $nombreFeeder): array
{
    return cargarFeeder($nombreFeeder)['transferencias'] ?? [];
}

// ─── Neteo multi-alimentador (proyecto) ───────────────────────────────────

/**
 * Ajuste NETO de corriente per-mes que las transferencias del proyecto imponen sobre
 * un alimentador dado: +recibido (transferencias con nombre_dest=$feeder) y −cedido
 * (transferencias con origen=$feeder). Usa los INCREMENTOS de tabla_mam
 * (I_dest_despues−I_dest_antes = recibido; I_orig_antes−I_orig_despues = cedido), por lo
 * que es robusto al baseline con que se simuló cada transferencia.
 *
 * @return array ['YYYY-MM' => float] para los $meses solicitados (0.0 si no hay ajuste).
 */
function netAdjProyecto(string $proyecto, string $feeder, array $meses): array
{
    $feederU = strtoupper(trim($feeder));
    $adj     = array_fill_keys($meses, 0.0);
    foreach (tablaTransferencias($proyecto) as $t) {
        $mam = $t['tabla_mam'] ?? [];
        if (!$mam) continue;
        $esDest = strtoupper(trim((string)($t['nombre_dest'] ?? ''))) === $feederU;
        $esOrig = strtoupper(trim((string)($t['origen'] ?? '')))      === $feederU;
        if (!$esDest && !$esOrig) continue;
        foreach ($mam as $r) {
            $m = $r['mes'] ?? '';
            if (!array_key_exists($m, $adj)) continue;
            if ($esDest) $adj[$m] += (float)($r['I_dest_despues'] ?? 0) - (float)($r['I_dest_antes'] ?? 0);
            if ($esOrig) $adj[$m] -= (float)($r['I_orig_antes'] ?? 0) - (float)($r['I_orig_despues'] ?? 0);
        }
    }
    return array_map(fn($v) => round($v, 2), $adj);
}

/**
 * Alimentadores tocados por el proyecto (como origen o destino), con su CN (recuperado de
 * cn_orig/cn_dest) y roles. Orden de aparición: origen del 1er traspaso, luego destinos.
 *
 * @return array [ ['nombre'=>string, 'cn'=>float|null, 'roles'=>array], ... ]
 */
function feedersTocados(string $proyecto): array
{
    $orden = [];
    $info  = [];
    $push = function (?string $nom, string $rol, ?float $cn) use (&$orden, &$info): void {
        $nom = trim((string)$nom);
        if ($nom === '') return;
        $key = strtoupper($nom);
        if (!isset($info[$key])) { $info[$key] = ['nombre' => $nom, 'cn' => null, 'roles' => []]; $orden[] = $key; }
        if (!in_array($rol, $info[$key]['roles'], true)) $info[$key]['roles'][] = $rol;
        if ($cn !== null && $info[$key]['cn'] === null) $info[$key]['cn'] = $cn;
    };
    foreach (tablaTransferencias($proyecto) as $t) {
        $push($t['origen']      ?? '', 'orig', isset($t['cn_orig']) ? (float)$t['cn_orig'] : null);
        $push($t['nombre_dest'] ?? '', 'dest', isset($t['cn_dest']) ? (float)$t['cn_dest'] : null);
    }
    return array_map(fn($k) => $info[$k], $orden);
}

/**
 * Cargabilidad NETA por alimentador tocado por el proyecto, mes a mes: para cada feeder,
 * baseline = demanda BD (existente) o 0 (PUSER nuevo), + netAdjProyecto (cedido/recibido).
 * Reusa helpers de datos (numalimDeNomAlim, obtenerSerieAlim, aplicarAjustes, clasificarMes).
 *
 * @return array [ ['feeder'=>string,'cn'=>float,'rol'=>string,'roles'=>array,
 *                  'tabla'=>[['mes'=>..,'I'=>float|null,'fu'=>float|null,'estado'=>string], ...]], ... ]
 */
function construirTablasNetoProyecto(string $proyecto, array $feederData, array $mesesVista, array $dfAlim, array $dfAb): array
{
    $cnPuser = (float)($feederData['cn'] ?? 0);
    $puserU  = strtoupper(trim((string)($feederData['nombre'] ?? $proyecto)));
    $out     = [];

    foreach (feedersTocados($proyecto) as $f) {
        $nom  = $f['nombre'];
        $adj  = netAdjProyecto($proyecto, $nom, $mesesVista);
        $roles = $f['roles'];

        if (strtoupper($nom) === $puserU) {
            $cn   = $cnPuser;
            $base = array_fill_keys($mesesVista, 0.0);
            $rol  = 'nuevo';
        } else {
            $num      = numalimDeNomAlim($dfAb, $nom);
            $serieRaw = $num ? obtenerSerieAlim($dfAlim, $num) : null;
            $cn       = $serieRaw ? (float)$serieRaw['cn'] : (float)($f['cn'] ?? 0);
            $serie    = $serieRaw ? aplicarAjustes($serieRaw['serie'], 'alim', $num) : [];
            $base     = [];
            foreach ($mesesVista as $m) {
                $base[$m] = (isset($serie[$m]) && is_numeric($serie[$m])) ? (float)$serie[$m] : null;
            }
            $esRec = in_array('dest', $roles, true);
            $esDon = in_array('orig', $roles, true);
            $rol   = ($esRec && $esDon) ? 'mixto' : ($esRec ? 'receptor' : 'donante');
        }

        $tabla = [];
        foreach ($mesesVista as $m) {
            $bi = $base[$m];
            $i  = $bi === null ? null : round($bi + ($adj[$m] ?? 0.0), 1);
            $fu = ($i !== null && $cn > 0) ? round($i / $cn * 100, 1) : null;
            $tabla[] = [
                'mes'    => $m,
                'I'      => $i,
                'fu'     => $fu,
                'estado' => clasificarMes($i, $cn > 0 ? $cn : null),
            ];
        }
        $out[] = ['feeder' => $nom, 'cn' => $cn, 'rol' => $rol, 'roles' => $roles, 'tabla' => $tabla];
    }
    return $out;
}

// ─── Cambios topológicos ──────────────────────────────────────────────────

/**
 * Agrega un cambio topológico al feeder. Retorna el idx asignado.
 * Equivalente a agregar_cambio_topologico() de Python.
 */
function agregarCambioTopologico(string $nombreFeeder, string $descripcion): int
{
    $data    = cargarFeeder($nombreFeeder);
    $cambios = &$data['cambios_topologicos'];
    $idx     = (empty($cambios) ? 0 : max(array_column($cambios, 'idx'))) + 1;
    $cambios[] = [
        'idx'         => $idx,
        'fecha'       => date('Y-m-d'),
        'descripcion' => trim($descripcion),
    ];
    _memGuardarJson(_memPathFeeder($nombreFeeder), $data);
    return $idx;
}

/**
 * Elimina un cambio topológico por su índice.
 * Equivalente a eliminar_cambio_topologico() de Python.
 */
function eliminarCambioTopologico(string $nombreFeeder, int $idx): void
{
    $data    = cargarFeeder($nombreFeeder);
    $cambios = $data['cambios_topologicos'] ?? [];

    $existe = false;
    foreach ($cambios as $c) {
        if ($c['idx'] === $idx) { $existe = true; break; }
    }
    if (!$existe) {
        throw new RuntimeException("Cambio topológico $idx no existe.");
    }

    $data['cambios_topologicos'] = array_values(
        array_filter($cambios, fn($c) => $c['idx'] !== $idx)
    );
    _memGuardarJson(_memPathFeeder($nombreFeeder), $data);
}

// ─── Helpers JSON ─────────────────────────────────────────────────────────

function _memCargarJson(string $path): array
{
    $raw = file_get_contents($path);
    if ($raw === false) throw new RuntimeException("No se pudo leer: $path");
    return (array) json_decode($raw, associative: true, flags: JSON_THROW_ON_ERROR);
}

function _memGuardarJson(string $path, array $data): void
{
    $json = json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR
    );
    if (file_put_contents($path, $json, LOCK_EX) === false) {
        throw new RuntimeException("No se pudo escribir: $path");
    }
}
