<#
.SYNOPSIS
    azd preprovision hook: creates (or reuses) the Entra ID app registration for Power Quiz.

.DESCRIPTION
    A single-tenant app registration acts as both the SPA (MSAL, auth code + PKCE) and the API the
    SPA calls (delegated scope api://<appId>/Quiz.Host). ENTRA_CLIENT_ID and ENTRA_TENANT_ID are
    stored in the azd environment and passed to Bicep (infra/main.parameters.json).

    If ENTRA_CLIENT_ID is already set (azd exports environment values to hooks; CI sets it from
    repository variables) the script exits without calling the Azure CLI.

    Runs on PowerShell 7+ and Windows PowerShell 5.1 (azd falls back to it when pwsh is missing).
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$ScopeName = 'Quiz.Host'
$ScopeTitle = 'Host Power Quiz races'
$ScopeDescription = 'Allows the app to manage your quizzes and run live quiz sessions on your behalf.'
$GraphAppId = '00000003-0000-0000-c000-000000000000'
$GraphUserReadScopeId = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
$LocalRedirectUris = @('http://localhost:5173', 'http://localhost:3000')

# Runs az with the given arguments and returns stdout; throws when az fails.
function Invoke-Az {
    $ErrorActionPreference = 'Continue'
    $output = & az @args
    if ($LASTEXITCODE -ne 0) {
        throw "az $($args -join ' ') failed (exit code $LASTEXITCODE)."
    }
    $output
}

# Like Invoke-Az, but retries: Entra ID is eventually consistent, so a new app can briefly be "not found".
function Invoke-AzWithRetry {
    $ErrorActionPreference = 'Continue'
    for ($attempt = 1; ; $attempt++) {
        $output = & az @args
        if ($LASTEXITCODE -eq 0) {
            return $output
        }
        if ($attempt -ge 6) {
            throw "az $($args -join ' ') failed after $attempt attempts."
        }
        Write-Host '  Retrying in 10 seconds (waiting for Entra ID replication)...'
        Start-Sleep -Seconds 10
    }
}

# PATCHes the application object via Microsoft Graph. The JSON body goes through a temp file because
# passing JSON on the command line to az.cmd is fragile on Windows.
function Update-Application([string] $ObjectId, $Body) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    try {
        $json = ConvertTo-Json -InputObject $Body -Depth 10
        [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding($false)))
        Invoke-AzWithRetry rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications/$ObjectId" `
            --headers 'Content-Type=application/json' `
            --body "@$bodyFile" | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

function Set-AzdEnvValue([string] $Name, [string] $Value) {
    $ErrorActionPreference = 'Continue'
    if ($env:AZURE_ENV_NAME) {
        & azd env set $Name $Value --environment $env:AZURE_ENV_NAME
    }
    else {
        & azd env set $Name $Value
    }
    if ($LASTEXITCODE -ne 0) {
        throw "azd env set $Name failed (exit code $LASTEXITCODE)."
    }
}

if ($env:ENTRA_CLIENT_ID) {
    Write-Host "ENTRA_CLIENT_ID is already set ($env:ENTRA_CLIENT_ID); reusing that Entra ID app registration."
    exit 0
}

if ($env:GITHUB_ACTIONS -eq 'true' -or $env:CI -eq 'true') {
    Write-Host 'ENTRA_CLIENT_ID is not set. The app registration is not created in CI:' -ForegroundColor Red
    Write-Host '  set the ENTRA_CLIENT_ID and ENTRA_TENANT_ID repository variables' -ForegroundColor Red
    Write-Host '  ("azd pipeline config" copies them from your local azd environment).' -ForegroundColor Red
    exit 1
}

$tenantHint = '<tenant-id-or-domain>'
if ($env:AZURE_TENANT_ID) {
    $tenantHint = $env:AZURE_TENANT_ID
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host 'The Azure CLI (az) is needed once to create the Entra ID app registration.' -ForegroundColor Red
    Write-Host "Install it (https://aka.ms/install-azure-cli), run 'az login --tenant $tenantHint', then run azd again." -ForegroundColor Red
    exit 1
}

$ErrorActionPreference = 'Continue'
$tenantId = & az account show --query tenantId -o tsv 2>$null
$azExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($azExitCode -ne 0 -or -not $tenantId) {
    Write-Host 'The Azure CLI is not logged in. It is needed once to create the Entra ID app registration.' -ForegroundColor Red
    Write-Host "Run:  az login --tenant $tenantHint" -ForegroundColor Yellow
    Write-Host 'then run azd again.' -ForegroundColor Yellow
    exit 1
}

try {
    $signedInAs = Invoke-Az account show --query user.name -o tsv
    Write-Host "Setting up the Entra ID app registration in tenant $tenantId (signed in as $signedInAs)."
    if ($env:AZURE_TENANT_ID -and $env:AZURE_TENANT_ID -ne $tenantId) {
        Write-Host "Note: the Azure subscription is in tenant $env:AZURE_TENANT_ID; users will sign in through tenant $tenantId." -ForegroundColor Yellow
    }

    $displayName = "Power Quiz ($env:AZURE_ENV_NAME)"
    $isNew = $false
    $existingScopeIds = @()
    $existingRedirectUris = @()

    # One "appId<TAB>objectId" line per app registration with exactly this display name.
    $existingApps = @(Invoke-Az ad app list --display-name $displayName --query "[?displayName=='$displayName'].[appId, id]" -o tsv)
    if ($existingApps.Count -gt 1) {
        throw "Found $($existingApps.Count) app registrations named '$displayName'. Delete the duplicates, or pick one with 'azd env set ENTRA_CLIENT_ID <appId>'."
    }
    if ($existingApps.Count -eq 1) {
        $appId, $objectId = $existingApps[0] -split "`t"
        Write-Host "Reusing the existing app registration '$displayName' (client ID $appId)."
        $existingScopeIds = @(Invoke-Az ad app show --id $appId --query "api.oauth2PermissionScopes[?value=='$ScopeName'].id" -o tsv)
        $existingRedirectUris = @(Invoke-Az ad app show --id $appId --query 'spa.redirectUris' -o tsv)
    }
    else {
        Write-Host "Creating the app registration '$displayName'..."
        # Prints appId and objectId on two lines.
        $created = @(Invoke-Az ad app create --display-name $displayName --sign-in-audience AzureADMyOrg --query '[appId, id]' -o tsv)
        $appId = $created[0]
        $objectId = $created[1]
        $isNew = $true
    }

    # Keep the scope ID of an existing registration: Graph refuses to replace an enabled scope.
    $scopeId = [guid]::NewGuid().ToString()
    if ($existingScopeIds.Count -gt 0 -and $existingScopeIds[0]) {
        $scopeId = $existingScopeIds[0]
    }

    $redirectUris = New-Object System.Collections.Generic.List[string]
    foreach ($uri in ($existingRedirectUris + $LocalRedirectUris)) {
        if ($uri -and -not $redirectUris.Contains($uri)) {
            $redirectUris.Add($uri)
        }
    }

    $scope = [ordered]@{
        id                      = $scopeId
        value                   = $ScopeName
        type                    = 'User'
        isEnabled               = $true
        adminConsentDisplayName = $ScopeTitle
        adminConsentDescription = $ScopeDescription
        userConsentDisplayName  = $ScopeTitle
        userConsentDescription  = $ScopeDescription
    }

    Write-Host "Configuring SPA redirect URIs ($($redirectUris -join ', ')), api://$appId and the $ScopeName scope..."
    Update-Application $objectId ([ordered]@{
            identifierUris         = @("api://$appId")
            spa                    = @{ redirectUris = $redirectUris.ToArray() }
            api                    = [ordered]@{
                requestedAccessTokenVersion = 2
                oauth2PermissionScopes      = @($scope)
            }
            requiredResourceAccess = @(
                [ordered]@{
                    resourceAppId  = $GraphAppId
                    resourceAccess = @(@{ id = $GraphUserReadScopeId; type = 'Scope' })
                }
            )
        })

    # The scope must exist before the app can be pre-authorized for it (no consent prompt for its own API).
    Write-Host "Pre-authorizing the SPA for its own $ScopeName scope..."
    Update-Application $objectId ([ordered]@{
            api = [ordered]@{
                requestedAccessTokenVersion = 2
                oauth2PermissionScopes      = @($scope)
                preAuthorizedApplications   = @(
                    [ordered]@{
                        appId                  = $appId
                        delegatedPermissionIds = @($scopeId)
                    }
                )
            }
        })

    $servicePrincipalIds = @(Invoke-Az ad sp list --filter "appId eq '$appId'" --query '[].id' -o tsv)
    if ($servicePrincipalIds.Count -eq 0) {
        Write-Host 'Creating the service principal (enterprise application)...'
        Invoke-AzWithRetry ad sp create --id $appId --query id -o tsv | Out-Null
    }

    Set-AzdEnvValue 'ENTRA_CLIENT_ID' $appId
    Set-AzdEnvValue 'ENTRA_TENANT_ID' $tenantId
}
catch {
    Write-Host ''
    Write-Host "Could not set up the Entra ID app registration: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'If your account may not register applications in this tenant (for example the Microsoft corporate' -ForegroundColor Yellow
    Write-Host "tenant), sign in to a tenant where you can ('az login --tenant <tenant>') and run azd again, or let an" -ForegroundColor Yellow
    Write-Host 'admin create the registration and then run:' -ForegroundColor Yellow
    Write-Host '  azd env set ENTRA_CLIENT_ID <application-client-id>' -ForegroundColor Yellow
    Write-Host '  azd env set ENTRA_TENANT_ID <tenant-id>' -ForegroundColor Yellow
    exit 1
}

$state = 'Updated'
if ($isNew) {
    $state = 'Created'
}
Write-Host ''
Write-Host "$state Entra ID app registration '$displayName':" -ForegroundColor Green
Write-Host "  Client ID : $appId"
Write-Host "  Tenant ID : $tenantId"
Write-Host "  API scope : api://$appId/$ScopeName"
Write-Host 'Saved ENTRA_CLIENT_ID and ENTRA_TENANT_ID in the azd environment.'
