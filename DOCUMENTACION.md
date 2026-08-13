# Simulación de Traspasos de Carga MT + VCC — Documentación técnica

> Herramienta web interna de ENEL Chile para **análisis de traspasos de carga en media tensión
> (MT)** y **validación de conexión de clientes nuevos (VCC)**. Simula el impacto de una maniobra
> sobre la cargabilidad de alimentadores y transformadores de potencia.
>
> **Estado:** actual a 2026-08-13. Reemplaza a `DOCUMENTACION_PHP.md` (doc de migración, obsoleto).
> Pensado como base de referencia para próximos trabajos.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura](#2-arquitectura)
3. [Conexiones de base de datos](#3-conexiones-de-base-de-datos)
4. [Estructura de archivos](#4-estructura-de-archivos)
5. [Router y helpers globales (`index.php`)](#5-router-y-helpers-globales-indexphp)
6. [Módulos API (`api/`)](#6-módulos-api-api)
7. [Lógica de negocio (`src/`)](#7-lógica-de-negocio-src)
8. [Frontend (`templates/`)](#8-frontend-templates)
9. [Modelos técnicos clave](#9-modelos-técnicos-clave)
10. [Caché y persistencia](#10-caché-y-persistencia)
11. [Flujos principales](#11-flujos-principales)
12. [Despliegue](#12-despliegue)
13. [Convenciones del proyecto](#13-convenciones-del-proyecto)
14. [Glosario](#14-glosario)

---

## 1. Visión general

Aplicación web de página única con router PHP. Dos herramientas principales:

- **Nuevo Traspaso (NT):** el operador elige un alimentador origen, un segmento de carga (por
  equipo que abre o por lista de transformadores de distribución/TDs) y un alimentador destino;
  el sistema calcula si el traspaso es **factible** sin sobrecargar el destino ni su transformador
  de potencia, mes a mes. Incluye corrimientos de carga en cadena y un sugeridor de maniobras.
- **VCC (Validación de Conexión de Cliente):** evalúa si un cliente nuevo (o una maniobra) cabe
  aguas abajo de un punto de la red, considerando todos los equipos del troncal.

**Stack:**
- Backend: **PHP 8.5** (PDO/MySQL, sin framework). Cálculo numérico con lógica propia (traducido
  desde un original Python/Flask + pandas).
- Frontend: **Bootstrap 5.3 + Chart.js 4.4 + Tom Select 2.3**, sin framework JS (vanilla + `state`
  global). Assets locales en `templates/vendors/` (sin CDN).
- Persistencia: MySQL + caché en filesystem (`serialize`) + JSON en disco para configuración.

---

## 2. Arquitectura

```
Navegador (SPA)
   │  GET /            → index.php sirve templates/index.html (+ shim base-path)
   │  /api/*           → JSON
   ▼
index.php  ── router puro (306 L) ──────────────────────────────────────────
   │  bootstrap: conexion.php, require_login(), includes src/, CORS
   │  helpers: jsonOk/jsonErr/jsonPy, bodyJson, gd(), getLz(), _lzInfoEntre()…
   │  dispatch por segmentos → require api/<módulo>.php  (cada módulo evalúa su ruta)
   ▼
api/*.php  ── endpoints (feeders, traspaso, vcc, telecontrol, ajustes, config_*, feeders_nuevos)
   │  parsean el body, llaman a la lógica
   ▼
src/*.php  ── lógica de negocio (Datos, Simulacion, Vcc, Reportes, Telecontrol, …)
   │
   ├─ conexion.php ── db()/db_retim()/db_agui()/db_tlc()  → PDO singletons → MySQL (ewaahicdca00)
   └─ data/cache/*.ser ── caché de topología/demandas/LZ (serialize, TTL 7-30 días)
```

**Ciclo de un request `/api/*`:** `index.php` arma los segmentos de la URI (`$a`, `$b0`, `$b1`,
`$b2`), incluye en orden los 8 módulos de `api/`; cada módulo comprueba `if ($method === … && $a
=== …)` y, si matchea, responde con `jsonOk`/`jsonPy` y termina (`exit`). Si ninguno matchea → 404.

**Carga lazy de datos:** `gd()` (index.php) carga y cachea en el request los tres wide-tables
(`dfAlim`, `dfTrafo`, `dfAb`); `getLz()` carga el límite de zona. Se reutilizan entre módulos del
mismo request.

**Base-path shim:** al servir el HTML, `index.php` inyecta un `<script>` que prefija el base-path
(subcarpeta del servidor) a toda llamada `fetch('/api/*')`, para que el mismo HTML funcione en
`localhost` y en `/AMEyAO/…/`.

---

## 3. Conexiones de base de datos

Definidas en **`conexion.php`** como **singletons PDO** (una conexión por request, reutilizada).
Servidor: **`ewaahicdca00`**. Credenciales: en `config.php` (local, gitignoreado) o, si no existe,
en el **fallback hardcodeado** de `conexion.php` (usado en el deploy). *Los passwords viven en esos
archivos; no se reproducen aquí.*

| Función | Base de datos | Usuario | Contenido |
|---|---|---|---|
| `db()` | `meyg` | `OperAnalisys` | Topología, demandas y límite de zona (fuente principal) |
| `db_retim()` | `qv_server` | `user_nmt` | RETIM |
| `db_agui()` | `inf_tecnica_agui` | `OperAnalisys` | Información técnica de equipos (AGUI) |
| `db_tlc()` | `telecontrol_systems` | `OperAnalisys` | Telecontrol (TLC) y esquema FRG |

**Tablas principales (`meyg`, vía `db()` en `src/Datos.php`):**

| Tabla | Uso |
|---|---|
| `maniobras_rapidas_aguas_abajo` | Topología: equipos y TDs aguas abajo (~285k filas) |
| `maniobras_rapidas_limite_zona` | Límite de zona (LZ): dispositivos de enlace, vecinos, troncal, viabilidad |
| `dem_maximas` | Demanda máxima mensual por alimentador |
| `dem_maximas_trafos` | Demanda máxima mensual por transformador de potencia |

**Telecontrol (`telecontrol_systems`, vía `db_tlc()` en `src/Telecontrol.php`):** `equipo` JOIN
`tipo_equipo` → set de equipos telecontrolados + FRG (se cachea en `data/cache/telecontrol.json`).

Otros helpers de conexión (`e()` escape HTML, `require_login()` que incluye `session.php` del
servidor si existe) también viven en `conexion.php`.

---

## 4. Estructura de archivos

```
graficos_traspasos_php/
├── codigo_php/
│   ├── index.php                 ← Router puro + helpers globales (306 L)
│   ├── conexion.php              ← 4 singletons PDO + fallback de credenciales
│   ├── config.php                ← Credenciales locales (gitignoreado)
│   ├── config.example.php        ← Plantilla de credenciales
│   ├── web.config / .htaccess    ← Rewrite rules (IIS / Apache)
│   ├── iniciar.bat               ← Lanzador del server de desarrollo
│   ├── api/                      ← 8 módulos de endpoints
│   │   ├── feeders.php  traspaso.php  feeders_nuevos.php  ajustes.php
│   │   └── config_equip.php  config_alim.php  vcc.php  telecontrol.php
│   ├── src/                      ← 10 módulos de lógica
│   │   ├── Datos.php  Simulacion.php  Vcc.php  Reportes.php  Telecontrol.php
│   │   ├── Matching.php  Memoria.php  Ajustes.php
│   │   └── EquiposConfig.php  AlimentadoresConfig.php
│   ├── templates/
│   │   ├── index.html            ← HTML + <style> + <script> (JS inline al servir)
│   │   ├── js/                   ← init.js  nt.js  resultados.js  vcc.js  config.js
│   │   └── vendors/              ← Bootstrap, Chart.js, Tom Select, Bootstrap Icons (locales)
│   ├── data/
│   │   ├── cache/                ← *.ser (gitignoreado salvo .gitkeep) + telecontrol.json
│   │   ├── equipos_config.json   ← Fichas de equipos (CN, tipo de límite)
│   │   ├── alimentadores_config.json ← Conductores intermedios + autotrafos por alimentador
│   │   └── ajustes_demanda.json  ← Ajustes manuales de demanda
│   ├── feeders_nuevos/           ← Feeders en comisionamiento (JSON)
│   └── vcc_evaluaciones/         ← Evaluaciones VCC guardadas (JSON)
├── DOCUMENTACION.md              ← (este archivo)
├── SESION_YYYY-MM-DD.md          ← Bitácora por sesión de desarrollo
└── AMEyAO_SimulacionTraspaso_VCC_PUSER/  ← Paquete de despliegue (gitignoreado)
```

---

## 5. Router y helpers globales (`index.php`)

**Bootstrap:** verifica `config.php` (solo en `cli-server`), incluye `conexion.php` +
`require_login()`, crea carpetas de escritura (`data/cache`, `feeders_nuevos`, `vcc_evaluaciones`),
incluye los 10 `src/`, resuelve el base-path, setea cabeceras CORS.

**Helpers de respuesta:**
- `jsonOk($data)` → `{ok:true, data:…}`.
- `jsonErr($msg, $code)` → `{ok:false, error:…}` + HTTP code.
- `jsonPy($data)` → JSON plano **sin wrapper** (formato heredado del original Python; lo usan varios
  endpoints que el frontend consume directo).
- `bodyJson()` → parsea el body JSON del request.

**Helpers de datos:**
- `gd()` → `['dfAlim','dfTrafo','dfAb']` (carga lazy vía `cargarDemandas()`/`cargarAguasAbajo()`).
- `getLz()` → tabla de límite de zona (lazy).
- `_lzInfoEntre($numalimA, $numalimB)` → dispositivos LZ entre dos alimentadores desde la
  perspectiva del receptor (viabilidad, troncal, TLC, caso `subterraneo_3ramas`).
- `seleccionarTds($dfAb, $nomAlim, $b)` → TDs según modo (`equipo` / `manual` / feeder completo),
  con exclusiones.
- `filtrarMeses($tabla, $mesesSel)`, `nomAlimDeNumalim($dfAb, $numalim)`.

**Router:** `GET /` sirve `templates/index.html` con el shim base-path inyectado antes de `</head>`;
`/api/*` incluye los 8 módulos; cualquier otra cosa → 404. Excepciones: `RuntimeException`→422,
`JsonException`→500, `Throwable`→500 con archivo:línea.

---

## 6. Módulos API (`api/`)

Cada módulo se incluye desde el router y evalúa sus rutas por `$method` + segmentos
(`$a/$b0/$b1/$b2`). Endpoints principales:

**`feeders.php`** — datos base y topología
| Método · Ruta | Propósito |
|---|---|
| `GET /api/feeders` | Lista de alimentadores (+ FRG) |
| `GET /api/meses` | Meses disponibles (histórico) |
| `GET /api/feeder/{n}/tds` · `/equipos` | TDs / equipos aguas abajo de un feeder (+ TLC, tensión) |
| `POST /api/isla` · `POST /api/isla/preview` | Isla/segmento a traspasar (kVA, TDs, inversión de flujo) |
| `GET /api/destinos/existentes` · `/nuevos` | Destinos de traspaso |
| `GET /api/vecinos_lz/{n}` | Vecinos vía límite de zona (dispositivos, troncal, viabilidad) |
| `GET /api/corrimiento_candidatos/{n}` | Candidatos de corrimiento |
| `GET /api/sugerencias_traspaso/{n}` | Sugeridor de primer traspaso (prioriza TLC) |
| `GET /api/subestaciones` · `POST /api/reload` · `GET /api/debug/status` | Trafos, refresco de caché, estado de cachés |

**`traspaso.php`** — `POST /api/simular` (motor principal), `POST /api/guardar_transferencia`,
`POST /api/descargar_html`.

**`vcc.php`** — `GET /api/vcc/equipos/{nom}` (modos `tps_at`/`tp`), `POST /api/vcc/punto`,
`POST /api/vcc/evaluar`, `POST /api/vcc/guardar`, `POST /api/vcc/descargar_html`,
`GET /api/vcc/historial_global`.

**`telecontrol.php`** — `GET /api/telecontrol/status`, `POST /api/telecontrol/refresh`.

**`ajustes.php`** — `GET/POST/DELETE /api/ajustes` (ajustes manuales de demanda por alim/trafo).

**`config_equip.php`** — `GET/POST/DELETE /api/equipos/config`, `GET /api/equipos/todos`
(fichas de equipos: CN, tipo de límite).

**`config_alim.php`** — `GET/POST/DELETE /api/alimentadores/config`, `/lista`, `/equipos`,
`POST /api/alim/troncal_enriquecido` (conductores intermedios y autotrafos por alimentador).

**`feeders_nuevos.php`** — `GET/POST/PUT/DELETE /api/feeders_nuevos`, `/informe`, `/transferencias`
(feeders en comisionamiento y sus transferencias).

---

## 7. Lógica de negocio (`src/`)

Cada archivo tiene un bloque de índice `╔══╗` al inicio con el mapa de funciones y sus líneas.

- **`Datos.php`** — Carga y normalización de las tres fuentes MySQL + caché. `cargarAguasAbajo()`,
  `cargarDemandas()` (→ `dfAlim`/`dfTrafo`), `cargarLimiteZona()`, `pivotarAlim()`/`pivotarTrafos()`
  (wide tables por numalim), helpers de topología (`tdsDeFeeder`, `tdsDeEquipo`, `equiposEnIsla`,
  `kvaTotalFeeder`), y del período de estudio: **`mesesAnioMovil()`** (año móvil de 12 meses) +
  `resolverPeriodoEstudio()`.
- **`Simulacion.php`** — Motor de cálculo. `clasificarMes()` (viable/prealerta≥90%/crítico≥100%),
  **`simular()`** (escenario conservador Δ-fijo), **`simularMesAMes()`** (escenario proporcional
  Δ×p por mes), `analizarTrafo()` (impacto en el trafo de potencia, modo alivio/carga),
  `resumenEstados()` (conteo por estado + peor mes). Ver §9.
- **`Vcc.php`** — Evaluación VCC: troncal, fracciones de carga por equipo, dos enfoques (A
  conservador / B por demanda), `tensionPorEquipoAtr()` (tensión por equipo cruzando autotrafos).
- **`Reportes.php`** — Generación de informes HTML (tablas de cargabilidad, espejo de la vista).
- **`Telecontrol.php`** — Cache TLC/FRG desde `telecontrol_systems`; `tlcEsTlc()`, refresco.
- **`Matching.php`** — Normalización/matching de nombres de alimentadores.
- **`Memoria.php`** — Feeders en comisionamiento (JSON en disco).
- **`Ajustes.php`** — Ajustes manuales de demanda (`getAjustes`, aplicar por fila).
- **`EquiposConfig.php`** / **`AlimentadoresConfig.php`** — Fichas de equipos (CN, tipo de límite) y
  config de alimentadores (conductores intermedios, autotrafos).

---

## 8. Frontend (`templates/`)

`index.html` = HTML + `<style>` + `<script>` con los 5 JS **inline al servir** (el router los sirve
concatenados; los archivos fuente viven en `templates/js/`). Objeto global **`state`** (en
`init.js`) mantiene selección, meses, datos cargados y preferencias.

| Archivo | Responsabilidad |
|---|---|
| `init.js` | `state` global, arranque (`DOMContentLoaded`), caché/labels de navbar, período de meses (**`_limiteAnioMovil`**), helpers (`apiFetch`, `fmtMes`, FRG) |
| `nt.js` | Tab Nuevo Traspaso: origen, equipos/TDs, destinos+LZ, corrimientos, sugeridor, vista simple |
| `resultados.js` | Render de resultados (`mostrarResultados`), gráficos MAM, peor caso, informe HTML autónomo |
| `vcc.js` | Tab VCC completo (punto, equipos, evaluar, historial) |
| `config.js` | Tab Configuración (equipos, alimentadores, ajustes de demanda) |

**Mapa de navegación:** cada archivo grande tiene un bloque `╔══╗` que mapea función → línea del
**HTML compilado servido**. Se mantienen con la skill `/actualizar-indices` (método
verdad-de-terreno: se sirve la página y se grepea la línea real de cada función).

---

## 9. Modelos técnicos clave

**(a) Escenario conservador vs proporcional.** El motor produce **dos** tablas mensuales:
- `simular()` → **conservador (Δ fijo):** aplica el delta pico (`deltaMax`) *todos* los meses.
  Alimenta la sección **"Peor caso — Δ fijo"** (`data.tabla`).
- `simularMesAMes()` → **proporcional (Δ×p):** escala el delta por la carga real de cada mes.
  Alimenta la **tabla mes-a-mes** y el **veredicto de cabecera** (alerta + conteo + `pct_max_uso`,
  vía `resumenEstados($dfSimMam)`). *Decisión 2026-08-13:* la cabecera usa el proporcional para ser
  consistente con la tabla visible; el conservador queda como stress-test aparte.

**(b) Reencuadre ATR por tensión de enlace.** Cuando un traspaso cruza un autotransformador
(23 kV ↔ 12 kV), la corriente escala por `V_cab_orig / V_cab_dest`; la tensión del punto de enlace
sale de `tensionPorEquipoAtr()` (robusto multi-ATR). `deltaMax` ya integra los ATR internos a la
isla → solo se cuenta el ATR que el LZ cruza (evita doble conteo). Guardrail `atr_warning` si la
escala cae fuera de `[0.4, 2.5]`.

**(c) Límite de zona (LZ) / troncal / viabilidad.** El LZ define los dispositivos de enlace entre
alimentadores. Un destino es **viable** si su troncal es derivable; si no, el traspaso es
**forzado** (troncal manual). El "segmento a traspasar" (antes "isla") es el conjunto de TDs aguas
abajo del equipo que abre.

**(d) Año móvil.** La preselección de meses es una ventana móvil de **12 meses** que termina en el
último dato disponible (data-driven; rueda sola al entrar demanda nueva). El toggle "Histórico
completo" revela los meses anteriores.

**(e) TLC / FRG.** Badges de telecontrol (equipos operables remotamente) y esquema FRG en las
superficies de equipos y alimentadores; el sugeridor prioriza maniobras TLC.

**(f) Corrimientos y cadena.** Un traspaso puede encadenar corrimientos (B→C) para descongestionar;
el feeder intermedio arrastra la carga entre casos.

**(g) Inversión de flujo.** Aviso cuando equipos dentro del segmento recibirán corriente desde la
dirección opuesta (verificar topología real).

**Conceptos base:** **CN** = corriente nominal (capacidad); **FU** = factor de utilización
(uso/CN, %); **TD** = transformador de distribución; **ATR/autotrafo** = autotransformador;
**PPF/REC/DBC/…** = prefijos de tipos de equipo.

---

## 10. Caché y persistencia

**Caché (`data/cache/`, `serialize`):** `aguas_abajo_sql.ser` (TTL 7d, ~285k filas),
`demandas_sql.ser` (TTL 30d), LZ (TTL 7d), y `telecontrol.json` (TLC/FRG, mensual). Botón "🗄 Datos"
en la navbar muestra la antigüedad y permite recargar (`POST /api/reload`). Estado vía
`GET /api/debug/status`.

**Persistencia en JSON (`data/` y carpetas de trabajo):**
- `equipos_config.json` — fichas de equipos (CN, tipo de límite: setpoint/fusible/conductor).
- `alimentadores_config.json` — conductores intermedios y autotrafos por alimentador.
- `ajustes_demanda.json` — overrides manuales de demanda por mes/entidad.
- `feeders_nuevos/*.json` — feeders en comisionamiento y transferencias.
- `vcc_evaluaciones/*.json` — evaluaciones VCC guardadas.

---

## 11. Flujos principales

**Nuevo Traspaso:** elegir origen → definir segmento (equipo que abre o lista de TDs) → elegir
destino (con LZ viable) → `POST /api/simular` → veredicto (Factible/prealerta/no factible) + tablas
mes-a-mes + peor caso + gráficos + (opcional) informe HTML. Corrimiento/cadena para
descongestionar; sugeridor TLC para proponer maniobras.

**VCC:** elegir punto/alimentador → cargar equipos del troncal (con tensión por equipo) → definir
la maniobra/cliente → `POST /api/vcc/evaluar` → tabla por equipo con dos enfoques (A/B) → guardar en
historial.

**Configuración:** fichas de equipos (CN), config de alimentadores (conductores/autotrafos) y
ajustes de demanda anómala — todo persistido en `data/*.json`.

---

## 12. Despliegue

**Desarrollo:** PHP built-in server en `localhost:8090` (`iniciar.bat` o `php -S`). Ejecutable en
`…/PHP_856/php.exe`. Verificación: servir la página y observar el comportamiento (**nunca**
`taskkill php.exe` — mata el server del usuario; matar solo por PID/puerto).

**Producción (servidor AMEyAO):** paquete `AMEyAO_SimulacionTraspaso_VCC_PUSER/` (gitignoreado,
artefacto) con el módulo `SimulacionTraspaso_VCC_PUSER/`. Ver su `INSTRUCCIONES_DESPLIEGUE.md`:
- Subir la carpeta al nivel de `principal.php` + agregar un `<li>` en el dropdown **Estudios**.
- `require_login()` detecta `session.php` del servidor (auto no-op en local).
- `conexion.php` trae las 4 credenciales hardcodeadas de fallback (no requiere cambios).
- Assets locales en `templates/vendors/` (sin internet). `.htaccess`/`web.config` para el routing.
- Carpetas con permiso de escritura: `data/cache`, `feeders_nuevos`, `vcc_evaluaciones`.

---

## 13. Convenciones del proyecto

- **Índices `╔══╗`:** bloques de mapa función→línea en archivos grandes (`index.php`, `src/Datos.php`,
  `src/Simulacion.php`, `src/Reportes.php`, `templates/index.html`). Recalcular con
  `/actualizar-indices` al cerrar sesión (verdad-de-terreno; ojo con desfases previos).
- **Respuestas JSON:** wrapper `{ok,data}` (`jsonOk`) vs plano `jsonPy` (heredado de Python) — el
  frontend sabe cuál espera cada endpoint.
- **Bitácora:** un `SESION_YYYY-MM-DD.md` por sesión (skill `/session-doc`).
- **Verificación:** correr la app y observar; no dar por hecho sin servir la página.
- **Renombre "isla" → "segmento"** en textos visibles (los IDs/funciones internas conservan "isla").

---

## 14. Glosario

| Término | Significado |
|---|---|
| **MT** | Media tensión |
| **Traspaso** | Mover carga de un alimentador a otro operando equipos de enlace |
| **CN** | Corriente nominal (capacidad del equipo/alimentador) |
| **FU** | Factor de utilización = corriente / CN (%) |
| **TD** | Transformador de distribución |
| **ATR / autotrafo** | Autotransformador (cambia el nivel de tensión, p.ej. 23 ↔ 12 kV) |
| **LZ** | Límite de zona: dispositivos de enlace entre alimentadores |
| **Troncal** | Cadena de equipos aguas abajo del punto de enlace en el receptor |
| **Segmento (isla)** | Conjunto de TDs aguas abajo del equipo que abre, que se traspasa |
| **VCC** | Validación de Conexión de Cliente |
| **TLC** | Telecontrol (equipos operables remotamente) |
| **FRG** | Esquema de reconfiguración de red |
| **Año móvil** | Ventana de 12 meses que termina en el último dato disponible |
| **Δ (delta)** | Incremento de corriente que aporta el traspaso al receptor |
| **PPF / REC / DBC / CLB / ABB / …** | Prefijos de tipos de equipo de maniobra |
