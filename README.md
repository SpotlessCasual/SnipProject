# Snip

Snip is a tiny URL shortener with one backend and two clients: an Angular web
app and a Node.js CLI. The backend keeps links in an in-memory `Map`, so links
are cleared when the server restarts.

## Repository layout

Each component is the root of its own branch and is mounted here as a
same-repository submodule. The `main` branch pins an exact commit for every
submodule.

| Branch | Submodule | Contents |
| --- | --- | --- |
| `backend` | `backend/` | Bun API server |
| `frontend` | `frontend/` | Angular 19 web app |
| `cli` | `cli/` | CommonJS Node.js CLI |
| `bundle` | `bundle/` | Generated release: server, built UI, CLI, Docker config |
| `main` | — | Superproject, build script, and CI |

## API contract

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` `{ error }` for invalid input |
| `GET` | `/api/links` | — | `200` array of link objects |
| `GET` | `/:code` | — | `302` redirect to the original URL and increment `hits`; `404` `{ error }` when unknown |

## Clone and run

Clone with submodules initialized; a plain clone leaves their directories
unpopulated:

```sh
git clone --recurse-submodules https://github.com/SpotlessCasual/SnipProject.git
cd SnipProject
```

Run each component in its own terminal:

```sh
cd backend && bun start
cd frontend && npm install && npx ng serve
cd cli && node cli.js ls
```

The backend listens on port `3000` by default, and the frontend calls it at
`http://localhost:3000`.

## Updating a component

Commit and push changes from inside that component's submodule first. Then
advance and commit the pointer in the superproject:

```sh
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Repeat with `frontend` or `cli` as appropriate. The generated `bundle/` release
is updated by `node scripts/build-bundle.mjs`; do not edit its contents by hand.
Use `node scripts/build-bundle.mjs --push` to push both the generated bundle
branch and its updated pointer on `main`.
