<?php
declare(strict_types=1);

/**
 * Datos.php — Carga y normalización de las tres fuentes de datos.
 *
 * Equivalente PHP de traspaso/datos.py.
 *
 * Fuentes MySQL (meyg):
 *   maniobras_rapidas_aguas_abajo → cargarAguasAbajo()   → array plano de filas
 *   dem_maximas                   → cargarDemandas()[0]  → array wide keyed by numalim
 *   dem_maximas_trafos            → cargarDemandas()[1]  → array wide keyed by numalim
 *
 * Caché: PHP serialize en data/cache/ (más rápido que JSON para arrays grandes).
 *   TTL aguas_abajo : 7 días   (~285k filas)
 *   TTL demandas    : 30 días  (~500 alimentadores / ~90 trafos)
 */

// ─── Rutas y constantes ───────────────────────────────────────────────────

define('D_BASE',  dirname(__DIR__));
define('D_CACHE', D_BASE . '/data/cache');
define('D_CFG',   D_BASE . '/config.php');

const TTL_AB         = 604800;   // 7 días en segundos
const TTL_DEM        = 2592000;  // 30 días en segundos
const TIPOS_INVERSION = ['DBC', 'REC', 'RTS'];

@mkdir(D_CACHE, 0755, true);

// ─── Conexión PDO ─────────────────────────────────────────────────────────

function datosConectar(): PDO
{
    $cfg = require D_CFG;
    $c   = $cfg['mysql_cuadrilla'];
    $dsn = "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']};connect_timeout=20";
    return new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        Pdo\Mysql::ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
}

// ─── Caché (PHP serialize — equivalente al PKL de Python) ─────────────────

function _cacheRuta(string $key): string
{
    return D_CACHE . "/{$key}.ser";
}

function _cacheValida(string $key, int $ttl): bool
{
    $f = _cacheRuta($key);
    return file_exists($f) && (time() - filemtime($f)) < $ttl;
}

function _cacheCargar(string $key): mixed
{
    return unserialize(file_get_contents(_cacheRuta($key)));
}

function _cacheGuardar(string $key, mixed $data): void
{
    file_put_contents(_cacheRuta($key), serialize($data));
}

// ─── Helpers internos ─────────────────────────────────────────────────────

/**
 * Strip acentos + lowercase + espacios→guion_bajo.
 * Equivalente a _norm_col() de Python.
 */
function _normCol(string $s): string
{
    static $from = ['á','é','í','ó','ú','ü','ñ','Á','É','Í','Ó','Ú','Ü','Ñ',
                    'à','è','ì','ò','ù','â','ê','î','ô','û'];
    static $to   = ['a','e','i','o','u','u','n','a','e','i','o','u','u','n',
                    'a','e','i','o','u','a','e','i','o','u'];
    $s = str_replace($from, $to, $s);
    $s = mb_strtolower(trim($s), 'UTF-8');
    return (string) preg_replace('/\s+/', '_', $s);
}

/**
 * Normaliza distintos formatos de mes a 'YYYY-MM'.
 * Acepta: DateTime, "YYYY-MM", "dic-19", "YYYY-MM-DD".
 * Equivalente a _mes_a_yyyy_mm() de Python.
 */
function normalizarMes(mixed $v): ?string
{
    if ($v instanceof DateTime) return $v->format('Y-m');
    $s = trim(strtolower((string) $v));
    if (preg_match('/^\d{4}-\d{2}$/', $s)) return $s;
    // "dic-19", "ene-20"
    if (preg_match('/^(\w{3})-(\d{2})$/', $s, $m)) {
        static $mapa = [
            'ene'=>'01','feb'=>'02','mar'=>'03','abr'=>'04','may'=>'05','jun'=>'06',
            'jul'=>'07','ago'=>'08','sep'=>'09','oct'=>'10','nov'=>'11','dic'=>'12',
        ];
        $mm = $mapa[$m[1]] ?? null;
        if (!$mm) return null;
        $yyyy = (int)$m[2] < 70 ? "20{$m[2]}" : "19{$m[2]}";
        return "{$yyyy}-{$mm}";
    }
    // "YYYY-MM-DD" u otros con prefijo YYYY-MM
    if (preg_match('/^(\d{4})-(\d{2})/', $s, $m)) return "{$m[1]}-{$m[2]}";
    return null;
}

/**
 * Quita el prefijo "Alim." o "Alimentador." del nombre.
 * Equivalente a _nom_rapida_de_alim() de Python.
 */
function _nomRapidaDeAlim(string $nombre): string
{
    return (string) preg_replace('/^(Alim\.?\s+|Alimentador\.?\s+)/i', '', trim($nombre));
}

/**
 * Normaliza y limpia las filas de aguas_abajo provenientes de MySQL:
 * - Renombra columnas con _normCol()
 * - Convierte potencia a float (maneja coma decimal y espacios NBSP)
 * - Unifica columna clientes (acepta cnt_clie o clientes)
 * - Trim strings, lowercase nombre_equip, cast numalim a int
 * - Descarta filas sin numpos_td
 */
function _normalizarFilasAb(array $rows): array
{
    if (!$rows) return [];

    // Mapa de claves originales → normalizadas (se calcula una sola vez)
    $colMap = [];
    foreach (array_keys(reset($rows)) as $col) {
        $colMap[$col] = _normCol($col);
    }

    $result = [];
    foreach ($rows as $row) {
        $r = [];
        foreach ($row as $k => $v) {
            $r[$colMap[$k]] = $v;
        }

        // potencia → float (maneja coma como decimal y espacios normales/NBSP)
        if (array_key_exists('potencia', $r)) {
            $p = str_replace([' ', "\xc2\xa0", ','], ['', '', '.'], (string)($r['potencia'] ?? ''));
            $r['potencia'] = is_numeric($p) ? (float)$p : null;
        }

        // clientes — acepta cnt_clie o clientes como nombre de columna
        if (array_key_exists('cnt_clie', $r)) {
            $r['clientes'] = is_numeric($r['cnt_clie']) ? (int)$r['cnt_clie'] : 0;
        } elseif (array_key_exists('clientes', $r)) {
            $r['clientes'] = is_numeric($r['clientes']) ? (int)$r['clientes'] : 0;
        } else {
            $r['clientes'] = 0;
        }

        // Trim campos de texto
        foreach (['nom_alim', 'nombre', 'numpos_td', 'numpos_equip', 'ramasc_equip', 'estado_basal'] as $c) {
            if (isset($r[$c])) $r[$c] = trim((string)$r[$c]);
        }

        // nombre_equip: lowercase + trim (Python lo guarda en minúsculas)
        if (isset($r['nombre_equip'])) {
            $r['nombre_equip'] = strtolower(trim((string)$r['nombre_equip']));
        }

        // numalim → int|null
        if (array_key_exists('numalim', $r)) {
            $r['numalim'] = is_numeric($r['numalim']) ? (int)$r['numalim'] : null;
        }

        // Descartar filas sin numpos_td (equivalente a dropna(subset=['numpos_td']))
        if (!isset($r['numpos_td']) || $r['numpos_td'] === '') continue;

        $result[] = $r;
    }
    return $result;
}

// ─── Pivot long → wide ────────────────────────────────────────────────────

/**
 * Pivota dem_maximas (long) a wide keyed by numalim.
 *
 * Entrada : filas con columnas NUMALIM, SUBESTACION, ALIMENTADOR, CN, CE, MAXIMA, MES
 * Salida  : [numalim => ['numalim','subestacion','barra_alim','nom_rapida','cn','ce','YYYY-MM'...]]
 *
 * aggfunc = max: si hay duplicados para el mismo numalim+mes, conserva el mayor.
 * Columnas de mes uniformes en todas las filas (null donde no hay dato).
 *
 * Equivalente a _pivotar_alim() de Python.
 */
function pivotarAlim(array $rows): array
{
    $meta     = [];
    $pivot    = [];
    $allMeses = [];

    foreach ($rows as $raw) {
        $r  = array_change_key_case($raw, CASE_UPPER);
        $nm = isset($r['NUMALIM']) && is_numeric($r['NUMALIM']) ? (int)$r['NUMALIM'] : null;
        if ($nm === null) continue;
        $mes = normalizarMes($r['MES'] ?? null);
        if (!$mes) continue;

        if (!isset($meta[$nm])) {
            $alim = trim((string)($r['ALIMENTADOR'] ?? ''));
            $meta[$nm] = [
                'numalim'    => $nm,
                'subestacion'=> trim((string)($r['SUBESTACION'] ?? '')),
                'barra_alim' => $alim,
                'nom_rapida' => _nomRapidaDeAlim($alim),
                'cn'         => is_numeric($r['CN']  ?? null) ? (float)$r['CN']  : null,
                'ce'         => is_numeric($r['CE']  ?? null) ? (float)$r['CE']  : null,
            ];
        }

        $allMeses[$mes] = true;
        $v = is_numeric($r['MAXIMA'] ?? null) ? (float)$r['MAXIMA'] : null;
        if ($v !== null && (!array_key_exists($mes, $pivot[$nm] ?? []) || $v > $pivot[$nm][$mes])) {
            $pivot[$nm][$mes] = $v;
        } elseif (!array_key_exists($mes, $pivot[$nm] ?? [])) {
            $pivot[$nm][$mes] = null;
        }
    }

    $meses = array_keys($allMeses);
    sort($meses);

    $result = [];
    foreach ($meta as $nm => $m) {
        $mesData = [];
        foreach ($meses as $mes) {
            $mesData[$mes] = $pivot[$nm][$mes] ?? null;
        }
        $result[$nm] = array_merge($m, $mesData);
    }
    return $result;
}

/**
 * Pivota dem_maximas_trafos (long) a wide keyed by numalim.
 *
 * Entrada : filas con columnas NUMALIM, ALIMENTADOR, BARRA, CN, CE, CORRIENTE, MES
 * Salida  : [numalim => ['numalim','barra_alim','barra','cn','ce','YYYY-MM'...]]
 *
 * Equivalente a _pivotar_trafos() de Python.
 */
function pivotarTrafos(array $rows): array
{
    $meta     = [];
    $pivot    = [];
    $allMeses = [];

    foreach ($rows as $raw) {
        $r  = array_change_key_case($raw, CASE_UPPER);
        $nm = isset($r['NUMALIM']) && is_numeric($r['NUMALIM']) ? (int)$r['NUMALIM'] : null;
        if ($nm === null) continue;
        $mes = normalizarMes($r['MES'] ?? null);
        if (!$mes) continue;

        if (!isset($meta[$nm])) {
            $meta[$nm] = [
                'numalim'   => $nm,
                'barra_alim'=> trim((string)($r['ALIMENTADOR'] ?? '')),
                'barra'     => trim((string)($r['BARRA']       ?? '')),
                'cn'        => is_numeric($r['CN']  ?? null) ? (float)$r['CN']  : null,
                'ce'        => is_numeric($r['CE']  ?? null) ? (float)$r['CE']  : null,
            ];
        }

        $allMeses[$mes] = true;
        $v = is_numeric($r['CORRIENTE'] ?? null) ? (float)$r['CORRIENTE'] : null;
        if ($v !== null && (!array_key_exists($mes, $pivot[$nm] ?? []) || $v > $pivot[$nm][$mes])) {
            $pivot[$nm][$mes] = $v;
        } elseif (!array_key_exists($mes, $pivot[$nm] ?? [])) {
            $pivot[$nm][$mes] = null;
        }
    }

    $meses = array_keys($allMeses);
    sort($meses);

    $result = [];
    foreach ($meta as $nm => $m) {
        $mesData = [];
        foreach ($meses as $mes) {
            $mesData[$mes] = $pivot[$nm][$mes] ?? null;
        }
        $result[$nm] = array_merge($m, $mesData);
    }
    return $result;
}

// ─── Carga principal ──────────────────────────────────────────────────────

/**
 * Carga meyg.maniobras_rapidas_aguas_abajo desde MySQL (o caché serializada).
 *
 * Retorna array plano de filas con claves normalizadas:
 *   nom_alim, nombre, numpos_td, potencia, clientes,
 *   nombre_equip, numpos_equip, ramasc_equip, estado_basal, numalim
 *
 * TTL caché: 7 días.
 * Equivalente a cargar_aguas_abajo_sql() de Python.
 */
function cargarAguasAbajo(bool $force = false): array
{
    $key = 'aguas_abajo_sql';
    if (!$force && _cacheValida($key, TTL_AB)) {
        error_log("[INFO] aguas_abajo: cargando desde caché...");
        return _cacheCargar($key);
    }

    error_log("[INFO] aguas_abajo: consultando MySQL...");
    $pdo  = datosConectar();
    $stmt = $pdo->query("SELECT * FROM meyg.maniobras_rapidas_aguas_abajo");
    unset($pdo); // Liberar conexión antes de procesar

    // Procesar fila a fila con fetch() para evitar tener fetchAll + copia normalizada
    // en memoria al mismo tiempo (doble consumo que agotaba el límite con 285k filas)
    $colMap = null;
    $data   = [];

    while ($raw = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Mapa de columnas originales → normalizadas (se construye solo una vez)
        if ($colMap === null) {
            $colMap = [];
            foreach (array_keys($raw) as $col) {
                $colMap[$col] = _normCol($col);
            }
        }

        $r = [];
        foreach ($raw as $k => $v) {
            $r[$colMap[$k]] = $v;
        }

        // potencia → float (maneja coma decimal y espacios NBSP)
        if (array_key_exists('potencia', $r)) {
            $p = str_replace([' ', "\xc2\xa0", ','], ['', '', '.'], (string)($r['potencia'] ?? ''));
            $r['potencia'] = is_numeric($p) ? (float)$p : null;
        }

        // clientes — acepta cnt_clie o clientes como nombre de columna
        if (array_key_exists('cnt_clie', $r)) {
            $r['clientes'] = is_numeric($r['cnt_clie']) ? (int)$r['cnt_clie'] : 0;
        } elseif (array_key_exists('clientes', $r)) {
            $r['clientes'] = is_numeric($r['clientes']) ? (int)$r['clientes'] : 0;
        } else {
            $r['clientes'] = 0;
        }

        // Trim campos de texto
        foreach (['nom_alim', 'nombre', 'numpos_td', 'numpos_equip', 'ramasc_equip', 'estado_basal'] as $c) {
            if (isset($r[$c])) $r[$c] = trim((string)$r[$c]);
        }

        // nombre_equip: lowercase + trim
        if (isset($r['nombre_equip'])) {
            $r['nombre_equip'] = strtolower(trim((string)$r['nombre_equip']));
        }

        // numalim → int|null
        if (array_key_exists('numalim', $r)) {
            $r['numalim'] = is_numeric($r['numalim']) ? (int)$r['numalim'] : null;
        }

        // Descartar filas sin numpos_td
        if (!isset($r['numpos_td']) || $r['numpos_td'] === '') continue;

        $data[] = $r;
    }
    unset($stmt);

    _cacheGuardar($key, $data);
    error_log("[INFO] aguas_abajo: " . number_format(count($data)) . " filas cargadas. Caché guardada.");
    return $data;
}

/**
 * Carga meyg.dem_maximas y meyg.dem_maximas_trafos desde MySQL (o caché).
 *
 * Retorna [$dfAlim, $dfTrafo], ambos arrays asociativos keyed por numalim (int)
 * en formato wide (columnas = YYYY-MM).
 *
 * TTL caché: 30 días.
 * Equivalente a cargar_demandas_sql() de Python.
 */
function cargarDemandas(bool $force = false): array
{
    $key = 'demandas_sql';
    if (!$force && _cacheValida($key, TTL_DEM)) {
        error_log("[INFO] demandas: cargando desde caché...");
        return _cacheCargar($key);
    }

    error_log("[INFO] demandas: consultando MySQL...");
    $pdo = datosConectar();

    $rowsAlim  = $pdo->query("SELECT * FROM meyg.dem_maximas")->fetchAll();
    $rowsTrafo = $pdo->query("SELECT * FROM meyg.dem_maximas_trafos")->fetchAll();
    unset($pdo);

    $dfAlim  = pivotarAlim($rowsAlim);
    $dfTrafo = pivotarTrafos($rowsTrafo);

    $result = [$dfAlim, $dfTrafo];
    _cacheGuardar($key, $result);
    error_log("[INFO] demandas: " . count($dfAlim) . " alimentadores, " . count($dfTrafo) . " trafos. Caché guardada.");
    return $result;
}

// ─── Helpers de topología (aguas_abajo) ───────────────────────────────────

/**
 * TDs únicos de un alimentador (filas con nombre_equip = 'cabecera').
 * Equivalente a tds_de_feeder() de Python.
 */
function tdsDeFeeder(array $dfAb, string $nomAlim): array
{
    $nomUp  = strtoupper(trim($nomAlim));
    $seen   = [];
    $result = [];
    foreach ($dfAb as $row) {
        if (strtoupper($row['nom_alim'] ?? '') !== $nomUp) continue;
        if (($row['nombre_equip'] ?? '') !== 'cabecera') continue;
        $td = $row['numpos_td'];
        if (isset($seen[$td])) continue;
        $seen[$td] = true;
        $result[] = $row;
    }
    return $result;
}

/**
 * TDs únicos aguas abajo de un equipo (por nombre o por numpos).
 * Equivalente a tds_de_equipo() de Python.
 */
function tdsDeEquipo(array $dfAb, ?string $nombreEquip = null, ?string $numposEquip = null): array
{
    if ($nombreEquip === null && $numposEquip === null)
        throw new InvalidArgumentException("Debe indicar nombreEquip o numposEquip");

    $seen   = [];
    $result = [];
    foreach ($dfAb as $row) {
        $match = $nombreEquip !== null
            ? strtoupper($row['nombre_equip'] ?? '') === strtoupper(trim($nombreEquip))
            : trim($row['numpos_equip'] ?? '') === trim($numposEquip);
        if (!$match) continue;
        $td = $row['numpos_td'];
        if (isset($seen[$td])) continue;
        $seen[$td] = true;
        $result[] = $row;
    }
    return $result;
}

/**
 * TDs a partir de una lista manual de numpos_td.
 * Equivalente a tds_seleccionados() de Python.
 */
function tdsSeleccionados(array $dfAb, array $listaNumpos): array
{
    $set    = array_flip(array_map('trim', array_map('strval', $listaNumpos)));
    $seen   = [];
    $result = [];
    foreach ($dfAb as $row) {
        $td = $row['numpos_td'];
        if (!isset($set[$td]) || isset($seen[$td])) continue;
        $seen[$td] = true;
        $result[] = $row;
    }
    return $result;
}

/**
 * Equipos unidireccionales (DBC, REC, RTS) dentro de la isla a traspasar.
 * Estos equipos pueden tener inversión de flujo al recibir corriente desde
 * la dirección opuesta a su instalación habitual.
 * Equivalente a equipos_en_isla() de Python.
 */
function equiposEnIsla(array $dfAb, array $tds, string $equipoRaiz, string $nomAlim): array
{
    if (!$tds || $equipoRaiz === '') return [];

    $numposSet = array_flip(array_map('trim', array_column($tds, 'numpos_td')));
    $raizNorm  = strtoupper(trim($equipoRaiz));
    $nomAlimUp = strtoupper(trim($nomAlim));
    $vistos    = [];
    $resultado = [];

    foreach ($dfAb as $row) {
        if (strtoupper($row['nom_alim'] ?? '') !== $nomAlimUp) continue;
        if (!isset($numposSet[trim($row['numpos_td'] ?? '')])) continue;
        if (($row['nombre_equip'] ?? '') === 'cabecera') continue;
        $nombre = strtoupper($row['nombre_equip'] ?? '');
        if ($nombre === $raizNorm || isset($vistos[$nombre])) continue;
        $vistos[$nombre] = true;
        $tipo = null;
        foreach (TIPOS_INVERSION as $t) {
            if (str_starts_with($nombre, $t)) { $tipo = $t; break; }
        }
        if ($tipo !== null) $resultado[] = ['nombre' => $nombre, 'tipo' => $tipo];
    }
    usort($resultado, fn($a, $b) => strcmp($a['nombre'], $b['nombre']));
    return $resultado;
}

/**
 * kVA total instalado de un alimentador (suma de TDs únicos de cabecera).
 * Equivalente a kva_total_feeder() de Python.
 */
function kvaTotalFeeder(array $dfAb, string $nomAlim): float
{
    return (float) array_sum(array_map(
        fn($r) => (float)($r['potencia'] ?? 0),
        tdsDeFeeder($dfAb, $nomAlim)
    ));
}

/**
 * Lista de equipos únicos (seccionadores/RTBs) de un alimentador.
 * Equivalente a equipos_de_feeder() de Python.
 */
function equiposDeFeeder(array $dfAb, string $nomAlim): array
{
    $nomUp  = strtoupper(trim($nomAlim));
    $seen   = [];
    $result = [];
    foreach ($dfAb as $row) {
        if (strtoupper($row['nom_alim'] ?? '') !== $nomUp) continue;
        if (($row['nombre_equip'] ?? '') === 'cabecera') continue;
        $ne = $row['nombre_equip'];
        if (isset($seen[$ne])) continue;
        $seen[$ne] = true;
        $result[] = [
            'nombre_equip' => $ne,
            'numpos_equip' => trim($row['numpos_equip'] ?? ''),
            'ramasc_equip' => trim($row['ramasc_equip'] ?? ''),
        ];
    }
    usort($result, fn($a, $b) => strcmp($a['nombre_equip'], $b['nombre_equip']));
    return $result;
}

// ─── Helpers de demandas ──────────────────────────────────────────────────

/**
 * Lista ordenada de meses 'YYYY-MM' presentes en dfAlim o dfTrafo.
 * Equivalente a meses_disponibles() de Python.
 */
function mesesDisponibles(array $df): array
{
    $first = reset($df);
    if (!$first) return [];
    $meses = [];
    foreach (array_keys($first) as $k) {
        if (preg_match('/^\d{4}-\d{2}$/', (string)$k)) $meses[] = $k;
    }
    sort($meses);
    return $meses;
}

/**
 * Fila del trafo asociado a un numalim.
 * Equivalente a trafo_de_feeder() de Python.
 */
function trafoDeFeeder(array $dfTrafo, int $numalim): ?array
{
    return $dfTrafo[$numalim] ?? null;
}

/**
 * Serie mensual y CN de un alimentador por numalim.
 *
 * Retorna: ['serie' => ['YYYY-MM' => float|null, ...], 'cn' => float|NAN]
 * Equivalente a obtener_serie_alim() de Python.
 */
function obtenerSerieAlim(array $dfAlim, int $numalim): array
{
    $row = $dfAlim[$numalim] ?? null;
    if (!$row) throw new RuntimeException("NUMALIM $numalim no encontrado en dfAlim");

    $serie = [];
    foreach ($row as $k => $v) {
        if (preg_match('/^\d{4}-\d{2}$/', (string)$k)) {
            $serie[$k] = is_numeric($v) ? (float)$v : null;
        }
    }
    $cn = isset($row['cn']) && is_numeric($row['cn']) ? (float)$row['cn'] : NAN;
    return ['serie' => $serie, 'cn' => $cn];
}

/**
 * Retorna el numalim de un alimentador a partir de su nom_alim (de aguas_abajo).
 * Equivalente a numalim_de_nom_alim() de Python.
 */
function numalimDeNomAlim(array $dfAb, string $nomAlim): ?int
{
    $nomUp = strtoupper(trim($nomAlim));
    foreach ($dfAb as $row) {
        if (strtoupper($row['nom_alim'] ?? '') === $nomUp && isset($row['numalim'])) {
            return (int)$row['numalim'];
        }
    }
    return null;
}

/**
 * Nombre legible de un alimentador para mostrar en pantalla.
 * Prioridad: nom_rapida → barra_alim → numalim.
 * Equivalente a nombre_display_alim() de Python.
 */
function nombreDisplayAlim(array $row): string
{
    $rap = trim((string)($row['nom_rapida'] ?? ''));
    if ($rap !== '' && !in_array(strtolower($rap), ['nan', 'none'])) return $rap;
    $bar = trim((string)($row['barra_alim'] ?? ''));
    if ($bar !== '' && !in_array(strtolower($bar), ['nan', 'none'])) return $bar;
    return isset($row['numalim']) ? (string)$row['numalim'] : '—';
}
