# test-manager-library-3145555-tool

> **Prueba técnica · Ficha ADSO 3145555**
> Horario: **miércoles 14 de octubre de 2026, de 6:50 a. m. a 11:00 a. m.** (hora Colombia). Entrega a las **11:00 a. m.**

Este repositorio guarda las **utilidades** de *Manager Library*: el sembrador de datos de demostración, que usa la API. **Empieza vacío a propósito**: se construye en el fork de cada aprendiz.

## Instrucciones

Cada aprendiz debe **crear el fork** de los seis repositorios del proyecto y **resolver el proyecto
con el spec planteado**.

1. Hacer fork, a su cuenta de GitHub, de cada repositorio de la tabla del final.
2. Leer el spec en [`test-manager-library-3145555-docs`](https://github.com/code-sena/test-manager-library-3145555-docs).
   Se entrega en dos versiones: `spec-python/` y `spec-.net/`.
3. Desarrollar en los forks.

## El reto se desarrolla con React y PHP (Laravel)

El spec está escrito para Python y para .NET, pero el reto **no** se hace en esos lenguajes:

| Capa | Tecnología del reto |
|---|---|
| Frontend | React |
| Backend | PHP con Laravel |

Lo que el spec define sobre el negocio —historias, criterios de aceptación, reglas, contrato de la
API, modelo de datos— se respeta. Lo que define sobre la tecnología se traduce a React y Laravel.

## La prueba no consiste en escribir el código

El propósito principal es ver la **capacidad de desempeño con SDD** (*Spec-Driven Development*,
desarrollo guiado por especificación): cómo se lee, se interpreta y se aplica una especificación
para llevarla a un stack distinto. El código es el medio, no el fin.

## Entrega

Cuenta lo que quede **subido a los forks antes de las 11:00 a. m.** Lo que llegue después no se revisa.
No hay prórroga: suban avances parciales con commits pequeños durante la prueba.

## T-21: implementation and SDD evidence

Read the [pre-code plan](evidence/t-21-plan.md) first. The implementation applies docs decisions
C-04 (demo), C-06 (trusted HTTPS) and C-07 (measurement) to the existing Laravel API. It does not
change the product contract. Node.js is a client utility, not an additional application backend.
See [T-21 evidence and the preserved raw local measurement](evidence/t-21.md) for actual results.

Requirements: Node.js 22–26, Docker with Compose, Git and OpenSSL. There are no npm runtime
dependencies. The API owns migrations; this tool never connects to PostgreSQL or executes SQL.

### Reproduce the complete isolated verification

Keep the API, React app and infra repositories as siblings of this repository, on the revisions
identified in the evidence. Prepare infra's local certificate once with
`node ../test-manager-library-3145555-infra/scripts/init-local.mjs`. This refuses to overwrite
existing configuration and does not install global certificate trust.

```sh
npm ci --ignore-scripts
npm test
npm run verify
```

`verify` creates two unique Compose projects and new credentials. First it uses demo profile and
the September clock, creates 40 books/10 members/3 one-line loans, recreates **only API** at the
October clock, proves the previous token is expired and logs in again. It then creates 12 more
one-line loans. It verifies exactly 15 loans, three overdue lines, stock, frozen snapshots, a
maximum of three open lines per member and 15 report rows without personal dimensions.
Dates are deployment configuration; loan requests contain only `member_id` and `items[].book_id`.

The demo project's own volumes are removed after verification. A separate fresh project uses
production profile and the real clock for 5,000 books, exactly 1,000 in each fixed category.
Only generated test projects are removed. Existing deployments and their volumes are untouched.
Set `TOOL_INFRA_DIR`, `API_CONTEXT`, `APP_CONTEXT`, `TLS_DIR` or `TOOL_HTTPS_PORT` for other local
paths/ports. All paths are resolved before Compose is invoked.

### Manual phases against a dedicated empty deployment

Copy `.env.example` to `.env` and supply the dedicated environment's admin credentials and trusted
CA path. The API URL must be HTTPS. Tokens stay in memory; passwords retain their original text.
Do not point the seeder at a shared or production catalog.

1. Deploy isolated `APP_ENV=demo`, `CLOCK_MODE=fixed`, `CLOCK_FIXED_AT=2026-09-29T14:15:00Z`.
2. Run `npm run demo:early`.
3. Recreate only that deployment's API with `CLOCK_FIXED_AT=2026-10-14T14:15:00Z`.
4. Run `npm run demo:current`, then `npm run demo:verify` if desired.

The checkpoints are private files under `.local/`. A completed/failed checkpoint is never
automatically replayed. After a partial or uncertain write, retain its checkpoint and use a
**new empty isolated project**, a fresh checkpoint path and fresh credentials. There are no POST
retries and no claim of exactly-once delivery. A stale lock after process termination requires
manual inspection; do not delete it while a process is running.

### RNF-1 measurement

For manual measurement, use another empty normal-profile deployment with real time. Configure
`TOOL_SERVER_CPU_COUNT`, `TOOL_SERVER_MEMORY_BYTES`, `TOOL_SERVER_LOCATION`, `TOOL_API_REVISION`
and `TOOL_INFRA_REVISION` with actual values, then run `npm run catalog` and `npm run benchmark`.
The isolated runner supplies these from the Docker engine and Git automatically.

| Query | Filters (all page=1, size=20) | Expected total |
|---|---|---:|
| Unfiltered | none | 5000 |
| Title | q=Libro de prueba 000 | 99 |
| Author | q=Autor de prueba 07 | 100 |
| Category and title | Novela ID + q=Libro de prueba | 1000 |

For each query, 20 warmups are excluded and 100 sequential requests are measured from send to
complete body receipt with a monotonic clock. HTTPS validation stays enabled. Persistent
connections are allowed; response caching and reuse of results are not used. Every raw duration,
HTTP status and validation error is retained, including failures and slow samples. Median uses
the average of the two central values for an even count; p95 uses nearest rank.

RNF-1 passes only when **all 400 responses are valid HTTP 200 and each is strictly below 300 ms**.
A value of 300 ms fails. p95 cannot replace this rule. Failed runs retain their report and exit
with status 2; incomplete/operational failures exit 1. Ten simultaneous logical clients execute
the four queries as a separate 40-request diagnostic without an added timing threshold.

`artifacts/demo-summary.json` and `artifacts/benchmark.json` contain safe counts, raw measurements,
queries, source revisions and hardware/location metadata. They omit credentials, tokens, request
bodies and member details. CI uploads only those two reports, including on failure. Private
configuration, fixture checkpoints and certificates remain ignored.

The original exam deadline above is preserved. Later commits do not change that deadline.
Passing this utility does not replace the manual fair walkthrough or full accessibility review.

## Repository map

| Repositorio | Qué va ahí |
|---|---|
| [`test-manager-library-3145555-docs`](https://github.com/code-sena/test-manager-library-3145555-docs) | El spec: `spec-python/` y `spec-.net/` |
| [`test-manager-library-3145555-api`](https://github.com/code-sena/test-manager-library-3145555-api) | Backend en PHP (Laravel) |
| [`test-manager-library-3145555-app`](https://github.com/code-sena/test-manager-library-3145555-app) | Frontend en React |
| [`test-manager-library-3145555-page`](https://github.com/code-sena/test-manager-library-3145555-page) | Sitio público estático de presentación |
| [`test-manager-library-3145555-infra`](https://github.com/code-sena/test-manager-library-3145555-infra) | Contenedores, red, volúmenes y motor de base de datos vacío |
| [`test-manager-library-3145555-tool`](https://github.com/code-sena/test-manager-library-3145555-tool) | Utilidades: sembrador de datos de demostración |
