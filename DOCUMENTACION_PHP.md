# Documentación Técnica — Traducción a PHP 8.5.6
## Sistema de Análisis de Traspasos de Carga — ENEL Chile

---

## 1. Visión General

Herramienta web interna para el análisis de traspasos de carga eléctrica entre alimentadores MT y validación de conexión de clientes nuevos (VCC). Permite simular el impacto sobre la cargabilidad de alimentadores y transformadores de potencia.

**Stack actual (Python/Flask):**
- Servidor: Flask 3.x + Jinja2
- Cálculo: pandas, numpy
- BD: MySQL (`pymysql`)
- Frontend: Bootstrap 5, Chart.js, Tom Select (sin framework JS)

**Stack destino (PHP 8.5.6):**
- Servidor: PHP 8.5 con extensiones `pdo_mysql`, `json`, `mbstring`, `fileinfo`
- Cálculo numérico: lógica propia (sin equivalente directo a pandas — ver sección 7)
- BD: PDO + MySQL
- Frontend: **sin cambios** (mismo HTML/JS/CSS)
- Caché: filesystem o APCu (equivalente a PKL)

---

## 2. Estructura de Archivos

```
graficos_traspasos/
├── app.py                      → index.php (router principal)
├── config.ini                  → config.php (credenciales DB)
├── templates/
│   └── index.html              → index.html (sin cambios, servir estático)
├── traspaso/
│   ├── datos.py                → src/Datos.php
│   ├── simulacion.py           → src/Simulacion.php
│   ├── vcc.py                  → src/Vcc.php
│   ├── memoria.py              → src/Memoria.php
│   ├── ajustes.py              → src/Ajustes.php
│   ├── reportes.py             → src/Reportes.php
│   └── matching.py             → src/Matching.php (solo _slug())
├── data/
│   ├── cache/                  → data/cache/ (archivos PKL → JSON serializado)
│   └── ajustes_demanda.json    → data/ajustes_demanda.json (sin cambios)
├── feeders_nuevos/             → feeders_nuevos/ (sin cambios, JSON)
├── vcc_evaluaciones/           → vcc_evaluaciones/ (sin cambios, JSON)
└── resultados/                 → resultados/ (HTMLs generados)
```

---

## 3. Configuración

**`config.ini` (Python) → `config.php` (PHP):**

```php
<?php
return [
    'mysql_cuadrilla' => [
        'host'     => 'ewaahicdca00',
        'user'     => '...',        // ver config.ini
        'password' => '...',
        'database' => 'meyg',
        'charset'  => 'utf8mb4',
    ],
];
```

**Conexión PDO equivalente:**
```php
$cfg = require 'config.php';
$c   = $cfg['mysql_cuadrilla'];
$dsn = "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']}";
$pdo = new PDO($dsn, $c['user'], $c['password'], [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_TIMEOUT            => 20,
]);
```

---

## 4. Capa de Datos (datos.py → Datos.php)

### 4.1 Tablas MySQL utilizadas

| Tabla | Contenido | TTL caché |
|---|---|---|
| `meyg.maniobras_rapidas_aguas_abajo` | Topología alimentadores (TDs, equipos, potencias) | 7 días |
| `meyg.dem_maximas` | Demandas máximas mensuales por alimentador (long) | 30 días |
| `meyg.dem_maximas_trafos` | Demandas máximas mensuales por trafo (long) | 30 días |
| `meyg.maniobras_rapidas_limite_zona` | Límites de zona físicos entre alimentadores (dispositivos LZ y troncales receptor) | 7 días |

**`meyg.maniobras_rapidas_limite_zona`:**
```
NUMALIM_LZ       INT     — NUMALIM del alimentador origen
NOMBRE_alim_LZ   VARCHAR — nombre del alimentador origen
NUMPOS_LZ        VARCHAR — dispositivo de corte LZ ("0" = cabecera/troncal)
RAMASC_LZ        VARCHAR — código RAMASC del punto de corte en el origen
NUMALIM          INT     — NUMALIM del alimentador receptor
NOM_ALIM         VARCHAR — nombre del alimentador receptor
RAMASC_troncal   VARCHAR — código RAMASC del troncal del receptor
NUMPOS_troncal   VARCHAR — equipo en el troncal del receptor ("cabecera" o código)
NOMBRE_troncal   VARCHAR — nombre del troncal
equip_alim       VARCHAR — clave compuesta interna
```

**SQL de carga (sin DISTINCT — necesario para obtener todos los NUMPOS_troncal):**
```php
$sql = "SELECT NUMALIM_LZ, NUMALIM, NUMPOS_LZ, NUMPOS_troncal
        FROM meyg.maniobras_rapidas_limite_zona";
```

**Estructura resultante en caché:**
```json
[
  {
    "numpos_lz": "DBC108457",
    "numalim_lz": 2032,
    "numalim": 5721,
    "vecinos": [5721],
    "tipo": "bilateral",
    "excepcion": false,
    "viable": true,
    "n_troncal": 12,
    "equipos_troncal": ["CLB104708", "DBC109312", "REC118524", ...]
  }
]
```

**Viabilidad:** `viable = (n_troncal > 0)`, donde `n_troncal` es la cantidad de equipos con `NUMPOS_troncal != 'cabecera'` para el par `(NUMPOS_LZ, NUMALIM)`. Si solo hay `cabecera`, el LZ conecta directamente en la cabecera del receptor y el traspaso no tiene recorrido físico posible.

**Clasificación de equipos del troncal por prefijo:**
```php
function tipoEquipoTroncal(string $numpos): array {
    $p = strtoupper(substr($numpos, 0, 3));
    if ($p === 'REC') return ['label'=>'Reconectador', 'obs'=>'Puede disparar ante sobrecarga'];
    if ($p === 'REG') return ['label'=>'Regulador',    'obs'=>'No maniobrable'];
    if (in_array($p, ['ABB','G33','ORM','SCH','GMT','VIS','CGP','GLT']))
        return ['label'=>'Subt.', 'obs'=>'3 ramas — verificar cuál operar'];
    if (in_array($p, ['DBC','PPF','CLB']))
        return ['label'=>'Aéreo', 'obs'=>''];
    return ['label'=>'—', 'obs'=>''];
}
```

### 4.2 Columnas clave

**`meyg.maniobras_rapidas_aguas_abajo`:**
```
nom_alim      VARCHAR  — nombre del alimentador (ej: "GOLF")
nombre        VARCHAR  — nombre del TD/TP
numpos_td     VARCHAR  — posición única del TD
nombre_equip  VARCHAR  — nombre del equipo (ej: "DBC73621", "cabecera")
numpos_equip  VARCHAR  — posición del equipo
ramasc_equip  VARCHAR  — rama
potencia      FLOAT    — kVA instalado del TD
cnt_clie      INT      — cantidad de clientes
numalim       INT      — NUMALIM (llave única alimentador↔trafo)
estado_basal  VARCHAR  — estado normal del equipo
```

**`meyg.dem_maximas` (formato long):**
```
NUMALIM      INT      — llave única
SUBESTACION  VARCHAR  — nombre de la subestación
ALIMENTADOR  VARCHAR  — nombre completo del alimentador (ej: "Alim. Golf")
CN           FLOAT    — corriente nominal [A]
CE           FLOAT    — corriente de emergencia [A]
MAXIMA       FLOAT    — corriente máxima del mes [A]
MES          DATE     — mes (puede ser DATE, VARCHAR "dic-19", etc.)
```

**`meyg.dem_maximas_trafos` (formato long):**
```
NUMALIM      INT
ALIMENTADOR  VARCHAR
BARRA        VARCHAR  — identificador de barra del trafo
CN           FLOAT
CE           FLOAT
CORRIENTE    FLOAT    — corriente máxima del mes [A]
MES          DATE/VARCHAR
```

### 4.3 Pivot long → wide (PHP)

Los datos vienen en formato long (una fila por mes). Hay que pivotarlos a wide (una fila por NUMALIM, columnas = YYYY-MM).

```php
/**
 * Pivota rows long a wide: [{NUMALIM, MES, MAXIMA}, ...] 
 * → [numalim => ['cn' => X, '2024-01' => 320.5, ...]]
 */
function pivotarAlim(array $rows): array {
    $meta  = [];
    $pivot = [];
    foreach ($rows as $r) {
        $nm  = (int)$r['NUMALIM'];
        $mes = normalizarMes($r['MES']);  // → "YYYY-MM"
        if (!$mes) continue;

        if (!isset($meta[$nm])) {
            $meta[$nm] = [
                'numalim'    => $nm,
                'subestacion'=> $r['SUBESTACION'] ?? '',
                'barra_alim' => $r['ALIMENTADOR']  ?? '',
                'nom_rapida' => quitarPrefijo($r['ALIMENTADOR'] ?? ''),
                'cn'         => is_numeric($r['CN']) ? (float)$r['CN'] : null,
                'ce'         => is_numeric($r['CE']) ? (float)$r['CE'] : null,
            ];
        }
        $pivot[$nm][$mes] = is_numeric($r['MAXIMA']) ? (float)$r['MAXIMA'] : null;
    }
    $result = [];
    foreach ($meta as $nm => $m) {
        $result[$nm] = array_merge($m, $pivot[$nm] ?? []);
    }
    return $result;
}

function normalizarMes($v): ?string {
    if ($v instanceof DateTime) return $v->format('Y-m');
    $s = trim((string)$v);
    if (preg_match('/^\d{4}-\d{2}$/', $s)) return $s;
    if (preg_match('/^(\w{3})-(\d{2})$/', strtolower($s), $m)) {
        $mapa = ['ene'=>'01','feb'=>'02','mar'=>'03','abr'=>'04','may'=>'05',
                 'jun'=>'06','jul'=>'07','ago'=>'08','sep'=>'09','oct'=>'10',
                 'nov'=>'11','dic'=>'12'];
        $mm = $mapa[$m[1]] ?? null;
        if (!$mm) return null;
        $yy = (int)$m[2];
        $yyyy = $yy < 70 ? "20$m[2]" : "19$m[2]";
        return "$yyyy-$mm";
    }
    if (preg_match('/^(\d{4})-(\d{2})/', $s, $m)) return "$m[1]-$m[2]";
    return null;
}

function quitarPrefijo(string $nombre): string {
    return preg_replace('/^(Alim\.?\s+|Alimentador\.?\s+)/i', '', $nombre);
}
```

### 4.4 Caché de datos (PKL → JSON)

```php
class DataCache {
    private string $dir;

    public function __construct(string $cacheDir) {
        $this->dir = $cacheDir;
        is_dir($cacheDir) || mkdir($cacheDir, 0755, true);
    }

    public function get(string $key): mixed {
        $file = "{$this->dir}/{$key}.json";
        if (!file_exists($file)) return null;
        return json_decode(file_get_contents($file), true);
    }

    public function set(string $key, mixed $data): void {
        file_put_contents("{$this->dir}/{$key}.json", 
            json_encode($data, JSON_UNESCAPED_UNICODE));
    }

    public function isValid(string $key, int $ttlSeconds): bool {
        $file = "{$this->dir}/{$key}.json";
        if (!file_exists($file)) return false;
        return (time() - filemtime($file)) < $ttlSeconds;
    }
}

// TTLs: aguas_abajo = 7*86400, demandas = 30*86400
```

---

## 4bis. Límites de Zona — Construcción del endpoint `GET /api/vecinos_lz/{numalim}`

Esta sección describe en detalle cómo reproducir en PHP la lógica de `app.py:api_vecinos_lz()`.

### Estructura del df_lz (caché)

Cada fila del caché LZ representa un dispositivo LZ único `(NUMPOS_LZ, NUMALIM_LZ)` y contiene:

```php
[
    'numpos_lz'       => 'DBC108457',   // string — dispositivo de corte
    'numalim_lz'      => 2032,          // int    — alimentador origen
    'vecinos'         => [5721, 3214],  // int[]  — NUMALIM de vecinos
    'tipo'            => 'bilateral',   // string — "bilateral" | "subterraneo_3ramas" | otro
    'excepcion'       => false,         // bool   — corregido en _LZ_EXCEPCIONES
    'viable'          => true,          // bool   — n_troncal > 0
    'n_troncal'       => 12,            // int    — equipos no-cabecera en troncal receptor
    'equipos_troncal' => ['CLB104708', 'DBC109312', 'REC118524', ...],  // perspectiva ORIGEN
]
```

> **Importante:** `equipos_troncal` en el caché es siempre la perspectiva del `NUMALIM_LZ` (el alimentador que actúa como origen en esa fila). Cuando se construye la respuesta del endpoint, se necesitan **dos perspectivas** para cada par:
> - `equipos_troncal_orig`: perspectiva del alimentador consultado como **origen** → viene directamente de la fila del caché donde `numalim_lz == numalim_param`
> - `equipos_troncal` del vecino: perspectiva del vecino como **receptor** → se busca la fila donde `numalim_lz == vecino` y `numalim == numalim_param` (dirección inversa)

### Algoritmo PHP completo

```php
/**
 * GET /api/vecinos_lz/{numalim}
 * 
 * Devuelve los dispositivos LZ del alimentador, con vecinos, viabilidad
 * y equipos troncales desde ambas perspectivas (origen y receptor).
 */
function apiVecinosLz(int $numalim): void {
    $dfLz  = cargarLimiteZona();    // array de filas del caché LZ
    $dfAlim = cargarAlim();         // para resolver nom_alim de cada vecino

    // Índice por numalim_lz para búsqueda rápida
    $porOrigen = [];   // numalim_lz => list of rows
    $porReceptor = []; // [numalim_lz][numalim] => row  (para perspectiva receptor)
    foreach ($dfLz as $row) {
        $porOrigen[$row['numalim_lz']][] = $row;
        $porReceptor[$row['numalim_lz']][$row['numalim_lz']] = $row; // misma fila
    }
    // Reindexar para lookup (numalim_orig => (numalim_receptor => row))
    $troncalPorPar = []; // [numalim_lz][numalim_receptor] => ['viable','n_troncal','equipos_troncal']
    foreach ($dfLz as $row) {
        $orig = $row['numalim_lz'];
        foreach ($row['vecinos'] as $vec) {
            // La perspectiva del vecino como receptor está en la fila donde
            // numalim_lz == $vec y el vecino tiene $orig como vecino (dirección inversa)
        }
    }

    // Forma más directa: reconstruir desde el campo 'vecinos' de cada fila
    // Para el par (A→B): la perspectiva de B como receptor está en la fila
    // del caché donde numalim_lz == B, si esa fila tiene a A en sus vecinos.
    // Dado que el caché ya tiene 'viable'/'n_troncal'/'equipos_troncal' calculados
    // desde la perspectiva de NUMALIM_LZ, necesitamos la fila donde numalim_lz == vecino
    // que contenga al numalim consultado en sus vecinos.

    $resultado = [];

    foreach ($dfLz as $row) {
        if ($row['numalim_lz'] !== $numalim) continue;

        // Para cada vecino de este dispositivo LZ
        $vecinosData = [];
        foreach ($row['vecinos'] as $vecNm) {
            // Perspectiva del vecino como receptor:
            // buscar fila donde numalim_lz == vecNm y numalim consultado está en vecinos
            $viable    = true;   $nTroncal = 0;  $eqTroncal = [];
            foreach ($dfLz as $r2) {
                if ($r2['numalim_lz'] !== $vecNm) continue;
                if (!in_array($numalim, $r2['vecinos'])) continue;
                // Misma llave NUMPOS_LZ
                if ($r2['numpos_lz'] !== $row['numpos_lz']) continue;
                $viable    = $r2['viable'];
                $nTroncal  = $r2['n_troncal'];
                $eqTroncal = $r2['equipos_troncal'];
                break;
            }

            // Resolver nom_alim del vecino
            $nomAlim = '';
            foreach ($dfAlim as $ar) {
                if ((int)($ar['numalim'] ?? 0) === $vecNm) {
                    $nomAlim = $ar['nom_alim'] ?? '';
                    break;
                }
            }

            $vecinosData[] = [
                'numalim'         => $vecNm,
                'nom_alim'        => $nomAlim,
                'viable'          => $viable,
                'n_troncal'       => $nTroncal,
                'equipos_troncal' => $eqTroncal,
            ];
        }

        $resultado[] = [
            'numpos_lz'            => $row['numpos_lz'],
            'tipo'                 => $row['tipo'],
            'excepcion'            => $row['excepcion'],
            'equipos_troncal_orig' => $row['equipos_troncal'],  // perspectiva origen
            'vecinos'              => $vecinosData,
        ];
    }

    jsonResponse($resultado);
}
```

> **Nota de rendimiento:** El lookup triple anidado es O(n²) sobre el caché LZ. En producción con ~33k filas procesadas a ~200 dispositivos únicos por alimentador, esto puede ser lento. Se recomienda pre-indexar el caché en un array `[$numpos_lz][$numalim_lz][$numalim_receptor]` al cargar.

### Clasificación de tipos de dispositivo LZ

```php
// Determinado al cargar el caché — no viene directo de SQL
// bilateral: exactamente 2 alimentadores vecinos
// subterraneo_3ramas: 3+ alimentadores vecinos (dispositivo subterráneo con múltiples ramas)
// excepcion: listado en _LZ_EXCEPCIONES (7 dispositivos con datos BD incorrectos)

$tipo = match(true) {
    count($vecinos) === 1 => 'unilateral',
    count($vecinos) === 2 => 'bilateral',
    default               => 'subterraneo_3ramas',
};
```

### Uso en el frontend

El frontend llama a este endpoint al seleccionar un alimentador origen (`renderPanelLZ`). Cada vez que el usuario cambia el equipo que abre la isla, se re-evalúa:

```javascript
// Si tipoIsla === "equipo":
const enIsla = dev.equipos_troncal_orig?.includes(equipo_abre);
// enIsla === true  → score 0, badge "En isla ✓"
// enIsla === false → score 2, badge "Verificar"
// enIsla === undefined → score 1 (no hay datos)
```

---

## 5. Lógica de Negocio (simulacion.py → Simulacion.php)

### 5.1 Cálculo del traspaso — flujo completo

```
kVA_isla   = suma de potencia kVA de los TDs en la isla
kVA_feeder = suma de potencia kVA de todos los TDs del alimentador origen
p          = kVA_isla / kVA_feeder          (fracción, 0..1)

delta_I[mes] = I_origen[mes] * p            (delta proporcional mes a mes)
delta_max    = max(delta_I[mes])            (peor caso = escenario conservador)
mes_peor     = mes donde delta_I es máximo

Escenario conservador (Δ fijo):
  I_orig_post[mes]  = max(0, I_orig[mes]  - delta_max)
  I_dest_post[mes]  = I_dest[mes] + delta_max

Escenario mes a mes (Δ proporcional):
  I_orig_post[mes]  = max(0, I_orig[mes]  - I_orig[mes]*p)
  I_dest_post[mes]  = I_dest[mes] + I_orig[mes]*p
```

**Clasificación de estado:**
```php
function clasificarMes(float $iPost, float $cn, float $umbral = 0.90): string {
    if ($cn <= 0) return 'sin_datos';
    $ratio = $iPost / $cn;
    if ($ratio >= 1.0)      return 'critico';
    if ($ratio >= $umbral)  return 'prealerta';
    return 'viable';
}
```

### 5.2 Análisis de trafo (`analizar_trafo`)

```php
/**
 * Evalúa el impacto de un delta fijo sobre el trafo.
 * 
 * @param array  $trafoRow  Fila del trafo con columnas YYYY-MM
 * @param float  $deltaA    Delta a aplicar [A]
 * @param string $modo      'alivio' (quita carga) | 'carga' (agrega)
 * @param array  $mesesFiltro  Lista de meses YYYY-MM a incluir
 * @return array {cn_trafo, sin_datos, tabla, resumen, mes_max_uso, pct_max_uso}
 */
function analizarTrafo(array $trafoRow, float $deltaA, string $modo = 'alivio',
                       array $mesesFiltro = []): array {
    $cn = isset($trafoRow['cn']) ? (float)$trafoRow['cn'] : NAN;
    $meses = array_filter(array_keys($trafoRow), fn($c) => preg_match('/^\d{4}-\d{2}$/', $c));
    if ($mesesFiltro) $meses = array_intersect($meses, $mesesFiltro);
    sort($meses);
    if (!$meses) return ['cn_trafo'=>null,'sin_datos'=>true,'tabla'=>[],'resumen'=>[],'mes_max_uso'=>null,'pct_max_uso'=>null];

    $registros = [];
    $conteo    = [];
    foreach ($meses as $mes) {
        $ant = isset($trafoRow[$mes]) && $trafoRow[$mes] !== null ? (float)$trafoRow[$mes] : null;
        if ($ant === null) { $des = null; $est = 'sin_datos'; $uA = null; $uD = null; }
        else {
            $des = $modo === 'alivio' ? max(0.0, $ant - $deltaA) : $ant + $deltaA;
            if (is_nan($cn) || $cn <= 0) { $est = 'sin_datos'; $uA = null; $uD = null; }
            else {
                $uA  = round($ant / $cn * 100, 1);
                $uD  = round($des / $cn * 100, 1);
                $est = clasificarMes($des, $cn);
            }
        }
        $conteo[$est] = ($conteo[$est] ?? 0) + 1;
        $registros[] = ['mes'=>$mes,'I_antes'=>$ant !== null ? round($ant,1) : null,
            'I_despues'=>$des !== null ? round($des,1) : null,'delta'=>round($deltaA,2),
            'uso_antes_pct'=>$uA,'uso_despues_pct'=>$uD,'estado'=>$est];
    }
    $best = array_reduce(array_filter($registros, fn($r) => $r['uso_despues_pct'] !== null),
        fn($b,$r) => ($b === null || $r['uso_despues_pct'] > $b['uso_despues_pct']) ? $r : $b, null);
    return ['cn_trafo'=>!is_nan($cn)?$cn:null,'sin_datos'=>false,'tabla'=>$registros,
        'resumen'=>$conteo,'mes_max_uso'=>$best['mes']??null,'pct_max_uso'=>$best['uso_despues_pct']??null];
}
```

### 5.3 Calcular fracción de kVA (`calcular_fraccion_reco`)

```php
function calcularFraccionReco(array $dfAb, string $nomAlim, string $numposEquip): array {
    $nomUp  = strtoupper(trim($nomAlim));
    $npNorm = trim($numposEquip);
    $tdPots = [];  // [numpos_td => potencia]
    $tdsDown = [];

    foreach ($dfAb as $row) {
        if (strtoupper($row['nom_alim']) !== $nomUp) continue;
        $td  = trim($row['numpos_td']);
        $pot = is_numeric($row['potencia']) ? (float)$row['potencia'] : null;
        if (!isset($tdPots[$td]) && $pot !== null) $tdPots[$td] = $pot;
        if (trim($row['numpos_equip']) === $npNorm) $tdsDown[$td] = true;
    }
    $kvaTotal = array_sum($tdPots);
    $kvaDown  = 0.0; $sinKva = 0;
    foreach ($tdsDown as $td => $_) {
        if (isset($tdPots[$td])) $kvaDown += $tdPots[$td];
        else $sinKva++;
    }
    return [
        'kva_down'    => round($kvaDown, 0),
        'kva_total'   => round($kvaTotal, 0),
        'fraccion'    => $kvaTotal > 0 ? round($kvaDown / $kvaTotal, 4) : 0.0,
        'tds_down'    => count($tdsDown),
        'tds_con_kva' => count($tdsDown) - $sinKva,
        'tds_sin_kva' => $sinKva,
    ];
}
```

---

## 6. VCC (vcc.py → Vcc.php)

### 6.1 Conversión kVA → A

```php
function deltaICliente(float $kva, float $tensionKv): float {
    // FP = 1
    return round($kva / (sqrt(3) * $tensionKv), 2);
}
```

### 6.2 `calcular_vcc` con traspaso simultáneo

```php
function calcularVcc(array $dfAlim, int $numalim, ?array $trafoRow,
                     float $deltaI, array $mesesFiltro,
                     float $deltaTraspasoA = 0.0, float $deltaTraspasoPct = 0.0): array {
    $alimRow = $dfAlim[$numalim] ?? null;
    if (!$alimRow) throw new RuntimeException("NUMALIM $numalim no encontrado");

    // Aplicar alivio traspaso a la serie del alim
    if ($deltaTraspasoPct > 0 || $deltaTraspasoA > 0) {
        $factor = $deltaTraspasoPct > 0 ? (1.0 - $deltaTraspasoPct / 100.0) : null;
        foreach ($alimRow as $col => $v) {
            if (preg_match('/^\d{4}-\d{2}$/', $col) && $v !== null) {
                $alimRow[$col] = $factor !== null
                    ? max(0.0, (float)$v * $factor)
                    : max(0.0, (float)$v - $deltaTraspasoA);
            }
        }
    }

    $alimResult = analizarTrafo($alimRow, $deltaI, 'carga', $mesesFiltro);
    $trafoResult = null;
    if ($trafoRow) {
        $trafoResult = analizarTrafo($trafoRow, $deltaI, 'carga', $mesesFiltro);
        $trafoResult['barra']       = trim($trafoRow['barra'] ?? '');
        $trafoResult['subestacion'] = trim($trafoRow['subestacion'] ?? '');
    }
    return [
        'tabla_alim'   => $alimResult['tabla'],
        'cn_alim'      => $alimResult['cn_trafo'],
        'resumen_alim' => $alimResult['resumen'],
        'mes_max_alim' => $alimResult['mes_max_uso'],
        'pct_max_alim' => $alimResult['pct_max_uso'],
        'tabla_trafo'  => $trafoResult,
    ];
}
```

### 6.3 `evaluar_equipos` (Enfoques A y B)

```php
function evaluarEquipos(array $equipos, float $deltaI,
                        ?float $cnAlim, array $serieAlim, array $mesesFiltro): array {
    $ordenEstado = ['critico'=>2,'prealerta'=>1,'viable'=>0,'sin_cn'=>-1];

    function clasif(float $pct): string {
        if ($pct >= 100) return 'critico';
        if ($pct >= 90)  return 'prealerta';
        return 'viable';
    }

    $result = [];
    foreach ($equipos as $eq) {
        $cn      = isset($eq['cn']) && $eq['cn'] > 0 ? (float)$eq['cn'] : null;
        $fraccion = isset($eq['fraccion']) ? (float)$eq['fraccion'] : null;
        $ent     = array_merge($eq, ['delta_I' => $deltaI]);

        if (!$cn) {
            $ent += ['delta_pct'=>null,'estado'=>'sin_cn','enfoque_a'=>null,'enfoque_b'=>null];
            $result[] = $ent;
            continue;
        }

        $enf_a = null;
        if ($fraccion !== null && $cnAlim && $cnAlim > 0) {
            $IbaseA  = $cnAlim * $fraccion;
            $ItotalA = $IbaseA + $deltaI;
            $pctA    = round($ItotalA / $cn * 100, 1);
            $enf_a   = ['I_base'=>round($IbaseA,2),'I_total'=>round($ItotalA,2),
                        'pct'=>$pctA,'estado'=>clasif($pctA)];
        }

        $enf_b = null;
        if ($fraccion !== null && $serieAlim) {
            $meses = $mesesFiltro ?: array_keys($serieAlim);
            $serieReco = [];
            foreach ($meses as $mes) {
                $v = $serieAlim[$mes] ?? null;
                if ($v !== null && is_finite((float)$v))
                    $serieReco[$mes] = round((float)$v * $fraccion, 2);
            }
            if ($serieReco) {
                $mesMaxB  = array_keys($serieReco, max($serieReco))[0];
                $IbaseB   = $serieReco[$mesMaxB];
                $ItotalB  = round($IbaseB + $deltaI, 2);
                $pctB     = round($ItotalB / $cn * 100, 1);
                $serieDet = [];
                foreach (array_keys($serieReco) as $m) {
                    $iR = $serieReco[$m];
                    $iT = round($iR + $deltaI, 2);
                    $p  = round($iT / $cn * 100, 1);
                    $serieDet[] = ['mes'=>$m,'I_reco'=>$iR,'I_total'=>$iT,'pct'=>$p,'estado'=>clasif($p)];
                }
                $enf_b = ['I_base_max'=>$IbaseB,'mes_max'=>$mesMaxB,'I_total'=>$ItotalB,
                          'pct'=>$pctB,'estado'=>clasif($pctB),'serie'=>$serieDet];
            }
        }
        $ent['enfoque_a'] = $enf_a;
        $ent['enfoque_b'] = $enf_b;

        if ($fraccion !== null) {
            $estados = array_filter([$enf_a['estado'] ?? null, $enf_b['estado'] ?? null]);
            usort($estados, fn($a,$b) => ($ordenEstado[$b]??-1) - ($ordenEstado[$a]??-1));
            $ent['estado']    = $estados[0] ?? 'sin_cn';
            $ent['delta_pct'] = ($enf_a ?? $enf_b)['pct'] ?? null;
        } else {
            $pLeg = round($deltaI / $cn * 100, 1);
            $ent['delta_pct'] = $pLeg;
            $ent['estado']    = clasif($pLeg);
        }
        $result[] = $ent;
    }
    return $result;
}
```

---

## 7. Persistencia JSON

### 7.1 Feeders en comisionamiento (`memoria.py` → `Memoria.php`)

**Directorio:** `feeders_nuevos/<SLUG>.json`

**Estructura de cada archivo:**
```json
{
  "nombre": "NUEVO_ALIM",
  "cn": 400.0,
  "numalim_trafo": 12345,
  "nota": "texto libre",
  "cambios_topologicos": [
    {"idx": 1, "fecha": "2026-06-03", "descripcion": "..."}
  ],
  "transferencias": [
    {
      "idx": 1,
      "origen": "GOLF",
      "descripcion": "Traspaso RTB61508",
      "delta_A": 15.3,
      "kva_isla": 5400.0,
      "kva_origen": 18500.0,
      "p_pct": 29.2,
      "n_td": 12,
      "clientes": 450,
      "fecha": "2026-06-03",
      "tabla": [...],
      "tabla_mam": [...],
      "trafo_orig": {...},
      "trafo_dest": {...},
      "meses_sel": ["2025-04", ...],
      "equipo_abre": "DBC73621",
      "equipo_cierra": "",
      "escenario": "normal",
      "cambio_topologico": "",
      "equipos_traspasados": []
    }
  ]
}
```

**Función `_slug` para nombre de archivo:**
```php
function slugFeeder(string $nombre): string {
    $s = strtoupper(trim($nombre));
    $s = preg_replace('/[^\w]+/', '_', $s);
    return trim($s, '_');
}
```

### 7.2 Evaluaciones VCC (`vcc.py` → `Vcc.php`)

**Directorio:** `vcc_evaluaciones/<SLUG>.json`

**Estructura:**
```json
{
  "nombre": "GOLF",
  "numalim": 12345,
  "cn": 400.0,
  "evaluaciones": [
    {
      "idx": 1,
      "fecha": "2026-06-03",
      "id_cliente": "A1234567",
      "nombre_cliente": "Empresa X",
      "direccion": "...",
      "descripcion": "...",
      "numpos": "123456",
      "tension_kv": 12.0,
      "kva_empalme": 400.0,
      "kva_instalado": null,
      "delta_I": 19.25,
      "delta_I_sens": null,
      "pct_max_alim": 62.5,
      "mes_max_alim": "2025-08",
      "tabla_alim": [...],
      "tabla_trafo": {...},
      "equipos_eval": [...],
      "delta_traspaso_a": 0.0,
      "delta_traspaso_pct": 7.1,
      "delta_traspaso_modo": "topo",
      "alivio_A_peor": 12.9
    }
  ]
}
```

### 7.3 Ajustes de demanda (`ajustes.py` → `Ajustes.php`)

**Archivo:** `data/ajustes_demanda.json`

**Estructura:**
```json
{
  "alim":  {"12345": {"2024-01": 320.5, "2024-08": 280.0}},
  "trafo": {"12345": {"2024-01": 180.0}}
}
```

**Métodos PHP:**
```php
class Ajustes {
    private string $path;
    
    public function get(string $tipo, int $numalim): array {
        $data = $this->cargar();
        return $data[$tipo][(string)$numalim] ?? [];
    }

    public function set(string $tipo, int $numalim, array $cambios): void {
        $data = $this->cargar();
        $key  = (string)$numalim;
        $current = $data[$tipo][$key] ?? [];
        foreach ($cambios as $mes => $val) {
            if ($val === null) unset($current[$mes]);
            else $current[$mes] = (float)$val;
        }
        if ($current) $data[$tipo][$key] = $current;
        else unset($data[$tipo][$key]);
        $this->guardar($data);
    }

    public function delete(string $tipo, int $numalim, string $mes): void {
        $data = $this->cargar();
        $key  = (string)$numalim;
        unset($data[$tipo][$key][$mes]);
        if (empty($data[$tipo][$key])) unset($data[$tipo][$key]);
        $this->guardar($data);
    }

    public function aplicar(array &$serie, string $tipo, int $numalim): void {
        foreach ($this->get($tipo, $numalim) as $mes => $val) {
            if (array_key_exists($mes, $serie)) $serie[$mes] = (float)$val;
        }
    }
}
```

---

## 8. API Endpoints (app.py → index.php router)

Todos los endpoints retornan JSON con `Content-Type: application/json; charset=utf-8`. El frontend espera exactamente estas rutas.

### GET /
Sirve el template `templates/index.html` (HTML estático). En PHP: `readfile('templates/index.html')`.

---

### GET /api/feeders
**Respuesta:** Array de objetos `{numalim, nom_alim, nombre_display, cn, ce}`

Enumera todos los alimentadores con sus datos básicos, ordenados por nombre. Fuente: `df_alim`.

---

### GET /api/feeder/{nom_alim}/equipos
**Parámetros:** `nom_alim` (path)
**Respuesta:** Array de `{nombre_equip, numpos_equip}` — equipos del alimentador (excluye `cabecera`)

---

### GET /api/feeder/{nom_alim}/tds
**Parámetros:** `nom_alim` (path)
**Respuesta:** Array de `{numpos_td, nombre, potencia, clientes, nom_alim}` — TDs del alimentador

---

### GET /api/meses
**Respuesta:** `{meses: ["2021-10", ..., "2026-04"]}` — todos los meses disponibles en `df_alim`, ordenados.

---

### GET /api/subestaciones
**Respuesta:** Array de objetos `{numalim, barra, barra_alim, cn, ce}` — un objeto por BARRA física única en `df_trafo`. Deduplicado por `BARRA`.

---

### GET /api/debug/status
**Respuesta:** `{ok, n_feeders, n_tds, n_alim, n_trafo, meses_range}` — diagnóstico de datos cargados.

---

### GET /api/destinos/existentes
**Respuesta:** Array de `{numalim, nom_rapida, barra_alim, cn}` — todos los alimentadores disponibles como destino de traspaso.

---

### GET /api/destinos/nuevos
**Respuesta:** Array de strings — nombres de feeders en comisionamiento (de `feeders_nuevos/`).

---

### GET /api/vecinos_lz/{numalim}
**Parámetros:** `numalim` (path, int)
**Respuesta:** Array de dispositivos LZ del alimentador, con vecinos y datos de troncal:
```json
[
  {
    "numpos_lz": "DBC108457",
    "tipo": "bilateral",
    "excepcion": false,
    "equipos_troncal_orig": ["CLB104708", "DBC109312"],
    "vecinos": [
      {
        "numalim": 5721,
        "nom_alim": "COMENDADOR",
        "viable": true,
        "n_troncal": 12,
        "equipos_troncal": ["CLB104708", "DBC109312", "REC118524"]
      }
    ]
  }
]
```

Campos por vecino:
- `viable`: bool — si el LZ tiene troncal físico en el receptor (n_troncal > 0)
- `n_troncal`: int — cantidad de equipos no-cabecera en el troncal receptor
- `equipos_troncal`: list[str] — nombres de esos equipos (perspectiva del vecino como receptor)
- `equipos_troncal_orig`: list[str] — equipos en el troncal del alimentador consultado como origen (perspectiva opuesta; usado para island-LZ position check en el frontend)

---

### POST /api/isla/preview
**Body:**
```json
{
  "numalim_orig": 12345,
  "nom_alim_orig": "GOLF",
  "tipo_isla": "equipo",
  "equipo_nombre": "DBC73621",
  "tds_excluidos": []
}
```
**Respuesta:** `{ok, kva_isla, kva_feeder, p, p_pct, n_td, clientes, mes_peor}` + `equipos_traspasados: [{nombre, tipo}]`

Calcula la isla de TDs aguas abajo del equipo y la fracción de carga a traspasar. También identifica equipos con posible inversión de flujo (DBC, REC, RTS).

---

### POST /api/simular
**Body:**
```json
{
  "numalim_orig": 12345,
  "nom_alim_orig": "GOLF",
  "tipo_isla": "equipo",
  "equipo_nombre": "DBC73621",
  "tds_excluidos": [],
  "tipo_dest": "excel",
  "numalim_dest": 67890,
  "meses_sel": ["2025-04", "2025-05", ...],
  "descripcion": ""
}
```
`tipo_dest`: `"excel"` (existente) | `"nuevo"` | `"nuevo_crear"`

**Respuesta:**
```json
{
  "ok": true,
  "nombre_orig": "Golf",
  "nombre_dest": "Paracelso",
  "cn_orig": 450.0,
  "cn_dest": 400.0,
  "isla": {"kva_isla":5400,"kva_feeder":18500,"p":0.2919,"p_pct":29.19,"n_td":12,"clientes":450,"mes_peor":"2025-08"},
  "delta": {"delta_max":54.3,"mes_peor":"2025-08","p_pct":29.19},
  "resumen": {"conteo":{"viable":12},"meses_criticos":[],"mes_max_uso":"2025-08","pct_max_uso":62.5},
  "tabla": [{"mes":"2025-04","I_orig_antes":186,"I_orig_despues":132,...,"estado_dest":"viable"}, ...],
  "tabla_mam": [...],
  "trafo_orig": {...},
  "trafo_dest": {...},
  "trafo_orig_mam": {...},
  "trafo_dest_mam": {...},
  "meses_sel": [...],
  "feeder_nuevo": null,
  "numalim_orig": 12345,
  "numalim_dest": 67890,
  "numalim_trafo_orig": 11111,
  "numalim_trafo_dest": 22222,
  "ajustes_activos": {"alim_orig":{},"alim_dest":{},"trafo_orig":{},"trafo_dest":{}},
  "serie_raw_orig": {"2025-04": 186.1, ...},
  "serie_raw_dest": {"2025-04": 130.2, ...},
  "serie_raw_trafo_orig": {"2025-04": 310.5, ...},
  "serie_raw_trafo_dest": {"2025-04": 260.0, ...},
  "equipos_traspasados": [],
  "lz_info": {
    "dispositivos": [
      {
        "numpos_lz": "DBC108457",
        "tipo": "bilateral",
        "excepcion": false,
        "seleccionado": true,
        "viable": true,
        "n_troncal": 12,
        "equipos_troncal": ["CLB104708", "DBC109312", "REC118524"],
        "vecinos": [...]
      }
    ]
  }
}
```

---

### POST /api/guardar_transferencia
**Body:** Datos completos de la simulación + `feeder_nombre`
**Respuesta:** `{ok: true}`
Persiste la transferencia en `feeders_nuevos/<FEEDER>.json`.

---

### GET /api/ajustes
**Respuesta:** Array de `{tipo, numalim, nombre, ajustes: [{mes, valor_sql, valor_ajustado}]}`
Lista todos los ajustes activos enriquecidos con nombre y valor SQL.

### GET /api/ajustes/{tipo}/{numalim}
**Respuesta:** `{"2024-01": 320.5, ...}`

### POST /api/ajustes/{tipo}/{numalim}
**Body:** `{"2024-01": 320.5, "2024-08": 280.0}`
**Respuesta:** `{ok: true, ajustes: {...}}`

### DELETE /api/ajustes/{tipo}/{numalim}/{mes}
**Respuesta:** `{ok: true, ajustes: {...}}`

---

### GET /api/feeders_nuevos/{nombre}
**Respuesta:** Datos completos del feeder + delta acumulado + series mensuales del trafo + resumen de transferencias.

### GET /api/feeders_nuevos/{nombre}/informe
**Respuesta:** HTML completo del informe del feeder (para modal).

### GET /api/feeders_nuevos/{nombre}/transferencias/{idx}
**Parámetros:** `nombre` (path), `idx` (path, int)
**Respuesta:** `{ok: true, transferencia: {...}}` — objeto completo de la transferencia (para modal de detalle / descarga individual)

> **Nota:** devuelve un wrapper `{ok, transferencia}`, no el objeto directo. El frontend accede como `resp.transferencia`.

### DELETE /api/feeders_nuevos/{nombre}/transferencias/{idx}
**Respuesta:** `{ok: true}`

### DELETE /api/feeders_nuevos/{nombre}
**Respuesta:** `{ok: true}`

### POST /api/feeders_nuevos/{nombre}/cambios_topologicos
**Body:** `{"descripcion": "..."}`
**Respuesta:** `{ok: true, idx: 1}`

### DELETE /api/feeders_nuevos/{nombre}/cambios_topologicos/{idx}
**Respuesta:** `{ok: true}`

---

### POST /api/descargar_html
**Body:** Datos de la simulación serializada + descripción + campos de traspaso/ajustes
**Respuesta:** Archivo HTML adjunto (Content-Disposition: attachment)

---

### GET /api/vcc/equipos/{nom_alim}?modo=equipos|tp
**Respuesta:**
- `modo=equipos`: Array de `{numpos, nombre, tipo, fraccion?, kva_down?, kva_total?, tds_down?}`
- `modo=tp`: Array de `{numpos, nombre, kva, tipo:"tp"}`

### POST /api/vcc/punto
**Body:** `{nom_alim, numpos}`
**Respuesta:** `{tipo, numpos_ref, nombre_ref, n_tds_aguas_abajo, upstream: [{nombre, tipo, cn_opcional, fraccion?, ...}]}`

### POST /api/vcc/evaluar
**Body:**
```json
{
  "numalim": 12345,
  "tension_kv": 12.0,
  "kva_empalme": 400.0,
  "kva_instalado": null,
  "equipos_cn": [{"nombre":"DBC73621","cn":300,"fraccion":0.18,...}],
  "delta_traspaso_a": 0.0,
  "delta_traspaso_pct": 7.1,
  "delta_traspaso_modo": "topo",
  "numalim_orig": 67890
}
```

`numalim_orig` es opcional. Si se envía, la respuesta incluye `lz_info` con los dispositivos LZ entre el origen y el receptor (`numalim`). Útil cuando la VCC coexiste con un traspaso activo.

**Respuesta:**
```json
{
  "ok": true,
  "nombre_alim": "Golf",
  "cn_alim": 400.0,
  "delta_I": 19.25,
  "delta_I_sens": null,
  "tabla_alim": [...],
  "tabla_trafo": {...},
  "equipos_eval": [...],
  "resumen_alim": {...},
  "mes_max_alim": "2025-08",
  "pct_max_alim": 62.5,
  "delta_traspaso_a": 0.0,
  "delta_traspaso_pct": 7.1,
  "delta_traspaso_modo": "topo",
  "alivio_A_peor": 12.9,
  "lz_info": {
    "tiene_lz": true,
    "dispositivos": [{"numpos_lz":"DBC108457","tipo":"bilateral","viable":true,...}],
    "numpos_lz_sel": null
  }
}
```

### POST /api/vcc/guardar
**Body:** Evaluación completa + campos cliente
**Respuesta:** `{ok: true, idx: 1}`

### GET /api/vcc/historial_global
**Respuesta:** Array de evaluaciones de todos los alimentadores, ordenadas por fecha desc.

### GET /api/vcc/{nombre}
**Respuesta:** Historial de evaluaciones de un alimentador específico.

### DELETE /api/vcc/{nombre}/{idx}
**Respuesta:** `{ok: true}`

### POST /api/vcc/descargar_html
**Body:** Datos de la evaluación VCC
**Respuesta:** Archivo HTML adjunto

---

## 9. Algoritmos Clave en PHP

### 9.1 Detectar TDs aguas abajo de un equipo

```php
function tdsDeEquipo(array $dfAb, string $nombreEquip): array {
    $nombreNorm = strtoupper(trim($nombreEquip));
    $tds = [];
    foreach ($dfAb as $row) {
        if (strtoupper($row['nombre_equip'] ?? '') === $nombreNorm) {
            $td = trim($row['numpos_td']);
            if (!isset($tds[$td])) $tds[$td] = $row;
        }
    }
    return array_values($tds);
}
```

### 9.2 Equipos con posible inversión de flujo

```php
const TIPOS_CON_INVERSION = ['DBC', 'REC', 'RTS'];

function equiposEnIsla(array $dfAb, array $tds, string $equipoRaiz, string $nomAlim): array {
    $numposSet = array_column($tds, 'numpos_td');
    $numposSet = array_map('trim', $numposSet);
    $raizNorm  = strtoupper(trim($equipoRaiz));
    $nomAlimUp = strtoupper(trim($nomAlim));
    $vistos    = [];
    $resultado = [];

    foreach ($dfAb as $row) {
        if (strtoupper($row['nom_alim']) !== $nomAlimUp) continue;
        if (!in_array(trim($row['numpos_td']), $numposSet)) continue;
        if (strtolower($row['nombre_equip'] ?? '') === 'cabecera') continue;
        $nombre = strtoupper($row['nombre_equip'] ?? '');
        if ($nombre === $raizNorm || isset($vistos[$nombre])) continue;
        $vistos[$nombre] = true;
        $tipo = null;
        foreach (TIPOS_CON_INVERSION as $t) {
            if (str_starts_with($nombre, $t)) { $tipo = $t; break; }
        }
        if ($tipo) $resultado[] = ['nombre' => $nombre, 'tipo' => $tipo];
    }
    usort($resultado, fn($a,$b) => strcmp($a['nombre'], $b['nombre']));
    return $resultado;
}
```

### 9.3 Serie acumulada de feeder nuevo

```php
function serieAcumulada(string $nombre, array $meses): array {
    $data  = cargarFeeder($nombre);
    $total = array_sum(array_column($data['transferencias'], 'delta_A'));
    $serie = [];
    foreach ($meses as $mes) $serie[$mes] = round($total, 3);
    return $serie;
}
```

### 9.4 Reconstrucción de acumulado por trafo

```php
/**
 * Acumula el delta ya aplicado por traspasos previos sobre el trafo destino.
 * Cada traspaso N muestra el trafo ya cargado por traspasos 1..N-1.
 */
function acumularTrafo(array $trafo, float $deltaAcumMes): array {
    if (!$trafo || $trafo['sin_datos'] ?? true) return $trafo;
    $cn = $trafo['cn_trafo'] ?? null;
    $tabla = array_map(function($r) use ($deltaAcumMes, $cn) {
        $IA = $r['I_antes'] !== null ? $r['I_antes'] + $deltaAcumMes : null;
        $ID = $r['I_despues'] !== null ? $r['I_despues'] + $deltaAcumMes : null;
        $uA = ($IA !== null && $cn && $cn > 0) ? round($IA / $cn * 100, 1) : null;
        $uD = ($ID !== null && $cn && $cn > 0) ? round($ID / $cn * 100, 1) : null;
        return array_merge($r, [
            'I_antes'         => $IA !== null ? round($IA, 1) : null,
            'I_despues'       => $ID !== null ? round($ID, 1) : null,
            'uso_antes_pct'   => $uA,
            'uso_despues_pct' => $uD,
            'estado'          => $uD !== null ? clasificarMes($ID, $cn) : 'sin_datos',
        ]);
    }, $trafo['tabla'] ?? []);
    return array_merge($trafo, ['tabla' => $tabla]);
}
```

---

## 10. Generación de Reportes HTML (reportes.py → Reportes.php)

Los reportes son archivos HTML autocontenidos con CSS embebido y tablas estáticas (sin Chart.js). Los caracteres especiales deben escaparse con `htmlspecialchars()`.

### 10.1 Reporte de traspaso individual
Genera `resultados/traspaso_<slug>_<fecha>.html` con:
- Cards resumen (Δ, %, TDs, clientes, kVA, mes peor)
- Tarjeta peor caso (tabla 2 columnas: origen / destino)
- Gráfico Chart.js autocontenido con datos inline en `<script>`
- Tabla mes a mes transpuesta
- Secciones de trafo (origen y destino)
- Sección de ajustes de demanda (si aplica)
- Sección `<details class="equip-det troncal">`: equipos troncales en receptor (tabla Equipo/Tipo/Observación, REC en rojo)
- Sección `<details class="equip-det isla">`: inversión de flujo + cambio topológico (si aplica)

### 10.2 Reporte VCC individual
Genera `resultados/vcc_<slug>_<fecha>.html` con:
- Header: alimentador, tensión, punto de conexión, cliente
- Bloque traspaso simultáneo (si aplica, `.traspaso-vcc`)
- Por cada escenario (empalme / instalado):
  - Tabla alimentador en `<details open>`
  - Tabla trafo en `<details open>` (si existe)
  - Tabla equipos upstream en `<details open>`
- Tablas con columnas: I antes / I traspasada / ΔI cliente / I después / FU% / Estado

### 10.3 Informe de feeder en comisionamiento
Generado inline como HTML y devuelto en la respuesta API. Incluye:
- Resumen del feeder (CN, delta acumulado, TDs, clientes)
- Por cada transferencia: origen, Δ, %, tabla detalle, trafos
- Cambios topológicos (bloques amarillos)

---

## 11. Equivalencias Python → PHP

| Python / pandas | PHP 8 |
|---|---|
| `pd.DataFrame` | `array[][]` (array de arrays asociativos) |
| `df[mask]` | `array_filter()` |
| `df.groupby().agg()` | Bucle `foreach` + acumuladores |
| `df.pivot_table()` | Bucle doble construyendo array 2D |
| `pd.to_numeric(errors='coerce')` | `is_numeric($v) ? (float)$v : null` |
| `np.nan` | `null` (JSON) / `NAN` (PHP float) |
| `np.isfinite(v)` | `is_finite($v)` |
| `series.max()` / `idxmax()` | `max($arr)` / `array_search(max($arr), $arr)` |
| `series.reindex(meses)` | `array_intersect_key` o bucle con `$arr[$mes] ?? null` |
| `series.clip(lower=0)` | `max(0.0, $v)` |
| `pd.Series(total, index=meses)` | `array_fill_keys($meses, $total)` |
| `pickle` (caché) | `json_encode/decode` en filesystem |
| `Flask.jsonify()` | `json_encode($data, JSON_UNESCAPED_UNICODE)` |
| `send_file()` | `header('Content-Disposition: attachment')` + `readfile()` |
| `render_template()` | `ob_start()` + `include` o `readfile()` |
| `re.match(r'^\d{4}-\d{2}$', c)` | `preg_match('/^\d{4}-\d{2}$/', $c)` |
| `round(v, 1)` | `round($v, 1)` (mismo comportamiento) |

---

## 12. Router PHP sugerido

```php
<?php
// index.php

header('Content-Type: application/json; charset=utf-8');

// Cargar datos en memoria (equivalente al _cache de Flask)
// Usar APCu o simplemente cargar al inicio del request

$method = $_SERVER['REQUEST_METHOD'];
$path   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path   = rtrim($path, '/') ?: '/';

match(true) {
    $path === '/' && $method === 'GET'
        => servirHtml('templates/index.html'),

    $path === '/api/feeders' && $method === 'GET'
        => apiGetFeeders(),

    $path === '/api/meses' && $method === 'GET'
        => apiGetMeses(),

    preg_match('#^/api/feeder/([^/]+)/equipos$#', $path, $m) && $method === 'GET'
        => apiFeederEquipos(urldecode($m[1])),

    preg_match('#^/api/feeder/([^/]+)/tds$#', $path, $m) && $method === 'GET'
        => apiFeederTds(urldecode($m[1])),

    $path === '/api/isla/preview' && $method === 'POST'
        => apiIslaPreview(),

    $path === '/api/simular' && $method === 'POST'
        => apiSimular(),

    // ... resto de rutas
    default => http_response_code(404) && die('{"error":"Not found"}'),
};

function servirHtml(string $file): void {
    header('Content-Type: text/html; charset=utf-8');
    readfile($file);
    exit;
}

function jsonResponse(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getJsonBody(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}
```

---

## 13. Frontend JS — Funciones LZ (Límites de Zona)

Todas las funciones LZ viven en `templates/index.html`, en el bloque `<script>` principal.

### Estado global LZ

```js
state.lzVecinos            // [{numpos_lz, tipo, vecinos, equipos_troncal_orig}] del origen actual
state.selectedNumposLZ     // string|null — dispositivo LZ elegido por el usuario
state.pendingPreselectDest // int|null    — numalim a pre-seleccionar tras corrimiento
```

### Funciones

#### `actualizarDestinosLZ(numalim)`
Llama `GET /api/vecinos_lz/{numalim}`, guarda en `state.lzVecinos` y reconstruye las opciones de `ts.destino` filtrando solo a los vecinos LZ. Muestra en `#lz-dest-info` cuántos vecinos tiene el origen.

Se llama siempre al seleccionar un origen, incluso si el alimentador no tiene NOM_ALIM.

#### `mostrarEquipoCierra(numalimDest)`
Muestra en `#lz-equipo-cierra` los dispositivos LZ que conectan el origen actual con `numalimDest`. Usa un sistema de scoring para ordenar y colorear cada dispositivo:

| Condición | Score | Badge |
|---|---|---|
| `_enIsla === true` | 0 | `success` — "En isla ✓" |
| `_enIsla === null` | 1 | `secondary` — sin datos |
| `_enIsla === false` | 2 | `warning` — "Verificar" |
| `!viable` | 3 | `danger` deshabilitado |

`_enIsla` se determina comparando `equipo_abre` (del selector de equipos) contra `dev.equipos_troncal_orig`.

Al hacer clic en un dispositivo se actualiza `state.selectedNumposLZ` (enviado como `numpos_lz_sel` al simular).

#### `renderSecEquiposInvolucrados(data)`
Renderiza `#sec-equipos-involucrados` en los resultados. Dos `<details class="card step-card">`:
1. **Troncal receptor** — equipos de `lz_info.dispositivos[seleccionado].equipos_troncal` con tabla Equipo/Tipo/Observación
2. **Isla a vigilar** — equipos de `data.equipos_traspasados` + nota de `data._extras.cambio_topologico`

#### `renderPanelLZ(lz, nombreOrig, nombreDest)`
Renderiza `#panel-lz` en los resultados. Alert con color según viabilidad:
- `success`: LZ viable y seleccionado
- `warning`: LZ existe pero ninguno viable, o hay múltiples dispositivos
- `danger`: `tiene_lz === false` — no hay LZ físico entre los alimentadores

#### `_tipoEquipoTroncal(numpos)` / `_htmlEquiposTroncal(equipos)` / `_htmlTablaEquiposTroncal(equipos)`
Helpers internos para clasificar y renderizar listas de equipos troncales por prefijo (`REG`→peligro, `ABB/G33/...`→subterráneo 3 ramas, `REC`→reconectador, `DBC/CLB/PPF`→aéreo).

---

## 15. Notas de implementación importantes

1. **NaN/Infinity en JSON**: PHP `json_encode` falla con `NAN` o `INF`. Antes de codificar, reemplazar todos los floats no finitos por `null`. Equivalente al `_safe()` y `_json()` de Python.

2. **Caché entre requests**: Flask mantiene el `_cache` en memoria durante toda la vida del proceso. En PHP (FPM, cada request es un proceso nuevo), se necesita APCu o Redis para mantener los DataFrames en memoria. Alternativa simple: re-leer desde MySQL en cada request usando el TTL del archivo JSON de caché.

3. **Encoding MySQL**: usar `charset=utf8mb4` y `PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"`.

4. **Meses como strings**: los meses se manejan siempre como `"YYYY-MM"` (string). No usar objetos `DateTime` internamente para evitar problemas de timezone.

5. **Archivos JSON locales**: feeders_nuevos, vcc_evaluaciones y ajustes_demanda.json deben tener permisos de escritura para el usuario del servidor web.

6. **NUMALIM como integer**: siempre castear a `(int)` al comparar; la columna MySQL puede venir como string.

7. **_slug para nombres de archivo**: `preg_replace('/[^\w]+/', '_', strtoupper(trim($nombre)))`, luego `trim($result, '_')`.

8. **Generación HTML de reportes**: usar `heredoc` o `ob_start()` + `include`. No es necesario un motor de plantillas.

9. **Archivos adjuntos**: para la descarga de informes HTML, usar:
```php
header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fname . '"');
readfile($ruta);
```

10. **Frontend sin cambios**: el archivo `templates/index.html` (con todo el JS/CSS) no requiere modificaciones. Solo hay que asegurarse de que las rutas de la API coincidan exactamente.

11. **`equipo_nombre` vs `equipo_abre`**: el frontend JS siempre envía el equipo como `equipo_nombre` en el body de `/api/simular`. En `/api/guardar_transferencia` y `/api/descargar_html`, el JS lo mapea explícitamente a `equipo_abre` antes de enviar. El backend debe aceptar ambos: `$b['equipo_nombre'] ?? $b['equipo_abre'] ?? ''`.

12. **`_extras` en el frontend**: al recibir la respuesta de `/api/simular`, el JS ensambla `data._extras = {descripcion, cambio_topologico, equipo_cierra}` del estado del DOM en ese momento, antes de llamar a `mostrarResultados()`. `guardarTransferencia()` y `descargarHTML()` usan `sim._extras` (no el DOM en vivo) para preservar los valores al momento de la simulación.
