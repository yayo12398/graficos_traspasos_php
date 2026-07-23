# Integración: Base de Equipos Telecontrolados y FRG

Documentación técnica para integrar las fuentes de datos de telecontrol y FRG
(`telecontrol_systems` MySQL) a un flujo de trabajo externo.

---

## 1. Visión general

El sistema mantiene dos catálogos extraídos desde la base de datos `telecontrol_systems`:

| Catálogo | Propósito | Archivo generado |
|---|---|---|
| **Telecontrol** | Todos los equipos activos de la red (reclosers, interruptores, seccionadores...) con su estado, subestación y alimentador | `telecontrol/YYYYMM_telecontrol.xlsx` |
| **FRG** | Subconjunto de equipos habilitados para Falla Remota Gestionada (FRG=SI) | `referencia/Informe Esquema FRG 1.xlsx` (hoja `Alim FRG`) |

Ambos catálogos son **estáticos por mes**: se extraen una vez y se reusan para todos los análisis del mismo período. El FRG se actualiza cuando el archivo es anterior al 1° del mes analizado.

---

## 2. Prerequisitos

### 2.1 Dependencias Python

```
pandas
sqlalchemy
pymysql
xlsxwriter
openpyxl
```

### 2.2 Configuración `config.ini`

Ambas funciones de extracción leen la sección `[mysql_cuadrilla]`:

```ini
[mysql_cuadrilla]
host     = <host>
user     = <usuario>
password = <contraseña>
```

La conexión apunta a la base de datos `telecontrol_systems` (no a cuadrilla, a pesar del nombre de la sección).

---

## 3. Módulo de extracción

**Archivo:** `extraccion/extraer_telecontrol.py`  
**Import:** `from extraccion.extraer_telecontrol import extraer_telecontrol, extraer_frg`  
**Import (standalone):** `from extraccion import extraer_telecontrol, extraer_frg`

### 3.1 `extraer_telecontrol(anio, mes, out_dir=None, cfg_path=None) → str`

Extrae el catálogo completo de equipos activos (estados 3 y 5 excluidos).

```python
ruta = extraer_telecontrol(2025, 6)
# → telecontrol/202506_telecontrol.xlsx
```

**Parámetros:**

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `anio` | int | — | Año del período |
| `mes` | int | — | Mes del período (1-12) |
| `out_dir` | str | `<raíz>/telecontrol/` | Carpeta de destino |
| `cfg_path` | str | `<raíz>/config.ini` | Ruta al config |

**Retorna:** ruta absoluta al `.xlsx` generado.

**SQL ejecutada** (tabla principal: `telecontrol_systems.equipo`):

```sql
SELECT e.numpos, UPPER(te.nombre) AS Tipo, UPPER(e.frg) AS FRG,
       e.alias, e.subestacion_1, e.alimentador_1, e.subestacion_2, e.alimentador_2,
       e.fecha_ps_tc AS `Fecha instalación`, UPPER(ts.estado) AS Estado,
       e.sistema, c.nombre AS Comuna, UPPER(tec.nombre) AS Equipo_control
FROM telecontrol_systems.equipo e
LEFT JOIN tipo_equipo te ON e.tipo_equipo = te.id_tipo_equipo
LEFT JOIN tipo_estados ts ON e.estado = ts.id_estado
LEFT JOIN comunas c ON e.comuna = c.id_comuna
LEFT JOIN tipo_equipo_control tec ON e.equipo_control = tec.id_equipo_control
WHERE e.estado NOT IN (3, 5)
ORDER BY e.subestacion_1, e.alimentador_1, e.numpos
```

**Columnas del archivo resultante:**

| Columna | Tipo | Descripción |
|---|---|---|
| `Fecha telecontrol` | datetime | Primer día del mes analizado (inserida por código) |
| `Numpos` | int | Número de posición del equipo |
| `FRG` | str | `'SI'` o `'NO'` |
| `Tipo` | str | Tipo de equipo: `REC`, `INT`, `SECC`, etc. |
| `Alias` | str | Descripción/dirección del equipo |
| `Subestación 1` | str | Subestación primaria |
| `Alimentador 1` | str | Alimentador primario |
| `Subestación 2` | str | Subestación secundaria (puede ser NULL) |
| `Alimentador 2` | str | Alimentador secundario (puede ser NULL) |
| `Fecha instalación` | datetime | Fecha puesta en servicio (NaT si `0000-00-00`) |
| `Estado` | str | Estado operacional del equipo |
| `Sistema` | str | Sistema al que pertenece |
| `Comuna` | str | Comuna de ubicación |
| `Equipo_control` | str | Marca/modelo del equipo de control |

---

### 3.2 `extraer_frg(out_path=None, cfg_path=None) → str`

Extrae solo los equipos con `FRG = 'SI'` y genera el archivo compatible con la función de marcado.

```python
ruta = extraer_frg()
# → referencia/Informe Esquema FRG 1.xlsx  (hoja: "Alim FRG")
```

**Parámetros:**

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `out_path` | str | `<raíz>/referencia/Informe Esquema FRG 1.xlsx` | Ruta de destino |
| `cfg_path` | str | `<raíz>/config.ini` | Ruta al config |

**Retorna:** ruta absoluta al `.xlsx` generado. Invalida automáticamente el caché `.pkl` si existía.

**Columnas del archivo resultante** (hoja `Alim FRG`):

| Columna | Descripción |
|---|---|
| `SUBESTACION` | Subestación del equipo |
| `NUMPOS` | Número de posición |
| `LINEA MT` | NULL (sin datos en la BD actual) |
| `NUMALIM` | Número de alimentador (join con tabla `alimentadores`) |
| `ALIMENTADOR` | Nombre del alimentador |
| `TIPO` | Tipo de equipo (REC / INT / SECC) |
| `EQUIPO` | Identificador compuesto: `TIPO + NUMPOS` (ej. `REC123`) |
| `MARCA` | Nombre del equipo de control |
| `DIRECCION` | Alias/dirección del equipo |
| `COMUNA` | Comuna |
| `EQUIPO MODELO` | `TIPO+NUMPOS + marca` |
| `EQUIPO DIRECCION` | `TIPO+NUMPOS + alias` |
| `SSEE` | NULL (reservado) |
| `POSICION` | = SUBESTACION |
| `ALIM` | = ALIMENTADOR |

> **Nota:** `NUMALIM` puede ser NULL si el nombre del alimentador no tiene match exacto (case-insensitive, trim) en la tabla `alimentadores`.

---

## 4. Carga en un flujo externo

### 4.1 Carga mínima del catálogo telecontrol

```python
import pandas as pd

df_tlc = pd.read_excel("telecontrol/202506_telecontrol.xlsx")

# Normalización mínima necesaria:
df_tlc.columns = df_tlc.columns.astype(str).str.strip()
df_tlc["Equipo_ID"] = df_tlc["Tipo"].astype(str) + df_tlc["Numpos"].astype(str)
# Equipo_ID es la clave de join con NOM_EXTREMO_1 / NOMBRE_1ER_EXTREMO en RETIM
```

**Columnas obligatorias:** `Numpos`, `FRG`, `Tipo`  
**Columnas recomendadas:** `Equipo_control`, `Alias`, `Estado`, `Subestación 1`, `Alimentador 1`

El campo `Equipo_ID` (`Tipo + Numpos`) es la clave para cruzar con los datos RETIM. En el flujo principal la columna RETIM que lo referencia es `NOM_EXTREMO_1` (o `NOMBRE_1ER_EXTREMO` según hoja).

### 4.2 Carga del catálogo FRG

```python
frg = pd.read_excel("referencia/Informe Esquema FRG 1.xlsx", sheet_name="Alim FRG")
frg.columns = [c.strip().upper() for c in frg.columns]

# Filtrar solo tipos válidos
frg = frg[frg["TIPO"].isin(["REC", "INT", "SECC"])]

# Normalizar strings
for col in ["EQUIPO", "ALIMENTADOR", "SUBESTACION"]:
    frg[col] = frg[col].astype(str).str.strip().str.upper()

equipos_frg       = set(frg["EQUIPO"])        # ej. {"REC123", "INT45"}
alimentadores_frg = set(frg["ALIMENTADOR"])    # ej. {"L1234", "L5678"}
subestaciones_frg = set(frg["SUBESTACION"])    # ej. {"SSEE_X"}
```

### 4.3 Marcar filas con FRG en cualquier DataFrame RETIM

La lógica de marcado usa OR entre tres niveles (equipo > alimentador > subestación):

```python
def marcar_frg(df, equipos_frg, alimentadores_frg, subestaciones_frg):
    def col(nombre):
        if nombre in df.columns:
            return df[nombre].astype(str).str.strip().str.upper()
        return pd.Series("", index=df.index)

    df["TIENE_FRG"] = (
        col("NOMBRE_1ER_EXTREMO").isin(equipos_frg) |
        col("ALIMENTADOR").isin(alimentadores_frg) |
        col("SUBESTACION").isin(subestaciones_frg)
    )
    return df
```

> Las columnas `ALIMENTADOR` y `SUBESTACION` son opcionales: si no existen en el DataFrame, la condición se trata como False sin lanzar error.

---

## 5. Caching `.pkl`

Ambos archivos `.xlsx` tienen un sistema de caché automático en `cargar_validar_datos.py`:
- Primer uso: lee el `.xlsx` y genera un `.pkl` paralelo.
- Usos posteriores: usa el `.pkl` si es más reciente o igual que el `.xlsx`.
- `extraer_frg()` invalida el `.pkl` automáticamente al regenerar el `.xlsx`.

Para uso externo, si lees el `.xlsx` directamente con `pd.read_excel()` el caché no aplica. Para activarlo, puedes replicar `_leer_excel_hoja_con_cache()` de `cargar_validar_datos.py`.

---

## 6. Ejecución standalone

El módulo puede ejecutarse directamente para extraer ambos catálogos:

```bash
# Extrae telecontrol y FRG para el mes indicado
python extraccion/extraer_telecontrol.py 2025 6

# Equivalente desde raíz del proyecto
python -m extraccion.extraer_telecontrol 2025 6
```

Si se omiten los argumentos usa año y mes del día actual.

---

## 7. Resumen de join keys

```
telecontrol["Equipo_ID"]         →  join →  retim["NOM_EXTREMO_1"]
                                              retim["NOMBRE_1ER_EXTREMO"]

frg["EQUIPO"]                    →  join →  retim["NOMBRE_1ER_EXTREMO"]  (nivel 1)
frg["ALIMENTADOR"]               →  join →  retim["ALIMENTADOR"]          (nivel 2)
frg["SUBESTACION"]               →  join →  retim["SUBESTACION"]          (nivel 3)
```

El `Equipo_ID` es **siempre** `Tipo.upper() + str(Numpos)` (sin separador, sin espacios).
Ejemplo: tipo `REC`, numpos `123` → `Equipo_ID = "REC123"`.

---

## 8. Archivos relevantes

| Archivo | Rol |
|---|---|
| `extraccion/extraer_telecontrol.py` | Extracción MySQL → xlsx |
| `cargar_validar_datos.py::cargar_datos_mensual()` | Carga xlsx + normalización + Equipo_ID |
| `utils.py::cargar_y_preparar_frg()` | Carga FRG xlsx → 3 sets |
| `utils.py::marcar_maniobras_con_frg()` | Agrega columna TIENE_FRG al DataFrame RETIM |
| `main.py` L.155-243 | Orquestación completa: auto-extracción + carga + marcado |
| `extraccion/__init__.py` | Re-exporta `extraer_telecontrol` y `extraer_frg` |
