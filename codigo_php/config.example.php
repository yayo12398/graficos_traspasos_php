<?php
// Copia este archivo a config.php y rellena con las credenciales reales.

return [

    // Base de datos principal — topología y demandas (meyg)
    'mysql_cuadrilla' => [
        'host'     => 'SERVIDOR',
        'user'     => 'USUARIO',
        'password' => 'CONTRASEÑA',
        'database' => 'meyg',
        'charset'  => 'utf8mb4',
    ],

    // Base de datos RETIM
    'mysql_retim' => [
        'host'     => 'SERVIDOR',
        'user'     => 'USUARIO',
        'password' => 'CONTRASEÑA',
        'database' => 'qv_server',
        'charset'  => 'utf8mb4',
    ],

    // Base de datos AGUI
    'mysql_agui' => [
        'host'     => 'SERVIDOR',
        'user'     => 'USUARIO',
        'password' => 'CONTRASEÑA',
        'database' => 'inf_tecnica_agui',
        'charset'  => 'utf8mb4',
    ],

];
