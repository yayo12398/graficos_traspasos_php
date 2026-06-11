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
| 1 | GET | `/` | Sirve `templates/index.html` | `[x]` | `[x]` |

---

## API — Feeders / Alimentadores

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 2 | GET | `/api/feeders` | Lista todos los alimentadores (`numalim`, `nombre`, `cn`, `nom_alim`, `subestacion`, `cn_trafo`) | `[x]` | `[x]` |
| 3 | GET | `/api/feeder/{nom_alim}/equipos` | Equipos de un alimentador (excluye cabecera) | `[x]` | `[x]` |
| 4 | GET | `/api/feeder/{nom_alim}/tds` | TDs de un alimentador; acepta `?equipo={nombre}` para filtrar por equipo | `[x]` | `[x]` |
| 5 | GET | `/api/meses` | Lista de meses disponibles en formato `YYYY-MM` | `[x]` | `[x]` |
| 6 | GET | `/api/subestaciones` | Trafos disponibles, deduplicados por BARRA física | `[x]` | `[x]` |

---

## API — Datos / Debug

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 7 | GET | `/api/debug/status` | Estado del servidor y datos cargados | `[x]` | `[x]` |

---

## API — Destinos

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 8 | GET | `/api/destinos/existentes` | Alimentadores existentes disponibles como destino | `[x]` | `[x]` |
| 9 | GET | `/api/destinos/nuevos` | Feeders en comisionamiento disponibles como destino | `[x]` | `[x]` |

---

## API — Simulación de Traspaso

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 10 | POST | `/api/isla/preview` | Preview rápido de la isla (kVA, TDs, clientes, %) sin simular | `[x]` | `[x]` |
| 11 | POST | `/api/simular` | Simulación completa de traspaso (origen → destino, mes a mes, trafos, ajustes) | `[x]` | `[x]` |

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
| 12 | POST | `/api/guardar_transferencia` | Guarda transferencia en feeder nuevo (JSON local) | `[x]` | `[x]` |

---

## API — Feeders en Comisionamiento

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 13 | GET | `/api/feeders_nuevos/{nombre}` | Detalle completo: transferencias, acumulado, tabla simulada, trafo | `[x]` | `[x]` |
| 14 | GET | `/api/feeders_nuevos/{nombre}/informe` | Descarga HTML del informe del feeder | `[x]` | `[x]` |
| 15 | GET | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Detalle de una transferencia individual (para modal / descarga) | `[x]` | `[x]` |
| 16 | DELETE | `/api/feeders_nuevos/{nombre}/transferencias/{idx}` | Elimina una transferencia del feeder | `[x]` | `[x]` |
| 17 | DELETE | `/api/feeders_nuevos/{nombre}` | Elimina un feeder completo y su archivo JSON | `[x]` | `[x]` |
| 18 | POST | `/api/feeders_nuevos/{nombre}/cambios_topologicos` | Agrega un cambio topológico al feeder | `[x]` | `[x]` |
| 19 | DELETE | `/api/feeders_nuevos/{nombre}/cambios_topologicos/{idx}` | Elimina un cambio topológico del feeder | `[x]` | `[x]` |

---

## API — Descarga de Reportes HTML

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 20 | POST | `/api/descargar_html` | Genera y descarga HTML de un traspaso individual | `[x]` | `[x]` |

---

## API — Ajustes de Demanda

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 21 | GET | `/api/ajustes` | Lista todos los ajustes activos (enriquecidos con nombre y valor SQL) | `[x]` | `[x]` |
| 22 | GET | `/api/ajustes/{tipo}/{numalim}` | Ajustes de un alimentador/trafo específico | `[x]` | `[x]` |
| 23 | POST | `/api/ajustes/{tipo}/{numalim}` | Guarda/actualiza ajustes. Body: `{"YYYY-MM": valor_float}` | `[x]` | `[x]` |
| 24 | DELETE | `/api/ajustes/{tipo}/{numalim}/{mes}` | Elimina el ajuste de un mes específico | `[x]` | `[x]` |

`{tipo}` puede ser: `"alim"` | `"trafo"`

---

## API — VCC (Verificación de Capacidad de Conexión)

| # | Método | Ruta | Descripción | PHP implementado | Probado |
|---|--------|------|-------------|-----------------|---------|
| 25 | GET | `/api/vcc/equipos/{nom_alim}` | Equipos del alimentador para VCC; `?modo=equipos` (default) o `?modo=tp` | `[x]` | `[x]` |
| 26 | POST | `/api/vcc/punto` | Busca el punto de conexión y equipos upstream | `[x]` | `[x]` |
| 27 | POST | `/api/vcc/evaluar` | Evalúa la VCC (delta I, cargabilidad alimentador + trafo + equipos) | `[x]` | `[x]` |
| 28 | POST | `/api/vcc/guardar` | Guarda evaluación VCC en JSON local | `[x]` | `[x]` |
| 29 | GET | `/api/vcc/historial_global` | Historial de todas las evaluaciones VCC (todos los alimentadores) | `[x]` | `[x]` |
| 30 | GET | `/api/vcc/{nombre}` | Historial VCC de un alimentador específico | `[x]` | `[x]` |
| 31 | DELETE | `/api/vcc/{nombre}/{idx}` | Elimina una evaluación VCC | `[x]` | `[x]` |
| 32 | POST | `/api/vcc/descargar_html` | Genera y descarga HTML del reporte VCC | `[x]` | `[x]` |

---

## Bugs corregidos (2026-06-11)

| # | Endpoint | Bug | Fix |
|---|----------|-----|-----|
| 15 | `GET /api/feeders_nuevos/{nombre}/transferencias/{idx}` | PHP usaba `$lista[$idx]` (índice de array 0-based) pero los `idx` en Memoria.php empiezan en 1 → off-by-one. Pedido idx=1 devolvía la segunda transferencia. | Cambiado a búsqueda por campo: `foreach ($lista as $t) { if ($t['idx'] === $idx) ... }` |
| 20 | `POST /api/descargar_html` | No construía ni pasaba `$ajustesInfo` a `generarReporteHtml`. El panel de ajustes de demanda nunca aparecía en reportes descargados desde el frontend. | Añadida construcción de `$_ajustesInfo` desde `ajustes_activos` + `serie_raw_*` + labels, pasado como último parámetro. |

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
