#!/bin/bash
# Fix toutes les queries avec limit(500) sans date filter

echo "Fixing queries with limit(500) without date filter..."

# List of files to fix
files=(
  "src/firebase/agentCodRequests.ts"
  "src/firebase/bankDeposits.ts"
  "src/firebase/caisse.ts"
  "src/firebase/central.ts"
  "src/firebase/clients.ts"
  "src/firebase/delivery.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    # Réduire limit 500 à 200
    sed -i 's/limit(500)/limit(200)/g' "$file"
  fi
done

echo "Done! Run npm run build to verify"
