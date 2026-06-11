<?php
declare(strict_types=1);

/**
 * Simulacion.php — Lógica de cálculo del traspaso de carga.
 *
 * Equivalente PHP de traspaso/simulacion.py.
 *
 * Flujo principal:
 *  1. infoIsla()      → kVA_isla, kVA_feeder, p (fracción)
 *  2. calcularDelta() → delta_max (A), mes_peor
 *  3. simular()       → tabla mensual escenario conservador (delta fijo)
 *  4. simularMesAMes()→ tabla mensual escenario proporcional (delta × p por mes)
 *  5. analizarTrafo() → impacto sobre el transformador de potencia
 *  6. resumenEstados()→ conteo viable/prealerta/critico + mes más crítico
 *
 * Tipos clave:
 *   $serie = ['YYYY-MM' => float|null, ...]   (equivalente a pd.Series con índice de meses)
 *   $trafoRow = ['cn' => float, 'YYYY-MM' => float|null, ...]
 */

// ─── Helpers internos ─────────────────────────────────────────────────────

/** Equivalente a pd.isna() sobre un valor escalar. */
function _simIsNan(mixed $v): bool
{
    return $v === null || (is_float($v) && is_nan($v));
}

/** Calcula porcentaje de uso: round(v / cn * 100, 1). Retorna null si no hay datos. */
function _simPct(float|null $v, float|null $cn): float|null
{
    if ($v === null || $cn === null || $cn <= 0.0) return null;
    return round($v / $cn * 100.0, 1);
}

/**
 * Une y realinea dos series de meses.
 * Equivalente a series.reindex(idx.union()) de Python.
 *
 * Retorna [$orig, $dest, $meses] donde $meses es la lista ordenada de todos los meses.
 */
function _simReindexar(array $serieOrig, array $serieDest): array
{
    $meses = array_values(array_unique(array_merge(array_keys($serieOrig), array_keys($serieDest))));
    sort($meses);

    $orig = [];
    $dest = [];
    foreach ($meses as $mes) {
        $orig[$mes] = isset($serieOrig[$mes]) && is_numeric($serieOrig[$mes])
            ? (float)$serieOrig[$mes] : null;
        $dest[$mes] = isset($serieDest[$mes]) && is_numeric($serieDest[$mes])
            ? (float)$serieDest[$mes] : null;
    }
    return [$orig, $dest, $meses];
}

// ─── Info de isla ─────────────────────────────────────────────────────────

/**
 * Calcula kVA_isla, kVA_feeder, p y metadata de los TDs a traspasar.
 *
 * @param array  $tds           Filas de TDs a traspasar (de tdsDeEquipo / tdsSeleccionados)
 * @param string $nomAlimOrigen Nombre del alimentador origen
 * @param array  $dfAb          Topología completa (de cargarAguasAbajo)
 * @return array {kva_isla, kva_feeder, p, p_pct, n_td, clientes, nom_alim_ref, detalle_tds}
 *
 * Equivalente a info_isla() de Python.
 */
function infoIsla(array $tds, string $nomAlimOrigen, array $dfAb): array
{
    if (!$tds) throw new RuntimeException("La isla de TDs está vacía.");

    $kvaIsla = 0.0;
    $clientes = 0;
    $nomAlimRef = [];
    $detalleTds = [];
    $numposSeen = [];

    foreach ($tds as $row) {
        $td = $row['numpos_td'] ?? '';
        if (isset($numposSeen[$td])) continue;
        $numposSeen[$td] = true;

        $kvaIsla  += (float)($row['potencia']  ?? 0);
        $clientes += (int)($row['clientes']    ?? 0);
        $nom       = $row['nom_alim'] ?? '';
        if ($nom !== '' && !in_array($nom, $nomAlimRef)) $nomAlimRef[] = $nom;
        $detalleTds[] = [
            'numpos_td' => $td,
            'nombre'    => $row['nombre']   ?? '',
            'potencia'  => $row['potencia'] ?? null,
            'clientes'  => $row['clientes'] ?? 0,
            'nom_alim'  => $nom,
        ];
    }

    $kvaFeeder = kvaTotalFeeder($dfAb, $nomAlimOrigen);
    if ($kvaFeeder <= 0) {
        throw new RuntimeException(
            "No se pudo calcular kVA total del alimentador '$nomAlimOrigen'. " .
            "Verificar que existe en aguas_abajo con filas 'cabecera'."
        );
    }

    $p = $kvaIsla / $kvaFeeder;

    return [
        'kva_isla'    => round($kvaIsla,   1),
        'kva_feeder'  => round($kvaFeeder, 1),
        'p'           => round($p, 6),
        'p_pct'       => round($p * 100.0, 2),
        'n_td'        => count($numposSeen),
        'clientes'    => $clientes,
        'nom_alim_ref'=> $nomAlimRef,
        'detalle_tds' => $detalleTds,
    ];
}

// ─── Cálculo del delta ────────────────────────────────────────────────────

/**
 * Calcula el delta de corriente a traspasar sobre los meses válidos de la serie origen.
 *
 * @param array $serieOrigen ['YYYY-MM' => float|null, ...]
 * @param float $p           Fracción de carga (0..1)
 * @return array {delta_max, mes_peor, serie_deltas, p_pct}
 *
 * Equivalente a calcular_delta() de Python.
 */
function calcularDelta(array $serieOrigen, float $p): array
{
    // Solo meses con valores válidos (equivalente a dropna())
    $serieValida = array_filter(
        $serieOrigen,
        fn($v) => $v !== null && is_numeric($v)
    );

    if (!$serieValida) {
        throw new RuntimeException("La serie del alimentador origen no tiene datos válidos.");
    }

    $serieDeltas = [];
    foreach ($serieValida as $mes => $v) {
        $serieDeltas[$mes] = round((float)$v * $p, 2);
    }

    $deltaMax = max($serieDeltas);
    $mesPeor  = (string) array_search($deltaMax, $serieDeltas);

    return [
        'delta_max'    => round($deltaMax, 2),
        'mes_peor'     => $mesPeor,
        'serie_deltas' => $serieDeltas,
        'p_pct'        => round($p * 100.0, 2),
    ];
}

// ─── Clasificación mensual ────────────────────────────────────────────────

/**
 * Clasifica un mes según el uso del destino post-traspaso.
 *
 * Retorna: 'viable' | 'prealerta' | 'critico' | 'sin_datos'
 * Equivalente a clasificar_mes() de Python.
 */
function clasificarMes(float|null $iPost, float|null $cn, float $umbral = 0.90): string
{
    if (_simIsNan($iPost) || _simIsNan($cn) || $cn <= 0.0) return 'sin_datos';
    $ratio = $iPost / $cn;
    if ($ratio >= 1.0)     return 'critico';
    if ($ratio >= $umbral) return 'prealerta';
    return 'viable';
}

// ─── Simulación mensual — escenario conservador ───────────────────────────

/**
 * Simula el efecto mensual del traspaso con delta fijo (peor caso).
 *
 * @param array      $serieOrigen  ['YYYY-MM' => float|null] — picos ORIGEN antes del traspaso
 * @param array      $serieDestino ['YYYY-MM' => float|null] — picos DESTINO (0s si feeder nuevo)
 * @param float|null $cnOrigen     Corriente nominal ORIGEN (A)
 * @param float|null $cnDestino    Corriente nominal DESTINO (A)
 * @param float      $deltaMax     Delta fijo a aplicar (A)
 * @return array     Tabla mensual con columnas:
 *                   mes, I_orig_antes, I_orig_despues, uso_orig_antes_pct, uso_orig_despues_pct,
 *                   I_dest_antes, I_dest_despues, uso_dest_antes_pct, uso_dest_despues_pct, estado_dest
 *
 * Equivalente a simular() de Python.
 */
function simular(
    array      $serieOrigen,
    array      $serieDestino,
    float|null $cnOrigen,
    float|null $cnDestino,
    float      $deltaMax,
    float      $umbral = 0.90,
): array {
    [$orig, $dest, $meses] = _simReindexar($serieOrigen, $serieDestino);

    $tabla = [];
    foreach ($meses as $mes) {
        $iOA = $orig[$mes];    // I origen antes
        $iDA = $dest[$mes];    // I destino antes

        $iOD = $iOA !== null ? max(0.0, round($iOA - $deltaMax, 1)) : null;  // origen después
        $iDD = $iDA !== null ? round($iDA + $deltaMax, 1)           : null;  // destino después

        $tabla[] = [
            'mes'                  => $mes,
            'I_orig_antes'         => $iOA !== null ? round($iOA, 1) : null,
            'I_orig_despues'       => $iOD,
            'uso_orig_antes_pct'   => _simPct($iOA, $cnOrigen),
            'uso_orig_despues_pct' => _simPct($iOD, $cnOrigen),
            'I_dest_antes'         => $iDA !== null ? round($iDA, 1) : null,
            'I_dest_despues'       => $iDD,
            'uso_dest_antes_pct'   => _simPct($iDA, $cnDestino),
            'uso_dest_despues_pct' => _simPct($iDD, $cnDestino),
            'estado_dest'          => clasificarMes($iDD, $cnDestino, $umbral),
        ];
    }
    return $tabla;
}

// ─── Simulación mensual — escenario mes a mes ─────────────────────────────

/**
 * Simula el traspaso con delta proporcional por mes (I_orig[mes] × p).
 * Genera el perfil de demanda realista en vez del peor caso fijo.
 *
 * Mismas columnas de salida que simular().
 * Equivalente a simular_mes_a_mes() de Python.
 */
function simularMesAMes(
    array      $serieOrigen,
    array      $serieDestino,
    float|null $cnOrigen,
    float|null $cnDestino,
    float      $p,
    float      $umbral = 0.90,
): array {
    [$orig, $dest, $meses] = _simReindexar($serieOrigen, $serieDestino);

    $tabla = [];
    foreach ($meses as $mes) {
        $iOA   = $orig[$mes];
        $iDA   = $dest[$mes];
        // null cuando origen no tiene datos: propaga incertidumbre al destino (igual que NaN en pandas)
        $delta = $iOA !== null ? $iOA * $p : null;

        $iOD = $iOA !== null ? max(0.0, round($iOA - $delta, 1)) : null;
        $iDD = ($iDA !== null && $delta !== null) ? round($iDA + $delta, 1) : null;

        $tabla[] = [
            'mes'                  => $mes,
            'I_orig_antes'         => $iOA !== null ? round($iOA, 1) : null,
            'I_orig_despues'       => $iOD,
            'uso_orig_antes_pct'   => _simPct($iOA, $cnOrigen),
            'uso_orig_despues_pct' => _simPct($iOD, $cnOrigen),
            'I_dest_antes'         => $iDA !== null ? round($iDA, 1) : null,
            'I_dest_despues'       => $iDD,
            'uso_dest_antes_pct'   => _simPct($iDA, $cnDestino),
            'uso_dest_despues_pct' => _simPct($iDD, $cnDestino),
            'estado_dest'          => clasificarMes($iDD, $cnDestino, $umbral),
        ];
    }
    return $tabla;
}

// ─── Serie vacía para feeder nuevo ────────────────────────────────────────

/**
 * Crea una serie mensual de ceros para un feeder en comisionamiento.
 * Equivalente a serie_vacia() de Python.
 */
function serieVacia(array $meses): array
{
    return array_fill_keys($meses, 0.0);
}

// ─── Análisis del transformador — delta fijo ──────────────────────────────

/**
 * Analiza el impacto del traspaso sobre el transformador de potencia.
 *
 * @param array  $trafoRow    Fila de dfTrafo ['cn' => float, 'YYYY-MM' => float|null, ...]
 * @param float  $deltaA      Magnitud del delta de corriente (A)
 * @param string $modo        'alivio' (origen, saca carga) | 'carga' (destino, agrega carga)
 * @param float  $umbral      Fracción CN para prealerta (default 0.90)
 * @param array  $mesesFiltro Lista YYYY-MM a incluir; vacío = todos
 * @return array {cn_trafo, sin_datos, tabla, resumen, mes_max_uso, pct_max_uso}
 *
 * Equivalente a analizar_trafo() de Python.
 */
function analizarTrafo(
    array  $trafoRow,
    float  $deltaA,
    string $modo    = 'alivio',
    float  $umbral  = 0.90,
    array  $mesesFiltro = [],
): array {
    $cnRaw   = $trafoRow['cn'] ?? null;
    $cnTrafo = is_numeric($cnRaw) ? (float)$cnRaw : NAN;

    // Columnas de mes disponibles en la fila
    $mesCols = array_values(array_filter(
        array_keys($trafoRow),
        fn($k) => preg_match('/^\d{4}-\d{2}$/', (string)$k)
    ));
    if ($mesesFiltro) {
        $filtroSet = array_flip($mesesFiltro);
        $mesCols   = array_values(array_filter($mesCols, fn($m) => isset($filtroSet[$m])));
    }
    if (!$mesCols) {
        return ['cn_trafo'=>null, 'sin_datos'=>true, 'tabla'=>[], 'resumen'=>[],
                'mes_max_uso'=>null, 'pct_max_uso'=>null];
    }

    $registros = [];
    $conteo    = [];

    foreach ($mesCols as $mes) {
        $ant = isset($trafoRow[$mes]) && is_numeric($trafoRow[$mes])
            ? (float)$trafoRow[$mes] : null;

        if ($ant === null) {
            $des = null;
            $est = 'sin_datos';
            $uA  = null;
            $uD  = null;
        } else {
            $des = $modo === 'alivio' ? max(0.0, $ant - $deltaA) : $ant + $deltaA;

            if (is_nan($cnTrafo) || $cnTrafo <= 0.0) {
                $est = 'sin_datos';
                $uA  = null;
                $uD  = null;
            } else {
                $uA  = round($ant / $cnTrafo * 100.0, 1);
                $uD  = round($des / $cnTrafo * 100.0, 1);
                $est = clasificarMes($des, $cnTrafo, $umbral);
            }
        }

        $conteo[$est] = ($conteo[$est] ?? 0) + 1;
        $registros[] = [
            'mes'            => $mes,
            'I_antes'        => $ant !== null ? round($ant, 1) : null,
            'I_despues'      => $des !== null ? round($des, 1) : null,
            'delta'          => round($deltaA, 2),
            'uso_antes_pct'  => $uA,
            'uso_despues_pct'=> $uD,
            'estado'         => $est,
        ];
    }

    // Mes con mayor uso post-traspaso
    $best = null;
    foreach ($registros as $r) {
        if ($r['uso_despues_pct'] !== null &&
            ($best === null || $r['uso_despues_pct'] > $best['uso_despues_pct'])) {
            $best = $r;
        }
    }

    return [
        'cn_trafo'   => !is_nan($cnTrafo) ? $cnTrafo : null,
        'sin_datos'  => false,
        'tabla'      => $registros,
        'resumen'    => $conteo,
        'mes_max_uso'=> $best['mes']             ?? null,
        'pct_max_uso'=> $best['uso_despues_pct'] ?? null,
    ];
}

// ─── Análisis del transformador — delta proporcional (mes a mes) ──────────

/**
 * Analiza el impacto del traspaso sobre el trafo usando delta proporcional por mes.
 *
 * @param array $serieDeltas ['YYYY-MM' => float] — I_orig[mes] × p por cada mes
 *
 * Misma estructura de retorno que analizarTrafo().
 * Equivalente a analizar_trafo_mes_a_mes() de Python.
 */
function analizarTrafoMesAMes(
    array  $trafoRow,
    array  $serieDeltas,
    string $modo    = 'alivio',
    float  $umbral  = 0.90,
    array  $mesesFiltro = [],
): array {
    $cnRaw   = $trafoRow['cn'] ?? null;
    $cnTrafo = is_numeric($cnRaw) ? (float)$cnRaw : NAN;

    $mesCols = array_values(array_filter(
        array_keys($trafoRow),
        fn($k) => preg_match('/^\d{4}-\d{2}$/', (string)$k)
    ));
    if ($mesesFiltro) {
        $filtroSet = array_flip($mesesFiltro);
        $mesCols   = array_values(array_filter($mesCols, fn($m) => isset($filtroSet[$m])));
    }
    if (!$mesCols) {
        return ['cn_trafo'=>null, 'sin_datos'=>true, 'tabla'=>[], 'resumen'=>[],
                'mes_max_uso'=>null, 'pct_max_uso'=>null];
    }

    $registros = [];
    $conteo    = [];

    foreach ($mesCols as $mes) {
        $ant   = isset($trafoRow[$mes]) && is_numeric($trafoRow[$mes])
            ? (float)$trafoRow[$mes] : null;
        $delta = isset($serieDeltas[$mes]) && is_numeric($serieDeltas[$mes])
            ? (float)$serieDeltas[$mes] : 0.0;

        if ($ant === null) {
            $des = null;
            $est = 'sin_datos';
            $uA  = null;
            $uD  = null;
        } else {
            $des = $modo === 'alivio' ? max(0.0, $ant - $delta) : $ant + $delta;

            if (is_nan($cnTrafo) || $cnTrafo <= 0.0) {
                $est = 'sin_datos';
                $uA  = null;
                $uD  = null;
            } else {
                $uA  = round($ant / $cnTrafo * 100.0, 1);
                $uD  = round($des / $cnTrafo * 100.0, 1);
                $est = clasificarMes($des, $cnTrafo, $umbral);
            }
        }

        $conteo[$est] = ($conteo[$est] ?? 0) + 1;
        $registros[] = [
            'mes'            => $mes,
            'I_antes'        => $ant !== null ? round($ant, 1) : null,
            'I_despues'      => $des !== null ? round($des, 1) : null,
            'delta'          => round($delta, 2),
            'uso_antes_pct'  => $uA,
            'uso_despues_pct'=> $uD,
            'estado'         => $est,
        ];
    }

    $best = null;
    foreach ($registros as $r) {
        if ($r['uso_despues_pct'] !== null &&
            ($best === null || $r['uso_despues_pct'] > $best['uso_despues_pct'])) {
            $best = $r;
        }
    }

    return [
        'cn_trafo'   => !is_nan($cnTrafo) ? $cnTrafo : null,
        'sin_datos'  => false,
        'tabla'      => $registros,
        'resumen'    => $conteo,
        'mes_max_uso'=> $best['mes']             ?? null,
        'pct_max_uso'=> $best['uso_despues_pct'] ?? null,
    ];
}

// ─── Resumen de estados ───────────────────────────────────────────────────

/**
 * Cuenta meses por estado y detecta el mes más crítico del destino.
 *
 * @param array $tabSim Tabla de salida de simular() o simularMesAMes()
 * @return array {conteo, meses_criticos, meses_prealerta, mes_max_uso, pct_max_uso, total_meses}
 *
 * Equivalente a resumen_estados() de Python.
 */
function resumenEstados(array $tabSim): array
{
    $conteo         = [];
    $mesesCriticos  = [];
    $mesesPrealerta = [];
    $mesMaxUso      = null;
    $pctMaxUso      = null;

    foreach ($tabSim as $r) {
        $est = $r['estado_dest'] ?? 'sin_datos';
        $conteo[$est] = ($conteo[$est] ?? 0) + 1;

        if ($est === 'critico')   $mesesCriticos[]  = $r['mes'];
        if ($est === 'prealerta') $mesesPrealerta[] = $r['mes'];

        $pct = $r['uso_dest_despues_pct'] ?? null;
        if ($pct !== null && ($pctMaxUso === null || $pct > $pctMaxUso)) {
            $pctMaxUso = $pct;
            $mesMaxUso = $r['mes'];
        }
    }

    return [
        'conteo'          => $conteo,
        'meses_criticos'  => $mesesCriticos,
        'meses_prealerta' => $mesesPrealerta,
        'mes_max_uso'     => $mesMaxUso,
        'pct_max_uso'     => $pctMaxUso,
        'total_meses'     => count($tabSim),
    ];
}
