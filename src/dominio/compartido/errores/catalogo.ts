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
  DOM_0008: {
    codigo: "DOM-0008",
    tipo: "persona",
    descripcion: "Ya existe otro registro con ese valor: no se puede repetir.",
    queHacer:
      "Cambiá el valor del campo marcado o buscá el registro que ya lo tiene. Uno dado de baja no cuenta: su valor se puede volver a usar.",
  },
  DOM_0009: {
    codigo: "DOM-0009",
    tipo: "persona",
    descripcion:
      "El registro no existe o ya fue dado de baja: no se puede ver, modificar ni dar de baja.",
    queHacer:
      "Volvé al listado y buscalo de nuevo: puede que otra persona lo haya dado de baja recién. Si tendría que estar, avisá con este código.",
  },
  DOM_0010: {
    codigo: "DOM-0010",
    tipo: "persona",
    descripcion: "No se puede dar de baja: hay registros vigentes que lo usan.",
    queHacer:
      "Primero reasigná o dá de baja lo que lo usa (por ejemplo, los clientes de un grupo) y volvé a intentarlo.",
  },
  DOM_0011: {
    codigo: "DOM-0011",
    tipo: "persona",
    descripcion:
      "El servicio no admite ese cambio en el estado en que está: no se guardó nada.",
    queHacer:
      "Abrí el servicio de nuevo y elegí uno de los cambios de estado que ofrece: puede que otra persona lo haya cambiado recién. El paso a «Cotizado», a «Adjudicado» y a «Cerrado» no se pide: lo hacen cargar una cotización, cargar la orden de compra y cobrar todo lo facturado. Un servicio que ya salió de «Creado» no se da de baja: se cancela.",
  },
  DOM_0012: {
    codigo: "DOM-0012",
    tipo: "persona",
    descripcion:
      "El pago no se puede registrar: es mayor que lo que falta pagar, no es un importe mayor que cero o no está en la moneda de la deuda.",
    queHacer:
      "Corregí el importe: tiene que ser mayor que cero y no pasar del saldo. Si ya se pagó todo, no hay nada más que registrar.",
  },
  DOM_0013: {
    codigo: "DOM-0013",
    tipo: "persona",
    descripcion:
      "El tipo de cambio no corresponde: falta si la cuenta es de otra moneda que la deuda o si el documento es en dólares, y no va si las dos monedas son la misma o el documento es en pesos.",
    queHacer:
      "Si la cuenta es de otra moneda, o el documento es en dólares, cargá el tipo de cambio de ese día y de dónde sale. Si es la misma moneda o el documento es en pesos, dejalo vacío.",
  },
  DOM_0014: {
    codigo: "DOM-0014",
    tipo: "persona",
    descripcion:
      "La orden de compra no se puede anular: tiene facturas vigentes.",
    queHacer:
      "Primero anulá las facturas de esa orden de compra y volvé a intentarlo.",
  },
  DOM_0016: {
    codigo: "DOM-0016",
    tipo: "persona",
    descripcion: "La factura no se puede anular: tiene cobros vigentes.",
    queHacer: "Primero anulá los cobros de esa factura y volvé a intentarlo.",
  },
  DOM_0017: {
    codigo: "DOM-0017",
    tipo: "persona",
    descripcion: "Ese cambio de estado pide un motivo: no se guardó nada.",
    queHacer:
      "Escribí en la nota por qué se pierde, queda sin respuesta o se cancela el servicio, y volvé a pedir el cambio.",
  },
  DOM_0018: {
    codigo: "DOM-0018",
    tipo: "persona",
    descripcion:
      "En la etapa en que está el servicio no se puede cargar ni anular eso: no se guardó nada.",
    queHacer:
      "Las cotizaciones van en «Creado» y «Cotizado»; la orden de compra, en «Cotizado» (se anula en «Adjudicado»); las facturas, según la modalidad de facturación: puntual en «Finalizado», por hitos de «Adjudicado» a «Finalizado» y mensual en «En ejecución» y «Finalizado»; la modalidad y la cuota, en «Adjudicado» y «En ejecución»; los cobros y los sucesos, en cualquier etapa menos «Cerrado»; el responsable, la fecha estimada, los hitos y los recursos, en «Adjudicado» y «En ejecución» (los hitos se tildan solo en «En ejecución»). Abrí el servicio de nuevo: puede que otra persona le haya cambiado el estado recién.",
  },
  DOM_0019: {
    codigo: "DOM-0019",
    tipo: "persona",
    descripcion:
      "La modalidad de facturación no se puede cambiar: el servicio ya tiene facturas vigentes. No se guardó nada.",
    queHacer:
      "Si la modalidad está mal, anulá primero las facturas del servicio y volvé a elegirla.",
  },
  DOM_0020: {
    codigo: "DOM-0020",
    tipo: "persona",
    descripcion:
      "El ajuste de la cuota no puede regir desde un mes que ya pasó ni desde antes del mes de inicio: no cambia lo ya devengado. No se guardó nada.",
    queHacer:
      "Elegí el mes actual o uno posterior, que no sea anterior al mes de inicio.",
  },
  DOM_0021: {
    codigo: "DOM-0021",
    tipo: "persona",
    descripcion:
      "El servicio no tiene modalidad de facturación: no se puede facturar. No se guardó nada.",
    queHacer:
      "Elegí la modalidad en la sección «Facturación» del servicio y volvé a cargar la factura.",
  },
  DOM_0022: {
    codigo: "DOM-0022",
    tipo: "persona",
    descripcion:
      "La cuota solo se ajusta en un servicio con modalidad mensual. No se guardó nada.",
    queHacer:
      "Abrí el servicio de nuevo: puede que otra persona le haya cambiado la modalidad recién.",
  },
  DOM_0026: {
    codigo: "DOM-0026",
    tipo: "persona",
    descripcion:
      "La situación no se cargó: el cliente no es el del servicio. No se guardó nada.",
    queHacer:
      "Abrí el servicio de nuevo: puede que otra persona le haya cambiado el cliente recién.",
  },
  DOM_0029: {
    codigo: "DOM-0029",
    tipo: "persona",
    descripcion:
      "El vencimiento ya no está pendiente: solo se corrige o se descarta uno pendiente. No se guardó nada.",
    queHacer:
      "Abrí el servicio de nuevo: puede que otra persona lo haya descartado recién.",
  },
  DOM_0036: {
    codigo: "DOM-0036",
    tipo: "persona",
    descripcion:
      "El vencimiento ya no está pendiente: solo se cotiza la renovación de uno pendiente. No se creó ningún servicio.",
    queHacer:
      "Abrí el servicio de nuevo: puede que otra persona ya haya cotizado la renovación o lo haya descartado.",
  },
  DOM_0037: {
    codigo: "DOM-0037",
    tipo: "persona",
    descripcion:
      "No se pudo crear el servicio de la renovación: el cliente, el tipo de servicio o el responsable ya no sirven para dar de alta un servicio. No se guardó nada.",
    queHacer:
      "Dalo de alta a mano desde Servicios, eligiendo un cliente, un tipo y un responsable vigentes.",
  },
  DOM_0038: {
    codigo: "DOM-0038",
    tipo: "persona",
    descripcion:
      "El servicio no tiene modalidad de facturación: no se puede iniciar la ejecución. No se guardó nada.",
    queHacer:
      "Elegí la modalidad de facturación en «Adjudicado» y volvé a iniciar la ejecución.",
  },
  DOM_0039: {
    codigo: "DOM-0039",
    tipo: "persona",
    descripcion:
      "El hito ya está realizado: un hito realizado no se quita ni se reordena. No se guardó nada.",
    queHacer:
      "Si se tildó por error, destildalo primero. Si no, dejalo donde está.",
  },
  DOM_0042: {
    codigo: "DOM-0042",
    tipo: "persona",
    descripcion:
      "El comprobante asociado no sirve: tiene que ser una factura, una factura adicional o una nota de débito vigente de este servicio, en la misma moneda.",
    queHacer:
      "Elegí otro comprobante de la lista, o cargá la nota en la moneda del comprobante al que corresponde.",
  },
  DOM_0043: {
    codigo: "DOM-0043",
    tipo: "persona",
    descripcion:
      "La nota de crédito supera el saldo pendiente del comprobante asociado.",
    queHacer:
      "Cargá un importe que no pase el saldo pendiente. Si ya se cobró, primero anulá el cobro: una nota de crédito sobre lo ya cobrado no se carga.",
  },
  DOM_0044: {
    codigo: "DOM-0044",
    tipo: "persona",
    descripcion:
      "El comprobante no se puede anular: tiene notas de crédito vigentes asociadas.",
    queHacer:
      "Primero anulá las notas de crédito de ese comprobante y volvé a intentarlo.",
  },
  DOM_0045: {
    codigo: "DOM-0045",
    tipo: "persona",
    descripcion:
      "Las notas de crédito y de débito y las facturas adicionales se anulan desde los ajustes del servicio, con un motivo.",
    queHacer:
      "Abrí los ajustes del servicio en la etapa «Finalizado» y anulalo desde ahí, escribiendo el motivo.",
  },
  DOM_0046: {
    codigo: "DOM-0046",
    tipo: "persona",
    descripcion:
      "Una nota de crédito no se cobra: no tiene saldo propio, baja el del comprobante al que está asociada.",
    queHacer: "Registrá el cobro en el comprobante asociado.",
  },
  AUT_0001: {
    codigo: "AUT-0001",
    tipo: "persona",
    descripcion:
      "No tenés acceso al sistema: tu email no está en la lista de usuarios habilitados o tu acceso fue revocado.",
    queHacer:
      "Revisá que entraste con el email correcto. Si tendrías que tener acceso, pedile a un administrador que te dé de alta o que revise tu usuario.",
  },
  AUT_0002: {
    codigo: "AUT-0002",
    tipo: "persona",
    descripcion: "Tu sesión no es válida o ya venció: hay que volver a entrar.",
    queHacer:
      "Volvé a iniciar sesión. Si te pasa seguido sin haber estado inactivo, avisá con este código.",
  },
  AUT_0003: {
    codigo: "AUT-0003",
    tipo: "persona",
    descripcion:
      "Esta acción solo la puede hacer un administrador activo: dar de alta, revocar o cambiar el rol de un usuario.",
    queHacer:
      "Pedile a un administrador que la haga por vos. Si tendrías que ser administrador, avisale para que revise tu rol.",
  },
  AUT_0004: {
    codigo: "AUT-0004",
    tipo: "persona",
    descripcion:
      "No se puede revocar ni pasar a operador al último administrador activo: el sistema se quedaría sin nadie que administre los usuarios.",
    queHacer:
      "Primero sumá otro administrador (dándolo de alta, o pasando a administrador a otro usuario activo) y después repetí el cambio.",
  },
  AUT_0005: {
    codigo: "AUT-0005",
    tipo: "persona",
    descripcion:
      "Ya hay un usuario con ese email: no se puede dar de alta dos veces (el email no distingue mayúsculas de minúsculas).",
    queHacer:
      "Buscá el usuario en la lista. Si está revocado y tiene que volver a entrar, avisá con este código: el alta de un revocado no se hace creando otro usuario.",
  },
  AUT_0006: {
    codigo: "AUT-0006",
    tipo: "persona",
    descripcion: "El usuario que se quiere modificar no existe.",
    queHacer:
      "Actualizá la lista de usuarios y volvé a elegirlo. Si sigue apareciendo y da este error, avisá con este código.",
  },
  AUT_0007: {
    codigo: "AUT-0007",
    tipo: "persona",
    descripcion:
      "El email no es válido: tiene que tener la forma nombre@dominio, sin espacios.",
    queHacer: "Revisá el email, corregilo y volvé a intentar.",
  },
  AUT_0008: {
    codigo: "AUT-0008",
    tipo: "persona",
    descripcion:
      "Los datos enviados desde el formulario no son válidos: falta un dato, el rol no es uno de los de la lista o el usuario no está bien identificado.",
    queHacer:
      "Volvé a la lista de usuarios y repetí la acción desde la pantalla, eligiendo el rol de la lista. Si no la podés completar, avisá con este código.",
  },
  AUT_0009: {
    codigo: "AUT-0009",
    tipo: "persona",
    descripcion:
      "Tu rol no puede modificar este catálogo: no puede dar de alta, editar ni dar de baja sus registros.",
    queHacer:
      "Pedile a alguien con un rol que sí pueda que lo haga por vos. Si tendrías que poder, avisale a un administrador para que revise tu rol.",
  },
  INF_0001: {
    codigo: "INF-0001",
    tipo: "sistema",
    descripcion:
      "Ocurrió un error inesperado en el sistema y la operación no se completó.",
    queHacer:
      "Volvé a intentar en unos minutos. Si se repite, avisá con este código: en el log está la causa y dónde ocurrió.",
  },
  INF_0002: {
    codigo: "INF-0002",
    tipo: "sistema",
    descripcion:
      "Una operación falló en todos sus intentos y quedó en la cola de fallidos para revisarla.",
    queHacer:
      "No hace falta repetirla a mano todavía: quien mantiene el sistema la ve en el panel de salud. En el log está el origen, cuántas veces se intentó y el código del último error.",
  },
  IA_0001: {
    codigo: "IA-0001",
    tipo: "sistema",
    descripcion:
      "Se llegó al tope de gasto mensual de la IA: esta vez no se le preguntó y la operación sigue sin su propuesta.",
    queHacer:
      "Seguí cargando a mano, como se hace sin IA. Si hace falta más tope este mes, avisá con este código: el tope es un parámetro de la configuración y se puede subir.",
  },
  IA_0002: {
    codigo: "IA-0002",
    tipo: "externo",
    descripcion:
      "La IA respondió algo que no tiene la forma esperada: su propuesta se descartó y no se usó para nada.",
    queHacer:
      "Seguí cargando a mano. Si se repite, avisá con este código: en el log está qué parte de la respuesta no cerró y en el registro de uso de IA, la respuesta tal cual llegó.",
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
