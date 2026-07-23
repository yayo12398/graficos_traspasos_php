<?php
declare(strict_types=1);

// ── Credenciales ──────────────────────────────────────────────────────────────
$_cfg = require __DIR__ . '/config.php';

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
    // stub vacío — activar al migrar al sistema central
    // require_once PATH_CENTRAL . '/session.php';
}
