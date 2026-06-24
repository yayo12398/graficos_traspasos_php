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
├── src/ (solo PHP — sin equivalente Python)
│   ├── EquiposConfig.php       → Config persistente por NUMPOS (corriente, tipo, HDLB, notas)
│   └── AlimentadoresConfig.php → Config persistente por alimentador (conductores intermedios)
├── data/
│   ├── cache/                  → data/cache/ (archivos PKL → JSON serializado)
│   ├── ajustes_demanda.json    → data/ajustes_demanda.json (sin cambios)
│   ├── equipos_config.json     → Fichas de equipos (se crea al guardar primera ficha)
│   └── alimentadores_config.json → Conductores intermedios por alimentador (se crea al guardar)
├── feeders_nuevos/             → feeders_nuevos/ (sin cambios, JSON)
├── vcc_evaluaciones/           → vcc_evaluaciones/ (sin cambios, JSON)
└── resultados/                 → ELIMINADO (reportes se sirven como descarga directa vía tempnam)
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

### 6.2 `calcularVcc` con traspaso simultáneo

El alimentador recibe reducción porcentual o absoluta. El trafo AT/MT recibe una reducción
**basada en la demanda del feeder**, no del propio trafo (el trafo puede alimentar otros feeders
además del analizado, por lo que su reducción viene del feeder que transfiere, no del propio AT).

```php
function calcularVcc(array $dfAlim, int $numalim, ?array $trafoRow,
                     float $deltaI, array $mesesFiltro,
                     float $deltaTraspasoA = 0.0, float $deltaTraspasoPct = 0.0): array {

    $alimRow     = $dfAlim[$numalim];
    $alimRowOrig = $alimRow;  // guardar antes de modificar (PHP copia por valor)

    // Reducir serie del alim: esto sí aplica el % sobre los propios valores del feeder
    if ($deltaTraspasoPct > 0 || $deltaTraspasoA > 0) {
        $factor = $deltaTraspasoPct > 0 ? (1.0 - $deltaTraspasoPct / 100.0) : null;
        foreach ($alimRow as $col => $v) {
            if (preg_match('/^\d{4}-\d{2}$/', $col) && $v !== null)
                $alimRow[$col] = $factor !== null
                    ? max(0.0, (float)$v * $factor)
                    : max(0.0, (float)$v - $deltaTraspasoA);
        }
    }
    $alimResult = analizarTrafo($alimRow, $deltaI, 'carga', $mesesFiltro);

    $trafoResult = null;
    if ($trafoRow) {
        $trafoRowAdj = $trafoRow;
        // Reducción del trafo = la que aporta el feeder (no % del propio trafo).
        // trafoAdj[mes] = trafoOrig[mes] - feederOrig[mes] × p_pct
        if ($deltaTraspasoPct > 0 || $deltaTraspasoA > 0) {
            foreach ($trafoRowAdj as $col => $val) {
                if (!preg_match('/^\d{4}-\d{2}$/', $col) || !is_numeric($val)) continue;
                $feederOrig = $alimRowOrig[$col] ?? null;
                if (!is_numeric($feederOrig)) continue;
                $reduc = $deltaTraspasoPct > 0
                    ? (float)$feederOrig * ($deltaTraspasoPct / 100.0)
                    : $deltaTraspasoA;
                $trafoRowAdj[$col] = max(0.0, (float)$val - $reduc);
            }
        }
        $trafoResult = analizarTrafo($trafoRowAdj, $deltaI, 'carga', $mesesFiltro);
        // Enriquecer filas con I_antes_orig e I_traspasada para el display JS
        // (iSQL() no puede reconstruir la reducción feeder-based con simple %)
        if ($deltaTraspasoPct > 0 || $deltaTraspasoA > 0) {
            foreach ($trafoResult['tabla'] as &$row) {
                $mes  = $row['mes'];
                $orig = is_numeric($trafoRow[$mes] ?? null) ? round((float)$trafoRow[$mes], 1) : null;
                $row['I_antes_orig'] = $orig;
                $row['I_traspasada'] = ($orig !== null && $row['I_antes'] !== null)
                    ? round((float)$row['I_antes'] - $orig, 1) : null;
            }
            unset($row);
        }
        $trafoResult['subestacion'] = trim($trafoRow['subestacion'] ?? '');
        $trafoResult['barra']       = trim($trafoRow['barra'] ?? '');
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

**JS (`vccTablaFU`):** cuando `r.I_antes_orig != null` lo usa directamente en vez de `iSQL(r.I_antes)`.
Igual para `r.I_traspasada`. Esto evita el error de reconstrucción `I_adj / (1−p%)` que asume
una reducción porcentual sobre los propios valores del trafo.

### 6.3 `evaluarEquipos` (Enfoques A y B) — alivio absoluto

**Principio clave:** la isla transferida fluía íntegra por TODOS los equipos upstream del equipo_abre,
independientemente de su `fraccion`. La reducción se resta en valor absoluto, no proporcional a fraccion.

```
❌ Antes (incorrecto): I_reco = I_alim_reducida × fraccion = I_alim × (1−p%) × fraccion
✓  Ahora (correcto):  I_reco = I_alim_orig × fraccion − I_isla[mes]
                              = I_alim_orig × (fraccion − p%)
```

Para fraccion=0.461, p%=17.8%, peor mes I_alim=363.5 A:
- Incorrecto: `363.5 × 0.822 × 0.461 = 137.6 A` (alivio ▼29.8 A)
- Correcto:   `363.5 × (0.461 − 0.178) = 102.9 A` (alivio ▼64.7 A = header)

**Firma actual:**

```php
function evaluarEquipos(
    array  $equipos,
    float  $deltaI,
    ?float $cnAlim      = null,   // CN original del alim
    ?array $serieAlim   = null,   // serie ORIGINAL (sin reducir)
    ?array $mesesFiltro = null,
    ?array $serieAlivio = null,   // [mes => ΔI_isla [A]] — se resta directo por mes
    ?float $alivioA_abs = null,   // reducción para Enfoque A (CN × p% o ΔA fijo)
): array
```

En el caller (`/api/vcc/evaluar`):
```php
// Modo %: serieAlivio[mes] = I_alim[mes] × p%  — varía con la demanda mensual
// Modo ΔA: serieAlivio[mes] = ΔA constante
$serieAlivio = [];
foreach ($serieAlim['serie'] as $mes => $val) {
    $serieAlivio[$mes] = is_numeric($val)
        ? round((float)$val * ($dtPct / 100.0), 2) : 0.0;
}
$alivioA_abs = $cnAlim * ($dtPct / 100.0);  // CN × p%

// Se pasa la serie ORIGINAL (sin reducir) — la función resta el alivio internamente
$equipos = evaluarEquipos($upstream, $deltaI, $cnAlim, $serieAlim['serie'],
                          $mesesSel ?: null, $serieAlivio, $alivioA_abs);
```

**Display de alivio (JS):**
- Enfoque A: `▼ 80.1 A (CN)` → reducción calculada sobre CN máx (CN × p%)
- Enfoque B: `▼ 64.7 A (real)` → reducción sobre demanda real del peor mes
- Tooltip: muestra valor sin traspaso → con traspaso explícitamente
- Los valores difieren porque Enfoque A usa CN=450 A como base mientras B usa demanda histórica=363.5 A

```php
// Enfoque A: I_base = max(0, CN × fraccion − alivioA_abs)
$iBaseA = max(0.0, $cnAlim * $fraccion - $alivioA_abs);
// I_alivio_A = negativo (CN × p%), igual para todos los equipos upstream

// Enfoque B: I_reco[mes] = max(0, I_alim[mes] × fraccion − serieAlivio[mes])
$serieReco[$mes] = max(0.0, $vf * $fraccion - ($serieAlivio[$mes] ?? 0.0));
// I_alivio_B = negativo, ≈ −I_alim_peor × p% = −alivio_header
```

**Resultado `enfoque_a` / `enfoque_b` por equipo:**
```json
{
  "I_base": 127.2,
  "I_total": 151.3,
  "pct": 50.4,
  "estado": "viable",
  "I_alivio": -80.1
}
```

**Resultado filas `tabla_trafo` cuando hay traspaso:**
```json
{ "mes": "2025-06", "I_antes": 607.4, "I_despues": 631.4,
  "I_antes_orig": 672.0, "I_traspasada": -64.6, ... }
```

**Estado anterior (reemplazado):**

```php
// OBSOLETO — no usar
// $serieReco[$mes] = round((float)$v * $fraccion, 2);  // ← no restaba la isla
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

### 7.4 Fichas de equipos (`EquiposConfig.php`)

**Archivo:** `data/equipos_config.json` (se crea automáticamente al guardar la primera ficha)

**Estructura:**
```json
{
  "REC102921": {
    "corriente_a": 300,
    "tipo_limite": "setpoint",
    "corriente_conductor_a": null,
    "es_hdlb": null,
    "notas": "Reconectador troncal, bajada ABB",
    "fecha_registro": "2026-06-23",
    "historial": [
      { "fecha": "2026-06-20", "valor_anterior": 280, "valor_nuevo": 300, "notas": "Ajuste firmware" }
    ]
  },
  "PPF76085": {
    "corriente_a": 200,
    "tipo_limite": "fusible",
    "corriente_conductor_a": 280,
    "es_hdlb": true,
    "notas": "",
    "fecha_registro": "2026-06-23",
    "historial": []
  }
}
```

**Campos:**
- `corriente_a` — corriente límite en A (setpoint, fusible, o cable); el valor que bloquea VCC si se supera
- `tipo_limite` — `"setpoint"` | `"conductor"` | `"fusible"`
- `corriente_conductor_a` — solo para fusibles: corriente del conductor aguas abajo
- `es_hdlb` — solo para PPF: `true` (HDLB confirma) / `false` (no HDLB) / `null` (sin ficha)
- `historial` — cambios anteriores de `corriente_a`, con fecha y nota de motivo

**Funciones PHP (`src/EquiposConfig.php`):**
```php
ecGetTodos(): array               // retorna todo el JSON
ecGetEquipo(string $numpos): ?array
ecSetEquipo(string $numpos, array $body): array   // crea o actualiza, maneja historial
ecDeleteEquipo(string $numpos): void
```

---

### 7.5 Configuración de alimentadores (`AlimentadoresConfig.php`)

**Archivo:** `data/alimentadores_config.json` (se crea al guardar desde VCC)

**Estructura:**
```json
{
  "NOM73123": {
    "conductores_intermedios": [
      {
        "entre_a": "CLB101976",
        "entre_b": "REC102921",
        "corriente_a": 150,
        "fecha_registro": "2026-06-23"
      }
    ]
  }
}
```

**Semántica:**
- `entre_a` — equipo aguas abajo (más alejado de la SE)
- `entre_b` — equipo aguas arriba (más cercano a la SE)
- El conductor existe entre estos dos equipos en el troncal
- `corriente_a` — corriente límite del tramo de conductor
- La fraccion usada en el cálculo se hereda del equipo `entre_b` (conservador: captura toda la carga que pasa por ese punto)

**Funciones PHP (`src/AlimentadoresConfig.php`):**
```php
acGetTodos(): array
acGetAlim(string $nom): ?array
acSetAlim(string $nom, array $body): array   // reemplaza lista completa de conductores_intermedios
acDeleteAlim(string $nom): void
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

### GET /api/equipos/config
**Respuesta:** Objeto con todas las fichas guardadas `{ "REC102921": {...}, ... }`

### GET /api/equipos/config/{numpos}
**Respuesta:** Entrada de la ficha, o `{error: "not found"}` si no existe

### POST /api/equipos/config/{numpos}
**Body:**
```json
{
  "corriente_a": 300,
  "tipo_limite": "setpoint",
  "corriente_conductor_a": null,
  "es_hdlb": null,
  "notas": "Texto libre",
  "notas_historial": "Motivo del cambio"
}
```
**Respuesta:** `{ "ok": true, "entry": { ...ficha actualizada... } }`

Nota: si ya existe `corriente_a` y el nuevo valor difiere, se agrega entrada a `historial` automáticamente.

### DELETE /api/equipos/config/{numpos}
**Respuesta:** `{ "ok": true }`

### GET /api/alimentadores/config
**Respuesta:** Objeto con todos los alimentadores configurados `{ "NOM73123": {...}, ... }`

### GET /api/alimentadores/config/{nom_alim}
**Respuesta:** Config del alimentador o `null` si no existe

### POST /api/alimentadores/config/{nom_alim}
**Body:**
```json
{
  "conductores_intermedios": [
    { "entre_a": "CLB101976", "entre_b": "REC102921", "corriente_a": 150 }
  ]
}
```
**Respuesta:** `{ ...config guardada... }` (reemplaza lista completa)

### DELETE /api/alimentadores/config/{nom_alim}
**Respuesta:** `{ "ok": true }`

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
Descarga directa vía `tempnam(sys_get_temp_dir(), 'rpt')` + `readfile()` + `unlink()`. No se almacena copia en el servidor. Contenido:
- Cards resumen (Δ, %, TDs, clientes, kVA, mes peor)
- Tarjeta peor caso (tabla 2 columnas: origen / destino)
- Gráfico Chart.js autocontenido con datos inline en `<script>`
- Tabla mes a mes transpuesta
- Secciones de trafo (origen y destino)
- Sección de ajustes de demanda (si aplica)
- Sección `<details class="equip-det troncal">`: equipos troncales en receptor (tabla Equipo/Tipo/Observación, REC en rojo)
- Sección `<details class="equip-det isla">`: inversión de flujo + cambio topológico (si aplica)

### 10.2 Reporte VCC individual
Descarga directa vía `tempnam()` (igual que 10.1). Contenido:
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

13. **`delta_acum_orig` en corrimiento multi-caso**: el frontend envía `delta_acum_orig = prevSim.delta.serie_deltas` (positivos, en A). PHP los **resta** de `$serieOrig` y `$trafoOrigRow` para mostrar la carga actual del origen tras haber cedido esa corriente en el caso anterior. Signo siempre negativo: `$serieOrig[$m] -= $delta`.

14. **`mismo_trafo_destino` en misma barra SE**: cuando origen y destino comparten trafo (misma barra), PHP anula solo `$trafoDest` y agrega `mismo_trafo_destino=true` al objeto `$trafoOrig`. El frontend muestra en el label del trafo origen: _"— mismo trafo que destino, sin cambio neto"_.

15. **`isla` en respuesta de `/api/simular`**: el campo `detalle_tds` se excluye del objeto `isla` (va solo top-level). El campo `n_td_equipo_total` se calcula vía `tdsDeEquipo($dfAb, $equipoAbre)` y se agrega a `isla` cuando `tipo_isla=equipo`; el JS lo usa en reportes y body de descarga.

16. **Descarga de reportes sin guardar en servidor**: todos los endpoints de descarga HTML (`/api/descargar_html`, `/api/vcc/descargar_html`, `/api/feeders_nuevos/.../descargar_html`) usan `tempnam(sys_get_temp_dir(), 'rpt')` + `readfile()` + `unlink()`. No se escribe nada permanente en disco del servidor.

---

## 16. Bugs corregidos en QA (sesiones 2026-06-18 y 2026-06-19)

Registro de divergencias Python→PHP encontradas y corregidas en revisión post-traducción.

### Corrimiento y simulación

| # | Archivo | Descripción | Fix aplicado |
|---|---------|-------------|--------------|
| 1 | index.php | `recalcularConAjuste()` reiniciaba cadena | Wrapper que restaura contexto (`esCorrimiento`, `numeroCaso`) |
| 2 | index.php | Sugerencias usaban `feederB.nombre` en vez de `feederB.nom_alim` | Corregido campo de key |
| 3 | index.php | Comparación de remanente mezclaba unidades (kVA% vs A%) | Comparación en A absolutos |
| 4 | index.php | `delta_acum_orig` se sumaba (origin más cargado) en vez de restarse | Cambio `+` → `-` en serieOrig y trafoOrigRow |
| 5 | index.php | `mismaBarra` anulaba trafo origen y destino | Anula solo destino; marca origen con `mismo_trafo_destino=true` |
| 6 | index.php | `isla/preview` no retornaba `equipos_traspasados` | Agrega llamada a `equiposEnIsla()` antes de responder |
| 7 | index.php | `isla.n_td_equipo_total` nunca calculado | Calculado con `tdsDeEquipo()` y adjunto a `$islaOut` |
| 8 | index.php | `isla.detalle_tds` duplicado dentro del objeto `isla` | `unset($islaOut['detalle_tds'])` antes de jsonPy |
| 9 | index.php | `mes_peor` y `delta_max` usaban serie completa sin filtrar por período | `array_intersect_key` con `$mesesSel` antes de `calcularDelta` |
| 10 | index.php | Panel de ajuste mostraba todos los meses disponibles | `filtrarMeses()` aplicado a `serie_raw_orig/dest` en respuesta |
| 11 | index.php | `GET /api/ajustes` meses en orden de inserción | `ksort($ajustes)` antes del foreach |

### LZ (Límites de Zona)

| # | Archivo | Descripción | Fix aplicado |
|---|---------|-------------|--------------|
| 12 | index.php | Badge "En isla ✓" nunca aparecía | `equipos_troncal_orig` agregado a `_lzInfoEntre()` |
| 13 | index.html | `renderPanelLZ` no computaba `_enIsla` | Calculado desde `state.ultimaSimulacion.body_request.equipo_nombre` |

### VCC (Validación Conexión Cliente)

| # | Archivo | Descripción | Fix aplicado |
|---|---------|-------------|--------------|
| 14 | index.php | Dropdown TomSelect vacío | `numpos` faltaba en respuesta de `/api/vcc/equipos` |
| 15 | index.php | modo=tp filtraba solo cabecera | Iteración por `dfAb` con filtro `str_starts_with('TP')` |
| 16 | index.php | Sort modo=equipos incorrecto | `fraccion DESC` |
| 17 | index.php | Historial nunca mostraba evaluaciones | `historial_global` iteraba estructura JSON en vez de `evaluaciones[]` |
| 18 | index.php | Fecha ausente en evaluaciones guardadas | `$b['fecha'] = date('Y-m-d')` antes de guardarEvaluacion |
| 19 | index.php | `$punto` variable no asignada en evaluar | Referencias directas a `$b['nombre_ref']` etc. |
| 20 | index.php | Escenario 2 sens usaba serie sin alivio | `$serieParaEquipos` (con alivio) en lugar de `$serieAlim['serie']` |
| 21 | Reportes.php | Conteo equipos con CN incorrecto | `!empty($e['cn'])` en vez de `isset($e['cn'])` |

### Descarga de reportes

| # | Archivo | Descripción | Fix aplicado |
|---|---------|-------------|--------------|
| 22 | index.php | Reportes se guardaban en `resultados/` del servidor | `tempnam()` + `readfile()` + `unlink()` — sin copia permanente |

### VCC — sesión 2026-06-23

| # | Archivo | Descripción | Fix aplicado |
|---|---------|-------------|--------------|
| 23 | Vcc.php | `buscarPuntoConexion` fallaba en NUMPOS numéricos | `array_keys($tdsViaEq)` retorna int para keys numéricas; forzado `(string)$tdKey` |
| 24 | Reportes.php | `conductor_intermedio` no aparecía en tabla de equipos del reporte | Agregado `'conductor_intermedio'=>'Conductor'` a `$tipoMap` en `_repTablaEquiposHtml()` |
| 25 | Reportes.php | Nombre raw `Conductor(→REC102921)` en reporte en vez de `tramo →REC102921` | Formateo condicional por tipo en ambas variantes de tabla (legacy y dos-enfoque) |

---

## 17. VCC — Tabla Unificada y Cuellos de Botella (sesión 2026-06-23)

### 17.1 Contexto y motivación

La implementación original de VCC tenía dos secciones separadas:
- **Parte 1**: tabla de solo lectura con equipos upstream (fracción, kVA, tipo)
- **Parte 2**: inputs de corriente nominal (CN) por equipo

Se unificaron en una sola tabla interactiva. Adicionalmente se agregó soporte para modelar **cuellos de botella** (tramos de conductor con capacidad limitada) entre equipos específicos del troncal, con persistencia por alimentador.

---

### 17.2 Tabla unificada en el paso 4 de VCC

**Columnas:** Tipo | NUMPOS | Fracc. | kVA↓ | CN (A) | ⚙

- La columna **Fracc.** es la fracción del alimentador que pasa por ese equipo (descendente = más cercano a SE tiene fracción mayor).
- **CN** viene pre-llenado desde `equipos_config.json` si hay ficha guardada; es editable.
- **⚙** abre el modal de ficha del equipo (corriente, tipo, HDLB, notas, historial).
- **PPF en troncal**: muestra badge `HDLB`, `No HDLB` o `⚠ ¿HDLB?` según ficha. PPF en arranques (fuera del troncal) no aparecen.
- Equipos ordenados por fracción descendente (más upstream primero).

**Entre cada par de equipos consecutivos** aparece un botón `+ conductor` oculto que se activa al hover. Al hacer clic inserta una fila de conductor intermedio con:
- Input de corriente límite (A)
- Botón `×` para eliminar
- Fracción heredada del equipo upstream (valor más alto = conservador)

**Botón "Guardar configuración del alimentador"** → `POST /api/alimentadores/config/{nom_alim}` con todos los conductores actuales.

Al seleccionar un alimentador que ya tiene config guardada, los conductores se pre-insertan automáticamente en sus posiciones.

---

### 17.3 Conductores intermedios como elementos de cuello de botella

Un conductor intermedio se trata **exactamente igual que un equipo con CN** en el cálculo:

```
tipo = "conductor_intermedio"
nombre = "Conductor(→{entre_b})"     ← nombre interno
fraccion = fraccion del equipo entre_b (upstream)
cn = corriente_a ingresada por el usuario
```

- `evaluarEquipos()` lo procesa sin distinción de tipo.
- Enfoque A y Enfoque B se calculan normalmente.
- Si `margen < 0` (sobrepasa CN del conductor) → **bloquea aprobación** igual que un reconectador.
- En la tabla de resultados del reporte: se muestra como `tramo →{entre_b}` en vez del nombre raw.

**Lógica de fracción conservadora:** el conductor entre `CLB101976` (aguas abajo) y `REC102921` (aguas arriba) transporta toda la carga que pasa por `REC102921`, incluyendo posibles arranques intermedios. Usar la fracción de `REC102921` (mayor) asegura que no se subestime la carga real sobre el conductor.

---

### 17.4 Modal de ficha de equipo (`modalFichaEquipo`)

El modal existente se extendió para soportar creación de nuevas fichas desde el tab Configuración:

- **Modo edición** (desde VCC o desde tabla global): `fichaAbrirModal(numpos)` — pre-llena campos desde `state.equiposConfig[numpos]`.
- **Modo nueva ficha** (desde botón "+ Nueva ficha"): `fichaAbrirModal('', callback)` — muestra campo NUMPOS editable en el modal.
- **Callback opcional**: al guardar/eliminar, si se pasó `callback` se llama en vez de refrescar la tabla VCC. Permite que el modal funcione desde VCC y desde el tab Configuración sin duplicar código.

```js
// Desde VCC (comportamiento original):
fichaAbrirModal("REC102921");

// Desde tab Configuración (refrescar tabla global):
fichaAbrirModal("REC102921", cargarEquiposGlobal);

// Nueva ficha desde tab Configuración:
fichaAbrirModal("", cargarEquiposGlobal);
```

---

### 17.5 Tab Configuración global

El tab "Ajustes de Demanda" fue reemplazado por "Configuración" con tres pills internos:

#### Pill: Equipos
Tabla CRUD de todas las fichas en `equipos_config.json`:
- Columnas: NUMPOS | Tipo | CN (A) | HDLB | Notas | Fecha | Acciones
- Buscador por NUMPOS (filtro local, sin request al servidor)
- ⚙ edita con el modal de ficha (callback → `cargarEquiposGlobal()`)
- ✕ elimina con confirmación (`DELETE /api/equipos/config/{numpos}`)
- "Nueva ficha" abre modal en modo creación

#### Pill: Alimentadores
Tabla expandible de todos los alimentadores con config guardada:
- Fila principal: NOM_ALIM + conteo de conductores
- Click expande → sub-tabla con conductores (desde / hasta / CN / fecha / ✕)
- ✕ en conductor: elimina ese conductor (fetch GET → modifica lista → POST)
- ✕ en fila principal: elimina toda la config del alimentador (`DELETE /api/alimentadores/config/{nom_alim}`)
- Lectura: la config se agrega desde VCC; desde aquí solo se revisa y elimina

#### Pill: Ajustes de Demanda
Mismo contenido que tenía el tab "Ajustes de Demanda" anteriormente, sin cambios funcionales.

---

### 17.6 Flujo completo de una evaluación con conductores

1. Usuario selecciona alimentador en VCC → `cargarConfigAlim(nom)` precarga conductores guardados
2. La tabla upstream muestra equipos ordenados + conductores pre-insertados en posición
3. Usuario revisa/completa CNs de equipos y conductores
4. Usuario puede agregar más conductores con `+` entre filas
5. Click "Guardar configuración del alimentador" → `POST /api/alimentadores/config/{nom}` con todos los conductores
6. Click "Evaluar" → `vccLeerCNsEquipos()` lee todos los `tr.vcc-eq-row` y `tr.vcc-cond-row`
7. Body enviado a `/api/vcc/evaluar` incluye conductores como equipos con `tipo: "conductor_intermedio"`
8. PHP `evaluarEquipos()` calcula Enfoque A y B para todos los elementos
9. Frontend muestra tabla de resultados con conductores integrados como `tramo →{equipo}`
10. Si algún conductor tiene margen < 0 → estado `critico` → botón Aprobar bloqueado

---

---

## 18. VCC — Evaluación del alimentador receptor en traspaso simultáneo (sesión 2026-06-23 tarde)

### 18.1 Contexto

Cuando se configura un **Traspaso simultáneo** en modo **Topología** (Paso 6 de VCC), el alimentador receptor (alim B) recibe la carga de la isla que se libera. Esta sección describe cómo se configura el receptor y cómo aparecen sus resultados dentro del flujo VCC.

---

### 18.2 Panel de configuración del receptor (UI)

Al seleccionar el alimentador receptor en `#vcc-traspaso-alim-dest`, el hook `vccTraspasoDestinoChange()` llama a `vccCargarEquiposB(nomAlimB, equiposTroncalB)` que:

1. Hace `POST /api/alim/troncal_enriquecido` con los nombres de equipos troncales y el `nom_alim` del receptor → responde con equipos enriquecidos (fracción, kVA↓, tipo)
2. Hace `GET /api/alimentadores/config/{nomAlimB}` para cargar conductores intermedios guardados
3. Renderiza `#vcc-panel-equipos-b` con la misma tabla que el paso 4 principal:
   - Columnas: Tipo | NUMPOS | Fracc. | kVA↓ | CN (A) | ⚙
   - Botones `+ conductor` entre equipos consecutivos
   - Botón **"Guardar configuración receptor"** → `POST /api/alimentadores/config/{nomAlimB}`
4. El panel se limpia automáticamente al cambiar el equipo que abre o desactivar el modo Topología

Los conductores del receptor se guardan en `alimentadores_config.json` usando el `nom_alim` del receptor como clave — misma estructura que los conductores del alimentador principal.

---

### 18.3 Lectura de CNs al evaluar

En `vccGetTraspasoParams()`, cuando el modo es `topo`, `equipos_troncal_b` ya no es la lista cruda de nombres sino el resultado de `vccLeerCNsEquiposB()`, que retorna un array de objetos estructurados:

```js
[
  { nombre: "REC12345", tipo: "reconectador", fraccion: 0.82, cn: 150 },
  { tipo: "conductor_intermedio", entre_b: "REC12345", entre_a: "CLB99001", fraccion: 0.82, cn: 120 },
  { nombre: "CLB99001", tipo: "equipo_sub", fraccion: 0.45, cn: null },
]
```

Si el panel no está visible, retorna `state.vccEquiposTroncalB` (lista de strings, compatibilidad legado).

---

### 18.4 Backend — normalización de `equipos_troncal_b`

El endpoint Python-alias (`POST /api/simular` ← VCC flow) acepta `equipos_troncal_b` en **dos formatos**:

- **Legado** (lista de strings): `["REC12345", "CLB99001"]` — CN se lee desde `equipos_config.json`
- **Nuevo** (lista de objetos): array con `nombre`, `tipo`, `cn`, `fraccion`; conductores con `tipo: "conductor_intermedio"` y `entre_b`, `entre_a`

El backend normaliza automáticamente:
```php
foreach ($eqTroncalB as $item) {
    if (is_string($item))          → $eqNombresB[]     (CN desde ecGetEquipo)
    elseif tipo == "conductor_intermedio" → $eqCondsB[]
    else                           → $eqNombresB[] + $eqCNsFromReq[$nombre] si hay cn
}
```

**Prioridad de CN:** CN del request (usuario) > `equipos_config.json`.

Los conductores intermedios del receptor se envían a `evaluarEquipos()` con `fraccion` desde el request.

---

### 18.5 Resultados dentro de cada escenario

Los resultados del receptor aparecen **dentro de Escenario 1 y Escenario 2**, no como sección aparte. Cada escenario tiene tres bloques colapsables del receptor (color naranja `#f5a623`):

| ID (sufijo `-emp` / `-inst`) | Contenido |
|---|---|
| `vcc-det-receptor-{s}` | Tabla de equipos troncales del receptor (misma función `vccTablaEquipos`) |
| `vcc-det-alim-receptor-{s}` | FU mensual del alimentador receptor (`vccTablaFU` con `labelDelta: "ΔI traspaso (A)"`) |
| `vcc-det-trafo-receptor-{s}` | FU mensual del trafo AT/MT del receptor (si existe) |

El helper `_vccRenderReceptorEnEscenario(suffix, dest)` encapsula el rendering para evitar duplicación.

#### Label personalizado en `vccTablaFU`

La función `vccTablaFU(tabla, vccResult, opts = {})` acepta un tercer parámetro `opts`:
- `opts.labelDelta`: reemplaza el label de la fila delta (default: `"ΔI cliente (A)"`). Para el receptor se usa `"ΔI traspaso (A)"`.

---

### 18.6 Flujo completo del traspaso en VCC (modo Topología)

1. Paso 6 → modo Topología → selecciona equipo que abre (`vccTraspasoAbreChange`)
2. Aparece selector de alimentador receptor con destinos viables (por LZ)
3. Al seleccionar alim B → `vccTraspasoDestinoChange` → resultado de isla + **panel equipos B**
4. Usuario revisa/completa CNs del receptor; opcionalmente agrega conductores intermedios y guarda
5. Click "Evaluar VCC" → body incluye `equipos_troncal_b: vccLeerCNsEquiposB()`
6. Backend evalúa alim B con `evaluarEquipos(equiposBEnrich, alivioAPeor, cnB, serieB, meses)` y `calcularVcc` para FU
7. Resultado en `r.analisis_destino` → `_vccRenderReceptorEnEscenario("emp", dest)` y `("inst", dest)` dentro de cada escenario

### 17.7 Pendiente — Fase 2: Autotransformadores

Los autotransformadores no aparecen en `dfAb` como equipo explícito. Se identifican por tener dos reconectadores flanqueantes con corrientes nominales distintas (expresadas en sus tensiones de red respectivas: 12 kV vs 23 kV). El plan es:

- Identificar el boundary autotrafo en la tabla upstream (usuario marca el REC del lado conexión)
- Guardar en `alimentadores_config.json` bajo clave `"autotrafos"`:
  ```json
  { "rec_lado_conexion": "REC1234", "tension_lado_conexion": 23 }
  ```
- Al evaluar, usar ΔI diferenciado por segmento:
  - Segmento 23 kV: `ΔI = kVA / (√3 × 23)`
  - Segmento 12 kV: `ΔI = kVA / (√3 × 12)` (mayor; hoy subestimado)
- Sin cambio en el backend `evaluarEquipos()`: la fracción y CN ya dan el cuadro correcto si el ΔI enviado es el del segmento correcto

---

## 19. VCC — Mejoras de UX e interfaz (sesión 2026-06-24)

### 19.1 Reporte HTML descargable — secciones colapsables

**Archivos:** `codigo_php/src/Reportes.php`

Antes, `_repSeccionVccHtml` y `_repSeccionReceptorHtml` retornaban `<section>` planas, no colapsables. Se convirtieron a `<details open>` / `<details>` con `<summary class="vcc-esc-sum">`:

- **Escenario 1 y 2**: `<details open>` — abiertos al cargar, con `▼/▶` rotatorio
- **Receptor**: `<details>` sin `open` — cerrado por defecto (color ámbar: `.vcc-receptor-sum`)
- CSS agregado: `.vcc-esc-sum`, `.vcc-receptor-sum`, `details[open]>.vcc-esc-sum::before`

El receptor parte cerrado intencionalmente porque es información secundaria respecto a los escenarios del alimentador principal.

### 19.2 Reporte HTML — inclusión del análisis del receptor

**Archivos:** `codigo_php/src/Reportes.php`, `codigo_php/templates/index.html`

- `vccGuardar` y `vccDescargarHTML` ahora envían `analisis_destino: r.analisis_destino || null`
- `generarReporteVcc` extrae `$analisisDest = $body['analisis_destino'] ?? null` y llama `_repSeccionReceptorHtml($analisisDest)` entre Escenario 1 y Escenario 2
- El receptor se muestra una sola vez (no por escenario) porque el análisis B no varía entre kVA empalme e instalado
- `_repTablaMensualVcc` acepta 5° parámetro `$labelDelta = 'ΔI cliente (A)'`; las tablas del receptor usan `'ΔI traspaso (A)'`
- Evaluaciones del historial (`hvccDescargar`) heredan el receptor automáticamente porque `guardarEvaluacion` persiste el body completo

### 19.3 UI — Sector receptor agrupado bajo un `<details>` padre

**Archivos:** `codigo_php/templates/index.html`

Los 3 sub-bloques del receptor (equipos, detalle mensual, trafo) estaban como `<details>` independientes dentro de cada escenario. Se agruparon bajo un `<details>` padre por escenario:

```
#vcc-det-receptor-group-emp   ← padre colapsable "Alimentador receptor — NOM"
  #vcc-det-receptor-emp       ← Equipos (sub-bloque)
  #vcc-det-alim-receptor-emp  ← Detalle mensual (sub-bloque)
  #vcc-det-trafo-receptor-emp ← Trafo (sub-bloque, si hay datos)
```

`_vccRenderReceptorEnEscenario(suffix, dest)` ahora muestra/oculta el grupo padre (`#vcc-det-receptor-group-{suffix}`) además de los hijos individuales. El título del grupo se rellena con `dest.nom_alim`.

### 19.4 UI — Jerarquía visual por indentación

**Archivos:** `codigo_php/templates/index.html` (bloque `<style>`)

Dos reglas CSS para crear dos niveles visuales en los resultados VCC:

```css
.bloque-summary { padding-left: .75rem; }
.bloque-body    { padding-left: .75rem; }
```

Efecto acumulativo:
- **Nivel 1** (Equipos Aguas Arriba, Alimentador, Trafo, Alimentador receptor): `0.75rem`
- **Nivel 2** (sub-ítems del receptor): `0.75rem` (bloque-body del padre) + `0.75rem` (su propio summary) = `1.5rem`

### 19.5 UX — Scroll automático al evaluar VCC

**Archivos:** `codigo_php/templates/index.html`

Al terminar `vccEvaluar()`, se ejecuta:

```js
document.getElementById("vcc-resultados")?.scrollIntoView({ behavior: "smooth", block: "start" });
```

El scroll es suave (`smooth`) y apunta al inicio de `#vcc-resultados`.

### 19.6 UI — Orden de pestañas

La pestaña **Configuración** se movió al último lugar para no interrumpir el flujo de trabajo principal:

`Nuevo Traspaso → Alimentadores en Comisionamiento → VCC → Historial VCC → Configuración`

---

## 20. Filtrado topológico de LZ — VCC y Nuevo Traspaso (sesión 2026-06-24)

### 20.1 VCC — Selector de equipo que cierra (LZ)

**Archivos:** `codigo_php/templates/index.html`

Antes, `vccTraspasoDestinoChange` tomaba `lzList?.[0]` sin mostrar opciones al usuario. Ahora, al seleccionar el alimentador receptor en modo Topología, se llama `vccMostrarLzCierra(lzList)`:

- **1 LZ válido** → se auto-selecciona y muestra como texto con badge de tipo
- **Varios LZ válidos** → radio buttons, el primero pre-seleccionado

Todos los LZ del `lzList` son topológicamente válidos porque el filtro en `vccTraspasoAbreChange` ya garantiza `equipoAbre ∈ lz.equipos_troncal_orig` y `v.viable !== false`. No hay opciones inválidas ni badges "Verificar".

**Funciones nuevas:**

```js
vccMostrarLzCierra(lzList)   // renderiza selector en #vcc-lz-cierra-panel
vccSeleccionarLz(lz)         // actualiza state.vccNumposLz y recarga panel equipos B
vccLzCierraChange(numposLz)  // callback del radio button
```

`vccTraspasoAbreChange` ahora también almacena `tipo` en cada entrada del `lzList` para mostrar el badge (Bilateral / 3 ramas).

Reset del panel: al cambiar el equipo que abre, `#vcc-lz-cierra-panel` se oculta hasta que se re-seleccione el receptor.

### 20.2 VCC — Info de maniobra en sector receptor

**Archivos:** `codigo_php/templates/index.html`, `codigo_php/src/Reportes.php`

**UI:** `_vccRenderReceptorEnEscenario(suffix, dest)` ahora rellena `#vcc-receptor-maniobra-{suffix}` con:

```
↗ Abre: <EQUIPO>  |  ↙ Cierra: <NUMPOS_LZ>
```

El equipo que abre se lee desde `#vcc-traspaso-eq-abre`; el que cierra desde `dest.equipo_lz || state.vccNumposLz`.

**Reporte HTML:** `_repSeccionReceptorHtml` lee `$dest['equipo_abre']` y `$dest['equipo_cierra']` (con fallback a `$dest['equipo_lz']`) y agrega un párrafo `↗ Abre: X | ↙ Cierra: Y` antes del metadata de FU/CN.

**Payload:** `vccGuardar` y `vccDescargarHTML` enriquecen `analisis_destino` con:

```js
analisis_destino: r.analisis_destino ? {
  ...r.analisis_destino,
  equipo_abre:   document.getElementById("vcc-traspaso-eq-abre")?.value || null,
  equipo_cierra: state.vccNumposLz || r.analisis_destino.equipo_lz || null,
} : null,
```

Esto asegura que el historial VCC también conserve la info de maniobra.

### 20.3 Nuevo Traspaso — Filtrado de destinos al elegir equipo que abre

**Archivos:** `codigo_php/templates/index.html`

**Problema anterior:** el TomSelect de alim B mostraba todos los vecinos LZ del alim A, independientemente del equipo que abre seleccionado. El filtro topológico (`equipoAbre ∈ lz.equipos_troncal_orig`) solo se aplicaba en `mostrarEquipoCierra` como badge informativo.

**Solución:** nueva función `filtrarDestinosPorEquipo(equipoAbre)` que reconstruye el TomSelect de destino en tiempo real:

```js
// Con equipo → filtra lzVecinos por equipos_troncal_orig
const lzValidos = state.lzVecinos.filter(lz =>
  lz.equipos_troncal_orig?.some(e => e.toUpperCase().trim() === eqUp)
);
// Solo destinos alcanzables via esos LZ viables
const numalimSet = new Set(
  lzValidos.flatMap(lz => lz.vecinos.filter(v => v.viable !== false).map(v => v.numalim))
);
```

**Comportamiento:**
- Si la destino actual sigue en la lista filtrada → se preserva la selección y `mostrarEquipoCierra` se re-ejecuta automáticamente
- Si la destino actual cae del filtro → se resetea y se limpia el selector de equipo cierra
- Sin equipo (o modo "tds") → restaura todos los vecinos LZ (comportamiento original)

**Aplica a corrimientos:** en un corrimiento la destino C se pre-selecciona al hacer clic en el candidato. Si el equipo sugerido es válido para ese par (como se espera), la selección se preserva sin cambio.

**Hooks:**
- `ts.equipo onChange` → llama `filtrarDestinosPorEquipo(val)` (reemplaza el `mostrarEquipoCierra` directo que había)
- `ts.equipo onChange` con val vacío → `filtrarDestinosPorEquipo(null)`
- Radio tipo-isla al cambiar a "tds" → `filtrarDestinosPorEquipo(null)`

**Indicador visual:** `#lz-dest-info` muestra "X alimentador(es) con LZ válido para equipo `EQUIPO`" con ícono de embudo azul cuando hay filtro activo.
