param(
  [string]$Repo = (Get-Location).Path,
  [string]$Branch = 'arena/bfc7d4d1-prontera-grind',
  [string]$BuildTag = 'haven-v447'
)

# Owner-run Windows handoff for the Rift stars/cards/cosmetics build.
#
#   1. Updates the local checkout to the latest GitHub main.
#   2. Materialises this feature branch in a throw-away git worktree and merges latest main into it.
#   3. Builds the site and deploys ONLY the isolated staging targets:
#        Pages:  prontera-grind-staging
#        Worker: prontera-social-staging
#        D1:     pg-staging (3a38c6fc-96a8-491d-b97b-fd536e575ca4)
#   4. Applies 0022 then 0023 to pg-staging only when their tables are absent.
#   5. Verifies the deployed version.txt reports this build.
#
# It never deploys horizonhaven, pg, prontera-social or prontera-gate. It refuses to continue if a
# production name/ID reaches the generated staging config. Wrangler must already be authenticated.

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$PagesProject = 'prontera-grind-staging'
$SocialProject = 'prontera-social-staging'
$DbName = 'pg-staging'
$DbId = '3a38c6fc-96a8-491d-b97b-fd536e575ca4'
$Wrangler = @('--yes', 'wrangler@4.154.0')

function Fail([string]$Message) { throw $Message }

function Invoke-Checked([string]$Exe, [string[]]$Arguments, [string]$Cwd) {
  Push-Location $Cwd
  try {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { Fail "$Exe $($Arguments -join ' ') failed (exit $LASTEXITCODE)." }
  } finally { Pop-Location }
}

function Invoke-Git([string[]]$Arguments, [string]$Cwd = $Repo) {
  # Use git.exe explicitly: a PowerShell function named "Git" shadows the native command and
  # would recurse into itself (the call-depth-overflow bug in the first handoff build).
  $output = & git.exe -C $Cwd @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "git $($Arguments -join ' ') failed (exit $LASTEXITCODE)." }
  return ($output -join "`n").Trim()
}

function Find-Bash {
  $candidates = @(
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files (x86)\Git\bin\bash.exe',
    'D:\Git\bin\bash.exe'
  )
  foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
  $cmd = Get-Command bash.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  Fail 'Cannot find Git Bash (bash.exe). Install Git for Windows or add bash.exe to PATH.'
}

function D1Json([string]$Sql, [string]$Cwd) {
  Push-Location $Cwd
  try {
    $raw = & npx @Wrangler d1 execute DB --remote --json --command $Sql 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "D1 query failed; check Wrangler login, the DB binding and the SQL.`nSQL: $Sql" }
    $text = ($raw -join "`n")
    $parsed = $text | ConvertFrom-Json
    $last = @($parsed)[-1]
    if ($null -eq $last) { return @() }
    return @($last.results)
  } finally { Pop-Location }
}

$repoFull = (Resolve-Path $Repo).Path
if (-not (Test-Path (Join-Path $repoFull '.git'))) { Fail "Not a git checkout: $repoFull" }

Write-Host "1/7 Fetching GitHub and updating local main in $repoFull"
$dirty = Invoke-Git @('status', '--porcelain')
if ($dirty) {
  Fail "Your checkout has local changes. Commit or stash them first; this handoff will not discard them.`n$dirty"
}
Invoke-Git @('fetch', 'origin', '--prune') | Out-Null
Invoke-Git @('switch', 'main') | Out-Null
Invoke-Git @('pull', '--ff-only', 'origin', 'main') | Out-Null
Write-Host ('    local main is ' + (Invoke-Git @('rev-parse', '--short', 'HEAD')))

Write-Host "2/7 Fetching $Branch"
Invoke-Git @('fetch', 'origin', $Branch) | Out-Null
$branchTip = Invoke-Git @('rev-parse', 'FETCH_HEAD')
$worktree = Join-Path ([System.IO.Path]::GetTempPath()) ('pg-rift-stage-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$completed = $false
Invoke-Git @('worktree', 'add', '--detach', $worktree, $branchTip) | Out-Null
try {
  Push-Location $worktree
  try {
    Write-Host '3/7 Merging latest origin/main into the staging worktree'
    & git.exe -c 'user.name=Prontera Staging' -c 'user.email=staging@local' merge --no-edit origin/main
    if ($LASTEXITCODE -ne 0) {
      Fail "The branch does not merge cleanly with main. Resolve it on GitHub, then rerun. Worktree kept at $worktree"
    }
  } finally { Pop-Location }

  $buildLine = Select-String -Path (Join-Path $worktree 'index.html') -Pattern "^const BUILD='([^']+)';" | Select-Object -First 1
  if (-not $buildLine) { Fail 'index.html has no BUILD label.' }
  $build = $buildLine.Matches.Groups[1].Value
  if ($build -notlike "*$BuildTag*") { Fail "Expected $BuildTag, got: $build" }

  Write-Host '4/7 Writing isolated staging config (no production names)'
  $pagesConfig = @"
name = "$PagesProject"
compatibility_date = "2026-10-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "$DbName"
database_id = "$DbId"

[[durable_objects.bindings]]
name = "SOCIAL"
class_name = "Social"
script_name = "$SocialProject"

[vars]
RAID_ENABLED = "true"
"@
  $socialConfig = @"
name = "$SocialProject"
main = "index.mjs"
compatibility_date = "2026-10-01"
workers_dev = false

[[durable_objects.bindings]]
name = "SOCIAL"
class_name = "Social"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Social"]
"@
  Set-Content -Path (Join-Path $worktree 'wrangler.toml') -Value $pagesConfig -Encoding ascii
  Set-Content -Path (Join-Path $worktree 'workers\social\wrangler.toml') -Value $socialConfig -Encoding ascii
  $forbidden = @('horizonhaven', '50a6448b-1f12-466c-a28a-10544bedf750', 'prontera-gate', '"prontera-social"', 'database_name = "pg"')
  foreach ($file in @('wrangler.toml', 'workers\social\wrangler.toml')) {
    $text = Get-Content (Join-Path $worktree $file) -Raw
    foreach ($name in $forbidden) { if ($text.Contains($name)) { Fail "Production name '$name' reached $file. Nothing was deployed." } }
  }

  Write-Host '5/7 Building the site (the checkout is untouched)'
  $bash = Find-Bash
  Push-Location $worktree
  try {
    & $bash 'tools/build_site.sh'
    if ($LASTEXITCODE -ne 0) { Fail 'tools/build_site.sh failed.' }
  } finally { Pop-Location }
  $built = (Get-Content (Join-Path $worktree 'dist\version.txt') -Raw).Trim()
  if ($built -ne $build) { Fail "Built version.txt is '$built', expected '$build'." }

  Write-Host "6/7 Verifying $DbName and applying only the missing raid migrations"
  Push-Location $worktree
  try {
    $dbRaw = & npx @Wrangler d1 info DB --json 2>$null
    if ($LASTEXITCODE -ne 0) { Fail 'wrangler d1 info failed; check Wrangler login and that the DB binding resolves.' }
    $dbInfo = (($dbRaw -join "`n") | ConvertFrom-Json)
    if ($dbInfo.name -ne $DbName -or $dbInfo.uuid -ne $DbId) {
      Fail "Refusing to write: remote DB is '$($dbInfo.name)' / '$($dbInfo.uuid)', not $DbName / $DbId."
    }
  } finally { Pop-Location }

  $tables = D1Json "SELECT name FROM sqlite_master WHERE type='table';" $worktree | ForEach-Object { $_.name }
  $hasRaid = $tables -contains 'raid_runs'
  $hasCards = $tables -contains 'raid_cards'
  $triggers = D1Json "SELECT name FROM sqlite_master WHERE type='trigger';" $worktree | ForEach-Object { $_.name }
  $hasCardTrigger = $triggers -contains 'raid_card_drop_apply'
  $grantCols = D1Json "PRAGMA table_info(grants);" $worktree | ForEach-Object { $_.name }
  $hasRef = $grantCols -contains 'ref'

  if (-not $hasRaid) {
    if ($hasRef) { Fail 'pg-staging has grants.ref but no raid_runs. Inspect it before retrying; nothing was applied.' }
    Write-Host '    applying 0022_player_character_raid.sql'
    Invoke-Checked 'npx' ($Wrangler + @('d1', 'execute', 'DB', '--remote', '--file=migrations/0022_player_character_raid.sql')) $worktree
  } elseif (-not $hasRef) {
    Fail 'pg-staging has raid_runs but no grants.ref. Inspect the partial 0022 state; nothing was applied.'
  } else {
    Write-Host '    0022 already present'
  }
  if (-not $hasCards -or -not $hasCardTrigger) {
    Write-Host '    applying 0023_raid_cards.sql'
    Invoke-Checked 'npx' ($Wrangler + @('d1', 'execute', 'DB', '--remote', '--file=migrations/0023_raid_cards.sql')) $worktree
  } else {
    Write-Host '    0023 already present'
  }

  Write-Host "7/7 Deploying $SocialProject first, then $PagesProject"
  Push-Location (Join-Path $worktree 'workers\social')
  try {
    & npx @Wrangler deploy
    if ($LASTEXITCODE -ne 0) { Fail 'Social Worker deploy failed; Pages was not deployed.' }
  } finally { Pop-Location }

  Push-Location $worktree
  try {
    $deployOutput = & npx @Wrangler pages deploy dist --project-name $PagesProject --branch main 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "Pages deploy failed: $($deployOutput -join ' ')" }
  } finally { Pop-Location }
  $url = (($deployOutput -join "`n") | Select-String -Pattern 'https://[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev' -AllMatches).Matches.Value | Select-Object -First 1
  if (-not $url) { $url = "https://main.$PagesProject.pages.dev" }

  try {
    $remote = (Invoke-WebRequest -UseBasicParsing -Uri ($url + '/version.txt?cache=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -TimeoutSec 60).Content.Trim()
    if ($remote -ne $build) { Write-Warning "Deployment finished, but $url/version.txt reports '$remote' instead of '$build'. Open the URL and check before testing." }
    else { Write-Host "    verified $url/version.txt" }
  } catch {
    Write-Warning "Deployment finished, but automatic version verification failed: $($_.Exception.Message)"
  }

  Write-Host ''
  Write-Host '============================================================'
  Write-Host ('Staged: ' + $build)
  Write-Host ('Open:   ' + $url)
  Write-Host ('Stable: https://main.' + $PagesProject + '.pages.dev')
  Write-Host 'Targets: prontera-grind-staging + prontera-social-staging + pg-staging only.'
  Write-Host 'Production was not touched. RAID_ENABLED is true only in the staging Pages config.'
  Write-Host '============================================================'
  Write-Host ''
  Write-Host 'Staging checks: solo clear, failed-run pity, Rift Forge (failure keeps stars), card drop/equip,'
  Write-Host 'first-clear aura and the Mastery Index -> Rift Raid title filter. Use synthetic accounts only.'
  $completed = $true
} finally {
  # Keep the worktree on failure for diagnosis; remove it only when the handoff completed cleanly.
  if ($worktree -and (Test-Path $worktree)) {
    if ($completed) {
      & git.exe -C $repoFull worktree remove --force $worktree 2>$null | Out-Null
    } else {
      Write-Host "Worktree kept for inspection: $worktree"
    }
  }
}
