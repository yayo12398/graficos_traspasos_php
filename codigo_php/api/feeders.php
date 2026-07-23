<?php
// ══════════════════════════════════════════════════════════════════════════════
// FEEDERS / DATOS BASE — rutas /api/feeders, /api/meses, /api/feeder/*,
//   /api/subestaciones, /api/destinos/*, /api/reload, /api/equipos?nom_alim=,
//   /api/isla, /api/isla/preview, /api/vecinos_lz/*, /api/corrimiento_candidatos/*,
//   /api/debug/status, /api/datos
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
        $nomAlim  = $nomAlimMap[(int)$numalim] ?? null;
        $result[] = [
            'numalim'    => (int)$numalim,
            'nombre'     => nombreDisplayAlim($row),
            'cn'         => (isset($row['cn']) && is_numeric($row['cn'])) ? (float)$row['cn'] : null,
            'nom_alim'   => $nomAlim,
            'subestacion'=> $sub === '' ? null : $sub,
            'cn_trafo'   => $cnTrafo,
            'barra_trafo'=> $barraTrafo,
            'frg'        => $nomAlim ? tlcAlimEsFrg($nomAlim) : false,
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
            'tlc'        => tlcEsTlc($nombre),
        ];
    }
    usort($result, fn($a, $b) => ($b['pct_feeder'] ?? 0) <=> ($a['pct_feeder'] ?? 0));
    jsonPy($result);
}

// ── POST /api/isla/preview ─────────────────────────────────────────────────────
// Body: {nom_alim_orig, tipo_isla?, equipo_nombre?, tds_numpos?}
// Retorna Python flat: {n_td, kva_isla, kva_feeder, p_pct, clientes, detalle_tds,
//                       v_lz, atr_boundary}
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

    // Detectar si la isla está en zona de baja tensión (aguas abajo de ATR)
    $vLzPreview   = 23.0;
    $atrBoundary  = null;
    $alimCfgPrev  = acGetAlim($nomAlim);
    if ($alimCfgPrev && !empty($alimCfgPrev['autotrafos'])) {
        $nomUpPrev   = strtoupper(trim($nomAlim));
        $tdSetPrev   = [];
        foreach ($tds as $_tr) {
            $td = trim((string)($_tr['numpos_td'] ?? ''));
            if ($td !== '') $tdSetPrev[$td] = true;
        }
        foreach ($alimCfgPrev['autotrafos'] as $_at) {
            $tipo  = $_at['tipo'] ?? 'reductor';
            $bound = strtoupper(trim($tipo === 'elevador'
                ? ($_at['rec_baja'] ?? '')
                : (($_at['rec_alta'] ?? '') ?: ($_at['rec_baja'] ?? ''))));
            if ($bound === '') continue;
            foreach ($dfAb as $_row) {
                if (strtoupper(trim($_row['nom_alim']    ?? '')) !== $nomUpPrev) continue;
                if (strtoupper(trim($_row['numpos_equip'] ?? '')) !== $bound)    continue;
                $td = trim($_row['numpos_td'] ?? '');
                if ($td !== '' && isset($tdSetPrev[$td])) {
                    $vLzPreview  = $tipo === 'elevador' ? (float)($_at['tension_alta'] ?? 23) : 12.0;
                    $atrBoundary = $bound;
                    break 2;
                }
            }
        }
    }

    $previewOut   = $previewIsla;
    unset($previewOut['detalle_tds']);
    $previewOut['equipos_traspasados'] = $eqsTrsp;
    $previewOut['detalle_tds']         = $previewIsla['detalle_tds'] ?? [];
    $previewOut['v_lz']                = $vLzPreview;
    $previewOut['atr_boundary']        = $atrBoundary;
    jsonPy($previewOut);
}

// ── GET /api/destinos/existentes ───────────────────────────────────────────────
// Retorna: [{numalim, nombre, cn, frg}]
if ($method === 'GET' && $a === 'destinos' && $b0 === 'existentes' && !$b1) {
    ['dfAlim' => $dfAlim, 'dfAb' => $dfAb] = gd();
    // Mapa inverso numalim → nom_alim
    $nomAlimMapDest = [];
    foreach ($dfAb as $row) {
        $nm = $row['numalim'] ?? null;
        if ($nm !== null && !isset($nomAlimMapDest[(int)$nm])) {
            $nomAlimMapDest[(int)$nm] = $row['nom_alim'] ?? null;
        }
    }
    $result = [];
    foreach ($dfAlim as $numalim => $row) {
        $nomAlim  = $nomAlimMapDest[(int)$numalim] ?? null;
        $result[] = [
            'numalim' => (int)$numalim,
            'nombre'  => nombreDisplayAlim($row),
            'cn'      => (isset($row['cn']) && is_numeric($row['cn'])) ? (float)$row['cn'] : null,
            'frg'     => $nomAlim ? tlcAlimEsFrg($nomAlim) : false,
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

// ── POST /api/reload ───────────────────────────────────────────────────────────
if ($method === 'POST' && $a === 'reload' && !$b0) {
    global $_G, $_LZ;
    cargarAguasAbajo(true);
    cargarDemandas(true);
    cargarLimiteZona(true);
    cargarEquiposIndex(true);   // reconstruye índice con datos frescos
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
            'tlc'                  => tlcEsTlc((string)$row['numpos_lz']),
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

// ── GET /api/debug/status ──────────────────────────────────────────────────────
if ($method === 'GET' && $a === 'debug' && $b0 === 'status' && !$b1) {
    // Nombres deben coincidir con las claves de caché en Datos.php (cargar*()).
    $cacheAb  = D_CACHE . '/aguas_abajo_sql.ser';
    $cacheDem = D_CACHE . '/demandas_sql.ser';
    $cacheLz  = D_CACHE . '/limite_zona_sql.ser';
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
            'cache_lz_mtime'      => file_exists($cacheLz)
                ? date('Y-m-d H:i:s', (int)filemtime($cacheLz)) : null,
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
