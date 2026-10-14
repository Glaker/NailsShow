/**
 * Imprime un solo rótulo. La ficha del lote puede mostrar más de uno (el del
 * lote y la etiqueta de la muestra); imprimir la página entera los apilaba
 * uno encima del otro y salía recortado. Se copia el rótulo elegido a un
 * contenedor en la raíz del body y el CSS de impresión (global.css) oculta
 * todo lo demás.
 */
export function imprimirRotulo(elemento: HTMLElement | null) {
  if (!elemento) return;
  const copia = document.createElement('div');
  copia.id = 'impresion-rotulo';
  copia.appendChild(elemento.cloneNode(true));
  document.body.appendChild(copia);
  document.body.classList.add('imprimiendo-rotulo');
  const fin = () => {
    copia.remove();
    document.body.classList.remove('imprimiendo-rotulo');
    window.removeEventListener('afterprint', fin);
  };
  window.addEventListener('afterprint', fin);
  window.print();
}
