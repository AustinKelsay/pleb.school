#!/bin/sh

# Wait for database to be ready
# Usage: ./wait-for-db.sh host port

set -e

host="$1"
port="$2"
shift 2

# Allow env overrides for credentials; fall back to defaults used in compose
db_user="${POSTGRES_USER:-plebschool}"
db_name="${POSTGRES_DB:-pleb_school}"

until pg_isready -h "$host" -p "$port" -U "$db_user" -d "$db_name"; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

>&2 echo "Postgres is up - executing command"
exec "$@"
