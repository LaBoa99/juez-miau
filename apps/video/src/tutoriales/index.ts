import type { Datos } from "./Tutorial";
import aclaraciones from "./aclaraciones.json";
import alertas from "./alertas.json";
import control from "./control.json";
import edicion from "./edicion.json";
import envios from "./envios.json";
import equipos from "./equipos.json";
import marcador from "./marcador.json";
import problemas from "./problemas.json";
import programar from "./programar.json";
import superadmin from "./superadmin.json";
import triangulo from "./triangulo.json";

// Un video por guion de scripts/guiones.mjs (los JSON los escriben capturas.mjs y voz_tutoriales.py).
export const TUTORIALES = [marcador, alertas, control, envios, aclaraciones, problemas, edicion, equipos, programar, superadmin, triangulo] as Datos[];
