# Conexión `db_tlc()` → base `telecontrol_systems`

Clave de config: `mysql_tlc`. Provee el estado de **telecontrol (TLC)** y la marca **FRG** de los
equipos, para saber si un equipo/alimentador está telecomandado. Se consulta **una vez al mes** y el
resultado se materializa en `codigo_php/data/cache/telecontrol.json`.

Las tablas se consultan **sin calificar** (`equipo`, `tipo_equipo`) — resuelven a `telecontrol_systems`.

Datos verificados contra la BD el 2026-08-26.

---

## `telecontrol_systems.equipo`

Inventario de equipos telecontrolados. El aplicativo lo cruza con `tipo_equipo` para armar la clave
`TIPO+NUMPOS` y detectar equipos/alimentadores FRG.

**Metadatos:** ~3.861 filas · ~1,91 MB · PK `numpos`; índices FK sobre `estado`, `equipo_control`,
`tipo_rgdat`, `tipo_equipo`, `comuna`.

**Uso:** `src/Telecontrol.php` → `tlcRefrescar()` (JOIN con `tipo_equipo`, `WHERE estado NOT IN (3,5)`).

| Columna (BD)             | Tipo         | Descripción / uso                                                |
|--------------------------|--------------|------------------------------------------------------------------|
| `numpos`                 | int(11) PK   | ✓ Nº de posición del equipo. Forma la clave `TIPO+NUMPOS`.       |
| `estado`                 | int(11)      | ✓ Estado del equipo. Filtro `NOT IN (3,5)` (excluye retirados/baja). |
| `comuna`                 | int(11)      | Comuna. No consumida.                                            |
| `empresa`                | varchar(100) | No consumida.                                                    |
| `alias`                  | varchar(255) | No consumida.                                                    |
| `subestacion_1`          | varchar(255) | ✓ Subestación primaria → lista `frg_ssee` (`UPPER(TRIM(...))`).  |
| `alimentador_1`          | varchar(255) | ✓ Alimentador primario → lista `frg_alim` (`UPPER(TRIM(...))`).  |
| `subestacion_2`          | varchar(255) | Subestación secundaria. No consumida.                            |
| `alimentador_2`          | varchar(255) | Alimentador secundario. No consumida.                            |
| `tipo_montaje`           | varchar(100) | No consumida.                                                    |
| `fecha_ps_te`            | date         | No consumida.                                                    |
| `fecha_ps_tc`            | date         | No consumida.                                                    |
| `fecha_retiro`           | date         | No consumida.                                                    |
| `tipo_equipo`            | int(11)      | ✓ FK a `tipo_equipo.id_tipo_equipo` (para obtener el nombre de tipo). |
| `equipo_control`         | int(11)      | No consumida.                                                    |
| `tipo_rgdat`             | int(11)      | No consumida.                                                    |
| `familia_up`             | int(11)      | No consumida.                                                    |
| `frg`                    | varchar(10)  | ✓ Marca FRG. `UPPER(TRIM(frg)) === 'SI'` → equipo FRG.           |
| `fecha_habilitacion_frg` | date         | No consumida.                                                    |
| `telem_hotline`          | varchar(10)  | No consumida.                                                    |
| `fecha_hotline`          | date         | No consumida.                                                    |
| `sistema`                | varchar(255) | No consumida.                                                    |
| `comentario`             | text         | No consumida.                                                    |

**Consulta típica:**
```sql
SELECT UPPER(TRIM(te.nombre)) AS tipo, e.numpos, UPPER(TRIM(e.frg)) AS frg,
       UPPER(TRIM(e.alimentador_1)) AS alim1, UPPER(TRIM(e.subestacion_1)) AS ssee1
FROM equipo e
LEFT JOIN tipo_equipo te ON e.tipo_equipo = te.id_tipo_equipo
WHERE e.estado NOT IN (3, 5)
```

**Notas:**
- La clave del mapa de equipos es `tipo . numpos` (p.ej. `REC123`), usada por `tlcEsTlc()` / `tlcEsFrg()`.
- El resultado se cachea en `data/cache/telecontrol.json` con refresco **mensual** (`tlcRefrescar()`).
  Estructura: `{ generado, mes, equipos{clave:{tlc,frg}}, frg_alim[], frg_ssee[] }`.

---

## `telecontrol_systems.tipo_equipo`

Catálogo de tipos de equipo (7 filas). Se usa solo para traducir `equipo.tipo_equipo` → nombre.

**Metadatos:** ~7 filas · ~0,02 MB · PK `id_tipo_equipo`.

**Uso:** `src/Telecontrol.php` → `tlcRefrescar()` (`LEFT JOIN tipo_equipo te ON e.tipo_equipo = te.id_tipo_equipo`).

| Columna (BD)     | Tipo         | Descripción / uso                                     |
|------------------|--------------|-------------------------------------------------------|
| `id_tipo_equipo` | int(11) PK   | ✓ Clave del JOIN con `equipo.tipo_equipo`.            |
| `nombre`         | varchar(255) | ✓ Nombre del tipo (`UPPER(TRIM(...))` → prefijo de clave). |
