# Docker Compose Guide: Nginx, Flask Replicas, MySQL and phpMyAdmin

## 1. Purpose and scope

This guide explains the `compose.yml` added to the Docker Networking Lab. It is written as a standalone Markdown document so it can be imported into Notion without requiring images or special diagram plugins.

The lab originally started each container with a separate `docker run` command. Compose now records the same application components in one declarative configuration and manages their lifecycle together:

1. An Nginx reverse proxy and HTTP load balancer.
2. Two replicas of the Flask connectivity dashboard.
3. A MySQL database that stores its data in a named volume.
4. An optional phpMyAdmin web interface for database administration.

The main learning objective remains **container networking**. The configuration demonstrates Docker DNS, HTTP load balancing, frontend/backend separation, environment management, dependency readiness, persistent storage, healthchecks and practical container hardening.

This is a local learning environment. The application still uses Flask's development server. The Compose settings improve its operation as a lab; they do not turn the application into a production deployment.

## 2. Files added or updated

| File | What changed | Why it matters |
| --- | --- | --- |
| `compose.yml` | Defines four services, two app replicas, three networks, a volume and `deploy` resource limits | Makes the complete lab reproducible |
| `nginx/nginx.conf` | Configures dynamic upstream DNS and round-robin HTTP routing | Keeps proxy behavior explicit and reviewable |
| `.env.compose.example` | Provides a dedicated Compose configuration template | Keeps this stack independent of the earlier manual lab |
| `.gitignore` | Allows the Compose example while continuing to ignore real `.env` files | Publishes instructions without publishing passwords |
| `README.md` | Adds a Compose quick start and a link to this guide | Makes the new workflow discoverable |
| `docs/docker-compose-guide.md` | Explains the design and operating commands in English | Provides the Notion-ready reference |

The existing Python code and Dockerfiles are reused. Compose does not replace the Dockerfile: the Dockerfile defines the application image, while Compose defines how that image runs alongside other services.

## 3. Architecture and resource ownership

```text
Host / browser
  |
  +-- http://localhost:5052 --> proxy:80
  |                              |
  |                    frontend bridge network
  |                              |
  |                   +----------+----------+
  |                   |                     |
  |              app replica 1         app replica 2
  |                  :5000                 :5000
  |                   |                     |
  |                   +----------+----------+
  |                              |
  +-- http://localhost:8081 --> administration bridge --> phpmyadmin:80
                                 |
                       internal backend network
                                 |
                           db_mysql:3306

       MySQL persistent volume:
       docker-networking-lab_mysql_data
```

The default Compose project name is `docker-networking-lab`. Its networks become `docker-networking-lab_frontend`, `docker-networking-lab_backend` and `docker-networking-lab_administration`. Both app replicas join frontend and backend. Nginx joins only frontend; MySQL joins only backend. phpMyAdmin joins backend and administration, so its localhost web port is published through a non-internal bridge. The proxy does not have direct network access to MySQL or phpMyAdmin.

The file uses the current Compose Specification and omits the obsolete top-level `version` field. Its `name` field sets the default project name. [Compose version and project name](https://docs.docker.com/reference/compose-file/version-and-name/).

These networks are different from the manually created `appnet`. The Compose volume is also separate from the manual database: this workflow does not migrate the earlier `db_mysql` container. If you already ran the original Compose version, the default project and `mysql_data` volume name remain the same; a normal `up` preserves that Compose database. Existing credentials must still match the initialized database.

There are no fixed `container_name` entries, globally named volumes or external networks. Commands use Compose service names instead of depending on generated container names. You can select another project name with `-p`, but that changes the resource names and requires different published ports if both projects run at once.

## 4. Quick start

### Prerequisites

- Docker Engine or Docker Desktop running Linux containers.
- Docker Compose v2. The configuration was validated with v2.39.2.
- The project files available locally.
- Host ports `5052` and, if the admin profile is enabled, `8081` available.

All host commands below use PowerShell. Commands shown after opening a shell inside the app use Bash.

### Step 1: Prepare the dedicated environment file

```powershell
if (-not (Test-Path .env.compose)) {
    Copy-Item .env.compose.example .env.compose
}
```

Edit `.env.compose` and replace both placeholder passwords:

```dotenv
DB_NAME=networking_lab
DB_USER=lab_user
DB_PASS='REPLACE_WITH_A_STRONG_APP_PASSWORD'
MYSQL_ROOT_PASSWORD='REPLACE_WITH_A_DIFFERENT_STRONG_ROOT_PASSWORD'
APP_PORT=5052
PHPMYADMIN_PORT=8081
```

Use an application username other than `root`, and keep the application and root passwords different. Compose's required-variable expressions reject missing or empty values; they do not validate password strength or reject unchanged placeholder strings.

Single quotes in a Compose environment file preserve literal values, including `$` characters. The quotes are not included in the resulting password. Keep the same file for later start, stop and inspection commands. This file is parsed by Compose, which differs from the simpler `docker run --env-file` workflow in the manual lab.

### Step 2: Validate without printing passwords

```powershell
docker compose --env-file .env.compose config --quiet
```

This validates the resolved configuration. It does not check database credentials against an already initialized volume, reserve ports, build an image or verify that Docker can start every service.

### Step 3: Start the complete stack

```powershell
docker compose --env-file .env.compose --profile admin up -d --build --wait --wait-timeout 240
```

Open:

- Flask dashboard: **http://localhost:5052**
- phpMyAdmin: **http://localhost:8081**

Log into phpMyAdmin using `DB_USER` and `DB_PASS`. Root credentials are separate and are not passed to the app or automatically supplied to phpMyAdmin.

To start Nginx, both Flask replicas and MySQL without phpMyAdmin, leave out the admin profile:

```powershell
docker compose --env-file .env.compose up -d --build --wait --wait-timeout 240
```

Omitting the profile from a later command does not automatically stop a phpMyAdmin container that is already running. Stop it explicitly when it is no longer needed:

```powershell
docker compose --env-file .env.compose --profile admin stop phpmyadmin
```

## 5. How environment variables work here

### Compose interpolation and container environments are separate

The command-line flag `--env-file .env.compose` provides values for expressions such as `${DB_NAME}` in the YAML. It does not automatically inject every variable from that file into every container.

Each service's `environment` section selects and maps the values that it needs. This is why the app receives `DB_PASS`, while only MySQL receives `MYSQL_ROOT_PASSWORD`. phpMyAdmin receives connection coordinates but no stored login password.

| Source value | App receives | MySQL receives | phpMyAdmin receives |
| --- | --- | --- | --- |
| `DB_NAME` | `DB_NAME` | `MYSQL_DATABASE` | Not injected |
| `DB_USER` | `DB_USER` | `MYSQL_USER` | Not injected |
| `DB_PASS` | `DB_PASS` | `MYSQL_PASSWORD` | Not injected |
| `MYSQL_ROOT_PASSWORD` | Not injected | `MYSQL_ROOT_PASSWORD` | Not injected |
| Service name | `DB_HOST=db_mysql` | Not needed | `PMA_HOST=db_mysql` |
| Internal MySQL port | `DB_PORT=3306` | Server default | `PMA_PORT=3306` |

The required expression `${DB_PASS:?Set DB_PASS in .env.compose}` causes validation to fail when that value is missing or empty. `${APP_PORT:-5052}` supplies a default host port.

The app host and database port are fixed by the stack topology. Changing `APP_PORT` changes the browser's destination; it does not change Flask's internal port or MySQL's port. Values of `DB_HOST` or `DB_PORT` in your older `.env` are not used by this workflow.

Shell environment variables can override interpolation values from an environment file. If configuration unexpectedly differs from the file, check whether your PowerShell session defines the same variable names. Do not share the output of plain `docker compose config` or `config --environment`: it can contain resolved passwords.

References: [Compose interpolation](https://docs.docker.com/reference/compose-file/interpolation/) and [environment precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/).

### Comparison with the original `docker run` commands

| Manual workflow | Compose equivalent |
| --- | --- |
| `docker build -f dockerfile-multistage ...` | The app's `build` section |
| `--network appnet` | Explicit membership in frontend and/or backend networks |
| `-p 5052:80` | The proxy's `ports` mapping, restricted to loopback |
| `-e DB_NAME=...` | Explicit `environment` entries |
| `docker run --env-file .env` | Compose reads `.env.compose` and maps selected values |
| `-v ...:/var/lib/mysql` | The MySQL named volume |
| Starting the DB before the app manually | `depends_on` with `service_healthy` |

The distinction is useful: `docker run --env-file` loads container variables directly, while this Compose file uses interpolation followed by explicit service mappings. Always use the provided Compose command instead of assuming that all environment-file mechanisms behave identically.

## 6. Service-by-service explanation

### App: build the existing runtime stage

```yaml
build:
  context: .
  dockerfile: dockerfile-multistage
  target: runtime
image: docker-networking-lab-app:local
pull_policy: build
```

The `runtime` target contains the app, templates, static assets, Python dependencies and networking tools. The image name is local to this Compose workflow, so it does not overwrite the earlier `netapp:v1` tag.

`pull_policy: build` tells Compose to build this application image from the project rather than try to download that custom image name from a registry. Build caching still applies. The underlying Python image and Python dependency ranges remain as configured in the Dockerfile and `requirements.txt`; they are not fully locked by this change.

The app already runs as `appuser` in the Dockerfile. Compose preserves that setting and adds runtime restrictions described below.

### MySQL: a dedicated database and application account

The new stack uses the verified `mysql:8.4.11` image tag. It has its own volume and is independent of the manual lab's MySQL 9 database. This is a fresh database deployment, not an in-place version downgrade or an automatic migration.

`MYSQL_DATABASE`, `MYSQL_USER` and `MYSQL_PASSWORD` initialize the schema and the application account. The official image grants that account permissions on the specified schema, rather than making it the server-wide root account. For this lab it is still a broadly privileged schema account; a production application should receive only the specific SQL permissions it needs.

Initialization variables apply when the data directory is empty. After the first initialization, changing `.env.compose` does not change stored users or passwords. Use SQL account management for an existing database, and update application configuration to match.

MySQL's `healthcheck` performs an authenticated TCP connection to `127.0.0.1:3306`, selects the configured database and executes `SELECT 1`. This checks more than process existence or an unauthenticated `mysqladmin ping`.

Reference: [Official MySQL container configuration](https://hub.docker.com/_/mysql).

### phpMyAdmin: optional administration

The service uses the verified `phpmyadmin:5.2.3` image tag and belongs to the `admin` profile. That keeps the database administration interface optional during ordinary app exercises.

`PMA_HOST=db_mysql` and `PMA_PORT=3306` point it at the Compose database. `PMA_ARBITRARY=0` limits the login form to the configured target rather than enabling arbitrary server selection. No `PMA_USER` or `PMA_PASSWORD` is set: credentials are entered in the login form.

Its healthcheck uses PHP, which is already present in the image, to request the local HTTP page. The image disables `allow_url_fopen`, so the helper explicitly enables it only for that CLI process. The web server's PHP configuration is unchanged. A successful HTTP check indicates that the administration interface responds. It does not prove that an interactive user has logged in or completed a SQL query.

Reference: [phpMyAdmin Docker variables](https://docs.phpmyadmin.net/en/latest/setup.html#docker-environment-variables).

## 7. Networking choices and their boundaries

| Service | Frontend | Backend | Administration | Host port |
| --- | --- | --- | --- | --- |
| Nginx proxy | Yes | No | No | `127.0.0.1:5052` -> `80` |
| Flask replicas | Yes | Yes | No | None |
| MySQL | No | Yes | No | None |
| phpMyAdmin | No | Yes | Yes | Optional `127.0.0.1:8081` -> `80` |

All three networks use the bridge driver. Docker DNS resolves names within shared networks: the proxy resolves `app`, while the app resolves `db_mysql` and `phpmyadmin`. The proxy cannot resolve `db_mysql` through its frontend membership. Each app has different frontend and backend addresses.

Only Nginx and optional phpMyAdmin publish host ports, both bound to loopback. Flask replicas share port 5000 inside their separate network namespaces, so there is no host-port conflict when scaling. An `expose` entry is not required for service-to-service connectivity and would not be an access control rule.

The backend has `internal: true`, restricting ordinary external connectivity. MySQL has no other network membership and no ordinary internet egress. Apps can access external destinations through frontend, and phpMyAdmin through its administration bridge. That separate bridge is needed for host port publication on the tested backend; attaching phpMyAdmin only to the internal bridge did not allocate its host port. The admin port remains bound to loopback. This is not protection from Docker administrators: someone with Docker control can inspect containers or attach another container to a network. Database authentication remains necessary.

References: [Compose networks](https://docs.docker.com/reference/compose-file/networks/) and [bridge networking](https://docs.docker.com/engine/network/drivers/bridge/).

## 8. Startup readiness and healthchecks

The app and phpMyAdmin have the following dependency:

```yaml
depends_on:
  db_mysql:
    condition: service_healthy
```

The database must pass its healthcheck before Compose starts those dependent services. This addresses the app's existing behavior: it attempts a database connection during startup and exits if the connection fails. The proxy then waits for the app replicas to become healthy. With the admin profile, the stack has five containers: proxy, two apps, database and phpMyAdmin.

| Service | Check | Interval | Timeout | Start period | Retries |
| --- | --- | --- | --- | --- | --- |
| App | HTTP `/db-health`, which runs `SELECT 1` | 30 s | 10 s | 20 s | 3 |
| Proxy | HTTP `/db-health` through Nginx to an app and MySQL | 30 s | 10 s | 20 s | 3 |
| MySQL | Authenticated TCP SQL query | 10 s | 8 s | 60 s | 12 |
| phpMyAdmin | Local HTTP page fetched through PHP | 30 s | 8 s | 20 s | 3 |

The app inherits its healthcheck from the Dockerfile. It is not duplicated in Compose. The other services define their checks in YAML. `/nginx-health` returns HTTP 204 from Nginx alone; `/health` checks Flask, and `/db-health` checks Flask's SQL connection. The proxy healthcheck exercises the latter path, but one successful request does not prove every replica is healthy. Inspect replica health individually too.

The MySQL shell command contains `$${MYSQL_USER}` and related expressions. The doubled dollar sign prevents Compose from substituting them prematurely, allowing the container shell to read its own `MYSQL_*` variables. Query output and client warnings are suppressed. The healthcheck uses a password argument transiently; Docker administrators can already inspect the database's configured environment. This is a lab tradeoff, not a complete production secret-handling strategy.

The initial period allows database initialization to complete without immediately counting early failures. A successful check during that period can still establish readiness. Initialization duration depends on the machine; `--wait-timeout 240` is an overall waiting budget, not a promise that first startup will always finish within it.

Startup dependencies are not continuous orchestration. If MySQL later stops, Compose does not automatically stop and restart every dependent service. An `unhealthy` status alone does not restart a running container. The app can return HTTP `503` from `/db-health` and show the failure on the dashboard.

References: [Startup ordering](https://docs.docker.com/compose/how-tos/startup-order/) and [Docker HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck).

## 9. Storage and persistence

```yaml
volumes:
  - mysql_data:/var/lib/mysql
```

Compose manages a named volume for database files. Its project-scoped name avoids colliding with the earlier manually created volume.

The volume survives container recreation and a normal `docker compose down`. That is useful for learning the distinction between disposable containers and persistent state. Persistence is not a backup: accidental SQL changes, storage failure and explicit volume deletion can still lose data.

Neither the app nor phpMyAdmin mounts the database volume. Access takes place through MySQL's network protocol.

Reference: [Compose volumes](https://docs.docker.com/reference/compose-file/volumes/).

## 10. Runtime hardening and lab compatibility

### Read-only application filesystem

The app service has `read_only: true`. Files shipped in the image cannot be edited through the running container's normal filesystem. A small writable tmpfs is mounted at `/tmp` for temporary files.

The mount uses `noexec` and `nosuid`, and is limited to 16 MiB. `MYSQL_HISTFILE=/tmp/.mysql_history` keeps interactive SQL history in that temporary location rather than requiring a writable home directory. Temporary content is not intended to persist when the container stops.

This works with the current app because it does not upload files, write a local database or modify its source. If those features are added, they need explicit writable storage.

Reference: [Read-only containers and tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/).

### Capabilities and ping

The app drops all Linux capabilities and enables `no-new-privileges`. It is already a non-root process, so these settings further limit privilege changes and operations outside its role.

The networking lab still needs ordinary ping. `net.ipv4.ping_group_range` permits unprivileged ICMP echo sockets for the container's groups, instead of adding `NET_RAW`. On the tested Docker Linux backend, `ping -c 3 db_mysql` works with these settings. Raw packet capture and some traceroute modes remain outside this reduced-permission model.

MySQL and phpMyAdmin keep their image defaults for users, writable directories and capabilities, with `no-new-privileges` added. Their entrypoints initialize data or runtime files and switch worker identities. The app's restrictions are not copied blindly onto those services.

Reference: [Docker container runtime options](https://docs.docker.com/engine/containers/run/).

### Process, CPU and memory budgets

| Service | Memory limit | CPU limit | PID limit | Stop grace period |
| --- | --- | --- | --- | --- |
| App, per replica | 256 MiB | 0.5 CPU | 128 | 20 s |
| Proxy | 128 MiB | 0.25 CPU | 64 | 20 s |
| MySQL | 1 GiB | 1 CPU | 512 | 60 s |
| phpMyAdmin | 256 MiB | 0.5 CPU | 128 | 20 s |

These per-container ceilings are declared under `deploy.resources.limits`, replacing the earlier service-level `mem_limit`, `cpus` and `pids_limit` entries. There are no duplicated limits to keep in sync. With two app replicas, the complete stack's memory ceilings total 1.875 GiB when phpMyAdmin is enabled. These are not reservations or production sizing. If a workload exceeds its memory ceiling, its process can be killed. Increase limits based on observed behavior and available Docker Desktop resources.

Each service also enables `init: true`. This adds a small init process to assist signal forwarding and child-process cleanup. The longer database stop grace period gives MySQL time to shut down before Docker resorts to a forced kill.

Reference: [Compose service configuration](https://docs.docker.com/reference/compose-file/services/).

## 11. Image versioning, restart behavior and logs

### Versioned images

Nginx (`1.30.5-alpine`), MySQL and phpMyAdmin use explicit patch tags instead of `latest`. This makes the chosen versions visible during review and reduces unexpected version jumps. Patch tags are not immutable digests, and the app's base image and dependency ranges still have their own update behavior.

Updating a database image requires checking compatibility with its persisted data. Do not attach an old MySQL 9 data directory to this MySQL 8.4 service.

### Restart policy

`restart: unless-stopped` restarts containers after their process terminates, unless they were explicitly stopped. It is useful for a lab that should recover from an unexpected process exit. It is not a healthcheck-based repair mechanism, and a wrong configuration can still result in repeated failed restarts.

Reference: [Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/).

### Bounded log storage

The `x-logging` extension defines reusable YAML configuration. Every service uses the same `json-file` rotation settings: a 10 MiB maximum file size and three retained files. This bounds routine per-container log growth without changing the app's stdout/stderr logging model.

Rotation applies to these newly created containers. It does not update logging settings on unrelated containers that are already running.

Reference: [JSON-file logging driver](https://docs.docker.com/engine/logging/drivers/json-file/).

## 12. Daily operating commands

### Inspect services and logs

```powershell
docker compose --env-file .env.compose --profile admin ps
docker compose --env-file .env.compose --profile admin logs --tail 50
docker compose --env-file .env.compose logs -f app db_mysql
docker compose --env-file .env.compose --profile admin logs -f phpmyadmin
```

Use `Ctrl+C` to stop following logs. This does not stop detached containers.

### Rebuild after an application change

```powershell
docker compose --env-file .env.compose up -d --build app
```

Compose recreates the app when needed. The MySQL volume remains separate from application source and image updates.

### Inspect health by service

```powershell
$appContainerId = docker compose --env-file .env.compose ps -q app
docker inspect --format '{{json .State.Health}}' $appContainerId

$databaseContainerId = docker compose --env-file .env.compose ps -q db_mysql
docker inspect --format '{{json .State.Health}}' $databaseContainerId
```

`ps -q app` now returns multiple IDs. PowerShell passes them to `docker inspect`, allowing you to inspect both replicas. Use `exec --index 1 app ...` or `exec --index 2 app ...` to select a particular replica. The proxy owns the fixed published port, so app replicas do not conflict on the host.

### Stop or remove the stack

Stop containers while retaining their configuration:

```powershell
docker compose --env-file .env.compose --profile admin stop
```

Remove the Compose containers and network while retaining the named database volume:

```powershell
docker compose --env-file .env.compose --profile admin down
```

For a deliberate fresh database reset only:

```powershell
# DESTRUCTIVE: deletes this project's persistent MySQL volume and its data.
docker compose --env-file .env.compose --profile admin down --volumes
```

Do not add `--volumes` to a routine shutdown. For important data, take and verify a backup before resetting storage.

## 13. Networking exercises

### Inspect membership

```powershell
docker network inspect docker-networking-lab_frontend
docker network inspect docker-networking-lab_backend
docker network inspect docker-networking-lab_administration
```

Frontend should contain the proxy and both apps. Backend should contain both apps, MySQL and optional phpMyAdmin. Administration contains only optional phpMyAdmin. Network names change when you override the project name.

### Diagnose from the app

```powershell
docker compose --env-file .env.compose exec app bash
```

Inside that Bash shell:

```bash
# Resolve the database service name.
nslookup "$DB_HOST"
dig +short "$DB_HOST" A

# Test ICMP and the MySQL TCP listener separately.
ping -c 3 "$DB_HOST"
nc -vz -w 3 "$DB_HOST" "$DB_PORT"

# Inspect the app's interfaces, routes and listening sockets.
ip addr
ip route
ss -lnt

# Test the application and its SQL connection.
curl -fsS http://localhost:5000/health
curl -fsS http://localhost:5000/db-health

# Reach another service by its DNS name and internal HTTP port.
curl -I http://phpmyadmin:80/
```

The final command requires the admin profile. `localhost` inside the app means the app container; `phpmyadmin` identifies the other service. Host port `8081` is not the destination used between containers.

For an interactive SQL session with this lab's self-signed database certificate:

```bash
mysql --skip-ssl-verify-server-cert \
  -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME"
```

Enter `DB_PASS` at the password prompt, then run:

```sql
SELECT DATABASE(), CURRENT_USER();
SELECT 1 AS connection_ok;
SHOW TABLES;
exit;
```

The certificate option is limited to the lab connection. Configure a trusted CA and certificate verification when server identity must be validated. The Python healthcheck and this interactive client have different TLS settings; neither is presented here as a complete production TLS configuration.

Reference: [Client TLS verification](https://mariadb.com/docs/server/security/encryption/data-in-transit-encryption/securing-connections-for-client-and-server).

### Reach Flask from phpMyAdmin

The phpMyAdmin image already includes PHP. This tests HTTP without assuming `curl` is installed in that container:

```powershell
docker compose --env-file .env.compose --profile admin exec phpmyadmin php -d allow_url_fopen=1 -r "echo file_get_contents('http://app:5000/health');"
```

An `ok` response demonstrates connectivity toward Flask. It is independent of whether a browser has authenticated to phpMyAdmin.

### Simulate a database outage

```powershell
docker compose --env-file .env.compose stop db_mysql
docker compose --env-file .env.compose exec app curl -i http://localhost:5000/db-health
```

Expect HTTP `503` once the database is unavailable. The app process can remain running while its healthcheck eventually changes to `unhealthy`.

Restore the database:

```powershell
docker compose --env-file .env.compose start db_mysql
```

Wait for database readiness, retry the endpoint and allow another app healthcheck to run. Fresh request-scoped connections in the app allow subsequent checks to succeed after recovery. You do not need to restart Flask just because an individual database request failed.

## 14. Troubleshooting guide

| Symptom | Likely explanation | Next check |
| --- | --- | --- |
| Compose reports a required variable is missing | Missing file, missing key or empty value | Use `--env-file .env.compose` and review the local file |
| MySQL rejects initialization with `MYSQL_USER=root` | Root has a separate initialization mechanism | Use a dedicated non-root `DB_USER` in a fresh database |
| A published port cannot be allocated | Another container or host process owns that port | Change `APP_PORT` (Nginx) or `PHPMYADMIN_PORT` |
| Nginx returns `502` | App backends are missing or cannot accept connections | Inspect app logs, service DNS and frontend membership |
| Nginx returns `504` | An app backend did not respond before its timeout | Inspect app load and database response time |
| Nginx returns `503` for `/db-health` | Flask reports a database connection failure | Inspect database health and backend membership |
| `Unknown MySQL server host` | Wrong network membership or service DNS name | Inspect the Compose network and run `dig` from the app |
| MySQL stays unhealthy | Initialization, credentials, schema or resources need attention | Inspect database logs and health results locally |
| Password changes in the file have no effect on MySQL | The existing volume is already initialized | Change the account in SQL and update client configuration |
| The app is `unhealthy` but still running | The DB-dependent healthcheck is failing | Check `/health` and `/db-health` separately |
| phpMyAdmin is absent from `ps` | The optional profile was not enabled | Start with `--profile admin` |
| `curl` against `db_mysql:3306` fails | MySQL is not an HTTP service | Test with `nc` or a SQL client |
| Ping fails under a different runtime policy | The host backend disallows the configured ping socket behavior | Inspect the sysctl and use DNS/TCP tests without adding broad privileges |
| Writes to the app filesystem fail | The service filesystem is read-only | Use `/tmp` for temporary files or define specific durable storage |

## 15. Security boundaries and production follow-up

The real `.env.compose` is ignored by Git and excluded from Docker build context. Only `.env.compose.example` is intended for publication. The file is not encrypted, and environment values remain visible to sufficiently privileged Docker users.

Before turning this lab into a deployment for real users, the work would include a production WSGI server, validated TLS connections, appropriate secret delivery, finer database privileges, backups and restore tests, resource sizing, image and dependency update procedures, and restricted administration access.

The official MySQL image supports password delivery through `_FILE` variables. The current Flask configuration would also need a file-backed secret reader before adopting that pattern end to end. The guide does not imply that merely adding a Compose `secrets` block would automatically make the existing app consume those files.

References: [Flask deployment guidance](https://flask.palletsprojects.com/en/stable/deploying/) and [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/).

## 16. Importing this document into Notion

1. Download or locate `docs/docker-compose-guide.md`.
2. In Notion, choose **Import** and select the Markdown import option.
3. Select this Markdown file.
4. Review the imported headings, tables and fenced code blocks.

The architecture uses a plain-text code block, so no diagram plugin is required. The commands, variable examples and explanations are included directly in the document; relative file references describe project files rather than relying on local links after import.

Reference: [Importing Markdown into Notion](https://www.notion.com/help/import-data-into-notion).

## 17. Suggested portfolio description

> Built a Docker Compose networking lab with an Nginx reverse proxy balancing requests across two Flask replicas. Implemented dynamic Docker DNS, frontend/backend network separation, per-container deployment limits, authenticated readiness checks, persistent MySQL storage, explicit environment mappings and optional phpMyAdmin administration.

This description reflects the implementation. It distinguishes practical lab hardening from a claim of complete production readiness.

## 18. Original Compose validation

The stack was tested with Docker Compose v2.39.2 on the Docker Desktop Linux backend. Verification used a unique temporary project, fresh database storage, generated credentials and dynamically allocated loopback ports. It did not attach to the manual lab's database volume.

| Verification | Result |
| --- | --- |
| Configuration parsing and required service properties | Passed |
| Availability of the specified MySQL and phpMyAdmin tags | Verified in the registry and pulled successfully |
| First startup with database readiness gating | All three services became healthy |
| DNS resolution of `db_mysql` and `phpmyadmin` from the app | Passed |
| Ping with no effective Linux capabilities | Passed |
| TCP connectivity from the app to MySQL port 3306 | Passed |
| App HTML, CSS, JavaScript and health endpoints | HTTP 200 |
| App-to-phpMyAdmin HTTP request | HTTP 200 |
| phpMyAdmin-to-app HTTP request | Returned `status: ok` |
| Authenticated MySQL query from the app | `SELECT 1` succeeded |
| Credentials containing a literal dollar sign | Preserved through environment interpolation |
| App process identity and privileges | Non-root, with zero effective capabilities |
| Temporary app storage | `/tmp` was writable |
| App image filesystem | Writes to `/app` were rejected |
| Database data across container removal and recreation | A verification row survived `down` followed by `up` |

Testing identified that the phpMyAdmin image disables PHP URL reads by default. The healthcheck and reverse-HTTP example were corrected to enable URL reading only in their CLI helper processes, then retested successfully.

The original verification containers, network, generated environment file and verification-only database volume were removed afterward. Those results describe the earlier single-app, shared-network implementation. The sections below explain the proxy and deployment extension and its own verification.

## 19. Deployment configuration and local replica scaling

### What `deploy` does here

`deploy` is a service configuration section, not another container. This project uses it for two specific purposes:

```yaml
deploy:
  replicas: 2
  resources:
    limits:
      cpus: "0.50"
      memory: 256M
      pids: 128
```

For `app`, `replicas: 2` asks Compose to start two independent containers from the same application image. Each receives the same database configuration and a separate network namespace. Resource ceilings apply to each container, not to the service total. MySQL, Nginx and phpMyAdmin also use `deploy.resources.limits`, but remain single instances.

This is fixed, declared scaling. Compose does not watch traffic and increase the replica count automatically. Two app containers also do not provide a second database: MySQL remains a single service backed by one named volume. Do not scale this MySQL service by sharing its data directory across independent servers; database replication requires a separate design.

### Compose versus Swarm

The tested Docker Compose v2 implementation applies replica counts and CPU, memory and PID limits on the local Docker engine. This file does not configure a Swarm cluster. Swarm-specific orchestration such as placement constraints, rolling updates and rollbacks is intentionally absent. Adding those fields would not make ordinary `docker compose up` provide those behaviors.

The existing `restart: unless-stopped` policy stays at service level. It retains the lab's manual-stop behavior; `deploy.restart_policy` is not added alongside it. Health status is still observational: an unhealthy running container is not automatically replaced by this local Compose configuration.

Reference: [Compose Deploy Specification](https://docs.docker.com/reference/compose-file/deploy/).

### Scale without changing host ports

```powershell
# Three app containers for this run.
docker compose --env-file .env.compose up -d --scale app=3 --wait --wait-timeout 240

# Inspect the running replicas.
docker compose --env-file .env.compose ps app

# Return to the two replicas declared in YAML.
docker compose --env-file .env.compose up -d --wait --wait-timeout 240
```

Include `--profile admin` if you also want to start phpMyAdmin. Existing administration containers are not automatically removed when that flag is omitted. Avoid scaling the entire stack indiscriminately.

Flask no longer has a `ports` mapping. Every replica listens on its own internal port 5000; Nginx owns the only application host port. Existing scripts such as `docker compose port app 5000` should now query `proxy 80` instead. `APP_PORT` keeps its existing name and default 5052, so the browser URL stays the same.

## 20. Nginx reverse proxy configuration

### Configuration file and mount

`nginx/nginx.conf` is a complete Nginx configuration, mounted read-only at `/etc/nginx/nginx.conf`. Compose uses a bind mount with `create_host_path: false`: a missing source file is an error instead of silently creating a directory. This local mount makes the routing configuration easy to inspect and edit.

The proxy uses `nginx:1.30.5-alpine`. The image tag was checked in the registry, and the image was pulled for runtime validation. It includes Nginx's open-source dynamic upstream resolution capability, available from version 1.27.3. Earlier versions require a different approach.

### DNS discovery and load balancing

```nginx
resolver 127.0.0.11 valid=5s ipv6=off;
resolver_timeout 2s;

upstream flask_app {
    zone flask_app 64k;
    server app:5000 resolve max_fails=2 fail_timeout=5s;
}
```

`127.0.0.11` is Docker's embedded DNS inside these containers. The `app` name resolves to addresses on the frontend network. All returned addresses become upstream peers. With no alternative balancing algorithm configured, Nginx uses equal-weight round-robin for these replicas.

`resolve` and the shared `zone` let Nginx refresh those peers when replicas are added, removed or recreated. A five-second DNS cache validity keeps the lab responsive to topology changes. Updates are not instantaneous, and a temporarily failed address can still appear during convergence. Nginx is not restarted by the scaling commands.

Reference: [Nginx upstream groups, balancing and dynamic resolution](https://nginx.org/en/docs/http/ngx_http_upstream_module.html).

### HTTP forwarding and failures

All ordinary paths, including HTML, CSS, JavaScript, `/health` and `/db-health`, go to `http://flask_app` with their original paths. `/nginx-health` is handled locally and returns 204.

Nginx forwards the HTTP Host and adds client/protocol forwarding headers. Flask is not configured to trust those headers automatically. If future features need the original client address or HTTPS URL generation, configure a precise trusted-proxy policy in Flask; do not blindly trust headers supplied by arbitrary clients.

Connect timeout is three seconds; send and read timeouts are ten seconds. Nginx can retry another peer after connection errors, timeouts or HTTP 502/504, with at most three attempts. It does not retry a database-health HTTP 503 merely to hide a shared database outage. Passive failure handling temporarily avoids peers after repeated communication failures; it is not an active per-replica health probe or a production availability guarantee.

The current app uses read-only GET requests. Future endpoints that change data need explicit retry/idempotency review; this configuration does not opt into retries of non-idempotent requests.

Reference: [Nginx proxy forwarding and upstream retry behavior](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

### Observability for the networking lab

The response header `X-Lab-Upstream` shows the selected backend address and port. It can contain multiple addresses when a request was retried. Access logs include upstream address, upstream status and request duration. These are useful for proving that different replicas receive requests without changing the Flask application.

The header intentionally reveals internal addressing for this local exercise. Remove it before publishing the application to real users. Do not rely on the observed sequence being a perfectly alternating pattern: other requests, healthchecks, DNS changes and retries also affect peer selection.

### Non-root, read-only operation

Compose runs Nginx directly as UID/GID `101:101`, without the official image's startup rewrite scripts. The full custom configuration does not contain a `user` directive. Its PID and all temporary module paths are placed in a writable, size-limited `/tmp` tmpfs; configuration and the image filesystem remain read-only. Nginx initializes FastCGI, uWSGI and SCGI temporary directories even though this lab only uses HTTP proxying, so those paths also need explicit `/tmp` locations.

The proxy drops all Linux capabilities and enables `no-new-privileges`. The network-namespace sysctl `net.ipv4.ip_unprivileged_port_start=0` permits the non-root process to bind container port 80 without `NET_BIND_SERVICE`. This applies inside that container, not to the host's listening-port policy. If a different Docker backend forbids the sysctl, use an unprivileged internal listening port and update the port mapping and healthcheck together.

The proxy joins frontend only. It does not receive database credentials or mount the MySQL data volume. HTTPS and certificates are not configured in this local HTTP lab.

## 21. Proxy, scaling and isolation exercises

### Inspect configuration and readiness

```powershell
docker compose --env-file .env.compose exec proxy nginx -t
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose logs --tail 30 proxy

curl.exe -i http://localhost:5052/nginx-health
curl.exe -i http://localhost:5052/health
curl.exe -i http://localhost:5052/db-health
```

Expect 204, 200 and 200 respectively when the stack is ready. If you changed `APP_PORT`, update these browser and curl URLs.

### Observe multiple replicas

```powershell
1..10 | ForEach-Object {
    curl.exe -sS -D - -o NUL http://localhost:5052/health |
        Select-String 'X-Lab-Upstream'
}

# Select each replica explicitly for a direct internal request.
docker compose --env-file .env.compose exec --index 1 app curl -fsS http://localhost:5000/health
docker compose --env-file .env.compose exec --index 2 app curl -fsS http://localhost:5000/health
```

Compare the response addresses with the frontend network's container addresses. After scaling to three, repeat the requests until Docker DNS and Nginx converge. You should observe three live backend addresses without restarting the proxy. Scaling back down also has a convergence period; transient 502/504 responses can occur when a request was already trying to connect to a removed peer. This lab does not implement connection draining or rolling updates.

### Confirm network membership and DNS boundaries

```powershell
docker network inspect docker-networking-lab_frontend
docker network inspect docker-networking-lab_backend
docker network inspect docker-networking-lab_administration
docker compose --env-file .env.compose exec proxy nslookup app

# Expected DNS failure: the proxy and database do not share a network.
docker compose --env-file .env.compose exec proxy nslookup db_mysql

# Expected success: each app also belongs to backend.
docker compose --env-file .env.compose exec --index 1 app nslookup db_mysql
docker compose --env-file .env.compose exec --index 1 app ping -c 3 db_mysql
```

Nginx's small runtime is not the troubleshooting container; use the Flask image for its richer networking tools. A failed name lookup alone is not a universal proof that every possible route is blocked. Combine it with network membership and, when diagnosing reachability, an actual TCP test to the destination address.

### Simulate a replica failure

```powershell
$replicaToStop = docker compose --env-file .env.compose ps -q app | Select-Object -First 1
docker stop $replicaToStop

1..10 | ForEach-Object {
    curl.exe -sS -D - -o NUL http://localhost:5052/health |
        Select-String 'X-Lab-Upstream'
}

# Restore the desired state and wait for readiness.
docker compose --env-file .env.compose up -d --wait --wait-timeout 240
```

With one healthy replica still available, routing should recover through that replica. An abrupt stop can produce a transient 502/504 while an in-flight connection and DNS refresh converge; the tests observed this transition. Repeat requests after a short wait and check the upstream header and logs. This setup does not promise uninterrupted failover for every request. A manually stopped replica stays stopped until you restore it. This demonstrates HTTP redundancy on one Docker host; it does not provide recovery from loss of the host or the single database.

### Apply configuration changes

After editing `nginx/nginx.conf`, validate before reloading:

```powershell
docker compose --env-file .env.compose exec proxy nginx -t
docker compose --env-file .env.compose exec proxy nginx -s reload
```

After changing the proxy service definition in YAML, use `docker compose --env-file .env.compose up -d --wait --wait-timeout 240` instead, so Compose can recreate the container when necessary. Rebuilding Flask is not required for an Nginx-only configuration change.

## 22. Proxy and deployment validation results

The extended stack was verified on Docker Engine 28.3.3 and Docker Compose v2.39.2 using a unique temporary project, generated credentials, fresh database storage and dynamically assigned loopback ports. The existing `.env.compose` was not changed and no existing database volume was attached to the tests.

| Verification | Result |
| --- | --- |
| Compose model, two declared app replicas and deployment limits | Passed |
| Nginx image availability and pull | Passed |
| First startup with SQL and app readiness dependencies | All five containers became healthy |
| Nginx configuration syntax | `nginx -t` succeeded |
| Proxy-only liveness endpoint | HTTP 204 |
| HTML, CSS, JavaScript and Flask/SQL health through Nginx | HTTP 200 |
| Repeated HTTP requests across the two app replicas | Both upstream addresses observed |
| App DNS, unprivileged ping and MySQL TCP connection | Passed |
| Authenticated SQL query from Flask | `SELECT 1` succeeded |
| App-to-phpMyAdmin and phpMyAdmin-to-app HTTP | Passed |
| Optional administration interface through its loopback host port | HTTP 200 |
| App and proxy CPU, memory and PID ceilings | Confirmed in actual Docker container settings |
| Proxy identity, read-only root filesystem and writable `/tmp` | Passed |
| Proxy network membership and database DNS exclusion | Frontend only; `db_mysql` did not resolve |
| Stop one replica, then repeat requests after DNS convergence | Traffic stabilized on the remaining replica |
| Increase app count from two to three | Three upstream addresses observed |
| Nginx process during scale-up | Same container ID and start timestamp; no restart |
| Run `up` without a scale override | Returned to two replicas and two live upstream addresses |

Runtime testing found two configuration requirements: Nginx's unused module temporary paths still need writable locations, and phpMyAdmin needs the separate administration bridge for host-port publication on this backend. Both were corrected and the full test sequence passed.

Failure and scale-down testing also observed transient gateway errors during DNS/connection convergence. Recovery is verified, but zero-error transitions are not claimed. The test containers, three networks, generated environment file and verification-only volume were removed after testing. The default lab stack is not left running automatically; start it using the quick-start command when you want to practice.
