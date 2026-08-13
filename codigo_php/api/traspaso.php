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
    // Nota: la cadena de corrimiento se genera client-side (_construirInformeCadenaHTML).
    // Este endpoint solo atiende el caso único (usado por descargarTransferencia).

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
    // El origen del caso N es el destino del caso N-1, que quedó CARGADO con lo
    // recibido → se SUMA al baseline de display (serieOrig) para arrastrar la
    // carga entre casos. El delta transferido se sigue calculando desde la BD
    // limpia (serieOrigClean): el tramo transferido lleva solo su carga propia.
    $deltaAcumOrig = $b['delta_acum_orig'] ?? [];
    $serieOrig     = $serieOrigClean;
    if ($deltaAcumOrig) {
        foreach ($deltaAcumOrig as $_m => $_d) {
            if (array_key_exists($_m, $serieOrig)) {
                $serieOrig[$_m] = round((float)$serieOrig[$_m] + (float)$_d, 2);
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

    // ── Corrección ATR — reencuadre por tensión del punto de enlace ────────────
    // deltaMax se mide en la cabecera del origen → ya integra los ATR *internos* a
    // la isla. Solo importa el ATR que el enlace (LZ) cruza. Un LZ es un interruptor
    // (no transforma) → la tensión del punto de enlace es única a ambos lados.
    //   escala de cabecera:  ΔB = deltaMax × (V_cab_orig / V_cab_dest)
    //   escala por-equipo:   I_eq = serie × (V_cab_orig / V_eq)   (V_eq topológico)
    $alimConfA  = acGetAlim($nomOrig);
    $alimConfBc = ($tipoDest === 'excel' && $nomDest !== '') ? acGetAlim($nomDest) : null;
    $atrOrigList = $alimConfA['autotrafos']  ?? [];
    $atrDestList = $alimConfBc['autotrafos'] ?? [];

    // Tensión base de cabecera del feeder: 12 si todos sus ATR son elevadores; si no 23.
    // (null cuando el feeder no tiene ATR → se infiere de la tensión del enlace).
    $cabTension = function(array $atrs): ?int {
        if (!$atrs) return null;
        foreach ($atrs as $_a) { if (($_a['tipo'] ?? 'reductor') !== 'elevador') return 23; }
        return 12;
    };

    // Mapas tensión-por-equipo (numpos_equip → kV), robustos a multi-ATR.
    $vmapOrig = $atrOrigList ? tensionPorEquipoAtr($dfAb, $nomOrig, $atrOrigList) : [];
    $vmapDest = ($atrDestList && $nomDest !== '') ? tensionPorEquipoAtr($dfAb, $nomDest, $atrDestList) : [];

    // V_tie (origen): tensión del equipo que abre. En modo TDs/corte (sin equipo que
    // abre), 12 sólo si TODA la isla queda bajo un borde de ATR (todos sus TDs a 12).
    $vTieOrig = null;
    if ($atrOrigList) {
        if ($equipoAbre !== '' && isset($vmapOrig[$equipoAbre])) {
            $vTieOrig = (float)$vmapOrig[$equipoAbre];
        } else {
            $vTieOrig = (float)($cabTension($atrOrigList) ?? 23);
            $islTds = [];
            foreach ($tds as $_r) { $t = trim((string)($_r['numpos_td'] ?? '')); if ($t !== '') $islTds[$t] = true; }
            if ($islTds) foreach ($atrOrigList as $_atA) {
                $tipoA = ($_atA['tipo'] ?? 'reductor');
                $borde = trim($tipoA === 'elevador'
                    ? (string)($_atA['rec_baja'] ?? '')
                    : ((string)($_atA['rec_alta'] ?? '') ?: (string)($_atA['rec_baja'] ?? '')));
                if ($borde === '') continue;
                $bajo = [];
                foreach (tdsDeEquipo($dfAb, $borde, null) as $_br) { $t = trim((string)($_br['numpos_td'] ?? '')); if ($t !== '') $bajo[$t] = true; }
                if (!$bajo) continue;
                $todaBajo = true;
                foreach ($islTds as $t => $_) { if (!isset($bajo[$t])) { $todaBajo = false; break; } }
                if ($todaBajo) { $vTieOrig = $tipoA === 'elevador' ? (float)($_atA['tension_alta'] ?? 23) : 12.0; break; }
            }
        }
    }

    // V_tie (destino): tensión del equipo del troncal receptor más cercano al LZ
    // (mín. tensión del troncal para ATR reductor).
    $vTieDest = null;
    if ($vmapDest && !empty($b['equipos_b'])) {
        foreach ($b['equipos_b'] as $_eb) {
            $nm = trim((string)($_eb['nombre'] ?? ''));
            if ($nm === '' || !isset($vmapDest[$nm])) continue;
            $v = (float)$vmapDest[$nm];
            if ($vTieDest === null || $v < $vTieDest) $vTieDest = $v;
        }
    }

    // Tensión única del enlace: preferir el lado con ATR; si ambos, deben coincidir.
    $atrWarning = null;
    if ($vTieOrig !== null && $vTieDest !== null && abs($vTieOrig - $vTieDest) > 0.001) {
        $atrWarning = sprintf('Tensión del enlace inconsistente (origen %.0f kV vs destino %.0f kV); un LZ no transforma. Se omite la conversión de cabecera.', $vTieOrig, $vTieDest);
    }
    $vTie = $vTieOrig ?? $vTieDest;   // si ambos, coinciden (o se marca warning)

    // Tensiones base de cabecera. Feeder sin ATR = tensión uniforme → V_cab = V_tie.
    $vCabOrig = (float)($cabTension($atrOrigList) ?? ($vTie ?? 23.0));
    $vCabDest = (float)($cabTension($atrDestList) ?? ($vTie ?? 23.0));
    $vSeB     = $vCabDest;             // compat: cabecera del receptor
    $vLz      = $vTie ?? 23.0;         // tensión del enlace (para respuesta/notas)

    // Legacy para notas / avisos.
    $islaBajoAtrA   = ($vTie !== null && $atrOrigList && abs($vTie - $vCabOrig) > 0.001);
    $atrOrigMatched = $atrOrigList[0] ?? null;
    $atB            = $atrDestList[0] ?? null;   // sólo notas; desactiva el falso atr_omitido

    // Escala de cabecera/trafo — sólo tensiones base. Guardrail de banda sana.
    $scaleFeederB = $vCabDest > 0 ? $vCabOrig / $vCabDest : 1.0;
    if ($atrWarning) $scaleFeederB = 1.0;   // enlace inconsistente → no transformar
    if ($scaleFeederB < 0.4 || $scaleFeederB > 2.5) {
        $atrWarning = ($atrWarning ? $atrWarning . ' ' : '')
            . sprintf('Escala de tensión fuera de banda (%.2f); revisar topología/ATR.', $scaleFeederB);
        $scaleFeederB = 1.0;
    }
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
    // Veredicto de cabecera (alerta + conteo + pct_max_uso) sobre el escenario
    // PROPORCIONAL ($dfSimMam), consistente con la tabla mes-a-mes que ve el usuario.
    // El escenario conservador Δ-fijo ($dfSim) va aparte en 'tabla' → sección "Peor caso".
    $resumen  = resumenEstados($dfSimMam);

    $trafoOrigRowRaw = trafoDeFeeder($dfTrafo, $nOrig);
    $trafoOrigRow    = $trafoOrigRowRaw ? aplicarAjustesFila($trafoOrigRowRaw, 'trafo', $nOrig) : null;
    // P2: propagar delta acumulado al trafo origen (solo si caso anterior NO era misma barra).
    // Suma la carga recibida en casos previos (arrastra la carga entre casos).
    $deltaAcumOrigMismaBarra = (bool)($b['delta_acum_orig_misma_barra'] ?? false);
    if ($trafoOrigRow && $deltaAcumOrig && !$deltaAcumOrigMismaBarra) {
        foreach ($deltaAcumOrig as $_m => $_d) {
            if (array_key_exists($_m, $trafoOrigRow) && preg_match('/^\d{4}-\d{2}$/', $_m)) {
                $trafoOrigRow[$_m] = round((float)$trafoOrigRow[$_m] + (float)$_d, 2);
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
        // El trafo compartido no ve cambio neto: el destino (mismo trafo) recoge la
        // carga que alivia el origen. Recomputar el origen con Δ=0 para mostrar su
        // cargabilidad BASE (Antes = Después) en la tabla, sin el alivio ficticio;
        // anular el destino. Los gráficos de trafo se omiten en el frontend.
        $trafoOrig    = $trafoOrigRow ? analizarTrafo($trafoOrigRow, 0.0, 'alivio', 0.90, $mesesSel) : null;
        $trafoOrigMam = $trafoOrigRow
            ? analizarTrafoMesAMes($trafoOrigRow, array_fill_keys(array_keys($deltaInfo['serie_deltas']), 0.0), 'alivio', 0.90, $mesesSel)
            : null;
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

    // Traspaso forzado: el LZ seleccionado no es viable en el receptor (la BD no
    // registra troncal). La simulación corre igual, pero sin validación topológica.
    $traspasoForzado = false;
    foreach ($lzInfo['dispositivos'] ?? [] as $_d) {
        if (!empty($_d['seleccionado']) && ($_d['viable'] ?? true) === false) {
            $traspasoForzado = true;
            break;
        }
    }

    // ── Evaluación VCC equipos troncales del receptor ─────────────────────────
    // serie_deltas[mes] = I_alim_A_orig[mes] × p  →  corriente isla que entra en alim B
    // equipos_b viene del panel TSP; si no llega, se deriva del troncal LZ del
    // dispositivo seleccionado (evaluación autónoma, sin depender del panel).
    $vccAlimBEquipos = null;
    $atrOmitido = null;  // aviso: receptor con ATR pero corrección de tensión no anclada
    $equiposBReq = ($tipoDest === 'excel' && $nDest && is_array($b['equipos_b'] ?? null))
        ? $b['equipos_b'] : [];
    if ($tipoDest === 'excel' && $nDest && !$equiposBReq && !empty($lzInfo['tiene_lz'])) {
        $selDisp = null;
        foreach ($lzInfo['dispositivos'] as $_disp) {
            if (!empty($_disp['seleccionado'])) { $selDisp = $_disp; break; }
        }
        $selDisp = $selDisp ?? ($lzInfo['dispositivos'][0] ?? null);
        if ($selDisp && ($selDisp['viable'] ?? true)) {
            foreach ((array)($selDisp['equipos_troncal'] ?? []) as $_nEq) {
                if ($_nEq) $equiposBReq[] = ['nombre' => (string)$_nEq];
            }
        }
    }
    if ($tipoDest === 'excel' && $nDest && $equiposBReq) {
        $serieAdicionB = $deltaInfo['serie_deltas'] ?? [];
        $serieBFilt    = $mesesSel
            ? array_intersect_key($serieDest, array_flip($mesesSel))
            : $serieDest;

        $equiposBEval = [];
        foreach ($equiposBReq as $eqB) {
            $nombre = $eqB['nombre'] ?? '';
            if (!$nombre) continue;
            // CN: valor del panel → fallback a config guardada del equipo
            $cnEq = isset($eqB['cn']) && is_numeric($eqB['cn']) ? (float)$eqB['cn'] : null;
            if ($cnEq === null) {
                $cnCfg = ecGetEquipo($nombre)['corriente_a'] ?? null;
                if (is_numeric($cnCfg)) $cnEq = (float)$cnCfg;
            }
            $tipo = $eqB['tipo'] ?? tipoEquipo($nombre);
            if ($tipo === 'conductor_intermedio') {
                $equiposBEval[] = [
                    'nombre'   => "Conductor({$eqB['entre_b']})",
                    'tipo'     => 'conductor_intermedio',
                    'cn'       => $cnEq,
                    'fraccion' => isset($eqB['fraccion']) && is_numeric($eqB['fraccion']) ? (float)$eqB['fraccion'] : null,
                    'kva_down' => null,
                ];
            } else {
                $frac = calcularFraccionReco($dfAb, $nomDest, $nombre);
                $equiposBEval[] = array_merge($frac, [
                    'nombre' => $nombre,
                    'tipo'   => tipoEquipo($nombre),
                    'cn'     => $cnEq,
                ]);
            }
        }
        // ── Corrección de tensión por equipo (receptor) — topológica, multi-ATR ──
        // Cada equipo del troncal ve la corriente a su tensión local (tensionPorEquipoAtr).
        // La adición se referencia a la cabecera del origen: I_eq = serie × (V_cab_orig / V_eq).
        // La base (CN/demanda) se mide en la cabecera del receptor: ×(V_cab_dest / V_eq).
        $hayAtrDest = !empty($vmapDest);
        foreach ($equiposBEval as &$_eqB) {
            if (($_eqB['tipo'] ?? '') === 'conductor_intermedio') continue;
            $nB  = trim((string)($_eqB['nombre'] ?? ''));
            $vEq = ($hayAtrDest && $nB !== '' && isset($vmapDest[$nB]) && (float)$vmapDest[$nB] > 0)
                ? (float)$vmapDest[$nB] : $vCabDest;
            if ($vEq <= 0) $vEq = $vCabDest > 0 ? $vCabDest : 23.0;
            if ($hayAtrDest) {
                // Marca de tensión/badge por-equipo sólo si el receptor tiene ATR.
                $_eqB['tension_kv_override'] = $vEq;
                $_eqB['v_base_scale']        = $vEq > 0 ? $vCabDest / $vEq : 1.0;
            }
            $scale = $vEq > 0 ? $vCabOrig / $vEq : 1.0;
            if (abs($scale - 1.0) > 0.001) {
                $sc = [];
                foreach ($serieAdicionB as $__m => $__v) $sc[$__m] = round((float)$__v * $scale, 4);
                $_eqB['serie_adicion_override'] = $sc;
            }
        }
        unset($_eqB);

        // ── Aviso: corrección de tensión ATR no aplicada (silent $atB=null) ──
        // Si el receptor tiene ATR pero no se ancló ($atB null) y algún equipo del
        // troncal está aguas abajo del recloser de borde (cruza a 12 kV), la corrección
        // se omitió → esos equipos se muestran a 23 kV subestimados. Disparo topológico:
        // el caso legítimo (troncal que se queda en 23 kV) no cruza el borde → sin aviso.
        if (!$atB && $alimConfBc && !empty($alimConfBc['autotrafos']) && $equiposBEval) {
            foreach ($alimConfBc['autotrafos'] as $_at) {
                $tipo  = $_at['tipo'] ?? 'reductor';
                $bound = strtoupper(trim($tipo === 'elevador'
                    ? ($_at['rec_baja'] ?? '')
                    : (($_at['rec_alta'] ?? '') ?: ($_at['rec_baja'] ?? ''))));
                if ($bound === '') continue;
                $eqCruza = [];
                foreach ($equiposBEval as $_e) {
                    $nEq = strtoupper(trim($_e['nombre'] ?? ''));
                    if ($nEq === '' || ($_e['tipo'] ?? '') === 'conductor_intermedio' || $nEq === $bound) continue;
                    if (equipoEsAguasAbajoDe($dfAb, $nomDest, $bound, $_e['nombre'])) $eqCruza[] = $_e['nombre'];
                }
                if ($eqCruza) {
                    $atrOmitido = [
                        'feeder'  => $nomDest,
                        'tipo'    => $tipo,
                        'eq_alta' => trim((string)($_at['rec_alta'] ?? '')),
                        'eq_baja' => trim((string)($_at['rec_baja'] ?? '')),
                        'equipos' => $eqCruza,
                        'forzado' => $traspasoForzado,
                    ];
                    break;
                }
            }
        }

        if ($equiposBEval) {
            $vccAlimBEquipos = evaluarEquipos(
                equipos:      $equiposBEval,
                deltaI:       0.0,
                cnAlim:       is_nan($cnDest) ? null : $cnDest,
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
    // ── Info ATR para la nota del panel (solo si un ATR participa del traspaso) ──
    // Una nota sólo si el enlace CRUZA el ATR (V_tie ≠ V_cab de ese lado); un ATR
    // interno a la isla ya está reflejado en deltaMax y no genera nota.
    $atrNotas  = [];
    $origCruza = $atrOrigList && $vTie !== null && abs($vTie - $vCabOrig) > 0.001;
    $destCruza = $atrDestList && $vTie !== null && abs($vTie - $vCabDest) > 0.001;
    if ($origCruza && $atrOrigMatched) {
        $atrNotas[] = [
            'feeder'       => $nomOrig,
            'rol'          => 'entrega',
            'tipo'         => $atrOrigMatched['tipo'] ?? 'reductor',
            'eq_alta'      => trim((string)($atrOrigMatched['rec_alta'] ?? '')),
            'eq_baja'      => trim((string)($atrOrigMatched['rec_baja'] ?? '')),
            'tension_alta' => (float)($atrOrigMatched['tension_alta'] ?? 23),
        ];
    }
    if ($destCruza && $atB) {
        $atrNotas[] = [
            'feeder'       => $nomDest,
            'rol'          => 'recibe',
            'tipo'         => $atB['tipo'] ?? 'reductor',
            'eq_alta'      => trim((string)($atB['rec_alta'] ?? '')),
            'eq_baja'      => trim((string)($atB['rec_baja'] ?? '')),
            'tension_alta' => (float)($atB['tension_alta'] ?? 23),
        ];
    }
    $atrInfo = ($atrNotas || $atrWarning) ? [
        'notas'           => $atrNotas,
        'delta_entregado' => $deltaMax,
        'delta_recibido'  => $deltaMaxB,
        'v_cab_orig'      => $vCabOrig,
        'v_cab_dest'      => $vCabDest,
        'v_tie'           => $vTie,
        'transformado'    => $atrScale,
        'warning'         => $atrWarning,
    ] : null;

    jsonPy([
        'ok'                  => true,
        'atr_info'            => $atrInfo,
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
        'v_lz'                => $vLz,
        'traspaso_forzado'    => $traspasoForzado,
        'atr_omitido'         => $atrOmitido,
        'atr_warning'         => $atrWarning,
        'frg_orig'            => tlcAlimEsFrg($nomOrig),
        'frg_dest'            => $nomDest ? tlcAlimEsFrg($nomDest) : false,
        'serie_raw_orig'      => $serieOrigRaw['serie'] ?? [],
        'serie_raw_dest'      => $serieDestRaw['serie'] ?? [],
        'serie_raw_trafo_orig'=> serieRawDeFila($trafoOrigRowRaw ?? null),
        'serie_raw_trafo_dest'=> serieRawDeFila($trafoDestRowRaw ?? null),
        'vcc_alim_b_equipos'  => $vccAlimBEquipos,
    ]);
}
