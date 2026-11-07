// Guiones de los tutoriales del panel de staff. Cada paso es una captura con la frase que dice la voz;
// `en` señala el elemento (CSS o "texto=..."), y `clic`, `escribir` o `elegir` actúan sobre él.
// Los ids coinciden con apps/frontend-staff/src/app/features/tutorials/tutorials.data.ts.
//
// El orden importa: superadmin crea el "Concurso de práctica", los siguientes lo configuran, lo inician y
// simulan a un equipo por la API (pregunta, envíos y una alerta). Marcador usa la Edición Demo (seed:dev).

const PRACTICA = "Concurso de práctica";
const DEMO = "Edición Demo";

async function edicion(t, nombre) {
  const eds = await t.api("GET", "/editions");
  const e = (eds.data ?? eds).find((x) => x.name === nombre);
  if (!e) throw new Error(`No existe la edición "${nombre}": graba primero el tutorial superadmin`);
  return e;
}

// Un problema publicado en la edición de práctica (lo que enseña el tutorial de problemas, hecho por la API).
// Retoma lo que haya quedado a medias en una corrida anterior.
async function publicarProblema(t, ed) {
  const [cat] = await t.api("GET", `/editions/${ed.id}/categories`);
  const langs = Object.fromEntries((await t.api("GET", "/languages")).map((l) => [l.code, l.id]));
  await t.api("PUT", `/editions/${ed.id}/languages`, { ids: [langs.python, langs.c, langs.cpp].filter(Boolean) });
  let p = (await t.api("GET", `/editions/${ed.id}/problems`))[0];
  if (p?.status === "published") return;
  if (!p) {
    p = await t.api("POST", `/editions/${ed.id}/problems`, {
      categoryId: cat.id, title: "Suma de una lista",
      statement: "Dada una lista de enteros `nums`, regresa la suma de todos sus elementos.",
      inputFormat: "`nums`: lista de enteros.", outputFormat: "Un entero: la suma.",
    });
    await t.api("PATCH", `/problems/${p.id}/signature`, { functionName: "suma", params: [{ name: "nums", type: { type: "array", items: { type: "long" } } }], returns: { type: "long" } });
    for (const [nums, visibility] of [[[1, 2, 3], "public"], [[], "public"], [[-5, 5, -7], "hidden"]]) {
      await t.api("POST", `/testsets/${p.testsetId}/cases`, { input: { nums }, visibility });
    }
    await t.api("PUT", `/testsets/${p.testsetId}/ref-solution`, { languageId: langs.python, source: "def suma(nums):\n    return sum(nums)\n" });
    await t.api("POST", `/testsets/${p.testsetId}/build`);
  }
  const testsetId = p.testsetId ?? (await t.api("GET", `/problems/${p.id}`)).currentTestsetId;
  let reintento = false;
  for (let i = 0; ; i++) {
    const ts = await t.api("GET", `/testsets/${testsetId}`);
    if (ts.status === "ready") break;
    if (ts.status === "failed" && !reintento) {
      reintento = true; // p. ej. el build corrió antes de que el worker terminara de arrancar
      await t.api("POST", `/testsets/${testsetId}/build`);
    } else if (ts.status !== "building" || i > 180) {
      throw new Error(`El testset no se construyó (${ts.status}): ${ts.buildLog ?? ""} ¿Corre el worker (pnpm start:worker)?`);
    }
    await t.sleep(1000);
  }
  await t.api("POST", `/problems/${p.id}/accept`);
}

// Lo que haría un equipo desde su app durante el concurso. Solo hace lo que falte (se puede repetir).
async function actividadDeEquipo(t, ed) {
  const { items: [team] } = await t.api("GET", `/editions/${ed.id}/teams`);
  const cred = await t.api("GET", `/teams/${team.id}/credentials`);
  const { accessToken } = await t.api("POST", "/auth/team/login", { username: cred.username, password: cred.password, machineId: "tutorial" });
  const [problem] = await t.api("GET", `/editions/${ed.id}/problems`);
  const python = (await t.api("GET", "/languages")).find((l) => l.code === "python").id;
  if (!(await t.api("GET", `/editions/${ed.id}/clarifications`)).length) {
    await t.api("POST", "/contest/clarifications", { problemId: problem.id, question: "¿La lista puede venir vacía?" }, accessToken);
  }
  const fuentes = [
    "def suma(nums):\n    return 0\n",
    "def suma(nums):\n    total = 0\n    for x in nums:\n        total += x\n    return total\n",
  ];
  const ya = (await t.api("GET", `/editions/${ed.id}/submissions`)).length;
  for (const source of fuentes.slice(ya)) {
    await t.sleep(6000); // el backend pide 5 s entre envíos del mismo equipo
    await t.api("POST", "/submissions", { problemId: problem.id, languageId: python, source }, accessToken);
  }
  if (!(await t.api("GET", `/editions/${ed.id}/flags`)).length) {
    await t.api("POST", "/contest/heartbeat", { monitors: 2, processes: [], usbStorage: [], networkInterfaces: ["Ethernet"] }, accessToken);
  }
  for (let i = 0; i < 90; i++) {
    const subs = await t.api("GET", `/editions/${ed.id}/submissions`);
    if (subs.length >= 2 && subs.every((s) => s.status === "DONE")) return;
    await t.sleep(1000);
  }
  throw new Error("Los envíos no se evaluaron. ¿Corre el worker (pnpm start:worker)?");
}

const enDiezMinutos = () => {
  const d = new Date(Date.now() + 10 * 60_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const GUIONES = {
  superadmin: {
    titulo: "Ediciones, staff y lenguajes",
    async grabar(t) {
      // Para poder regrabar: la de práctica anterior se borra mientras siga en borrador
      const eds = await t.api("GET", "/editions");
      const vieja = (eds.data ?? eds).find((x) => x.name === PRACTICA);
      if (vieja?.status === "DRAFT") await t.api("DELETE", `/editions/${vieja.id}`);
      else if (vieja) throw new Error(`"${PRACTICA}" ya se programó; renómbrala o bórrala a mano para regrabar`);

      await t.ir("/ediciones");
      await t.paso("Como superadmin, tú creas los concursos. Presiona Nueva edición.", { en: "texto=Nueva edición", clic: true });
      await t.paso("Escribe el nombre del concurso.", { en: "#ed-name", escribir: PRACTICA });
      await t.paso("Indica cuántos minutos dura…", { en: "#ed-duration", escribir: "120" });
      await t.paso("…y cuántos minutos antes del final se congela el marcador.", { en: "#ed-freeze", escribir: "30" });
      await t.paso("Crea la edición: queda como borrador mientras la configuras.", { en: "oj-side-panel button[type=submit]", clic: true });
      await t.paso("Ya aparece en la lista, lista para configurarse.", { en: `texto=${PRACTICA}` });
      await t.ir("/staff");
      await t.paso("En Staff das de alta a los jueces, observadores y administradores.", { en: "#staff-name" });
      await t.paso("Solo pides nombre, correo y una contraseña inicial. El rol se asigna en cada edición.", { en: "#staff-password" });
      await t.ir("/lenguajes");
      await t.paso("En Lenguajes administras los compiladores disponibles para los concursos.", { en: "table" });
      await t.ir("/auditoria");
      await t.paso("Y en Auditoría ves quién hizo qué y cuándo.", { en: "table tbody tr" });
    },
  },

  edicion: {
    titulo: "Configurar la edición",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await t.ir(`/ediciones/${ed.id}`);
      await t.paso("Al abrir una edición llegas a Configuración. Empieza por las categorías.", { en: `a[href$="/configuracion/categorias"]` });
      await t.paso("Escribe un código corto…", { en: "#cat-code", escribir: "PRIN" });
      await t.paso("…y el nombre de la categoría.", { en: "#cat-name", escribir: "Principiantes" });
      await t.paso("Agrégala.", { en: "form.tab__aside button[type=submit]", clic: true });
      await t.ir(`/ediciones/${ed.id}/configuracion/salones`);
      await t.paso("En Salones da de alta cada salón…", { en: "#room-name", escribir: "Salón A" });
      await t.paso("…con la categoría que compite ahí.", { en: "#room-category", elegir: "Principiantes" });
      await t.paso("Agrégalo.", { en: "form.tab__aside button[type=submit]", clic: true });
      await t.ir(`/ediciones/${ed.id}/configuracion/lenguajes`);
      await t.paso("En Lenguajes marca los que podrán usar los equipos…", { en: "texto=python", clic: true });
      await t.paso("…y guarda la selección.", { en: "texto=Guardar selección", clic: true });
      await t.ir(`/ediciones/${ed.id}/configuracion/staff`);
      await t.paso("En Staff asigna a tu equipo de trabajo: elige a la persona…", { en: "#staff-user", elegir: "Juez Demo" });
      await t.paso("…y su rol en esta edición.", { en: "#staff-role", elegir: "JUDGE" });
      await t.paso("Agrégala. Cada rol solo ve lo que le toca: el observador, por ejemplo, solo ve envíos, marcador y alertas.", { en: "form.tab__aside button[type=submit]", clic: true });
    },
  },

  equipos: {
    titulo: "Equipos",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      // shortcut: el backend no puede borrar un equipo con integrantes (500 por la llave de team_member);
      // para regrabar hay que quitarlo a mano de la base mientras eso se corrige.
      if ((await t.api("GET", `/editions/${ed.id}/teams`)).items.length) throw new Error(`"${PRACTICA}" ya tiene equipos`);
      await t.ir(`/ediciones/${ed.id}/equipos`);
      await t.paso("Si tienes la lista de equipos en un archivo CSV, impórtala aquí de una vez.", { en: "texto=Importar desde CSV" });
      await t.paso("Para agregar uno solo, presiona Agregar equipo.", { en: "texto=+ Agregar equipo", clic: true });
      await t.paso("Escribe el nombre del equipo…", { en: "#add-team-name", escribir: "Los Ajolotes" });
      await t.paso("…elige su categoría…", { en: "#add-team-category", elegir: "Principiantes" });
      await t.paso("…y anota a cada integrante…", { en: 'input[aria-label="Nombre del integrante"]', escribir: "Ana López" });
      await t.paso("…con su carrera. Pueden ser hasta tres.", { en: 'input[aria-label="Carrera del integrante"]', escribir: "Ingeniería en Computación" });
      await t.paso("Guarda: el usuario y la contraseña se generan solos.", { en: 'oj-modal[title="Agregar equipo"] button[variant="primary"]', clic: true });
      await t.paso("Aquí está el equipo. Desde su fila lo editas, le das una contraseña nueva o lo suspendes.", { en: "table tbody tr" });
      await t.paso("Con Descargar todos obtienes un PDF con las credenciales de cada equipo, listo para imprimir.", { en: "texto=Descargar todos" });
    },
  },

  problemas: {
    titulo: "Problemas y casos de prueba",
    async grabar(t) {
      const demo = await edicion(t, DEMO);
      const [p] = await t.api("GET", `/editions/${demo.id}/problems`);
      await t.ir(`/ediciones/${demo.id}/problemas`);
      await t.paso("En Problemas ves los de cada categoría. Para crear uno, presiona Nuevo problema.", { en: "texto=+ Nuevo problema" });
      const pasos = [
        ["datos", "Cada problema se arma en seis pasos. Primero los datos: categoría, título y enunciado.", "oj-stepper"],
        ["evaluacion", "En Evaluación eliges cómo se compara la respuesta del equipo con la correcta, y los límites de tiempo y memoria.", "texto=2. Evaluación"],
        ["firma", "La firma es la función que programan los equipos: su nombre, sus parámetros y lo que regresa.", "texto=suma(nums"],
        ["solucion", "Sube la solución oficial: con ella se calculan las respuestas correctas.", "oj-code-block"],
        ["casos", "Agrega los casos de prueba. Los públicos los ven los equipos; los ocultos, no.", "table"],
        ["construir", "Al final, construye los casos y publica el problema. Solo los publicados entran al concurso.", "texto=Requisitos"],
      ];
      for (const [paso, voz, en] of pasos) {
        await t.ir(`/ediciones/${demo.id}/problemas/${p.id}?paso=${paso}`);
        await t.paso(voz, { en });
      }
      // Lo mismo, por la API, en la edición de práctica para poder iniciarla
      const ed = await edicion(t, PRACTICA);
      await publicarProblema(t, ed);
    },
  },

  programar: {
    titulo: "Programar e iniciar el concurso",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await t.ir(`/ediciones/${ed.id}`);
      await t.paso("Con todo listo, presiona Programar edición.", { en: "texto=Programar edición", clic: true });
      await t.paso("Revisa la lista: duración, un problema publicado y al menos un equipo.", { en: ".cfg__reqs" });
      await t.paso("Elige la fecha y la hora de inicio.", { en: "#sched-start", elegir: enDiezMinutos() });
      await t.paso("Y programa.", { en: 'button[form="cfg-schedule-form"]', clic: true });
      await t.paso("El concurso arranca solo a esa hora. Si quieres empezar antes, ve a Concurso.", { en: `a[href$="/${ed.id}/concurso"]`, clic: true });
      await t.paso("Presiona Iniciar ahora…", { en: "texto=Iniciar ahora", clic: true });
      await t.paso("…y confirma.", { en: "oj-confirm-dialog [footer] button:last-child", clic: true });
      await t.paso("Listo: el reloj corre y los equipos ya pueden enviar. Pausar y finalizar le tocan al superadmin.", { en: "oj-contest-countdown" });
    },
  },

  control: {
    titulo: "Control del concurso",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await t.ir(`/ediciones/${ed.id}/concurso`);
      await t.paso("Durante el concurso, la pestaña Concurso es tu tablero de control.", { en: "oj-contest-countdown" });
      await t.paso("Aquí ves cuándo empezó, cuánto dura, cuánto lleva y a qué minuto se congela el marcador.", { en: ".cc__facts" });
      await t.paso("El juez automático: cuántos workers evalúan, cuántos envíos esperan en la cola y si la base y Redis están en línea.", { en: ".cc__box" });
      await t.paso("Si la cola crece o algo sale sin conexión, pausa.", { en: "texto=Pausar", clic: true });
      await t.paso("En pausa el reloj se detiene y los equipos no pueden enviar.", { en: ".cc__paused" });
      await t.paso("Cuando todo esté bien, reanuda: el tiempo pausado no se les descuenta.", { en: "texto=Reanudar", clic: true });
      await t.paso("Desde aquí también abres el proyector para la pantalla del salón.", { en: "texto=Abrir proyector" });
      await t.paso("El concurso termina solo al acabar el tiempo. Si hace falta cerrarlo antes, usa Finalizar concurso.", { en: "texto=Finalizar concurso", clic: true });
      await t.paso("Confirma solo si estás seguro: ya no se puede reanudar.", { en: "oj-confirm-dialog [footer] button:last-child" });
    },
  },

  aclaraciones: {
    titulo: "Aclaraciones",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await actividadDeEquipo(t, ed);
      await t.ir(`/ediciones/${ed.id}/aclaraciones`);
      await t.paso("Las preguntas de los equipos llegan aquí en vivo.", { en: "texto=¿La lista puede venir vacía?" });
      await t.paso("Presiona Responder.", { en: "texto=Responder", clic: true });
      await t.paso("Escribe la respuesta. La verán todos los equipos de la categoría, sin saber quién preguntó.", { en: "#cl-answer", escribir: "Sí, puede venir vacía. En ese caso la suma es 0." });
      await t.paso("Publícala.", { en: "texto=Publicar respuesta", clic: true });
      await t.paso("Queda en Respondidas, y la puedes corregir después.", { en: "texto=Respondidas" });
    },
  },

  envios: {
    titulo: "Envíos y revisión",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await t.ir(`/ediciones/${ed.id}/envios`);
      await t.paso("En Envíos ves cada solución en vivo, con su veredicto.", { en: "table tbody" });
      await t.paso("Filtra por categoría, problema, equipo o veredicto.", { en: "#sub-team" });
      await t.paso("Presiona Ver para revisar uno.", { en: `a[href*="/${ed.id}/envios/"]`, clic: true });
      await t.paso("Aquí está el código que envió el equipo…", { en: "oj-code-block" });
      await t.paso("…y el resultado de cada caso de prueba: verde si salió bien, rojo si falló.", { en: "texto=Resultado por caso" });
      await t.paso("Si algo no cuadra, revísalo a mano y cambia el veredicto.", { en: "texto=Revisar manualmente" });
    },
  },

  alertas: {
    titulo: "Alertas anti-trampas",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await t.ir(`/ediciones/${ed.id}/alertas`);
      await t.paso("Las alertas anti-trampas llegan solas desde la app de los equipos.", { en: "texto=Abiertas" });
      await t.paso("Cada una dice qué pasó, en qué equipo y a qué hora.", { en: "texto=Los Ajolotes" });
      await t.paso("Ve a revisar al equipo. Si todo está bien, presiona Resolver.", { en: "texto=Resolver", clic: true });
      await t.paso("Deja una nota de lo que encontraste…", { en: "#al-note", escribir: "Revisado en el salón: era el proyector del aula." });
      await t.paso("…y márcala como resuelta.", { en: "texto=Marcar como resuelta", clic: true });
      await t.paso("Queda en Resueltas, con tu nota.", { en: "texto=Resueltas" });
    },
  },

  // Video para el stakeholder (no es un tutorial del panel): un problema completo, de la nada a aceptado.
  triangulo: {
    titulo: "Crear un problema: triángulo en Java",
    async grabar(t) {
      const ed = await edicion(t, "Prueba flujo de problemas");
      const enunciado = [
        "Dada una `altura` (1 ≤ altura ≤ 100), dibuja un triángulo de asteriscos centrado.",
        "",
        "Regresa una lista de líneas: la fila *i* (empezando en 0) tiene `altura - i - 1` espacios y `2i + 1` asteriscos, sin espacios al final.",
      ].join("\n");
      const java = [
        "class Main {",
        "    static String[] triangulo(int altura) {",
        "        String[] filas = new String[altura];",
        "        for (int i = 0; i < altura; i++) {",
        "            filas[i] = \" \".repeat(altura - i - 1) + \"*\".repeat(2 * i + 1);",
        "        }",
        "        return filas;",
        "    }",
        "}",
      ].join("\n");

      await t.ir(`/ediciones/${ed.id}/problemas`);
      await t.paso("Vamos a crear un problema completo: recibe una altura y regresa un triángulo de asteriscos.", { en: "texto=+ Nuevo problema", clic: true });
      await t.paso("Primero los datos: el título…", { en: "#pp-title", escribir: "Triángulo de asteriscos" });
      await t.paso("El enunciado puede ser un PDF. Esta vez lo escribimos en markdown.", { en: "texto=Utilizar versión markdown", clic: true });
      await t.paso("…y lo redactamos.", { en: "#pp-statement", escribir: enunciado });
      await t.paso("Crea el problema y sigue.", { en: "texto=Crear y seguir →", clic: true });

      await t.paso("Ahora la solución oficial. Elige Java…", { en: "#tw-lang", elegir: "java" });
      await t.paso("…y pega el código.", { en: "#tw-src-code", escribir: java });
      await t.esperar(".tw__sig-card", 120000);
      await t.paso("El juez lee la firma de la solución y la compila: triángulo recibe un entero y regresa una lista de líneas.", { en: ".tw__sig-card" });
      await t.paso("Guarda y sigue.", { en: "texto=Guardar y seguir →", clic: true });

      await t.paso("Los casos de prueba. Pega los ejemplos, uno por línea.", { en: "texto=Pegar", clic: true });
      await t.paso("Altura uno y altura tres.", { en: "#tw-paste", escribir: '{"altura": 1}\n{"altura": 3}' });
      await t.paso("En el grupo ejemplos…", { en: "#tw-paste-group", escribir: "ejemplos" });
      await t.paso("…y públicos: los equipos los verán en el enunciado.", { en: "#tw-paste-vis", elegir: "Públicos" });
      await t.paso("Agrégalos.", { en: "texto=Agregar casos", clic: true });
      await t.paso("Para cubrir más alturas, configura casos aleatorios.", { en: "texto=Configurar", clic: true });
      await t.paso("Cinco casos con alturas al azar entre uno y cien. Guarda y genera.", { en: "texto=Guardar y generar", clic: true });
      await t.esperar(".tw__group-toggle", 30000);
      await t.paso("Los casos quedan en grupos plegables. Abre uno para verlos.", { en: ".tw__group-toggle", clic: true });
      await t.paso("Siguiente paso.", { en: "texto=Siguiente →", clic: true });

      await t.paso("Un solo botón verifica los casos con la solución oficial, mide su tiempo y construye.", { en: "texto=Verificar y construir", clic: true });
      await t.esperar("oj-confirm-dialog [footer] button:last-child", 180000);
      await t.paso("Todo salió bien: confirma para fijar las salidas esperadas.", { en: "oj-confirm-dialog [footer] button:last-child", clic: true });
      await t.esperar("texto=Lista: las salidas esperadas quedaron fijas", 180000);
      await t.paso("Construido: cada etapa en verde.", { en: ".tw__pipe" });
      await t.paso("Como administrador de la edición, lo aceptas para el concurso.", { en: "texto=Aceptar para el concurso", clic: true });
      await t.paso("En Vista previa ves el problema como lo verán los equipos…", { en: "texto=Vista previa", clic: true });
      await t.paso("…con su enunciado, la función a programar y los ejemplos. Listo para el concurso.", { en: ".pp__preview" });
    },
  },

  marcador: {
    titulo: "Marcador y proyector",
    async grabar(t) {
      const demo = await edicion(t, DEMO);
      await t.ir("/ediciones");
      await t.paso("En Ediciones, busca tu concurso y presiona Configurar.", { en: `a[href="/ediciones/${demo.id}"]`, clic: true });
      await t.paso("Entra a la pestaña Marcador.", { en: `a[href$="/${demo.id}/marcador"]`, clic: true });
      await t.paso("Cada fila es un equipo: su lugar, su nombre y una cajita por problema.", { en: ".st__table tbody tr" });
      await t.paso("En verde, resuelto, con los intentos que le tomó. En ámbar, intentos fallidos. En gris, todavía no lo intenta.", { en: "oj-standings-cell" });
      await t.paso("Los tres primeros lugares se pintan de oro, plata y bronce.", { en: ".oj-podium-1" });
      await t.paso("En la última parte del concurso el marcador se congela para el público. Aquí tú sigues viendo todo.", { en: "oj-contest-countdown" });
      await t.paso("Para la pantalla grande del salón, abre el proyector.", { en: "texto=Abrir proyector" });
      await t.ir(`/proyector/${demo.id}`);
      await t.paso("El proyector se actualiza solo y cambia de categoría cada veinte segundos.", { en: ".pj__band" });
      await t.paso("Muestra el top diez, con el podio y confeti al terminar.", { en: ".pj__table" });
      await t.paso("Ponlo en pantalla completa y listo.", { en: "texto=Pantalla completa" });
    },
  },
};
