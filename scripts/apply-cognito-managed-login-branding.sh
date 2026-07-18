#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <user-pool-id> <app-client-id> [AWS CLI options]" >&2
  exit 64
fi

user_pool_id="$1"
client_id="$2"
shift 2

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
settings_file="$project_root/infra/cognito-managed-login-branding.json"
background_file="$project_root/images/makeable/login-paper-background-v1.jpg"
logo_file="$project_root/images/makeable/makeable-login-logo.svg"
favicon_file="$project_root/images/makeable/makeable-login-favicon.svg"

for asset_file in "$settings_file" "$background_file" "$logo_file" "$favicon_file"; do
  [[ -f "$asset_file" ]] || { echo "Missing branding asset: $asset_file" >&2; exit 66; }
done

settings="$(jq -c . "$settings_file")"
page_background="$(base64 < "$background_file" | tr -d '\n')"
form_logo="$(base64 < "$logo_file" | tr -d '\n')"
favicon="$(base64 < "$favicon_file" | tr -d '\n')"

branding_id="$(aws cognito-idp describe-managed-login-branding-by-client \
  --user-pool-id "$user_pool_id" \
  --client-id "$client_id" \
  "$@" \
  --query 'ManagedLoginBranding.ManagedLoginBrandingId' \
  --output text)"

if [[ -z "$branding_id" || "$branding_id" == "None" ]]; then
  echo "No managed-login branding style exists for app client $client_id." >&2
  echo "Create one first with create-managed-login-branding, then rerun this script." >&2
  exit 65
fi

assets="$(jq -cn \
  --arg page_background "$page_background" \
  --arg form_logo "$form_logo" \
  --arg favicon "$favicon" \
  '[
    {
      Category: "PAGE_BACKGROUND",
      ColorMode: "LIGHT",
      Extension: "JPEG",
      Bytes: $page_background
    },
    {
      Category: "FORM_LOGO",
      ColorMode: "LIGHT",
      Extension: "SVG",
      Bytes: $form_logo
    },
    {
      Category: "FAVICON_SVG",
      ColorMode: "LIGHT",
      Extension: "SVG",
      Bytes: $favicon
    }
  ]')"

aws cognito-idp update-managed-login-branding \
  --user-pool-id "$user_pool_id" \
  --managed-login-branding-id "$branding_id" \
  --settings "$settings" \
  --assets "$assets" \
  "$@" \
  --query 'ManagedLoginBranding.{Created:CreationDate,Updated:LastModifiedDate}' \
  --output json
