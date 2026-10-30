<#
.SYNOPSIS
    azd postprovision hook: registers the deployed site URL as a SPA redirect URI.

.DESCRIPTION
    Adds WEB_URI (a Bicep output) to spa.redirectUris of the Entra ID app registration ENTRA_CLIENT_ID,
    keeping the existing URIs. Never fails the deployment: in CI, without a logged-in Azure CLI or when
    the update is not possible, it prints how to add the redirect URI manually instead.

    Runs on PowerShell 7+ and Windows PowerShell 5.1 (azd falls back to it when pwsh is missing).
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$webUri = $env:WEB_URI
$clientId = $env:ENTRA_CLIENT_ID

# Runs az with the given arguments and returns stdout without showing errors; check $LASTEXITCODE afterwards.
function Invoke-AzQuiet {
    $ErrorActionPreference = 'Continue'
    & az @args 2>$null
}

function Exit-WithNote([string] $Reason) {
    if ($Reason) {
        Write-Host "Note: $Reason" -ForegroundColor Yellow
        Write-Host "  If it is not registered yet, add $webUri as a 'Single-page application' redirect URI of the app" -ForegroundColor Yellow
        Write-Host "  registration $clientId (Entra admin center > App registrations > Authentication), or run" -ForegroundColor Yellow
        Write-Host "  'azd hooks run postprovision' on a machine where 'az login' is done for that tenant." -ForegroundColor Yellow
    }
    Write-Host ''
    Write-Host "Power Quiz URL: $webUri" -ForegroundColor Green
    exit 0
}

if (-not $webUri) {
    Write-Host 'WEB_URI is not set; skipping the redirect URI update.'
    exit 0
}
if (-not $clientId) {
    Exit-WithNote 'ENTRA_CLIENT_ID is not set, so the app registration was not updated.'
}
if ($env:GITHUB_ACTIONS -eq 'true' -or $env:CI -eq 'true') {
    Exit-WithNote 'running in CI, so the Entra ID app registration is not changed here.'
}
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Exit-WithNote 'the Azure CLI (az) is not installed, so the app registration was not updated.'
}

try {
    $tenantId = Invoke-AzQuiet account show --query tenantId -o tsv
    if ($LASTEXITCODE -ne 0 -or -not $tenantId) {
        Exit-WithNote 'the Azure CLI is not logged in, so the app registration was not updated.'
    }

    $objectId = Invoke-AzQuiet ad app show --id $clientId --query id -o tsv
    if ($LASTEXITCODE -ne 0 -or -not $objectId) {
        Exit-WithNote "app registration $clientId was not found in tenant $tenantId (the tenant az is logged in to)."
    }

    $existingUris = @(Invoke-AzQuiet ad app show --id $clientId --query 'spa.redirectUris' -o tsv)
    if ($LASTEXITCODE -ne 0) {
        Exit-WithNote "could not read the redirect URIs of app registration $clientId."
    }
    if ($existingUris -contains $webUri) {
        Write-Host "$webUri is already a SPA redirect URI of app registration $clientId."
        Exit-WithNote ''
    }

    $redirectUris = New-Object System.Collections.Generic.List[string]
    foreach ($uri in ($existingUris + @($webUri))) {
        if ($uri -and -not $redirectUris.Contains($uri)) {
            $redirectUris.Add($uri)
        }
    }

    # The JSON body goes through a temp file because passing JSON on the command line to az.cmd is fragile.
    $bodyFile = [System.IO.Path]::GetTempFileName()
    try {
        $json = ConvertTo-Json -InputObject @{ spa = @{ redirectUris = $redirectUris.ToArray() } } -Depth 5
        [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding($false)))

        $ErrorActionPreference = 'Continue'
        & az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
            --headers 'Content-Type=application/json' `
            --body "@$bodyFile" | Out-Null
        $patchExitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
    }
    finally {
        Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
    if ($patchExitCode -ne 0) {
        Exit-WithNote 'updating the app registration failed (see the error above).'
    }
}
catch {
    Exit-WithNote "updating the app registration failed: $($_.Exception.Message)"
}

Write-Host "Added $webUri to the SPA redirect URIs of app registration $clientId."
Exit-WithNote ''
