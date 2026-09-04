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

## The commands you'll actually use

Once the concepts are clear, the commands are just their mechanical
expressions. The recurring ones cluster into a few groups.

**Working with images.** You build an image from a `Dockerfile` with
`docker build -t my-image .` (the `-t` gives it a name), list what you have
with `docker images`, and remove what you no longer need with
`docker rmi my-image`.

**Running containers.** `docker run` starts a container from an image; the
flags you'll see constantly are `-d` (run in the background),
`--name` (give it a name instead of a random one), `-p` (publish a port,
e.g. `-p 8000:8000`), and `-v` (mount a named volume, e.g.
`-v myvol:/data`). `docker ps` lists running containers and `docker ps -a`
also shows stopped ones. Logs come from `docker logs my-container` (with
`-f` to follow live). To inspect a running container you open a shell with
`docker exec -it my-container sh`. `docker stop` pauses a container and
`docker rm` removes a *stopped* one; `docker rm -f` stops and removes in one
step. When you're accumulating cruft, `docker system prune` cleans unused
resources (and `prune -a` removes more aggressively — read the output before
confirming).

**Volumes.** `docker volume ls` lists them, `docker volume create myvol`
creates one explicitly (though `-v` in `run` creates it implicitly), and
`docker volume rm` deletes it.

**Compose adds the orchestration layer.** `docker compose up` starts the
stack with logs attached, `up -d` starts it in the background, and
`up -d --build` rebuilds the images first. `docker compose ps` shows
service status, `docker compose logs` (with `-f`) shows logs, and
`docker compose config` validates the compose file. `docker compose down`
stops the stack; `docker compose restart` restarts it.

Two compose details are worth internalizing because they decide whether your
data survives:

- `docker compose down` stops containers and the network but **keeps named
  volumes** — your data survives. Only `down -v` also removes volumes, and
  with them your database. This is the classic "I lost my data" trap.
- The modern command is `docker compose` (with a space, the v2 form). The
  older `docker-compose` (hyphenated) is legacy and shouldn't be used in new
  projects. Use `-f FILE` to point at a specific compose file when yours
  isn't named `docker-compose.yml`, and run compose commands from the
  directory that contains it.
