import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Guiones de los tutoriales del panel de staff. Cada paso es una captura con la frase que dice la voz;
// `en` señala el elemento (CSS o "texto=..."), y `clic`, `escribir`, `elegir` o `subir` (un archivo) actúan sobre él.
// Los ids coinciden con apps/frontend-staff/src/app/features/tutorials/tutorials.data.ts.
//
// El orden importa: superadmin crea el "Concurso de práctica", los siguientes lo configuran, lo inician y
// simulan a un equipo por la API (pregunta, envíos y una alerta). Marcador usa la Edición Demo (seed:dev).

const PRACTICA = "Concurso de práctica";
const DEMO = "Edición Demo";
const INSCRIPCIONES = "Concurso de prueba";

async function edicion(t, nombre) {
  const eds = await t.api("GET", "/editions");
  const e = (eds.data ?? eds).find((x) => x.name === nombre);
  if (!e) throw new Error(`No existe la edición "${nombre}": graba primero el tutorial superadmin`);
  return e;
}

// Un problema publicado en la edición de práctica (lo que enseña el tutorial de problemas, hecho por la API).
// Retoma lo que haya quedado a medias en una corrida anterior.
async function publicarProblema(t, ed) {
  // En Principiantes, la categoría que agrega el tutorial de edición, junto con el equipo de práctica
  const cats = await t.api("GET", `/editions/${ed.id}/categories`);
  const cat = cats.find((c) => c.code === "PRIN") ?? cats[0];
  const { items: equipos } = await t.api("GET", `/editions/${ed.id}/teams`);
  if (!equipos.length) {
    await t.api("POST", `/editions/${ed.id}/teams`, { name: "Los Ajolotes", category_id: cat.id, members: [{ name: "Ana López", career: "Ingeniería en Computación" }] });
  }
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
  if (!(await t.api("GET", `/editions/${ed.id}/flags`)).some((f) => !f.resolvedAt)) {
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

// --- Tutoriales de problemas: su propia edición en borrador ("Taller de problemas"), nueva en cada grabación ---

const TALLER = "Taller de problemas";
const STR = { type: "string" };
const VOCALES = { functionName: "vocales", params: [{ name: "palabra", type: STR }], returns: { type: "int" } };

// Como suelen llegar las soluciones: un programa que lee con Scanner e imprime. El juez no encuentra la función.
const JAVA_PROGRAMA = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String palabra = sc.nextLine();
        int total = 0;
        for (char c : palabra.toLowerCase().toCharArray()) {
            if ("aeiou".indexOf(c) >= 0) total++;
        }
        System.out.println(total);
    }
}`;
// La misma lógica dentro de una función: recibe los parámetros y regresa la respuesta
const JAVA_FUNCION = `class Main {
    static int vocales(String palabra) {
        int total = 0;
        for (char c : palabra.toLowerCase().toCharArray()) {
            if ("aeiou".indexOf(c) >= 0) total++;
        }
        return total;
    }
}`;

// El enunciado en PDF, con el mismo ejemplo que luego se agrega como caso público
function enunciadoPdf() {
  const dir = mkdtempSync(join(tmpdir(), "enunciado-"));
  const html = join(dir, "contar-vocales.html");
  const pdf = join(dir, "contar-vocales.pdf");
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="font:15px/1.5 Georgia,serif;margin:60px 70px">
<h1 style="text-align:center;margin-bottom:4px">Contar vocales</h1>
<p>Dada una palabra, di cuántas vocales tiene (a, e, i, o, u), sin importar si son mayúsculas o minúsculas.</p>
<p><b>Entrada:</b> una palabra de 1 a 100 letras.<br><b>Salida:</b> el número de vocales.</p>
<table style="border-collapse:collapse;margin-top:12px" border="1" cellpadding="8"><tr><th>Entrada</th><th>Salida</th></tr>
<tr><td style="font-family:monospace">universidad</td><td style="font-family:monospace">5</td></tr></table></body>`);
  const r = spawnSync("google-chrome-stable", ["--headless=new", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, html], { stdio: "ignore" });
  if (r.status !== 0) throw new Error("No se pudo generar el PDF del enunciado (google-chrome-stable)");
  return pdf;
}

async function taller(t) {
  const eds = await t.api("GET", "/editions");
  for (const vieja of (eds.data ?? eds).filter((x) => x.name === TALLER && x.status === "DRAFT")) {
    await t.api("DELETE", `/editions/${vieja.id}`);
  }
  const ed = await t.api("POST", "/editions", { name: TALLER, duration_ms: 7_200_000, freeze_duration_ms: 1_800_000, block_submissions_on_alert: false });
  // La edición nueva ya trae Básico, Intermedio y Avanzado
  const langs = Object.fromEntries((await t.api("GET", "/languages")).map((l) => [l.code, l.id]));
  await t.api("PUT", `/editions/${ed.id}/languages`, { ids: [langs.python, langs.java, langs.cpp, langs.c].filter(Boolean) });
  return { ed, langs };
}

// Espera a que el worker construya el testset (lo reintenta una vez si falló porque el worker aún arrancaba)
async function esperarConstruido(t, testsetId) {
  let reintento = false;
  for (let i = 0; ; i++) {
    const ts = await t.api("GET", `/testsets/${testsetId}`);
    if (ts.status === "ready") return;
    if (ts.status === "failed" && !reintento) {
      reintento = true;
      await t.api("POST", `/testsets/${testsetId}/build`);
    } else if (ts.status !== "building" || i > 180) {
      throw new Error(`El testset no se construyó (${ts.status}): ${ts.buildLog ?? ""} ¿Corre el worker (pnpm start:worker)?`);
    }
    await t.sleep(1000);
  }
}

// Un problema hecho por la API: firma, solución oficial y, si trae casos, construido
async function problemaPorApi(t, ed, { titulo, enunciado, firma = VOCALES, languageId, solucion = JAVA_FUNCION, casos = [] }) {
  const cat = (await t.api("GET", `/editions/${ed.id}/categories`)).find((c) => c.name === "Básico");
  const p = await t.api("POST", `/editions/${ed.id}/problems`, { categoryId: cat.id, title: titulo, statement: enunciado });
  await t.api("PATCH", `/problems/${p.id}/signature`, firma);
  await t.api("PUT", `/testsets/${p.testsetId}/ref-solution`, { languageId, source: solucion });
  for (const [input, visibility] of casos) await t.api("POST", `/testsets/${p.testsetId}/cases`, { input, visibility });
  if (casos.length) {
    await t.api("POST", `/testsets/${p.testsetId}/build`);
    await esperarConstruido(t, p.testsetId);
  }
  return p;
}

// Lo que escriben en Python al probar: función (categoría normal) y programa completo (categoría especial)
const PY_FUNCION = "def vocales(palabra: str) -> int:\n    return sum(1 for c in palabra.lower() if c in \"aeiou\")\n";
const PY_PROGRAMA = "palabra = input()\nprint(sum(1 for c in palabra.lower() if c in \"aeiou\"))\n";

const CASOS_VOCALES = [[{ palabra: "universidad" }, "public"], [{ palabra: "AEIOU" }, "hidden"], [{ palabra: "xyz" }, "hidden"], [{ palabra: "murcielago" }, "hidden"]];
const ENUNCIADO_VOCALES = "Dada una `palabra`, regresa cuántas vocales tiene (a, e, i, o, u), sin importar mayúsculas.";

// Selector de la fila de la tabla de problemas que tiene ese título (para sus botones)
async function fila(t, titulo) {
  const i = await t.evaluar(`[...document.querySelectorAll('table tbody tr')].findIndex((tr) => tr.cells[0]?.textContent.trim() === ${JSON.stringify(titulo)})`);
  if (i < 0) throw new Error(`No está el problema "${titulo}" en la tabla`);
  return `table tbody tr:nth-child(${i + 1})`;
}

export const GUIONES = {
  superadmin: {
    titulo: "Ediciones, usuarios y lenguajes",
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
      await t.paso("En Usuarios das de alta a los jueces, observadores y administradores.", { en: "#staff-name" });
      await t.paso("Solo pides nombre y correo: la contraseña se genera sola y la entregas en un PDF. El rol se asigna en cada edición.", { en: ".staff__note" });
      await t.paso("Con Descargar todos obtienes las credenciales de todos, listas para imprimir.", { en: "texto=Descargar todos" });
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
      await t.paso("Al abrir una edición llegas a Configuración. Ya trae las categorías Básico, Intermedio y Avanzado; agrega las que necesites.", { en: `a[href$="/configuracion/categorias"]` });
      await t.paso("Escribe un código corto…", { en: "#cat-code", escribir: "PRIN" });
      await t.paso("…y el nombre de la categoría.", { en: "#cat-name", escribir: "Principiantes" });
      await t.paso("Agrégala.", { en: "form.tab__aside button[type=submit]", clic: true });
      await t.ir(`/ediciones/${ed.id}/configuracion/salones`);
      await t.paso("En Salones da de alta cada salón…", { en: "#room-name", escribir: "Salón A" });
      await t.paso("…con la categoría que compite ahí.", { en: ".rooms__obs-opt >> texto=Principiantes", clic: true });
      await t.paso("Agrégalo.", { en: "form.tab__aside button[type=submit]", clic: true });
      await t.ir(`/ediciones/${ed.id}/configuracion/lenguajes`);
      await t.paso("En Lenguajes marca los que podrán usar los equipos…", { en: "texto=python", clic: true });
      await t.paso("…y guarda la selección.", { en: "texto=Guardar selección", clic: true });
      await t.ir(`/ediciones/${ed.id}/configuracion/staff`);
      await t.paso("En Staff asigna a tu equipo de trabajo: elige a la persona…", { en: "#staff-user", elegir: "Juez Demo" });
      await t.paso("…y su rol en esta edición.", { en: "#staff-role", elegir: "Juez" });
      await t.paso("Agrégala. Cada rol solo ve lo que le toca: el observador, por ejemplo, solo ve envíos, marcador y alertas.", { en: "form.tab__aside button[type=submit]", clic: true });
    },
  },

  equipos: {
    titulo: "Equipos",
    async grabar(t) {
      // Una edición en borrador desde cero en cada grabación (la anterior se borra con sus equipos)
      const eds = await t.api("GET", "/editions");
      for (const vieja of (eds.data ?? eds).filter((x) => x.name === INSCRIPCIONES && x.status === "DRAFT")) {
        await t.api("DELETE", `/editions/${vieja.id}`);
      }
      const ed = await t.api("POST", "/editions", { name: INSCRIPCIONES, duration_ms: 7_200_000, freeze_duration_ms: 1_800_000, block_submissions_on_alert: false });
      await t.api("POST", `/editions/${ed.id}/categories`, { code: "PRIN", name: "Principiantes" });
      // El CSV de inscripciones: una fila por participante. Los Ajolotes ya existe (se actualiza) y Avanzados no es
      // una categoría de la edición (sale como error).
      const csv = join(tmpdir(), "inscripciones.csv");
      writeFileSync(csv, [
        "Nombre Equipo,Nombre,Carrera,Nivel",
        "Los Ajolotes,Ana López,Ingeniería en Computación,Principiantes",
        "Los Ajolotes,Luis Pérez,Ingeniería en Computación,Principiantes",
        "Bits y Tacos,María Ruiz,Informática,Principiantes",
        "Bits y Tacos,Jorge Díaz,Informática,Principiantes",
        "Individual,Sofía Martínez,Ingeniería en Computación,Principiantes",
        "Los Compiladores,Pedro Gómez,Electrónica,Avanzados",
      ].join("\n") + "\n");

      await t.ir(`/ediciones/${ed.id}/equipos`);
      await t.paso("Para agregar un equipo, presiona Agregar equipo.", { en: "texto=+ Agregar equipo", clic: true });
      await t.paso("Escribe el nombre del equipo…", { en: "#add-team-name", escribir: "Los Ajolotes" });
      await t.paso("…elige su categoría…", { en: "#add-team-category", elegir: "Principiantes" });
      await t.paso("…y anota a cada integrante…", { en: 'input[aria-label="Nombre del integrante"]', escribir: "Ana López" });
      await t.paso("…con su carrera. Pueden ser hasta tres.", { en: 'input[aria-label="Carrera del integrante"]', escribir: "Ingeniería en Computación" });
      await t.paso("Guarda: el usuario y la contraseña se generan solos.", { en: 'oj-modal[title="Agregar equipo"] button[variant="primary"]', clic: true });
      await t.paso("Aquí está el equipo. Desde su fila lo editas, le das una contraseña nueva o lo suspendes.", { en: "table tbody tr" });
      await t.paso("Si tienes las inscripciones en un archivo CSV, súbelo arriba, en Importar desde CSV.", { en: ".imp .oj-fd", subir: csv });
      await t.paso("Valida el archivo.", { en: "texto=Validar archivo", clic: true });
      await t.paso("Ves cuántos equipos son válidos, cuántos ya existen y cuántos errores hay.", { en: ".imp__cards" });
      await t.paso("Los que ya existen se actualizan: cambian sus integrantes y su categoría, pero conservan usuario y contraseña.", { en: "texto=Actualizar" });
      await t.paso("Cada error dice en qué fila está. Esos equipos no se importan: corrige el archivo y vuelve a subirlo.", { en: "texto=no existe en la edición" });
      await t.paso("Importa los equipos válidos.", { en: ".imp__actions button[variant=primary]", clic: true });
      await t.paso("Descarga las credenciales de los equipos nuevos.", { en: "texto=Descargar CSV" });
      await t.paso("Presiona Listo.", { en: "texto=Listo", clic: true });
      await t.paso("Con Descargar todos obtienes un PDF con las credenciales de cada equipo, listo para imprimir.", { en: "texto=Descargar todos" });
    },
  },

  "crear-problema": {
    titulo: "Crear un problema",
    async grabar(t) {
      const { ed } = await taller(t);
      const pdf = enunciadoPdf();
      await t.ir(`/ediciones/${ed.id}/problemas`);
      await t.paso("Los problemas se arman en la pestaña Problemas. Presiona Nuevo problema.", { en: "texto=+ Nuevo problema", clic: true });
      await t.paso("Elige la categoría…", { en: "#pp-category", elegir: "Básico" });
      await t.paso("…y escribe el título.", { en: "#pp-title", escribir: "Contar vocales" });
      await t.paso("El enunciado puede ser un PDF: arrástralo aquí o haz clic para elegirlo.", { en: ".pp__stmt .oj-fd", subir: pdf });
      await t.paso("Si el PDF trae ejemplos, agrégalos después como casos públicos: los equipos ven los dos y deben coincidir.", { en: ".pp__stmt oj-alert" });
      await t.paso("Mandar a revisión manual es para reglas que el juez automático no puede comprobar. Los envíos que pasan todos los casos esperan a que un juez los acepte.", { en: "texto=Mandar a revisión manual" });
      await t.paso("Crea el problema y sigue.", { en: "texto=Crear y seguir →", clic: true });

      await t.paso("Segundo paso: la solución oficial. Elige el lenguaje…", { en: "#tw-lang", elegir: "java" });
      await t.paso("…y pega el código, o arrastra el archivo.", { en: "#tw-src-code", escribir: JAVA_PROGRAMA });
      await t.esperar("texto=No se encontró la función", 120000);
      await t.paso("Esta solución es un programa completo: lee con Scanner e imprime. Así, el juez no encuentra la función.", { en: "texto=No se encontró la función" });
      await t.paso("La solución va dentro de una función: recibe los datos como parámetros y regresa la respuesta, sin leer ni imprimir. Así el juez le pasa cada caso de prueba.", { en: "#tw-src-code", escribir: JAVA_FUNCION });
      await t.esperar(".tw__sig-card", 120000);
      await t.paso("Ahora sí. La firma es la función que resuelve el problema: vocales recibe un texto y regresa un entero.", { en: ".tw__sig-card" });
      await t.paso("Guarda y sigue.", { en: "texto=Guardar y seguir →", clic: true });

      await t.esperar("texto=Crear y quedarme aquí", 30000);
      await t.paso("Sin casos todavía, el juez ofrece crear cinco aleatorios a partir de la firma: dos públicos y tres ocultos.", { en: ".tw__offer" });
      await t.paso("Créalos y quédate aquí para agregar otro.", { en: "texto=Crear y quedarme aquí", clic: true });
      await t.esperar(".tw__group-toggle", 30000);
      await t.paso("Ya están en la lista.", { en: ".tw__cases-list" });
      await t.paso("Agrega el ejemplo del PDF: la palabra universidad…", { en: "#tw-case-palabra", escribir: "universidad" });
      await t.paso("…como caso público, para que coincida con el enunciado.", { en: "#tw-case-vis", elegir: "Público" });
      await t.paso("Agrégalo. La salida esperada la calcula la solución oficial.", { en: "texto=+ Agregar caso", clic: true });
      await t.paso("Siguiente paso.", { en: "texto=Siguiente →", clic: true });

      await t.paso("Último paso: la evaluación. De entrada, la salida se compara exacta, con un segundo y 256 megas.", { en: ".tw__step > .tw__src" });
      await t.paso("Con Cambiar ajustas cómo se compara la salida y los límites.", { en: "texto=Cambiar", clic: true });
      await t.paso("Baja el tiempo límite si quieres soluciones eficientes, o súbelo si aceptas fuerza bruta.", { en: "#tw-time" });
      await t.paso("Guarda la evaluación.", { en: "texto=Guardar evaluación", clic: true });
      await t.paso("Un solo botón pasa la solución oficial por todos los casos, mide su tiempo y construye.", { en: "texto=Verificar y construir", clic: true });
      await t.esperar("dialog[open] [footer] button:last-child", 180000);
      await t.paso("Todo salió bien: confirma para fijar las salidas esperadas.", { en: "dialog[open] [footer] button:last-child", clic: true });
      await t.esperar("texto=Lista: las salidas esperadas quedaron fijas", 180000);
      await t.paso("Construido: cada etapa en verde.", { en: ".tw__pipe" });
      await t.paso("Si eres juez, aquí lo propones, y el admin de la edición decide si entra al concurso.", { en: ".tw__pipe-item:last-child" });
    },
  },

  "probar-solucion": {
    titulo: "Probar soluciones y programa completo",
    async grabar(t) {
      const { ed, langs } = await taller(t);
      const p = await problemaPorApi(t, ed, { titulo: "Contar vocales", enunciado: ENUNCIADO_VOCALES, languageId: langs.java, casos: CASOS_VOCALES });
      const construir = `/ediciones/${ed.id}/problemas/${p.id}?paso=construir`;
      const probar = async (inicio, plantilla, codigo, fin) => {
        await t.paso(inicio, { en: "texto=Probar una solución…", clic: true });
        await t.paso("Elige el lenguaje: no tiene que ser el de la solución oficial.", { en: "#tr-lang", elegir: "python" });
        await t.paso("Pegar plantilla del concurso pone el código con el que empiezan los equipos.", { en: "texto=Pegar plantilla del concurso", clic: true });
        await t.paso(plantilla, { en: "#tr-code" });
        await t.paso("Completa la solución…", { en: "#tr-code", escribir: codigo });
        await t.paso("…y pruébala.", { en: "dialog[open] [footer] button[variant=primary]", clic: true });
        await t.esperar("texto=Probar otra solución", 120000);
        await t.paso(fin, { en: "dialog[open] table" });
        await t.paso("Cierra.", { en: "dialog[open] [footer] button[variant=secondary]", clic: true });
      };

      await t.ir(construir);
      await probar(
        "Con el problema construido, prueba otras soluciones antes de proponerlo. Presiona Probar una solución.",
        "En una categoría normal, el equipo solo escribe la función.",
        PY_FUNCION,
        "Se juzga igual que un envío, pero no cuenta para el marcador: cada caso con su veredicto, su tiempo y su memoria.",
      );

      await t.ir(`/ediciones/${ed.id}/configuracion/categorias`);
      await t.paso("Escribir una función puede costarles a los principiantes. Para ellos, el admin marca su categoría como especial: edítala.", { en: '[aria-label="Editar categoría Básico"]', clic: true });
      await t.paso("Marca Categoría especial: programa completo. El equipo envía un programa que lee la entrada e imprime la respuesta.", { en: "dialog[open] input[type=checkbox]", clic: true });
      await t.paso("Guarda. Se hace una vez por categoría y vale para todos sus problemas.", { en: 'button[form="cat-edit-form"]', clic: true });
      await t.paso("La categoría queda marcada como programa completo.", { en: "table tbody" });

      await t.ir(construir);
      await probar(
        "De vuelta en el problema, prueba otra vez.",
        "Ahora la plantilla ya lee los datos en orden. El equipo solo escribe la lógica e imprime la respuesta.",
        PY_PROGRAMA,
        "Pasa todos los casos. La solución oficial sigue siendo una función: el juez adapta los casos solo.",
      );
      await t.paso("En Vista previa ves lo que verán los equipos…", { en: "texto=Vista previa", clic: true });
      await t.paso("…incluido el orden en que su programa lee los datos.", { en: "texto=Programa completo" });
    },
  },

  "aprobar-problemas": {
    titulo: "Aprobar y administrar problemas",
    async grabar(t) {
      const { ed, langs } = await taller(t);
      const vocales = await problemaPorApi(t, ed, { titulo: "Contar vocales", enunciado: ENUNCIADO_VOCALES, languageId: langs.java, casos: CASOS_VOCALES });
      const digitos = await problemaPorApi(t, ed, {
        titulo: "Suma de dígitos", enunciado: "Dado un entero `n` (0 ≤ n ≤ 10⁹), regresa la suma de sus dígitos.",
        firma: { functionName: "suma", params: [{ name: "n", type: { type: "int" } }], returns: { type: "int" } },
        languageId: langs.python, solucion: "def suma(n):\n    return sum(int(d) for d in str(n))\n",
        casos: [[{ n: 123 }, "public"], [{ n: 0 }, "hidden"], [{ n: 999999999 }, "hidden"]],
      });
      await problemaPorApi(t, ed, {
        titulo: "Palíndromos", enunciado: "Dada una `palabra`, regresa si se lee igual al revés.",
        firma: { functionName: "palindromo", params: [{ name: "palabra", type: STR }], returns: { type: "bool" } },
        languageId: langs.python, solucion: "def palindromo(palabra):\n    return palabra == palabra[::-1]\n",
      });
      for (const p of [vocales, digitos]) await t.api("POST", `/problems/${p.id}/propose`);

      await t.ir(`/ediciones/${ed.id}/problemas`);
      await t.paso("Como admin de la edición, en Problemas decides qué entra al concurso. Los jueces proponen los suyos.", { en: "table" });
      await t.paso("Cada problema muestra su estado: borrador, propuesto o en el concurso.", { en: "table tbody td:nth-child(3)" });
      let f = await fila(t, "Contar vocales");
      await t.paso("Ábrelo para revisarlo antes de decidir.", { en: `${f} button[aria-label^="Abrir"]`, clic: true });
      await t.paso("En Vista previa lo ves como lo verán los equipos.", { en: "texto=Vista previa", clic: true });
      await t.paso("Enunciado, función y ejemplos.", { en: ".pp__preview" });
      await t.ir(`/ediciones/${ed.id}/problemas`);
      f = await fila(t, "Contar vocales");
      await t.paso("Si te convence, acéptalo.", { en: `${f} button[variant=success]`, clic: true });
      await t.paso("Ya está en el concurso. La letra se asigna al iniciar.", { en: `${f} oj-badge` });
      f = await fila(t, "Suma de dígitos");
      await t.paso("Si necesita cambios, regrésalo a borrador.", { en: `${f} >> texto=Regresar a borrador`, clic: true });
      await t.paso("Escribe el motivo: el juez lo verá al abrir su problema.", { en: "#home-draft-reason", escribir: "Faltan casos con números de un solo dígito." });
      await t.paso("Confirma. Para que vuelva, el juez tiene que proponerlo otra vez.", { en: "dialog[open] [footer] button[variant=primary]", clic: true });
      f = await fila(t, "Palíndromos");
      await t.paso("Lo que no va, elimínalo.", { en: `${f} button[aria-label^="Eliminar"]`, clic: true });
      await t.paso("Confirma: se borra con su solución y sus casos.", { en: "dialog[open] [footer] button:last-child", clic: true });
      await t.paso("Con Mostrar filtras por estado.", { en: "#home-filter" });
      f = await fila(t, "Contar vocales");
      await t.paso("Quitar saca un problema del concurso; si ya tiene envíos, ya no se puede eliminar, solo quitar.", { en: `${f} >> texto=Quitar` });

      await t.ir(`/ediciones/${ed.id}/problemas/${vocales.id}?paso=construir`);
      await t.paso("Una versión construida ya no se edita. Para cambiar la solución o los casos, crea una versión nueva.", { en: "texto=+ Nueva versión para editar", clic: true });
      await t.paso("Anota qué cambia…", { en: "#tw-reason", escribir: "Casos con mayúsculas y acentos" });
      await t.paso("…y créala: copia todo lo actual y queda editable.", { en: "dialog[open] [footer] button[variant=primary]", clic: true });
      await t.paso("Al construirla, si el problema está en el concurso, se vuelven a evaluar todos sus envíos.", { en: ".tw__version" });
    },
  },

  "casos-evaluacion": {
    titulo: "Casos de prueba y evaluación",
    async grabar(t) {
      const { ed, langs } = await taller(t);
      const p = await problemaPorApi(t, ed, { titulo: "Contar vocales", enunciado: ENUNCIADO_VOCALES, languageId: langs.java });
      await t.ir(`/ediciones/${ed.id}/problemas/${p.id}?paso=casos`);
      await t.esperar("texto=Continuar sin crear casos", 15000);
      await t.paso("Hay cuatro formas de agregar casos. Esta vez, sigue sin los cinco aleatorios.", { en: "texto=Continuar sin crear casos", clic: true });

      await t.paso("A mano: escribe la entrada…", { en: "#tw-case-palabra", escribir: "AEIOU" });
      await t.paso("…y ponle un grupo, para manejar varios casos juntos.", { en: "#tw-case-group", escribir: "bordes" });
      await t.paso("Agrégalo.", { en: "texto=+ Agregar caso", clic: true });
      await t.paso("Para varios a la vez, usa Pegar.", { en: "texto=Pegar", clic: true });
      await t.paso("Un caso por línea, en JSON.", { en: "#tw-paste", escribir: '{"palabra": "xyz"}\n{"palabra": "a"}\n{"palabra": "Murcielago"}' });
      await t.paso("También en el grupo bordes…", { en: "#tw-paste-group", escribir: "bordes" });
      await t.paso("…y agrégalos.", { en: "texto=Agregar casos", clic: true });
      await t.paso("Para muchos casos, configura los aleatorios.", { en: "texto=Configurar", clic: true });
      await t.paso("Dale nombre al grupo…", { en: "#rand-name-0", escribir: "largas" });
      await t.paso("…cuántos casos…", { en: "#rand-count-0", escribir: "10" });
      await t.paso("…y el rango: palabras de 50 a 100 letras.", { en: ".tw__rand-range label:nth-child(1) input", escribir: "50" });
      await t.paso("…hasta 100. Puedes agregar más grupos.", { en: ".tw__rand-range label:nth-child(2) input", escribir: "100" });
      await t.paso("Guarda y genera.", { en: "texto=Guardar y generar", clic: true });
      await t.esperar("texto=largas", 30000);
      await t.paso("Los casos quedan por grupo. Abre uno para verlos.", { en: ".tw__group-toggle", clic: true });
      await t.paso("Cada caso dice de dónde salió. Desde su fila lo ves, lo editas o lo fijas como manual.", { en: ".tw__group-body tbody tr, .tw__group-body li" });
      await t.paso("Con los botones del grupo haces públicos u ocultos todos sus casos de una vez.", { en: ".tw__group-head .tw__icon-btn" });
      await t.paso("Si los aleatorios no alcanzan, sube un generador: un programa tuyo que crea los casos.", { en: "texto=Subir", clic: true });
      await t.paso("Elige su lenguaje y parte de la plantilla.", { en: "#tw-lang", elegir: "python" });
      await t.paso("Esta vez no lo usamos: cancela.", { en: "texto=Cancelar", clic: true });
      await t.paso("Siguiente paso.", { en: "texto=Siguiente →", clic: true });

      await t.paso("En Evaluación, presiona Cambiar.", { en: "texto=Cambiar", clic: true });
      await t.paso("Exacta compara la salida tal cual. Sirve para casi todo.", { en: ".tw__eval-card:nth-child(1)" });
      await t.paso("Con tolerancia acepta pequeñas diferencias en los decimales.", { en: ".tw__eval-card:nth-child(2)", clic: true });
      await t.paso("Tú eliges cuánta.", { en: "#tw-tol" });
      await t.paso("Con checker escribes un programa que decide si la respuesta es correcta, para cuando hay más de una válida.", { en: ".tw__eval-card:nth-child(3)", clic: true });
      await t.paso("Para este problema basta la exacta.", { en: ".tw__eval-card:nth-child(1)", clic: true });
      await t.paso("Revisión manual: un juez revisa los envíos que pasan todos los casos.", { en: "#tw-eval-review ~ label input[type=checkbox]", clic: true });
      await t.paso("Dile qué debe revisar.", { en: "#tw-review", escribir: "Que no use expresiones regulares." });
      await t.paso("Guarda la evaluación.", { en: "texto=Guardar evaluación", clic: true });
      await t.paso("Verifica y construye.", { en: "texto=Verificar y construir", clic: true });
      await t.esperar("dialog[open] [footer] button:last-child", 180000);
      await t.paso("Confirma.", { en: "dialog[open] [footer] button:last-child", clic: true });
      await t.esperar("texto=Ver entradas y salidas", 180000);
      await t.paso("Con Ver entradas y salidas revisas lo que respondió la solución oficial en cada caso.", { en: "texto=Ver entradas y salidas", clic: true });
      await t.paso("Si algo no cuadra, el error está en un caso o en la solución: crea una versión nueva y corrígelo.", { en: "dialog[open] table" });
    },
  },

  programar: {
    titulo: "Programar e iniciar el concurso",
    async grabar(t) {
      const ed = await edicion(t, PRACTICA);
      await publicarProblema(t, ed); // los tutoriales de problemas usan su propia edición; aquí se pone uno por la API
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
      await actividadDeEquipo(t, ed); // para regrabar: una alerta abierta si ya se resolvió la anterior
      await t.ir(`/ediciones/${ed.id}/alertas`);
      await t.paso("Las alertas anti-trampas llegan solas desde la app de los equipos, en vivo.", { en: "texto=Abiertas" });
      await t.paso("Cada una dice qué pasó, en qué equipo, en qué salón y a qué hora.", { en: ".al__card-top" });
      await t.paso("Ve a revisar al equipo y presiona Resolver.", { en: "texto=Resolver", clic: true });
      await t.paso("Deja una nota interna de lo que encontraste…", { en: "#al-note", escribir: "Revisado en el salón: era el proyector del aula." });
      await t.paso("…y decide. Penalizar suma veinte minutos al equipo; No penalizar no afecta su lugar.", { en: "texto=No penalizar", clic: true });
      await t.paso("Queda en Resueltas, con tu decisión y tu nota. Ahí mismo la puedes corregir.", { en: "texto=Resueltas", clic: true });
      await t.paso("Si la trampa es clara, suspende al equipo. Y con Levantar alerta registras lo que veas en el salón.", { en: "texto=Levantar alerta" });
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
      await t.paso("Ponlo en pantalla completa con F11 y listo.");
    },
  },
};
