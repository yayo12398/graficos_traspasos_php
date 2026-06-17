# Tabla `meyg.maniobras_rapidas_limite_zona`

## Propósito

Define los **límites de zona físicos** que restringen los traspasos de carga entre alimentadores. A diferencia de la topología general (aguas abajo), esta tabla determina hasta qué punto físico de la red puede llegar un traspaso, respetando los seccionadores designados como límite de zona.

---

## Estructura de columnas

| Columna | Tipo | Descripción |
|---|---|---|
| `NOMBRE_alim_LZ` | string | Nombre del alimentador **origen** (el que cede carga) |
| `NUMALIM_LZ` | int | NUMALIM del alimentador origen |
| `RAMASC_LZ` | string | Código de la rama/seccionador que actúa como **límite de zona físico** en el origen |
| `NUMPOS_LZ` | string | Identificador del dispositivo de corte en ese punto (`0` = cabecera/troncal principal; cualquier otro valor = código de disyuntor o seccionador específico, ej. `DBC108457`) |
| `RAMASC_troncal` | string | Código del troncal del alimentador **receptor** por donde puede entrar la carga |
| `NUMPOS_troncal` | string | Posición/nombre de un equipo en el troncal del receptor (`cabecera` u otro código de equipo) |
| `NOMBRE_troncal` | string | Nombre descriptivo del troncal receptor |
| `NOM_ALIM` | string | Nombre del alimentador **receptor** (el que recibe la carga) |
| `NUMALIM` | int | NUMALIM del alimentador receptor |
| `equip_alim` | string | Clave interna compuesta: concatenación de `RAMASC_troncal` + `NOM_ALIM` |

---

## Cómo leer una fila

Cada fila responde a la pregunta:

> *"¿Por dónde puede entrar carga al receptor, y hasta dónde puede llegar en el origen?"*

```
[NOMBRE_alim_LZ] puede traspasar carga hacia [NOM_ALIM],
entrando por el troncal [RAMASC_troncal] del receptor,
limitado físicamente por el seccionador [RAMASC_LZ]
ubicado en la posición [NUMPOS_LZ] del origen.
```

**Ejemplo concreto:**

| Campo | Valor | Interpretación |
|---|---|---|
| `NOMBRE_alim_LZ` | `LAS.ESTERA` | Origen: Las Estera cede carga |
| `NUMALIM_LZ` | `1412` | NUMALIM de Las Estera |
| `RAMASC_LZ` | `HA10.4.030655` | Seccionador LZ en Las Estera |
| `NUMPOS_LZ` | `0` | Está en el troncal principal (posición 0) |
| `RAMASC_troncal` | `HA10.3.005039` | Troncal de S.IGNACIO por donde entra la carga |
| `NUMPOS_troncal` | `CLB104708` | Equipo en ese troncal del receptor |
| `NOM_ALIM` | `S.IGNACIO` | Receptor: San Ignacio recibe la carga |
| `NUMALIM` | `3214` | NUMALIM de San Ignacio |

---

## Relación entre filas: un par puede tener muchas filas

Un mismo par origen→receptor genera **múltiples filas**, una por cada equipo del troncal del receptor. La cantidad depende de la complejidad de la red del receptor.

| Par | Filas (equipos de troncal) |
|---|---|
| CHORRILLOS → NOVICIADO (por DBC107315) | 10 |
| EL_TRANQUE → COMENDADOR (por HA10.4.050714) | 14 |

Además, **un mismo par puede tener múltiples RAMASC_LZ**, es decir, múltiples puntos de corte físico posibles. Cada combinación `(NUMALIM_LZ, NUMALIM, RAMASC_LZ)` es un escenario de traspaso distinto.

---

## El campo `NUMPOS_LZ`: el dispositivo de corte

Es el campo que identifica **dónde físicamente** está el límite de zona en el alimentador origen.

| Valor | Significado |
|---|---|
| `0` | El LZ está en la cabecera o en el troncal principal (sin dispositivo intermedio nombrado) |
| `DBC######` | Disyuntor de baja capacidad en ese punto del ramal |
| `CLB######` | Seccionador en línea (cuchilla) en ese punto |
| `ORM######` | Otro tipo de dispositivo de maniobra |
| `ATR_#####` | Autotransformador en ese punto |
| `PPF#####` | Punto de fusible |
| `TD####` | Transformador de distribución en ese punto |

Cuando `NUMPOS_LZ = 0`, el límite no está condicionado por un dispositivo intermedio específico: el traspaso usa el troncal completo hasta la cabecera del ramal.

---

## El campo `NUMPOS_troncal`: viabilidad del traspaso

Este campo lista los equipos que están en el camino troncal entre el dispositivo LZ y la **cabecera del alimentador receptor**. Es el campo clave para determinar si un traspaso es físicamente viable.

### Valores posibles

| Valor | Significado |
|---|---|
| `cabecera` | La fila representa la conexión directa a la cabecera del receptor |
| `DBC######`, `CLB######`, `REC######`, etc. | Un equipo real en el camino troncal hacia la cabecera |

### Determinación de viabilidad

Un traspaso a través de un dispositivo LZ es **viable** si existe al menos un equipo distinto de `cabecera` en el troncal del receptor:

```
n_troncal = count(NUMPOS_troncal WHERE valor != 'cabecera', agrupado por (NUMPOS_LZ, NUMALIM))
viable    = (n_troncal > 0)
```

**Caso no viable:** Si todas las filas de un par `(NUMPOS_LZ, NUMALIM)` tienen `NUMPOS_troncal = 'cabecera'`, significa que el LZ conecta directamente en la cabecera del receptor, sin troncal intermedio. El traspaso **no tiene recorrido físico posible** y se deshabilita en la interfaz (visible pero no seleccionable).

**Perspectiva:** La viabilidad se evalúa siempre desde el alimentador **receptor** (`NUMALIM`), no desde el origen.

---

## Estructura de datos en Python (`datos.py`)

```python
# SQL: se consulta SIN DISTINCT para obtener todas las filas de NUMPOS_troncal
df_raw = _sql_query(conn,
    "SELECT NUMALIM_LZ, NUMALIM, NUMPOS_LZ, NUMPOS_troncal "
    "FROM meyg.maniobras_rapidas_limite_zona")

# Mapa: (NUMPOS_LZ str, NUMALIM int) → lista de equipos no-cabecera
troncal_map: dict[tuple, list[str]] = {}
for (numpos, nm), grp in df_raw.groupby(["NUMPOS_LZ", "NUMALIM"], sort=False):
    no_cab = [t for t in grp["NUMPOS_troncal"].dropna().unique()
              if t.lower() != "cabecera"]
    troncal_map[(str(numpos), int(float(nm)))] = no_cab

# Cada registro del df_lz final incluye:
# viable: bool       — True si n_troncal > 0
# n_troncal: int     — cantidad de equipos no-cabecera en el troncal receptor
# equipos_troncal: list[str]  — nombres de esos equipos
```

---

## Clasificación de equipos del troncal

Los equipos que aparecen en `NUMPOS_troncal` se clasifican por prefijo para identificar riesgos operacionales:

| Prefijo(s) | Tipo | Observación en la interfaz |
|---|---|---|
| `ABB`, `G33`, `ORM`, `SCH`, `GMT`, `VIS`, `CGP`, `GLT` | Subterráneo | 3 ramas — verificar cuál operar |
| `DBC`, `PPF`, `CLB` | Aéreo seccionador | — |
| `REC` | Reconectador | Equipo de protección — puede disparar ante sobrecarga |
| `REG` | Regulador de tensión | No maniobrable |

Los **reconectadores (`REC`)** se destacan en rojo en la interfaz y en el reporte HTML, ya que ante sobrecarga pueden disparar automáticamente.

---

## Asimetría de la tabla

La relación origen→receptor **no es simétrica**. Un par puede tener más filas en un sentido que en el otro, dependiendo de cuántos ramales del origen tienen LZ definido hacia ese receptor.

**Ejemplo extremo — EL_TRANQUE ↔ COMENDADOR:**

| Dirección | RAMASC_LZ distintos | Equipos troncal (total filas) |
|---|---|---|
| EL_TRANQUE → COMENDADOR | 63 | ~750 |
| COMENDADOR → EL_TRANQUE | 2 | ~12 |

EL_TRANQUE tiene una red muy ramificada con cada ramal definiendo su propio LZ hacia COMENDADOR. COMENDADOR, en cambio, solo tiene 2 puntos de corte definidos hacia EL_TRANQUE.

---

## Llave de consulta recomendada

Para obtener todos los escenarios de traspaso posibles para un par de alimentadores:

```sql
SELECT *
FROM meyg.maniobras_rapidas_limite_zona
WHERE NUMALIM_LZ = <origen>
  AND NUMALIM    = <receptor>
ORDER BY RAMASC_LZ, RAMASC_troncal;
```

Para obtener todos los receptores posibles desde un origen dado (incluyendo equipos de troncal):

```sql
SELECT NUMALIM_LZ, NUMALIM, NUMPOS_LZ, NUMPOS_troncal
FROM meyg.maniobras_rapidas_limite_zona
WHERE NUMALIM_LZ = <origen>
ORDER BY NUMALIM, NUMPOS_LZ;
```

> **Importante:** No usar `DISTINCT` si se necesita `NUMPOS_troncal`, ya que hay múltiples filas por equipo troncal para un mismo par `(NUMPOS_LZ, NUMALIM)`.

---

## Uso en el endpoint `/api/vecinos_lz/{numalim}`

El endpoint devuelve para cada dispositivo LZ del alimentador consultado:
- Lista de vecinos con `viable`, `n_troncal`, `equipos_troncal` (perspectiva del vecino como receptor)
- `equipos_troncal_orig`: equipos en el troncal del **origen** (perspectiva del alimentador consultado)

El campo `equipos_troncal_orig` se usa en el frontend para verificar si el equipo que abre la isla está incluido en ese troncal, indicando si el LZ es el punto de corte esperado para ese traspaso.

---

## Ejemplos de los tres alimentadores analizados

### NOVICIADO (2813) — 2 orígenes

| Origen | RAMASC_LZ | NUMPOS_LZ | Equipos troncal receptor |
|---|---|---|---|
| CHORRILLOS (2834) | HA10.3.012817 | DBC107316 | 9 |
| CHORRILLOS (2834) | HA10.3.004599 | DBC107315 | 10 |
| ANTILLANCA (2841) | HA10.2.033087 | ORM110705 | 8 |
| ANTILLANCA (2841) | HA10.3.027866 | DBC112220 | 4 |

### S.IGNACIO (3214) — 2 orígenes

| Origen | RAMASC_LZ | NUMPOS_LZ | Equipos troncal receptor |
|---|---|---|---|
| LAS.ESTERA (1412) | HA10.4.030655 | 0 | 3 |
| LAS.ESTERA (1412) | HA10.3.005044 | CLB52547 | 3 |
| LAUTARO (3212) | HA10.3.031883 | DBC115205 | 7 |

### COMENDADOR (5721) — 9 orígenes

| Origen | RAMASC_LZ distintos | NUMPOS_LZ | Equipos troncal receptor |
|---|---|---|---|
| EL_TRANQUE (5731) | 63 | 0 / varios | ~750 |
| ASCOTAN (5723) | 2 | DBC110182, DBC110248 | 14 |
| VIZCAYA (5734) | 1 | DBC102439 | 18 |
| EL_VALLE (5715) | 1 | DBC112116 | 17 |
| SERRANO (5712) | 1 | DBC108968 | 10 |
| S.PABLO (2032) | 1 | DBC108457 | 12 |
| RODAS (442) | 1 | DBC108720 | 13 |
| SAN PEDRO (5714) | 1 | DBC108966 | 5 |
| ENEA (5722) | 1 | DBC107455 | 3 |
