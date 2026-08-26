# Documentación de conexiones y datos

Mapa **verificado contra la BD real** (introspección `SHOW COLUMNS`/`SHOW INDEX`/`information_schema`,
2026-08-26) de qué bases consulta el aplicativo de simulación de traspasos MT, con qué tablas/columnas
y para qué. Sirve de referencia para mantener el proyecto.

> **Sin credenciales.** Este documento describe **solo estructura y uso**. Los host/usuario/contraseña
> viven en `codigo_php/config.php` (gitignoreado; plantilla en `config.example.php`) y, para el deploy,
> en el arreglo de _fallback_ dentro de `codigo_php/conexion.php`. **No se reproducen aquí.**

---

## Cómo se definen las conexiones

Todas las conexiones son **singletons PDO** declarados en `codigo_php/conexion.php`. Cada función lee su
bloque de config desde `$_cfg[<clave>]` y devuelve un `PDO` cacheado (`static $pdo`).

| Función      | Clave de config    | Base de datos          | Estado                    |
|--------------|--------------------|------------------------|---------------------------|
| `db()`       | `mysql_cuadrilla`  | `meyg`                 | **En uso** (topología + demandas) |
| `db_tlc()`   | `mysql_tlc`        | `telecontrol_systems`  | **En uso** (equipos telecontrolados / FRG) |
| `db_retim()` | `mysql_retim`      | `qv_server`            | **Declarada, sin uso hoy** |
| `db_agui()`  | `mysql_agui`       | `inf_tecnica_agui`     | **Declarada, sin uso hoy** |

Las cuatro apuntan al **mismo servidor MySQL**. Credenciales y host: ver `config.php`.

### Atributos comunes (idénticos en las 4 conexiones)

- **Charset:** `utf8mb4` (DSN) + `SET NAMES utf8mb4` como `ATTR_INIT_COMMAND`.
- **Modo de error:** `PDO::ERRMODE_EXCEPTION`.
- **Fetch por defecto:** `PDO::FETCH_ASSOC`.
- **Timeout de conexión:** `connect_timeout=20` (en el DSN).

---

## Matiz cross-db

**No hay consulta cross-db real.** Las consultas de `db()` califican la base explícitamente
(`meyg.maniobras_rapidas_aguas_abajo`, etc.), pero esa base es **la misma** a la que `db()` está
conectada — es calificación defensiva, no un salto entre bases. Las consultas de `db_tlc()` usan tablas
**sin calificar** (`equipo`, `tipo_equipo`), que resuelven a `telecontrol_systems` (su propia base). No
existe el patrón «conexión a X consulta `Y.tabla`».

---

## Índice de tablas por conexión

- **[01_meyg.md](01_meyg.md)** — `db()` → `meyg`
  - `maniobras_rapidas_aguas_abajo` · `dem_maximas` · `dem_maximas_trafos` · `maniobras_rapidas_limite_zona`
- **[02_telecontrol_systems.md](02_telecontrol_systems.md)** — `db_tlc()` → `telecontrol_systems`
  - `equipo` · `tipo_equipo`
- **[03_conexiones_sin_uso.md](03_conexiones_sin_uso.md)** — `db_retim()` (`qv_server`) y `db_agui()` (`inf_tecnica_agui`): declaradas, sin uso.

---

## Nota de normalización de columnas (importante)

Las tablas `meyg` traen los nombres de columna en **MAYÚSCULAS/mixto** (`NOM_ALIM`, `NUMPOS_td`,
`RAMASC_equip`…). Hay **dos tratamientos distintos** en el código:

- **`maniobras_rapidas_aguas_abajo`** pasa por `_normalizarFilasAb()` → `_normCol()`, que baja a
  `snake_case` sin tildes. Por eso en el motor las columnas se leen en minúscula (`nom_alim`,
  `numpos_td`, `nombre_equip`…).
- **`dem_maximas` / `dem_maximas_trafos` / `maniobras_rapidas_limite_zona`** se consumen con la clave
  **tal cual viene de MySQL** (`NUMALIM`, `MES`, `NUMPOS_LZ`…), sin `_normCol()`.

---

## Mapa rápido (recorrido de datos del app)

| Fase / función                         | Tabla                                   | Conexión    | Archivo del código                |
|----------------------------------------|-----------------------------------------|-------------|-----------------------------------|
| Topología aguas abajo de un feeder     | `meyg.maniobras_rapidas_aguas_abajo`    | `db()`      | `src/Datos.php` `aguasAbajoDeFeeder()` |
| Mapa numalim → nom_alim                | `meyg.maniobras_rapidas_aguas_abajo`    | `db()`      | `src/Datos.php` `mapaNumalimNomAlim()` |
| Selector de feeders                    | `meyg.maniobras_rapidas_aguas_abajo`    | `db()`      | `src/Datos.php` `listarFeedersAb()` |
| Índice de equipos (numpos → feeders)   | `meyg.maniobras_rapidas_aguas_abajo`    | `db()`      | `src/Datos.php` `construirIndiceEquipos()` |
| Conteos de status                      | `meyg.maniobras_rapidas_aguas_abajo`    | `db()`      | `src/Datos.php` `contarAguasAbajo()` |
| Demandas máximas por alimentador       | `meyg.dem_maximas`                      | `db()`      | `src/Datos.php` `cargarDemandas()` |
| Demandas máximas por trafo             | `meyg.dem_maximas_trafos`               | `db()`      | `src/Datos.php` `cargarDemandas()` |
| Límite de zona (troncal receptor)      | `meyg.maniobras_rapidas_limite_zona`    | `db()`      | `src/Datos.php` `cargarLimiteZona()` |
| Caché mensual TLC / FRG                 | `telecontrol_systems.equipo` + `tipo_equipo` | `db_tlc()` | `src/Telecontrol.php` `tlcRefrescar()` |

> **Caché:** las demandas (`dem_maximas*`) y el límite de zona se cachean en `data/cache/` con TTL
> (`TTL_DEM`, `TTL_LZ`). El índice de equipos también se cachea. La info TLC se materializa en
> `data/cache/telecontrol.json` (refresco mensual, `tlcRefrescar()`).
