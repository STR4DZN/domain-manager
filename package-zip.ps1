$root = $PSScriptRoot
if (-not $root) { $root = "c:\Users\fusio\Documents\A1\domain-manager" }

$mod = Get-Content (Join-Path $root "module.json") -Raw | ConvertFrom-Json
$ver = $mod.version
$dist = Join-Path $root "dist"
$temp = Join-Path $root "temp_build\domain-manager"

if (Test-Path (Join-Path $root "temp_build")) {
    Remove-Item -Recurse -Force (Join-Path $root "temp_build")
}
New-Item -ItemType Directory -Path $temp -Force | Out-Null

Copy-Item (Join-Path $root "module.json") -Destination $temp
Copy-Item (Join-Path $root "package.json") -Destination $temp
Copy-Item (Join-Path $root "README.md") -Destination $temp
if (Test-Path (Join-Path $root "LICENSE")) {
    Copy-Item (Join-Path $root "LICENSE") -Destination $temp
}
Copy-Item -Recurse (Join-Path $root "scripts") -Destination $temp
Copy-Item -Recurse (Join-Path $root "styles") -Destination $temp
Copy-Item -Recurse (Join-Path $root "templates") -Destination $temp
Copy-Item -Recurse (Join-Path $root "lang") -Destination $temp
Copy-Item -Recurse (Join-Path $root "packs") -Destination $temp
if (Test-Path (Join-Path $root "assets")) {
    Copy-Item -Recurse (Join-Path $root "assets") -Destination $temp
}

if (-not (Test-Path $dist)) {
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
}

$verZip = Join-Path $dist "domain-manager-v$ver.zip"
$genZip = Join-Path $dist "domain-manager.zip"

if (Test-Path $verZip) { Remove-Item -Force $verZip }
if (Test-Path $genZip) { Remove-Item -Force $genZip }

Compress-Archive -Path $temp -DestinationPath $verZip -Force
Copy-Item $verZip -Destination $genZip -Force
Remove-Item -Recurse -Force (Join-Path $root "temp_build")

Write-Host "SUCCESS: domain-manager-v$ver.zip and domain-manager.zip created successfully!"
