#!/bin/sh
# azd postprovision hook: registers the deployed site URL as a SPA redirect URI.
#
# Adds WEB_URI (a Bicep output) to spa.redirectUris of the Entra ID app registration ENTRA_CLIENT_ID,
# keeping the existing URIs. Never fails the deployment: in CI, without a logged-in Azure CLI or when
# the update is not possible, it prints how to add the redirect URI manually instead.
#
# POSIX sh; needs only the Azure CLI (values are read with --query ... -o tsv, no jq).
set -u

web_uri=${WEB_URI:-}
client_id=${ENTRA_CLIENT_ID:-}

exit_with_note() {
  if [ -n "$1" ]; then
    echo "Note: $1"
    echo "  If it is not registered yet, add $web_uri as a 'Single-page application' redirect URI of the app"
    echo "  registration $client_id (Entra admin center > App registrations > Authentication), or run"
    echo "  'azd hooks run postprovision' on a machine where 'az login' is done for that tenant."
  fi
  echo ''
  echo "Power Quiz URL: $web_uri"
  exit 0
}

# Prints the unique, non-empty lines of stdin as a JSON array of strings.
json_string_array() {
  tr -d '\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '
    BEGIN { printf "[" }
    NF && !seen[$0]++ { printf "%s\"%s\"", (count++ ? ", " : ""), $0 }
    END { printf "]" }'
}

if [ -z "$web_uri" ]; then
  echo 'WEB_URI is not set; skipping the redirect URI update.'
  exit 0
fi
if [ -z "$client_id" ]; then
  exit_with_note 'ENTRA_CLIENT_ID is not set, so the app registration was not updated.'
fi
if [ "${GITHUB_ACTIONS:-}" = 'true' ] || [ "${CI:-}" = 'true' ]; then
  exit_with_note 'running in CI, so the Entra ID app registration is not changed here.'
fi
if ! command -v az >/dev/null 2>&1; then
  exit_with_note 'the Azure CLI (az) is not installed, so the app registration was not updated.'
fi

if ! tenant_id=$(az account show --query tenantId -o tsv 2>/dev/null) || [ -z "$tenant_id" ]; then
  exit_with_note 'the Azure CLI is not logged in, so the app registration was not updated.'
fi

if ! object_id=$(az ad app show --id "$client_id" --query id -o tsv 2>/dev/null) || [ -z "$object_id" ]; then
  exit_with_note "app registration $client_id was not found in tenant $tenant_id (the tenant az is logged in to)."
fi

if ! existing_uris=$(az ad app show --id "$client_id" --query 'spa.redirectUris' -o tsv 2>/dev/null); then
  exit_with_note "could not read the redirect URIs of app registration $client_id."
fi

if printf '%s\n' "$existing_uris" | tr -d '\r' | grep -Fqx -e "$web_uri"; then
  echo "$web_uri is already a SPA redirect URI of app registration $client_id."
  exit_with_note ''
fi

redirect_uris_json=$(printf '%s\n%s\n' "$existing_uris" "$web_uri" | json_string_array)

# The JSON body goes through a temp file (az rest --body @file), like the PowerShell variant.
if ! body_file=$(mktemp); then
  exit_with_note 'could not create a temporary file.'
fi
trap 'rm -f "$body_file"' EXIT
trap 'rm -f "$body_file"; exit 1' HUP INT TERM
printf '{ "spa": { "redirectUris": %s } }\n' "$redirect_uris_json" >"$body_file"

if ! az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications/$object_id" \
  --headers 'Content-Type=application/json' \
  --body "@$body_file" >/dev/null; then
  exit_with_note 'updating the app registration failed (see the error above).'
fi

echo "Added $web_uri to the SPA redirect URIs of app registration $client_id."
exit_with_note ''
