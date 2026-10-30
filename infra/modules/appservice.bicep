@description('Azure region for the App Service plan and web app.')
param location string

@description('Tags applied to all resources.')
param tags object

@description('Name of the App Service plan.')
param planName string

@description('Name of the web app.')
param appName string

@description('SKU of the App Service plan, e.g. B1.')
param skuName string

@description('App settings (environment variables) for the server.')
param appSettings object

@description('Name of the Application Insights component used for codeless monitoring.')
param applicationInsightsName string

@description('Resource ID of the Log Analytics workspace that receives the App Service logs.')
param logAnalyticsWorkspaceId string

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

var settings = union(appSettings, {
  APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString
  // Codeless Application Insights agent for Node.js on Linux.
  ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
})

resource plan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: skuName
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2025-03-01' = {
  name: appName
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    // ARR affinity keeps Socket.IO clients on the same instance if the plan is ever scaled out.
    clientAffinityEnabled: true
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'node server.mjs'
      alwaysOn: true
      webSocketsEnabled: true
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/healthz'
      appSettings: map(items(settings), setting => { name: setting.key, value: setting.value })
    }
  }
}

// azd zip-deploys with Microsoft Entra ID tokens, so FTP and SCM basic auth can be turned off.
resource ftpBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2025-03-01' = {
  parent: app
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource scmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2025-03-01' = {
  parent: app
  name: 'scm'
  properties: {
    allow: false
  }
}

// Container stdout/stderr (incl. startup failures), HTTP and platform logs in Log Analytics.
resource appDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'app-logs-to-log-analytics'
  scope: app
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      for category in ['AppServiceConsoleLogs', 'AppServiceHTTPLogs', 'AppServicePlatformLogs']: {
        category: category
        enabled: true
      }
    ]
  }
}

output name string = app.name
output uri string = 'https://${app.properties.defaultHostName}'
output principalId string = app.identity.principalId
