import EnlaceDeNext from "next/link.js";

/**
 * El `Link` de Next. Con `module: NodeNext` TypeScript ve el módulo CommonJS
 * entero y no el componente, que es su `default`; en ejecución el import ya es
 * el componente (en un componente de servidor es una referencia al de cliente,
 * a la que no se le puede pedir `.default`).
 */
export const Enlace = EnlaceDeNext as unknown as typeof EnlaceDeNext.default;
