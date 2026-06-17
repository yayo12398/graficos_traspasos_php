# Checklist de Endpoints — Traducción Python/Flask → PHP

Cada fila = un endpoint. Marca `[x]` cuando esté implementado y probado en PHP.

**Convenciones:**
- `{param}` → segmento de ruta dinámico
- `?param` → query string opcional
- Body → JSON en el body del request (`php://input`)
- Respuesta → JSON a menos que se indique "archivo"

---

## Rutas HTML

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 1 | GET | `/` | Sirve `templates/index.html` | `[x]` | `[ ]` |

---

## API — Feeders / Alimentadores

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 2 | GET | `/api/feeders` | Lista todos los alimentadores (`numalim`, `nombre`, `cn`, `nom_alim`, `subestacion`, `cn_trafo`) | `[x]` | `[ ]` |
| 3 | GET | `/api/feeder/{nom_alim}/equipos` | Equipos de un alimentador (excluye cabecera) | `[x]` | `[ ]` |
| 4 | GET | `/api/feeder/{nom_alim}/tds` | TDs de un alimentador; acepta `?equipo={nombre}` para filtrar por equipo | `[x]` | `[ ]` |
| 5 | GET | `/api/meses` | Lista de meses disponibles en formato `YYYY-MM` | `[x]` | `[ ]` |
| 6 | GET | `/api/subestaciones` | Trafos disponibles, deduplicados por BARRA física | `[x]` | `[ ]` |

---

## API — Datos / Debug

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 7 | GET | `/api/debug/status` | Estado del servidor y datos cargados | `[x]` | `[ ]` |

---

## API — Destinos

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 8 | GET | `/api/destinos/existentes` | Alimentadores existentes disponibles como destino | `[x]` | `[ ]` |
| 9 | GET | `/api/destinos/nuevos` | Feeders en comisionamiento disponibles como destino | `[x]` | `[ ]` |

---

## API — Límites de Zona (LZ)

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 10 | GET | `/api/vecinos_lz/{numalim}` | Dispositivos LZ del alimentador con vecinos, viabilidad y equipos troncales | `[x]` | `[ ]` |

### Respuesta de `/api/vecinos_lz/{numalim}`

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

Notas:
- `viable = (n_troncal > 0)` — traspaso físicamente posible (hay troncal en receptor)
- `equipos_troncal`: perspectiva del vecino como **receptor** (para mostrar equipos de riesgo en resultados)
- `equipos_troncal_orig`: perspectiva del alimentador consultado como **origen** (para verificar si `equipo_abre` está en el troncal del LZ)
- Tipos de dispositivo: `"bilateral"` | `"subterraneo_3ramas"` | otro
- `excepcion: true` → corregido manualmente en `_LZ_EXCEPCIONES` (BD incorrecta)

---

## API — Simulación de Traspaso

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 11 | POST | `/api/isla/preview` | Preview rápido de la isla (kVA, TDs, clientes, %) sin simular | `[x]` | `[ ]` |
| 12 | POST | `/api/simular` | Simulación completa de traspaso (origen → destino, mes a mes, trafos, ajustes) | `[x]` | `[ ]` |

### Body de `/api/simular` (sin cambios en request)

```json
{
  "numalim_orig": 12345,
  "nom_alim_orig": "GOLF",
  "tipo_isla": "equipo",
  "equipo_nombre": "DBC73621",
  "tds_excluidos": [],
  "tds_numpos": [],
  "tipo_dest": "excel",
  "numalim_dest": 67890,
  "feeder_nuevo_nombre": "",
  "feeder_nuevo_cn": null,
  "feeder_nuevo_numalim_trafo": null,
  "meses_sel": ["2025-04", "2025-05"],
  "descripcion": "",
  "numpos_lz_sel": "DBC108457"
}
```

`tipo_dest` puede ser: `"excel"` | `"nuevo"` | `"nuevo_crear"`

### Campos LZ en respuesta de `/api/simular`

```json
{
  "lz_info": {
    "tiene_lz": true,
    "numpos_lz_sel": "DBC108457",
    "dispositivos": [
      {
        "numpos_lz": "DBC108457",
        "tipo": "bilateral",
        "excepcion": false,
        "viable": true,
        "n_troncal": 12,
        "equipos_troncal": ["CLB104708", "REC118524"],
        "seleccionado": true
      }
    ]
  }
}
```

---

## API — Persistencia de Transferencias

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 13 | POST | `/api/guardar_transferencia` | Guarda transferencia en feeder nuevo (JSON local) | `[x]` | `[ ]` |

---

## API — Feeders en Comisionamiento

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 14 | GET | `/api/feeders_nuevos/{nombre}` | Detalle completo: transferencias, acumulado, tabla simulada, trafo | `[x]` | `[ ]` |
| 15 | GET | `/api/feeders_nuevos/{nombre}/informe` | Descarga HTML del informe del feeder | `[x]` | `[ ]` |
| 16 | GET | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Detalle de una transferencia individual (para modal / descarga) | `[x]` | `[ ]` |
| 17 | DELETE | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Elimina una transferencia del feeder | `[x]` | `[ ]` |
| 18 | DELETE | `/api/feeders_nuevos/{nombre}` | Elimina un feeder completo y su archivo JSON | `[x]` | `[ ]` |
| 19 | POST | `/api/feeders_nuevos/{nombre}/cambios_topologicos` | Agrega un cambio topológico al feeder | `[x]` | `[ ]` |
| 20 | DELETE | `/api/feeders_nuevos/{nombre}/cambios_topologicos/{idx}` | Elimina un cambio topológico del feeder | `[x]` | `[ ]` |

---

## API — Descarga de Reportes HTML

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 21 | POST | `/api/descargar_html` | Genera y descarga HTML de un traspaso individual (incluye `lz_info` para secciones de equipos) | `[x]` | `[ ]` |

---

## API — Ajustes de Demanda

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 22 | GET | `/api/ajustes` | Lista todos los ajustes activos (enriquecidos con nombre y valor SQL) | `[x]` | `[ ]` |
| 23 | GET | `/api/ajustes/{tipo}/{numalim}` | Ajustes de un alimentador/trafo específico | `[x]` | `[ ]` |
| 24 | POST | `/api/ajustes/{tipo}/{numalim}` | Guarda/actualiza ajustes. Body: `{"YYYY-MM": valor_float}` | `[x]` | `[ ]` |
| 25 | DELETE | `/api/ajustes/{tipo}/{numalim}/{mes}` | Elimina el ajuste de un mes específico | `[x]` | `[ ]` |

`{tipo}` puede ser: `"alim"` | `"trafo"`

---

## API — VCC (Verificación de Capacidad de Conexión)

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 26 | GET | `/api/vcc/equipos/{nom_alim}` | Equipos del alimentador para VCC; `?modo=equipos` (default) o `?modo=tp` | `[x]` | `[ ]` |
| 27 | POST | `/api/vcc/punto` | Busca el punto de conexión y equipos upstream | `[x]` | `[ ]` |
| 28 | POST | `/api/vcc/evaluar` | Evalúa la VCC (delta I, cargabilidad alimentador + trafo + equipos). Incluye `lz_info` si se envía `numalim_orig` | `[x]` | `[ ]` |
| 29 | POST | `/api/vcc/guardar` | Guarda evaluación VCC en JSON local | `[x]` | `[ ]` |
| 30 | GET | `/api/vcc/historial_global` | Historial de todas las evaluaciones VCC (todos los alimentadores) | `[x]` | `[ ]` |
| 31 | GET | `/api/vcc/{nombre}` | Historial VCC de un alimentador específico | `[x]` | `[ ]` |
| 32 | DELETE | `/api/vcc/{nombre}/{idx}` | Elimina una evaluación VCC | `[x]` | `[ ]` |
| 33 | POST | `/api/vcc/descargar_html` | Genera y descarga HTML del reporte VCC | `[x]` | `[ ]` |

---

## Resumen de métodos HTTP usados

| Método | Endpoints |
|--------|-----------|
| GET | 1–9, 10, 14–16, 22–23, 26, 30–31 |
| POST | 11–13, 19, 21, 24, 27–29, 33 |
| DELETE | 17–18, 20, 25, 32 |

**Total: 33 endpoints**

---

## Notas para la implementación PHP

### Respuestas de error
Todos los endpoints de error retornan `{"error": "mensaje"}` con el código HTTP correspondiente (400 o 500).

### Rutas con conflicto potencial
`/api/vcc/historial_global` y `/api/vcc/descargar_html` deben matchearse **antes** que `/api/vcc/{nombre}` en el router, porque `{nombre}` capturaría esos literales. ✅ Resuelto por orden de declaración.

### Archivos devueltos como descarga
Los endpoints 15, 21 y 33 devuelven un archivo HTML adjunto:
```php
header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fname . '"');
readfile($ruta);
exit;
```

### Query strings relevantes
- `GET /api/feeder/{nom_alim}/tds?equipo={nombre}` — filtra TDs por equipo
- `GET /api/vcc/equipos/{nom_alim}?modo=equipos|tp` — cambia el modo de respuesta

### Bugs corregidos en la revisión 2026-06-17
- **`equipo_abre` vs `equipo_nombre`** en `/api/simular`: el backend leía `$b['equipo_abre']` pero el JS siempre envía `equipo_nombre`. Corregido a `$b['equipo_nombre'] ?? $b['equipo_abre'] ?? ''`.
- **`_extras` no ensamblado** en JS: `data._extras = {descripcion, cambio_topologico, equipo_cierra}` debe armarse del DOM antes de `mostrarResultados(data)`. Corregido.
- **`GET /api/feeders_nuevos/{nombre}/transferencias/{idx}`**: devolvía el objeto directo; debe ser `{ok: true, transferencia: {...}}` para que el JS funcione. Corregido.
- **`lz_info` ausente** en body de `descargarHTML()`: el informe descargado no mostraba secciones LZ. Corregido añadiendo `lz_info: sim.lz_info || null`.
- **`equipo_cierra` sin fallback LZ** en `descargarHTML()` y `guardarTransferencia()`: debe ser `sim._extras?.equipo_cierra || sim.lz_info?.numpos_lz_sel || ""`. Corregido.
- **`descripcion`/`cambio_topologico` leídos del DOM** en descarga/guardar: deben tomarse de `sim._extras` (estado al momento de simulación). Corregido.
