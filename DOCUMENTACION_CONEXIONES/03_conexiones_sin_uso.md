# Conexiones declaradas sin uso

Dos singletons están definidos en `codigo_php/conexion.php` pero **ningún archivo del aplicativo los
invoca** (verificado por búsqueda: 0 llamadas a `db_retim(` / `db_agui(` fuera de su propia
definición). Existen como **costura** (seam) para reutilizar el patrón de conexión del ecosistema de
proyectos del servidor, pero hoy no aportan datos.

| Función      | Clave de config | Base de datos        | Llamadas en el código |
|--------------|-----------------|----------------------|-----------------------|
| `db_retim()` | `mysql_retim`   | `qv_server`          | 0                     |
| `db_agui()`  | `mysql_agui`    | `inf_tecnica_agui`   | 0                     |

## `db_retim()` → `qv_server`

Conexión a la base RETIM (`qv_server`). En otros módulos del servidor (p.ej. el módulo de fallas
relevantes / RETIM) esta base se usa para `qv_server.retim_eventos`, pero **este aplicativo de
traspasos no la consulta**. No se introspecta su esquema porque el proyecto no depende de él.

## `db_agui()` → `inf_tecnica_agui`

Conexión a la base de información técnica AGUI (`inf_tecnica_agui`). Sin uso en este proyecto; motivo
concreto no documentado en el código (probablemente heredada de la plantilla de conexión).

---

**Se pueden omitir sin afectar la app.** Si se depura `config.php`, los bloques `mysql_retim` y
`mysql_agui` (y sus funciones en `conexion.php`) pueden eliminarse sin romper nada. Conviene mantenerlos
solo si se planea leer esas bases más adelante.
