<?php
declare(strict_types=1);

/**
 * Vcc.php — Validación de Conexión de Cliente (VCC).
 *
 * Equivalente PHP 8.x de traspaso/vcc.py.
 *
 * Calcula el impacto de conectar un nuevo cliente MT sobre:
 *   - Factor de Utilización (FU) del alimentador
 *   - FU del transformador AT/MT asociado
 *   - ΔI relativo a la CN de equipos upstream (reconectadores y equipos subterráneos)
 *
 * Funciones implementadas (ver docblocks individuales):
 *   deltaICliente, _vccPref, tipoEquipo, _vccClasif,
 *   buscarPuntoConexion, _vccClasificarUpstream,
 *   calcularFraccionReco, enriquecerUpstreamConFraccion,
 *   calcularVcc, evaluarEquipos,
 *   guardarEvaluacion, cargarEvaluaciones, eliminarEvaluacion, listarAlimsConVcc
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

/** √3 con precisión extendida (idéntico a Python: 1.7320508075688772). */
const VCC_SQRT3 = 1.7320508075688772;

/** Prefijos de reconectadores confirmados (requieren CN). */
const PREFIJOS_RECONECTADOR = ['REC', 'RTS', 'RTB'];

/** Prefijos de equipos subterráneos (CN opcional). */
const PREFIJOS_CN_OPCIONAL  = ['DBC', 'ABB', 'ORM', 'SCH', 'CLB'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convierte kVA a corriente de cliente [A] asumiendo FP = 1.
 * Equivalente a delta_I_cliente() de Python.
 */
function deltaICliente(float $kva, float $tensionKv): float
{
    if ($tensionKv <= 0.0) {
        throw new InvalidArgumentException('Tensión debe ser > 0 kV');
    }
    return round($kva / (VCC_SQRT3 * $tensionKv), 2);
}

/**
 * Extrae el prefijo alfabético del nombre del equipo (ej: 'DBC73673' → 'DBC').
 * Equivalente a _pref() de Python.
 */
function _vccPref(string $nombre): string
{
    if (preg_match('/^([A-Za-z]+)/', $nombre, $m)) {
        return strtoupper($m[1]);
    }
    return '';
}

/**
 * Clasifica el tipo de equipo VCC: 'cabecera' | 'reconectador' | 'equipo_sub' | 'otro'.
 * Equivalente a tipo_equipo() de Python.
 */
function tipoEquipo(string $nombre): string
{
    if (strtolower($nombre) === 'cabecera') {
        return 'cabecera';
    }
    $p = _vccPref($nombre);
    if (in_array($p, PREFIJOS_RECONECTADOR, strict: true)) {
        return 'reconectador';
    }
    if (in_array($p, PREFIJOS_CN_OPCIONAL, strict: true)) {
        return 'equipo_sub';
    }
    return 'otro';
}

/**
 * Clasifica un porcentaje de uso en estado: 'critico' | 'prealerta' | 'viable'.
 * Equivalente a la inner function _clasif() dentro de evaluar_equipos() en Python.
 */
function _vccClasif(float $pct): string
{
    if ($pct >= 100.0) return 'critico';
    if ($pct >= 90.0)  return 'prealerta';
    return 'viable';
}

// ─── Búsqueda del punto de conexión ──────────────────────────────────────────

/**
 * Busca un numpos en $dfAb e infiere los equipos upstream del punto de conexión.
 *
 * Intenta primero como numpos_equip (equipo inmediatamente upstream);
 * si no lo encuentra, lo intenta como numpos_td (TP del cliente ya en la red).
 *
 * Retorna array con claves:
 *   tipo              — 'equipo' | 'td' | 'no_encontrado'
 *   numpos_ref        — numpos buscado
 *   nombre_ref        — nombre del equipo/TD encontrado
 *   n_tds_aguas_abajo — TDs aguas abajo del punto (solo modo 'equipo')
 *   upstream          — lista de arrays {nombre, tipo, cn_opcional, cn}
 *                       (excluye 'cabecera'; ordenados: reconectadores primero)
 *
 * Equivalente a buscar_punto_conexion() de Python.
 *
 * @param array  $dfAb    Array plano de filas de topología (cargarAguasAbajo)
 * @param string $nomAlim Nombre del alimentador
 * @param string $numpos  NUMPOS a buscar
 * @return array
 */
function buscarPuntoConexion(array $dfAb, string $nomAlim, string $numpos): array
{
    $nomUp    = strtoupper(trim($nomAlim));
    $numposS  = trim($numpos);

    // ── Modo 1: numpos como numpos_equip (equipo inmediatamente upstream) ─────
    $tdsViaEq = [];
    $nombreRef = '';
    foreach ($dfAb as $row) {
        if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
        if (trim($row['numpos_equip'] ?? '') !== $numposS) continue;
        $td = trim($row['numpos_td'] ?? '');
        if ($td === '') continue;
        $tdsViaEq[$td] = true;
        if ($nombreRef === '') {
            $nombreRef = $row['nombre_equip'] ?? '';
        }
    }

    if ($tdsViaEq) {
        // Intersección: numpos_equip comunes a TODOS los TDs que pasan por este equipo
        // Se usa array_intersect_key con array_flip para simular el &= de Python sets
        $interseccion = null;
        foreach (array_keys($tdsViaEq) as $td) {
            $equiposDeTd = [];
            foreach ($dfAb as $row) {
                if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
                if (trim($row['numpos_td'] ?? '') !== $td) continue;
                $ne = trim($row['numpos_equip'] ?? '');
                if ($ne !== '') $equiposDeTd[$ne] = true;
            }
            if ($interseccion === null) {
                $interseccion = $equiposDeTd;
            } else {
                $interseccion = array_intersect_key($interseccion, $equiposDeTd);
            }
        }
        $conjuntoNombres = array_keys($interseccion ?? []);

        return [
            'tipo'               => 'equipo',
            'numpos_ref'         => $numposS,
            'nombre_ref'         => $nombreRef,
            'n_tds_aguas_abajo'  => count($tdsViaEq),
            'upstream'           => _vccClasificarUpstream($conjuntoNombres),
        ];
    }

    // ── Modo 2: numpos como numpos_td (TP del cliente ya en la red) ───────────
    $upstreamSet = [];
    $nombreTd    = '';
    foreach ($dfAb as $row) {
        if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
        if (trim($row['numpos_td'] ?? '') !== $numposS) continue;
        $ne = trim($row['numpos_equip'] ?? '');
        if ($ne !== '') $upstreamSet[$ne] = true;
        if ($nombreTd === '') {
            $nombreTd = $row['nombre'] ?? '';
        }
    }

    if ($upstreamSet) {
        return [
            'tipo'               => 'td',
            'numpos_ref'         => $numposS,
            'nombre_ref'         => $nombreTd,
            'n_tds_aguas_abajo'  => 0,
            'upstream'           => _vccClasificarUpstream(array_keys($upstreamSet)),
        ];
    }

    // ── No encontrado ─────────────────────────────────────────────────────────
    return [
        'tipo'               => 'no_encontrado',
        'numpos_ref'         => $numposS,
        'nombre_ref'         => '',
        'n_tds_aguas_abajo'  => 0,
        'upstream'           => [],
    ];
}

/**
 * Clasifica y ordena la lista de nombres upstream, excluyendo 'cabecera'.
 * Reconectadores primero, luego equipos_sub, luego otros; alfabético dentro de cada grupo.
 *
 * Retorna lista de arrays {nombre, tipo, cn_opcional, cn}.
 * Equivalente a _clasificar_upstream() de Python.
 *
 * @param array $nombres Lista de nombres de numpos_equip (strings)
 * @return array
 */
function _vccClasificarUpstream(array $nombres): array
{
    $result = [];
    $sorted = $nombres;
    sort($sorted);

    foreach ($sorted as $nombre) {
        if (strtolower($nombre) === 'cabecera') continue;
        $t = tipoEquipo($nombre);
        $result[] = [
            'nombre'     => $nombre,
            'tipo'       => $t,
            'cn_opcional'=> in_array($t, ['reconectador', 'equipo_sub'], strict: true),
            'cn'         => null,   // se rellena con input del usuario
        ];
    }

    // Orden: reconectadores=0, equipo_sub=1, otro=2; luego alfabético
    usort($result, function (array $a, array $b): int {
        $ord = ['reconectador' => 0, 'equipo_sub' => 1, 'otro' => 2];
        $oa  = $ord[$a['tipo']] ?? 2;
        $ob  = $ord[$b['tipo']] ?? 2;
        if ($oa !== $ob) return $oa <=> $ob;
        return strcmp($a['nombre'], $b['nombre']);
    });

    return $result;
}

// ─── Fracción de potencia instalada ──────────────────────────────────────────

/**
 * Calcula la fracción de kVA instalados aguas abajo de un equipo respecto al total del alim.
 * TDs con potencia nula se ignoran en el cómputo pero se contabilizan en tds_sin_kva.
 *
 * Retorna array con: kva_down, kva_total, fraccion, tds_down, tds_con_kva, tds_sin_kva.
 * Equivalente a calcular_fraccion_reco() de Python.
 *
 * @param array  $dfAb       Topología completa
 * @param string $nomAlim    Nombre del alimentador
 * @param string $numposEquip NUMPOS del equipo
 * @return array
 */
function calcularFraccionReco(array $dfAb, string $nomAlim, string $numposEquip): array
{
    $nomUp    = strtoupper(trim($nomAlim));
    $numposS  = trim($numposEquip);

    // Potencia única por TD para todo el alimentador (equivalente a drop_duplicates('numpos_td'))
    $tdPotsTotal = [];
    foreach ($dfAb as $row) {
        if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
        $td = trim($row['numpos_td'] ?? '');
        if ($td === '' || isset($tdPotsTotal[$td])) continue;
        $p = $row['potencia'] ?? null;
        $tdPotsTotal[$td] = is_numeric($p) ? (float)$p : null;
    }

    // kVA total del alimentador (sum de TDs con potencia conocida)
    $kvaTotal = 0.0;
    foreach ($tdPotsTotal as $p) {
        if ($p !== null) $kvaTotal += $p;
    }

    // TDs aguas abajo de este equipo específico
    $tdsDown = [];
    foreach ($dfAb as $row) {
        if (strtoupper(trim($row['nom_alim'] ?? '')) !== $nomUp) continue;
        if (trim($row['numpos_equip'] ?? '') !== $numposS) continue;
        $td = trim($row['numpos_td'] ?? '');
        if ($td !== '') $tdsDown[$td] = true;
    }

    $kvaDown   = 0.0;
    $tdsConKva = 0;
    $tdsSinKva = 0;
    foreach (array_keys($tdsDown) as $td) {
        if (!array_key_exists($td, $tdPotsTotal)) continue;
        $p = $tdPotsTotal[$td];
        if ($p !== null) {
            $kvaDown += $p;
            $tdsConKva++;
        } else {
            $tdsSinKva++;
        }
    }

    $fraccion = $kvaTotal > 0.0 ? round($kvaDown / $kvaTotal, 4) : 0.0;

    return [
        'kva_down'    => round($kvaDown,   0),
        'kva_total'   => round($kvaTotal,  0),
        'fraccion'    => $fraccion,
        'tds_down'    => count($tdsDown),
        'tds_con_kva' => $tdsConKva,
        'tds_sin_kva' => $tdsSinKva,
    ];
}

/**
 * Añade datos de fracción de potencia a reconectadores y equipos_sub del listado upstream.
 * Los equipos de tipo 'otro' se dejan sin modificar.
 *
 * Equivalente a enriquecer_upstream_con_fraccion() de Python.
 *
 * @param array  $dfAb     Topología completa
 * @param string $nomAlim  Nombre del alimentador
 * @param array  $upstream Lista de arrays upstream (salida de buscarPuntoConexion)
 * @return array
 */
function enriquecerUpstreamConFraccion(array $dfAb, string $nomAlim, array $upstream): array
{
    $result = [];
    foreach ($upstream as $eq) {
        $eq2 = $eq;
        if (in_array($eq['tipo'], ['reconectador', 'equipo_sub'], strict: true)) {
            $frac = calcularFraccionReco($dfAb, $nomAlim, $eq['nombre']);
            $eq2  = array_merge($eq2, $frac);
        }
        $result[] = $eq2;
    }
    return $result;
}

// ─── Cálculo VCC ─────────────────────────────────────────────────────────────

/**
 * Calcula el impacto de $deltaI sobre el alimentador y su trafo AT/MT.
 *
 * Aplica el alivio por traspaso simultáneo sobre la serie histórica del alim
 * antes de llamar a analizarTrafo() con modo 'carga'.
 *
 * Retorna array con: tabla_alim, cn_alim, resumen_alim, mes_max_alim, pct_max_alim, tabla_trafo.
 * Equivalente a calcular_vcc() de Python.
 *
 * @param array      $dfAlim           Array wide keyed by numalim (de cargarDemandas)
 * @param int        $numalim          NUMALIM del alimentador
 * @param array|null $trafoRow         Fila del trafo asociado (o null si no hay)
 * @param float      $deltaI           Corriente adicional del cliente [A]
 * @param array      $mesesFiltro      Lista de meses YYYY-MM a considerar
 * @param float      $deltaTraspasoA   Alivio fijo [A] a restar de la serie del alim
 * @param float      $deltaTraspasoPct Fracción porcentual [0–100] a reducir de la serie
 * @return array
 */
function calcularVcc(
    array  $dfAlim,
    int    $numalim,
    ?array $trafoRow,
    float  $deltaI,
    array  $mesesFiltro,
    float  $deltaTraspasoA   = 0.0,
    float  $deltaTraspasoPct = 0.0,
): array {
    if (!isset($dfAlim[$numalim])) {
        throw new RuntimeException("NUMALIM $numalim no encontrado en dfAlim");
    }

    $alimRow = $dfAlim[$numalim];   // PHP copia por valor → seguro modificar

    // Aplicar alivio por traspaso simultáneo sobre la serie histórica del alim
    if ($deltaTraspasoPct > 0.0 || $deltaTraspasoA > 0.0) {
        $factor = $deltaTraspasoPct > 0.0 ? (1.0 - $deltaTraspasoPct / 100.0) : null;
        foreach ($alimRow as $col => $val) {
            if (!is_string($col) || !preg_match('/^\d{4}-\d{2}$/', $col)) continue;
            if ($val === null || !is_numeric($val)) continue;
            $v = (float)$val;
            $alimRow[$col] = max(0.0, $factor !== null ? $v * $factor : $v - $deltaTraspasoA);
        }
    }

    $alimResult = analizarTrafo($alimRow, $deltaI, modo: 'carga', mesesFiltro: $mesesFiltro);
    $cnAlim     = $alimResult['cn_trafo'];

    $trafoResult = null;
    if ($trafoRow !== null) {
        $trafoResult                = analizarTrafo($trafoRow, $deltaI, modo: 'carga', mesesFiltro: $mesesFiltro);
        $trafoResult['subestacion'] = trim((string)($trafoRow['subestacion'] ?? '')) ?: null;
        $trafoResult['barra']       = trim((string)($trafoRow['barra']       ?? '')) ?: null;
    }

    return [
        'tabla_alim'   => $alimResult['tabla'],
        'cn_alim'      => $cnAlim,
        'resumen_alim' => $alimResult['resumen'],
        'mes_max_alim' => $alimResult['mes_max_uso'],
        'pct_max_alim' => $alimResult['pct_max_uso'],
        'tabla_trafo'  => $trafoResult,
    ];
}

// ─── Evaluación de equipos upstream ──────────────────────────────────────────

/**
 * Evalúa cada equipo upstream con dos metodologías cuando hay datos de fracción
 * de potencia instalada; si no, usa el ratio legacy ΔI/CN.
 *
 * Enfoque A (cota conservadora): I_base_A = CN_alim × fraccion
 * Enfoque B (demanda real ponderada): I_reco(mes) = I_alim(mes) × fraccion; max mensual
 *
 * El estado final cuando hay fracción es el max(_orden) entre enfoque_a y enfoque_b.
 * Equivalente a evaluar_equipos() de Python.
 *
 * @param array      $equipos     Lista de arrays {nombre, tipo, cn_opcional, cn, fraccion?, ...}
 * @param float      $deltaI      Corriente adicional [A]
 * @param float|null $cnAlim      CN del alimentador [A] (requerido para Enfoque A)
 * @param array|null $serieAlim   ['YYYY-MM' => float|null] (requerido para Enfoque B)
 * @param array|null $mesesFiltro Meses a incluir en Enfoque B
 * @return array
 */
function evaluarEquipos(
    array  $equipos,
    float  $deltaI,
    ?float $cnAlim      = null,
    ?array $serieAlim   = null,
    ?array $mesesFiltro = null,
): array {
    // Orden de criticidad para max() entre estados
    $orden = ['critico' => 2, 'prealerta' => 1, 'viable' => 0, 'sin_cn' => -1];

    $result = [];
    foreach ($equipos as $eq) {
        $cn       = isset($eq['cn']) && is_numeric($eq['cn']) ? (float)$eq['cn'] : null;
        $fraccion = array_key_exists('fraccion', $eq) ? $eq['fraccion'] : null;
        $ent      = $eq;
        $ent['delta_I'] = $deltaI;

        // Sin CN válida → sin_cn
        if (!($cn && $cn > 0.0)) {
            $ent['delta_pct'] = null;
            $ent['estado']    = 'sin_cn';
            $ent['enfoque_a'] = null;
            $ent['enfoque_b'] = null;
            $result[] = $ent;
            continue;
        }

        $hasFrac = $fraccion !== null;

        // ── Enfoque A: cota conservadora ────────────────────────────────────
        $enfA = null;
        if ($hasFrac && $cnAlim !== null && $cnAlim > 0.0) {
            $iBaseA  = $cnAlim * $fraccion;
            $iTotalA = $iBaseA + $deltaI;
            $pctA    = round($iTotalA / $cn * 100.0, 1);
            $enfA    = [
                'I_base'  => round($iBaseA,  2),
                'I_total' => round($iTotalA, 2),
                'pct'     => $pctA,
                'estado'  => _vccClasif($pctA),
            ];
        }

        // ── Enfoque B: demanda real ponderada ────────────────────────────────
        $enfB = null;
        if ($hasFrac && $serieAlim) {
            $meses     = $mesesFiltro ?? array_keys($serieAlim);
            $serieReco = [];
            foreach ($meses as $mes) {
                $v = $serieAlim[$mes] ?? null;
                // Excluir null y NaN (equivalente a np.isnan check)
                if ($v === null) continue;
                if (!is_numeric($v)) continue;
                $vf = (float)$v;
                if (is_nan($vf)) continue;
                $serieReco[$mes] = round($vf * $fraccion, 2);
            }

            if ($serieReco) {
                $maxVal   = max($serieReco);
                $mesMaxB  = (string)array_search($maxVal, $serieReco);
                $iBaseB   = $maxVal;
                $iTotalB  = round($iBaseB + $deltaI, 2);
                $pctB     = round($iTotalB / $cn * 100.0, 1);

                $serieDet = [];
                ksort($serieReco);
                foreach ($serieReco as $m => $v) {
                    $iT      = round($v + $deltaI, 2);
                    $pctMes  = round($iT / $cn * 100.0, 1);
                    $serieDet[] = [
                        'mes'     => $m,
                        'I_reco'  => $v,
                        'I_total' => $iT,
                        'pct'     => $pctMes,
                        'estado'  => _vccClasif($pctMes),
                    ];
                }

                $enfB = [
                    'I_base_max' => $iBaseB,
                    'mes_max'    => $mesMaxB,
                    'I_total'    => $iTotalB,
                    'pct'        => $pctB,
                    'estado'     => _vccClasif($pctB),
                    'serie'      => $serieDet,
                ];
            }
        }

        $ent['enfoque_a'] = $enfA;
        $ent['enfoque_b'] = $enfB;

        if ($hasFrac) {
            // Estado final = max de criticidad entre enfoque_a y enfoque_b
            $estados = [];
            if ($enfA) $estados[] = $enfA['estado'];
            if ($enfB) $estados[] = $enfB['estado'];
            if ($estados) {
                usort($estados, fn($a, $b) => ($orden[$b] ?? -1) <=> ($orden[$a] ?? -1));
                $ent['estado'] = $estados[0];
            } else {
                $ent['estado'] = 'sin_cn';
            }
            // delta_pct desde el primero disponible (enfoque_a preferido)
            $ent['delta_pct'] = ($enfA ?? $enfB ?? [])['pct'] ?? null;
        } else {
            // Legacy: sin datos aguas_abajo → solo ratio ΔI/CN
            $pctLeg          = round($deltaI / $cn * 100.0, 1);
            $ent['delta_pct'] = $pctLeg;
            $ent['estado']    = _vccClasif($pctLeg);
        }

        $result[] = $ent;
    }
    return $result;
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

/** Directorio donde se guardan las evaluaciones VCC (desde src/ sube a codigo_php/). */
define('VCC_DIR', dirname(__DIR__) . '/vcc_evaluaciones');

/**
 * Crea el directorio VCC si no existe y retorna la ruta del archivo JSON del alimentador.
 * Equivalente a _vcc_path() de Python.
 */
function _vccPath(string $nombreAlim): string
{
    $dir = VCC_DIR;
    if (!is_dir($dir)) {
        mkdir($dir, 0755, recursive: true);
    }
    // Slug: reemplaza secuencias de caracteres no-alfanuméricos por '_', con flag Unicode
    $slug = preg_replace('/[^\w]+/u', '_', strtoupper(trim($nombreAlim)));
    $slug = trim((string)$slug, '_');
    return $dir . "/{$slug}.json";
}

/**
 * Persiste una evaluación VCC en vcc_evaluaciones/<ALIM>.json y retorna el idx asignado.
 * El nuevo idx es max(idxs existentes, default 0) + 1.
 * Equivalente a guardar_evaluacion() de Python.
 *
 * @param string $nombreAlim Nombre del alimentador
 * @param int    $numalim    NUMALIM del alimentador
 * @param float  $cnAlim     CN del alimentador [A]
 * @param array  $evaluacion Datos de la evaluación a guardar
 * @return int               Idx asignado
 */
function guardarEvaluacion(string $nombreAlim, int $numalim, float $cnAlim, array $evaluacion): int
{
    $path = _vccPath($nombreAlim);

    if (file_exists($path)) {
        $data = json_decode(
            file_get_contents($path),
            associative: true,
            flags: JSON_THROW_ON_ERROR,
        );
    } else {
        $data = [
            'nombre'      => $nombreAlim,
            'numalim'     => $numalim,
            'cn'          => $cnAlim,
            'evaluaciones'=> [],
        ];
    }

    $evs = &$data['evaluaciones'];
    $idxs = array_column($evs, 'idx');
    $idx  = (count($idxs) > 0 ? max($idxs) : 0) + 1;
    $evaluacion['idx'] = $idx;
    $evs[] = $evaluacion;
    unset($evs);

    file_put_contents(
        $path,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR),
        LOCK_EX,
    );
    return $idx;
}

/**
 * Carga el historial de evaluaciones VCC de un alimentador.
 * Retorna array vacío si no existe el archivo.
 * Equivalente a cargar_evaluaciones() de Python.
 *
 * @param string $nombreAlim Nombre del alimentador
 * @return array
 */
function cargarEvaluaciones(string $nombreAlim): array
{
    $path = _vccPath($nombreAlim);
    if (!file_exists($path)) {
        return ['nombre' => $nombreAlim, 'evaluaciones' => []];
    }
    return json_decode(
        file_get_contents($path),
        associative: true,
        flags: JSON_THROW_ON_ERROR,
    );
}

/**
 * Elimina una evaluación por idx del archivo JSON del alimentador.
 * Lanza RuntimeException si no existe el archivo.
 * Equivalente a eliminar_evaluacion() de Python.
 *
 * @param string $nombreAlim Nombre del alimentador
 * @param int    $idx        Idx de la evaluación a eliminar
 */
function eliminarEvaluacion(string $nombreAlim, int $idx): void
{
    $path = _vccPath($nombreAlim);
    if (!file_exists($path)) {
        throw new RuntimeException("No hay evaluaciones para '$nombreAlim'");
    }

    $data = json_decode(
        file_get_contents($path),
        associative: true,
        flags: JSON_THROW_ON_ERROR,
    );

    $data['evaluaciones'] = array_values(
        array_filter($data['evaluaciones'], fn(array $e) => $e['idx'] !== $idx)
    );

    file_put_contents(
        $path,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR),
        LOCK_EX,
    );
}

/**
 * Lista los slugs de alimentadores que tienen evaluaciones VCC guardadas.
 * Retorna array vacío si el directorio no existe.
 * Equivalente a listar_alims_con_vcc() de Python.
 *
 * @return string[]
 */
function listarAlimsConVcc(): array
{
    $dir = VCC_DIR;
    if (!is_dir($dir)) return [];

    $slugs = [];
    foreach (scandir($dir) as $f) {
        if (!str_ends_with($f, '.json')) continue;
        $slugs[] = substr($f, 0, -5);   // quita '.json'
    }
    sort($slugs);
    return $slugs;
}
