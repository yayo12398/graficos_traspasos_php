# Documentación: `data/aguas_abajo.csv`

Fuente de topología de la red MT. Describe la relación entre transformadores de distribución (TDs) y los equipos que están **aguas arriba** de cada uno, es decir, en el camino desde la subestación hasta el TD.

---

## Resumen

| Dimensión | Valor |
|---|---|
| Filas totales | ~286,000 |
| Alimentadores únicos | 512 |
| TDs únicos | 29,714 |
| Equipos únicos | 20,270 |
| Equipos upstream promedio por TD | 9.6 (mín 1, máx 42) |
| TDs promedio por alimentador | 58 (mín 1, máx 324) |

---

## Estructura de columnas

| Columna | Tipo | Descripción |
|---|---|---|
| `CODIGO_LINEA` | `str` | Código SCADA del alimentador. Formato: `HA10.NNNNN` |
| `NOM_ALIM` | `str` | Nombre corto del alimentador (ej: `GOLF`, `L.PASTEUR`, `NACIONES`) |
| `NUMALIM` | `str` | ID numérico del alimentador (ej: `1511`) |
| `NOMBRE` | `str` | Nombre del TD/TP. Prefijo `TD` = transformador de distribución; `TP` = transformador de potencia de un cliente MT |
| `NUMPOS_TD` | `str` | **Número de posición** del TD en la red SCADA. Es el identificador único del TD |
| `RAMASC_TD` | `str` | Código RAMASC de la posición del TD. Formato: `HA10.2.NNNNNN` |
| `POTENCIA` | `str→float` | Potencia nominal del TD en **kVA** |
| `CNT_CLIE` | `str→int` | Número de clientes conectados al TD |
| `NOMBRE_EQUIP` | `str` | Nombre del equipo aguas arriba. `cabecera` = barra de la SE |
| `NUMPOS_EQUIP` | `str` | Número de posición del equipo. Igual a `NOMBRE_EQUIP` para equipos normales; `cabecera` para la SE |
| `RAMASC_EQUIP` | `str` | Código RAMASC del equipo. `YT00.1.300053` identifica siempre la cabecera (barra SE) |
| `ESTADO_BASAL` | `str` | Estado normal del equipo en topología de operación: `CERRADO` o `NVIAS` |

---

## Modelo de datos — clave conceptual

El nombre del archivo puede inducir a confusión. El modelo correcto es:

> **Para cada TD, el archivo lista TODOS los equipos que están aguas arriba de él**, es decir, los equipos que forman el camino desde la subestación hasta ese TD.

Cada TD tiene **múltiples filas** en el CSV, una por equipo aguas arriba:

```
NOMBRE   NUMPOS_TD   NOMBRE_EQUIP   NUMPOS_EQUIP   RAMASC_EQUIP
TD54471  54471       cabecera       cabecera        YT00.1.300053   ← siempre presente
TD54471  54471       PPF59846       PPF59846        HA10.3.008522
TD54471  54471       DBC73673       DBC73673        HA10.3.031405
TD54471  54471       ORM97368       ORM97368        HA10.2.029586   ← NVIAS (punto de maniobra)
```

Esto significa que el camino desde la SE hasta TD54471 pasa por `PPF59846`, `DBC73673` y `ORM97368`.

---

## Tipos de equipos (`NOMBRE_EQUIP`)

| Prefijo | Cant. equipos | Tipo | CN relevante para VCC |
|---|---|---|---|
| `cabecera` | — | Barra de la SE (cabecera del alimentador) | — |
| `CLB` | ~99,000 filas | Equipo de maniobra subterráneo | No |
| `DBC` | ~85,000 filas | Equipo subterráneo (interruptor/seccionador) | Opcional |
| `PPF` | ~34,000 filas | Poste de fusible (seccionador aéreo) | No |
| **`REC`** | ~23,000 filas | **Reconectador** (automático, aéreo) | **Sí** |
| `ABB` | ~3,000 filas | Equipo subterráneo ABB (puede tener límite de I) | Opcional |
| `ORM` | ~2,500 filas | Equipo subterráneo | Opcional |
| `SCH` | ~2,000 filas | Equipo subterráneo | Opcional |
| `SEM` | ~1,500 filas | Equipo de maniobra | No |
| **`RTS`** | ~750 filas | **Reconectador** tipo RTS | **Sí** |
| `RTB` | ~480 filas | Reconectador tipo RTB | Sí |
| `CGP`, `G`, `GLM`, `GLT`, `GMT`, `GRM` | < 900 c/u | Equipos varios | Condicional |
| `IGD`, `SEC`, `TRA`, `UD`, `VIS` | < 300 c/u | Equipos varios | No |

> **Para VCC**: los reconectadores relevantes son `REC` y `RTS`. Los equipos subterráneos `DBC`, `ABB`, `ORM`, `SCH` pueden tener límite de corriente y se les permite ingresar CN de forma opcional.

---


## Estado basal
| Valor | Significado |
|---|---|
| `CERRADO` | El equipo está normalmente cerrado: la corriente pasa por él en condición normal |
| `NVIAS` | Equipo normalmente abierto: es un punto de maniobra o enlace entre alimentadores. Solo se cierra para seccionalizar una falla o reconectar en emergencia |

Los TDs con un equipo `NVIAS` upstream son TDs que tienen un camino alternativo por otro alimentador.

---

## Códigos RAMASC

Identificadores de posición en la red SCADA de formato `XX00.N.NNNNNN`:

| Patrón | Elemento |
|---|---|
| `YT00.1.300053` | Siempre la cabecera (barra de subestación) |
| `HA10.3.NNNNNN` | Equipos (seccionadores, reconectadores) — nivel 3 |
| `HA10.2.NNNNNN` | TDs y otros equipos — nivel 2 |

El campo `RAMASC_TD` identifica unívocamente la posición del TD en la red. El `RAMASC_EQUIP` identifica la posición del equipo aguas arriba.

---

## Tipos de TD (`NOMBRE`)

- **`TD<numpos>`**: Transformador de Distribución — sirve a clientes BT residenciales/comerciales
- **`TP<numpos>`**: Transformador de Potencia de cliente — un cliente MT que instaló su propio transformador y se conecta directamente al alimentador

---

## Consultas frecuentes sobre el archivo

### TDs únicos de un alimentador
Filtrar `NOMBRE_EQUIP == 'cabecera'` y hacer `drop_duplicates('NUMPOS_TD')`.
Equivalente: cada TD tiene exactamente una fila de tipo cabecera.

```python
mask = (df['nom_alim'].str.upper() == 'GOLF') & (df['nombre_equip'] == 'cabecera')
tds = df[mask].drop_duplicates('numpos_td')
```

### Equipos aguas abajo de un equipo E
Filtrar `NOMBRE_EQUIP == E` y hacer `drop_duplicates('NUMPOS_TD')`.

```python
mask = df['numpos_equip'] == 'REC112319'
tds_abajo = df[mask].drop_duplicates('numpos_td')
```

### Equipos upstream del punto de conexión de un cliente (VCC)

**Si se conoce el numpos del equipo inmediatamente upstream (`E`):**
Calcular la **intersección** de los conjuntos de equipos upstream de todos los TDs que tienen `E` como upstream. El resultado son exactamente los equipos en el camino desde la SE hasta E (inclusive).

```python
tds_via_E = df[df['numpos_equip'] == E]['numpos_td'].unique()
sets = [set(df[df['numpos_td'] == td]['numpos_equip']) for td in tds_via_E]
upstream_E = sets[0].intersection(*sets[1:])  # equipos entre SE y E
```

**Si se conoce el numpos del TP del cliente (ya existente en la red):**
Lookup directo: todas las filas con ese `NUMPOS_TD`.

```python
upstream_tp = set(df[df['numpos_td'] == numpos_tp]['numpos_equip'])
```

---

## Carga en Python (`datos.py`)

```python
df = datos.cargar_aguas_abajo("data/aguas_abajo.csv")
# Columnas normalizadas: nom_alim, nombre, numpos_td, potencia, clientes,
#                        nombre_equip, numpos_equip, ramasc_equip, estado_basal
```

El módulo `datos.py` normaliza automáticamente los nombres de columnas a minúsculas y renombra `CNT_CLIE` → `clientes`. La carga usa caché PKL en `data/cache/aguas_abajo.pkl` (invalidada si el CSV es más nuevo).
