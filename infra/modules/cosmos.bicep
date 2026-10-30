@description('Azure region of the Cosmos DB account (serverless accounts are single-region).')
param location string

@description('Tags applied to all resources.')
param tags object

@description('Name of the Cosmos DB account.')
param accountName string

@description('Name of the SQL (NoSQL API) database.')
param databaseName string

// Containers must be created here: data-plane RBAC (used by the app) cannot create containers.
// TTL-enabled containers use defaultTtl -1 (no default expiry); the app sets a per-item `ttl`.
var containers = [
  {
    name: 'quizzes'
    partitionKeyPath: '/ownerId'
    ttlEnabled: false
  }
  {
    name: 'sessions'
    partitionKeyPath: '/ownerId'
    ttlEnabled: true
  }
  {
    name: 'sessionAnswers'
    partitionKeyPath: '/sessionId'
    ttlEnabled: true
  }
]

resource account 'Microsoft.DocumentDB/databaseAccounts@2025-10-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    // Microsoft Entra ID (managed identity / user) auth only; account keys are disabled.
    disableLocalAuth: true
    disableKeyBasedMetadataWriteAccess: true
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-10-15' = {
  parent: account
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource sqlContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-10-15' = [
  for container in containers: {
    parent: database
    name: container.name
    properties: {
      resource: {
        id: container.name
        partitionKey: {
          paths: [
            container.partitionKeyPath
          ]
          kind: 'Hash'
          version: 2
        }
        ...(container.ttlEnabled ? { defaultTtl: -1 } : {})
      }
    }
  }
]

output name string = account.name
output endpoint string = account.properties.documentEndpoint
