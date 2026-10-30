@description('Name of the existing Cosmos DB account.')
param accountName string

@description('Object ID of the Microsoft Entra ID principal (managed identity or user) that gets data access.')
param principalId string

resource account 'Microsoft.DocumentDB/databaseAccounts@2025-10-15' existing = {
  name: accountName
}

// Built-in data-plane role "Cosmos DB Built-in Data Contributor" (read/write items, query containers).
var dataContributorRoleDefinitionId = '${account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'

resource roleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-10-15' = {
  parent: account
  name: guid(account.id, principalId, dataContributorRoleDefinitionId)
  properties: {
    roleDefinitionId: dataContributorRoleDefinitionId
    principalId: principalId
    scope: account.id
  }
}
