# Snip backend

A dependency-free Bun server for the Snip URL shortener. Links are kept in memory
and are cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in generated short links, or `PUBLIC_DIR` to serve static
files alongside the API and redirects. If `BASE_URL` is unset, the server uses
`https://$RAILWAY_PUBLIC_DOMAIN` when available, otherwise `http://localhost:$PORT`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a short link.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count.
