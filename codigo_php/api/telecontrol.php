<?php
// ══════════════════════════════════════════════════════════════════════════════
// TELECONTROL — rutas /api/telecontrol/*
//   GET  /api/telecontrol/status   → metadata del caché (fecha, n_equipos…)
//   POST /api/telecontrol/refresh  → regenera caché desde telecontrol_systems
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/telecontrol/status ───────────────────────────────────────────────
if ($method === 'GET' && $a === 'telecontrol' && $b0 === 'status' && !$b1) {
    jsonOk(tlcStatus());
}

// ── POST /api/telecontrol/refresh ─────────────────────────────────────────────
if ($method === 'POST' && $a === 'telecontrol' && $b0 === 'refresh' && !$b1) {
    try {
        $data = tlcRefrescar();
        jsonOk([
            'message'    => 'Caché TLC actualizado',
            'generado'   => $data['generado'],
            'n_equipos'  => count($data['equipos']  ?? []),
            'n_frg_alim' => count($data['frg_alim'] ?? []),
            'n_frg_ssee' => count($data['frg_ssee'] ?? []),
        ]);
    } catch (\Throwable $e) {
        jsonErr('Error al regenerar caché TLC: ' . $e->getMessage());
    }
}
