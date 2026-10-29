-- El tipo de un suceso (F6-01): observación, hallazgo o aclaración del cliente. Nulo es
-- «Observación» (lo que ya estaba cargado). Los valores los valida el caso de uso.
-- AlterTable
ALTER TABLE "servicios_sucesos" ADD COLUMN     "tipo" TEXT;
