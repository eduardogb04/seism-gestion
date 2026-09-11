# Seguridad

## Reportar un problema

Si encontrás una vulnerabilidad, un secreto expuesto o un dato que no debería estar en este
repositorio, **no abras un issue público**. Usá el reporte privado de GitHub
(*Security → Report a vulnerability*) o escribí al contacto que figura en el perfil de la
organización.

Respondemos en días hábiles. Si el hallazgo es un secreto expuesto, se rota primero y se contesta
después.

## Qué protege este repo

- El repositorio es público y **no contiene secretos ni datos reales**: ni `.env`, ni credenciales,
  ni datos de clientes o personas. Las semillas son ficticias.
- *Secret scanning* y *push protection* de GitHub están activos; un escáner de secretos corre
  además en CI.
- Las variables de entorno se validan al arrancar: la aplicación se niega a levantar si falta una.
- La identidad está delegada (OIDC): el sistema no guarda contraseñas.
- Los logs redactan secretos y datos personales, con un test que lo verifica.

## Versiones soportadas

Solo la rama `main`.
