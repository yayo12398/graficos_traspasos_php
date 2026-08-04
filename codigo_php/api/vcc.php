<?php
// ══════════════════════════════════════════════════════════════════════════════
// VCC — Validación de Conexión de Cliente
// ══════════════════════════════════════════════════════════════════════════════

// ── Helper: aplica delta_I_override por equipo cuando hay autotrafo ──────────
// Equipos con fraccion >= fraccion del boundary usan ΔI a tension_alta (23kV).
// Equipos por debajo usan ΔI a la tensión de conexión del cliente.
// Devuelve el ATR cuyo rec_alta (o rec_baja si no hay rec_alta) aparece en el upstream.
// Soporta ATRs sin rec_alta: feeder que nace en alta tensión, identificado solo por rec_baja.
function _autotrafoEncontrar(array $upstream, ?array $alimConf): ?array
{
    $autotrafos = $alimConf['autotrafos'] ?? [];
    if (empty($autotrafos)) return null;
    $nombresUp = [];
    foreach ($upstream as $eq) { if (isset($eq['nombre'])) $nombresUp[$eq['nombre']] = true; }
    foreach ($autotrafos as $at) {
        if (($at['rec_alta'] ?? '') !== '' && isset($nombresUp[$at['rec_alta']])) return $at;
    }
    // Fallback: ATR sin rec_alta (feeder nace en alta) — se identifica por rec_baja en upstream
    foreach ($autotrafos as $at) {
        if (($at['rec_alta'] ?? '') === '' && ($at['rec_baja'] ?? '') !== '' && isset($nombresUp[$at['rec_baja']])) return $at;
    }
    return null;
}

function _autotrafoAplicar(array $upstream, ?array $alimConf, float $kvaEmp, float $tensionKv): array
{
    $at = _autotrafoEncontrar($upstream, $alimConf);
    if (!$at) return $upstream;
    $recAlta     = $at['rec_alta']    ?? '';
    $recBaja     = $at['rec_baja']    ?? '';
    $tensionAlta = (float)($at['tension_alta'] ?? 23);
    $tipo        = $at['tipo'] ?? 'reductor';
    if ($tensionAlta === $tensionKv) return $upstream;

    // Elevador: boundary en rec_baja (trunk 12kV). Reductor: boundary en rec_alta si existe, sino rec_baja.
    $boundaryRef  = ($tipo === 'elevador') ? $recBaja : ($recAlta ?: $recBaja);
    $boundaryFrac = null;
    foreach ($upstream as $eq) {
        if (($eq['nombre'] ?? '') === $boundaryRef) {
            $f = $eq['fraccion'] ?? null;
            if ($f !== null && is_numeric($f)) $boundaryFrac = (float)$f;
            break;
        }
    }
    if ($boundaryFrac === null) return $upstream;

    $dIAlta = deltaICliente($kvaEmp, $tensionAlta);
    $dIBaja = deltaICliente($kvaEmp, $tensionKv);

    return array_map(function (array $eq) use ($tipo, $boundaryFrac, $dIAlta, $dIBaja, $tensionAlta, $tensionKv, $recAlta, $recBaja): array {
        $frac   = isset($eq['fraccion']) && is_numeric($eq['fraccion']) ? (float)$eq['fraccion'] : null;
        $nombre = $eq['nombre'] ?? '';
        if ($tipo === 'elevador') {
            // Elevador: trunk 12kV upstream (≥ boundary), rama 23kV downstream (< boundary)
            if ($recBaja && $nombre === $recBaja) {
                $eq['delta_I_override']    = $dIBaja;
                $eq['tension_kv_override'] = $tensionKv;
            } elseif ($recAlta && $nombre === $recAlta) {
                $eq['delta_I_override']    = $dIAlta;
                $eq['tension_kv_override'] = $tensionAlta;
            } elseif ($frac !== null && $frac >= $boundaryFrac) {
                $eq['delta_I_override']    = $dIBaja;
                $eq['tension_kv_override'] = $tensionKv;
            } else {
                $eq['delta_I_override']    = $dIAlta;
                $eq['tension_kv_override'] = $tensionAlta;
            }
        } else {
            // Reductor (default): upstream 23kV (≥ boundary), downstream 12kV (< boundary)
            if ($recBaja && $nombre === $recBaja) {
                $eq['delta_I_override']    = $dIBaja;
                $eq['tension_kv_override'] = $tensionKv;
            } elseif ($frac !== null && $frac >= $boundaryFrac) {
                $eq['delta_I_override']    = $dIAlta;
                $eq['tension_kv_override'] = $tensionAlta;
            } else {
                $eq['delta_I_override']    = $dIBaja;
                $eq['tension_kv_override'] = $tensionKv;
            }
        }
        return $eq;
    }, $upstream);
}

// ── GET /api/vcc/equipos/{nom_alim}?modo=equipos|tp|tps_at ──────────────────────
// modo=equipos (default): lista de equipos upstream enriquecida para el cache del JS
//   → {numpos, nombre, tipo, cn, cn_opcional, fraccion, kva_down, kva_total, tds_down, ...}
// modo=tp: lista de TDs del feeder → {numpos, nombre, kva, tipo}
// modo=tps_at: TDs agrupados por segmento de tensión → {segmentos:[{orden,label,tension_kv,rec_borde,tipo,n,kva,tps}]}
//   Cabecera + un segmento por ATR (disjuntos: cada TD al borde más profundo que lo contiene).
if ($method === 'GET' && $a === 'vcc' && $b0 === 'equipos' && $b1 && !$b2) {
    $nomAlim = urldecode($b1);
    $modo    = $_GET['modo'] ?? 'equipos';
    ['dfAb' => $dfAb] = gd();
    $nomUp   = strtoupper(trim($nomAlim));

    if ($modo === 'tps_at') {
        // Segmentos de tensión del feeder: cabecera (23 kV, o 12 si el feeder nace en baja)
        // + un segmento por ATR. Disjuntos: cada TD se asigna al borde más profundo (set
        // aguas-abajo más pequeño) que lo contiene → sin doble conteo en cascada ni cruce
        // entre ramas paralelas. Vista informativa (solo la consume el panel de config).
        $alimConf = acGetAlim($nomAlim);
        $ats      = $alimConf['autotrafos'] ?? [];
        if (!$ats) jsonOk(['segmentos' => []]);

        // Universo de TDs del feeder: numpos_td únicos con su fila (para kVA/nombre y orden).
        $rowByTd = []; $ordenTd = [];
        foreach (tdsDeFeeder($dfAb, $nomAlim) as $r) {
            $np = (string)($r['numpos_td'] ?? '');
            if ($np === '' || isset($rowByTd[$np])) continue;
            $rowByTd[$np] = $r;
            $ordenTd[]    = $np;
        }

        // Por cada ATR: borde downstream + set de TDs aguas abajo (mismo criterio que la
        // frontera del flujo single-ATR anterior: tdsDeEquipo por nombre del borde).
        $segMeta = [];
        foreach ($ats as $at) {
            $tipo    = ($at['tipo'] ?? 'reductor') === 'elevador' ? 'elevador' : 'reductor';
            $recAlta = trim((string)($at['rec_alta'] ?? ''));
            $recBaja = trim((string)($at['rec_baja'] ?? ''));
            $borde   = $tipo === 'elevador' ? $recAlta : ($recBaja ?: $recAlta);
            if ($borde === '') continue;
            $set = [];
            foreach (tdsDeEquipo($dfAb, $borde) as $r) {
                $np = (string)($r['numpos_td'] ?? '');
                if ($np !== '' && isset($rowByTd[$np])) $set[$np] = true;
            }
            if (!$set) continue;
            $segMeta[] = ['borde' => $borde, 'tipo' => $tipo,
                          'tension' => $tipo === 'elevador' ? 23 : 12,
                          'set' => $set, 'size' => count($set)];
        }

        // Asignar cada TD al borde más profundo (set más pequeño) que lo contiene; -1 = cabecera.
        $grupos = [-1 => []];
        foreach ($segMeta as $i => $_) $grupos[$i] = [];
        foreach ($ordenTd as $np) {
            $best = -1; $bestSize = PHP_INT_MAX;
            foreach ($segMeta as $i => $m) {
                if (isset($m['set'][$np]) && $m['size'] < $bestSize) { $best = $i; $bestSize = $m['size']; }
            }
            $grupos[$best][] = $np;
        }

        $buildSeg = function(array $nps) use ($rowByTd): array {
            $n = 0; $kva = 0.0; $list = [];
            foreach ($nps as $np) {
                $r = $rowByTd[$np] ?? null; if (!$r) continue;
                $n++; $kva += (float)($r['potencia'] ?? 0);
                $list[] = ['numpos' => $np, 'nombre' => (string)($r['nombre'] ?? ''),
                           'kva' => (float)($r['potencia'] ?? 0)];
            }
            usort($list, fn($a, $b) => ($b['kva'] ?? 0) <=> ($a['kva'] ?? 0));
            return ['n' => $n, 'kva' => round($kva, 0), 'tps' => array_slice($list, 0, 30)];
        };

        // Cabecera: 12 kV solo si el feeder es enteramente elevador (nace en baja), else 23 kV.
        $todoElevador = $segMeta && !array_filter($segMeta, fn($m) => $m['tipo'] !== 'elevador');
        $segmentos = [array_merge(
            ['orden' => 0, 'label' => 'Cabecera', 'tension_kv' => $todoElevador ? 12 : 23,
             'rec_borde' => null, 'tipo' => null],
            $buildSeg($grupos[-1]))];

        // Segmentos de ATR de menos a más profundo (set grande → chico).
        $ordenSeg = array_keys($segMeta);
        usort($ordenSeg, fn($x, $y) => $segMeta[$y]['size'] <=> $segMeta[$x]['size']);
        $orden = 1;
        foreach ($ordenSeg as $i) {
            $seg = $buildSeg($grupos[$i]);
            if ($seg['n'] === 0) continue;
            $m = $segMeta[$i];
            $segmentos[] = array_merge(
                ['orden' => $orden++, 'label' => 'Segmento ' . $m['borde'],
                 'tension_kv' => $m['tension'], 'rec_borde' => $m['borde'], 'tipo' => $m['tipo']],
                $seg);
        }

        jsonOk(['segmentos' => $segmentos]);
    }

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
    // Tensión por equipo según el segmento del ATR ([] si el feeder no tiene autotrafo).
    $tensionMap = tensionPorEquipoAtr($dfAb, $nomAlim, acGetAlim($nomAlim)['autotrafos'] ?? []);
    $result = [];
    foreach ($clasificados as $eq) {
        $frac = in_array($eq['tipo'], ['reconectador', 'equipo_sub'], true)
            ? calcularFraccionReco($dfAb, $nomAlim, $eq['nombre'])
            : ['kva_down' => null, 'kva_total' => null, 'fraccion' => null,
               'tds_down' => null, 'tds_con_kva' => null, 'tds_sin_kva' => null];
        // 'numpos' es el identificador de equipo; 'nombre' es el mismo valor (numpos_equip)
        $result[] = array_merge($eq, $frac, [
            'numpos'     => $eq['nombre'],
            'tlc'        => tlcEsTlc($eq['nombre']),
            'tension_kv' => $tensionMap[$eq['nombre']] ?? null,
        ]);
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
    $alimConf  = acGetAlim($nomAlim);
    $autotrafo = _autotrafoEncontrar($upstream, $alimConf);
    $upstream  = _autotrafoAplicar($upstream, $alimConf, $kvaEmp, $tensionKv);
    $deltaI    = deltaICliente($kvaEmp, $tensionKv);
    // Cargabilidad feeder/trafo: reductor→ usar tension_alta (feeder en AT); elevador→ trunk 12kV
    $tipoAt      = $autotrafo['tipo'] ?? 'reductor';
    $tensionAlim = $autotrafo
        ? (($tipoAt === 'elevador') ? 12.0 : (float)($autotrafo['tension_alta'] ?? 23))
        : $tensionKv;
    $deltaIAlim  = deltaICliente($kvaEmp, $tensionAlim);
    $mesesSel  = $b['meses_sel'] ?? [];
    $dtA       = (float)($b['delta_traspaso_a']   ?? 0);
    $dtPct     = (float)($b['delta_traspaso_pct'] ?? 0);
    $trafoRow  = trafoDeFeeder($dfTrafo, $numalim);
    $trafoRow  = $trafoRow ? aplicarAjustesFila($trafoRow, 'trafo', $numalim) : null;
    $serieAlim = obtenerSerieAlim($dfAlim, $numalim);
    // Alivio por traspaso: la isla completa fluía por los equipos upstream → se resta entera.
    // NO se aplica proporcional a fraccion: todos los equipos aguas arriba del equipo_abre
    // llevaban los mismos 64.7 A de la isla, sin importar su fraccion individual.
    $cnRaw      = $serieAlim['cn'];
    $cnAlim     = is_finite($cnRaw) ? $cnRaw : null;
    $serieAlivio  = null;   // [mes => ΔI_isla [A]] por mes
    $alivioA_abs  = null;   // reducción absoluta en escenario CN (Enfoque A)
    if ($dtPct > 0) {
        $serieAlivio = [];
        foreach ($serieAlim['serie'] as $mes => $val) {
            $serieAlivio[$mes] = is_numeric($val) ? round((float)$val * ($dtPct / 100.0), 2) : 0.0;
        }
        $alivioA_abs = $cnAlim !== null ? round($cnAlim * ($dtPct / 100.0), 2) : null;
    } elseif ($dtA > 0) {
        $serieAlivio = array_fill_keys(array_keys($serieAlim['serie']), (float)$dtA);
        $alivioA_abs = (float)$dtA;
    }
    $equipos = evaluarEquipos(
        $upstream, $deltaI, $cnAlim, $serieAlim['serie'], $mesesSel ?: null,
        $serieAlivio, $alivioA_abs
    );
    $vcc       = calcularVcc($dfAlim, $numalim, $trafoRow, $deltaIAlim, $mesesSel, $dtA, $dtPct);

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
        'autotrafo'           => $autotrafo,
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
        $kvaInst        = (float)$b['kva_instalado'];
        $dISens         = deltaICliente($kvaInst, $tensionKv);
        $dIAlimSens     = deltaICliente($kvaInst, $tensionAlim);
        $upstreamSens   = _autotrafoAplicar($upstream, $alimConf, $kvaInst, $tensionKv);
        $vccSens        = calcularVcc($dfAlim, $numalim, $trafoRow, $dIAlimSens, $mesesSel, $dtA, $dtPct);
        $eqSens = evaluarEquipos(
            $upstreamSens, $dISens, $cnAlim, $serieAlim['serie'], $mesesSel ?: null,
            $serieAlivio, $alivioA_abs
        );
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

    // ── Análisis del alimentador receptor (traspaso simultáneo) ──────────────
    $nomAlimDest = trim((string)($b['nom_alim_dest'] ?? ''));
    $numalimDest = (int)($b['numalim_dest']          ?? 0);
    $equipoLzB   = trim((string)($b['equipo_lz']     ?? ''));
    $eqTroncalB  = $b['equipos_troncal_b']           ?? [];
    $alivioAPeor = (float)($result['alivio_A_peor']  ?? 0.0);

    // Normalizar: soporta lista de strings (legado) o lista de objetos con cn
    $eqNombresB   = [];
    $eqCNsFromReq = [];
    $eqCondsB     = [];
    foreach ((array)$eqTroncalB as $item) {
        if (is_string($item)) {
            $eqNombresB[] = $item;
        } elseif (is_array($item)) {
            if (($item['tipo'] ?? '') === 'conductor_intermedio') {
                $eqCondsB[] = $item;
            } else {
                $nombre = trim((string)($item['nombre'] ?? ''));
                if ($nombre) {
                    $eqNombresB[] = $nombre;
                    if (isset($item['cn']) && is_numeric($item['cn'])) {
                        $eqCNsFromReq[$nombre] = (float)$item['cn'];
                    }
                }
            }
        }
    }

    if ($nomAlimDest && (!empty($eqNombresB) || !empty($eqCondsB)) && $alivioAPeor > 0.0) {
        $nmDest = $numalimDest ?: (numalimDeNomAlim($dfAb, $nomAlimDest) ?? 0);
        if ($nmDest) {
            $nullFrac      = ['kva_down'=>null,'kva_total'=>null,'fraccion'=>null,
                              'tds_down'=>null,'tds_con_kva'=>null,'tds_sin_kva'=>null];
            $clasificadosB = _vccClasificarUpstream($eqNombresB);
            $equiposBEnrich = [];

            foreach ($clasificadosB as $eq) {
                $nombre = $eq['nombre'];
                $frac   = in_array($eq['tipo'], ['reconectador','equipo_sub'], true)
                        ? calcularFraccionReco($dfAb, $nomAlimDest, $nombre)
                        : $nullFrac;
                // CN: usuario (request) > equipos_config
                if (array_key_exists($nombre, $eqCNsFromReq)) {
                    $cn     = $eqCNsFromReq[$nombre] ?: null;
                    $fuente = 'usuario';
                } else {
                    $cfg    = ecGetEquipo($nombre);
                    $cn     = $cfg ? ((float)($cfg['corriente_a'] ?? 0) ?: null) : null;
                    $fuente = $cfg ? 'config' : 'sin_config';
                }
                $cfg = ecGetEquipo($nombre);
                $equiposBEnrich[] = array_merge($eq, $frac, [
                    'cn'           => $cn,
                    'tipo_limite'  => $cfg['tipo_limite'] ?? null,
                    'fuente_ajuste'=> $fuente,
                    'numpos'       => $nombre,
                ]);
            }

            // Conductores intermedios definidos por el usuario en el panel B
            foreach ($eqCondsB as $cond) {
                $cn   = isset($cond['cn']) && is_numeric($cond['cn']) ? (float)$cond['cn'] : null;
                $frac = isset($cond['fraccion']) && is_numeric($cond['fraccion']) ? (float)$cond['fraccion'] : null;
                $entreB = (string)($cond['entre_b'] ?? '');
                $equiposBEnrich[] = array_merge($nullFrac, [
                    'nombre'       => "Conductor({$entreB})",
                    'tipo'         => 'conductor_intermedio',
                    'cn'           => $cn,
                    'fraccion'     => $frac,
                    'fuente_ajuste'=> 'usuario',
                    'numpos'       => "Conductor({$entreB})",
                ]);
            }

            // Serie y trafo de B
            $serieBData = obtenerSerieAlim($dfAlim, $nmDest);
            $trafoB     = trafoDeFeeder($dfTrafo, $nmDest);
            if ($trafoB !== null) $trafoB = aplicarAjustesFila($trafoB, 'trafo', $nmDest);

            $cnB          = is_finite($serieBData['cn']) ? $serieBData['cn'] : null;
            $equiposEvalB = $equiposBEnrich
                ? evaluarEquipos($equiposBEnrich, $alivioAPeor, $cnB, $serieBData['serie'], $mesesSel ?: null)
                : [];

            $vccB    = calcularVcc($dfAlim, $nmDest, $trafoB, $alivioAPeor, $mesesSel);
            $pctMaxB = null; $mesMaxB = '';
            foreach ($vccB['tabla_alim'] ?? [] as $rB) {
                $pB = $rB['uso_despues_pct'] ?? null;
                if ($pB !== null && ($pctMaxB === null || $pB > $pctMaxB)) {
                    $pctMaxB = $pB; $mesMaxB = $rB['mes'] ?? '';
                }
            }

            $result['analisis_destino'] = [
                'nom_alim'     => $nomAlimDest,
                'numalim'      => $nmDest,
                'equipo_lz'    => $equipoLzB ?: null,
                'delta_I'      => round($alivioAPeor, 2),
                'cn_alim'      => $cnB,
                'equipos_eval' => $equiposEvalB,
                'tabla_alim'   => $vccB['tabla_alim']  ?? null,
                'tabla_trafo'  => $vccB['tabla_trafo'] ?? null,
                'pct_max_alim' => $pctMaxB,
                'mes_max_alim' => $mesMaxB,
                'resumen_alim' => resumenEstados($vccB['tabla_alim'] ?? []),
            ];
        }
    }

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
    $alimConf2  = acGetAlim($nomAlim);
    $autotrafo2 = _autotrafoEncontrar($upstream, $alimConf2);
    $upstream   = _autotrafoAplicar($upstream, $alimConf2, $kvaEmp, $tensionKv);
    $deltaI     = deltaICliente($kvaEmp, $tensionKv);
    // Cargabilidad feeder/trafo: reductor→ usar tension_alta (feeder en AT); elevador→ trunk 12kV
    $tipoAt2      = $autotrafo2['tipo'] ?? 'reductor';
    $tensionAlim2 = $autotrafo2
        ? (($tipoAt2 === 'elevador') ? 12.0 : (float)($autotrafo2['tension_alta'] ?? 23))
        : $tensionKv;
    $deltaIAlim2  = deltaICliente($kvaEmp, $tensionAlim2);
    $mesesSel   = $b['meses_sel'] ?? [];
    $dtA        = (float)($b['delta_traspaso_a']   ?? 0);
    $dtPct      = (float)($b['delta_traspaso_pct'] ?? 0);
    $trafoRow   = trafoDeFeeder($dfTrafo, $numalim);
    $trafoRow   = $trafoRow ? aplicarAjustesFila($trafoRow, 'trafo', $numalim) : null;
    $serieAlim  = obtenerSerieAlim($dfAlim, $numalim);
    $equipos    = evaluarEquipos($upstream, $deltaI, $serieAlim['cn'], $serieAlim['serie'], $mesesSel ?: null);
    $vcc        = calcularVcc($dfAlim, $numalim, $trafoRow, $deltaIAlim2, $mesesSel, $dtA, $dtPct);

    $result = array_merge($vcc, [
        'nombre_alim'        => $nomAlim,
        'numalim'            => $numalim,
        'punto'              => $punto,
        'upstream'           => $upstream,
        'equipos_eval'       => $equipos,
        'delta_I'            => $deltaI,
        'autotrafo'          => $autotrafo2,
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
        $kvaInst        = (float)$b['kva_instalado'];
        $deltaISens     = deltaICliente($kvaInst, $tensionKv);
        $dIAlimSens2    = deltaICliente($kvaInst, $tensionAlim2);
        $upstreamSens   = _autotrafoAplicar($upstream, $alimConf2, $kvaInst, $tensionKv);
        $vccSens        = calcularVcc($dfAlim, $numalim, $trafoRow, $dIAlimSens2, $mesesSel, $dtA, $dtPct);
        $equipSens    = evaluarEquipos($upstreamSens, $deltaISens, $serieAlim['cn'], $serieAlim['serie'], $mesesSel ?: null);
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
