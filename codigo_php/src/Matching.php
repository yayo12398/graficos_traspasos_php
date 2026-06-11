<?php
declare(strict_types=1);

/**
 * Matching.php — Normalización y slugificación de nombres de alimentadores.
 *
 * Equivalente PHP de traspaso/matching.py.
 *
 * Nota: en Python, matching.py re-exporta nombre_display_alim() desde datos.py para
 *       compatibilidad hacia atrás. En PHP no hay namespaces: incluir Datos.php hace
 *       que nombreDisplayAlim() sea directamente accesible en todo el proyecto.
 *       Con la migración a SQL + NUMALIM, el fuzzy-matching ya no es necesario;
 *       se conservan solo las utilidades de texto usadas en reportes, VCC y slugs.
 */

// ─── Patrones compilados (constantes de módulo) ───────────────────────────

const _MATCH_PREFIJOS  = '/^(ALIM\.?\s+|ALIMENTADOR\.?\s+|TRAFO\.?\s+|TR\.?\s+)/i';
const _MATCH_ARTICULOS = '/\b(EL|LA|LOS|LAS|DE|DEL|LO)\b\s*/u';

// ─── Funciones públicas ───────────────────────────────────────────────────

/**
 * Normaliza texto para comparación: sin acentos, sin prefijos, mayúsculas.
 *
 * Equivalente a normalizar() de Python.
 *
 * Pasos:
 *  1. Descomposición NFD + strip de combinantes (elimina tildes/diéresis)
 *  2. Mayúsculas; reemplaza &→Y, Ñ→N, °→espacio
 *  3. Elimina prefijos "ALIM.", "ALIMENTADOR.", "TRAFO.", "TR."
 *  4. Elimina artículos EL/LA/LOS/LAS/DE/DEL/LO
 *  5. Conserva solo A-Z, 0-9 y espacio
 *  6. Colapsa espacios múltiples
 */
function normalizar(string $s): string
{
    if ($s === '' || in_array(strtolower(trim($s)), ['nan', 'none', ''], true)) {
        return '';
    }

    // NFKD (misma forma que Python) + strip combining chars (tildes, diéresis, cedilla…)
    // NFKD descompone también ligaduras/super-índices; NFD solo haría tildes
    if (class_exists('Normalizer')) {
        $s = \Normalizer::normalize($s, \Normalizer::NFKD);
    }
    // Elimina caracteres combinantes Unicode (U+0300–U+036F y bloques extendidos)
    $s = (string) preg_replace('/\p{M}/u', '', $s);

    $s = mb_strtoupper($s, 'UTF-8');
    $s = str_replace(['&', 'Ñ', 'ñ', '°'], [' Y ', 'N', 'N', ' '], $s);

    // Elimina prefijos al inicio
    $s = (string) preg_replace(_MATCH_PREFIJOS, '', $s);

    // Elimina artículos como palabras completas
    $s = (string) preg_replace(_MATCH_ARTICULOS, ' ', $s);

    // Solo A-Z, 0-9 y espacio
    $s = (string) preg_replace('/[^A-Z0-9 ]+/', ' ', $s);

    return trim((string) preg_replace('/\s+/', ' ', $s));
}

/**
 * Genera un slug apto para nombres de archivo a partir de un nombre de alimentador.
 *
 * Equivalente a _slug() de Python (expuesta como slugFeeder en PHP).
 *
 * Ejemplo: "Alim. Los Aromos 2" → "LOS_AROMOS_2"
 */
function slugFeeder(string $s): string
{
    $norm = normalizar($s);
    $slug = (string) preg_replace('/[^\w]+/', '_', $norm);
    return trim($slug, '_');
}
