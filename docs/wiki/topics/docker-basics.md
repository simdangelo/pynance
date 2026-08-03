# Docker Basics: images, containers, volumes, and docker-compose

A general guide to Docker's core concepts. It teaches what Docker is and why it
exists, the concepts you'll use constantly (`image`, `container`, `volume`,
`docker-compose`, networking), the trade-offs, and the pitfalls. Nothing here
assumes any particular project.

---

## What problem Docker solves

Software runs on top of an operating system — and that OS has libraries,
versions, paths, users, and config that the software depends on. "Works on my
machine" is real: a laptop environment differs from a server's. The classic fix
was a *virtual machine* (a full emulated computer), which is heavy and slow to
start.

Docker offers a lighter isolation primitive: the **container**.

A container bundles an application *plus its runtime environment* (system
libraries, the interpreter, config) into one self-contained unit. It runs
directly on the host's OS kernel, sharing that kernel but isolating filesystem,
processes, and network from everything else. Because the environment ships with
the app, the container behaves the same on any machine that has Docker.

## Core concepts

### Image vs container

This is the single most confusing distinction for newcomers.

- **Image** = a *blueprint* (a read-only, immutable template). It contains the
  filesystem, libraries, and default config your app needs. Think "a class" or
  "an installer package."
- **Container** = a *running instance* of an image. It's the live process with
  its own writable filesystem layer on top of the image. Think "an object" or "a
  process started from the package."

You can have one image and dozens of containers running from it. Stopping or
deleting a container does not touch the image. The image itself never changes
while running — changes made by a running container live in the container's own
layer and vanish when the container is removed (unless you persist them — see
volumes).

### The Dockerfile → image → container pipeline

You describe how to build an image in a `Dockerfile`:

```dockerfile
FROM python:3.14-slim
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
```

- `FROM` starts from an existing image (here, the official Python image).
- `COPY`/`RUN` build up layers.
- `CMD` says what runs when a container starts.

`docker build` produces an image; `docker run` starts a container from it.

### Volumes — persistence

By default, everything a container writes is lost when the container is
removed. **Volumes** are named storage that outlives containers. This is
critical for a database: your Postgres data must survive `docker stop`, crashes,
and container recreation.

```bash
docker run -v pgdata:/var/lib/postgresql/data postgres:16
```

Here `pgdata` is a named volume; the container writes its data files there, and
the volume persists even if the container is deleted. The path on the right
(`/var/lib/postgresql/data`) is *inside* the container — the database doesn't
know or care that its storage is actually a Docker volume.

### Docker Compose — orchestrating multiple containers

A stack typically has more than one container (a database, an API, a reverse
proxy). Running them by hand with `docker run` gets unmanageable. **Docker
Compose** declares the whole stack in one YAML file (`docker-compose.yml`) and
manages it with a single command.

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: secret

volumes:
  pgdata:
```

```bash
docker compose up -d      # start everything in the background
docker compose down       # stop and remove the containers
```

Compose handles the details for you: it creates the volumes declared in the
`volumes:` section, starts the services in the right order, and puts them on a
shared network so they can find each other by *service name*.

### Networking — how containers talk to each other

Containers are isolated from the host's network by default. Compose creates a
private network for your stack; containers on it reach each other **by service
name** (`db`, `api`, ...), which Docker resolves to the right IP. A service
connects to the database simply with hostname `db` — no need to know an IP.

To reach a container from your *host machine* (a browser, tests, a CLI), you
**publish** a port with the `ports:` directive: `"8000:8000"` maps host port
8000 to the container's port 8000. This is a deliberate, explicit bridge —
nothing is reachable from the host unless you publish it.

## Trade-offs and alternatives

- **Docker vs a VM**: VMs virtualize the whole OS (heavy, slow to boot, big
  disk). Containers share the host kernel (fast, light, near-native). You lose
  full isolation: a container shares the host's kernel, so kernel-level
  isolation is weaker than a VM's.
- **Docker vs installing a dependency directly**: installing Postgres (or any
  service) on the host pollutes the machine, depends on the OS's package
  versions, and makes "reproduce my environment" a manual chore. Docker pins the
  exact version and data setup in a file. Cost: one more tool to run.
- **Compose vs raw `docker run`**: for more than one container, compose is
  strictly less work and is declarative — the whole stack lives in a file you
  can review and commit.

## Pitfalls

- **Forgetting volumes** → your database data vanishes every time you
  `docker compose down`. A data directory must always be a volume.
- **Port conflicts** → "port already in use" usually means another container
  (or a leftover local install) already bound that host port. `docker compose
  down` doesn't always free ports from unrelated processes.
- **Assuming `docker run` and `docker compose` overlap 1:1** → they don't.
  Compose generates the `docker run` commands for you, but its `ports:`,
  `volumes:`, and `environment:` keys are *its* syntax.
- **Editing files inside a running container** → changes are lost when the
  container is recreated. Config belongs in the image or in env vars / volumes.
- **`localhost` confusion** → inside the compose network, the database is
  `db`, not `localhost`. `localhost` from a container is the container itself.
  Only the host sees `localhost`; and only for published ports.

## Where Docker typically fits

Running a database or other infrastructure dependency in a container — instead
of installing it on the host — is a common, modern setup. Later, the same
machinery is used to containerize the application itself for deployment.

---

## Cheatsheet — Docker

### Images

| Task | Command |
| --- | --- |
| Build an image from a `Dockerfile` | `docker build -t my-image .` |
| List images | `docker images` |
| Pull an image without building | `docker pull postgres:16` |
| Remove an image | `docker rmi my-image` |

### Containers

| Task | Command |
| --- | --- |
| Run a container in the background | `docker run -d --name my-container my-image` |
| Run a container with a published port | `docker run -d -p 8000:8000 my-image` |
| Run a container with a named volume | `docker run -d -v myvol:/data my-image` |
| List running containers | `docker ps` |
| List all containers (incl. stopped) | `docker ps -a` |
| See container logs | `docker logs my-container` |
| Follow logs live | `docker logs -f my-container` |
| Open a shell inside a running container | `docker exec -it my-container sh` |
| Stop a container | `docker stop my-container` |
| Start a stopped container | `docker start my-container` |
| Remove a stopped container | `docker rm my-container` |
| Stop and remove a container | `docker rm -f my-container` |

### Volumes

| Task | Command |
| --- | --- |
| List volumes | `docker volume ls` |
| Create a volume | `docker volume create myvol` |
| Remove a volume | `docker volume rm myvol` |

### General

| Task | Command |
| --- | --- |
| Clean up unused resources | `docker system prune` |
| Remove everything unused (careful) | `docker system prune -a` |

---

## Cheatsheet — Docker Compose

### Lifecycle

| Task | Command |
| --- | --- |
| Start the stack (foreground, logs attached) | `docker compose up` |
| Start the stack in the background | `docker compose up -d` |
| Rebuild images and start | `docker compose up -d --build` |
| Show status of services | `docker compose ps` |
| Show logs of all services | `docker compose logs` |
| Follow logs live | `docker compose logs -f` |
| Stop and remove containers + network | `docker compose down` |
| Stop and remove *everything* incl. volumes (data!) | `docker compose down -v` |
| Restart services | `docker compose restart` |
| Validate the config file | `docker compose config` |

### Common flags

| Flag | Meaning |
| --- | --- |
| `-d` | run in the background (detached) |
| `--build` | rebuild images before starting |
| `-f FILE` | use a specific compose file (default `docker-compose.yml`) |
| `-v` | with `down`: also remove named volumes (deletes data) |

### Gotchas on the cheatsheet

- `docker compose down` stops the stack but **keeps volumes** — data survives.
  Only `down -v` deletes volumes (and with them, your database). This is the
  "I lost my data" trap.
- `docker compose` (space, the modern v2 command) is the current form. The old
  `docker-compose` (hyphen) binary is legacy — don't mix them.
- Run compose commands from the directory containing `docker-compose.yml`, or
  pass `-f path/to/docker-compose.yml`.
