/**
 * Materias primas cosméticas habituales que todavía pueden no estar en el
 * catálogo (pedido del 2026-10-23): se ofrecen al cargar un componente de
 * fórmula y entran como nombre libre hasta que se den de alta como insumo.
 * Es una lista de ayuda para escribir, no un maestro: no tiene códigos ni
 * densidades, y no reemplaza al catálogo.
 */
export const MATERIAS_PRIMAS_COMUNES: string[] = [
  // Bases, aceites y mantecas
  'Agua desmineralizada',
  'Vaselina sólida (petrolato)',
  'Vaselina líquida (aceite mineral)',
  'Aceite de jojoba',
  'Aceite de almendras dulces',
  'Aceite de coco',
  'Aceite de argán',
  'Aceite de ricino',
  'Aceite de rosa mosqueta',
  'Aceite de girasol',
  'Aceite de oliva',
  'Aceite de palta',
  'Escualano',
  'Manteca de karité',
  'Manteca de cacao',
  'Cera de abejas',
  'Lanolina',
  // Humectantes y activos
  'Glicerina',
  'Propilenglicol',
  'Butilenglicol',
  'Vitamina E (acetato de tocoferol)',
  'Pantenol (provitamina B5)',
  'Alantoína',
  'Aloe vera (gel o extracto)',
  'Urea',
  'Ácido hialurónico',
  'Niacinamida',
  'Colágeno hidrolizado',
  'Queratina hidrolizada',
  'Proteína de seda',
  'Cafeína',
  'Ácido salicílico',
  'Ácido láctico',
  'Ácido cítrico',
  'Palmitato de retinilo (vitamina A)',
  'Ascorbil fosfato de sodio (vitamina C)',
  'Extracto de manzanilla',
  'Extracto de caléndula',
  'Mentol',
  'Alcanfor',
  // Emulsionantes, espesantes y tensioactivos
  'Alcohol cetílico',
  'Alcohol cetoestearílico',
  'Ácido esteárico',
  'Trietanolamina',
  'Carbómero',
  'Goma xántica',
  'Hidroxietilcelulosa',
  'Polisorbato 20',
  'Polisorbato 80',
  'Lauril éter sulfato de sodio',
  'Cocamidopropil betaína',
  'Dietanolamida de coco',
  'Cloruro de sodio',
  // Emolientes y siliconas
  'Dimeticona',
  'Ciclopentasiloxano',
  'Miristato de isopropilo',
  'Palmitato de isopropilo',
  // Conservantes y antioxidantes
  'Fenoxietanol',
  'Metilparabeno',
  'Propilparabeno',
  'Sorbato de potasio',
  'Benzoato de sodio',
  'EDTA disódico',
  'BHT (butilhidroxitolueno)',
  // Solventes
  'Alcohol etílico 96°',
  'Alcohol isopropílico',
  'Acetona',
  'Acetato de etilo',
  'Acetato de butilo',
  // Esmaltes y uñas
  'Nitrocelulosa',
  'Citrato de acetiltributilo',
  'Metacrilato de etilo (EMA)',
  'Polimetacrilato de metilo (PMMA)',
  'Metacrilato de hidroxipropilo (HPMA)',
  'Acrilato de isobornilo',
  'Peróxido de benzoílo',
  'Hidroquinona monometil éter (MEHQ)',
  'Fotoiniciador TPO',
  // Polvos y pigmentos
  'Sílice',
  'Mica',
  'Talco',
  'Caolín',
  'Bentonita',
  'Dióxido de titanio',
  'Óxido de zinc',
  'Óxidos de hierro',
  // Aromas
  'Fragancia',
  'Aceite esencial de lavanda',
  'Aceite esencial de árbol de té',
  'Aceite esencial de limón',
  'Colorante',
];

/** Para comparar nombres sin tildes ni mayúsculas. */
export const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
