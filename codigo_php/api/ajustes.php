<?php
// ══════════════════════════════════════════════════════════════════════════════
// AJUSTES — rutas /api/ajustes
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ajustes ── lista todos los ajustes activos (Python compat) ────────
if ($method === 'GET' && $a === 'ajustes' && !$b0) {
    ['dfAlim' => $dfAlim, 'dfTrafo' => $dfTrafo] = gd();
    // Carga interna del archivo de ajustes
    $ajPath = dirname(__DIR__ . '/src/') . '/data/ajustes_demanda.json';
    // Ruta correcta: data/ está a nivel de codigo_php/
    $ajPath2 = __DIR__ . '/../data/ajustes_demanda.json';
    $rawData = [];
    if (is_file($ajPath2)) {
        $raw = file_get_contents($ajPath2);
        if ($raw !== false) {
            try { $rawData = json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?? []; } catch (\JsonException) {}
        }
    }
    $result = [];
    foreach ($rawData as $tipo => $porNumalim) {
        foreach ($porNumalim as $numalimStr => $ajustes) {
            if (empty($ajustes)) continue;
            $numalimInt = (int)$numalimStr;
            if ($tipo === 'alim') {
                $row    = $dfAlim[$numalimInt] ?? null;
                $nombre = $row ? nombreDisplayAlim($row) : $numalimStr;
            } else {
                $tRow   = $dfTrafo[$numalimInt] ?? null;
                $nombre = $tRow ? (trim((string)($tRow['barra'] ?? '')) ?: $numalimStr) : $numalimStr;
            }
            ksort($ajustes);
            $mesesAj = [];
            foreach ($ajustes as $mes => $valAj) {
                $valSql = null;
                try {
                    if ($tipo === 'alim' && isset($dfAlim[$numalimInt][$mes])) {
                        $v = $dfAlim[$numalimInt][$mes];
                        $valSql = is_numeric($v) ? (float)$v : null;
                    } elseif ($tipo === 'trafo' && isset($dfTrafo[$numalimInt][$mes])) {
                        $v = $dfTrafo[$numalimInt][$mes];
                        $valSql = is_numeric($v) ? (float)$v : null;
                    }
                } catch (Throwable) {}
                $mesesAj[] = ['mes' => $mes, 'valor_sql' => $valSql, 'valor_ajustado' => $valAj];
            }
            $result[] = ['tipo' => $tipo, 'numalim' => $numalimInt, 'nombre' => $nombre, 'ajustes' => $mesesAj];
        }
    }
    jsonPy($result);
}

// ── GET /api/ajustes/{tipo}/{numalim} ──────────────────────────────────────────
if ($method === 'GET' && $a === 'ajustes' && $b0 && $b1 && !$b2) {
    jsonOk(getAjustes($b0, (int)$b1));
}

// ── POST /api/ajustes/{tipo}/{numalim} ─────────────────────────────────────────
if ($method === 'POST' && $a === 'ajustes' && $b0 && $b1 && !$b2) {
    setAjustes($b0, (int)$b1, bodyJson());
    jsonPy(['ok' => true, 'ajustes' => getAjustes($b0, (int)$b1)]);
}

// ── DELETE /api/ajustes/{tipo}/{numalim}/{mes} ─────────────────────────────────
if ($method === 'DELETE' && $a === 'ajustes' && $b0 && $b1 && $b2) {
    if (!in_array($b0, ['alim', 'trafo'], true)) jsonErr("tipo debe ser 'alim' o 'trafo'");
    delAjuste($b0, (int)$b1, $b2);
    jsonPy(['ok' => true, 'ajustes' => getAjustes($b0, (int)$b1)]);
}
