# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener API.
Requires Node.js 20 or newer.

```sh
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

Set `SNIP_API` to use a different backend origin; it defaults to
`http://localhost:3000`. Installing the package exposes the `snip` command via
its `bin` entry. The `snip`, `snip.cmd`, and `snip.ps1` wrappers can also be run
directly from this folder.
