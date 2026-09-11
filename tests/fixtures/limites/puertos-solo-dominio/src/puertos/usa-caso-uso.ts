// Viola `puertos-solo-dominio`: un puerto importa de otra capa.
import type { Pedido } from "../casos-uso/pedido.ts";

export interface Emisor {
  emitir(pedido: Pedido): Promise<void>;
}
