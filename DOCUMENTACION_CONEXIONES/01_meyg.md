# Conexión `db()` → base `meyg`

Clave de config: `mysql_cuadrilla`. Base principal del aplicativo: **topología de red** (aguas abajo,
límite de zona) y **demandas máximas** (por alimentador y por trafo). Todas las consultas son de
**solo lectura** y se ejecutan calificando `meyg.<tabla>`.

Datos verificados contra la BD el 2026-08-26.

---

## `meyg.maniobras_rapidas_aguas_abajo`

Topología «aguas abajo»: por cada alimentador, todos sus equipos/tramos y la carga (potencia, clientes)
colgando de cada posición. Es la tabla central del modelo de red.

**Metadatos:** ~271.216 filas · ~54,6 MB · índices `idx_mraa_nom_alim` (NOM_ALIM), `idx_mraa_numalim` (NUMALIM).

**Uso:**
- `src/Datos.php` → `aguasAbajoDeFeeder()` (hot path, `WHERE nom_alim = ?`), `aguasAbajoDeFeeders()`,
  `mapaNumalimNomAlim()`, `listarFeedersAb()`, `contarAguasAbajo()`, `construirIndiceEquipos()`
  (`SELECT DISTINCT numpos_equip, nom_alim … WHERE nombre_equip <> 'cabecera'`).
- Las filas pasan por `_normalizarFilasAb()` → nombres de columna a `snake_case` minúscula.

**Columnas** (nombre en BD · tipo · uso — ✓ = el motor la consume):

| Columna (BD)   | Tipo        | Descripción / uso                                                        |
|----------------|-------------|--------------------------------------------------------------------------|
| `CODIGO_LINEA` | text        | Código de línea. **No consumida.**                                       |
| `NOM_ALIM`     | text        | ✓ Nombre del alimentador. Clave de filtrado (índice `idx_mraa_nom_alim`). |
| `RAMASC_td`    | text        | Ramal/ascendencia del TD. **No consumida.**                              |
| `NOMBRE`       | text        | ✓ Nombre descriptivo (se hace `trim`).                                    |
| `NUMPOS_td`    | text        | ✓ Identificador de posición del TD (cabecera). `dropna` descarta filas sin este valor. |
| `POTENCIA`     | bigint(20)  | ✓ Potencia del punto. Se parsea a float (coma decimal / NBSP).           |
| `CNT_CLIE`     | bigint(20)  | ✓ Nº de clientes → se normaliza a `clientes` (int).                      |
| `RAMASC_equip` | text        | ✓ Ramal/ascendencia del equipo (se hace `trim`).                         |
| `NUMPOS_equip` | text        | ✓ Identificador de posición del equipo. Clave del índice de equipos.     |
| `NOMBRE_equip` | text        | ✓ Tipo/rol del equipo; `lowercase+trim`. Filtro `= 'cabecera'` vs equipos. |
| `ESTADO_BASAL` | text        | ✓ Estado basal del equipo (se hace `trim`; se arrastra en la fila normalizada). |
| `NUMALIM`      | double      | ✓ Nº de alimentador (int). Mapa numalim→nom_alim (índice `idx_mraa_numalim`). |

**Consulta típica (hot path):**
```sql
SELECT * FROM meyg.maniobras_rapidas_aguas_abajo WHERE nom_alim = ?
```

**Notas:**
- La comparación por `nom_alim` se hace sin `UPPER()` para no romper el uso del índice (se apoya en la
  colación `utf8mb4_*_ci` de la columna).
- Todas las columnas son `text`/numéricas **NULL-ables** y sin PK. `numpos_td`, `numpos_equip` y
  `codigo_linea` son `text` aunque contengan números.
- `construirIndiceEquipos()` evita traer las ~271k filas con `SELECT DISTINCT numpos_equip, nom_alim`.

---

## `meyg.dem_maximas`

Demanda máxima mensual **por alimentador** (formato long, una fila por numalim+mes). Se pivota a wide
(columnas `YYYY-MM`) en `pivotarAlim()`.

**Metadatos:** ~18.397 filas · ~3,34 MB · índices `idx_numalim_mes` (NUMALIM, MES), `idx_numalim` (NUMALIM).

**Uso:** `src/Datos.php` → `cargarDemandas()` (`SELECT *`, cacheada con `TTL_DEM`, 30 días) → `pivotarAlim()`.
Columnas consumidas **con la clave tal cual (MAYÚSCULA), sin `_normCol()`**.

| Columna (BD)  | Tipo        | Descripción / uso                                            |
|---------------|-------------|--------------------------------------------------------------|
| `NUMALIM`     | int(11)     | ✓ Nº de alimentador. Clave del pivote.                       |
| `SUBESTACION` | varchar(80) | ✓ Subestación (metadato `subestacion`).                      |
| `ALIMENTADOR` | varchar(80) | ✓ Nombre del alimentador (metadato `nom_rapida`).            |
| `CN`          | double      | ✓ Capacidad nominal (se toma la del mes más reciente).       |
| `CE`          | double      | ✓ Capacidad de emergencia (se toma la del mes más reciente). |
| `MAXIMA`      | double      | ✓ Demanda máxima del mes → valor de la columna `YYYY-MM`.    |
| `MES`         | date        | ✓ Mes de la medición → se normaliza a `YYYY-MM`.             |

**Nota:** `aggfunc=max` — si hay duplicados numalim+mes, conserva el mayor. `CN`/`CE` se toman de la
fila con `MES` más reciente por numalim.

---

## `meyg.dem_maximas_trafos`

Demanda máxima mensual **por trafo/barra** (formato long). Se pivota en `pivotarTrafos()`.

**Metadatos:** ~39.677 filas · ~9,06 MB · índices `idx_numalim` (NUMALIM), `idx_mes` (MES), `idx_barra` (BARRA).

**Uso:** `src/Datos.php` → `cargarDemandas()` (`SELECT *`, misma caché `TTL_DEM`) → `pivotarTrafos()`.
Claves en MAYÚSCULA, sin `_normCol()`.

| Columna (BD)  | Tipo       | Descripción / uso                                        |
|---------------|------------|----------------------------------------------------------|
| `NUMALIM`     | bigint(20) | ✓ Nº de alimentador. Clave del pivote.                   |
| `ALIMENTADOR` | text       | ✓ Nombre del alimentador (metadato `barra_alim`).        |
| `BARRA`       | text       | ✓ Barra del trafo (metadato `barra`).                    |
| `CN`          | double     | ✓ Capacidad nominal (mes más reciente).                  |
| `CE`          | double     | ✓ Capacidad de emergencia (mes más reciente).            |
| `CORRIENTE`   | double     | ✓ Corriente máxima del mes → valor de la columna `YYYY-MM`. |
| `MES`         | text       | ✓ Mes → se normaliza a `YYYY-MM`. (Aquí `MES` es `text`, no `date`.) |

---

## `meyg.maniobras_rapidas_limite_zona`

Límite de zona: relación equipo de límite (LZ) ↔ troncal receptor, para determinar qué numalims
comparten un dispositivo de frontera. Alimenta el cálculo de viabilidad de traspaso.

**Metadatos:** ~31.560 filas · ~5,52 MB · **sin índices** (solo la tabla base).

**Uso:** `src/Datos.php` → `cargarLimiteZona()` (`SELECT` de 4 columnas, cacheada con `TTL_LZ`).
Se consumen **solo 4 columnas**, con la clave tal cual (mayúscula/mixto).

| Columna (BD)     | Tipo   | Descripción / uso                                         |
|------------------|--------|-----------------------------------------------------------|
| `NOMBRE_alim_LZ` | text   | Nombre del alimentador LZ. **No consumida.**              |
| `NUMALIM_LZ`     | double | ✓ Nº de alimentador del equipo LZ (int).                  |
| `NUMPOS_LZ`      | text   | ✓ Posición del equipo de límite de zona. Clave del mapeo. |
| `RAMASC_LZ`      | text   | Ramal/ascendencia LZ. **No consumida.**                   |
| `RAMASC_troncal` | text   | Ramal/ascendencia del troncal. **No consumida.**          |
| `NUMPOS_troncal` | text   | ✓ Posición del troncal receptor.                          |
| `NOMBRE_troncal` | text   | Nombre del troncal. **No consumida.**                     |
| `NOM_ALIM`       | text   | Nombre del alimentador. **No consumida.**                 |
| `NUMALIM`        | double | ✓ Nº de alimentador (receptor) (int).                     |
| `equip_alim`     | text   | Equipo/alimentador. **No consumida.**                     |

**Consulta típica:**
```sql
SELECT NUMALIM_LZ, NUMALIM, NUMPOS_LZ, NUMPOS_troncal
FROM meyg.maniobras_rapidas_limite_zona
```

**Notas:**
- `cargarLimiteZona()` aplica un set de excepciones internas (`_LZ_EXCEPCIONES`) que descarta ciertos
  `NUMPOS_LZ` antes de construir el mapa troncal.
- Tabla **sin índices**: la consulta trae todas las filas (~31k) y filtra en PHP; es aceptable por el
  cacheo (`TTL_LZ`), pero si crece conviene indexar `NUMPOS_LZ`.
