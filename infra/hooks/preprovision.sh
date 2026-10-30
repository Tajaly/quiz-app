#!/bin/sh
# azd preprovision hook: creates (or reuses) the Entra ID app registration for Power Quiz.
#
# A single-tenant app registration acts as both the SPA (MSAL, auth code + PKCE) and the API the SPA
# calls (delegated scope api://<appId>/Quiz.Host). ENTRA_CLIENT_ID and ENTRA_TENANT_ID are stored in
# the azd environment and passed to Bicep (infra/main.parameters.json).
#
# If ENTRA_CLIENT_ID is already set (azd exports environment values to hooks; CI sets it from
# repository variables) the script exits without calling the Azure CLI.
#
# POSIX sh; needs only the Azure CLI (values are read with --query ... -o tsv, no jq).
set -eu

SCOPE_NAME='Quiz.Host'
SCOPE_TITLE='Host Power Quiz races'
SCOPE_DESCRIPTION='Allows the app to manage your quizzes and run live quiz sessions on your behalf.'
GRAPH_APP_ID='00000003-0000-0000-c000-000000000000'
GRAPH_USER_READ_SCOPE_ID='e1fe6dd8-ba31-4d61-89e7-88639da4683d'
LOCAL_REDIRECT_URIS='http://localhost:5173
http://localhost:3000'

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

registration_failed() {
  printf 'ERROR: Could not set up the Entra ID app registration: %s\n' "$1" >&2
  cat >&2 <<'EOF'
If your account may not register applications in this tenant (for example the Microsoft corporate
tenant), sign in to a tenant where you can ('az login --tenant <tenant>') and run azd again, or let an
admin create the registration and then run:
  azd env set ENTRA_CLIENT_ID <application-client-id>
  azd env set ENTRA_TENANT_ID <tenant-id>
EOF
  exit 1
}

# Entra ID is eventually consistent: a new app can briefly be "not found" right after creation.
az_retry() {
  attempt=1
  until az "$@"; do
    if [ "$attempt" -ge 6 ]; then
      return 1
    fi
    echo '  Retrying in 10 seconds (waiting for Entra ID replication)...' >&2
    sleep 10
    attempt=$((attempt + 1))
  done
}

# PATCHes the application object ($1 = object ID) via Microsoft Graph with the JSON in $body_file.
patch_application() {
  az_retry rest --method PATCH \
    --uri "https://graph.microsoft.com/v1.0/applications/$1" \
    --headers 'Content-Type=application/json' \
    --body "@$body_file" >/dev/null
}

# Prints the unique, non-empty lines of stdin as a JSON array of strings.
json_string_array() {
  tr -d '\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '
    BEGIN { printf "[" }
    NF && !seen[$0]++ { printf "%s\"%s\"", (count++ ? ", " : ""), $0 }
    END { printf "]" }'
}

new_guid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr 'A-F' 'a-f'
  elif [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
  else
    od -An -N16 -tx1 /dev/urandom | tr -d ' \n' |
      sed 's/^\(.\{8\}\)\(.\{4\}\).\(.\{3\}\).\(.\{3\}\)\(.\{12\}\)$/\1-\2-4\3-8\4-\5/'
  fi
}

set_azd_env() {
  if [ -n "${AZURE_ENV_NAME:-}" ]; then
    azd env set "$1" "$2" --environment "$AZURE_ENV_NAME"
  else
    azd env set "$1" "$2"
  fi
}

if [ -n "${ENTRA_CLIENT_ID:-}" ]; then
  echo "ENTRA_CLIENT_ID is already set ($ENTRA_CLIENT_ID); reusing that Entra ID app registration."
  exit 0
fi

if [ "${GITHUB_ACTIONS:-}" = 'true' ] || [ "${CI:-}" = 'true' ]; then
  fail 'ENTRA_CLIENT_ID is not set. The app registration is not created in CI: set the ENTRA_CLIENT_ID and ENTRA_TENANT_ID repository variables ("azd pipeline config" copies them from your local azd environment).'
fi

tenant_hint=${AZURE_TENANT_ID:-'<tenant-id-or-domain>'}

if ! command -v az >/dev/null 2>&1; then
  fail "The Azure CLI (az) is needed once to create the Entra ID app registration. Install it (https://aka.ms/install-azure-cli), run 'az login --tenant $tenant_hint', then run azd again."
fi

if ! tenant_id=$(az account show --query tenantId -o tsv 2>/dev/null) || [ -z "$tenant_id" ]; then
  fail "The Azure CLI is not logged in. It is needed once to create the Entra ID app registration. Run:  az login --tenant $tenant_hint  then run azd again."
fi

signed_in_as=$(az account show --query user.name -o tsv) || registration_failed 'az account show failed.'
echo "Setting up the Entra ID app registration in tenant $tenant_id (signed in as $signed_in_as)."
if [ -n "${AZURE_TENANT_ID:-}" ] && [ "$AZURE_TENANT_ID" != "$tenant_id" ]; then
  echo "Note: the Azure subscription is in tenant $AZURE_TENANT_ID; users will sign in through tenant $tenant_id."
fi

body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT
trap 'rm -f "$body_file"; exit 1' HUP INT TERM

display_name="Power Quiz (${AZURE_ENV_NAME:-})"
is_new=false
existing_scope_ids=''
existing_redirect_uris=''

# One "appId<TAB>objectId" line per app registration with exactly this display name.
existing_apps=$(az ad app list --display-name "$display_name" \
  --query "[?displayName=='$display_name'].[appId, id]" -o tsv) ||
  registration_failed 'listing app registrations failed.'
app_count=$(printf '%s\n' "$existing_apps" | grep -c . || true)

if [ "$app_count" -gt 1 ]; then
  registration_failed "found $app_count app registrations named '$display_name'. Delete the duplicates, or pick one with 'azd env set ENTRA_CLIENT_ID <appId>'."
elif [ "$app_count" -eq 1 ]; then
  app_id=$(printf '%s\n' "$existing_apps" | cut -f1)
  object_id=$(printf '%s\n' "$existing_apps" | cut -f2)
  echo "Reusing the existing app registration '$display_name' (client ID $app_id)."
  existing_scope_ids=$(az ad app show --id "$app_id" \
    --query "api.oauth2PermissionScopes[?value=='$SCOPE_NAME'].id" -o tsv) ||
    registration_failed 'reading the app registration failed.'
  existing_redirect_uris=$(az ad app show --id "$app_id" --query 'spa.redirectUris' -o tsv) ||
    registration_failed 'reading the app registration failed.'
else
  echo "Creating the app registration '$display_name'..."
  # Prints appId and objectId on two lines.
  created=$(az ad app create --display-name "$display_name" --sign-in-audience AzureADMyOrg \
    --query '[appId, id]' -o tsv) ||
    registration_failed 'az ad app create failed.'
  app_id=$(printf '%s\n' "$created" | sed -n 1p)
  object_id=$(printf '%s\n' "$created" | sed -n 2p)
  is_new=true
fi

# Keep the scope ID of an existing registration: Graph refuses to replace an enabled scope.
scope_id=$(printf '%s\n' "$existing_scope_ids" | sed -n 1p)
if [ -z "$scope_id" ]; then
  scope_id=$(new_guid)
fi

redirect_uris_json=$(printf '%s\n%s\n' "$existing_redirect_uris" "$LOCAL_REDIRECT_URIS" | json_string_array)

scope_json=$(
  cat <<EOF
{
        "id": "$scope_id",
        "value": "$SCOPE_NAME",
        "type": "User",
        "isEnabled": true,
        "adminConsentDisplayName": "$SCOPE_TITLE",
        "adminConsentDescription": "$SCOPE_DESCRIPTION",
        "userConsentDisplayName": "$SCOPE_TITLE",
        "userConsentDescription": "$SCOPE_DESCRIPTION"
      }
EOF
)

echo "Configuring SPA redirect URIs $redirect_uris_json, api://$app_id and the $SCOPE_NAME scope..."
cat >"$body_file" <<EOF
{
  "identifierUris": ["api://$app_id"],
  "spa": { "redirectUris": $redirect_uris_json },
  "api": {
    "requestedAccessTokenVersion": 2,
    "oauth2PermissionScopes": [
      $scope_json
    ]
  },
  "requiredResourceAccess": [
    {
      "resourceAppId": "$GRAPH_APP_ID",
      "resourceAccess": [{ "id": "$GRAPH_USER_READ_SCOPE_ID", "type": "Scope" }]
    }
  ]
}
EOF
patch_application "$object_id" || registration_failed 'updating the app registration failed.'

# The scope must exist before the app can be pre-authorized for it (no consent prompt for its own API).
echo "Pre-authorizing the SPA for its own $SCOPE_NAME scope..."
cat >"$body_file" <<EOF
{
  "api": {
    "requestedAccessTokenVersion": 2,
    "oauth2PermissionScopes": [
      $scope_json
    ],
    "preAuthorizedApplications": [
      { "appId": "$app_id", "delegatedPermissionIds": ["$scope_id"] }
    ]
  }
}
EOF
patch_application "$object_id" || registration_failed 'pre-authorizing the app failed.'

service_principal_ids=$(az ad sp list --filter "appId eq '$app_id'" --query '[].id' -o tsv) ||
  registration_failed 'looking up the service principal failed.'
if [ -z "$service_principal_ids" ]; then
  echo 'Creating the service principal (enterprise application)...'
  az_retry ad sp create --id "$app_id" --query id -o tsv >/dev/null ||
    registration_failed 'creating the service principal failed.'
fi

set_azd_env ENTRA_CLIENT_ID "$app_id"
set_azd_env ENTRA_TENANT_ID "$tenant_id"

if [ "$is_new" = true ]; then
  state='Created'
else
  state='Updated'
fi
echo ''
echo "$state Entra ID app registration '$display_name':"
echo "  Client ID : $app_id"
echo "  Tenant ID : $tenant_id"
echo "  API scope : api://$app_id/$SCOPE_NAME"
echo 'Saved ENTRA_CLIENT_ID and ENTRA_TENANT_ID in the azd environment.'
