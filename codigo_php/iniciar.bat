@echo off
start "" cmd /c ^
"C:\Users\cl196792678\OneDrive - Enel Spa\Programation\00_SQL_PHP\PHP_856\php.exe -S localhost:8093 -t ""C:\Users\cl196792678\OneDrive - Enel Spa\Programation\00_SQL_PHP\PHP_tests\graficos_traspasos_php\codigo_php"""
timeout /t 2 >nul
start "" http://localhost:8093
