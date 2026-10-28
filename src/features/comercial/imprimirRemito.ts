/**
 * Imprime solo las hojas de remito pedidas, como imprimirRotulo: las copia a
 * #impresion-remito y oculta lo demás. El título del documento pasa a ser el
 * nombre del archivo, que es lo que propone «Guardar como PDF».
 */
export function imprimirRemito(hojas: HTMLElement[], titulo: string) {
  if (hojas.length === 0) return;
  const contenedor = document.createElement('div');
  contenedor.id = 'impresion-remito';
  for (const h of hojas) contenedor.appendChild(h.cloneNode(true));
  document.body.appendChild(contenedor);
  document.body.classList.add('imprimiendo-remito');
  const antes = document.title;
  document.title = titulo;
  const fin = () => {
    contenedor.remove();
    document.body.classList.remove('imprimiendo-remito');
    document.title = antes;
    window.removeEventListener('afterprint', fin);
  };
  window.addEventListener('afterprint', fin);
  window.print();
}
