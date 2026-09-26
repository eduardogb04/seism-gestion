/**
 * Catálogo de errores con código estable (F0-23, ADR 0020). *"La operadora manda 'me
 * tiró ING-0012' y Eduardo sabe qué pasó sin adivinar."*
 *
 * - Cada entrada es `{ codigo, tipo, descripcion, queHacer }`. La clave es el
 *   código con guion bajo (`DOM_0001`) y `codigo` es el mismo con guion
 *   (`'DOM-0001'`): `definirCatalogo` no compila si no coinciden.
 * - Prefijo por módulo (`PREFIJOS`) y cuatro dígitos. El próximo número de un
 *   prefijo es el siguiente al más alto que exista.
 * - **Un código nunca se reutiliza**: una entrada no se borra ni cambia de
 *   tipo. El catálogo entero es un golden file
 *   (`tests/extraccion/golden/catalogo-errores.json`) y el test que lo compara
 *   rechaza borrar una entrada o cambiarle el tipo, aun regenerando.
 * - `descripcion` es lo que ve la persona en pantalla; `queHacer`, lo que
 *   tiene que hacer ella o quien lo mire en el log.
 *
 * Cómo se agrega un error: AGENTS.md, *Cómo se agrega... un error*.
 */

export const PREFIJOS = ["DOM", "AUT", "ING", "INF", "IA", "ALM"] as const;

/** Módulo del error: dominio, autenticación, ingesta, infraestructura, IA, almacén. */
export type Prefijo = (typeof PREFIJOS)[number];

type Digito = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** `DOM-0001`: prefijo conocido, guion y exactamente cuatro dígitos. */
export type Codigo = `${Prefijo}-${Digito}${Digito}${Digito}${Digito}`;

export const TIPOS_ERROR = ["persona", "sistema", "externo"] as const;

/**
 * `persona`: lo resuelve quien usa el sistema (corrigiendo lo que cargó) ·
 * `sistema`: falla nuestra, la mira quien mantiene el sistema · `externo`:
 * falló algo de afuera (un servicio, el almacén de documentos).
 */
export type TipoError = (typeof TIPOS_ERROR)[number];

export interface EntradaCatalogo {
  readonly codigo: Codigo;
  readonly tipo: TipoError;
  readonly descripcion: string;
  readonly queHacer: string;
}

/** La entrada que corresponde a una clave: `DOM_0001` exige `codigo: 'DOM-0001'`. */
type EntradaDeClave<Clave> = Clave extends `${infer P}_${infer N}`
  ? EntradaCatalogo & { readonly codigo: `${P}-${N}` }
  : never;

function definirCatalogo<
  const T extends { readonly [Clave in keyof T]: EntradaDeClave<Clave> },
>(entradas: T): T {
  for (const entrada of Object.values(entradas)) {
    Object.freeze(entrada);
  }
  return Object.freeze(entradas);
}

export const catalogo = definirCatalogo({
  DOM_0001: {
    codigo: "DOM-0001",
    tipo: "persona",
    descripcion:
      "No se puede pasar a ese estado desde el estado actual: el cambio no está permitido.",
    queHacer:
      "Revisá en qué estado está y a cuáles se puede pasar desde ahí. Si el cambio tendría que estar permitido, avisá con este código.",
  },
  DOM_0002: {
    codigo: "DOM-0002",
    tipo: "persona",
    descripcion:
      "El código no se puede leer: no tiene la forma PREFIJO-AÑO-NÚMERO (por ejemplo, SRV-2026-014).",
    queHacer:
      "Copiá el código tal cual aparece en el sistema, sin ceros de más ni de menos y con los guiones.",
  },
  DOM_0003: {
    codigo: "DOM-0003",
    tipo: "sistema",
    descripcion:
      "Se pidió repartir un importe en una cantidad de partes que no es un entero positivo.",
    queHacer:
      "Es un error del sistema, no de lo que cargaste: avisá con este código. En el log, el detalle dice cuántas partes se pidieron.",
  },
  DOM_0004: {
    codigo: "DOM-0004",
    tipo: "persona",
    descripcion:
      "El tipo de cambio no es válido: el valor tiene que ser mayor que cero, las dos monedas distintas, y la fuente y quién lo cargó no pueden quedar vacíos.",
    queHacer:
      "Revisá el dato que marca el error (valor, monedas, fuente o quién lo cargó) y volvé a cargarlo. El valor va con coma decimal, por ejemplo 1.234,56.",
  },
  DOM_0005: {
    codigo: "DOM-0005",
    tipo: "persona",
    descripcion:
      "El monto no se puede leer: tiene que ser un número con coma decimal y hasta dos decimales, por ejemplo 12.345,67.",
    queHacer:
      "Escribí el monto sin la moneda, sin espacios en el medio y con coma para los decimales. El punto de miles es opcional.",
  },
  DOM_0006: {
    codigo: "DOM-0006",
    tipo: "sistema",
    descripcion:
      "No se pudo armar el código legible: el prefijo, el año o el número de secuencia no son válidos.",
    queHacer:
      "Es un error del sistema, no de lo que cargaste: avisá con este código. En el log, el detalle dice qué dato no sirvió.",
  },
  DOM_0007: {
    codigo: "DOM-0007",
    tipo: "persona",
    descripcion:
      "El registro ya está eliminado: no se puede modificar ni volver a eliminar.",
    queHacer:
      "Revisá que estés trabajando sobre el registro correcto. Si hay que recuperarlo, avisá con este código: el borrado es lógico y el registro sigue guardado.",
  },
  INF_0001: {
    codigo: "INF-0001",
    tipo: "sistema",
    descripcion:
      "Ocurrió un error inesperado en el sistema y la operación no se completó.",
    queHacer:
      "Volvé a intentar en unos minutos. Si se repite, avisá con este código: en el log está la causa y dónde ocurrió.",
  },
  ALM_0001: {
    codigo: "ALM-0001",
    tipo: "externo",
    descripcion:
      "El documento que se pidió no está en el almacén de documentos.",
    queHacer:
      "Avisá con este código. Quien mantiene el sistema busca en el log la clave del documento y revisa si el almacén lo perdió o si la referencia apunta a otro lado.",
  },
  ALM_0002: {
    codigo: "ALM-0002",
    tipo: "sistema",
    descripcion:
      "La clave del documento no es válida: solo se aceptan minúsculas sin acentos, números y guiones, en tramos separados por barras.",
    queHacer:
      "Es un error del sistema, no de lo que cargaste: avisá con este código. En el log, el detalle dice qué clave se rechazó.",
  },
  ALM_0003: {
    codigo: "ALM-0003",
    tipo: "sistema",
    descripcion:
      "Se pidió un enlace temporal a un documento con una vigencia fuera de rango: tiene que ser de 1 a 10080 minutos (una semana).",
    queHacer:
      "Es un error del sistema, no de lo que cargaste: avisá con este código. En el log, el detalle dice cuántos minutos se pidieron.",
  },
} as const);
