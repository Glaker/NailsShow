import { describe, expect, it } from 'vitest';
import { clientesRepetidos } from './consultasFacturacion';

const lista = [
  {
    id: '1',
    razon_social: 'Distribuidora Sur S.R.L.',
    tipo_documento: 'CUIT',
    numero_documento: '30712345671',
  },
  {
    id: '2',
    razon_social: 'Ana Pérez',
    tipo_documento: 'CUIT',
    numero_documento: '27301112223',
  },
  {
    id: '3',
    razon_social: 'Mostrador',
    tipo_documento: 'SIN_IDENTIFICAR',
    numero_documento: '0',
  },
] as const;

const de = (razon_social: string, numero_documento = '', id: string | null = null) =>
  clientesRepetidos([...lista], { id, razon_social, numero_documento });

describe('cliente repetido (D-clientes-duplicados-1)', () => {
  it('el mismo CUIT es el mismo cliente, con guiones o sin', () => {
    expect(de('Otro nombre', '30-71234567-1').mismoDocumento?.id).toBe('1');
  });
  it('el nombre sin tildes, signos ni SRL se parece', () => {
    expect(de('distribuidora sur').parecidos.map((c) => c.id)).toEqual(['1']);
    expect(de('Ana Perez').parecidos.map((c) => c.id)).toEqual(['2']);
  });
  it('el DNI que está dentro de un CUIT se parece', () => {
    expect(de('Anita', '30111222').parecidos.map((c) => c.id)).toEqual(['2']);
  });
  it('al editar no se compara consigo mismo; sin identificar no cuenta', () => {
    const r = de('Distribuidora Sur SRL', '30712345671', '1');
    expect(r.mismoDocumento).toBeUndefined();
    expect(r.parecidos).toEqual([]);
    expect(de('Kiosco', '0').mismoDocumento).toBeUndefined();
  });
  it('un nombre corto o distinto no avisa', () => {
    expect(de('Sol').parecidos).toEqual([]);
    expect(de('Farmacia Norte').parecidos).toEqual([]);
  });
});
