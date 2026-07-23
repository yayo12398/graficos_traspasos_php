<?php
declare(strict_types=1);

/**
 * Telecontrol.php — Caché mensual de equipos telecontrolados y FRG.
 *
 * Fuente: telecontrol_systems.equipo (db_tlc())
 * Caché:  data/cache/telecontrol.json
 *
 * Estructura JSON:
 *   generado  : "YYYY-MM-DDTHH:MM:SS"
 *   mes       : "YYYY-MM"
 *   equipos   : { "REC123": { tlc: true, frg: true }, ... }
 *   frg_alim  : ["NOM73123", ...]   ← alimentadores con al menos un equipo FRG
 *   frg_ssee  : ["SSEE_X", ...]
 */

function _tlcPath(): string
{
    return dirname(__DIR__) . '/data/cache/telecontrol.json';
}

function _tlcData(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;
    $path = _tlcPath();
    if (!file_exists($path)) return $cache = [];
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') return $cache = [];
    $data = json_decode($raw, true);
    return $cache = (is_array($data) ? $data : []);
}

function tlcRefrescar(): array
{
    $rows = db_tlc()->query("
        SELECT UPPER(TRIM(te.nombre))      AS tipo,
               e.numpos,
               UPPER(TRIM(e.frg))          AS frg,
               UPPER(TRIM(e.alimentador_1)) AS alim1,
               UPPER(TRIM(e.subestacion_1)) AS ssee1
        FROM equipo e
        LEFT JOIN tipo_equipo te ON e.tipo_equipo = te.id_tipo_equipo
        WHERE e.estado NOT IN (3, 5)
    ")->fetchAll();

    $equipos = [];
    $frgAlim = [];
    $frgSsee = [];

    foreach ($rows as $r) {
        $tipo   = trim($r['tipo']   ?? '');
        $numpos = trim((string)($r['numpos'] ?? ''));
        if ($tipo === '' || $numpos === '') continue;

        $key   = $tipo . $numpos;
        $esFrg = ($r['frg'] ?? '') === 'SI';
        $equipos[$key] = ['tlc' => true, 'frg' => $esFrg];

        if ($esFrg) {
            $alim = trim($r['alim1'] ?? '');
            $ssee = trim($r['ssee1'] ?? '');
            if ($alim !== '' && !in_array($alim, $frgAlim, true)) $frgAlim[] = $alim;
            if ($ssee !== '' && !in_array($ssee, $frgSsee, true)) $frgSsee[] = $ssee;
        }
    }

    $data = [
        'generado' => date('Y-m-d\TH:i:s'),
        'mes'      => date('Y-m'),
        'equipos'  => $equipos,
        'frg_alim' => $frgAlim,
        'frg_ssee' => $frgSsee,
    ];

    file_put_contents(
        _tlcPath(),
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );

    return $data;
}

function tlcEsTlc(string $nombre): bool
{
    $equipos = _tlcData()['equipos'] ?? [];
    return isset($equipos[strtoupper(trim($nombre))]);
}

function tlcEsFrg(string $nombre): bool
{
    $equipos = _tlcData()['equipos'] ?? [];
    return ($equipos[strtoupper(trim($nombre))]['frg'] ?? false) === true;
}

function tlcAlimEsFrg(string $nomAlim): bool
{
    if ($nomAlim === '') return false;
    $nom  = strtoupper(trim($nomAlim));
    foreach (_tlcData()['frg_alim'] ?? [] as $a) {
        if (strtoupper(trim($a)) === $nom) return true;
    }
    return false;
}

function tlcStatus(): array
{
    $path = _tlcPath();
    if (!file_exists($path)) {
        return ['existe' => false, 'generado' => null, 'mes' => null,
                'n_equipos' => 0, 'n_frg_alim' => 0, 'n_frg_ssee' => 0, 'mtime' => null];
    }
    $data = _tlcData();
    return [
        'existe'     => true,
        'generado'   => $data['generado'] ?? null,
        'mes'        => $data['mes']      ?? null,
        'n_equipos'  => count($data['equipos']  ?? []),
        'n_frg_alim' => count($data['frg_alim'] ?? []),
        'n_frg_ssee' => count($data['frg_ssee'] ?? []),
        'mtime'      => date('Y-m-d H:i:s', (int)filemtime($path)),
    ];
}
