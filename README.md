# MiniBasket Álava

Versión rehecha de la webapp MiniBasket Álava (resultados, calendarios y clasificaciones de la
Federación Alavesa de Baloncesto), recuperada de la caché de un iPhone cuando el sitio original
(miminibasket.web.app) dejó de estar publicado.

- `app/`: la app original (React + PWA), adaptada para leer los datos de `api/v1/*.json` con rutas relativas.
- `scraper/actualizar.mjs`: lee basketaraba.com y genera esos JSON. Sin dependencias (Node 20+).
- `scraper/semilla.json`: identificadores de la app original (para conservar favoritos).
- `config.json`: grupos que se leen (código de grupo de basketaraba.com).
- `.github/workflows/publicar.yml`: actualiza los datos periódicamente y publica en GitHub Pages.

Para añadir grupos, edita `config.json`. Los códigos están en
https://basketaraba.com/es/fab-online/calendario-y-resultados-federacion-alavesa-de-baloncesto?grupo=0

Prueba local: `node scraper/actualizar.mjs dist` y después copia `app/` dentro de `dist/`.

Limitaciones: basketaraba.com no publica la hora de los partidos en estas páginas; como campo se usa el del equipo local.
Actualización: cada 8 h sábados, domingos, lunes y martes. Las tareas programadas de GitHub se desactivan tras 60 días sin actividad en el repositorio.
