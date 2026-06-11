# ============================================================
# setup_permisos.ps1
# Ejecutar UNA vez en el servidor, como Administrador,
# después de copiar la carpeta codigo_php al destino.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File setup_permisos.ps1
# ============================================================

# ── AJUSTAR ESTA RUTA según donde se copió codigo_php ────────
$base = "C:\inetpub\wwwroot\AMEyAO\graficos_traspasos"
# ─────────────────────────────────────────────────────────────

# Identidad del application pool de IIS (valor típico; ajustar si es distinto)
$account = "IIS_IUSRS"

Write-Host ""
Write-Host "=== Setup de permisos IIS para graficos_traspasos ===" -ForegroundColor Cyan
Write-Host "Ruta base : $base"
Write-Host "Cuenta IIS: $account"
Write-Host ""

# Verificar que la ruta existe
if (-not (Test-Path $base)) {
    Write-Host "ERROR: No se encontro la carpeta $base" -ForegroundColor Red
    Write-Host "Ajuste la variable `$base al inicio del script y vuelva a ejecutar."
    exit 1
}

# Carpetas que PHP necesita escribir
$writeFolders = @(
    "$base\data\cache",
    "$base\data\reportes",
    "$base\feeders_nuevos",
    "$base\vcc_evaluaciones",
    "$base\resultados"
)

# Crear carpetas si no existen y aplicar permisos de modificación
foreach ($folder in $writeFolders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Force $folder | Out-Null
        Write-Host "Creada : $folder" -ForegroundColor Yellow
    }
    icacls $folder /grant "${account}:(OI)(CI)M" /T | Out-Null
    Write-Host "Permiso OK: $folder" -ForegroundColor Green
}

Write-Host ""
Write-Host "Listo. Pasos siguientes:" -ForegroundColor Cyan
Write-Host "  1. Copie config.example.php -> config.php y complete las credenciales MySQL"
Write-Host "  2. Abra http://<servidor>/<ruta>/ para verificar"
Write-Host "  3. Use el boton de refresco en la navbar para cargar el cache inicial desde SQL"
Write-Host ""
