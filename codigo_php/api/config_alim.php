<?php
// ══════════════════════════════════════════════════════════════════════════════
// Alimentadores Config — Configuración persistente por alimentador (nom_alim)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/alimentadores/config ── todos los alimentadores configurados ─────
if ($method === 'GET' && $a === 'alimentadores' && $b0 === 'config' && !$b1) {
    jsonPy(acGetTodos());
}

// ── GET /api/alimentadores/config/{nom_alim} ──────────────────────────────────
if ($method === 'GET' && $a === 'alimentadores' && $b0 === 'config' && $b1 && !$b2) {
    $nom   = urldecode($b1);
    $entry = acGetAlim($nom);
    if ($entry === null) jsonErr("Sin configuración para '$nom'", 404);
    jsonPy($entry);
}

// ── POST /api/alimentadores/config/{nom_alim} ─────────────────────────────────
if ($method === 'POST' && $a === 'alimentadores' && $b0 === 'config' && $b1 && !$b2) {
    $nom  = urldecode($b1);
    $body = bodyJson();
    try {
        $entry = acSetAlim($nom, $body);
        jsonPy(['ok' => true, 'nom_alim' => $nom, 'entry' => $entry]);
    } catch (Throwable $e) {
        jsonErr('Error al guardar: ' . $e->getMessage());
    }
}

// ── DELETE /api/alimentadores/config/{nom_alim} ───────────────────────────────
if ($method === 'DELETE' && $a === 'alimentadores' && $b0 === 'config' && $b1 && !$b2) {
    $nom = urldecode($b1);
    acDeleteAlim($nom);
    jsonPy(['ok' => true]);
}

// ── GET /api/alimentadores/lista ── todos los nom_alim (desde índice cacheado) ─
if ($method === 'GET' && $a === 'alimentadores' && $b0 === 'lista' && !$b1) {
    $eqIdx = cargarEquiposIndex();
    $noms  = [];
    foreach ($eqIdx as $info) {
        foreach ($info['feeders'] as $f) $noms[$f] = true;
    }
    $noms = array_keys($noms);
    sort($noms);
    jsonOk($noms);
}

// ── GET /api/alimentadores/equipos/{nom_alim}?numalim=N ──────────────────────
// numalim viene del JS (state.feedersData) para evitar re-escanear dfAb
if ($method === 'GET' && $a === 'alimentadores' && $b0 === 'equipos' && $b1 && !$b2) {
    $nomAlim     = urldecode($b1);
    $numalim     = isset($_GET['numalim']) && is_numeric($_GET['numalim'])
                    ? (int)$_GET['numalim'] : null;
    $eqIdx       = cargarEquiposIndex();
    $equipConfig = ecGetTodos();

    $equipsList = [];
    foreach ($eqIdx as $np => $info) {
        if (!in_array($nomAlim, $info['feeders'], true)) continue;
        $npStr = (string)$np;
        $cfg   = $equipConfig[$npStr] ?? null;
        $equipsList[] = [
            'numpos'         => $npStr,
            'es_lz'          => $info['es_lz'],
            'tiene_config'   => $cfg !== null,
            'corriente_a'    => $cfg['corriente_a']   ?? null,
            'tipo_limite'    => $cfg['tipo_limite']    ?? null,
            'notas'          => $cfg['notas']          ?? null,
            'fecha_registro' => $cfg['fecha_registro'] ?? null,
        ];
    }

    usort($equipsList, function ($a, $b) {
        if ($a['tiene_config'] !== $b['tiene_config']) return $b['tiene_config'] <=> $a['tiene_config'];
        return strcmp((string)$a['numpos'], (string)$b['numpos']);
    });

    $condInter      = acGetAlim($nomAlim);
    $ajustesDemanda = $numalim !== null
        ? ['alim' => getAjustes('alim', $numalim), 'trafo' => getAjustes('trafo', $numalim)]
        : ['alim' => [], 'trafo' => []];

    jsonOk([
        'nom_alim'                => $nomAlim,
        'numalim'                 => $numalim,
        'equipos'                 => $equipsList,
        'conductores_intermedios' => $condInter['conductores_intermedios'] ?? [],
        'autotrafos'              => $condInter['autotrafos'] ?? [],
        'ajustes_demanda'         => $ajustesDemanda,
    ]);
}

// ── POST /api/alim/troncal_enriquecido ── equipos troncal de alim B con fracciones
if ($method === 'POST' && $a === 'alim' && $b0 === 'troncal_enriquecido') {
    $b   = bodyJson();
    $nom = trim($b['nom_alim'] ?? '');
    $eqs = $b['equipos']   ?? [];
    if (!$nom) jsonErr('nom_alim requerido');

    ['dfAb' => $dfAb] = gd();

    $upstream = array_map(fn($e) => [
        'nombre'      => (string)$e,
        'tipo'        => tipoEquipo((string)$e),
        'cn_opcional' => true,
        'cn'          => null,
    ], $eqs);

    $enriched = enriquecerUpstreamConFraccion($dfAb, $nom, $upstream);
    jsonOk(['equipos' => $enriched]);
}
