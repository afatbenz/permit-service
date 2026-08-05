#!/bin/sh
set -e

echo "==> [entrypoint] Running database migrations..."
node dist/database/run-migrations.js

echo "==> [entrypoint] Seeding system roles..."
node dist/database/seeders/role.seeder.js

echo "==> [entrypoint] Starting E-Permit backend..."
exec node dist/main.js
