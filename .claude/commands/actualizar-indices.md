# Actualizar índices de navegación

Actualiza los bloques ╔══╗ de índice en los archivos fuente del proyecto que tienen cambios en esta sesión. Solo toca los archivos realmente modificados.

## Archivos objetivo

| Archivo | Índice cubre |
|---|---|
| `codigo_php/index.php` | helpers PHP + 33 endpoints API |
| `codigo_php/src/Datos.php` | funciones carga y topología |
| `codigo_php/src/Simulacion.php` | funciones de simulación |
| `codigo_php/src/Reportes.php` | helpers y generadores de reportes |
| `codigo_php/templates/index.html` | bloque `<script>` (~167 funciones JS) |

## Procedimiento

**Paso 1 — Detectar archivos modificados**

Ejecuta `git status` y filtra por los 5 archivos anteriores. Si el usuario mencionó en la sesión qué archivos editó, úsalos directamente. Solo procesa los que tienen cambios reales (staged o unstaged).

**Paso 2 — Para cada archivo modificado, obtener líneas reales**

```bash
# index.php — helpers y marcadores de rutas
grep -n "^function \|^// ── " codigo_php/index.php

# Datos.php / Simulacion.php / Reportes.php — funciones PHP
grep -n "^function " codigo_php/src/Datos.php
grep -n "^function " codigo_php/src/Simulacion.php
grep -n "^function " codigo_php/src/Reportes.php

# index.html — funciones JS (dentro del bloque <script>)
grep -n "^function \|^async function " codigo_php/templates/index.html
```

**Paso 3 — Comparar con el índice actual**

Lee las primeras ~130 líneas del archivo (donde está el bloque ╔══╗) y compara cada entrada `L.NNN` con los números reales del grep. Si hay discrepancias, el índice está desactualizado.

**Paso 4 — Actualizar solo los índices desactualizados**

Reemplaza el bloque ╔══╗ completo del archivo con los números corregidos. Mantén la misma estructura de secciones y descripciones; solo cambia los números.

**⚠ Precaución con index.html**: El bloque de índice tiene ~123 líneas propias. Al reemplazarlo con uno de diferente largo, todos los números subsiguientes se desplazan. Siempre verifica con grep *después* de editar el índice y corrige si es necesario.

**Paso 5 — Reportar resultado**

Indica qué archivos se actualizaron y cuáles ya estaban correctos (sin cambios).
