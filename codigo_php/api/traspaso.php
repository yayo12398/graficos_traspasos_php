<?php
// ══════════════════════════════════════════════════════════════════════════════
// TRASPASO / SIMULACIÓN — /api/guardar_transferencia, /api/descargar_html,
//   /api/simular
// ══════════════════════════════════════════════════════════════════════════════

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

    // ── Corrección ATR: tensión en el LZ (lado A) y tensión de conexión de B ────
    // serie_deltas = I_trunk_A × p  (unidades 23 kV siempre).
    // Si la isla de A está en zona de baja tensión (aguas abajo de un ATR de A),
    // la corriente real en B = serie_deltas × (23 / V_eq), donde V_eq depende de
    // la posición topológica de cada equipo respecto al ATR de A o de B.
    $alimConfA  = acGetAlim($nomOrig);
    $alimConfBc = ($tipoDest === 'excel' && $nomDest !== '') ? acGetAlim($nomDest) : null;

    // V_lz: tensión física en el LZ (determinada topológicamente por ATR de A).
    // Se verifica si algún TD de la isla es aguas abajo del borde del ATR de A.
    // No depende de equipo_abre; usa los TDs reales de la isla.
    $vLz = 23.0;
    if ($alimConfA && !empty($alimConfA['autotrafos'])) {
        $nomOrigUp = strtoupper(trim($nomOrig));
        $tdIslandSet = [];
        foreach ($tds as $_tdRow) {
            $td = trim((string)($_tdRow['numpos_td'] ?? ''));
            if ($td !== '') $tdIslandSet[$td] = true;
        }
        foreach ($alimConfA['autotrafos'] as $_atA) {
            $atATipo  = $_atA['tipo'] ?? 'reductor';
            $atABound = strtoupper(trim($atATipo === 'elevador'
                ? ($_atA['rec_baja'] ?? '')
                : (($_atA['rec_alta'] ?? '') ?: ($_atA['rec_baja'] ?? ''))));
            if ($atABound === '') continue;
            foreach ($dfAb as $_row) {
                if (strtoupper(trim($_row['nom_alim']    ?? '')) !== $nomOrigUp) continue;
                if (strtoupper(trim($_row['numpos_equip'] ?? '')) !== $atABound)  continue;
                $td = trim($_row['numpos_td'] ?? '');
                if ($td !== '' && isset($tdIslandSet[$td])) {
                    $vLz = $atATipo === 'elevador' ? (float)($_atA['tension_alta'] ?? 23) : 12.0;
                    break 2;
                }
            }
        }
    }

    // V_se_B: tensión a la que B conecta con el LZ.
    // Si B tiene ATR registrado en el path upstream → su SE está en zona de alta (23 kV).
    // Si no tiene ATR en path → B conecta directamente al nivel del LZ (V_lz).
    $atB  = null;
    $vSeB = $vLz;
    if ($alimConfBc && !empty($alimConfBc['autotrafos'])) {
        $nombresRawBUp = array_map('strtoupper', array_column($b['equipos_b'] ?? [], 'nombre'));
        foreach ($alimConfBc['autotrafos'] as $_at) {
            $ra = strtoupper(trim($_at['rec_alta'] ?? ''));
            $rb = strtoupper(trim($_at['rec_baja'] ?? ''));
            if ($ra !== '' && in_array($ra, $nombresRawBUp, true)) { $atB = $_at; break; }
        }
        if (!$atB) {
            foreach ($alimConfBc['autotrafos'] as $_at) {
                $ra = strtoupper(trim($_at['rec_alta'] ?? ''));
                $rb = strtoupper(trim($_at['rec_baja'] ?? ''));
                if ($ra === '' && $rb !== '' && in_array($rb, $nombresRawBUp, true)) { $atB = $_at; break; }
            }
        }
        if ($atB) $vSeB = 23.0;
    }

    // Factores de escala para análisis de cabecera/trafo de B
    $scaleFeederB    = 23.0 / $vSeB;
    $deltaMaxB       = round($deltaMax * $scaleFeederB, 2);
    $pForB           = $isla['p'] * $scaleFeederB;
    $serieAdicionBSc = abs($scaleFeederB - 1.0) > 0.001
        ? array_map(fn($v) => round((float)$v * $scaleFeederB, 4), $deltaInfo['serie_deltas'])
        : $deltaInfo['serie_deltas'];

    // simular(): deltaMax limpio + serieOrig ajustada → I_orig_antes muestra carga real de B.
    // Si hay corrección ATR (V_A ≠ V_B), origen descuenta con deltaMax original (23 kV equiv.),
    // destino recibe deltaMaxB escalado al nivel de tensión de B.
    $atrScale    = abs($scaleFeederB - 1.0) > 0.001;
    $dfSim    = filtrarMeses(simular(
        $serieOrig, $serieDest, $cnOrig, $cnDest,
        $deltaMaxB,
        0.90,
        $atrScale ? $deltaMax : 0.0
    ), $mesesSel);
    // simularMesAMes(): mismo principio — pOrig para descuento en A, pForB para adición en B.
    $dfSimMam = filtrarMeses(simularMesAMes(
        $serieOrig, $serieDest, $cnOrig, $cnDest,
        $pForB,
        0.90,
        $serieOrigClean,
        $atrScale ? $isla['p'] : 0.0
    ), $mesesSel);
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
        $trafoDest       = $trafoDestRow ? analizarTrafo($trafoDestRow, $deltaMaxB, 'carga', 0.90, $mesesSel) : null;
        $trafoDestMam    = $trafoDestRow ? analizarTrafoMesAMes($trafoDestRow, $serieAdicionBSc, 'carga', 0.90, $mesesSel) : null;
        $numalimTrafoOrig = $trafoOrigRow ? ($nOrig ?? null) : null;
        $numalimTrafoDest = $trafoDestRow ? ($nDest ?? null) : null;
    } else {
        $numalimTN       = $feederData['numalim_trafo'] ?? null;
        $trafoDestRowRaw = $numalimTN ? trafoDeFeeder($dfTrafo, (int)$numalimTN) : null;
        $acumActual      = deltaAcumulado($feederNuevo);
        if ($trafoDestRowRaw) {
            $trafoDestRow = aplicarAjustesFila($trafoDestRowRaw, 'trafo', (int)$numalimTN);
            $trafoDest    = analizarTrafo($trafoDestRow, $acumActual + $deltaMax, 'carga', 0.90, $mesesSel);
            // MAM: suma delta_acum de casos anteriores (offset fijo) + delta proporcional actual
            $seriesDeltasAcum = array_map(fn($d) => $d + $acumActual, $deltaInfo['serie_deltas']);
            $trafoDestMam = analizarTrafoMesAMes($trafoDestRow, $seriesDeltasAcum, 'carga', 0.90, $mesesSel);
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

    // ── Evaluación VCC equipos troncales del receptor ─────────────────────────
    // serie_deltas[mes] = I_alim_A_orig[mes] × p  →  corriente isla que entra en alim B
    $vccAlimBEquipos = null;
    if ($tipoDest === 'excel' && $nDest && !empty($b['equipos_b'])) {
        $serieAdicionB = $deltaInfo['serie_deltas'] ?? [];
        $serieBFilt    = $mesesSel
            ? array_intersect_key($serieDest, array_flip($mesesSel))
            : $serieDest;

        $equiposBEval = [];
        foreach ($b['equipos_b'] as $eqB) {
            $nombre = $eqB['nombre'] ?? '';
            if (!$nombre) continue;
            $tipo = $eqB['tipo'] ?? tipoEquipo($nombre);
            if ($tipo === 'conductor_intermedio') {
                $equiposBEval[] = [
                    'nombre'   => "Conductor({$eqB['entre_b']})",
                    'tipo'     => 'conductor_intermedio',
                    'cn'       => isset($eqB['cn']) && is_numeric($eqB['cn']) ? (float)$eqB['cn'] : null,
                    'fraccion' => isset($eqB['fraccion']) && is_numeric($eqB['fraccion']) ? (float)$eqB['fraccion'] : null,
                    'kva_down' => null,
                ];
            } else {
                $frac = calcularFraccionReco($dfAb, $nomDest, $nombre);
                $equiposBEval[] = array_merge($frac, [
                    'nombre' => $nombre,
                    'tipo'   => tipoEquipo($nombre),
                    'cn'     => isset($eqB['cn']) && is_numeric($eqB['cn']) ? (float)$eqB['cn'] : null,
                ]);
            }
        }
        // ── Corrección de tensión por equipo (VCC equipos B) ─────────────────
        // Corriente en equipo = serie_deltas × (23 / V_eq).
        // V_eq se determina topológicamente: posición del equipo relativa al ATR de B.
        // Si B no tiene ATR en el path upstream, todos los equipos están al nivel del LZ (V_lz).
        if ($atB) {
            // B tiene ATR en el path: corrección por zona (alta / baja)
            $atBTipo      = $atB['tipo'] ?? 'reductor';
            $atBRecAlta   = $atB['rec_alta'] ?? '';
            $atBRecBaja   = $atB['rec_baja'] ?? '';
            $atBTensAlta  = (float)($atB['tension_alta'] ?? 23);
            $atBBoundary  = $atBTipo === 'elevador' ? $atBRecBaja : ($atBRecAlta ?: $atBRecBaja);
            // Si boundary = rec_alta → el recloser de borde está en zona de alta (23 kV)
            // Si boundary = rec_baja → el recloser de borde está en zona de baja (12 kV)
            $boundaryIsHigh = ($atBBoundary === $atBRecAlta && $atBRecAlta !== '');

            foreach ($equiposBEval as &$_eqB) {
                $nB = $_eqB['nombre'] ?? '';
                if ($nB === $atBBoundary) {
                    $vEq = $boundaryIsHigh ? $atBTensAlta : 12.0;
                } else {
                    $isDown = equipoEsAguasAbajoDe($dfAb, $nomDest, $atBBoundary, $nB);
                    // Elevador: downstream de rec_baja = zona de alta (23 kV, salida del ATR)
                    // Reductor: downstream de rec_alta/rec_baja = zona de baja (12 kV, salida)
                    $vEq = ($atBTipo === 'elevador')
                        ? ($isDown ? $atBTensAlta : 12.0)
                        : ($isDown ? 12.0 : $atBTensAlta);
                }
                $scale = 23.0 / $vEq;
                if (abs($scale - 1.0) > 0.001) {
                    $sc = [];
                    foreach ($serieAdicionB as $__m => $__v) $sc[$__m] = round((float)$__v * $scale, 4);
                    $_eqB['serie_adicion_override'] = $sc;
                }
            }
            unset($_eqB);
        } elseif (abs($vLz - 23.0) > 0.001) {
            // Sin ATR de B en path: todos los equipos están al nivel del LZ
            $scaleLz = 23.0 / $vLz;
            foreach ($equiposBEval as &$_eqB) {
                $sc = [];
                foreach ($serieAdicionB as $__m => $__v) $sc[$__m] = round((float)$__v * $scaleLz, 4);
                $_eqB['serie_adicion_override'] = $sc;
            }
            unset($_eqB);
        }

        if ($equiposBEval) {
            $vccAlimBEquipos = evaluarEquipos(
                equipos:      $equiposBEval,
                deltaI:       0.0,
                cnAlim:       null,
                serieAlim:    $serieBFilt,
                mesesFiltro:  $mesesSel ?: null,
                serieAdicion: $serieAdicionB,
            );
        }
    }

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
        'vcc_alim_b_equipos'  => $vccAlimBEquipos,
    ]);
}
