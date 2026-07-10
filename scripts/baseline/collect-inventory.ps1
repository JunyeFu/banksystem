# Read-only Phase 0 inventory helper. It must not print environment variables.
docker ps --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}'
docker version --format 'client={{.Client.Version}} server={{.Server.Version}}'
