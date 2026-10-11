# MCPサーバーのテストを、ローカルSupabaseに対して Docker 上の Deno で実行する。
# 前提: Docker Desktop 起動中 / `npx supabase start` 済み。
# ローカルのキーは `supabase status -o env` から取得する（ファイルには書かない）。
#   使い方: powershell -File supabase/functions/mcp/tests/run.ps1 [deno testの追加引数]
#   HTTPレベルのテスト(mcp_http.test.ts)も実行するには、別途 `npx supabase functions serve mcp` を起動しておく。
param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Extra)

$ErrorActionPreference = 'Continue'  # supabase CLIの情報メッセージ(stderr)で止まらないようにする
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
Set-Location $root

$envLines = npx supabase status -o env 2>$null
function Get-EnvValue($name) {
  $line = $envLines | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { throw "$name が取得できません。npx supabase start 済みか確認してください。" }
  return ($line -replace "^$name=", '').Trim('"')
}

docker run --rm `
  -v "${root}:/app" -v deno-cache:/deno-dir -w /app/supabase/functions/mcp `
  -e SUPABASE_URL=http://host.docker.internal:54321 `
  -e "SUPABASE_PUBLISHABLE_KEY=$(Get-EnvValue 'PUBLISHABLE_KEY')" `
  -e "SUPABASE_SECRET_KEY=$(Get-EnvValue 'SECRET_KEY')" `
  denoland/deno:2.5.6 deno test --allow-net --allow-env --allow-read tests/ @Extra
exit $LASTEXITCODE
