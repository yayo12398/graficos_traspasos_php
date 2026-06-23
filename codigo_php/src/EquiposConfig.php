<?php
declare(strict_types=1);

/**
 * EquiposConfig.php — Configuración persistente por equipo (numpos).
 *
 * Almacena límites operativos, tipo de límite, notas e historial de cambios
 * para equipos de la red MT (reconectadores, conductores, fusibles, etc.).
 *
 * Persistencia: data/equipos_config.json
 * Estructura:
 *   {
 *     "REC12345": {
 *       "corriente_a": 200,
 *       "tipo_limite": "setpoint",          // setpoint | conductor | fusible
 *       "corriente_conductor_a": null,       // solo subterráneos con fusible
 *       "es_hdlb": null,                    // solo PPF: true | false
 *       "notas": "",
 *       "fecha_registro": "YYYY-MM-DD",
 *       "historial": [
 *         {"fecha": "YYYY-MM-DD", "valor_anterior": X, "valor_nuevo": Y, "notas": ""}
 *       ]
 *     }
 *   }
 *
 * tipo_limite se infiere del prefijo si no se provee:
 *   REC, RTS       → setpoint
 *   PPF            → fusible
 *   SEM, CLB, DBC  → conductor
 *   ORM, SCH, ABB, GMT, CGP, GMT → conductor (puede ser fusible si el ingeniero lo indica)
 */

// ─── Prefijos por tipo de límite ──────────────────────────────────────────

const EC_TIPO_SETPOINT  = ['REC', 'RTS'];
const EC_TIPO_FUSIBLE   = ['PPF'];
const EC_TIPO_CONDUCTOR = ['SEM', 'CLB', 'DBC', 'ORM', 'SCH', 'ABB', 'GMT', 'CGP'];

function ecTipoLimitePorDefecto(string $numpos): string
{
    $pref = strtoupper((string) preg_replace('/[^A-Za-z].*/', '', $numpos));
    if (in_array($pref, EC_TIPO_SETPOINT,  true)) return 'setpoint';
    if (in_array($pref, EC_TIPO_FUSIBLE,   true)) return 'fusible';
    return 'conductor';
}

function ecEsPPF(string $numpos): bool
{
    $pref = strtoupper((string) preg_replace('/[^A-Za-z].*/', '', $numpos));
    return $pref === 'PPF';
}

// ─── Ruta del archivo ─────────────────────────────────────────────────────

function _ecPath(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'equipos_config.json';
}

// ─── Helpers de persistencia ──────────────────────────────────────────────

function _ecCargar(): array
{
    $path = _ecPath();
    if (!file_exists($path)) return [];
    $raw = file_get_contents($path);
    if ($raw === false) throw new RuntimeException("No se pudo leer: $path");
    if (trim($raw) === '' || trim($raw) === '{}') return [];
    return (array) json_decode($raw, associative: true, flags: JSON_THROW_ON_ERROR);
}

function _ecGuardar(array $data): void
{
    $path = _ecPath();
    $dir  = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, recursive: true);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    if (file_put_contents($path, $json, LOCK_EX) === false) {
        throw new RuntimeException("No se pudo escribir: $path");
    }
}

// ─── API pública ──────────────────────────────────────────────────────────

/** Retorna la configuración de un equipo, o null si no existe. */
function ecGetEquipo(string $numpos): ?array
{
    $data = _ecCargar();
    return $data[$numpos] ?? null;
}

/** Retorna todas las configuraciones. */
function ecGetTodos(): array
{
    return _ecCargar();
}

/**
 * Crea o actualiza la configuración de un equipo.
 *
 * Campos aceptados en $campos:
 *   corriente_a          float   — límite operativo (obligatorio al crear)
 *   tipo_limite          string  — setpoint | conductor | fusible
 *   corriente_conductor_a float|null
 *   es_hdlb              bool|null
 *   notas                string
 *
 * Si ya existía y corriente_a cambia, agrega entrada al historial.
 */
function ecSetEquipo(string $numpos, array $campos): array
{
    $data    = _ecCargar();
    $hoy     = date('Y-m-d');
    $existia = $data[$numpos] ?? null;

    if ($existia === null) {
        // Entrada nueva
        $data[$numpos] = [
            'corriente_a'           => isset($campos['corriente_a']) ? (float)$campos['corriente_a'] : null,
            'tipo_limite'           => $campos['tipo_limite'] ?? ecTipoLimitePorDefecto($numpos),
            'corriente_conductor_a' => isset($campos['corriente_conductor_a']) ? (float)$campos['corriente_conductor_a'] : null,
            'es_hdlb'               => isset($campos['es_hdlb']) ? (bool)$campos['es_hdlb'] : null,
            'notas'                 => $campos['notas'] ?? '',
            'fecha_registro'        => $hoy,
            'historial'             => [],
        ];
    } else {
        $entry = $existia;

        // Historial solo si corriente_a cambia
        if (isset($campos['corriente_a'])) {
            $nuevo = (float)$campos['corriente_a'];
            if ($entry['corriente_a'] !== null && abs($entry['corriente_a'] - $nuevo) > 0.001) {
                $entry['historial'][] = [
                    'fecha'          => $hoy,
                    'valor_anterior' => $entry['corriente_a'],
                    'valor_nuevo'    => $nuevo,
                    'notas'          => $campos['notas_historial'] ?? '',
                ];
            }
            $entry['corriente_a'] = $nuevo;
        }

        if (isset($campos['tipo_limite']))           $entry['tipo_limite']           = $campos['tipo_limite'];
        if (array_key_exists('corriente_conductor_a', $campos))
                                                     $entry['corriente_conductor_a'] = isset($campos['corriente_conductor_a']) ? (float)$campos['corriente_conductor_a'] : null;
        if (array_key_exists('es_hdlb', $campos))    $entry['es_hdlb']               = isset($campos['es_hdlb']) ? (bool)$campos['es_hdlb'] : null;
        if (array_key_exists('notas', $campos))      $entry['notas']                 = (string)$campos['notas'];

        $data[$numpos] = $entry;
    }

    _ecGuardar($data);
    return $data[$numpos];
}

/** Elimina la configuración de un equipo. */
function ecDeleteEquipo(string $numpos): void
{
    $data = _ecCargar();
    if (isset($data[$numpos])) {
        unset($data[$numpos]);
        _ecGuardar($data);
    }
}
