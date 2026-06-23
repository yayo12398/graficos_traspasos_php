<?php
declare(strict_types=1);

/**
 * AlimentadoresConfig.php — Configuración persistente por alimentador (nom_alim).
 *
 * Almacena conductores intermedios de cuello de botella entre pares de equipos
 * upstream, identificados por (entre_a, entre_b). La fracción se recalcula
 * conservadoramente en el frontend (usa fraccion del equipo upstream = entre_b).
 *
 * Persistencia: data/alimentadores_config.json
 * Estructura:
 *   {
 *     "NOM73123": {
 *       "conductores_intermedios": [
 *         {
 *           "entre_a": "CLB101976",
 *           "entre_b": "REC102921",
 *           "corriente_a": 150,
 *           "fecha_registro": "YYYY-MM-DD"
 *         }
 *       ]
 *     }
 *   }
 */

function _acPath(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'alimentadores_config.json';
}

function _acLoad(): array
{
    $path = _acPath();
    if (!file_exists($path)) return [];
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function _acSave(array $data): void
{
    file_put_contents(
        _acPath(),
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
}

function acGetAlim(string $nom): ?array
{
    $data = _acLoad();
    return $data[$nom] ?? null;
}

function acSetAlim(string $nom, array $body): array
{
    $data     = _acLoad();
    $existing = $data[$nom] ?? [];

    $conductores = [];
    foreach ($body['conductores_intermedios'] ?? [] as $c) {
        $entreA = trim((string)($c['entre_a'] ?? ''));
        $entreB = trim((string)($c['entre_b'] ?? ''));
        $cn     = isset($c['corriente_a']) && is_numeric($c['corriente_a'])
                    ? (float)$c['corriente_a'] : null;
        if (!$entreA || !$entreB || !$cn || $cn <= 0) continue;
        $conductores[] = [
            'entre_a'        => $entreA,
            'entre_b'        => $entreB,
            'corriente_a'    => $cn,
            'fecha_registro' => date('Y-m-d'),
        ];
    }

    $entry       = array_merge($existing, ['conductores_intermedios' => $conductores]);
    $data[$nom]  = $entry;
    _acSave($data);
    return $entry;
}

function acDeleteAlim(string $nom): void
{
    $data = _acLoad();
    unset($data[$nom]);
    _acSave($data);
}
