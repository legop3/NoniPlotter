# NoniPlotter

### A web app for plotting GPX track files straight from your globetrotting gadgets.

### Also, and mostly, an experiment to see if ChatGPT's Codex can write anything useful from scratch with no actual code-writing by the user (the answer is: yes)

## Admin Password

Uploading and deleting tracks is gated by a simple password. Set it via the `ADMIN_PASSWORD` environment variable when starting the server. The default is `changeme`, so swap it out before shipping.

The password rides along in the `x-admin-password` header; the frontend's password field takes care of that for you.
