# Videos de Juez Miau

- `JuezMiau`: el video demo del sitio (`site/assets/video/juez-miau.mp4`).
- `tutorial-<id>`: los tutoriales de la sección **Tutoriales** del panel de staff
  (`apps/frontend-staff/public/tutoriales/<id>.mp4` y su portada `<id>.jpg`).

## Regenerar los tutoriales

Son capturas reales del panel, con zoom, cursor, subtítulos y voz. Necesitan corriendo, con la base de desarrollo
(`pnpm seed:dev`): el backend (`pnpm start:dev`), el worker (`pnpm start:worker:dev`) y el panel (`ng serve`).

1. Capturas: `node scripts/capturas.mjs [id ...]`. Los guiones están en `scripts/guiones.mjs`; cada paso es una frase
   y el elemento que señala. Entra con el superadmin de `apps/backend/.env`.
   - El orden importa: `superadmin` crea el "Concurso de práctica", los siguientes lo configuran, lo programan e
     inician, y simulan a un equipo por la API. `marcador` usa la "Edición Demo".
   - Para regrabar desde cero hay que quitar a mano el "Concurso de práctica": el backend todavía no puede borrar
     equipos ni ediciones con equipos (falla la llave de `team_member`).
2. Voz: `<python con edge-tts> scripts/voz_tutoriales.py [id ...]` (voz `es-MX-DaliaNeural`, como el demo).
3. Si agregas un guion, impórtalo en `src/tutoriales/index.ts` y en
   `apps/frontend-staff/src/app/features/tutorials/tutorials.data.ts` (con los roles que lo pueden hacer).
4. Render y portada:

   ```console
   npx remotion render tutorial-<id> out/<id>.mp4 --codec=h264 --crf=26
   # un keyframe por segundo: si no, al volver a la pestaña la imagen se congela hasta el siguiente
   ffmpeg -i out/<id>.mp4 -c:v libx264 -crf 26 -pix_fmt yuv420p -g 30 -keyint_min 30 -sc_threshold 0 \
     -c:a copy -movflags +faststart ../frontend-staff/public/tutoriales/<id>.mp4
   npx remotion still tutorial-<id> ../frontend-staff/public/tutoriales/<id>.jpg --frame=45 --image-format=jpeg --scale=0.5
   ```

# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
