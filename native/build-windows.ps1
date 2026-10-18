param(
    [Parameter(Mandatory=$true)][string]$Toolchain,
    [Parameter(Mandatory=$true)][string]$PkgTool,
    [string]$Distribution = 'Ubuntu'
)
$ErrorActionPreference = 'Stop'
$taskSdk = (Resolve-Path -LiteralPath $Toolchain).Path
$taskPackager = (Resolve-Path -LiteralPath $PkgTool).Path
$taskLinuxRoot = (& wsl.exe -d $Distribution -- wslpath -a ($PSScriptRoot.Replace('\','/'))).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve WSL project path' }
$taskLinuxSdk = (& wsl.exe -d $Distribution -- wslpath -a ($taskSdk.Replace('\','/'))).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve WSL toolchain path' }
& wsl.exe -d $Distribution -- env "OO_PS4_TOOLCHAIN=$taskLinuxSdk" make -C $taskLinuxRoot prepare
if ($LASTEXITCODE -ne 0) { throw 'Native compilation or package preparation failed' }
Push-Location (Join-Path $PSScriptRoot 'build/package')
try {
    & $taskPackager pkg_build package.gp4 ..
    if ($LASTEXITCODE -ne 0) { throw 'Package assembly failed' }
} finally { Pop-Location }
$taskPackage = Join-Path $PSScriptRoot 'build/IV0000-ASTR00001_00-ASTORA0000000000.pkg'
Get-FileHash -LiteralPath $taskPackage -Algorithm SHA256
Write-Output 'Built experimental PS4 package. This does not verify console execution.'
