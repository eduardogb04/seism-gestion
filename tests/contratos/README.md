# tests/contratos

Suites de test compartidas por puerto, que corren tanto contra el doble
(memoria) como contra el adaptador real (Postgres, S3, etc.): un puerto y su
doble cumplen el mismo contrato.

Una suite es una función que recibe una fábrica del adaptador; la llama el
archivo de test de cada implementación (AGENTS.md, *Cómo se agrega... un
adaptador que tiene que pasar una suite de contrato*).

Desde F0-27: `almacen-documentos.ts` (`suiteAlmacenDocumentos`), que corren
`tests/casos-uso/almacen-disco.test.ts` y `tests/casos-uso/almacen-s3.test.ts`.
