<?php
declare(strict_types=1);

/**
 * Ajustes.php — Ajustes manuales de demanda por alimentador o trafo.
 *
 * Equivalente PHP de traspaso/ajustes.py.
 *
 * Permite reemplazar valores anómalos en la serie mensual de un alimentador
 * o trafo (identificados por numalim) con el valor real estimado por el usuario.
 *
 * Persistencia: data/ajustes_demanda.json
 * Estructura:
 *   {
 *     "alim":  {"12345": {"2024-01": 320.5, ...}},
 *     "trafo": {"12345": {"2024-01": 180.0, ...}}
 *   }
 */

// ─── Ruta del archivo de persistencia ─────────────────────────────────────

function _ajPath(): string
{
    // __DIR__ = codigo_php/src  →  dirname = codigo_php  →  data/ajustes_demanda.json
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'ajustes_demanda.json';
}

// ─── Helpers de persistencia ──────────────────────────────────────────────

function _ajCargar(): array
{
    $path = _ajPath();
    if (!file_exists($path)) {
        return ['alim' => [], 'trafo' => []];
    }
    $raw = file_get_contents($path);
    if ($raw === false) throw new RuntimeException("No se pudo leer: $path");
    return (array) json_decode($raw, associative: true, flags: JSON_THROW_ON_ERROR);
}

function _ajGuardar(array $data): void
{
    $path = _ajPath();
    $dir  = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, recursive: true);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    if (file_put_contents($path, $json, LOCK_EX) === false) {
        throw new RuntimeException("No se pudo escribir: $path");
    }
}

// ─── API pública ──────────────────────────────────────────────────────────

/**
 * Retorna los ajustes activos para (tipo, numalim).
 *
 * @param string $tipo    'alim' | 'trafo'
 * @param int    $numalim Identificador del alimentador o trafo
 * @return array          ['YYYY-MM' => float, ...]
 *
 * Equivalente a get_ajustes() de Python.
 */
function getAjustes(string $tipo, int $numalim): array
{
    $data = _ajCargar();
    return $data[$tipo][(string)$numalim] ?? [];
}

/**
 * Guarda o actualiza ajustes para (tipo, numalim).
 * Pasar null como valor elimina ese mes del ajuste.
 *
 * @param string $tipo    'alim' | 'trafo'
 * @param int    $numalim Identificador
 * @param array  $cambios ['YYYY-MM' => float|null, ...]
 *
 * Equivalente a set_ajustes() de Python.
 */
function setAjustes(string $tipo, int $numalim, array $cambios): void
{
    $data = _ajCargar();
    if (!isset($data[$tipo])) $data[$tipo] = [];

    $key     = (string)$numalim;
    $current = $data[$tipo][$key] ?? [];

    foreach ($cambios as $mes => $val) {
        if ($val === null) {
            unset($current[$mes]);
        } else {
            $current[$mes] = (float)$val;
        }
    }

    if ($current) {
        $data[$tipo][$key] = $current;
    } else {
        unset($data[$tipo][$key]);
    }

    _ajGuardar($data);
}

/**
 * Elimina el ajuste de un mes específico para (tipo, numalim).
 *
 * @param string $tipo    'alim' | 'trafo'
 * @param int    $numalim Identificador
 * @param string $mes     'YYYY-MM'
 *
 * Equivalente a del_ajuste() de Python.
 */
function delAjuste(string $tipo, int $numalim, string $mes): void
{
    $data = _ajCargar();
    $key  = (string)$numalim;

    if (isset($data[$tipo][$key])) {
        unset($data[$tipo][$key][$mes]);
        if (empty($data[$tipo][$key])) {
            unset($data[$tipo][$key]);
        }
    }

    _ajGuardar($data);
}

/**
 * Aplica los ajustes guardados a una serie mensual.
 * Solo sobreescribe los meses que existen en la serie.
 *
 * @param array  $serie   ['YYYY-MM' => float|null, ...]
 * @param string $tipo    'alim' | 'trafo'
 * @param int    $numalim Identificador
 * @return array          Serie con valores ajustados
 *
 * Equivalente a aplicar() de Python.
 * PHP copia arrays por valor, así que no hace falta .copy() explícito.
 */
function aplicarAjustes(array $serie, string $tipo, int $numalim): array
{
    $ajustes = getAjustes($tipo, $numalim);
    if (!$ajustes) return $serie;

    foreach ($ajustes as $mes => $val) {
        if (array_key_exists($mes, $serie)) {
            $serie[$mes] = (float)$val;
        }
    }
    return $serie;
}

/**
 * Aplica ajustes a las columnas de mes de una fila de trafo/alim.
 * Solo toca columnas con formato YYYY-MM que existan en la fila.
 *
 * @param array  $row     Fila asociativa con claves YYYY-MM y metadatos
 * @param string $tipo    'alim' | 'trafo'
 * @param int    $numalim Identificador
 * @return array          Fila con valores ajustados
 *
 * Equivalente a aplicar_fila() de Python.
 */
function aplicarAjustesFila(array $row, string $tipo, int $numalim): array
{
    $ajustes = getAjustes($tipo, $numalim);
    if (!$ajustes) return $row;

    foreach ($ajustes as $mes => $val) {
        if (array_key_exists($mes, $row) && preg_match('/^\d{4}-\d{2}$/', $mes)) {
            $row[$mes] = (float)$val;
        }
    }
    return $row;
}

/**
 * Extrae {'YYYY-MM' => float|null} de las columnas de mes de una fila de trafo/alim.
 *
 * @param array|null $row Fila asociativa (puede ser null para feeder sin trafo)
 * @return array          ['YYYY-MM' => float|null, ...]
 *
 * Equivalente a serie_raw_de_fila() de Python.
 */
function serieRawDeFila(?array $row): array
{
    if ($row === null) return [];

    $serie = [];
    foreach ($row as $col => $val) {
        if (is_string($col) && preg_match('/^\d{4}-\d{2}$/', $col)) {
            $serie[$col] = ($val !== null && is_numeric($val) && is_finite((float)$val))
                ? (float)$val
                : null;
        }
    }
    return $serie;
}
