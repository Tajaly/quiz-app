targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment. Used for the resource group name and the unique resource token.')
param environmentName string

@minLength(1)
@description('Azure region for all resources. The serverless Cosmos DB account runs in this single region.')
param location string

@description('Object ID of the principal running the deployment (azd sets AZURE_PRINCIPAL_ID). Gets Cosmos DB data access so developers can run the app locally against Azure.')
param principalId string = ''

@description('Type of the deploying principal (azd sets AZURE_PRINCIPAL_TYPE). Service principals (CI) get no Cosmos DB data access.')
param principalType string = 'User'

@allowed([
  'guest'
  'entra'
])
@description('Host access mode. Guest hosting needs no account or Entra app registration.')
param authMode string = 'guest'

@maxLength(36)
@description('Application (client) ID for optional Entra sign-in. Created by the preprovision hook only when AUTH_MODE=entra.')
param entraClientId string = ''

@description('Tenant ID of the Entra ID app registration. Empty means the tenant of this deployment.')
param entraTenantId string = ''

@description('SKU of the App Service plan (single instance). P0v3 has no WebSocket connection cap; Basic plans (B1–B3) allow at most 350 concurrent WebSockets, too few for 300-player races.')
param appServicePlanSku string = 'P0v3'

var resourceToken = uniqueString(subscription().id, environmentName, location)
var tags = {
  'azd-env-name': environmentName
}
var cosmosDatabaseName = 'powerquiz'

resource rg 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    tags: tags
    logAnalyticsName: 'log-${resourceToken}'
    applicationInsightsName: 'appi-${resourceToken}'
  }
}

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  scope: rg
  params: {
    location: location
    tags: tags
    accountName: 'cosmos-${resourceToken}'
    databaseName: cosmosDatabaseName
  }
}

module web 'modules/appservice.bicep' = {
  name: 'web'
  scope: rg
  params: {
    location: location
    tags: tags
    planName: 'plan-${resourceToken}'
    appName: 'app-${resourceToken}'
    skuName: appServicePlanSku
    applicationInsightsName: monitoring.outputs.applicationInsightsName
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    // Read by the server. The module adds APPLICATIONINSIGHTS_CONNECTION_STRING and
    // ApplicationInsightsAgent_EXTENSION_VERSION; App Service injects PORT.
    appSettings: {
      NODE_ENV: 'production'
      AUTH_MODE: authMode
      ENTRA_TENANT_ID: empty(entraTenantId) ? tenant().tenantId : entraTenantId
      ENTRA_CLIENT_ID: entraClientId
      ENTRA_API_SCOPE_NAME: 'Quiz.Host'
      COSMOS_ENDPOINT: cosmos.outputs.endpoint
      COSMOS_DATABASE: cosmosDatabaseName
      RESULT_TTL_DAYS: '90'
      TRUST_PROXY: '1'
      // The deployed artifact is a prebuilt, fully bundled server; no Oryx build or node_modules.
      SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    }
  }
}

module webCosmosAccess 'modules/cosmos-role-assignment.bicep' = {
  name: 'cosmos-access-web'
  scope: rg
  params: {
    accountName: cosmos.outputs.name
    principalId: web.outputs.principalId
  }
}

module developerCosmosAccess 'modules/cosmos-role-assignment.bicep' = if (!empty(principalId) && principalType != 'ServicePrincipal') {
  name: 'cosmos-access-developer'
  scope: rg
  // Cosmos DB serializes control-plane writes per account; avoid concurrent role assignment writes.
  dependsOn: [
    webCosmosAccess
  ]
  params: {
    accountName: cosmos.outputs.name
    principalId: principalId
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output WEB_APP_NAME string = web.outputs.name
output WEB_URI string = web.outputs.uri
output COSMOS_ENDPOINT string = cosmos.outputs.endpoint
output COSMOS_DATABASE string = cosmosDatabaseName
