<?php

const _REP_CHARTJS_CDN   = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
const _REP_TD_GRANDE_KVA = 300;
const _REP_CJS_ESTADO_BG = [
    'viable'    => 'rgba(46,204,113,0.82)',
    'prealerta' => 'rgba(230,126,34,0.82)',
    'critico'   => 'rgba(231,76,60,0.85)',
    'sin_datos' => 'rgba(150,150,150,0.45)',
];
const _REP_CJS_ESTADO_BRD = [
    'viable'    => 'rgba(39,174,96,1)',
    'prealerta' => 'rgba(211,84,0,1)',
    'critico'   => 'rgba(192,57,43,1)',
    'sin_datos' => 'rgba(120,120,120,1)',
];
const _REP_ETIQUETAS = [
    'viable' => 'Viable', 'prealerta' => 'Prealerta',
    'critico' => 'Crítico', 'sin_datos' => 'Sin datos',
];
const _REP_MESES_ES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const _REP_ESTADO_BADGE_VCC = [
    'viable'    => ['badge-v', 'Viable'],
    'prealerta' => ['badge-p', 'Prealerta'],
    'critico'   => ['badge-c', 'Crítico'],
    'sin_cn'    => ['badge-s', 'Sin ajuste'],
];
const _REP_ESTADO_BG_VCC = [
    'viable' => '#E8F7EE', 'prealerta' => '#FEF3E2', 'critico' => '#FCECEA',
];

function _repCss(): string {
    return <<<'CSS'
body { font-family: Segoe UI, Arial, sans-serif; margin: 30px; color: #2c3e50; }
h1   { font-size: 1.5em; border-bottom: 2px solid #2980b9; padding-bottom: 6px; }
h2   { font-size: 1.15em; margin-top: 28px; color: #2980b9; }
.resumen { display: flex; flex-wrap: wrap; gap: 14px; margin: 16px 0; }
.card    { background: #f4f6f8; border-radius: 8px; padding: 14px 20px; min-width: 160px; }
.card strong { display: block; font-size: 1.5em; color: #2c3e50; }
.card span   { font-size: 0.85em; color: #7f8c8d; }
.tabla-sim { border-collapse: collapse; width: 100%; font-size: 0.88em; }
.tabla-sim th { background: #2980b9; color: white; padding: 6px 10px; text-align: left; white-space: nowrap; }
.tabla-sim th.r { text-align: right; }
.tabla-sim th.c { text-align: center; }
.tabla-sim td { padding: 5px 10px; border-bottom: 1px solid #e0e0e0; text-align: left; }
.tabla-sim td.r { text-align: right; font-variant-numeric: tabular-nums; }
.tabla-sim td.c { text-align: center; }
.badge-v  { background: #2ecc71; color: white; border-radius: 4px; padding: 2px 8px; }
.badge-p  { background: #f39c12; color: white; border-radius: 4px; padding: 2px 8px; }
.badge-c  { background: #e74c3c; color: white; border-radius: 4px; padding: 2px 8px; }
.badge-equipo    { background: #0dcaf0; color: #000; border-radius: 4px; padding: 1px 6px; font-size:.7em; }
.badge-conductor { background: #ffc107; color: #000; border-radius: 4px; padding: 1px 6px; font-size:.7em; }
img { max-width: 100%; margin: 12px 0; border: 1px solid #ddd; border-radius: 6px; }
.footer { margin-top: 40px; font-size: 0.78em; color: #aaa; }
.metrica-lbl { font-weight: 600; white-space: nowrap; background: #f8f9fa; }
details.bloque { margin-top: 10px; }
details.bloque > summary {
  cursor: pointer; list-style: none; user-select: none;
  background: #f0f4fa; border: 1px solid #d0dcea; border-radius: 6px;
  padding: 7px 14px; font-weight: 600; font-size: 0.88em; color: #2980b9;
}
details.bloque > summary::-webkit-details-marker { display: none; }
details.bloque > summary::before { content: "▶ "; font-size: 0.75em; }
details.bloque[open] > summary { border-radius: 6px 6px 0 0; border-bottom: none; }
details.bloque[open] > summary::before { content: "▼ "; }
details.bloque > .bloque-body {
  border: 1px solid #d0dcea; border-top: none;
  border-radius: 0 0 6px 6px; padding: 10px;
  overflow-x: auto;
}
.cambio-topo {
  background: #fff8e1; border-left: 4px solid #f5a623;
  padding: 8px 12px; margin: 8px 0; border-radius: 4px;
  font-size: .9em;
}
.inversion-flujo {
  background: #e8f4fd; border-left: 4px solid #2980b9;
  padding: 8px 12px; margin: 8px 0; border-radius: 4px;
  font-size: .9em;
}
.inversion-flujo .nota { margin: 4px 0 0; font-size: .85em; color: #555; }
.ajuste-nota {
  background: #fffbea; border-left: 4px solid #f5a623;
  padding: 8px 12px; margin: 8px 0; border-radius: 4px;
  font-size: .88em;
}
.aj-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: .85em; }
.aj-table th, .aj-table td { border: 1px solid #e0d4a0; padding: 3px 8px; text-align: left; }
.aj-table thead { background: #fdf0c0; }
.aj-nota { display: block; margin-top: 4px; color: #666; font-size: .82em; }
.badge-eq-tipo {
  display: inline-block; background: #f39c12; color: #fff;
  border-radius: 3px; padding: 1px 5px; font-size: .78em;
  font-weight: bold; margin-right: 2px;
}
details.equip-det { margin: 10px 0; border-radius: 6px; overflow: hidden; }
details.equip-det > summary {
  cursor: pointer; padding: 8px 14px; font-weight: 600; font-size: .9em;
  list-style: none; display: flex; align-items: center; gap: 6px;
}
details.equip-det > summary::-webkit-details-marker { display: none; }
details.equip-det.troncal > summary { background: #e8f4fd; color: #1a5276; border-left: 4px solid #2980b9; }
details.equip-det.isla    > summary { background: #fef9e7; color: #7d6608; border-left: 4px solid #f39c12; }
details.equip-det > .equip-det-body { padding: 10px 14px; border: 1px solid #ddd; border-top: none; }
.eq-tabla { width: 100%; border-collapse: collapse; font-size: .85em; margin: 4px 0; }
.eq-tabla th, .eq-tabla td { border: 1px solid #e0e0e0; padding: 4px 8px; text-align: left; }
.eq-tabla thead { background: #f5f5f5; }
.cnt-badge {
  display: inline-block; background: #6c757d; color: #fff;
  border-radius: 10px; padding: 0 7px; font-size: .75em; font-weight: bold; line-height: 1.6;
}
CSS;
}

/** Clasifica un equipo troncal por prefijo: [label, color_hex, nota]. */
function _repTipoEquipoTroncal(string $numpos): array
{
    $p = strtoupper(substr($numpos, 0, 3));
    if ($p === 'REC') return ['Reconectador', '#c0392b', 'Equipo de protección — puede disparar ante sobrecarga'];
    if ($p === 'REG') return ['Regulador',    '#c0392b', 'No maniobrable'];
    if (in_array($p, ['ABB','G33','ORM','SCH','GMT','VIS','CGP','GLT'], true))
        return ['Subt.',  '#e67e22', '3 ramas — verificar cuál operar'];
    if (in_array($p, ['DBC','PPF','CLB'], true))
        return ['Aéreo',  '#7f8c8d', ''];
    return ['—',          '#95a5a6', ''];
}

/** Tabla HTML de equipos troncales con tipo y observación. */
function _repHtmlTablaEquipos(array $equipos): string
{
    if (!$equipos) return '';
    $filas = '';
    foreach ($equipos as $eq) {
        [$label, $color, $nota] = _repTipoEquipoTroncal($eq);
        $bdg   = "<span style=\"background:{$color};color:#fff;border-radius:3px;"
               . "padding:1px 6px;font-size:.8em;font-weight:bold\">{$label}</span>";
        $notaH = $nota ? "<span style=\"color:{$color};font-size:.85em\">" . _h($nota) . '</span>' : '';
        $filas .= '<tr><td><code>' . _h($eq) . "</code></td><td>{$bdg}</td><td>{$notaH}</td></tr>";
    }
    return "<table class='eq-tabla'><thead><tr><th>Equipo</th><th>Tipo</th><th>Observación</th></tr></thead>"
         . "<tbody>{$filas}</tbody></table>";
}

function _repSafe(mixed $v): mixed {
    if (is_float($v) && (is_nan($v) || is_infinite($v))) return null;
    if (is_float($v)) return round($v, 1);
    return $v;
}

function _h(mixed $v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function _repWorstIdx(array $vals): int {
    $idx = 0; $max = -INF;
    foreach ($vals as $i => $v) {
        $fv = ($v !== null && is_numeric($v)) ? (float)$v : -1.0;
        if ($fv > $max) { $max = $fv; $idx = $i; }
    }
    return $idx;
}

function _repMesLbl(string $yyyymm): string {
    $parts = explode('-', $yyyymm);
    if (count($parts) === 2) {
        try {
            $m = intval($parts[1]);
            if ($m >= 1 && $m <= 12)
                return _REP_MESES_ES[$m] . '-' . substr($parts[0], 2, 2);
        } catch (\Throwable $e) {}
    }
    return $yyyymm;
}

function _repTrafoLabel(array $trafo): string {
    $bar = _h(trim($trafo['barra'] ?? ''));
    $sub = _h(trim($trafo['subestacion'] ?? ''));
    $barEsNumero = is_numeric(trim($trafo['barra'] ?? '')) && trim($trafo['barra'] ?? '') !== '';
    if ($barEsNumero && $sub) return "Transformador de potencia Barra $bar SE $sub";
    if ($bar)  return "Transformador de potencia $bar";
    if ($sub)  return "Transformador de potencia SE $sub";
    return 'Transformador de potencia';
}

function _repTrafoLabelAlim(array $trafo, string $nombreAlim): string {
    $bar = _h(trim($trafo['barra'] ?? ''));
    $sub = _h(trim($trafo['subestacion'] ?? ''));
    $nA  = _h($nombreAlim);
    $barEsNumero = is_numeric(trim($trafo['barra'] ?? '')) && trim($trafo['barra'] ?? '') !== '';
    if ($barEsNumero && $sub) return "Transformador de potencia del alimentador $nA ubicado en la Barra $bar SE $sub";
    if ($bar && $sub) return "Transformador de potencia $bar del alimentador $nA";
    if ($bar)  return "Transformador de potencia $bar del alimentador $nA";
    if ($sub)  return "Transformador de potencia del alimentador $nA SE $sub";
    return "Transformador de potencia del alimentador $nA";
}

function _repTablaHtml(array $df, string $nomOrig = 'Origen', string $nomDest = 'Destino'): string {
    $df = array_values($df);
    if (empty($df)) return '';
    $meses    = array_column($df, 'mes');
    $etiqMes  = array_map(fn($m) => (strlen($m) >= 7 ? substr($m,5,2).'/'.substr($m,2,2) : $m), $meses);
    $vals     = array_column($df, 'I_orig_antes');
    $worstIdx = _repWorstIdx($vals);
    $WTH = 'border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000';
    $WTD = 'border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000';
    $BG  = ['viable'=>'#d5f5e3','prealerta'=>'#fdebd0','critico'=>'#fadbd8'];
    $nOH = _h($nomOrig); $nDH = _h($nomDest);
    $metricas = [
        ['I_orig_antes',         "$nOH — Antes (A)",     false],
        ['I_orig_despues',       "$nOH — Después (A)",   false],
        ['uso_orig_antes_pct',   "FU antes (%) $nOH",    false],
        ['uso_orig_despues_pct', "FU (%) $nOH",           false],
        ['I_dest_antes',         "$nDH — Antes (A)",     false],
        ['I_dest_despues',       "$nDH — Después (A)",   false],
        ['uso_dest_antes_pct',   "FU antes (%) $nDH",    false],
        ['uso_dest_despues_pct', "FU (%) $nDH",           true],
        ['estado_dest',          'Estado',                false],
    ];
    $header = '<th>Métrica</th>' . implode('', array_map(
        fn($i, $e) => $i === $worstIdx ? "<th class='c' style='$WTH'>" . _h($e) . "</th>" : "<th class='c'>" . _h($e) . "</th>",
        array_keys($etiqMes), $etiqMes
    ));
    $rows = [];
    foreach ($metricas as [$col, $lbl, $colorEst]) {
        if (!array_key_exists($col, $df[0] ?? [])) continue;
        $cells = '';
        foreach ($df as $ci => $row) {
            $v   = $row[$col] ?? null;
            $est = (string)($row['estado_dest'] ?? '');
            $wst = $ci === $worstIdx ? $WTD : '';
            if ($col === 'estado_dest') {
                $txt = _REP_ETIQUETAS[(string)$v] ?? _h($v);
                $st  = 'background:' . ($BG[$est] ?? '#fff') . ($wst ? ";$wst" : '');
                $cells .= "<td class='c' style='$st'>$txt</td>";
            } elseif ($v !== null && is_numeric($v)) {
                $suffix = str_contains($col, 'pct') ? '%' : '';
                $bgV    = $colorEst ? ('background:'.($BG[$est] ?? '#fff').';') : '';
                $cells .= "<td class='c' style='{$bgV}{$wst}'>" . number_format((float)$v, 1) . "$suffix</td>";
            } else {
                $cells .= "<td class='c' style='$wst'>—</td>";
            }
        }
        $rows[] = "<tr><td class='metrica-lbl'>$lbl</td>$cells</tr>";
    }
    return '<div style="overflow-x:auto;width:100%"><table class="tabla-sim" style="width:100%">'
         . "<thead><tr>$header</tr></thead>"
         . '<tbody>' . implode('', $rows) . '</tbody>'
         . '</table></div>';
}

function _repTdsTableHtml(array $detalleTds, string $titulo = ''): string {
    if (empty($detalleTds)) return '';
    $grandes = array_filter($detalleTds, fn($t) => ($t['potencia'] ?? 0) >= _REP_TD_GRANDE_KVA);
    $alerta  = count($grandes) > 0
        ? '<p style="color:#856404;background:#fff3cd;padding:6px 10px;border-radius:4px">⚡ ' . count($grandes) . ' TD(s) grande(s) ≥' . _REP_TD_GRANDE_KVA . ' kVA</p>'
        : '';
    $filas = '';
    foreach ($detalleTds as $td) {
        $kva   = $td['potencia'] ?? null;
        $bg    = ($kva !== null && $kva >= _REP_TD_GRANDE_KVA) ? ' style="background:#fff3cd"' : '';
        $badge = ($kva !== null && $kva >= _REP_TD_GRANDE_KVA) ? ' ⚡' : '';
        $kvaStr = $kva !== null ? number_format($kva, 0) . ' kVA' : '—';
        $filas .= "<tr{$bg}><td>" . _h($td['numpos_td'] ?? '—') . '</td>'
                . '<td>' . _h($td['nombre'] ?? '—') . "$badge</td>"
                . "<td class='r'>$kvaStr</td>"
                . "<td class='r'>" . _h($td['clientes'] ?? '—') . '</td>'
                . '<td>' . _h($td['nom_alim'] ?? '—') . '</td></tr>';
    }
    $lbl = $titulo ?: 'TDs traspasados';
    $n   = count($detalleTds);
    return "<details class='bloque'><summary>$lbl ($n)</summary>"
         . "<div class='bloque-body'>$alerta"
         . '<table class="tabla-sim" style="width:100%">'
         . '<thead><tr><th>Numpos</th><th>Nombre</th><th class="r">Potencia</th>'
         . '<th class="r">Clientes</th><th>Alimentador</th></tr></thead>'
         . "<tbody>$filas</tbody></table></div></details>";
}

function _repTablaTrafHtml(array $trafo, string $nom, string $modo, string $nombreAlim = ''): string {
    if (empty($trafo) || ($trafo['sin_datos'] ?? false) || empty($trafo['tabla'])) return '';
    $BG  = ['viable'=>'#d5f5e3','prealerta'=>'#fdebd0','critico'=>'#fadbd8'];
    $ET  = ['viable'=>'Viable','prealerta'=>'Prealerta','critico'=>'Crítico','sin_datos'=>'—'];
    $WTH = 'border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000';
    $WTD = 'border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000';
    $tabla    = array_values($trafo['tabla']);
    $vals     = array_column($tabla, 'uso_despues_pct');
    $worstIdx = _repWorstIdx($vals);
    $etiqMes  = array_map(fn($r) => (strlen($r['mes'] ?? '') >= 7 ? substr($r['mes'],5,2).'/'.substr($r['mes'],2,2) : ($r['mes'] ?? '')), $tabla);
    $header   = '<th>Métrica</th>' . implode('', array_map(
        fn($i, $e) => $i === $worstIdx ? "<th class='c' style='$WTH'>$e</th>" : "<th class='c'>$e</th>",
        array_keys($etiqMes), $etiqMes
    ));
    $filaNum = function(string $lbl, string $key, callable $fmt) use ($tabla, $worstIdx, $WTD): string {
        $cells = '';
        foreach ($tabla as $i => $r) {
            $v   = $r[$key] ?? null;
            $txt = $v !== null ? $fmt($v) : '—';
            $st  = $i === $worstIdx ? " style='$WTD'" : '';
            $cells .= "<td class='c'$st>$txt</td>";
        }
        return "<tr><td class='metrica-lbl'>$lbl</td>$cells</tr>";
    };
    $filaEstado = function() use ($tabla, $worstIdx, $WTD, $BG, $ET): string {
        $cells = '';
        foreach ($tabla as $i => $r) {
            $est = $r['estado'] ?? 'sin_datos';
            $bg  = 'background:' . ($BG[$est] ?? '#fff') . ';';
            $wst = $i === $worstIdx ? "$WTD;" : '';
            $cells .= "<td class='c' style='{$bg}{$wst}'>"
                    . "<span style='background:" . ($BG[$est] ?? '#eee') . ";padding:2px 8px;border-radius:4px'>"
                    . ($ET[$est] ?? _h($est)) . '</span></td>';
        }
        return "<tr><td class='metrica-lbl'>Estado</td>$cells</tr>";
    };
    $filaDelta = function() use ($tabla, $worstIdx, $WTD): string {
        $cells = '';
        foreach ($tabla as $i => $r) {
            $d = $r['delta'] ?? null;
            if ($d === null) {
                $ia = $r['I_antes'] ?? null; $id = $r['I_despues'] ?? null;
                $d  = ($ia !== null && $id !== null) ? ($id - $ia) : null;
            }
            $txt = $d !== null ? (($d >= 0 ? '+' : '') . number_format($d, 1)) : '—';
            $st  = $i === $worstIdx ? " style='$WTD'" : '';
            $cells .= "<td class='c'$st>$txt</td>";
        }
        return "<tr><td class='metrica-lbl'>Δ (A)</td>$cells</tr>";
    };
    $filas = $filaNum('I antes (A)',      'I_antes',        fn($v) => number_format($v,1))
           . $filaNum('I después (A)',    'I_despues',      fn($v) => number_format($v,1))
           . $filaDelta()
           . $filaNum('FU antes (%)',     'uso_antes_pct',  fn($v) => number_format($v,1).'%')
           . $filaNum('FU después (%)',   'uso_despues_pct',fn($v) => number_format($v,1).'%')
           . $filaEstado();
    $cnStr    = isset($trafo['cn_trafo']) ? ' — CN ' . number_format($trafo['cn_trafo'],0) . ' A' : '';
    $lblTrafo = $nombreAlim ? _repTrafoLabelAlim($trafo, $nombreAlim) : _repTrafoLabel($trafo);
    return "<details class='bloque'><summary>Detalle mensual — $lblTrafo$cnStr</summary>"
         . "<div class='bloque-body'><table class='tabla-sim' style='width:100%'>"
         . "<thead><tr>$header</tr></thead><tbody>$filas</tbody></table></div></details>";
}

function _repTarjetaPeorCaso(array $df, string $nomOrig, string $nomDest, float $deltaMax, float $pPct): string {
    $df = array_values($df);
    if (empty($df)) return '';
    $BG = ['viable'=>'#d5f5e3','prealerta'=>'#fdebd0','critico'=>'#fadbd8','sin_datos'=>'#f8f9fa'];
    $ET = ['viable'=>'Viable','prealerta'=>'Prealerta','critico'=>'Crítico','sin_datos'=>'—'];
    $vals = array_column($df, 'I_orig_antes');
    $wi   = _repWorstIdx($vals);
    $row  = $df[$wi];
    $mes  = (string)($row['mes'] ?? '');
    $mesFmt = (strlen($mes) >= 7) ? substr($mes,5,2).'/'.substr($mes,2,2) : $mes;
    $estado = (string)($row['estado_dest'] ?? 'sin_datos');
    $v = fn($key, $sfx='') => (isset($row[$key]) && $row[$key] !== null && is_numeric($row[$key]))
        ? number_format((float)$row[$key], 1) . $sfx : '—';
    $bgCard  = $BG[$estado] ?? '#f8f9fa';
    $etLabel = $ET[$estado] ?? _h($estado);
    $bgFU    = $BG[$estado] ?? '#fff';
    $nomOrigH = _h($nomOrig);
    $nomDestH = _h($nomDest);
    return <<<HTML
<div style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0">
  <div class="card"><strong>$mesFmt</strong><span>Mes peor caso</span></div>
  <div class="card"><strong>{$deltaMax} A</strong><span>Δ máximo (peor mes)</span></div>
  <div class="card"><strong>{$pPct}%</strong><span>% kVA traspasado</span></div>
  <div class="card" style="background:$bgCard"><strong>$etLabel</strong><span>Estado</span></div>
</div>
<table class="tabla-sim" style="margin-bottom:8px">
  <thead><tr>
    <th>Alimentador</th>
    <th class="r">I antes (A)</th><th class="r">I después (A)</th>
    <th class="r">FU antes (%)</th><th class="r">FU (%)</th>
  </tr></thead>
  <tbody>
    <tr>
      <td class="metrica-lbl">$nomOrigH</td>
      <td class="r">{$v('I_orig_antes')}</td><td class="r">{$v('I_orig_despues')}</td>
      <td class="r">{$v('uso_orig_antes_pct','%')}</td><td class="r">{$v('uso_orig_despues_pct','%')}</td>
    </tr>
    <tr>
      <td class="metrica-lbl">$nomDestH</td>
      <td class="r">{$v('I_dest_antes')}</td><td class="r">{$v('I_dest_despues')}</td>
      <td class="r">{$v('uso_dest_antes_pct','%')}</td>
      <td class="r" style="background:$bgFU">{$v('uso_dest_despues_pct','%')}</td>
    </tr>
  </tbody>
</table>
HTML;
}


function _repCjsBarras(array $df, float $cnOrig, float $cnDest, string $nomOrig, string $nomDest, string $cid): string {
    $df = array_values($df);
    if (empty($df)) return '';
    $labels  = array_map(fn($r) => substr($r['mes'],5,2).'/'.substr($r['mes'],2,2), $df);
    $estados = array_column($df, 'estado_dest');
    $bgDest  = array_map(fn($e) => _REP_CJS_ESTADO_BG[$e]  ?? _REP_CJS_ESTADO_BG['sin_datos'],  $estados);
    $brdDest = array_map(fn($e) => _REP_CJS_ESTADO_BRD[$e] ?? _REP_CJS_ESTADO_BRD['sin_datos'], $estados);
    $datasets = [
        ['type'=>'bar',  'label'=>"$nomDest — Antes (A)",
         'data'=>array_map(fn($r) => _repSafe($r['I_dest_antes'] ?? null), $df),
         'backgroundColor'=>'rgba(100,149,237,0.45)','borderColor'=>'rgba(100,149,237,0.9)','borderWidth'=>1,'order'=>4],
        ['type'=>'bar',  'label'=>"$nomDest — Después (A)",
         'data'=>array_map(fn($r) => _repSafe($r['I_dest_despues'] ?? null), $df),
         'backgroundColor'=>$bgDest,'borderColor'=>$brdDest,'borderWidth'=>1,'order'=>3],
        ['type'=>'line', 'label'=>"$nomOrig — Antes (A)",
         'data'=>array_map(fn($r) => _repSafe($r['I_orig_antes'] ?? null), $df),
         'borderColor'=>'rgba(52,73,94,0.55)','borderDash'=>[5,4],'borderWidth'=>2,'pointRadius'=>3,'fill'=>false,'order'=>2],
        ['type'=>'line', 'label'=>"$nomOrig — Después (A)",
         'data'=>array_map(fn($r) => _repSafe($r['I_orig_despues'] ?? null), $df),
         'borderColor'=>'rgba(52,73,94,1)','borderDash'=>[2,2],'borderWidth'=>2,'pointRadius'=>3,'fill'=>false,'order'=>2],
    ];
    if (!is_nan($cnDest)) {
        $cnR = round($cnDest, 1);
        $datasets[] = ['type'=>'line','label'=>"CN $nomDest (" . number_format($cnDest,0) . ' A)',
            'data'=>array_fill(0, count($labels), $cnR),
            'borderColor'=>'rgba(231,76,60,0.9)','borderDash'=>[8,4],'borderWidth'=>2,'pointRadius'=>0,'fill'=>false,'order'=>0];
    }
    $cfg = ['data'=>['labels'=>$labels,'datasets'=>$datasets],
        'options'=>['responsive'=>true,'maintainAspectRatio'=>false,
            'plugins'=>['legend'=>['position'=>'bottom','labels'=>['font'=>['size'=>11]]]],
            'scales'=>['x'=>['ticks'=>['font'=>['size'=>10]]],
                'y'=>['title'=>['display'=>true,'text'=>'Corriente (A)','font'=>['size'=>11]],'beginAtZero'=>true]]]];
    $cfgStr = json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    return "<div style='position:relative;height:200px'><canvas id='$cid'></canvas></div>\n"
         . "<script>new Chart(document.getElementById('$cid'),$cfgStr);</script>\n";
}

function _repCjsEstados(array $df, string $nomDest, string $cid, ?float $cnDest = null): string {
    $df = array_values(array_filter(array_values($df), fn($r) => ($r['uso_dest_despues_pct'] ?? null) !== null));
    if (empty($df)) return '';
    $labels  = array_map(fn($r) => substr($r['mes'],5,2).'/'.substr($r['mes'],2,2), $df);
    $estados = array_column($df, 'estado_dest');
    $bgDest  = array_map(fn($e) => _REP_CJS_ESTADO_BG[$e]  ?? _REP_CJS_ESTADO_BG['sin_datos'],  $estados);
    $brdDest = array_map(fn($e) => _REP_CJS_ESTADO_BRD[$e] ?? _REP_CJS_ESTADO_BRD['sin_datos'], $estados);
    $valores = array_map(fn($r) => _repSafe($r['uso_dest_despues_pct']), $df);
    $maxPct  = max(array_filter($valores, fn($v) => $v !== null) ?: [100]);
    $yMax    = max(110, (int)round($maxPct * 1.05));
    $afterLabel = $cnDest !== null
        ? sprintf('function(ctx){if(ctx.datasetIndex===0)return " I ≈ "+(ctx.raw*%.1f/100).toFixed(1)+" A";}', $cnDest)
        : 'function(){}';
    $n = count($labels);
    $cfg = ['type'=>'bar','data'=>['labels'=>$labels,'datasets'=>[
        ['label'=>"FU (%) CN $nomDest",'data'=>$valores,'backgroundColor'=>$bgDest,'borderColor'=>$brdDest,'borderWidth'=>1,'order'=>2],
        ['type'=>'line','label'=>'Prealerta 90%','data'=>array_fill(0,$n,90),'borderColor'=>'rgba(230,126,34,0.85)','borderDash'=>[6,3],'borderWidth'=>2,'pointRadius'=>0,'fill'=>false,'order'=>1],
        ['type'=>'line','label'=>'Crítico 100%','data'=>array_fill(0,$n,100),'borderColor'=>'rgba(231,76,60,0.85)','borderDash'=>[6,3],'borderWidth'=>2,'pointRadius'=>0,'fill'=>false,'order'=>0],
    ]],'options'=>['responsive'=>true,'maintainAspectRatio'=>false,
        'plugins'=>['legend'=>['position'=>'bottom','labels'=>['font'=>['size'=>11]]],
            'tooltip'=>['callbacks'=>['afterLabel'=>'AFTER_LABEL_CB']]],
        'scales'=>['x'=>['ticks'=>['font'=>['size'=>10]]],
            'y'=>['title'=>['display'=>true,'text'=>'FU (%)','font'=>['size'=>11]],'min'=>0,'max'=>$yMax,'ticks'=>['callback'=>'PCT_CALLBACK']]]]];
    $cfgStr = str_replace(['"PCT_CALLBACK"','"AFTER_LABEL_CB"'], ['function(v){return v+"%"}', $afterLabel], json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    return "<div style='position:relative;height:170px'><canvas id='$cid'></canvas></div>\n"
         . "<script>new Chart(document.getElementById('$cid'),$cfgStr);</script>\n";
}

function _repCjsTrafo(array $trafo, string $nom, string $modo, string $cid, string $nombreAlim = ''): string {
    if (empty($trafo) || ($trafo['sin_datos'] ?? false) || empty($trafo['tabla'])) return '';
    $tabla  = array_values($trafo['tabla']);
    $labels = array_map(fn($r) => substr($r['mes'],5,2).'/'.substr($r['mes'],2,2), $tabla);
    $estados= array_map(fn($r) => $r['estado'] ?? 'sin_datos', $tabla);
    $bgCol  = array_map(fn($e) => _REP_CJS_ESTADO_BG[$e]  ?? _REP_CJS_ESTADO_BG['sin_datos'],  $estados);
    $brdCol = array_map(fn($e) => _REP_CJS_ESTADO_BRD[$e] ?? _REP_CJS_ESTADO_BRD['sin_datos'], $estados);
    $antes  = array_map(fn($r) => _repSafe($r['uso_antes_pct']   ?? null), $tabla);
    $despues= array_map(fn($r) => _repSafe($r['uso_despues_pct'] ?? null), $tabla);
    $maxPct = max(array_filter($despues, fn($v) => $v !== null) ?: [100]);
    $yMax   = max(110, (int)round($maxPct * 1.05));
    $signo  = $modo === 'alivio' ? '−' : '+';
    $worstIdx  = _repWorstIdx($despues);
    $bgFinal   = array_map(fn($i, $c) => $i === $worstIdx ? 'rgba(180,0,0,0.85)' : $c, array_keys($bgCol),  $bgCol);
    $brdFinal  = array_map(fn($i, $c) => $i === $worstIdx ? 'rgba(140,0,0,1)'    : $c, array_keys($brdCol), $brdCol);
    $brdWidths = array_map(fn($i) => $i === $worstIdx ? 2 : 1, array_keys($tabla));
    $cnTrafo  = $trafo['cn_trafo'] ?? null;
    $cnStr    = $cnTrafo !== null ? ' (CN ' . number_format($cnTrafo,0) . ' A)' : '';
    $lbl      = $nombreAlim ? _repTrafoLabelAlim($trafo, $nombreAlim) : _repTrafoLabel($trafo);
    $titulo   = "$lbl — {$signo}Δ$cnStr";
    $n = count($labels);
    $cfg = ['type'=>'bar','data'=>['labels'=>$labels,'datasets'=>[
        ['label'=>"FU (%) {$signo}Δ",'data'=>$despues,'backgroundColor'=>$bgFinal,'borderColor'=>$brdFinal,'borderWidth'=>$brdWidths,'order'=>3],
        ['type'=>'line','label'=>'FU (%) antes','data'=>$antes,'borderColor'=>'rgba(100,149,237,0.75)','borderDash'=>[5,3],'borderWidth'=>2,'pointRadius'=>2,'fill'=>false,'order'=>2],
        ['type'=>'line','label'=>'Prealerta 90%','data'=>array_fill(0,$n,90),'borderColor'=>'rgba(230,126,34,0.85)','borderDash'=>[6,3],'borderWidth'=>1.5,'pointRadius'=>0,'fill'=>false,'order'=>1],
        ['type'=>'line','label'=>'Crítico 100%','data'=>array_fill(0,$n,100),'borderColor'=>'rgba(231,76,60,0.85)','borderDash'=>[6,3],'borderWidth'=>1.5,'pointRadius'=>0,'fill'=>false,'order'=>0],
    ]],'options'=>['responsive'=>true,'maintainAspectRatio'=>false,
        'interaction'=>['mode'=>'index','intersect'=>false],
        'plugins'=>['legend'=>['position'=>'bottom','labels'=>['font'=>['size'=>10]]],
            'title'=>['display'=>true,'text'=>$titulo,'font'=>['size'=>11]],
            'tooltip'=>['filter'=>'TOOLTIP_FILTER','callbacks'=>['label'=>'TOOLTIP_LABEL']]],
        'scales'=>['x'=>['ticks'=>['font'=>['size'=>10]]],
            'y'=>['title'=>['display'=>true,'text'=>'FU (%)','font'=>['size'=>11]],'min'=>0,'max'=>$yMax,'ticks'=>['callback'=>'PCT_CALLBACK']]]]];
    $cnVal  = sprintf('%.1f', $cnTrafo ?? 0);
    $ttLbl  = "function(ctx){var cn={$cnVal};"
            . 'if(ctx.datasetIndex===0)return " FU después: "+ctx.raw.toFixed(1)+"% — I: "+(ctx.raw*cn/100).toFixed(1)+" A";'
            . 'return " FU antes: "+ctx.raw.toFixed(1)+"% — I: "+(ctx.raw*cn/100).toFixed(1)+" A";}';
    $cfgStr = str_replace(['"PCT_CALLBACK"','"TOOLTIP_FILTER"','"TOOLTIP_LABEL"'],
        ['function(v){return v+"%"}','function(item){return item.datasetIndex<2}', $ttLbl],
        json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    return "<div style='position:relative;height:200px;margin-bottom:8px'><canvas id='$cid'></canvas></div>\n"
         . "<script>new Chart(document.getElementById('$cid'),$cfgStr);</script>\n";
}

function _repCjsFeederCarg(array $meses, array $deltaMam, float $deltaCons, float $cn, string $cid): string {
    if (empty($meses) || $cn <= 0) return '';
    $labels  = array_map(fn($m) => substr($m,5,2).'/'.substr($m,2,2), $meses);
    $iMam    = array_map(fn($m) => round($deltaMam[$m] ?? 0, 1), $meses);
    $fuMam   = array_map(fn($v) => round($v / $cn * 100, 1), $iMam);
    $fuCons  = round($deltaCons / $cn * 100, 1);
    $maxPct  = max(array_merge($fuMam, [$fuCons, 0]));
    $yMax    = max(110, (int)round($maxPct * 1.08));
    $estados = array_map(fn($fu) => $fu >= 100 ? 'critico' : ($fu >= 90 ? 'prealerta' : 'viable'), $fuMam);
    $bgCol   = array_map(fn($e) => _REP_CJS_ESTADO_BG[$e]  ?? _REP_CJS_ESTADO_BG['sin_datos'],  $estados);
    $brdCol  = array_map(fn($e) => _REP_CJS_ESTADO_BRD[$e] ?? _REP_CJS_ESTADO_BRD['sin_datos'], $estados);
    $worstIdx= _repWorstIdx($fuMam);
    $bgFinal = array_map(fn($i,$c) => $i===$worstIdx?'rgba(180,0,0,0.85)':$c, array_keys($bgCol), $bgCol);
    $brdFinal= array_map(fn($i,$c) => $i===$worstIdx?'rgba(140,0,0,1)':$c, array_keys($brdCol), $brdCol);
    $brdW    = array_map(fn($i) => $i===$worstIdx?2:1, array_keys($meses));
    $n = count($meses);
    $cfg = ['type'=>'bar','data'=>['labels'=>$labels,'datasets'=>[
        ['label'=>'FU Mes a mes (%)','data'=>$fuMam,'backgroundColor'=>$bgFinal,'borderColor'=>$brdFinal,'borderWidth'=>$brdW,'order'=>3],
        ['type'=>'line','label'=>"FU conservador ({$fuCons}%)",'data'=>array_fill(0,$n,$fuCons),'borderColor'=>'rgba(80,80,80,0.65)','borderDash'=>[7,4],'borderWidth'=>2,'pointRadius'=>0,'fill'=>false,'order'=>2],
        ['type'=>'line','label'=>'Prealerta 90%','data'=>array_fill(0,$n,90),'borderColor'=>'rgba(230,126,34,0.85)','borderDash'=>[6,3],'borderWidth'=>1.5,'pointRadius'=>0,'fill'=>false,'order'=>1],
        ['type'=>'line','label'=>'Crítico 100%','data'=>array_fill(0,$n,100),'borderColor'=>'rgba(231,76,60,0.85)','borderDash'=>[6,3],'borderWidth'=>1.5,'pointRadius'=>0,'fill'=>false,'order'=>0],
    ]],'options'=>['responsive'=>true,'maintainAspectRatio'=>false,
        'interaction'=>['mode'=>'index','intersect'=>false],
        'plugins'=>['legend'=>['position'=>'bottom','labels'=>['font'=>['size'=>10]]],
            'title'=>['display'=>true,'text'=>'Cargabilidad del alimentador — CN ' . number_format($cn,0) . ' A','font'=>['size'=>11]],
            'tooltip'=>['filter'=>'TOOLTIP_FILTER','callbacks'=>['label'=>'TOOLTIP_LABEL']]],
        'scales'=>['x'=>['ticks'=>['font'=>['size'=>10]]],
            'y'=>['title'=>['display'=>true,'text'=>'FU (%)','font'=>['size'=>11]],'min'=>0,'max'=>$yMax,'ticks'=>['callback'=>'PCT_CALLBACK']]]]];
    $iMamJs  = json_encode($iMam, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $consIJs = number_format($deltaCons, 1);
    $ttLbl   = "function(ctx){var iMam={$iMamJs};"
             . "if(ctx.datasetIndex===0)return \" FU MAM: \"+ctx.raw.toFixed(1)+\"% — I: \"+iMam[ctx.dataIndex].toFixed(1)+\" A\";"
             . "return \" FU cons.: \"+ctx.raw.toFixed(1)+\"% — I: $consIJs A\";}";
    $cfgStr = str_replace(['"PCT_CALLBACK"','"TOOLTIP_FILTER"','"TOOLTIP_LABEL"'],
        ['function(v){return v+"%"}','function(item){return item.datasetIndex<2}',$ttLbl],
        json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    return "<div style='position:relative;height:220px;margin-bottom:8px'><canvas id='$cid'></canvas></div>\n"
         . "<script>new Chart(document.getElementById('$cid'),$cfgStr);</script>\n";
}

function _repCambiosTopoFeederHtml(array $cambios): string {
    if (empty($cambios)) return '';
    $filas = '';
    foreach ($cambios as $c) {
        $filas .= "<tr><td style='white-space:nowrap;color:#555'>" . _h($c['fecha'] ?? '') . '</td>'
                . '<td>' . _h($c['descripcion'] ?? '') . '</td></tr>';
    }
    return '<h2>Cambios topológicos del alimentador</h2>'
         . '<table class="tabla-sim" style="width:100%">'
         . '<thead><tr><th style="width:90px">Fecha</th><th>Descripción</th></tr></thead>'
         . "<tbody>$filas</tbody></table>";
}

function _repAcumularTrafo(array $trafo, array $deltaAcumMes): array {
    if (empty($trafo) || ($trafo['sin_datos'] ?? false) || empty($trafo['tabla'])) return $trafo;
    $cn = (float)($trafo['cn_trafo'] ?? 0);
    $tablaNueva = [];
    foreach ($trafo['tabla'] as $r) {
        $offset   = (float)($deltaAcumMes[$r['mes'] ?? ''] ?? 0.0);
        $iAnt     = $r['I_antes']   ?? null;
        $iDes     = $r['I_despues'] ?? null;
        $iAntNew  = $iAnt !== null ? round((float)$iAnt + $offset, 1) : null;
        $iDesNew  = $iDes !== null ? round((float)$iDes + $offset, 1) : null;
        $usoAnt   = ($iAntNew !== null && $cn > 0) ? round($iAntNew / $cn * 100, 1) : null;
        $usoDes   = ($iDesNew !== null && $cn > 0) ? round($iDesNew / $cn * 100, 1) : null;
        if ($usoDes !== null) {
            $estado = ($usoDes >= 100) ? 'critico' : (($usoDes >= 90) ? 'prealerta' : 'viable');
        } else {
            $estado = $r['estado'] ?? 'sin_datos';
        }
        $tablaNueva[] = array_merge($r, [
            'I_antes'         => $iAntNew,
            'I_despues'       => $iDesNew,
            'uso_antes_pct'   => $usoAnt,
            'uso_despues_pct' => $usoDes,
            'estado'          => $estado,
        ]);
    }
    return array_merge($trafo, ['tabla' => $tablaNueva]);
}


function generarReporteHtml(
    array   $dfSim,
    array   $isla,
    string  $nombreOrigen,
    string  $nombreDestino,
    float   $cnOrigen,
    float   $cnDestino,
    float   $deltaMax,
    array   $resumen,
    string  $rutaSalida,
    string  $descripcion        = '',
    ?array  $transferenciasPrev = null,
    ?array  $trafoOrig          = null,
    ?array  $trafoDest          = null,
    ?array  $detalleTds         = null,
    string  $equipoAbre         = '',
    string  $escenario          = 'normal',
    string  $equipoCierra       = '',
    ?int    $nTdEquipoTotal     = null,
    ?array  $dfSimMam           = null,
    ?array  $trafoOrigMam       = null,
    ?array  $trafoDestMam       = null,
    string  $cambioTopologico   = '',
    ?array  $equiposTraspasados = null,
    ?array  $ajustesInfo        = null,
    ?array  $lzInfo             = null,
): string {
    $pPct = (float)($isla['p_pct'] ?? 0);

    $cards = [
        [number_format($deltaMax,1).' A', 'Δ aplicado (peor mes)'],
        [number_format($pPct,1).'%',      '% carga traspasada'],
        [(string)($isla['n_td'] ?? '—'),  'Transformadores (TDs)'],
        [(string)($isla['clientes'] ?? '—'), 'Clientes'],
        [number_format((float)($isla['kva_isla'] ?? 0),0,'.',',').' kVA',    'kVA isla'],
        [number_format((float)($isla['kva_feeder'] ?? 0),0,'.',',').' kVA',  'kVA alimentador origen'],
        [(string)($isla['mes_peor'] ?? '—'), 'Mes peor caso'],
    ];
    if (!empty($resumen['mes_max_uso'])) {
        $cards[] = [number_format((float)$resumen['pct_max_uso'],1).'%', "FU máx. destino ({$resumen['mes_max_uso']})"];
    }
    $cardsHtml = implode('', array_map(fn($c) => "<div class='card'><strong>{$c[0]}</strong><span>{$c[1]}</span></div>", $cards));
    $conteo = $resumen['conteo'] ?? [];
    $estadosHtml = implode('', array_map(
        fn($e) => "<div class='card'><strong>" . ($conteo[$e] ?? 0) . "</strong><span>Meses " . strtolower(_REP_ETIQUETAS[$e] ?? $e) . '</span></div>',
        ['viable','prealerta','critico']
    ));

    $escLines = [];
    if ($escenario === 'corte_circuito') $escLines[] = '<strong>Escenario:</strong> Corte de circuito';
    elseif ($equipoAbre) $escLines[] = '<strong>Equipo que abre:</strong> ' . _h(strtoupper($equipoAbre));
    if ($equipoCierra) $escLines[] = '<strong>Equipo que cierra:</strong> ' . _h(strtoupper($equipoCierra));
    $escHtml = $escLines ? implode('', array_map(fn($l) => "<p>$l</p>", $escLines)) : '';

    $nTdSel = (int)($isla['n_td'] ?? 0);
    $notaTdsHtml = '';
    if ($nTdEquipoTotal && $equipoAbre && $escenario !== 'corte_circuito' && $nTdSel < $nTdEquipoTotal) {
        $notaTdsHtml = "<p><em>Se traspasan <strong>$nTdSel</strong> de <strong>$nTdEquipoTotal</strong> TDs aguas abajo del equipo <strong>" . _h(strtoupper($equipoAbre)) . '</strong>.</em></p>';
    }

    // ── Equipos troncales del receptor (lz_info) ────────────────────────────
    $troncalHtml = '';
    if (!empty($lzInfo['tiene_lz'])) {
        $devs   = $lzInfo['dispositivos'] ?? [];
        $selDev = null;
        foreach ($devs as $d) { if ($d['seleccionado'] ?? false) { $selDev = $d; break; } }
        if (!$selDev && $devs) $selDev = $devs[0];
        $troncal = ($selDev && ($selDev['viable'] ?? true)) ? ($selDev['equipos_troncal'] ?? []) : [];
        if ($troncal) {
            $tieneAlerta = (bool)array_filter($troncal, fn($e) => in_array(strtoupper(substr($e,0,3)), ['REC','REG'], true));
            $icono  = $tieneAlerta ? '⚠ ' : '';
            $numpos = $lzInfo['numpos_lz_sel'] ?? '';
            $via    = $numpos ? ' <span style="color:#888;font-size:.85em">vía ' . _h($numpos) . '</span>' : '';
            $cnt    = '<span class="cnt-badge">' . count($troncal) . '</span>';
            $desc   = '<p style="color:#555;font-size:.87em;margin:4px 0 8px">Equipos en el camino troncal '
                    . 'entre el LZ y la cabecera del alimentador receptor. La carga traspasada circulará a través de ellos.</p>';
            $troncalHtml = "<details class='equip-det troncal' open>"
                         . "<summary>{$icono}Equipos troncales en alimentador receptor{$via}{$cnt}</summary>"
                         . "<div class='equip-det-body'>{$desc}" . _repHtmlTablaEquipos($troncal) . "</div>"
                         . "</details>";
        }
    }

    // ── Equipos en isla a vigilar (inversión de flujo + cambio topológico) ──
    $invInner  = '';
    $topoInner = '';
    if (!empty($equiposTraspasados)) {
        $filasInv = implode('', array_map(
            fn($e) => '<tr><td><code>' . _h($e['nombre']) . "</code></td>"
                    . "<td><span class='badge-eq-tipo'>" . _h($e['tipo']) . "</span></td></tr>",
            $equiposTraspasados
        ));
        $invInner = "<div style='margin-bottom:10px'>"
                  . "<strong style='font-size:.9em'>↔ Posible inversión de flujo</strong>"
                  . "<table class='eq-tabla' style='margin-top:4px'>"
                  . "<thead><tr><th>Equipo</th><th>Tipo</th></tr></thead>"
                  . "<tbody>{$filasInv}</tbody></table>"
                  . "<p style='color:#555;font-size:.85em;margin:4px 0 0'>Estos equipos quedan dentro "
                  . "de la isla y recibirán corriente desde la dirección opuesta a la habitual. "
                  . "Verificar si aplica.</p></div>";
    }
    $ct = trim($cambioTopologico ?? '');
    if ($ct !== '') {
        $topoInner = "<div><strong style='font-size:.9em'>⚡ Cambio topológico previo</strong>"
                   . "<p style='margin:4px 0 0'>" . _h($ct) . "</p></div>";
    }
    $islaVigilarHtml = '';
    if ($invInner || $topoInner) {
        $nItems = count($equiposTraspasados ?? []) + ($topoInner ? 1 : 0);
        $cnt    = "<span class='cnt-badge'>{$nItems}</span>";
        $islaVigilarHtml = "<details class='equip-det isla' open>"
                         . "<summary>Equipos en isla a vigilar{$cnt}</summary>"
                         . "<div class='equip-det-body'>{$invInner}{$topoInner}</div>"
                         . "</details>";
    }

    $ajustesHtml = '';
    if (!empty($ajustesInfo)) {
        $filas = '';
        foreach ($ajustesInfo as $ent) {
            foreach ($ent['meses'] as $m) {
                $sqlStr = isset($m['valor_sql']) ? number_format($m['valor_sql'],1).' A' : '—';
                $filas .= "<tr><td>" . _h($ent['label']) . "</td><td>" . _h($m['mes']) . "</td><td>$sqlStr</td><td><strong>" . number_format($m['valor_ajustado'],1) . ' A</strong></td></tr>';
            }
        }
        $ajustesHtml = "<div class='ajuste-nota'><strong>✎ Valores de demanda ajustados manualmente:</strong>"
            . "<table class='aj-table'><thead><tr><th>Entidad</th><th>Mes</th><th>Valor SQL (A)</th><th>Valor aplicado (A)</th></tr></thead>"
            . "<tbody>$filas</tbody></table>"
            . "<em class='aj-nota'>El análisis utiliza los valores aplicados. Los ajustes al alimentador origen modifican automáticamente el Δ y se reflejan en el análisis de los transformadores.</em></div>";
    }

    $imgPeorCaso = _repTarjetaPeorCaso($dfSim, $nombreOrigen, $nombreDestino, $deltaMax, $pPct);

    $trafosHtml = '';
    if (!empty($trafoOrig) && !($trafoOrig['sin_datos'] ?? false)) {
        $lbl = _repTrafoLabelAlim($trafoOrig, $nombreOrigen);
        $trafosHtml .= "<h2>Cargabilidad — $lbl — escenario conservador (alivio Δ fijo)</h2>\n";
        $trafosHtml .= _repCjsTrafo($trafoOrig, $nombreOrigen, 'alivio', 'cjs_trafo_orig', $nombreOrigen);
        $trafosHtml .= _repTablaTrafHtml($trafoOrig, $nombreOrigen, 'alivio', $nombreOrigen);
    }
    if (!empty($trafoDest) && !($trafoDest['sin_datos'] ?? false)) {
        $lbl = _repTrafoLabelAlim($trafoDest, $nombreDestino);
        $trafosHtml .= "<h2>Cargabilidad — $lbl — escenario conservador (carga Δ fijo)</h2>\n";
        $trafosHtml .= _repCjsTrafo($trafoDest, $nombreDestino, 'carga', 'cjs_trafo_dest', $nombreDestino);
        $trafosHtml .= _repTablaTrafHtml($trafoDest, $nombreDestino, 'carga', $nombreDestino);
    }

    $tdsHtml = _repTdsTableHtml($detalleTds ?? [], 'TDs traspasados');

    $historialHtml = '';
    if (!empty($transferenciasPrev)) {
        $filasH = implode('', array_map(fn($t) =>
            "<tr><td>" . _h($t['idx']) . "</td><td>" . _h($t['origen']) . "</td>"
            . "<td class='r'>" . number_format($t['delta_A'],1) . "</td><td class='r'>" . number_format($t['p_pct'],1) . "%</td>"
            . "<td class='r'>" . _h($t['n_td']) . "</td><td class='r'>" . _h($t['clientes'] ?? '—') . "</td>"
            . "<td>" . _h($t['fecha']) . "</td><td>" . _h($t['descripcion'] ?? '') . '</td></tr>',
            $transferenciasPrev
        ));
        $historialHtml = "<h2>Historial de transferencias al alimentador " . _h($nombreDestino) . "</h2>"
            . '<table class="tabla-sim"><thead><tr><th>#</th><th>Origen</th><th class="r">Δ (A)</th>'
            . '<th class="r">%</th><th class="r">TDs</th><th class="r">Clientes</th><th>Fecha</th><th>Descripción</th>'
            . "</tr></thead><tbody>$filasH</tbody></table>";
    }

    $descHtml  = $descripcion ? "<p><em>" . _h($descripcion) . "</em></p>" : '';
    $tablaHtml = _repTablaHtml($dfSim, $nombreOrigen, $nombreDestino);

    $mamHtml = '';
    if (!empty($dfSimMam)) {
        $cidBm = 'cjs_mam_barras'; $cidEm = 'cjs_mam_estados';
        $mamBarras  = _repCjsBarras($dfSimMam, $cnOrigen, $cnDestino, $nombreOrigen, $nombreDestino, $cidBm);
        $mamEstados = _repCjsEstados($dfSimMam, $nombreDestino, $cidEm, $cnDestino);
        $mamTabla   = _repTablaHtml($dfSimMam, $nombreOrigen, $nombreDestino);
        $mamTrafos  = '';
        if (!empty($trafoOrigMam) && !($trafoOrigMam['sin_datos'] ?? false)) {
            $lbl = _repTrafoLabelAlim($trafoOrigMam, $nombreOrigen);
            $mamTrafos .= "<h3>$lbl — alivio Mes a mes</h3>\n";
            $mamTrafos .= _repCjsTrafo($trafoOrigMam, $nombreOrigen, 'alivio', 'cjs_mam_trafo_orig', $nombreOrigen);
            $mamTrafos .= _repTablaTrafHtml($trafoOrigMam, $nombreOrigen, 'alivio', $nombreOrigen);
        }
        if (!empty($trafoDestMam) && !($trafoDestMam['sin_datos'] ?? false)) {
            $lbl = _repTrafoLabelAlim($trafoDestMam, $nombreDestino);
            $mamTrafos .= "<h3>$lbl — carga Mes a mes</h3>\n";
            $mamTrafos .= _repCjsTrafo($trafoDestMam, $nombreDestino, 'carga', 'cjs_mam_trafo_dest', $nombreDestino);
            $mamTrafos .= _repTablaTrafHtml($trafoDestMam, $nombreDestino, 'carga', $nombreDestino);
        }
        $mamHtml = "\n<details class='bloque' open><summary>Análisis Mes a Mes — perfil proporcional</summary>"
            . "<div class='bloque-body'><p style='color:#555;font-size:0.88em'>Perfil de demanda usando el % traspasado del peor mes aplicado proporcionalmente a cada mes.</p>"
            . $mamBarras . $mamEstados . $mamTrafos
            . "<details class='bloque'><summary>Tabla mes a mes — corrientes y FU</summary>"
            . "<div class='bloque-body'>$mamTabla</div></details>"
            . "</div></details>\n";
    }

    $cdn       = _REP_CHARTJS_CDN;
    $css       = _repCss();
    $today     = date('Y-m-d');
    $cnOrigFmt = number_format($cnOrigen, 0);
    $cnDestFmt = number_format($cnDestino, 0);
    $nomOrigH  = _h($nombreOrigen);
    $nomDestH  = _h($nombreDestino);
    $html = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Traspaso $nomOrigH → $nomDestH</title>
  <script src="$cdn"></script>
  <style>
    $css
    h3 { font-size: 1em; color: #555; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Análisis de Traspaso: $nomOrigH → $nomDestH</h1>
  <p>Generado el $today</p>
  $descHtml
  $escHtml
  $notaTdsHtml
  $troncalHtml
  $islaVigilarHtml
  $ajustesHtml

  <h2>Resumen de la isla</h2>
  <div class="resumen">$cardsHtml</div>

  <h2>Estados del destino post-traspaso</h2>
  <div class="resumen">$estadosHtml</div>

  <h2>Peor caso — escenario conservador (Δ fijo)</h2>
  $imgPeorCaso

  $mamHtml

  $trafosHtml

  $tdsHtml

  $historialHtml

  <div class="footer">
    Traspaso: $nomOrigH → $nomDestH | Δ = {$deltaMax} A |
    p = {$pPct}% | CN origen = $cnOrigFmt A | CN destino = $cnDestFmt A
  </div>
</body>
</html>
HTML;

    $dir = dirname(realpath($rutaSalida) ?: $rutaSalida);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($rutaSalida, $html);
    return $rutaSalida;
}

function generarReporteFeeder(
    array   $feederData,
    float   $acumulado,
    ?float  $usoPct,
    string  $rutaSalida,
    ?array  $trafoFinal    = null,
    ?array  $trafoFinalMam = null,
): string {
    $nombre        = $feederData['nombre'];
    $cn            = (float)$feederData['cn'];
    $transferencias = $feederData['transferencias'] ?? [];
    $usoStr        = $usoPct !== null ? number_format($usoPct,1).'%' : '—';
    $colorUso      = ($usoPct ?? 0) >= 100 ? '#e74c3c' : (($usoPct ?? 0) >= 90 ? '#f39c12' : '#2ecc71');

    $filasRes = ''; $acumRun = 0.0; $tdsTotal = 0; $cliTotal = 0;
    foreach ($transferencias as $t) {
        $acumRun += (float)$t['delta_A'];
        $tdsT     = (int)($t['n_td'] ?? 0);
        $cliT     = (int)($t['clientes'] ?? 0);
        $tdsTotal += $tdsT; $cliTotal += $cliT;
        $fuRun  = $cn > 0 ? round($acumRun / $cn * 100, 1) : null;
        $fuStr  = $fuRun !== null ? number_format($fuRun,1).'%' : '—';
        $filasRes .= "<tr><td>" . _h($t['idx']) . "</td><td>" . _h($t['origen']) . "</td>"
            . "<td class='r'>" . number_format($t['delta_A'],1) . "</td><td class='r'>" . number_format($t['p_pct'],1) . "%</td>"
            . "<td class='r'>$tdsT</td><td class='r'>" . ($cliT ?: '—') . "</td>"
            . "<td class='r'>" . number_format($acumRun,1) . "</td><td class='r'>$fuStr</td>"
            . "<td>" . _h($t['fecha']) . "</td><td>" . _h($t['descripcion'] ?? '') . '</td></tr>';
    }
    $fuTotal    = $cn > 0 ? round($acumulado / $cn * 100, 1) : null;
    $fuTotalStr = $fuTotal !== null ? number_format($fuTotal,1).'%' : '—';
    $filasRes  .= "<tr style='font-weight:600;background:#f0f4fa'><td colspan='2'>Total</td>"
        . "<td class='r'>" . number_format($acumulado,1) . "</td><td class='r'>—</td>"
        . "<td class='r'>$tdsTotal</td><td class='r'>" . ($cliTotal ?: '—') . "</td>"
        . "<td class='r'>" . number_format($acumulado,1) . "</td><td class='r'>$fuTotalStr</td><td colspan='2'></td></tr>";

    $deltaAcumDest = [];
    $secciones = '';
    foreach ($transferencias as $t) {
        $nomOrig = $t['origen'] ?? "Origen #{$t['idx']}";
        $nomDest = $t['nombre_dest'] ?? $nombre;
        $cnOrig  = $t['cn_orig'] !== null ? (float)$t['cn_orig'] : NAN;
        $cnDest  = $t['cn_dest'] !== null ? (float)$t['cn_dest'] : $cn;

        $escLines = [];
        if (($t['escenario'] ?? '') === 'corte_circuito') $escLines[] = '<strong>Escenario:</strong> Corte de circuito';
        elseif (!empty($t['equipo_abre'])) $escLines[] = '<strong>Equipo que abre:</strong> ' . _h(strtoupper($t['equipo_abre']));
        if (!empty($t['equipo_cierra'])) $escLines[] = '<strong>Equipo que cierra:</strong> ' . _h(strtoupper($t['equipo_cierra']));
        $escTxt = implode('', array_map(fn($l) => "<p>$l</p>", $escLines));

        $nTdTotal  = $t['n_td_equipo_total'] ?? null;
        $notaTdsT  = '';
        if ($nTdTotal && !empty($t['equipo_abre']) && ($t['escenario'] ?? '') !== 'corte_circuito' && ($t['n_td'] ?? 0) < $nTdTotal) {
            $notaTdsT = "<p><em>Se traspasan <strong>" . (int)$t['n_td'] . "</strong> de <strong>" . (int)$nTdTotal . "</strong> TDs aguas abajo del equipo <strong>" . _h(strtoupper($t['equipo_abre'])) . '</strong>.</em></p>';
        }

        $ct = trim($t['cambio_topologico'] ?? '');
        $cambioTopoT = $ct ? "<div class='cambio-topo'><strong>⚡ Cambio topológico previo:</strong> " . _h($ct) . "</div>" : '';

        $inversionT = '';
        if (!empty($t['equipos_traspasados'])) {
            $badges = implode(' ', array_map(fn($e) => "<span class='badge-eq-tipo'>" . _h($e['tipo']) . "</span> <code>" . _h($e['nombre']) . "</code>", $t['equipos_traspasados']));
            $inversionT = "<div class='inversion-flujo'><strong>↔ Posible inversión de flujo:</strong> $badges"
                . "<p class='nota'>Equipos dentro de la isla con posible flujo invertido. Verificar si aplica.</p></div>";
        }

        $nTdTotalStr = $nTdTotal ? "/$nTdTotal" : '';
        $encabezado  = "<h2>Traspaso #" . _h($t['idx']) . ": " . _h($nomOrig) . " → " . _h($nomDest) . "</h2>"
            . "<p><strong>Fecha:</strong> " . _h($t['fecha'])
            . " &nbsp;|&nbsp; <strong>Δ:</strong> " . number_format($t['delta_A'],1) . ' A'
            . " &nbsp;|&nbsp; <strong>% kVA:</strong> " . number_format($t['p_pct'],1) . '%'
            . " &nbsp;|&nbsp; <strong>TDs:</strong> " . (int)$t['n_td'] . _h($nTdTotalStr)
            . (!empty($t['descripcion']) ? "<br><em>" . _h($t['descripcion']) . "</em>" : '')
            . "</p>$escTxt$notaTdsT";

        if (!empty($t['tabla_mam']) || !empty($t['tabla'])) {
            $rawMam  = $t['tabla_mam'] ?? [];
            $rawFlat = $t['tabla'] ?? [];
            $useMam  = !empty($rawMam);
            $dfPlot  = $useMam ? $rawMam : $rawFlat;
            $sfx     = $useMam ? ' Mes a mes' : '';
            $cidB    = "cjs_b_{$t['idx']}"; $cidE = "cjs_e_{$t['idx']}";

            $trafoO = $useMam ? ($t['trafo_orig_mam'] ?? $t['trafo_orig'] ?? null) : ($t['trafo_orig'] ?? null);
            $trafoD = $useMam ? ($t['trafo_dest_mam'] ?? $t['trafo_dest'] ?? null) : ($t['trafo_dest'] ?? null);
            if ($deltaAcumDest && $trafoD) $trafoD = _repAcumularTrafo($trafoD, $deltaAcumDest);

            $deltaT = (float)($t['delta_A'] ?? 0);
            if ($useMam && !empty($rawMam)) {
                foreach ($rawMam as $r) {
                    $m = $r['mes'] ?? null;
                    if ($m) {
                        $d = (float)($r['I_dest_despues'] ?? 0) - (float)($r['I_dest_antes'] ?? 0);
                        $deltaAcumDest[$m] = ($deltaAcumDest[$m] ?? 0.0) + $d;
                    }
                }
            } elseif ($trafoD && !empty($trafoD['tabla'])) {
                foreach ($trafoD['tabla'] as $r) {
                    $m = $r['mes'] ?? null;
                    if ($m) $deltaAcumDest[$m] = ($deltaAcumDest[$m] ?? 0.0) + $deltaT;
                }
            }

            $trafosT = '';
            if (!empty($trafoO) && !($trafoO['sin_datos'] ?? false)) {
                $lblO    = _repTrafoLabelAlim($trafoO, $nomOrig);
                $innerO  = _repCjsTrafo($trafoO, $nomOrig, 'alivio', "cjs_to_{$t['idx']}", $nomOrig)
                         . _repTablaTrafHtml($trafoO, $nomOrig, 'alivio', $nomOrig);
                $trafosT .= "<details class='bloque'><summary>Cargabilidad — $lblO — alivio$sfx</summary><div class='bloque-body'>$innerO</div></details>";
            }
            if (!empty($trafoD) && !($trafoD['sin_datos'] ?? false)) {
                $lblD    = _repTrafoLabelAlim($trafoD, $nomDest);
                $innerD  = _repCjsTrafo($trafoD, $nomDest, 'carga', "cjs_td_{$t['idx']}", $nomDest)
                         . _repTablaTrafHtml($trafoD, $nomDest, 'carga', $nomDest);
                $trafosT .= "<details class='bloque'><summary>Cargabilidad — $lblD — carga$sfx</summary><div class='bloque-body'>$innerD</div></details>";
            }
            $sfxLbl  = $sfx ? ', ' . trim($sfx) : '';
            $secciones .= $encabezado . $cambioTopoT . $inversionT
                . _repCjsBarras($dfPlot, $cnOrig, $cnDest, $nomOrig, $nomDest, $cidB)
                . _repCjsEstados($dfPlot, $nomDest, $cidE, $cnDest)
                . $trafosT
                . "<details class='bloque'><summary>Tabla de corrientes y FU$sfxLbl</summary>"
                . '<div class="bloque-body">' . _repTablaHtml($dfPlot, $nomOrig, $nomDest) . '</div></details>'
                . _repTdsTableHtml($t['detalle_tds'] ?? [])
                . '<hr>';
        } else {
            $secciones .= $encabezado . $cambioTopoT . $inversionT
                . _repTdsTableHtml($t['detalle_tds'] ?? [])
                . '<p class="sin-datos">Este traspaso fue guardado sin datos de simulación detallada.</p><hr>';
        }
    }

    // Cargabilidad del alimentador
    if (!empty($trafoFinal['tabla'])) {
        $mesesFeeder = array_column($trafoFinal['tabla'], 'mes');
    } elseif (!empty($trafoFinalMam['tabla'])) {
        $mesesFeeder = array_column($trafoFinalMam['tabla'], 'mes');
    } else {
        $allM = [];
        foreach ($transferencias as $t) {
            foreach (array_merge($t['tabla_mam'] ?? [], $t['tabla'] ?? []) as $r) {
                if (!empty($r['mes'])) $allM[$r['mes']] = true;
            }
        }
        $mesesFeeder = array_keys($allM);
        sort($mesesFeeder);
    }

    $feederCargHtml = '';
    if (!empty($mesesFeeder) && $cn > 0) {
        $deltaMamFeeder = [];
        foreach ($mesesFeeder as $mes) {
            $total = 0.0;
            foreach ($transferencias as $t) {
                $tablaMam = $t['tabla_mam'] ?? [];
                $deltaA   = (float)$t['delta_A'];
                $mamRow   = null;
                foreach ($tablaMam as $r) { if (($r['mes'] ?? '') === $mes) { $mamRow = $r; break; } }
                if ($mamRow !== null && isset($mamRow['I_dest_despues']) && isset($mamRow['I_dest_antes'])) {
                    $total += (float)$mamRow['I_dest_despues'] - (float)$mamRow['I_dest_antes'];
                } else {
                    $total += $deltaA;
                }
            }
            $deltaMamFeeder[$mes] = round($total, 1);
        }

        $BgE = ['viable'=>'#d5f5e3','prealerta'=>'#fdebd0','critico'=>'#fadbd8'];
        $EtE = ['viable'=>'Viable','prealerta'=>'Prealerta','critico'=>'Crítico'];
        $fuConsFeeder = round($acumulado / $cn * 100, 1);
        $estFn  = fn($iv) => (($iv/$cn) >= 1.0) ? 'critico' : ((($iv/$cn) >= 0.9) ? 'prealerta' : 'viable');

        $WTH2 = 'border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000';
        $WTD2 = 'border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000';
        $iMamVals  = array_map(fn($m) => $deltaMamFeeder[$m], $mesesFeeder);
        $worstFc   = _repWorstIdx($iMamVals);
        $etiq      = array_map(fn($m) => substr($m,5,2).'/'.substr($m,2,2), $mesesFeeder);
        $headerFc  = '<th>Métrica</th>' . implode('', array_map(
            fn($i,$e) => $i===$worstFc ? "<th class='c' style='$WTH2'>$e</th>" : "<th class='c'>$e</th>",
            array_keys($etiq), $etiq
        ));
        $fcCells = function(array $vals, callable $fmt, ?callable $styleFn = null) use ($mesesFeeder, $worstFc, $WTD2): string {
            $cells = '';
            foreach ($vals as $i => $v) {
                $extra = $i === $worstFc ? ";$WTD2" : '';
                $bg    = $styleFn ? $styleFn($mesesFeeder[$i]) : '';
                $cells .= "<td class='c' style='{$bg}{$extra}'>" . $fmt($v) . '</td>';
            }
            return $cells;
        };
        $fuMamVals = array_map(fn($v) => round($v/$cn*100,1), $iMamVals);
        $estVals   = array_map(fn($v) => $estFn($v), $iMamVals);
        $bgEstFn   = fn($m) => 'background:' . ($BgE[$estFn($deltaMamFeeder[$m])] ?? '#fff');
        $rowIMam   = '<tr><td class="metrica-lbl">I Mes a mes (A)</td>'   . $fcCells($iMamVals,  fn($v) => number_format($v,1)) . '</tr>';
        $rowFuMam  = '<tr><td class="metrica-lbl">FU Mes a mes (%)</td>'  . $fcCells($fuMamVals, fn($v) => number_format($v,1).'%', $bgEstFn) . '</tr>';
        $rowEst    = '<tr><td class="metrica-lbl">Estado</td>'             . $fcCells($estVals,   fn($v) => $EtE[$v] ?? $v, $bgEstFn) . '</tr>';
        $rowICons  = '<tr><td class="metrica-lbl">I conservador (A)</td>'  . $fcCells(array_fill(0,count($mesesFeeder),$acumulado), fn($v) => number_format($v,1)) . '</tr>';
        $rowFuCons = '<tr><td class="metrica-lbl">FU conservador (%)</td>' . $fcCells(array_fill(0,count($mesesFeeder),$fuConsFeeder), fn($v) => number_format($v,1).'%') . '</tr>';
        $tablaFc = '<div style="overflow-x:auto;width:100%"><table class="tabla-sim" style="width:100%">'
                 . "<thead><tr>$headerFc</tr></thead>"
                 . "<tbody>$rowIMam$rowFuMam$rowEst$rowICons$rowFuCons</tbody></table></div>";
        $feederCargHtml = "<h2>Cargabilidad del alimentador " . _h($nombre) . "</h2>\n"
            . _repCjsFeederCarg($mesesFeeder, $deltaMamFeeder, $acumulado, $cn, 'cjs_feeder_carg')
            . $tablaFc;
    }

    $trafoFinalHtml = '';
    if (!empty($trafoFinal) && !($trafoFinal['sin_datos'] ?? false)) {
        $lblFinal = _repTrafoLabel($trafoFinal);
        $trafoFinalHtml = "<h2>Cargabilidad Final — $lblFinal</h2>\n"
            . "<p><em>Refleja la suma de todos los traspasos aplicados al alimentador (" . number_format($acumulado,1) . ' A acumulados).</em></p>'
            . "<h3>Escenario conservador (Δ acumulado fijo = " . number_format($acumulado,1) . " A)</h3>\n"
            . _repCjsTrafo($trafoFinal, $nombre, 'carga', 'cjs_trafo_final')
            . _repTablaTrafHtml($trafoFinal, $nombre, 'carga');
        if (!empty($trafoFinalMam) && !($trafoFinalMam['sin_datos'] ?? false)) {
            $trafoFinalHtml .= "<h3>Escenario Mes a mes (Δ proporcional acumulado por mes)</h3>\n"
                . "<p style='color:#555;font-size:0.88em'>Suma de los perfiles proporcionales de cada transferencia por mes. Para meses sin datos en alguna transferencia, se usa su Δ máximo como fallback conservador.</p>\n"
                . _repCjsTrafo($trafoFinalMam, $nombre, 'carga', 'cjs_trafo_final_mam')
                . _repTablaTrafHtml($trafoFinalMam, $nombre, 'carga');
        }
    }

    $cambiosTopoHtml  = _repCambiosTopoFeederHtml($feederData['cambios_topologicos'] ?? []);
    $cdn              = _REP_CHARTJS_CDN;
    $css              = _repCss();
    $today            = date('Y-m-d');
    $seccionesOut     = $secciones ?: '<p>Sin transferencias registradas.</p>';
    $filasResOut      = $filasRes  ?: "<tr><td colspan='10'>Sin transferencias.</td></tr>";
    $cnFmt            = number_format($cn, 0);
    $acumFmt          = number_format($acumulado, 1);
    $countTransf      = count($transferencias);
    $nombreH          = _h($nombre);
    $html = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Alimentador $nombreH — Historial de Transferencias</title>
  <script src="$cdn"></script>
  <style>
    $css
    h3 { font-size: 1em; color: #555; margin-top: 16px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    .sin-datos { color: #888; font-style: italic; }
    .uso-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 0.9em; color: #fff; background: $colorUso; }
  </style>
</head>
<body>
  <h1>Alimentador en Comisionamiento: $nombreH</h1>
  <p>Generado el $today</p>
  <div class="resumen">
    <div class="card"><strong>$cnFmt A</strong><span>Corriente nominal (CN)</span></div>
    <div class="card"><strong>$acumFmt A</strong><span>Carga acumulada</span></div>
    <div class="card"><strong><span class="uso-badge">$usoStr</span></strong><span>Uso del CN</span></div>
    <div class="card"><strong>$countTransf</strong><span>Transferencias</span></div>
  </div>
  $cambiosTopoHtml
  <h2>Resumen de transferencias</h2>
  <div style="overflow-x:auto">
  <table class="tabla-sim" style="width:100%">
    <thead><tr><th>#</th><th>Origen</th><th class="r">Δ (A)</th><th class="r">% kVA</th>
    <th class="r">TDs</th><th class="r">Clientes</th>
    <th class="r">Σ Δ (A)</th><th class="r">FU cons. (%)</th>
    <th>Fecha</th><th>Descripción</th></tr></thead>
    <tbody>$filasResOut</tbody>
  </table>
  </div>
  $feederCargHtml
  <h2>Detalle por transferencia</h2>
  $seccionesOut
  $trafoFinalHtml
  <div class="footer">
    Alimentador: $nombreH &nbsp;|&nbsp; CN = $cnFmt A &nbsp;|&nbsp;
    Acumulado = $acumFmt A &nbsp;|&nbsp; Uso = $usoStr
  </div>
</body>
</html>
HTML;

    $dir = dirname(realpath($rutaSalida) ?: $rutaSalida);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($rutaSalida, $html);
    return $rutaSalida;
}


// ── Helpers tabla FU resumen cadena ───────────────────────────────────────────
function _repMesAbr(string $mes): string {
    static $M = ['01'=>'ene','02'=>'feb','03'=>'mar','04'=>'abr','05'=>'may','06'=>'jun',
                 '07'=>'jul','08'=>'ago','09'=>'sep','10'=>'oct','11'=>'nov','12'=>'dic'];
    if (strlen($mes) >= 7)
        return ($M[substr($mes, 5, 2)] ?? substr($mes, 5, 2)) . '-' . substr($mes, 2, 2);
    return $mes ?: '—';
}

function _repCadPctColor(?float $pct): string {
    if ($pct === null) return '#78909c';
    if ($pct >= 100)   return '#c0392b';
    if ($pct >= 85)    return '#e67e22';
    return '#27ae60';
}

function _tablaFuPeriodosHtml(array $casos): string {
    if (!$casos) return '';

    $cadenaColors      = ['#1565c0', '#e65100', '#1b5e20'];
    $cadenaColorsLight = ['#dbeafe', '#fde8d8', '#d4edda'];

    // Unión de meses, orden cronológico
    $mesesSet = [];
    foreach ($casos as $c) {
        $tab = $c['tabla_mam'] ?? $c['tabla'] ?? [];
        foreach ($tab as $r) { $m = $r['mes'] ?? ''; if ($m) $mesesSet[$m] = true; }
    }
    if (!$mesesSet) return '';
    $mesesOrd = array_keys($mesesSet);
    sort($mesesOrd);

    $alimPct     = [];
    $trafoPct    = [];
    $trafoLbl    = [];
    $casoPorAlim = [];
    $orden       = [];

    $barrLbl = function(array $t, string $nombreAlim): string {
        $b = trim((string)($t['barra']       ?? ''));
        $s = trim((string)($t['subestacion'] ?? ''));
        if (ctype_digit($b) && $b !== '' && $s) return "Barra {$b} — SE {$s}";
        if ($b && $s) return "{$b} — SE {$s}";
        if ($b)       return $b;
        if ($s)       return "SE {$s}";
        return "Trafo alim. {$nombreAlim}";
    };

    foreach ($casos as $i => $caso) {
        $n    = (int)($caso['numero_caso'] ?? ($i + 1));
        $orig = $caso['nombre_orig'] ?? '';
        $dest = $caso['nombre_dest'] ?? '';
        $tab  = $caso['tabla_mam'] ?? $caso['tabla'] ?? [];

        $toBase = $caso['trafo_orig'] ?? [];
        $tdBase = $caso['trafo_dest'] ?? [];
        $toMam  = !empty($caso['trafo_orig_mam']) ? $caso['trafo_orig_mam'] : null;
        $tdMam  = !empty($caso['trafo_dest_mam']) ? $caso['trafo_dest_mam'] : null;
        $toT    = ($toMam ?? $toBase)['tabla'] ?? [];
        $tdT    = ($tdMam ?? $tdBase)['tabla'] ?? [];

        $origByMes = [];
        foreach ($tab as $r) {
            $m = $r['mes'] ?? '';
            if ($m) $origByMes[$m] = array_key_exists('uso_orig_despues_pct', $r) ? (float)$r['uso_orig_despues_pct'] : null;
        }
        $destByMes = [];
        foreach ($tab as $r) {
            $m = $r['mes'] ?? '';
            if ($m) $destByMes[$m] = array_key_exists('uso_dest_despues_pct', $r) ? (float)$r['uso_dest_despues_pct'] : null;
        }
        $toByMes = [];
        foreach ($toT as $r) {
            $m = $r['mes'] ?? '';
            if ($m) $toByMes[$m] = array_key_exists('uso_despues_pct', $r) ? (float)$r['uso_despues_pct'] : null;
        }
        $tdByMes = [];
        foreach ($tdT as $r) {
            $m = $r['mes'] ?? '';
            if ($m) $tdByMes[$m] = array_key_exists('uso_despues_pct', $r) ? (float)$r['uso_despues_pct'] : null;
        }

        // Origen — sobreescribir siempre (caso más reciente gana)
        if (!in_array($orig, $orden)) $orden[] = $orig;
        $alimPct[$orig]     = $origByMes;
        $trafoPct[$orig]    = $toByMes;
        $trafoLbl[$orig]    = $barrLbl($toBase, $orig);
        $casoPorAlim[$orig] = $n;

        // Destino — idem
        if (!in_array($dest, $orden)) $orden[] = $dest;
        $alimPct[$dest]     = $destByMes;
        $trafoPct[$dest]    = $tdByMes;
        $trafoLbl[$dest]    = $barrLbl($tdBase, $dest);
        $casoPorAlim[$dest] = $n;
    }

    // Cabecera
    $th = '<th style="min-width:180px;text-align:left;padding:6px 8px">Alimentador / SE</th>'
        . '<th style="min-width:44px;text-align:center;padding:6px 4px">Caso</th>';
    foreach ($mesesOrd as $mes) {
        $th .= '<th style="text-align:center;padding:4px 6px;min-width:62px">' . _repMesAbr($mes) . '</th>';
    }

    // Filas
    $rows = '';
    foreach ($orden as $nombre) {
        $pcts      = array_map(fn($m) => $alimPct[$nombre][$m]  ?? null, $mesesOrd);
        $trafoPcts = array_map(fn($m) => $trafoPct[$nombre][$m] ?? null, $mesesOrd);
        $casoN     = $casoPorAlim[$nombre] ?? 1;
        $cIdx      = ($casoN - 1) % count($cadenaColors);
        $colorBg   = $cadenaColorsLight[$cIdx];
        $colorFg   = $cadenaColors[$cIdx];

        $worstIdx = -1; $worstVal = -INF;
        foreach ($pcts as $idx => $p) {
            if ($p !== null && $p > $worstVal) { $worstVal = $p; $worstIdx = $idx; }
        }
        $casoCell  = "<td style=\"text-align:center;background:{$colorBg};color:{$colorFg};font-weight:700;font-size:.8rem;padding:4px\">C{$casoN}</td>";
        $dataCells = '';
        foreach ($pcts as $idx => $p) {
            $ws = ($idx === $worstIdx) ? 'border-left:2px solid rgba(192,0,0,.55);border-right:2px solid rgba(192,0,0,.55);font-weight:bold;' : '';
            if ($p !== null) {
                $col = _repCadPctColor($p);
                $dataCells .= "<td style=\"text-align:center;padding:4px 6px;{$ws}color:{$col}\">" . number_format($p, 1) . "%</td>";
            } else {
                $dataCells .= "<td style=\"text-align:center;padding:4px 6px;{$ws}color:#bbb\">—</td>";
            }
        }
        $rows .= "<tr style=\"border-bottom:1px solid #eee\">"
               . "<td style=\"padding:6px 8px;font-weight:700\">" . _h($nombre) . "</td>"
               . $casoCell . $dataCells . "</tr>";

        // Fila trafo (indentada, mismo color indicador)
        $lbl = _h($trafoLbl[$nombre] ?? '—');
        $worstTIdx = -1; $worstTVal = -INF;
        foreach ($trafoPcts as $idx => $p) {
            if ($p !== null && $p > $worstTVal) { $worstTVal = $p; $worstTIdx = $idx; }
        }
        $trafoCasoCell  = "<td style=\"background:{$colorBg};padding:4px\"></td>";
        $trafoDataCells = '';
        foreach ($trafoPcts as $idx => $p) {
            $ws = ($idx === $worstTIdx) ? 'border-left:2px solid rgba(192,0,0,.55);border-right:2px solid rgba(192,0,0,.55);font-weight:bold;' : '';
            if ($p !== null) {
                $col = _repCadPctColor($p);
                $trafoDataCells .= "<td style=\"text-align:center;padding:4px 6px;{$ws}color:{$col}\">" . number_format($p, 1) . "%</td>";
            } else {
                $trafoDataCells .= "<td style=\"text-align:center;padding:4px 6px;{$ws}color:#bbb\">—</td>";
            }
        }
        $rows .= "<tr style=\"border-bottom:1px solid #f0f0f0\">"
               . "<td style=\"padding:4px 8px 4px 22px;font-size:.9em;color:#555\">{$lbl}</td>"
               . $trafoCasoCell . $trafoDataCells . "</tr>";
    }

    return '<div style="overflow-x:auto;width:100%;margin-bottom:24px">'
         . '<table style="width:100%;border-collapse:collapse;font-size:.9rem;background:#fff;border:1px solid #ddd;border-radius:4px">'
         . "<thead style=\"background:#f5f7fa\"><tr>{$th}</tr></thead>"
         . "<tbody>{$rows}</tbody>"
         . '</table></div>';
}


// ── Reporte cadena de corrimientos ────────────────────────────────────────────
function generarReporteCadenaHtml(array $casos, string $rutaSalida): string {
    $cadenaColors = ['#1565c0', '#e65100', '#1b5e20'];
    $dir = dirname(realpath($rutaSalida) ?: $rutaSalida);
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $sharedHead = null;
    $secciones  = [];

    foreach ($casos as $i => $caso) {
        $n = (int)($caso['numero_caso'] ?? ($i + 1));

        // Reconstruir ajustes_info igual que el endpoint caso único
        $_ajActivos  = $caso['ajustes_activos'] ?? [];
        $_seriesRaw  = [
            'alim_orig'  => $caso['serie_raw_orig']      ?? [],
            'alim_dest'  => $caso['serie_raw_dest']      ?? [],
            'trafo_orig' => $caso['serie_raw_trafo_orig'] ?? [],
            'trafo_dest' => $caso['serie_raw_trafo_dest'] ?? [],
        ];
        $_nomOrig    = $caso['nombre_orig'] ?? '';
        $_nomDest    = $caso['nombre_dest'] ?? '';
        $_tOrigBarra = trim((string)(($caso['trafo_orig'] ?? [])['barra'] ?? ''));
        $_tDestBarra = trim((string)(($caso['trafo_dest'] ?? [])['barra'] ?? ''));
        $_labels     = [
            'alim_orig'  => "Alim. Origen ({$_nomOrig})",
            'alim_dest'  => "Alim. Destino ({$_nomDest})",
            'trafo_orig' => $_tOrigBarra ? "Trafo Origen ({$_tOrigBarra})" : 'Trafo Origen',
            'trafo_dest' => $_tDestBarra ? "Trafo Destino ({$_tDestBarra})" : 'Trafo Destino',
        ];
        $ajustesInfo = [];
        foreach ($_ajActivos as $_key => $_aj) {
            if (empty($_aj)) continue;
            $_raw = $_seriesRaw[$_key] ?? [];
            ksort($_aj);
            $_mesesAj = [];
            foreach ($_aj as $_mes => $_val) {
                $_mesesAj[] = ['mes' => $_mes, 'valor_sql' => $_raw[$_mes] ?? null, 'valor_ajustado' => $_val];
            }
            $ajustesInfo[] = ['label' => $_labels[$_key] ?? $_key, 'meses' => $_mesesAj];
        }

        // Generar HTML del caso en archivo temporal
        $tmpFile = $dir . '/~cadtmp_' . $n . '_' . uniqid() . '.html';
        generarReporteHtml(
            $caso['tabla']              ?? [],
            $caso['isla']               ?? [],
            $_nomOrig,
            $_nomDest,
            (float)($caso['cn_orig']    ?? 0),
            (float)($caso['cn_dest']    ?? 0),
            (float)($caso['delta_max']  ?? 0),
            $caso['resumen']            ?? [],
            $tmpFile,
            $caso['descripcion']        ?? '',
            null,
            $caso['trafo_orig']         ?? null,
            $caso['trafo_dest']         ?? null,
            $caso['detalle_tds']        ?? [],
            $caso['equipo_abre']        ?? '',
            $caso['escenario']          ?? 'normal',
            $caso['equipo_cierra']      ?? '',
            isset($caso['n_td_equipo_total']) ? (int)$caso['n_td_equipo_total'] : null,
            $caso['tabla_mam']          ?? null,
            $caso['trafo_orig_mam']     ?? null,
            $caso['trafo_dest_mam']     ?? null,
            $caso['cambio_topologico']  ?? '',
            $caso['equipos_traspasados'] ?? null,
            $ajustesInfo ?: null,
            $caso['lz_info']            ?? null,
        );
        $singleHtml = file_get_contents($tmpFile);
        @unlink($tmpFile);

        // Extraer <head> del primer caso (CSS + CDN compartidos)
        if ($sharedHead === null) {
            preg_match('/<head>(.*?)<\/head>/si', $singleHtml, $hm);
            $sharedHead = $hm[1] ?? '';
        }

        // Extraer contenido del <body>
        preg_match('/<body>(.*?)<\/body>/si', $singleHtml, $bm);
        $bodyContent = trim($bm[1] ?? $singleHtml);

        // Prefijar IDs de Chart.js para evitar conflictos entre casos en el mismo DOM
        $pfx         = "c{$n}_";
        $bodyContent = preg_replace("/id='(cjs_[^']+)'/", "id='{$pfx}$1'", $bodyContent);
        $bodyContent = preg_replace("/getElementById\('(cjs_[^']+)'\)/", "getElementById('{$pfx}$1')", $bodyContent);

        $color  = $cadenaColors[($n - 1) % count($cadenaColors)];
        $pct    = number_format((float)(($caso['isla'] ?? [])['p_pct'] ?? 0), 1);
        $origH  = _h($_nomOrig);
        $destH  = _h($_nomDest);
        $peor   = $caso['resumen']['peor_estado'] ?? '';
        $estLbl = ['critico' => 'Crítico ⚠', 'prealerta' => 'Prealerta', 'viable' => 'Viable ✓'][$peor] ?? $peor;
        $openAtr = $n === 1 ? ' open' : '';

        $secciones[] = "<details class=\"caso-det\"{$openAtr} style=\"margin-bottom:14px;border-radius:4px;overflow:hidden\">"
            . "<summary style=\"background:{$color};color:#fff;padding:10px 16px;cursor:pointer;list-style:none\">"
            . "<strong>Caso {$n}: {$origH} &rarr; {$destH}</strong> &mdash; {$pct}% &mdash; {$estLbl}"
            . "</summary>"
            . "<div style=\"border-left:4px solid {$color};padding:16px\">{$bodyContent}</div>"
            . "</details>";
    }

    // Texto introductorio
    $pasos  = [];
    $nCasos = count($casos);
    foreach ($casos as $c) {
        $p       = number_format((float)(($c['isla'] ?? [])['p_pct'] ?? 0), 1);
        $pasos[] = '<strong>' . _h($c['nombre_orig'] ?? '') . ' &rarr; ' . _h($c['nombre_dest'] ?? '') . "</strong> transfiriendo {$p}%";
    }
    if ($nCasos === 1) {
        $introTxt = "Traspaso de carga: {$pasos[0]}.";
    } elseif ($nCasos === 2) {
        $introTxt = "Traspaso de carga con 1 corrimiento: desde {$pasos[0]}, luego {$pasos[1]}.";
    } else {
        $mid      = implode(', luego ', array_slice($pasos, 1, $nCasos - 2));
        $introTxt = "Traspaso de carga con " . ($nCasos - 1) . " corrimientos: desde {$pasos[0]}, {$mid}, y finalmente {$pasos[$nCasos - 1]}.";
    }

    $today         = date('Y-m-d H:i');
    $orig0H        = _h($casos[0]['nombre_orig']           ?? '');
    $destNH        = _h($casos[$nCasos - 1]['nombre_dest'] ?? '');
    $seccionesHtml = implode("\n", $secciones);
    $sharedHead    = $sharedHead ?? '';
    $nCasosStr     = $nCasos . ' caso' . ($nCasos > 1 ? 's' : '');
    $fuTablaHtml   = "<h2 style=\"margin:20px 0 8px;font-size:1.05rem;color:#333\">FU por per&iacute;odo &mdash; alimentadores y transformadores</h2>\n  "
                   . _tablaFuPeriodosHtml($casos);

    $html = "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n"
        . "  <meta charset=\"utf-8\">\n"
        . "  <title>Traspaso con corrimiento &mdash; {$nCasosStr} ({$orig0H} &rarr; {$destNH})</title>\n"
        . "  {$sharedHead}\n"
        . "  <style>details.caso-det>summary::-webkit-details-marker{display:none}details.caso-det>summary::marker{display:none}</style>\n"
        . "</head>\n<body>\n"
        . "  <h1>Traspaso con corrimiento &mdash; {$nCasosStr} ({$orig0H} &rarr; {$destNH})</h1>\n"
        . "  <p>Generado el {$today}</p>\n"
        . "  <div style=\"background:#f0f4ff;border-left:4px solid #1565c0;padding:12px 16px;border-radius:4px;margin-bottom:20px\">\n"
        . "    <p style=\"margin:0\">{$introTxt}</p>\n  </div>\n"
        . "  {$fuTablaHtml}\n"
        . "  {$seccionesHtml}\n"
        . "</body>\n</html>";

    file_put_contents($rutaSalida, $html);
    return $rutaSalida;
}



function _repTablaMensualVcc(array $tabla, string $nombre, float $dtA = 0.0, float $dtPct = 0.0, string $labelDelta = 'ΔI cliente (A)'): string {
    if (empty($tabla)) return '<p>Sin datos.</p>';
    $worstIdx = 0; $worstVal = -1.0;
    foreach ($tabla as $i => $r) {
        $v = (float)($r['uso_despues_pct'] ?? -1.0);
        if ($v > $worstVal) { $worstVal = $v; $worstIdx = $i; }
    }
    $WTH = 'border-left:2px solid rgba(192,0,0,.6);border-right:2px solid rgba(192,0,0,.6);background:rgba(231,76,60,.12);font-weight:bold';
    $WTD = 'border-left:2px solid rgba(192,0,0,.5);border-right:2px solid rgba(192,0,0,.5);font-weight:bold';
    $rowBg   = ['viable'=>'#E8F7EE','prealerta'=>'#FEF3E2','critico'=>'#FCECEA'];
    $badgeCl = ['viable'=>'badge-v','prealerta'=>'badge-p','critico'=>'badge-c','sin_datos'=>'badge-s'];
    $badgeLb = ['viable'=>'Viable','prealerta'=>'Prealerta','critico'=>'Crítico','sin_datos'=>'—'];
    $ths = implode('', array_map(fn($i,$r) =>
        "<th class='py-1 text-center' style='white-space:nowrap;" . ($i===$worstIdx ? $WTH : '') . "'>"
        . _repMesLbl((string)($r['mes'] ?? '')) . '</th>',
        array_keys($tabla), $tabla
    ));
    $head = "<tr><th class='py-1' style='min-width:110px;white-space:nowrap'>Métrica</th>$ths</tr>";

    $iSql = function(?float $iAdj) use ($dtA, $dtPct): ?float {
        if ($iAdj === null) return null;
        if ($dtPct > 0 && $dtPct < 100) return round($iAdj / (1 - $dtPct / 100), 1);
        if ($dtA > 0) return round($iAdj + $dtA, 1);
        return $iAdj;
    };
    $deltaTrp = function(?float $iAdj) use ($iSql): ?float {
        $sql = $iSql($iAdj);
        if ($sql === null || $iAdj === null) return null;
        return round($iAdj - $sql, 1);
    };
    $cell = function(array $r, string $mKey, int $i) use ($worstIdx, $WTD, $rowBg, $badgeCl, $badgeLb, $iSql, $deltaTrp): string {
        $est = $r['estado'] ?? '';
        $wst = $i === $worstIdx ? $WTD : '';
        if ($mKey === 'estado') {
            $bg = $rowBg[$est] ?? ''; $st = implode(';', array_filter([$bg ? "background:$bg" : '', $wst]));
            $bc = $badgeCl[$est] ?? 'badge-s'; $bl = $badgeLb[$est] ?? $est;
            return "<td class='text-center' style='$st'><span class='badge $bc'>$bl</span></td>";
        }
        if ($mKey === '_delta') {
            $d = $r['delta'] ?? null;
            if ($d === null) { $ant = $r['I_antes'] ?? null; $des = $r['I_despues'] ?? null; $d = ($ant!==null&&$des!==null) ? ($des-$ant) : null; }
            $txt = $d !== null ? (($d >= 0 ? '+' : '') . number_format($d,1)) : '—';
            return "<td class='text-center' style='$wst'>$txt</td>";
        }
        $v = $r[$mKey] ?? null;
        if ($mKey === 'uso_despues_pct') {
            $fuBg = $rowBg[$est] ?? ''; $st = implode(';', array_filter([$fuBg ? "background:$fuBg" : '', $wst]));
        } else { $st = $wst; }
        $txt = $v !== null ? (str_contains($mKey,'pct') ? number_format((float)$v,1).'%' : number_format((float)$v,1)) : '—';
        return "<td class='text-center' style='$st'>$txt</td>";
    };

    $hayTraspaso = $dtA > 0 || $dtPct > 0;
    if ($hayTraspaso) {
        $celdasSql = implode('', array_map(fn($i,$r) =>
            "<td class='text-center' style='" . ($i===$worstIdx?$WTD:'') . "'>" . ($iSql((float)($r['I_antes']??0)) ?? '—') . '</td>',
            array_keys($tabla), $tabla));
        $fmtTrp = fn($v) => $v === null ? '—' : (($v > 0 ? '+' : '') . number_format($v,1));
        $celdasTrp = implode('', array_map(fn($i,$r) =>
            "<td class='text-center' style='color:#c07000;" . ($i===$worstIdx?$WTD:'') . "'>" . $fmtTrp($deltaTrp((float)($r['I_antes']??0))) . '</td>',
            array_keys($tabla), $tabla));
        $filasInicio = "<tr style='background:#fff8e1'><td class='fw-semibold small' style='white-space:nowrap;background:#fdf5d0'>I antes (A)</td>$celdasSql</tr>"
            . "<tr style='background:#fff8e1'><td class='fw-semibold small' style='white-space:nowrap;background:#fdf5d0'>I traspasada (A)</td>$celdasTrp</tr>";
    } else {
        $celdasIAntes = implode('', array_map(fn($i,$r) => $cell($r,'I_antes',$i), array_keys($tabla),$tabla));
        $filasInicio  = "<tr><td class='fw-semibold small' style='white-space:nowrap;background:#f8f9fa'>I antes (A)</td>$celdasIAntes</tr>";
    }

    $metricasResto = [['_delta', $labelDelta],['I_despues','I después (A)'],['uso_antes_pct','FU antes (%)'],['uso_despues_pct','FU después (%)'],['estado','Estado']];
    $body = $filasInicio . implode('', array_map(fn($mk) =>
        "<tr><td class='fw-semibold small' style='white-space:nowrap;background:#f8f9fa'>{$mk[1]}</td>"
        . implode('', array_map(fn($i,$r) => $cell($r,$mk[0],$i), array_keys($tabla),$tabla))
        . '</tr>',
        $metricasResto
    ));
    return "<div style='overflow-x:auto'><table class='tabla-sim' style='font-size:.78rem;width:100%'><thead>$head</thead><tbody>$body</tbody></table></div>";
}

function _repTablaEquiposHtml(array $equipos, float $deltaI): string {
    if (empty($equipos)) return '<p>Sin equipos upstream detectados.</p>';
    $tipoMap = ['reconectador'=>'Reconectador','equipo_sub'=>'Equipo sub.','otro'=>'Otro','conductor_intermedio'=>'Conductor'];
    $hasEnfoques = (bool)array_filter($equipos, fn($eq) => !empty($eq['enfoque_a']) || !empty($eq['enfoque_b']));
    $fuenteBadge = fn(string $f): string => $f === 'conductor'
        ? "<br><span class='badge badge-conductor'>Conductor</span>"
        : "<br><span class='badge badge-equipo'>Equipo</span>";

    if (!$hasEnfoques) {
        $filas = '';
        foreach ($equipos as $eq) {
            [$badge, $label] = _REP_ESTADO_BADGE_VCC[$eq['estado'] ?? 'sin_cn'] ?? ['badge-s','Sin ajuste'];
            $badgeHtml = "<span class='badge $badge'>$label</span>";
            $fuente    = $eq['fuente_ajuste'] ?? 'equipo';
            $cnStr     = isset($eq['cn']) ? number_format((float)$eq['cn'],0).' A'.$fuenteBadge($fuente) : '&#8212;';
            $dpctStr   = isset($eq['delta_pct']) ? number_format((float)$eq['delta_pct'],1).'%' : '&#8212;';
            $tipoLbl   = $tipoMap[$eq['tipo'] ?? ''] ?? ($eq['tipo'] ?? '');
            $nombreHtml = ($eq['tipo'] ?? '') === 'conductor_intermedio'
                ? 'tramo ' . _h(str_replace(['Conductor(', ')'], ['→', ''], $eq['nombre']))
                : '<code>' . _h($eq['nombre']) . '</code>';
            $filas .= "<tr><td>$nombreHtml</td><td>" . _h($tipoLbl) . "</td><td class='r'>$cnStr</td>"
                . "<td class='r'>" . number_format($deltaI,2) . " A</td><td class='r'>$dpctStr</td><td>$badgeHtml</td></tr>";
        }
        return "<table class='tabla-sim' style='font-size:.82rem'><thead><tr>"
             . "<th>Equipo</th><th>Tipo</th><th class='r'>Ajuste</th><th class='r'>ΔI</th><th class='r'>ΔI/Ajuste</th><th>Estado</th>"
             . "</tr></thead><tbody>$filas</tbody></table>";
    }

    $SEP  = 'border-left:2px solid #adb5bd';
    $TIPA = 'Cota conservadora: I_base = CN_alim × (kVA aguas abajo del equipo / kVA total del alimentador). Representa el peor caso teórico: toda la potencia instalada aguas abajo se consume simultáneamente.';
    $TIPB = 'Demanda real ponderada: I_base = I_alim_real(mes) × (kVA aguas abajo / kVA total). Usa la demanda mensual medida del alimentador escalada por la fracción de carga que pasa por el equipo. Se muestra el peor mes del año corrido.';
    $cabecera = "<thead><tr><th rowspan='2'>Equipo</th><th rowspan='2'>Tipo</th>"
        . "<th class='r' rowspan='2'>Ajuste (A)</th><th class='r' rowspan='2'>ΔI (A)</th>"
        . "<th colspan='3' class='c' style='$SEP'>Enfoque A &#8212; cota conservadora <span class='tip' data-tip='$TIPA'>&#9432;</span></th>"
        . "<th colspan='3' class='c' style='$SEP'>Enfoque B &#8212; demanda real <span class='tip' data-tip='$TIPB'>&#9432;</span></th>"
        . "<th rowspan='2'>Estado</th></tr><tr>"
        . "<th class='r' style='$SEP'>I_base (A)</th><th class='r'>I+ΔI (A)</th><th class='r'>% Ajuste</th>"
        . "<th class='r' style='$SEP'>I_base_max (A)</th><th class='r'>I+ΔI (A)</th><th class='r'>% Ajuste</th>"
        . "</tr></thead>";
    $pctTd = function(float $pct, string $estado, string $extra='') use ($SEP): string {
        $bg = _REP_ESTADO_BG_VCC[$estado] ?? ''; $st = ($bg ? "background:$bg;" : '') . $extra;
        return "<td class='r' style='$st'>" . number_format($pct,1) . '%</td>';
    };
    $filas = [];
    foreach ($equipos as $eq) {
        $tipoLbl   = $tipoMap[$eq['tipo'] ?? ''] ?? ($eq['tipo'] ?? '');
        $fuente    = $eq['fuente_ajuste'] ?? 'equipo';
        $cnStr     = isset($eq['cn']) ? number_format((float)$eq['cn'],0).$fuenteBadge($fuente) : '&#8212;';
        [$badge,$label] = _REP_ESTADO_BADGE_VCC[$eq['estado'] ?? 'sin_cn'] ?? ['badge-s','Sin ajuste'];
        $badgeHtml = "<span class='badge $badge'>$label</span>";
        $enfA = $eq['enfoque_a'] ?? null;
        $enfB = $eq['enfoque_b'] ?? null;
        $cellsA = $enfA
            ? "<td class='r' style='$SEP'>" . number_format($enfA['I_base'],1) . '</td>'
              . "<td class='r'>" . number_format($enfA['I_total'],1) . '</td>'
              . $pctTd($enfA['pct'], $enfA['estado'])
            : "<td class='r text-muted' style='$SEP'>&#8212;</td><td class='r text-muted'>&#8212;</td><td class='r text-muted'>&#8212;</td>";
        if ($enfB) {
            $mesLbl = _repMesLbl((string)$enfB['mes_max']);
            $cellsB = "<td class='r' style='$SEP'>" . number_format($enfB['I_base_max'],1) . " <small style='color:#888'>($mesLbl)</small></td>"
                . "<td class='r'>" . number_format($enfB['I_total'],1) . '</td>'
                . $pctTd($enfB['pct'], $enfB['estado']);
        } else {
            $cellsB = "<td class='r text-muted' style='$SEP'>&#8212;</td><td class='r text-muted'>&#8212;</td><td class='r text-muted'>&#8212;</td>";
        }
        $nombreHtml2 = ($eq['tipo'] ?? '') === 'conductor_intermedio'
            ? 'tramo ' . _h(str_replace(['Conductor(', ')'], ['→', ''], $eq['nombre']))
            : '<code>' . _h($eq['nombre']) . '</code>';
        $filas[] = "<tr><td>$nombreHtml2</td><td>" . _h($tipoLbl) . "</td>"
            . "<td class='r'>$cnStr</td><td class='r'>" . number_format($deltaI,2) . "</td>"
            . "$cellsA$cellsB<td>$badgeHtml</td></tr>";
        if ($enfB && !empty($enfB['serie'])) {
            $serie  = $enfB['serie'];
            $thsM   = implode('', array_map(fn($s) => "<th style='font-size:.72rem;padding:2px 6px'>" . _repMesLbl((string)$s['mes']) . '</th>', $serie));
            $tdsPct = implode('', array_map(fn($s) =>
                "<td style='font-size:.72rem;padding:2px 6px;text-align:right;background:" . (_REP_ESTADO_BG_VCC[$s['estado'] ?? ''] ?? '') . "'>"
                . number_format($s['pct'],1) . '%</td>', $serie));
            $filas[] = "<tr><td colspan='11' style='padding:0 0 8px 2rem;border-top:none'>"
                . "<details><summary style='cursor:pointer;color:#555;font-size:.8rem'>Serie mensual — Enfoque B</summary>"
                . "<div style='overflow-x:auto;margin-top:4px'>"
                . "<table style='font-size:.72rem;border-collapse:collapse'>"
                . "<thead><tr><th style='padding:2px 6px'>% Ajuste</th>$thsM</tr></thead>"
                . "<tbody><tr><td style='padding:2px 6px;color:#888'>valor</td>$tdsPct</tr></tbody>"
                . "</table></div></details></td></tr>";
        }
    }
    return "<div style='overflow-x:auto'><table class='tabla-sim' style='font-size:.82rem;width:100%'>"
         . $cabecera . '<tbody>' . implode('', $filas) . '</tbody></table></div>';
}

function _repSeccionReceptorHtml(array $dest): string {
    $nomB   = $dest['nom_alim'] ?? 'Receptor';
    $cnB    = (float)($dest['cn_alim'] ?? 0);
    $deltaI = (float)($dest['delta_I'] ?? 0);
    $pctMax = $dest['pct_max_alim'] !== null ? number_format((float)$dest['pct_max_alim'], 1) . '%' : '—';
    $mesMax = $dest['mes_max_alim'] ?? '';
    $mesLbl = $mesMax ? _repMesLbl($mesMax) : '—';

    $tablaAlim   = $dest['tabla_alim'] ?? [];
    $equiposEval = $dest['equipos_eval'] ?? [];
    $nEq         = count(array_filter($equiposEval, fn($e) => !empty($e['cn'])));

    $tablaAlimHtml = $tablaAlim
        ? _repTablaMensualVcc($tablaAlim, $nomB, 0.0, 0.0, 'ΔI traspaso (A)')
        : '<p>Sin datos.</p>';
    $equiposHtml = _repTablaEquiposHtml($equiposEval, $deltaI);

    $trafoSection = '';
    $trafoInfo    = $dest['tabla_trafo'] ?? null;
    if (!empty($trafoInfo) && !($trafoInfo['sin_datos'] ?? false)) {
        $trafoNombre  = $trafoInfo['barra'] ?? $trafoInfo['barra_alim'] ?? 'Trafo AT/MT';
        $trafoTabla   = $trafoInfo['tabla'] ?? [];
        $trafoHtml    = _repTablaMensualVcc($trafoTabla, $trafoNombre, 0.0, 0.0, 'ΔI traspaso (A)');
        $trafoSection = "<details class='vcc-det'>"
            . "<summary class='vcc-det-sum'>Trafo AT/MT &#8212; " . _h($trafoNombre) . "</summary>"
            . "$trafoHtml</details>";
    }

    $nomBH = _h($nomB);
    $meta = "<p style='margin:6px 0 10px'><strong>&#916;I traspaso:</strong> +" . number_format($deltaI, 2) . " A"
        . " &nbsp;|&nbsp; <strong>CN receptor:</strong> " . number_format($cnB, 0) . " A"
        . " &nbsp;|&nbsp; <strong>FU peor mes ($mesLbl):</strong> $pctMax</p>";
    return "<details class='vcc-receptor'>"
        . "<summary class='vcc-esc-sum vcc-receptor-sum'>&#x21A9; Alimentador receptor &#8212; $nomBH</summary>"
        . $meta
        . "<details open class='vcc-det'><summary class='vcc-det-sum'>Alimentador &#8212; $nomBH</summary>$tablaAlimHtml</details>"
        . $trafoSection
        . "<details open class='vcc-det'><summary class='vcc-det-sum'>Equipos aguas arriba ($nEq con CN)</summary>$equiposHtml</details>"
        . "</details>";
}

function _repSeccionVccHtml(
    string  $titulo,
    string  $nombreAlim,
    array   $tablaAlim,
    float   $cnAlim,
    ?array  $trafoInfo,
    array   $equipos,
    float   $deltaI,
    float   $kva,
    float   $tension,
    string  $traspasHtml = '',
    float   $dtA  = 0.0,
    float   $dtPct = 0.0,
): string {
    $tablaAlimHtml = _repTablaMensualVcc($tablaAlim, $nombreAlim, $dtA, $dtPct);
    $equiposHtml   = _repTablaEquiposHtml($equipos, $deltaI);
    $nEq = count(array_filter($equipos, fn($e) => !empty($e['cn'])));
    $trafoSection  = '';
    if (!empty($trafoInfo) && !($trafoInfo['sin_datos'] ?? false)) {
        $trafoNombre = $trafoInfo['barra'] ?? $trafoInfo['barra_alim'] ?? 'Trafo AT/MT';
        $trafoTabla  = $trafoInfo['tabla'] ?? [];
        $trafoHtml   = _repTablaMensualVcc($trafoTabla, $trafoNombre);
        $trafoSection = "<details open class='vcc-det'>"
            . "<summary class='vcc-det-sum'>Trafo AT/MT &#8212; " . _h($trafoNombre) . "</summary>"
            . "$trafoHtml</details>";
    }
    $kvaFmt  = number_format($kva, 0);
    $cnFmt   = number_format($cnAlim, 0);
    $diFmt   = number_format($deltaI, 2);
    $tensFmt = number_format($tension, 0);
    $eqLabel = "Equipos aguas arriba ($nEq con CN)";
    $meta = "<p style='margin:6px 0 10px'><strong>kVA:</strong> $kvaFmt &nbsp;|&nbsp; <strong>Tensión:</strong> $tensFmt kV"
        . " &nbsp;|&nbsp; <strong>ΔI cliente:</strong> $diFmt A"
        . " &nbsp;|&nbsp; <strong>CN alimentador:</strong> $cnFmt A</p>";
    return "<details open class='vcc-escenario'>"
        . "<summary class='vcc-esc-sum'>$titulo</summary>"
        . $meta
        . $traspasHtml
        . "<details open class='vcc-det'><summary class='vcc-det-sum'>Alimentador &#8212; " . _h($nombreAlim) . "</summary>$tablaAlimHtml</details>"
        . $trafoSection
        . "<details open class='vcc-det'><summary class='vcc-det-sum'>$eqLabel</summary>$equiposHtml</details>"
        . "</details>";
}

function generarReporteVcc(array $body, string $rutaSalida): string {
    $nombreAlim    = $body['nombre_alim'] ?? '';
    $tensionKv     = (float)($body['tension_kv'] ?? 12);
    $kvaEmpalme    = (float)($body['kva_empalme'] ?? 0);
    $kvaInst       = $body['kva_instalado'] ?? null;
    $numpos        = $body['numpos'] ?? '';
    $numposNuevoTp = $body['numpos_nuevo_tp'] ?? '';
    $nombreRef     = $body['nombre_ref'] ?? '';
    $nTds          = $body['n_tds_aguas_abajo'] ?? 0;
    $tablaAlim     = $body['tabla_alim'] ?? [];
    $cnAlim        = (float)($body['cn_alim'] ?? 0);
    $tablaTrafo    = $body['tabla_trafo'] ?? null;
    $equiposEval   = $body['equipos_eval'] ?? [];
    $deltaI        = (float)($body['delta_I'] ?? 0);
    $idCliente     = $body['id_cliente'] ?? '';
    $nombreCliente = $body['nombre_cliente'] ?? '';
    $direccion     = $body['direccion'] ?? '';
    $descripcion   = $body['descripcion'] ?? '';
    $dtModo  = $body['delta_traspaso_modo'] ?? '';
    $dtA     = (float)($body['delta_traspaso_a']   ?? 0);
    $dtPct   = (float)($body['delta_traspaso_pct'] ?? 0);
    $alivioA     = (float)($body['alivio_A_peor'] ?? 0);
    $mesMax      = $body['mes_max_alim'] ?? '';
    $analisisDest = $body['analisis_destino'] ?? null;

    $traspasHtml = '';
    if ($dtModo && $dtModo !== 'ninguno' && ($dtA > 0 || $dtPct > 0)) {
        $modos     = ['a'=>'ΔI manual','pct'=>'% manual','topo'=>'Topología'];
        $modoLabel = $modos[$dtModo] ?? $dtModo;
        $valStr    = $dtPct > 0 ? number_format($dtPct,1).'%' : number_format($dtA,1).' A';
        $alivioStr = $alivioA > 0 ? " &nbsp;&#x2192;&nbsp; Alivio en $mesMax: <strong>−" . number_format($alivioA,1) . ' A</strong>' : '';
        $traspasHtml = "<div class='traspaso-vcc'><strong>&#x2193; Traspaso simultáneo ($modoLabel):</strong> "
            . "Reducción de base = $valStr$alivioStr. El análisis usa la serie del alimentador corregida por este alivio.</div>";
    }

    $seccionEmp = _repSeccionVccHtml(
        "Escenario 1 — kVA Empalme (" . number_format($kvaEmpalme,0) . ' kVA)',
        $nombreAlim, $tablaAlim, $cnAlim, $tablaTrafo, $equiposEval,
        $deltaI, $kvaEmpalme, $tensionKv, $traspasHtml, $dtA, $dtPct
    );

    $seccionReceptorHtml = $analisisDest ? _repSeccionReceptorHtml($analisisDest) : '';

    $seccionInst = '';
    if ($kvaInst && !empty($body['tabla_alim_sens'])) {
        $kvaInstF   = (float)$kvaInst;
        $deltaISens = (float)($body['delta_I_sens'] ?? 0);
        $seccionInst = _repSeccionVccHtml(
            "Escenario 2 — kVA Instalado (" . number_format($kvaInstF,0) . ' kVA)',
            $nombreAlim, $body['tabla_alim_sens'], $cnAlim,
            $body['tabla_trafo_sens'] ?? null, $body['equipos_eval_sens'] ?? [],
            $deltaISens, $kvaInstF, $tensionKv, $traspasHtml, $dtA, $dtPct
        );
    }

    $filasCliente = [];
    if ($idCliente)     $filasCliente[] = "<tr><td><strong>ID Cliente</strong></td><td>" . _h($idCliente) . "</td></tr>";
    if ($nombreCliente) $filasCliente[] = "<tr><td><strong>Nombre / Razon social</strong></td><td>" . _h($nombreCliente) . "</td></tr>";
    if ($direccion)     $filasCliente[] = "<tr><td><strong>Direccion</strong></td><td>" . _h($direccion) . "</td></tr>";
    if ($descripcion)   $filasCliente[] = "<tr><td><strong>Observaciones</strong></td><td>" . _h($descripcion) . "</td></tr>";
    $clienteHtml = $filasCliente ? '<table class="info-table">' . implode('', $filasCliente) . '</table>' : '';

    $puntoExtra = $numposNuevoTp ? " &nbsp;&rarr;&nbsp; <strong>Nuevo TP:</strong> " . _h($numposNuevoTp) : '';
    $tdsStr     = $nTds ? " &nbsp;|&nbsp; " . (int)$nTds . " TDs aguas abajo" : '';
    $idSuffix   = $idCliente ? " — " . _h($idCliente) : '';
    $today       = date('Y-m-d');
    $nombreAlimH = _h($nombreAlim);
    $nombreRefH  = _h($nombreRef);
    $numposH     = _h($numpos);
    $html = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>VCC — $nombreAlimH$idSuffix</title>
  <style>
    body{font-family:Arial,sans-serif;margin:20px;color:#222;font-size:14px}
    h1{color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:6px}
    h2{color:#1a3a5c;margin-top:28px}
    h3{color:#2c5f8a;margin-top:18px}
    table{border-collapse:collapse;width:100%;margin:8px 0 18px}
    th,td{border:1px solid #ccc;padding:5px 9px;font-size:13px}
    th{background:#1a3a5c;color:#fff;text-align:left}
    td.r{text-align:right}
    .info-table td{border:none;padding:3px 12px 3px 0;font-size:13px}
    .info-table td:first-child{white-space:nowrap;color:#555}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}
    .badge-v{background:#d4edda;color:#155724}
    .badge-p{background:#fff3cd;color:#856404}
    .badge-c{background:#f8d7da;color:#721c24}
    .badge-s{background:#e2e3e5;color:#383d41}
    .badge-equipo{background:#0dcaf0;color:#000;border-radius:4px;padding:1px 6px;font-size:.7em}
    .badge-conductor{background:#ffc107;color:#000;border-radius:4px;padding:1px 6px;font-size:.7em}
    .vcc-escenario{border:1px solid #dee2e6;border-radius:6px;padding:4px 16px 16px;margin-bottom:24px}
    .vcc-receptor{border:2px solid #f5a623;border-radius:6px;padding:4px 16px 16px;margin-bottom:24px;background:#fffdf5}
    .vcc-esc-sum{cursor:pointer;font-size:1.05em;font-weight:700;color:#1a3a5c;padding:10px 0 4px;list-style:none;user-select:none;display:block}
    .vcc-esc-sum::-webkit-details-marker{display:none}
    .vcc-esc-sum::before{content:"▶ ";font-size:.75em;opacity:.7}
    details[open]>.vcc-esc-sum::before{content:"▼ "}
    .vcc-receptor-sum{color:#7a4600}
    .traspaso-vcc{background:#fff8e1;border-left:4px solid #f5a623;padding:7px 12px;margin:8px 0 14px;border-radius:4px;font-size:.88em}
    .vcc-det{margin:8px 0}
    .vcc-det-sum{cursor:pointer;font-weight:600;color:#1a3a5c;font-size:.95em;padding:4px 0;list-style:none;user-select:none}
    .vcc-det-sum::-webkit-details-marker{display:none}
    .vcc-det-sum::before{content:"▶ ";font-size:.75em}
    details[open]>.vcc-det-sum::before{content:"▼ "}
    .footer{margin-top:30px;font-size:12px;color:#888;border-top:1px solid #ddd;padding-top:8px}
    .header-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;margin-bottom:16px}
    .tip{position:relative;cursor:help;border-bottom:1px dotted #888;font-size:.75rem;opacity:.75}
    .tip::after{content:attr(data-tip);position:absolute;top:125%;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:7px 11px;border-radius:5px;font-size:12px;font-weight:400;line-height:1.5;white-space:normal;width:300px;text-align:left;opacity:0;pointer-events:none;transition:opacity .18s;z-index:9999}
    .tip:hover::after{opacity:1}
    th{position:relative}
    th:has(.tip:hover){z-index:100}
  </style>
</head>
<body>
  <h1>VCC &#8212; Validacion de Conexion de Cliente</h1>
  <div class="header-grid">
    <div>
      <p style="margin:0 0 4px"><strong>Alimentador:</strong> $nombreAlimH &nbsp;|&nbsp; <strong>Tension:</strong> {$tensionKv} kV</p>
      <p style="margin:0 0 4px"><strong>Punto:</strong> $nombreRefH ($numposH)$puntoExtra$tdsStr</p>
      <p style="margin:0"><strong>Fecha:</strong> $today</p>
    </div>
    <div>$clienteHtml</div>
  </div>
  $seccionEmp
  $seccionReceptorHtml
  $seccionInst
  <div class="footer">Generado por Sistema O&amp;M ENEL Chile &nbsp;|&nbsp; $today</div>
</body>
</html>
HTML;

    $dir = dirname(realpath($rutaSalida) ?: $rutaSalida);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($rutaSalida, $html);
    return $rutaSalida;
}



