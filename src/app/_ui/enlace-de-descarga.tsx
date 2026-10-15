/**
 * El enlace para bajar un documento adjunto (F2-05): su nombre y su tamaño. La
 * descarga la sirve `/documentos/<id>`, que pide sesión; es un `<a>` común, no
 * una navegación de Next, porque lo que vuelve es un archivo y no una página.
 */
export function EnlaceDeDescarga({
  id,
  nombre,
  tamano,
}: {
  readonly id: string;
  readonly nombre: string;
  readonly tamano: string;
}) {
  return (
    <a href={`/documentos/${id}`} download>
      {nombre} <span className="text-gray-600">({tamano})</span>
    </a>
  );
}
