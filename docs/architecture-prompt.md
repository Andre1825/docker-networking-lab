# Architecture image generation prompt

Generated with the built-in GPT Images tool from the project's `compose.yml`. Output: `docs/architecture.png`.

```text
Use case: infographic-diagram.
Asset type: final Docker Compose architecture illustration for an English GitHub README.
Create a polished, readable technical architecture diagram on a clean white background, landscape 16:9, with crisp navy typography, generous whitespace, restrained blue/green/purple accents, simple professional service icons, flat service cards, and tidy directional connectors. The entire diagram must be in English. Title: "Docker Networking Lab". Subtitle: "Nginx + two Flask replicas + MySQL + optional phpMyAdmin".

Use exactly these service cards, once each:
- "Nginx" with "proxy :80", "Reverse proxy / load balancer", network badge "frontend".
- "Flask · replica 1" with "app :5000", two network badges "frontend" and "backend".
- "Flask · replica 2" with "app :5000", two network badges "frontend" and "backend".
- "MySQL" with "db_mysql :3306", "No published host port", network badge "backend".
- "phpMyAdmin" with "phpmyadmin :80", "Optional · admin profile", two network badges "backend" and "administration".
- A disk/storage symbol below MySQL labeled "mysql_data" and "Persistent volume".

Layout: main application flow runs left to right across the upper middle: a host browser icon labeled "Browser" sends HTTP to Nginx; Nginx splits requests into two clearly separate app cards stacked vertically; BOTH Flask cards connect directly to the ONE shared MySQL card. Label the browser-to-Nginx arrow "127.0.0.1:5052 → :80", the Nginx-to-Flask branching links "HTTP :5000", and the Flask-to-MySQL links "SQL / TCP :3306". Do not chain the replicas together.
A separate lower administration flow starts with an "Admin browser" icon, then an arrow labeled "127.0.0.1:8081 → :80" to phpMyAdmin, and a direct SQL arrow from phpMyAdmin to the same MySQL card, labeled "SQL / TCP :3306". There must be no Nginx-to-phpMyAdmin or Nginx-to-MySQL arrow. Connect MySQL to its storage volume with a distinct short storage connector.

Use network-membership badges on the cards rather than inaccurate overlapping network boxes. A compact bottom legend describes exactly:
"frontend · bridge"
"backend · bridge · internal: true"
"administration · bridge"
Use blue for HTTP application links, green for SQL/backend links, and purple for the separate administration ingress.
Include a small unobtrusive note: "Docker DNS: app → replica addresses" and "Flask replicas have no host ports".
Constraints: no cloud, Kubernetes, Swarm, TLS certificates, third replica, additional database, invented security or availability claims, credentials, watermarks, unreadable text, crossed unlabeled connectors, or decorative objects. Network badges and arrow directions must exactly match the configuration. Prioritize technical correctness and legibility at GitHub README width.
```
