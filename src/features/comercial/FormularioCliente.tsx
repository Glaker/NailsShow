import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { Alert, Button, Group, Select, Stack, Switch, TextInput } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  TEXTO_CONDICION,
  TEXTO_DOCUMENTO,
  claseFactura,
  cuitValido,
  useGuardarCliente,
  type Cliente,
  type CondicionIva,
  type TipoDocumento,
} from '@/lib/consultasFacturacion';

/*
 * Derivado de las restricciones de comercial.clientes (20260924130000):
 * - A (Responsable Inscripto, Monotributo) exige CUIT (clientes_a_con_cuit).
 * - CUIT/CUIL con dígito verificador válido (clientes_cuit_valido).
 * - «Sin identificar» solo para Consumidor Final, con número 0.
 */
const esquema = z
  .object({
    razon_social: z.string().trim().min(1, 'Poné la razón social o el nombre.'),
    condicion_iva: z.enum([
      'RESPONSABLE_INSCRIPTO',
      'MONOTRIBUTO',
      'EXENTO',
      'CONSUMIDOR_FINAL',
      'NO_ALCANZADO',
    ]),
    tipo_documento: z.enum(['CUIT', 'CUIL', 'DNI', 'SIN_IDENTIFICAR']),
    numero_documento: z.string().trim(),
    domicilio: z.string().trim(),
    email: z.string().trim(),
    activo: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const numero = v.numero_documento.replace(/[^0-9]/g, '');
    if (claseFactura(v.condicion_iva) === 'A' && v.tipo_documento !== 'CUIT') {
      ctx.addIssue({
        code: 'custom',
        path: ['tipo_documento'],
        message:
          'A un Responsable Inscripto o Monotributo se le factura A: hace falta el CUIT.',
      });
    }
    if (v.tipo_documento === 'SIN_IDENTIFICAR') {
      if (v.condicion_iva !== 'CONSUMIDOR_FINAL') {
        ctx.addIssue({
          code: 'custom',
          path: ['tipo_documento'],
          message: 'Solo un Consumidor Final puede quedar sin identificar.',
        });
      }
      return;
    }
    if (!numero) {
      ctx.addIssue({
        code: 'custom',
        path: ['numero_documento'],
        message: 'Falta el número.',
      });
    } else if (
      (v.tipo_documento === 'CUIT' || v.tipo_documento === 'CUIL') &&
      !cuitValido(numero)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['numero_documento'],
        message: 'El CUIT no es válido: revisá los 11 dígitos.',
      });
    }
  });

type Valores = z.infer<typeof esquema>;

const CONDICIONES = (Object.keys(TEXTO_CONDICION) as CondicionIva[]).map((c) => ({
  value: c,
  label: TEXTO_CONDICION[c],
}));
const DOCUMENTOS = (Object.keys(TEXTO_DOCUMENTO) as TipoDocumento[]).map((d) => ({
  value: d,
  label: TEXTO_DOCUMENTO[d],
}));

/**
 * Alta y edición de cliente. Muestra, antes de guardar, qué factura le va a
 * corresponder (RN-57): es lo que el usuario necesita saber de la condición
 * frente al IVA.
 */
export function FormularioCliente({
  cliente,
  onListo,
}: {
  cliente: Cliente | null;
  onListo: (c: Cliente) => void;
}) {
  const guardar = useGuardarCliente();
  const form = useForm<Valores>({
    initialValues: {
      razon_social: cliente?.razon_social ?? '',
      condicion_iva: cliente?.condicion_iva ?? 'CONSUMIDOR_FINAL',
      tipo_documento: cliente?.tipo_documento ?? 'DNI',
      numero_documento:
        cliente && cliente.numero_documento !== '0' ? cliente.numero_documento : '',
      domicilio: cliente?.domicilio ?? '',
      email: cliente?.email ?? '',
      activo: cliente?.activo ?? true,
    },
    validate: zod4Resolver(esquema),
  });

  const clase = claseFactura(form.values.condicion_iva);

  return (
    <form
      onSubmit={form.onSubmit((v) =>
        guardar.mutate(
          {
            id: cliente?.id ?? null,
            datos: {
              razon_social: v.razon_social.trim(),
              condicion_iva: v.condicion_iva,
              tipo_documento: v.tipo_documento,
              numero_documento:
                v.tipo_documento === 'SIN_IDENTIFICAR'
                  ? '0'
                  : v.numero_documento.replace(/[^0-9]/g, ''),
              domicilio: v.domicilio.trim() || null,
              email: v.email.trim() || null,
              activo: v.activo,
            },
          },
          { onSuccess: onListo },
        ),
      )}
    >
      <Stack gap="md">
        <TextInput
          label="Razón social o nombre"
          withAsterisk
          {...form.getInputProps('razon_social')}
        />
        <Select
          label="Condición frente al IVA"
          withAsterisk
          data={CONDICIONES}
          allowDeselect={false}
          {...form.getInputProps('condicion_iva')}
          onChange={(v) => {
            const c = (v ?? 'CONSUMIDOR_FINAL') as CondicionIva;
            form.setFieldValue('condicion_iva', c);
            if (claseFactura(c) === 'A') form.setFieldValue('tipo_documento', 'CUIT');
          }}
        />
        <Group grow align="flex-start" wrap="wrap">
          <Select
            label="Documento"
            withAsterisk
            data={DOCUMENTOS}
            allowDeselect={false}
            style={{ minWidth: 160 }}
            {...form.getInputProps('tipo_documento')}
          />
          <TextInput
            label="Número"
            withAsterisk={form.values.tipo_documento !== 'SIN_IDENTIFICAR'}
            disabled={form.values.tipo_documento === 'SIN_IDENTIFICAR'}
            placeholder={form.values.tipo_documento === 'CUIT' ? '20-12345678-9' : ''}
            style={{ minWidth: 180 }}
            {...form.getInputProps('numero_documento')}
          />
        </Group>
        <TextInput label="Domicilio" {...form.getInputProps('domicilio')} />
        <TextInput label="Correo" type="email" {...form.getInputProps('email')} />
        {cliente ? (
          <Switch
            label="Activo"
            {...form.getInputProps('activo', { type: 'checkbox' })}
          />
        ) : null}
        <Alert
          color="violeta"
          variant="light"
          radius="md"
          icon={<IconInfoCircle size={18} />}
        >
          Se le va a emitir <b>Factura {clase}</b>.
          {form.values.condicion_iva === 'MONOTRIBUTO'
            ? ' ARCA no acepta Factura B a un monotributista.'
            : ''}
        </Alert>
        <Group justify="flex-end">
          <Button type="submit" loading={guardar.isPending}>
            {cliente ? 'Guardar' : 'Dar de alta'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
