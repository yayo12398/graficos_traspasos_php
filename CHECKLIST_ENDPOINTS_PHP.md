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
| 1 | GET | `/` | Sirve `templates/index.html` | `[ ]` | `[ ]` |

---

## API — Feeders / Alimentadores

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 2 | GET | `/api/feeders` | Lista todos los alimentadores (`numalim`, `nombre`, `cn`, `nom_alim`, `subestacion`, `cn_trafo`) | `[ ]` | `[ ]` |
| 3 | GET | `/api/feeder/{nom_alim}/equipos` | Equipos de un alimentador (excluye cabecera) | `[ ]` | `[ ]` |
| 4 | GET | `/api/feeder/{nom_alim}/tds` | TDs de un alimentador; acepta `?equipo={nombre}` para filtrar por equipo | `[ ]` | `[ ]` |
| 5 | GET | `/api/meses` | Lista de meses disponibles en formato `YYYY-MM` | `[ ]` | `[ ]` |
| 6 | GET | `/api/subestaciones` | Trafos disponibles, deduplicados por BARRA física | `[ ]` | `[ ]` |

---

## API — Datos / Debug

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 7 | GET | `/api/debug/status` | Estado del servidor y datos cargados | `[ ]` | `[ ]` |

---

## API — Destinos

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 8 | GET | `/api/destinos/existentes` | Alimentadores existentes disponibles como destino | `[ ]` | `[ ]` |
| 9 | GET | `/api/destinos/nuevos` | Feeders en comisionamiento disponibles como destino | `[ ]` | `[ ]` |

---

## API — Simulación de Traspaso

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 10 | POST | `/api/isla/preview` | Preview rápido de la isla (kVA, TDs, clientes, %) sin simular | `[ ]` | `[ ]` |
| 11 | POST | `/api/simular` | Simulación completa de traspaso (origen → destino, mes a mes, trafos, ajustes) | `[ ]` | `[ ]` |

### Body de `/api/simular`

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
  "descripcion": ""
}
```

`tipo_dest` puede ser: `"excel"` | `"nuevo"` | `"nuevo_crear"`

---

## API — Persistencia de Transferencias

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 12 | POST | `/api/guardar_transferencia` | Guarda transferencia en feeder nuevo (JSON local) | `[ ]` | `[ ]` |

---

## API — Feeders en Comisionamiento

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 13 | GET | `/api/feeders_nuevos/{nombre}` | Detalle completo: transferencias, acumulado, tabla simulada, trafo | `[ ]` | `[ ]` |
| 14 | GET | `/api/feeders_nuevos/{nombre}/informe` | Descarga HTML del informe del feeder | `[ ]` | `[ ]` |
| 15 | GET | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Detalle de una transferencia individual (para modal / descarga) | `[ ]` | `[ ]` |
| 16 | DELETE | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Elimina una transferencia del feeder | `[ ]` | `[ ]` |
| 17 | DELETE | `/api/feeders_nuevos/{nombre}` | Elimina un feeder completo y su archivo JSON | `[ ]` | `[ ]` |
| 18 | POST | `/api/feeders_nuevos/{nombre}/cambios_topologicos` | Agrega un cambio topológico al feeder | `[ ]` | `[ ]` |
| 19 | DELETE | `/api/feeders_nuevos/{nombre}/cambios_topologicos/{idx}` | Elimina un cambio topológico del feeder | `[ ]` | `[ ]` |

---

## API — Descarga de Reportes HTML

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 20 | POST | `/api/descargar_html` | Genera y descarga HTML de un traspaso individual | `[ ]` | `[ ]` |

---

## API — Ajustes de Demanda

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 21 | GET | `/api/ajustes` | Lista todos los ajustes activos (enriquecidos con nombre y valor SQL) | `[ ]` | `[ ]` |
| 22 | GET | `/api/ajustes/{tipo}/{numalim}` | Ajustes de un alimentador/trafo específico | `[ ]` | `[ ]` |
| 23 | POST | `/api/ajustes/{tipo}/{numalim}` | Guarda/actualiza ajustes. Body: `{"YYYY-MM": valor_float}` | `[ ]` | `[ ]` |
| 24 | DELETE | `/api/ajustes/{tipo}/{numalim}/{mes}` | Elimina el ajuste de un mes específico | `[ ]` | `[ ]` |

`{tipo}` puede ser: `"alim"` | `"trafo"`

---

## API — VCC (Verificación de Capacidad de Conexión)

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 25 | GET | `/api/vcc/equipos/{nom_alim}` | Equipos del alimentador para VCC; `?modo=equipos` (default) o `?modo=tp` | `[ ]` | `[ ]` |
| 26 | POST | `/api/vcc/punto` | Busca el punto de conexión y equipos upstream | `[ ]` | `[ ]` |
| 27 | POST | `/api/vcc/evaluar` | Evalúa la VCC (delta I, cargabilidad alimentador + trafo + equipos) | `[ ]` | `[ ]` |
| 28 | POST | `/api/vcc/guardar` | Guarda evaluación VCC en JSON local | `[ ]` | `[ ]` |
| 29 | GET | `/api/vcc/historial_global` | Historial de todas las evaluaciones VCC (todos los alimentadores) | `[ ]` | `[ ]` |
| 30 | GET | `/api/vcc/{nombre}` | Historial VCC de un alimentador específico | `[ ]` | `[ ]` |
| 31 | DELETE | `/api/vcc/{nombre}/{idx}` | Elimina una evaluación VCC | `[ ]` | `[ ]` |
| 32 | POST | `/api/vcc/descargar_html` | Genera y descarga HTML del reporte VCC | `[ ]` | `[ ]` |

---

## Resumen de métodos HTTP usados

| Método | Endpoints |
|--------|-----------|
| GET | 1–9, 13–15, 21–22, 25, 29–30 |
| POST | 10–12, 18, 20, 23, 26–28, 32 |
| DELETE | 16–17, 19, 24, 31 |

**Total: 32 endpoints**

---

## Notas para la implementación PHP

### Respuestas de error
Todos los endpoints de error retornan `{"error": "mensaje"}` con el código HTTP correspondiente (400 o 500).

### Rutas con conflicto potencial
`/api/vcc/historial_global` y `/api/vcc/descargar_html` deben matchearse **antes** que `/api/vcc/{nombre}` en el router, porque `{nombre}` capturaría esos literales.

### Archivos devueltos como descarga
Los endpoints 14, 20 y 32 devuelven un archivo HTML adjunto:
```php
header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fname . '"');
readfile($ruta);
exit;
```

### Query strings relevantes
- `GET /api/feeder/{nom_alim}/tds?equipo={nombre}` — filtra TDs por equipo
- `GET /api/vcc/equipos/{nom_alim}?modo=equipos|tp` — cambia el modo de respuesta
