# NoniPlotter

### A web app for plotting GPX track files straight from your globetrotting gadgets.

### Also, and mostly, an experiment to see if ChatGPT's Codex can write anything useful from scratch with no actual code-writing by the user (the answer is: yes)

## Admin Password

Uploading and deleting tracks is gated by a simple password. Set it via the `ADMIN_PASSWORD` environment variable when starting the server. The default is `changeme`, so swap it out before shipping.

The password hops over in a cookie named `admin-password`; the sidebar's password box saves it for you.

### Docker Compose

Running with `docker compose`? Pop your secret into an environment variable and the compose file will wire it through:

```
ADMIN_PASSWORD=supersecret docker compose up -d
```

No env var? It falls back to `changeme`, so don't leave that in production.
