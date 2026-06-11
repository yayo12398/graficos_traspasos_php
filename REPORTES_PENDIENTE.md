# Reportes.php — Plan de Traducción (Pendiente)

## Estado
`codigo_php/src/Reportes.php` contiene solo el stub `<?php // Pendiente`.
El Python fuente (`codigo_python/traspaso/reportes.py`, 2122 líneas) fue leído completo.
**No hay que re-leer el Python.** Toda la información necesaria está en este documento.

---

## Instrucción de reanudación

Para continuar mañana:
1. Leer este archivo.
2. Usar un **sub-agente** para escribir `Reportes.php` basándose en la spec de abajo.
3. Usar otro sub-agente para verificar la traducción.
4. Agregar `require_once __DIR__ . '/src/Reportes.php';` en `index.php`.

---

## Funciones Python → PHP

### NO traducir (matplotlib, reemplazado por Chart.js)
- `_fig_a_base64()`, `_grafico_barras()`, `_grafico_estados()`, `generar_graficos()`

### Constantes (nivel módulo)

```php
const _REP_CHARTJS_CDN    = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
const _REP_TD_GRANDE_KVA  = 300;

const _REP_CJS_ESTADO_BG  = [
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
```

**CSS**: usar `function _repCss(): string { return <<<'CSS' ... CSS; }` con HEREDOC (los `const` no aceptan HEREDOC).

El CSS de Python (`_CSS`, líneas 436–499 del .py) se copia literalmente dentro del HEREDOC.

---

### Funciones privadas (`_rep` prefix)

| PHP | Python | Notas |
|-----|--------|-------|
| `_repCss(): string` | `_CSS` constant | HEREDOC en cuerpo de función |
| `_repSafe(mixed $v): mixed` | `_safe(v)` | `is_float && (is_nan || is_infinite)` → null; `is_float` → `round($v,1)` |
| `_repWorstIdx(array $vals): int` | inline `max(range(...), key=...)` | foreach para encontrar idx del máximo |
| `_repMesLbl(string $yyyymm): string` | `_mes_label()` / `_mes_lbl_eq()` | `_REP_MESES_ES[int(parts[1])] . '-' . substr(parts[0], 2, 2)` |
| `_repTrafoLabel(array $trafo): string` | `_trafo_label()` | `try{intval($bar)}` para detectar barra numérica |
| `_repTrafoLabelAlim(array $trafo, string $nombreAlim): string` | `_trafo_label_alim()` | idem |
| `_repTablaHtml(array $df, string $nomOrig, string $nomDest): string` | `_tabla_html()` | `array_values($df)`, worst_idx basado en I_orig_antes |
| `_repTdsTableHtml(array $detalleTds, string $titulo = ''): string` | `_tds_table_html()` | TDs grandes ≥300 kVA con badge ⚡ |
| `_repTablaTrafHtml(array $trafo, string $nom, string $modo, string $nombreAlim = ''): string` | `_tabla_trafo_html()` | closures para _fila_num, _fila_estado, _fila_delta |
| `_repTarjetaPeorCaso(array $df, string $nomOrig, string $nomDest, float $deltaMax, float $pPct): string` | `_tarjeta_peor_caso()` | worst row basado en I_orig_antes |
| `_repCjsBarras(array $df, float $cnOrig, float $cnDest, string $nomOrig, string $nomDest, string $cid): string` | `_cjs_barras()` | `if (!is_nan($cnDest))` para línea CN |
| `_repCjsEstados(array $df, string $nomDest, string $cid, ?float $cnDest = null): string` | `_cjs_estados()` | filtrar rows con uso_dest_despues_pct !== null |
| `_repCjsTrafo(array $trafo, string $nom, string $modo, string $cid, string $nombreAlim = ''): string` | `_cjs_trafo()` | worst_idx resalta en rojo oscuro |
| `_repCjsFeederCarg(array $meses, array $deltaMam, float $deltaCons, float $cn, string $cid): string` | `_cjs_feeder_cargabilidad()` | iMam inline en el tooltip JS |
| `_repCambiosTopoFeederHtml(array $cambios): string` | `_cambios_topo_feeder_html()` | tabla fecha+descripción |
| `_repAcumularTrafo(array $trafo, array $deltaAcumMes): array` | `_acumular_trafo()` | `array_merge($r, [...])` para spread |
| `_repTablaMensualVcc(array $tabla, string $nombre, float $dtA = 0.0, float $dtPct = 0.0): string` | `_tabla_mensual_vcc()` | closures para _i_sql, _delta_traspaso, _cell |
| `_repTablaEquiposHtml(array $equipos, float $deltaI): string` | `_tabla_equipos_html()` | dual-table si has_enfoques; sub-fila serie mensual |
| `_repSeccionVccHtml(string $titulo, string $nombreAlim, array $tablaAlim, float $cnAlim, ?array $trafoInfo, array $equipos, float $deltaI, float $kva, float $tension, string $traspasHtml = '', float $dtA = 0.0, float $dtPct = 0.0): string` | `_seccion_vcc_html()` | |

### Funciones públicas

| PHP | Python | Firma PHP |
|-----|--------|-----------|
| `generarReporteHtml(...)` | `generar_reporte_html()` | Ver abajo |
| `generarReporteFeeder(...)` | `generar_reporte_feeder()` | Ver abajo |
| `generarReporteVcc(array $body, string $rutaSalida): string` | `generar_reporte_vcc()` | |

#### `generarReporteHtml` — firma completa
```php
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
): string
```

#### `generarReporteFeeder` — firma completa
```php
function generarReporteFeeder(
    array   $feederData,
    float   $acumulado,
    ?float  $usoPct,
    string  $rutaSalida,
    ?array  $trafoFinal    = null,
    ?array  $trafoFinalMam = null,
): string
```

---

## Decisiones de traducción críticas

### 1. DataFrames → arrays
- `pd.DataFrame` → `array` de arrays asociativos (mismo formato almacenado en JSON)
- `df.empty` → `empty($df)`
- `df.iterrows()` → `foreach (array_values($df) as $i => $row)`
- `df["col"].tolist()` → `array_column($df, 'col')`
- `df.dropna(subset=["col"])` → `array_values(array_filter($df, fn($r) => $r['col'] !== null))`
- Siempre `array_values($df)` al inicio de funciones para garantizar índice 0-based

### 2. Chart.js JSON con callbacks JS
Python:
```python
cfg = {..., "PCT_CALLBACK": "PCT_CALLBACK", ...}
cfg_str = json.dumps(cfg).replace('"PCT_CALLBACK"', 'function(v){return v+"%"}')
```
PHP:
```php
$cfg = [..., 'PCT_CALLBACK' => 'PCT_CALLBACK', ...];
$cfgStr = str_replace('"PCT_CALLBACK"', 'function(v){return v+"%"}', json_encode($cfg));
```
`json_encode` sin flags (equal to Python default `ensure_ascii=True`).

### 3. NaN/Inf
- `float("nan")` → `NAN`; `float("inf")` → `INF`
- `pd.isna(v)` / `not (v == v)` → `is_nan((float)$v)`
- `_repSafe`: `is_float($v) && (is_nan($v) || is_infinite($v))` → return null

### 4. Funciones internas Python → closures PHP
```php
$fmtFn = function(float $v): string { return sprintf('%.1f', $v); };
$cellFn = function(array $r, string $key, int $i) use ($tabla, $worstIdx, $W_TD): string { ... };
```

### 5. worst_idx
```php
function _repWorstIdx(array $vals): int {
    $idx = 0; $max = -INF;
    foreach ($vals as $i => $v) {
        $fv = ($v !== null && is_numeric($v)) ? (float)$v : -1.0;
        if ($fv > $max) { $max = $fv; $idx = $i; }
    }
    return $idx;
}
```

### 6. Spread operator (`{**r, ...}`)
```python
{**r, "I_antes": i_ant_new, ...}
```
→ PHP: `array_merge($r, ['I_antes' => $iAntNew, ...])`

### 7. Escritura de archivos HTML
```php
$dir = dirname($rutaSalida);
if (!is_dir($dir)) mkdir($dir, 0755, recursive: true);
file_put_contents($rutaSalida, $html);
return $rutaSalida;
```

### 8. `_cjs_barras` — check CN line
```php
if (!is_nan($cnDest)) {  // equivale a Python: not (isinstance(cn_dest, float) and not (cn_dest == cn_dest))
    $datasets[] = [...CN dataset...];
}
```

### 9. `sfx_lbl` en generar_reporte_feeder
```php
$sfx    = $useMam ? ' Mes a mes' : '';
$sfxLbl = $sfx !== '' ? ', ' . trim($sfx) : '';
// → ", Mes a mes"  o  ""
```

### 10. `_acumular_trafo` — estado
```python
estado = ("critico" if (uso_des or 0) >= 100 else
          "prealerta" if (uso_des or 0) >= 90 else "viable") if uso_des is not None else r.get("estado", "sin_datos")
```
PHP:
```php
if ($usoDes !== null) {
    $estado = ($usoDes >= 100) ? 'critico' : (($usoDes >= 90) ? 'prealerta' : 'viable');
} else {
    $estado = $r['estado'] ?? 'sin_datos';
}
```

### 11. `_tabla_mensual_vcc` — `_i_sql` pattern
```python
_i_sql(I_adj):
    if I_adj is None: return None
    if delta_traspaso_pct > 0 and delta_traspaso_pct < 100:
        return round(I_adj / (1 - delta_traspaso_pct / 100), 1)
    if delta_traspaso_a > 0:
        return round(I_adj + delta_traspaso_a, 1)
    return I_adj
```
→ PHP closure capturando `$dtA` y `$dtPct`.

### 12. `_cjs_trafo` — tooltip callbacks
```php
$cnStr = sprintf('%.1f', $cnTrafo ?? 0);
$ttLabel = "function(ctx){var cn={$cnStr};"
    . 'if(ctx.datasetIndex===0)return " FU después: "+ctx.raw.toFixed(1)+"% — I: "+(ctx.raw*cn/100).toFixed(1)+" A";'
    . 'return " FU antes: "+ctx.raw.toFixed(1)+"% — I: "+(ctx.raw*cn/100).toFixed(1)+" A";}';
```

---

## CSS completo (de _CSS en Python, líneas 436–499)

```
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
```

---

## Estructura del archivo PHP

```
1. Constantes (const)
2. _repCss()
3. _repSafe(), _repWorstIdx(), _repMesLbl()
4. _repTrafoLabel(), _repTrafoLabelAlim()
5. _repTablaHtml(), _repTdsTableHtml(), _repTablaTrafHtml(), _repTarjetaPeorCaso()
6. _repCjsBarras(), _repCjsEstados(), _repCjsTrafo(), _repCjsFeederCarg()
7. _repCambiosTopoFeederHtml(), _repAcumularTrafo()
8. generarReporteHtml()
9. generarReporteFeeder()
10. _repTablaMensualVcc(), _repTablaEquiposHtml(), _repSeccionVccHtml()
11. generarReporteVcc()
```

---

## Notas adicionales

- `generarReporteHtml` escribe a `$rutaSalida` y retorna ese path (igual que Python)
- `generarReporteFeeder` idem
- `generarReporteVcc` idem
- En `generarReporteFeeder`, `$cnOrig = $t['cn_orig'] !== null ? (float)$t['cn_orig'] : NAN;` — solo $cnOrig puede ser NAN
- El VCC `generar_reporte_vcc` tiene su propio CSS inline (no usa `_repCss`), ver Python líneas 2051–2092
- `_repTablaEquiposHtml`: si `has_enfoques` (algún equipo tiene enfoque_a o enfoque_b) → tabla de 2 enfoques + sub-fila colapsable serie mensual del Enfoque B
- `_repSeccionVccHtml` genera una `<section class="vcc-escenario">` con 3 `<details>` anidados: alimentador, trafo (si existe), equipos upstream
