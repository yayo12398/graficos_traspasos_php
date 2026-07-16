<?php
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
