<?php
// ══════════════════════════════════════════════════════════════════════════════
// Equipos Config — Configuración persistente por equipo (numpos)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/equipos/config ── todos los equipos configurados ────────────────
if ($method === 'GET' && $a === 'equipos' && $b0 === 'config' && !$b1) {
    jsonPy(ecGetTodos());
}

// ── GET /api/equipos/config/{numpos} ── configuración de un equipo ───────────
if ($method === 'GET' && $a === 'equipos' && $b0 === 'config' && $b1 && !$b2) {
    $numpos = urldecode($b1);
    $entry  = ecGetEquipo($numpos);
    if ($entry === null) jsonErr("Equipo '$numpos' no encontrado", 404);
    jsonPy($entry);
}

// ── POST /api/equipos/config/{numpos} ── crear o actualizar ──────────────────
if ($method === 'POST' && $a === 'equipos' && $b0 === 'config' && $b1 && !$b2) {
    $numpos = urldecode($b1);
    $body   = bodyJson();
    if (empty($numpos)) jsonErr('numpos requerido');
    try {
        $entry = ecSetEquipo($numpos, $body);
        jsonPy(['ok' => true, 'numpos' => $numpos, 'entry' => $entry]);
    } catch (Throwable $e) {
        jsonErr('Error al guardar: ' . $e->getMessage());
    }
}

// ── DELETE /api/equipos/config/{numpos} ── eliminar configuración ────────────
if ($method === 'DELETE' && $a === 'equipos' && $b0 === 'config' && $b1 && !$b2) {
    $numpos = urldecode($b1);
    ecDeleteEquipo($numpos);
    jsonPy(['ok' => true]);
}

// ── GET /api/equipos/todos?q=TERM&limit=N ─────────────────────────────────────
// Sin ?q: devuelve solo equipos configurados (rápido).
// Con ?q: filtra el índice completo por substring en numpos, máx ?limit (default 100).
if ($method === 'GET' && $a === 'equipos' && $b0 === 'todos' && !$b1) {
    $q           = strtoupper(trim($_GET['q'] ?? ''));
    $limit       = min(500, max(1, (int)($_GET['limit'] ?? 100)));
    $equipConfig = ecGetTodos();

    $buildEntry = function (string $npStr, array $info, ?array $cfg): array {
        $uAct = null;
        if ($cfg) {
            $uAct = $cfg['fecha_registro'] ?? null;
            foreach ($cfg['historial'] ?? [] as $h) {
                if (($h['fecha'] ?? '') > ($uAct ?? '')) $uAct = $h['fecha'];
            }
        }
        return [
            'numpos'           => $npStr,
            'feeders'          => $info['feeders'],
            'es_lz'            => $info['es_lz'],
            'tiene_config'     => $cfg !== null,
            'corriente_a'      => $cfg['corriente_a'] ?? null,
            'tipo_limite'      => $cfg['tipo_limite']  ?? null,
            'notas'            => $cfg['notas']        ?? null,
            'fecha_registro'   => $cfg['fecha_registro'] ?? null,
            'ultima_actividad' => $uAct,
        ];
    };

    if ($q === '') {
        // Solo configurados — no toca el índice completo
        $index  = cargarEquiposIndex();
        $result = [];
        foreach ($equipConfig as $npStr => $cfg) {
            $info     = $index[$npStr] ?? ['feeders' => [], 'es_lz' => false];
            $result[] = $buildEntry((string)$npStr, $info, $cfg);
        }
        usort($result, function ($a, $b) {
            $cmp = strcmp((string)($b['ultima_actividad'] ?? ''), (string)($a['ultima_actividad'] ?? ''));
            return $cmp !== 0 ? $cmp : strcmp((string)$a['numpos'], (string)$b['numpos']);
        });
    } else {
        // Búsqueda: filtra índice completo por substring, primero configurados
        $index  = cargarEquiposIndex();
        $result = [];
        foreach ($index as $np => $info) {
            $npStr = (string)$np;
            if (strpos(strtoupper($npStr), $q) === false) continue;
            $cfg      = $equipConfig[$npStr] ?? null;
            $result[] = $buildEntry($npStr, $info, $cfg);
            if (count($result) >= $limit) break;
        }
        usort($result, function ($a, $b) {
            if ($a['tiene_config'] !== $b['tiene_config']) return $b['tiene_config'] <=> $a['tiene_config'];
            return strcmp((string)$a['numpos'], (string)$b['numpos']);
        });
    }

    jsonOk($result);
}
