<?php
declare(strict_types=1);

// ── Credenciales ──────────────────────────────────────────────────────────────
// En desarrollo local config.php existe (gitignoreado). En deploy no se incluye
// y se usan los valores de abajo directamente.
$_cfg = file_exists(__DIR__ . '/config.php')
    ? require __DIR__ . '/config.php'
    : [
        'mysql_cuadrilla' => [
            'host'     => 'ewaahicdca00',
            'user'     => 'OperAnalisys',
            'password' => 'ArrozConHuevo#56',
            'database' => 'meyg',
            'charset'  => 'utf8mb4',
        ],
        'mysql_retim' => [
            'host'     => 'ewaahicdca00',
            'user'     => 'user_nmt',
            'password' => 'Config2024#',
            'database' => 'qv_server',
            'charset'  => 'utf8mb4',
        ],
        'mysql_agui' => [
            'host'     => 'ewaahicdca00',
            'user'     => 'OperAnalisys',
            'password' => 'ArrozConHuevo#56',
            'database' => 'inf_tecnica_agui',
            'charset'  => 'utf8mb4',
        ],
        'mysql_tlc' => [
            'host'     => 'ewaahicdca00',
            'user'     => 'OperAnalisys',
            'password' => 'ArrozConHuevo#56',
            'database' => 'telecontrol_systems',
            'charset'  => 'utf8mb4',
        ],
    ];

// ── Singletons de conexión PDO ────────────────────────────────────────────────

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    global $_cfg;
    $c = $_cfg['mysql_cuadrilla'];
    $dsn = "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']};connect_timeout=20";
    $pdo = new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        Pdo\Mysql::ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
    return $pdo;
}

function db_retim(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    global $_cfg;
    $c = $_cfg['mysql_retim'];
    $dsn = "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']};connect_timeout=20";
    $pdo = new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        Pdo\Mysql::ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
    return $pdo;
}

function db_agui(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    global $_cfg;
    $c = $_cfg['mysql_agui'];
    $dsn = "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']};connect_timeout=20";
    $pdo = new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        Pdo\Mysql::ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
    return $pdo;
}

function db_tlc(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    global $_cfg;
    $c = $_cfg['mysql_tlc'];
    $dsn = "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']};connect_timeout=20";
    $pdo = new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        Pdo\Mysql::ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
    return $pdo;
}

// ── Helpers globales ──────────────────────────────────────────────────────────

function e(?string $v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

function require_login(): void {
    $session = dirname(__DIR__) . '/session.php';
    if (file_exists($session)) {
        require_once $session;
    }
}
