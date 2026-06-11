# Graficos Traspasos — Documentación PHP

> Versión PHP 8.5.6 del sistema interno ENEL Chile para analizar traspasos de carga MT.
> Migrado desde Python/Flask. Backend MySQL sin cambios. Frontend Bootstrap 5 + Chart.js sin cambios.

---

## Estructura de archivos

```
graficos_traspasos_php/
├── codigo_php/
│   ├── index.php              ← Router REST principal (~1250 líneas)
│   ├── config.php             ← Credenciales MySQL (no commitear)
│   ├── web.config             ← Rewrite rules para IIS
│   ├── .htaccess              ← Rewrite rules para Apache
│   ├── src/
│   │   ├── Datos.php          ← Conexión PDO + carga de datos + caché
│   │   ├── Simulacion.php     ← Cálculo del traspaso de carga
│   │   ├── Matching.php       ← Normalización de nombres de alimentadores
│   │   ├── Memoria.php        ← Feeders en comisionamiento (JSON en disco)
│   │   ├── Ajustes.php        ← Ajustes manuales de demanda
│   │   ├── Vcc.php            ← Validación de Conexión de Cliente
│   │   └── Reportes.php       ← Generación de reportes HTML
│   ├── templates/
│   │   └── index.html         ← SPA (4363 líneas, Bootstrap 5 + Chart.js)
│   ├── data/
│   │   ├── cache/             ← Caché PHP serialize (.ser)
│   │   ├── reportes/          ← HTML generados por /api/simular
│   │   └── ajustes_demanda.json
│   └── feeders_nuevos/        ← JSON por feeder en comisionamiento
└── DOCUMENTACION.md           ← Este archivo
```

---

## Cómo iniciar el servidor local

```powershell
$php = "C:\Users\cl196792678\OneDrive - Enel Spa\Programation\00_SQL_PHP\PHP_856\php.exe"
$app = "C:\Users\cl196792678\OneDrive - Enel Spa\Programation\00_SQL_PHP\PHP_tests\graficos_traspasos_php\codigo_php"
& $php -S localhost:8093 -t $app "$app\index.php"
# Detener: Ctrl+C
```

Abrir en navegador: `http://localhost:8093`

---

## Despliegue en servidor corporativo (IIS)

- URL destino: `http://ewaahicdca00.enelint.global:8084/AMEyAO/<subcarpeta>/`
- Requiere módulo **URL Rewrite** instalado en IIS y PHP configurado como FastCGI.
- El `web.config` ya incluido redirige todo al `index.php`.
- El `index.php` detecta automáticamente el `$_basePath` desde `SCRIPT_NAME` y lo inyecta como shim de `window.fetch` en el HTML, sin necesitar cambios en el frontend.

---

## Módulos PHP

### `src/Datos.php`

Fuente de verdad de datos. Equivalente de `datos.py`.

| Función | Descripción |
|---|---|
| `datosConectar()` | Retorna PDO conectado a MySQL `meyg` |
| `cargarAguasAbajo()` | Carga topología MT desde `maniobras_rapidas_aguas_abajo`. Caché 7 días |
| `cargarDemandas()` | Retorna `[$dfAlim, $dfTrafo]` wide-keyed por numalim. Caché 30 días |
| `gd()` | Helper: llama a ambas funciones de carga y retorna `['dfAb', 'dfAlim', 'dfTrafo']` |
| `pivotarAlim()` | Convierte `$dfAlim` a array indexado por nombre normalizado |
| `trafoDeFeeder()` | Busca fila del trafo asociado a un numalim de alimentador |
| `obtenerSerieAlim()` | Retorna `['cn' => float, 'serie' => ['YYYY-MM' => float]]` para un numalim |
| `deltaAcumulado()` | Suma delta de corriente de todas las transferencias de un feeder nuevo |

**Caché:** archivos `.ser` (PHP serialize) en `data/cache/`. Más rápido que JSON para arrays grandes.

---

### `src/Simulacion.php`

Cálculo del impacto del traspaso. Equivalente de `simulacion.py`.

| Función | Descripción |
|---|---|
| `infoIsla(tds, nomAlimOrigen, dfAb)` | kVA_isla, kVA_feeder, fracción `p`, detalle TDs |
| `calcularDelta(serieOrig, serieDest, p, isla)` | ΔI máximo [A] y mes peor caso |
| `simular(serieOrig, serieDest, cnOrig, cnDest, p)` | Tabla mensual escenario conservador |
| `simularMesAMes(serieOrig, serieDest, cnOrig, cnDest, p)` | Tabla mensual proporcional |
| `analizarTrafo(trafoRow, deltaMax, modo, umbral, mesesSel)` | Impacto sobre trafo AT/MT |
| `analizarTrafoMesAMes(trafoRow, serieDeltas, modo, umbral, mesesSel)` | Impacto mes a mes |
| `resumenEstados(tabla)` | Conteo viable/prealerta/critico + mes más crítico |
| `filtrarMeses(tabla, mesesSel)` | Filtra tabla por lista de meses seleccionados |
| `aplicarAjustesFila(row, tipo, numalim)` | Reemplaza valores de la fila con ajustes manuales |

**Estados:** `viable` (≤80%), `prealerta` (80–100%), `critico` (>100%).

---

### `src/Matching.php`

Normalización de texto para búsqueda y slugs. Equivalente de `matching.py`.

| Función | Descripción |
|---|---|
| `normalizar(s)` | NFKD + sin tildes + sin prefijos ALIM./TR. + mayúsculas |
| `slugFeeder(s)` | Slug para nombre de archivo: `"Alim. Los Aromos 2"` → `"LOS_AROMOS_2"` |

---

### `src/Memoria.php`

Persistencia de feeders en comisionamiento (nuevos). Equivalente de `memoria.py`.

Cada feeder se guarda como `feeders_nuevos/<SLUG>.json` con estructura:
```json
{
  "nombre": "NUEVO_ALIM",
  "cn": 400.0,
  "numalim_trafo": null,
  "nota": "",
  "cambios_topologicos": [],
  "transferencias": []
}
```

| Función | Descripción |
|---|---|
| `listarFeeders()` | Lista feeders guardados en disco |
| `cargarFeeder(nombre)` | Lee JSON de un feeder |
| `guardarFeeder(data)` | Escribe JSON (crea directorio si falta) |
| `actualizarFeeder(nombre, campos)` | Merge parcial de campos |
| `eliminarFeeder(nombre)` | Borra el archivo JSON |
| `agregarTransferencia(nombre, transferencia)` | Append a `transferencias[]` |
| `eliminarTransferencia(nombre, idx)` | Elimina por índice |
| `agregarCambioTopologico(nombre, cambio)` | Append a `cambios_topologicos[]` |
| `eliminarCambioTopologico(nombre, idx)` | Elimina por índice |

---

### `src/Ajustes.php`

Corrección manual de valores anómalos en series históricas. Equivalente de `ajustes.py`.

Persistencia en `data/ajustes_demanda.json`:
```json
{
  "alim":  {"12345": {"2024-01": 320.5}},
  "trafo": {"12345": {"2024-01": 180.0}}
}
```

| Función | Descripción |
|---|---|
| `getAjustes(tipo, numalim)` | Lee ajustes activos para un alimentador/trafo |
| `setAjustes(tipo, numalim, cambios)` | Guarda/actualiza ajustes. `null` elimina el mes |
| `eliminarAjuste(tipo, numalim, mes)` | Elimina un mes específico |
| `serieRawDeFila(row)` | Extrae la serie mensual cruda de una fila de DataFrame (antes de ajustes) |
| `aplicarAjustesFila(row, tipo, numalim)` | Aplica ajustes sobre la fila |

---

### `src/Vcc.php`

Validación de Conexión de Cliente (VCC). Equivalente de `vcc.py`.

Calcula el impacto de conectar un nuevo cliente MT sobre el FU del alimentador, del trafo AT/MT, y de los equipos upstream (reconectadores, equipos subterráneos).

| Función | Descripción |
|---|---|
| `deltaICliente(kva, tensionKv)` | Convierte kVA → ΔI [A] (FP=1, trifásico) |
| `tipoEquipo(nombre)` | Clasifica: `cabecera`, `reconectador`, `equipo_sub`, `otro` |
| `buscarPuntoConexion(dfAb, nomAlim, numpos)` | Upstream desde un numpos: lista de equipos hacia cabecera |
| `_vccClasificarUpstream(dfAb, nomAlim, numpos)` | Igual que anterior, con tipo y CN clasificada |
| `calcularFraccionReco(dfAb, nomAlim, numpos, nombreReco)` | Fracción de TDs aguas abajo de un reconectador |
| `enriquecerUpstreamConFraccion(dfAb, nomAlim, upstream)` | Agrega fraccion, kva_down, tds_* a cada equipo upstream |
| `calcularVcc(dfAlim, numalim, trafoRow, deltaI, mesesSel, dtA, dtPct)` | Tablas de impacto sobre alim y trafo |
| `evaluarEquipos(upstream, deltaI, cnAlim, serieAlim, mesesSel)` | Evalúa cada equipo upstream con ΔI proporcional a fracción |
| `guardarEvaluacion(nomAlim, numalim, cnAlim, data)` | Persiste evaluación VCC en `data/vcc/<SLUG>.json` |
| `cargarEvaluaciones(nomAlim)` | Lista evaluaciones de un alimentador |
| `eliminarEvaluacion(nomAlim, idx)` | Elimina evaluación por índice |
| `listarAlimsConVcc()` | Lista todos los alimentadores con evaluaciones guardadas |

**Prefijos reconectadores:** `REC`, `RTS`, `RTB`  
**Prefijos equipos sub.:** `DBC`, `ABB`, `ORM`, `SCH`, `CLB`

---

### `src/Reportes.php`

Generación de reportes HTML para descarga. Equivalente de `reportes.py`.

| Función | Descripción |
|---|---|
| `generarReporteHtml(data, slug)` | Genera HTML con tabla de simulación y lo guarda en `data/reportes/<slug>.html` |
| `generarReporteVccHtml(data, slug)` | Genera HTML del reporte VCC |

Sanitización: todos los datos externos pasan por `_h()` (equivalente a `html.escape()` de Python) para prevenir XSS.

---

## Fórmulas de cálculo

### Proporción de carga (p)
```
kVA_isla  = suma de potencia de los TDs seleccionados (kVA)
kVA_alim  = suma de potencia de TODOS los TDs únicos del alimentador origen (kVA)
p         = kVA_isla / kVA_alim
```

### Escenario conservador (delta fijo)
```
delta_I[mes] = I_origen[mes] × p        (para los meses seleccionados)
delta_max    = max(delta_I)
mes_peor     = mes donde delta_I es máximo

I_orig_post[mes] = max(0, I_orig[mes] − delta_max)
I_dest_post[mes] =        I_dest[mes] + delta_max
uso_dest_pct[mes] =       I_dest_post[mes] / CN_dest × 100
```

El `delta_max` se aplica uniforme a todos los meses — escenario peor caso.

### Análisis Mes a mes (delta proporcional)
```
p_pct        = delta_max / I_orig[mes_peor]
delta[mes]   = I_orig[mes] × p_pct
I_dest_post_mam[mes] = I_dest[mes] + delta[mes]
I_orig_post_mam[mes] = max(0, I_orig[mes] − delta[mes])
```

### Cargabilidad transformador
```
Escenario conservador:
  Origen (alivio):  I_trafo_post = max(0, I_trafo[mes] − delta_max)
  Destino (carga):  I_trafo_post = I_trafo[mes] + delta_max

Mes a mes:
  Origen (alivio):  I_trafo_post[mes] = max(0, I_trafo[mes] − delta[mes])
  Destino (carga):  I_trafo_post[mes] = I_trafo[mes] + delta[mes]
```

Si origen y destino comparten el mismo trafo, no hay cambio neto.

### Período de análisis — Año corrido
```
max_mes    = último mes con datos en MySQL
mes_inicio = año anterior, mismo mes  (ej: "2026-04" → "2025-04")
meses_vista = todos los meses ≥ mes_inicio
```

### Estados de cargabilidad
| Estado | Criterio | Color |
|---|---|---|
| `viable` | FU < 90% | Verde |
| `prealerta` | 90% ≤ FU < 100% | Naranja |
| `critico` | FU ≥ 100% | Rojo |

### Alivio en peor mes (VCC con traspaso simultáneo)
```
Cuando delta_traspaso_pct > 0:
  I_raw  = I_antes[mes_max_alim] / (1 − pct/100)
  alivio = I_raw − I_antes[mes_max_alim]

Cuando delta_traspaso_a > 0:
  alivio = delta_traspaso_a

(I_antes[mes_max_alim] es el valor ya ajustado por el traspaso)
```

---

## API REST — Referencia de endpoints

### Frontend
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Sirve `templates/index.html` con shim de fetch inyectado |

### Datos generales
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/feeders` | Lista todos los alimentadores (nombre, numalim, cn, subestacion) |
| `GET` | `/api/meses` | Lista de meses disponibles en la BD |
| `GET` | `/api/subestaciones` | Lista de subestaciones únicas |
| `GET` | `/api/datos` | Metadata: n_alim, n_trafo, meses_disponibles, ultima_actualizacion |
| `GET` | `/api/debug/status` | Estado de caché: feeders, TDs, alimentadores, meses, mtimes |
| `POST` | `/api/reload` | Invalida caché y recarga datos desde MySQL |

### Feeder / topología
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/feeder/{nom}/tds?equipo=X` | TDs aguas abajo de un equipo en el alimentador |
| `GET` | `/api/feeder/{nom}/equipos` | Lista de equipos del alimentador (reconectadores, etc.) |
| `GET` | `/api/equipos?nom_alim=XXX` | Alias de equipos para compatibilidad Python |

### Simulación de traspaso
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| `POST` | `/api/isla` | `{tds, nom_alim}` | Calcula info de la isla de TDs |
| `POST` | `/api/isla/preview` | `{nom_alim, equipo, tds_numpos[]}` | Preview de TDs seleccionados |
| `GET` | `/api/destinos/existentes` | — | Alimentadores existentes como destino |
| `GET` | `/api/destinos/nuevos` | — | Feeders en comisionamiento como destino |
| `POST` | `/api/simular` | ver abajo | Simulación completa de traspaso |
| `POST` | `/api/guardar_transferencia` | `{data}` | Guarda resultado en historial |
| `POST` | `/api/descargar_html` | `{data}` | Genera y retorna reporte HTML |

**Body de `/api/simular`:**
```json
{
  "nom_alim_orig": "AROMOS 2",
  "nom_alim_dest": "AROMOS 3",
  "tipo_dest": "excel",
  "tds": [...],
  "meses_sel": ["2024-01", "2024-02"],
  "numalim_orig": 12345,
  "numalim_dest": 12346
}
```

**Respuesta de `/api/simular`** incluye:
- `tabla_sim`, `tabla_sim_mam` — tablas mensuales
- `trafo_orig`, `trafo_dest`, `trafo_orig_mam`, `trafo_dest_mam` — impacto en trafos
- `ajustes_activos` — `{alim_orig, alim_dest, trafo_orig, trafo_dest}` con los ajustes vigentes
- `serie_raw_trafo_orig`, `serie_raw_trafo_dest` — series antes de aplicar ajustes
- `resumen`, `delta_info`, `isla`

### Feeders en comisionamiento
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/feeders_nuevos` | Lista feeders en comisionamiento |
| `POST` | `/api/feeders_nuevos` | Crea feeder nuevo `{nombre, cn, numalim_trafo?, nota?}` |
| `GET` | `/api/feeders_nuevos/{nombre}` | Feeder enriquecido con tabla_sim, resumen, trafo |
| `PUT` | `/api/feeders_nuevos/{nombre}` | Actualiza campos del feeder |
| `DELETE` | `/api/feeders_nuevos/{nombre}` | Elimina feeder |
| `GET` | `/api/feeders_nuevos/{nombre}/informe` | Genera y descarga reporte HTML |
| `POST` | `/api/feeders_nuevos/{nombre}/transferencias` | Simula y agrega transferencia |
| `GET` | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Obtiene transferencia por índice |
| `DELETE` | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Elimina transferencia |
| `POST` | `/api/feeders_nuevos/{nombre}/cambios_topologicos` | Agrega cambio topológico |
| `DELETE` | `/api/feeders_nuevos/{nombre}/cambios_topologicos/{idx}` | Elimina cambio topológico |

### Ajustes de demanda
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/ajustes` | Lista todos los ajustes activos |
| `GET` | `/api/ajustes/{tipo}/{numalim}` | Ajustes de un alimentador/trafo específico |
| `POST` | `/api/ajustes/{tipo}/{numalim}` | Guarda ajustes. Responde `{ok, ajustes}` |
| `DELETE` | `/api/ajustes/{tipo}/{numalim}/{mes}` | Elimina ajuste de un mes específico |

### VCC (Validación de Conexión de Cliente)
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/vcc/equipos/{nom_alim}?modo=equipos\|tp` | Equipos o TDs upstream del alimentador |
| `POST` | `/api/vcc/punto` | Busca upstream desde un numpos `{nom_alim, numpos}` |
| `POST` | `/api/vcc/evaluar` | Evaluación completa VCC (ver body abajo) |
| `POST` | `/api/vcc/calcular` | Cálculo VCC sin evaluación de equipos |
| `POST` | `/api/vcc/guardar` | Guarda evaluación VCC en historial |
| `POST` | `/api/vcc/descargar_html` | Genera y retorna reporte VCC HTML |
| `GET` | `/api/vcc/historial_global` | Todas las evaluaciones guardadas |
| `GET` | `/api/vcc` | Lista alimentadores con VCC guardadas |
| `GET` | `/api/vcc/{nombre}` | Evaluaciones de un alimentador |
| `POST` | `/api/vcc/{nombre}` | Alias de guardar para alimentador |
| `DELETE` | `/api/vcc/{nombre}/{idx}` | Elimina evaluación por índice |

**Body de `/api/vcc/evaluar`:**
```json
{
  "nom_alim": "AROMOS 2",
  "numalim": 12345,
  "numpos": "DBC12345",
  "kva_empresa": 500.0,
  "tension_kv": 23.0,
  "meses_sel": [],
  "equipos_cn": [{"nombre": "DBC12345", "cn": 300.0}],
  "delta_traspaso_a": 0,
  "delta_traspaso_pct": 10.0,
  "kva_instalado": 400.0
}
```

**Respuesta de `/api/vcc/evaluar`** incluye:
- `tabla_alim`, `tabla_trafo` — impacto mensual
- `equipos_eval` — evaluación de equipos upstream con fraccion y estado
- `alivio_A_peor` — corriente máxima aliviada en el peor mes [A]
- `pct_max_alim`, `mes_max_alim` — peor FU del alimentador
- `resumen_alim`, `kva_instalado` (si se pidió escenario de sensibilidad)

---

## Flujo VCC paso a paso

```
1. GET /api/vcc/equipos/{nom_alim}?modo=equipos
   → JS guarda en vccEquiposCache[]: {nombre, tipo, cn, fraccion, kva_down, ...}
   → Usuario selecciona CN para cada equipo

2. GET /api/vcc/equipos/{nom_alim}?modo=tp
   → JS muestra lista de TDs para elegir punto de conexión

3. POST /api/vcc/punto  {nom_alim, numpos}
   → Retorna {upstream: [...], nombre_ref, tipo_ref, n_tds_aguas_abajo}

4. POST /api/vcc/evaluar  {nom_alim, numalim, numpos, kva_empresa, tension_kv,
                           equipos_cn: vccEquiposCache, delta_traspaso_pct, ...}
   → Si equipos_cn viene en el body, se usa directamente (evita re-consulta)
   → Retorna evaluación completa con tabla_alim, tabla_trafo, equipos_eval, alivio_A_peor
```

---

## Convenciones de respuesta JSON

| Helper | Wrapper | Uso |
|---|---|---|
| `jsonPy($data)` | Ninguno — JSON plano | Endpoints migrados de Python |
| `jsonOk($data)` | `{ok: true, data: ...}` | Endpoints legacy PHP |
| `jsonErr($msg, $code)` | `{ok: false, error: "..."}` | Errores en todos los endpoints |

Los endpoints de simulación, VCC y feeders_nuevos usan `jsonPy()`.

---

## Persistencia local

| Tipo | Ubicación | Formato | TTL |
|---|---|---|---|
| Caché aguas_abajo | `data/cache/aguas_abajo.ser` | PHP serialize | 7 días |
| Caché demandas | `data/cache/demandas.ser` | PHP serialize | 30 días |
| Ajustes de demanda | `data/ajustes_demanda.json` | JSON | Manual |
| Feeders nuevos | `feeders_nuevos/<SLUG>.json` | JSON | Manual |
| Evaluaciones VCC | `data/vcc/<SLUG>.json` | JSON | Manual |
| Reportes HTML | `data/reportes/<slug>.html` | HTML | Manual |

---

## Notas de paridad con Python

### Diferencias intencionadas (no son bugs)

| Aspecto | Python | PHP |
|---|---|---|
| Fuente de datos | CSV + Excel en disco | MySQL (`maniobras_rapidas_aguas_abajo`, `dem_maximas`) |
| Caché | `.pkl` invalidado por mtime del archivo | `.ser` TTL fijo (7d topología, 30d demandas) |
| Matching nombre↔datos | 3 pasos: mappings.json → índice → fuzzy | No aplica — MySQL usa `numalim` como PK en ambas tablas |
| Trafo de feeder | `subestacion + barra` (número) | `numalim_trafo` (FK directa) |
| Mapeos de nombres | Tab UI + `GET/POST /api/mappings` | Omitido — MySQL no tiene ambigüedad de nombres |

### Extensiones PHP sobre Python

- `cambios_topologicos` en feeders nuevos (POST/DELETE endpoints)
- `ajustes_activos` + `serie_raw_trafo_*` en respuesta `/api/simular`
- `GET /api/feeders_nuevos/{nombre}/transferencias/{idx}`
- `GET /api/debug/status` con info de caché y mtimes
- Subfolder deployment automático vía `$_basePath` + fetch shim inyectado en HTML

---

## Equivalencias Python → PHP

| Python | PHP |
|---|---|
| `pd.DataFrame` wide con índice de meses | `array<numalim, array<col, val>>` |
| `pd.Series` con índice `YYYY-MM` | `array<string, float\|null>` |
| `np.nan` / `pd.isna()` | `null` / `_simIsNan()` |
| `flask.jsonify()` | `jsonPy()` |
| `pickle / pkl` | `serialize() / unserialize()` — archivos `.ser` |
| `html.escape()` | `_h()` — helper en Reportes.php |
| `Normalizer.NFKD` (Python) | `\Normalizer::normalize($s, NFKD)` — ext/intl |
| `logging.info()` | `error_log()` — no contamina JSON |
