# Crea el repositorio "miminibasket" en tu GitHub, activa GitHub Pages y sube el proyecto.
# Ejecutar desde esta carpeta:  powershell -ExecutionPolicy Bypass -File .\publicar.ps1
function Paso($msg) { if ($LASTEXITCODE -ne 0) { Write-Host "ERROR en: $msg" -ForegroundColor Red; exit 1 } }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { scoop install gh; Paso 'instalar gh' }
cmd /c "gh auth status >nul 2>nul"
if ($LASTEXITCODE -ne 0) { gh auth login --web --git-protocol https; Paso 'iniciar sesion en GitHub' }
$login = gh api user --jq .login; Paso 'leer usuario'
$id = gh api user --jq .id; Paso 'leer usuario'

if (Test-Path .\workflow-publicar.yml) { New-Item -ItemType Directory -Force .github\workflows | Out-Null; Move-Item -Force .\workflow-publicar.yml .github\workflows\publicar.yml }
if (-not (Test-Path .git)) { git init -b main | Out-Null; Paso 'git init' }
git config user.name $login
git config user.email "$id+$login@users.noreply.github.com"
git add -A; Paso 'git add'
git commit -q -m "MiniBasket Alava: app recuperada + lector de basketaraba.com" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_01ASMDYTUw51c4r5AjnwR5BN"; Paso 'git commit'
gh repo create miminibasket --public --source . --remote origin --description "MiniBasket Alava (FAB): resultados y clasificaciones"; Paso 'crear repositorio'
gh api -X POST "repos/$login/miminibasket/pages" -f build_type=workflow | Out-Null; Paso 'activar GitHub Pages'
git push -u origin main; Paso 'subir a GitHub'

Write-Host ""
Write-Host "Hecho. En 1-2 minutos estara en: https://$login.github.io/miminibasket/" -ForegroundColor Green
Write-Host "Progreso de la publicacion: https://github.com/$login/miminibasket/actions"
