export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  comercial: {
    Tables: {
      articulos: {
        Row: {
          activo: boolean
          creado_en: string
          descripcion: string
          id: string
          insumo_id: string
          metodo_costeo: Database["comercial"]["Enums"]["metodo_costeo_enum"]
          sku: string
          stock_minimo: number | null
          umbral_ajuste_absoluto: number | null
          umbral_ajuste_relativo: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          descripcion: string
          id?: string
          insumo_id: string
          metodo_costeo?: Database["comercial"]["Enums"]["metodo_costeo_enum"]
          sku: string
          stock_minimo?: number | null
          umbral_ajuste_absoluto?: number | null
          umbral_ajuste_relativo?: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          descripcion?: string
          id?: string
          insumo_id?: string
          metodo_costeo?: Database["comercial"]["Enums"]["metodo_costeo_enum"]
          sku?: string
          stock_minimo?: number | null
          umbral_ajuste_absoluto?: number | null
          umbral_ajuste_relativo?: number
        }
        Relationships: [
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      avisos_compra: {
        Row: {
          cantidad: number
          creado_en: string
          estado: Database["comercial"]["Enums"]["estado_aviso_enum"]
          fecha_limite: string | null
          id: string
          insumo_id: string
          lote_insumo_id: string | null
          nota: string | null
          pedido_id: string | null
          proveedor_id: string | null
          recepcion_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          unidad: string
        }
        Insert: {
          cantidad: number
          creado_en?: string
          estado?: Database["comercial"]["Enums"]["estado_aviso_enum"]
          fecha_limite?: string | null
          id?: string
          insumo_id: string
          lote_insumo_id?: string | null
          nota?: string | null
          pedido_id?: string | null
          proveedor_id?: string | null
          recepcion_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          unidad: string
        }
        Update: {
          cantidad?: number
          creado_en?: string
          estado?: Database["comercial"]["Enums"]["estado_aviso_enum"]
          fecha_limite?: string | null
          id?: string
          insumo_id?: string
          lote_insumo_id?: string | null
          nota?: string | null
          pedido_id?: string | null
          proveedor_id?: string | null
          recepcion_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_compra_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_compra_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_compra_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_compra_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_compra_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_compra_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "avisos_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "avisos_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "avisos_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "avisos_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "avisos_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "avisos_compra_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_conciliacion_recepcion"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "avisos_compra_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_recepciones_sin_comprobante"
            referencedColumns: ["recepcion_id"]
          },
        ]
      }
      avisos_costo: {
        Row: {
          costo_lote_id: string
          costo_referencia_id: string
          costo_referencia_unitario: number
          creado_en: string
          id: string
          insumo_id: string
          ipc_acumulado: number | null
          precio_lote_unitario: number
          umbral: number
          variacion_nominal: number
          variacion_real: number
          visto_en: string | null
          visto_por: string | null
        }
        Insert: {
          costo_lote_id: string
          costo_referencia_id: string
          costo_referencia_unitario: number
          creado_en?: string
          id?: string
          insumo_id: string
          ipc_acumulado?: number | null
          precio_lote_unitario: number
          umbral: number
          variacion_nominal: number
          variacion_real: number
          visto_en?: string | null
          visto_por?: string | null
        }
        Update: {
          costo_lote_id?: string
          costo_referencia_id?: string
          costo_referencia_unitario?: number
          creado_en?: string
          id?: string
          insumo_id?: string
          ipc_acumulado?: number | null
          precio_lote_unitario?: number
          umbral?: number
          variacion_nominal?: number
          variacion_real?: number
          visto_en?: string | null
          visto_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avisos_costo_costo_lote_id_fkey"
            columns: ["costo_lote_id"]
            isOneToOne: true
            referencedRelation: "costos_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_costo_costo_lote_id_fkey"
            columns: ["costo_lote_id"]
            isOneToOne: true
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["ultimo_costo_lote_id"]
          },
          {
            foreignKeyName: "avisos_costo_costo_lote_id_fkey"
            columns: ["costo_lote_id"]
            isOneToOne: true
            referencedRelation: "v_costos_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_costo_costo_lote_id_fkey"
            columns: ["costo_lote_id"]
            isOneToOne: true
            referencedRelation: "v_costos_lote_unitario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_costo_costo_referencia_id_fkey"
            columns: ["costo_referencia_id"]
            isOneToOne: false
            referencedRelation: "costos_referencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_costo_costo_referencia_id_fkey"
            columns: ["costo_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["costo_referencia_id"]
          },
          {
            foreignKeyName: "avisos_costo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_costo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_costo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_costo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_costo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "avisos_costo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      categorias_gasto: {
        Row: {
          activa: boolean
          clase: Database["comercial"]["Enums"]["clase_gasto_enum"]
          creado_en: string
          creado_por: string | null
          es_nomina_produccion: boolean
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          clase: Database["comercial"]["Enums"]["clase_gasto_enum"]
          creado_en?: string
          creado_por?: string | null
          es_nomina_produccion?: boolean
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          clase?: Database["comercial"]["Enums"]["clase_gasto_enum"]
          creado_en?: string
          creado_por?: string | null
          es_nomina_produccion?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean
          condicion_iva: Database["comercial"]["Enums"]["condicion_iva_enum"]
          creado_en: string
          creado_por: string
          domicilio: string | null
          email: string | null
          id: string
          numero_documento: string
          razon_social: string
          tercero_id: string | null
          tipo_documento: Database["comercial"]["Enums"]["tipo_documento_enum"]
        }
        Insert: {
          activo?: boolean
          condicion_iva: Database["comercial"]["Enums"]["condicion_iva_enum"]
          creado_en?: string
          creado_por?: string
          domicilio?: string | null
          email?: string | null
          id?: string
          numero_documento: string
          razon_social: string
          tercero_id?: string | null
          tipo_documento: Database["comercial"]["Enums"]["tipo_documento_enum"]
        }
        Update: {
          activo?: boolean
          condicion_iva?: Database["comercial"]["Enums"]["condicion_iva_enum"]
          creado_en?: string
          creado_por?: string
          domicilio?: string | null
          email?: string | null
          id?: string
          numero_documento?: string
          razon_social?: string
          tercero_id?: string | null
          tipo_documento?: Database["comercial"]["Enums"]["tipo_documento_enum"]
        }
        Relationships: []
      }
      clientes_potenciales: {
        Row: {
          cliente_id: string | null
          contacto: string | null
          creado_en: string
          creado_por: string
          cuit: string | null
          email: string | null
          id: string
          razon_social: string
        }
        Insert: {
          cliente_id?: string | null
          contacto?: string | null
          creado_en?: string
          creado_por?: string
          cuit?: string | null
          email?: string | null
          id?: string
          razon_social: string
        }
        Update: {
          cliente_id?: string | null
          contacto?: string | null
          creado_en?: string
          creado_por?: string
          cuit?: string | null
          email?: string | null
          id?: string
          razon_social?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_potenciales_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_potenciales_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      cobros_cliente: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          cliente_id: string
          cuenta_id: string
          fecha: string
          id: string
          importe: number
          medio: Database["comercial"]["Enums"]["medio_pago_enum"]
          motivo_anulacion: string | null
          observacion: string | null
          referencia: string | null
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id: string
          cuenta_id: string
          fecha?: string
          id?: string
          importe: number
          medio: Database["comercial"]["Enums"]["medio_pago_enum"]
          motivo_anulacion?: string | null
          observacion?: string | null
          referencia?: string | null
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id?: string
          cuenta_id?: string
          fecha?: string
          id?: string
          importe?: number
          medio?: Database["comercial"]["Enums"]["medio_pago_enum"]
          motivo_anulacion?: string | null
          observacion?: string | null
          referencia?: string | null
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobros_cliente_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_cliente_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_fondos"
            referencedColumns: ["cuenta_id"]
          },
        ]
      }
      comentarios_solicitud_pago: {
        Row: {
          autor: string
          creado_en: string
          id: string
          solicitud_id: string
          texto: string
        }
        Insert: {
          autor?: string
          creado_en?: string
          id?: string
          solicitud_id: string
          texto: string
        }
        Update: {
          autor?: string
          creado_en?: string
          id?: string
          solicitud_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "comentarios_solicitud_pago_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes_proveedor: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          comprobante_asociado_id: string | null
          fecha: string
          id: string
          importe_iva: number | null
          importe_neto: number | null
          importe_otros: number | null
          importe_total: number | null
          motivo_anulacion: string | null
          numero: number | null
          observacion: string | null
          proveedor_id: string
          punto_venta: number | null
          recepcion_id: string | null
          registrado_en: string
          registrado_por: string
          tipo: Database["comercial"]["Enums"]["tipo_comprobante_proveedor_enum"]
          vencimiento_pago: string | null
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          comprobante_asociado_id?: string | null
          fecha?: string
          id?: string
          importe_iva?: number | null
          importe_neto?: number | null
          importe_otros?: number | null
          importe_total?: number | null
          motivo_anulacion?: string | null
          numero?: number | null
          observacion?: string | null
          proveedor_id: string
          punto_venta?: number | null
          recepcion_id?: string | null
          registrado_en?: string
          registrado_por?: string
          tipo: Database["comercial"]["Enums"]["tipo_comprobante_proveedor_enum"]
          vencimiento_pago?: string | null
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          comprobante_asociado_id?: string | null
          fecha?: string
          id?: string
          importe_iva?: number | null
          importe_neto?: number | null
          importe_otros?: number | null
          importe_total?: number | null
          motivo_anulacion?: string | null
          numero?: number | null
          observacion?: string | null
          proveedor_id?: string
          punto_venta?: number | null
          recepcion_id?: string | null
          registrado_en?: string
          registrado_por?: string
          tipo?: Database["comercial"]["Enums"]["tipo_comprobante_proveedor_enum"]
          vencimiento_pago?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_proveedor_comprobante_asociado_id_fkey"
            columns: ["comprobante_asociado_id"]
            isOneToOne: false
            referencedRelation: "comprobantes_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_comprobante_asociado_id_fkey"
            columns: ["comprobante_asociado_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_proveedor_pendientes"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_conciliacion_recepcion"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_recepciones_sin_comprobante"
            referencedColumns: ["recepcion_id"]
          },
        ]
      }
      conciliaciones_fondos: {
        Row: {
          cuenta_id: string
          diferencia: number | null
          fecha: string
          id: string
          observacion: string | null
          registrado_en: string
          registrado_por: string
          saldo_real: number
          saldo_sistema: number
        }
        Insert: {
          cuenta_id: string
          diferencia?: number | null
          fecha: string
          id?: string
          observacion?: string | null
          registrado_en?: string
          registrado_por?: string
          saldo_real: number
          saldo_sistema: number
        }
        Update: {
          cuenta_id?: string
          diferencia?: number | null
          fecha?: string
          id?: string
          observacion?: string | null
          registrado_en?: string
          registrado_por?: string
          saldo_real?: number
          saldo_sistema?: number
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_fondos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_fondos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_fondos"
            referencedColumns: ["cuenta_id"]
          },
        ]
      }
      conciliaciones_proveedor: {
        Row: {
          diferencia: number | null
          fecha: string
          id: string
          observacion: string | null
          proveedor_id: string
          registrado_en: string
          registrado_por: string
          saldo_informado: number
          saldo_sistema: number
        }
        Insert: {
          diferencia?: number | null
          fecha: string
          id?: string
          observacion?: string | null
          proveedor_id: string
          registrado_en?: string
          registrado_por?: string
          saldo_informado: number
          saldo_sistema: number
        }
        Update: {
          diferencia?: number | null
          fecha?: string
          id?: string
          observacion?: string | null
          proveedor_id?: string
          registrado_en?: string
          registrado_por?: string
          saldo_informado?: number
          saldo_sistema?: number
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "conciliaciones_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      configuracion_fiscal: {
        Row: {
          ambiente: Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
          condicion_iva: Database["comercial"]["Enums"]["condicion_iva_enum"]
          creado_en: string
          cuit_emisor: string
          id: string
          observacion: string | null
          punto_venta: number
          razon_social: string | null
          vigente: boolean
        }
        Insert: {
          ambiente: Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
          condicion_iva: Database["comercial"]["Enums"]["condicion_iva_enum"]
          creado_en?: string
          cuit_emisor: string
          id?: string
          observacion?: string | null
          punto_venta: number
          razon_social?: string | null
          vigente?: boolean
        }
        Update: {
          ambiente?: Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
          condicion_iva?: Database["comercial"]["Enums"]["condicion_iva_enum"]
          creado_en?: string
          cuit_emisor?: string
          id?: string
          observacion?: string | null
          punto_venta?: number
          razon_social?: string | null
          vigente?: boolean
        }
        Relationships: []
      }
      contadores: {
        Row: {
          ambito: string
          anio: number
          ultimo: number
        }
        Insert: {
          ambito: string
          anio: number
          ultimo?: number
        }
        Update: {
          ambito?: string
          anio?: number
          ultimo?: number
        }
        Relationships: []
      }
      conteos_inventario: {
        Row: {
          cantidad_contada: number
          diferencia: number | null
          id: string
          insumo_id: string
          observacion: string | null
          provisorio: boolean
          registrado_en: string
          registrado_por: string
          saldo_previo: number
          unidad: string
        }
        Insert: {
          cantidad_contada: number
          diferencia?: number | null
          id?: string
          insumo_id: string
          observacion?: string | null
          provisorio?: boolean
          registrado_en?: string
          registrado_por?: string
          saldo_previo: number
          unidad: string
        }
        Update: {
          cantidad_contada?: number
          diferencia?: number | null
          id?: string
          insumo_id?: string
          observacion?: string | null
          provisorio?: boolean
          registrado_en?: string
          registrado_por?: string
          saldo_previo?: number
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      correcciones_dato_lote: {
        Row: {
          campo: string
          corregido_en: string
          corregido_por: string
          id: string
          lote_insumo_id: string
          motivo: string
          motivo_detalle: string | null
          valor_antes: string | null
          valor_despues: string | null
        }
        Insert: {
          campo: string
          corregido_en?: string
          corregido_por?: string
          id?: string
          lote_insumo_id: string
          motivo: string
          motivo_detalle?: string | null
          valor_antes?: string | null
          valor_despues?: string | null
        }
        Update: {
          campo?: string
          corregido_en?: string
          corregido_por?: string
          id?: string
          lote_insumo_id?: string
          motivo?: string
          motivo_detalle?: string | null
          valor_antes?: string | null
          valor_despues?: string | null
        }
        Relationships: []
      }
      correcciones_lote: {
        Row: {
          bultos_antes: number
          bultos_despues: number
          corregido_en: string
          corregido_por: string
          id: string
          lote_insumo_id: string
          motivo: string
          unidades_antes: number | null
          unidades_despues: number
        }
        Insert: {
          bultos_antes: number
          bultos_despues: number
          corregido_en?: string
          corregido_por?: string
          id?: string
          lote_insumo_id: string
          motivo: string
          unidades_antes?: number | null
          unidades_despues: number
        }
        Update: {
          bultos_antes?: number
          bultos_despues?: number
          corregido_en?: string
          corregido_por?: string
          id?: string
          lote_insumo_id?: string
          motivo?: string
          unidades_antes?: number | null
          unidades_despues?: number
        }
        Relationships: []
      }
      costos_accesorios: {
        Row: {
          alicuota_iva: number | null
          cargado_en: string
          cargado_por: string
          concepto: Database["comercial"]["Enums"]["concepto_accesorio_enum"]
          descripcion: string | null
          fecha_costo: string | null
          id: string
          importe: number
          importe_neto_ars: number | null
          incluye_iva: boolean | null
          moneda: string
          motivo: string | null
          recepcion_id: string
          rectifica_a: string | null
          tipo_cambio: number
          tipo_comprobante: Database["comercial"]["Enums"]["comprobante_costo_enum"]
        }
        Insert: {
          alicuota_iva?: number | null
          cargado_en?: string
          cargado_por?: string
          concepto: Database["comercial"]["Enums"]["concepto_accesorio_enum"]
          descripcion?: string | null
          fecha_costo?: string | null
          id?: string
          importe: number
          importe_neto_ars?: number | null
          incluye_iva?: boolean | null
          moneda?: string
          motivo?: string | null
          recepcion_id: string
          rectifica_a?: string | null
          tipo_cambio?: number
          tipo_comprobante: Database["comercial"]["Enums"]["comprobante_costo_enum"]
        }
        Update: {
          alicuota_iva?: number | null
          cargado_en?: string
          cargado_por?: string
          concepto?: Database["comercial"]["Enums"]["concepto_accesorio_enum"]
          descripcion?: string | null
          fecha_costo?: string | null
          id?: string
          importe?: number
          importe_neto_ars?: number | null
          incluye_iva?: boolean | null
          moneda?: string
          motivo?: string | null
          recepcion_id?: string
          rectifica_a?: string | null
          tipo_cambio?: number
          tipo_comprobante?: Database["comercial"]["Enums"]["comprobante_costo_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "costos_accesorios_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_conciliacion_recepcion"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "costos_accesorios_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_recepciones_sin_comprobante"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "costos_accesorios_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "costos_accesorios"
            referencedColumns: ["id"]
          },
        ]
      }
      costos_apertura_pendientes: {
        Row: {
          cargado_en: string
          cargado_por: string
          detalle: string | null
          fecha_costo: string | null
          id: string
          importe: number
          insumo_id: string
          moneda: string
          motivo: string
          peso_planilla: string | null
        }
        Insert: {
          cargado_en?: string
          cargado_por?: string
          detalle?: string | null
          fecha_costo?: string | null
          id?: string
          importe: number
          insumo_id: string
          moneda: string
          motivo: string
          peso_planilla?: string | null
        }
        Update: {
          cargado_en?: string
          cargado_por?: string
          detalle?: string | null
          fecha_costo?: string | null
          id?: string
          importe?: number
          insumo_id?: string
          moneda?: string
          motivo?: string
          peso_planilla?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_apertura_pendientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_apertura_pendientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_apertura_pendientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_apertura_pendientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_apertura_pendientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_apertura_pendientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      costos_estimados: {
        Row: {
          cantidad: number
          cargado_en: string
          cargado_por: string
          id: string
          importe: number
          insumo_id: string
          orden: number
          unidad: string
        }
        Insert: {
          cantidad?: number
          cargado_en?: string
          cargado_por?: string
          id?: string
          importe: number
          insumo_id: string
          orden?: never
          unidad: string
        }
        Update: {
          cantidad?: number
          cargado_en?: string
          cargado_por?: string
          id?: string
          importe?: number
          insumo_id?: string
          orden?: never
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "costos_estimados_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_estimados_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_estimados_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_estimados_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_estimados_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_estimados_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      costos_lote: {
        Row: {
          alicuota_iva: number | null
          cantidad: number
          cargado_en: string
          cargado_por: string
          fecha_costo: string | null
          id: string
          importe: number | null
          importe_neto_ars: number | null
          incluye_iva: boolean | null
          lote_insumo_id: string
          moneda: string
          motivo: string | null
          origen: Database["comercial"]["Enums"]["origen_costo_enum"]
          rectifica_a: string | null
          tipo_cambio: number | null
          tipo_comprobante:
            | Database["comercial"]["Enums"]["comprobante_costo_enum"]
            | null
          unidad: string
        }
        Insert: {
          alicuota_iva?: number | null
          cantidad: number
          cargado_en?: string
          cargado_por?: string
          fecha_costo?: string | null
          id?: string
          importe?: number | null
          importe_neto_ars?: number | null
          incluye_iva?: boolean | null
          lote_insumo_id: string
          moneda?: string
          motivo?: string | null
          origen?: Database["comercial"]["Enums"]["origen_costo_enum"]
          rectifica_a?: string | null
          tipo_cambio?: number | null
          tipo_comprobante?:
            | Database["comercial"]["Enums"]["comprobante_costo_enum"]
            | null
          unidad: string
        }
        Update: {
          alicuota_iva?: number | null
          cantidad?: number
          cargado_en?: string
          cargado_por?: string
          fecha_costo?: string | null
          id?: string
          importe?: number | null
          importe_neto_ars?: number | null
          incluye_iva?: boolean | null
          lote_insumo_id?: string
          moneda?: string
          motivo?: string | null
          origen?: Database["comercial"]["Enums"]["origen_costo_enum"]
          rectifica_a?: string | null
          tipo_cambio?: number | null
          tipo_comprobante?:
            | Database["comercial"]["Enums"]["comprobante_costo_enum"]
            | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "costos_lote_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "costos_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_lote_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["ultimo_costo_lote_id"]
          },
          {
            foreignKeyName: "costos_lote_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_costos_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_lote_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_costos_lote_unitario"
            referencedColumns: ["id"]
          },
        ]
      }
      costos_producto_planilla: {
        Row: {
          cargado_en: string
          cargado_por: string
          cvd: number | null
          cvi: number | null
          fuente: string
          id: string
          mod: number | null
          motivo: string | null
          producto_id: string
          reemplaza_a: string | null
          total: number | null
          vigente_desde: string
        }
        Insert: {
          cargado_en?: string
          cargado_por?: string
          cvd?: number | null
          cvi?: number | null
          fuente: string
          id?: string
          mod?: number | null
          motivo?: string | null
          producto_id: string
          reemplaza_a?: string | null
          total?: number | null
          vigente_desde?: string
        }
        Update: {
          cargado_en?: string
          cargado_por?: string
          cvd?: number | null
          cvi?: number | null
          fuente?: string
          id?: string
          mod?: number | null
          motivo?: string | null
          producto_id?: string
          reemplaza_a?: string | null
          total?: number | null
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "costos_producto_planilla_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: true
            referencedRelation: "costos_producto_planilla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: true
            referencedRelation: "v_costo_producto"
            referencedColumns: ["planilla_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: true
            referencedRelation: "v_costo_producto_planilla"
            referencedColumns: ["id"]
          },
        ]
      }
      costos_referencia: {
        Row: {
          alicuota_iva: number | null
          cantidad: number
          cargado_en: string
          cargado_por: string
          id: string
          importe: number
          importe_neto: number | null
          incluye_iva: boolean
          insumo_id: string
          moneda: string
          motivo: string | null
          orden: number
          tipo_cambio: number
          unidad: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          alicuota_iva?: number | null
          cantidad?: number
          cargado_en?: string
          cargado_por?: string
          id?: string
          importe: number
          importe_neto?: number | null
          incluye_iva?: boolean
          insumo_id: string
          moneda?: string
          motivo?: string | null
          orden?: never
          tipo_cambio?: number
          unidad: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          alicuota_iva?: number | null
          cantidad?: number
          cargado_en?: string
          cargado_por?: string
          id?: string
          importe?: number
          importe_neto?: number | null
          incluye_iva?: boolean
          insumo_id?: string
          moneda?: string
          motivo?: string | null
          orden?: never
          tipo_cambio?: number
          unidad?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "costos_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      cotizacion_lineas: {
        Row: {
          alicuota_iva: number | null
          anulada: boolean
          cantidad: number
          cantidad_presentacion: number | null
          cotizacion_id: string
          creado_en: string
          densidad: number | null
          id: string
          incluye_iva: boolean | null
          insumo_id: string | null
          merma: number
          nombre: string
          orden: number
          precio: number | null
          tipo: Database["comercial"]["Enums"]["tipo_linea_cotizacion_enum"]
          unidad: string
          unidad_presentacion: string | null
        }
        Insert: {
          alicuota_iva?: number | null
          anulada?: boolean
          cantidad: number
          cantidad_presentacion?: number | null
          cotizacion_id: string
          creado_en?: string
          densidad?: number | null
          id?: string
          incluye_iva?: boolean | null
          insumo_id?: string | null
          merma?: number
          nombre: string
          orden: number
          precio?: number | null
          tipo: Database["comercial"]["Enums"]["tipo_linea_cotizacion_enum"]
          unidad: string
          unidad_presentacion?: string | null
        }
        Update: {
          alicuota_iva?: number | null
          anulada?: boolean
          cantidad?: number
          cantidad_presentacion?: number | null
          cotizacion_id?: string
          creado_en?: string
          densidad?: number | null
          id?: string
          incluye_iva?: boolean | null
          insumo_id?: string | null
          merma?: number
          nombre?: string
          orden?: number
          precio?: number | null
          tipo?: Database["comercial"]["Enums"]["tipo_linea_cotizacion_enum"]
          unidad?: string
          unidad_presentacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_lineas_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          alicuota_iva: number
          anio: number | null
          anulada_en: string | null
          anulada_por: string | null
          cantidad_cotizada: number
          cliente_id: string | null
          cliente_potencial_id: string | null
          contenido_cantidad: number | null
          contenido_unidad: string | null
          costo_unitario: number | null
          creado_en: string
          creado_por: string
          destino: Database["comercial"]["Enums"]["destino_cotizacion_enum"]
          duplicada_de: string | null
          emitida_en: string | null
          emitida_por: string | null
          estado: Database["comercial"]["Enums"]["estado_cotizacion_enum"]
          fija: string
          foto: Json | null
          id: string
          incluir_mano_obra: boolean
          justificacion_margen: string | null
          leyenda_iva: string
          margen_objetivo: number | null
          minutos_por_unidad: number | null
          modo_margen: string
          motivo_anulacion: string | null
          numero: number | null
          observaciones: string | null
          precio_objetivo: number | null
          precio_unitario: number | null
          producto_base_id: string | null
          redondeo: number
          titulo: string
          vence_el: string | null
          vigencia_dias: number
        }
        Insert: {
          alicuota_iva?: number
          anio?: number | null
          anulada_en?: string | null
          anulada_por?: string | null
          cantidad_cotizada?: number
          cliente_id?: string | null
          cliente_potencial_id?: string | null
          contenido_cantidad?: number | null
          contenido_unidad?: string | null
          costo_unitario?: number | null
          creado_en?: string
          creado_por?: string
          destino?: Database["comercial"]["Enums"]["destino_cotizacion_enum"]
          duplicada_de?: string | null
          emitida_en?: string | null
          emitida_por?: string | null
          estado?: Database["comercial"]["Enums"]["estado_cotizacion_enum"]
          fija?: string
          foto?: Json | null
          id?: string
          incluir_mano_obra?: boolean
          justificacion_margen?: string | null
          leyenda_iva?: string
          margen_objetivo?: number | null
          minutos_por_unidad?: number | null
          modo_margen?: string
          motivo_anulacion?: string | null
          numero?: number | null
          observaciones?: string | null
          precio_objetivo?: number | null
          precio_unitario?: number | null
          producto_base_id?: string | null
          redondeo?: number
          titulo: string
          vence_el?: string | null
          vigencia_dias: number
        }
        Update: {
          alicuota_iva?: number
          anio?: number | null
          anulada_en?: string | null
          anulada_por?: string | null
          cantidad_cotizada?: number
          cliente_id?: string | null
          cliente_potencial_id?: string | null
          contenido_cantidad?: number | null
          contenido_unidad?: string | null
          costo_unitario?: number | null
          creado_en?: string
          creado_por?: string
          destino?: Database["comercial"]["Enums"]["destino_cotizacion_enum"]
          duplicada_de?: string | null
          emitida_en?: string | null
          emitida_por?: string | null
          estado?: Database["comercial"]["Enums"]["estado_cotizacion_enum"]
          fija?: string
          foto?: Json | null
          id?: string
          incluir_mano_obra?: boolean
          justificacion_margen?: string | null
          leyenda_iva?: string
          margen_objetivo?: number | null
          minutos_por_unidad?: number | null
          modo_margen?: string
          motivo_anulacion?: string | null
          numero?: number | null
          observaciones?: string | null
          precio_objetivo?: number | null
          precio_unitario?: number | null
          producto_base_id?: string | null
          redondeo?: number
          titulo?: string
          vence_el?: string | null
          vigencia_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_potencial_id_fkey"
            columns: ["cliente_potencial_id"]
            isOneToOne: false
            referencedRelation: "clientes_potenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_producto_base_id_fkey"
            columns: ["producto_base_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cotizaciones_producto_base_id_fkey"
            columns: ["producto_base_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cotizaciones_producto_base_id_fkey"
            columns: ["producto_base_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      cuentas_fondos: {
        Row: {
          activo: boolean
          banco: string | null
          creado_en: string
          creado_por: string
          de_tercero: boolean
          id: string
          moneda: string
          nombre: string
          numero: string | null
          tipo: Database["comercial"]["Enums"]["tipo_cuenta_fondos_enum"]
          titular: string | null
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          creado_en?: string
          creado_por?: string
          de_tercero?: boolean
          id?: string
          moneda?: string
          nombre: string
          numero?: string | null
          tipo: Database["comercial"]["Enums"]["tipo_cuenta_fondos_enum"]
          titular?: string | null
        }
        Update: {
          activo?: boolean
          banco?: string | null
          creado_en?: string
          creado_por?: string
          de_tercero?: boolean
          id?: string
          moneda?: string
          nombre?: string
          numero?: string | null
          tipo?: Database["comercial"]["Enums"]["tipo_cuenta_fondos_enum"]
          titular?: string | null
        }
        Relationships: []
      }
      descuentos_cliente: {
        Row: {
          cargado_en: string
          cargado_por: string
          cliente_id: string
          id: string
          motivo: string | null
          orden: number
          porcentaje: number
          producto_id: string | null
        }
        Insert: {
          cargado_en?: string
          cargado_por?: string
          cliente_id: string
          id?: string
          motivo?: string | null
          orden?: never
          porcentaje: number
          producto_id?: string | null
        }
        Update: {
          cargado_en?: string
          cargado_por?: string
          cliente_id?: string
          id?: string
          motivo?: string | null
          orden?: never
          porcentaje?: number
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descuentos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descuentos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "descuentos_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "descuentos_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "descuentos_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      despacho_diferencias: {
        Row: {
          despacho_id: string
          enviado: number
          id: string
          motivo: string
          pedido_id: string
          pendiente: number
          producto_id: string
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          despacho_id: string
          enviado: number
          id?: string
          motivo: string
          pedido_id: string
          pendiente: number
          producto_id: string
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          despacho_id?: string
          enviado?: number
          id?: string
          motivo?: string
          pedido_id?: string
          pendiente?: number
          producto_id?: string
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "despacho_diferencias_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despacho_diferencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despacho_diferencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "despacho_diferencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "despacho_diferencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despacho_diferencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "despacho_diferencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "despacho_diferencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "despacho_diferencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "despacho_diferencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      despachos_pt: {
        Row: {
          con_faltantes: boolean
          deposito_id: string
          id: string
          observacion: string | null
          pedido_id: string
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          con_faltantes: boolean
          deposito_id: string
          id?: string
          observacion?: string | null
          pedido_id: string
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          con_faltantes?: boolean
          deposito_id?: string
          id?: string
          observacion?: string | null
          pedido_id?: string
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "despachos_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "despachos_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "despachos_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "despachos_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      escalas_descuento: {
        Row: {
          carga: number
          cargado_en: string
          cargado_por: string | null
          desde_monto: number
          id: string
          porcentaje: number
          vigente_desde: string
        }
        Insert: {
          carga: number
          cargado_en?: string
          cargado_por?: string | null
          desde_monto: number
          id?: string
          porcentaje: number
          vigente_desde?: string
        }
        Update: {
          carga?: number
          cargado_en?: string
          cargado_por?: string | null
          desde_monto?: number
          id?: string
          porcentaje?: number
          vigente_desde?: string
        }
        Relationships: []
      }
      etiquetado_anulaciones: {
        Row: {
          anulado_en: string
          anulado_por: string
          etiquetado_id: string
          motivo: string
        }
        Insert: {
          anulado_en?: string
          anulado_por?: string
          etiquetado_id: string
          motivo: string
        }
        Update: {
          anulado_en?: string
          anulado_por?: string
          etiquetado_id?: string
          motivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetado_anulaciones_etiquetado_id_fkey"
            columns: ["etiquetado_id"]
            isOneToOne: true
            referencedRelation: "etiquetados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiquetado_anulaciones_etiquetado_id_fkey"
            columns: ["etiquetado_id"]
            isOneToOne: true
            referencedRelation: "v_etiquetados_saldo"
            referencedColumns: ["etiquetado_id"]
          },
        ]
      }
      etiquetado_consumos: {
        Row: {
          cantidad: number
          etiquetado_id: string
          id: string
          insumo_id: string
          unidad: string
        }
        Insert: {
          cantidad: number
          etiquetado_id: string
          id?: string
          insumo_id: string
          unidad: string
        }
        Update: {
          cantidad?: number
          etiquetado_id?: string
          id?: string
          insumo_id?: string
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetado_consumos_etiquetado_id_fkey"
            columns: ["etiquetado_id"]
            isOneToOne: false
            referencedRelation: "etiquetados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_etiquetado_id_fkey"
            columns: ["etiquetado_id"]
            isOneToOne: false
            referencedRelation: "v_etiquetados_saldo"
            referencedColumns: ["etiquetado_id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "etiquetado_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      etiquetados: {
        Row: {
          cantidad: number
          fecha: string
          id: string
          producto_id: string
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          cantidad: number
          fecha?: string
          id?: string
          producto_id: string
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          cantidad?: number
          fecha?: string
          id?: string
          producto_id?: string
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      factura_renglones: {
        Row: {
          alicuota_iva: number
          cantidad: number
          creado_en: string
          factura_id: string
          id: string
          importe_neto: number
          precio_unitario: number
          producto_id: string
        }
        Insert: {
          alicuota_iva: number
          cantidad: number
          creado_en?: string
          factura_id: string
          id?: string
          importe_neto: number
          precio_unitario: number
          producto_id: string
        }
        Update: {
          alicuota_iva?: number
          cantidad?: number
          creado_en?: string
          factura_id?: string
          id?: string
          importe_neto?: number
          precio_unitario?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factura_renglones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_renglones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_facturas_pendientes_cobro"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      facturas: {
        Row: {
          alicuotas: Json
          ambiente: Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
          cae: string | null
          cae_vencimiento: string | null
          cliente_id: string
          codigo_arca: number
          comprobante: string
          creado_en: string
          cuit_emisor: string
          emitida_por: string
          estado: Database["comercial"]["Enums"]["estado_factura_enum"]
          factura_asociada_id: string | null
          fecha: string
          id: string
          importe_iva: number
          importe_neto: number
          importe_total: number
          motivo: string | null
          motivo_rechazo: string | null
          numero: number | null
          pedido_id: string
          punto_venta: number
          receptor_condicion_iva: number
          receptor_doc_numero: string
          receptor_doc_tipo: number
          respuesta_arca: Json | null
          resuelta_en: string | null
          solicitud_arca: Json | null
          tipo: string
        }
        Insert: {
          alicuotas: Json
          ambiente: Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
          cae?: string | null
          cae_vencimiento?: string | null
          cliente_id: string
          codigo_arca: number
          comprobante?: string
          creado_en?: string
          cuit_emisor: string
          emitida_por?: string
          estado?: Database["comercial"]["Enums"]["estado_factura_enum"]
          factura_asociada_id?: string | null
          fecha?: string
          id?: string
          importe_iva: number
          importe_neto: number
          importe_total: number
          motivo?: string | null
          motivo_rechazo?: string | null
          numero?: number | null
          pedido_id: string
          punto_venta: number
          receptor_condicion_iva: number
          receptor_doc_numero: string
          receptor_doc_tipo: number
          respuesta_arca?: Json | null
          resuelta_en?: string | null
          solicitud_arca?: Json | null
          tipo: string
        }
        Update: {
          alicuotas?: Json
          ambiente?: Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
          cae?: string | null
          cae_vencimiento?: string | null
          cliente_id?: string
          codigo_arca?: number
          comprobante?: string
          creado_en?: string
          cuit_emisor?: string
          emitida_por?: string
          estado?: Database["comercial"]["Enums"]["estado_factura_enum"]
          factura_asociada_id?: string | null
          fecha?: string
          id?: string
          importe_iva?: number
          importe_neto?: number
          importe_total?: number
          motivo?: string | null
          motivo_rechazo?: string | null
          numero?: number | null
          pedido_id?: string
          punto_venta?: number
          receptor_condicion_iva?: number
          receptor_doc_numero?: string
          receptor_doc_tipo?: number
          respuesta_arca?: Json | null
          resuelta_en?: string | null
          solicitud_arca?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_factura_asociada_id_fkey"
            columns: ["factura_asociada_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_factura_asociada_id_fkey"
            columns: ["factura_asociada_id"]
            isOneToOne: false
            referencedRelation: "v_facturas_pendientes_cobro"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      fotos_costo_producto: {
        Row: {
          acondicionamiento: number | null
          costo_unitario: number | null
          detalle: Json
          faltantes: number
          formula_estado: string | null
          granel: number | null
          id: string
          mano_de_obra: number | null
          mes: string
          producto_id: string
          tomada_en: string
          tomada_por: string | null
        }
        Insert: {
          acondicionamiento?: number | null
          costo_unitario?: number | null
          detalle: Json
          faltantes: number
          formula_estado?: string | null
          granel?: number | null
          id?: string
          mano_de_obra?: number | null
          mes: string
          producto_id: string
          tomada_en?: string
          tomada_por?: string | null
        }
        Update: {
          acondicionamiento?: number | null
          costo_unitario?: number | null
          detalle?: Json
          faltantes?: number
          formula_estado?: string | null
          granel?: number | null
          id?: string
          mano_de_obra?: number | null
          mes?: string
          producto_id?: string
          tomada_en?: string
          tomada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_costo_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_costo_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_costo_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      fotos_pedido: {
        Row: {
          aprobada_en: string
          aprobada_por: string
          descuento_aplicado: number
          fecha_comprometida: string
          fecha_entrega_pedida: string | null
          fecha_pedido_cliente: string
          id: string
          orden: number
          pedido_id: string
          propuesta_id: string
          vendedor_id: string
        }
        Insert: {
          aprobada_en?: string
          aprobada_por?: string
          descuento_aplicado: number
          fecha_comprometida: string
          fecha_entrega_pedida?: string | null
          fecha_pedido_cliente: string
          id?: string
          orden?: never
          pedido_id: string
          propuesta_id: string
          vendedor_id: string
        }
        Update: {
          aprobada_en?: string
          aprobada_por?: string
          descuento_aplicado?: number
          fecha_comprometida?: string
          fecha_entrega_pedida?: string | null
          fecha_pedido_cliente?: string
          id?: string
          orden?: never
          pedido_id?: string
          propuesta_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotos_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "fotos_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "fotos_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "fotos_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "fotos_pedido_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas_fecha"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos_pedido_renglones: {
        Row: {
          alicuota_iva: number
          cantidad: number
          foto_id: string
          id: string
          importe: number | null
          importe_lista: number | null
          precio_base: number | null
          precio_final: number | null
          precio_manual: boolean
          precio_unitario: number | null
          producto_id: string
          renglon_id: string
        }
        Insert: {
          alicuota_iva: number
          cantidad: number
          foto_id: string
          id?: string
          importe?: number | null
          importe_lista?: number | null
          precio_base?: number | null
          precio_final?: number | null
          precio_manual: boolean
          precio_unitario?: number | null
          producto_id: string
          renglon_id: string
        }
        Update: {
          alicuota_iva?: number
          cantidad?: number
          foto_id?: string
          id?: string
          importe?: number | null
          importe_lista?: number | null
          precio_base?: number | null
          precio_final?: number | null
          precio_manual?: boolean
          precio_unitario?: number | null
          producto_id?: string
          renglon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotos_pedido_renglones_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: false
            referencedRelation: "fotos_pedido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_pedido_renglones_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["foto_id"]
          },
          {
            foreignKeyName: "fotos_pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_pedido_renglones_renglon_id_fkey"
            columns: ["renglon_id"]
            isOneToOne: false
            referencedRelation: "pedido_renglones"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          alicuota_iva: number | null
          cargado_en: string
          cargado_por: string
          categoria_id: string
          comprobante_url: string | null
          descripcion: string
          fecha: string
          id: string
          importe: number
          importe_neto_ars: number | null
          incluye_iva: boolean | null
          mes: string
          moneda: string
          motivo: string | null
          rectifica_a: string | null
          tipo_cambio: number
          tipo_comprobante: Database["comercial"]["Enums"]["comprobante_costo_enum"]
          vida_util_meses: number | null
        }
        Insert: {
          alicuota_iva?: number | null
          cargado_en?: string
          cargado_por?: string
          categoria_id: string
          comprobante_url?: string | null
          descripcion: string
          fecha?: string
          id?: string
          importe: number
          importe_neto_ars?: number | null
          incluye_iva?: boolean | null
          mes: string
          moneda?: string
          motivo?: string | null
          rectifica_a?: string | null
          tipo_cambio?: number
          tipo_comprobante: Database["comercial"]["Enums"]["comprobante_costo_enum"]
          vida_util_meses?: number | null
        }
        Update: {
          alicuota_iva?: number | null
          cargado_en?: string
          cargado_por?: string
          categoria_id?: string
          comprobante_url?: string | null
          descripcion?: string
          fecha?: string
          id?: string
          importe?: number
          importe_neto_ars?: number | null
          incluye_iva?: boolean | null
          mes?: string
          moneda?: string
          motivo?: string | null
          rectifica_a?: string | null
          tipo_cambio?: number
          tipo_comprobante?: Database["comercial"]["Enums"]["comprobante_costo_enum"]
          vida_util_meses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_amortizaciones"
            referencedColumns: ["gasto_id"]
          },
          {
            foreignKeyName: "gastos_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      importaciones: {
        Row: {
          archivo: string
          datos: Json
          filas: number
          hash_archivo: string
          id: string
          importado_en: string
          importado_por: string
          plantilla: string
        }
        Insert: {
          archivo: string
          datos: Json
          filas: number
          hash_archivo: string
          id?: string
          importado_en?: string
          importado_por?: string
          plantilla: string
        }
        Update: {
          archivo?: string
          datos?: Json
          filas?: number
          hash_archivo?: string
          id?: string
          importado_en?: string
          importado_por?: string
          plantilla?: string
        }
        Relationships: []
      }
      imputaciones_cobro: {
        Row: {
          cobro_id: string
          factura_id: string
          id: string
          importe: number
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          cobro_id: string
          factura_id: string
          id?: string
          importe: number
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          cobro_id?: string
          factura_id?: string
          id?: string
          importe?: number
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "imputaciones_cobro_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imputaciones_cobro_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imputaciones_cobro_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_facturas_pendientes_cobro"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      imputaciones_pago: {
        Row: {
          comprobante_id: string
          id: string
          importe: number
          pago_id: string
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          comprobante_id: string
          id?: string
          importe: number
          pago_id: string
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          comprobante_id?: string
          id?: string
          importe?: number
          pago_id?: string
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "imputaciones_pago_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imputaciones_pago_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_proveedor_pendientes"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "imputaciones_pago_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos_proveedor"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_mayorista: {
        Row: {
          alicuota_iva: number
          cargado_en: string
          cargado_por: string
          es_regalo: boolean
          id: string
          minimo: number | null
          numero_lista: string
          orden: number
          orden_lista: number | null
          origen: string | null
          precio_lista: number
          precio_promo: number
          producto_id: string
          rubro: string | null
          unidades_pack: number
        }
        Insert: {
          alicuota_iva?: number
          cargado_en?: string
          cargado_por?: string
          es_regalo?: boolean
          id?: string
          minimo?: number | null
          numero_lista: string
          orden?: never
          orden_lista?: number | null
          origen?: string | null
          precio_lista: number
          precio_promo: number
          producto_id: string
          rubro?: string | null
          unidades_pack?: number
        }
        Update: {
          alicuota_iva?: number
          cargado_en?: string
          cargado_por?: string
          es_regalo?: boolean
          id?: string
          minimo?: number | null
          numero_lista?: string
          orden?: never
          orden_lista?: number | null
          origen?: string | null
          precio_lista?: number
          precio_promo?: number
          producto_id?: string
          rubro?: string | null
          unidades_pack?: number
        }
        Relationships: [
          {
            foreignKeyName: "lista_mayorista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lista_mayorista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lista_mayorista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      metas_stock_seguridad: {
        Row: {
          creado_en: string
          creado_por: string
          id: string
          motivo: string | null
          orden: number
          sku_id: string
          ss_meta: number
        }
        Insert: {
          creado_en?: string
          creado_por?: string
          id?: string
          motivo?: string | null
          orden?: never
          sku_id: string
          ss_meta: number
        }
        Update: {
          creado_en?: string
          creado_por?: string
          id?: string
          motivo?: string | null
          orden?: never
          sku_id?: string
          ss_meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_stock_seguridad_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "stock_seguridad_sku"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_stock_seguridad_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "v_stock_seguridad"
            referencedColumns: ["sku_id"]
          },
        ]
      }
      minutos_producto: {
        Row: {
          cargado_en: string
          cargado_por: string
          id: string
          minutos_por_unidad: number
          motivo: string | null
          orden: number
          producto_id: string
        }
        Insert: {
          cargado_en?: string
          cargado_por?: string
          id?: string
          minutos_por_unidad: number
          motivo?: string | null
          orden?: never
          producto_id: string
        }
        Update: {
          cargado_en?: string
          cargado_por?: string
          id?: string
          minutos_por_unidad?: number
          motivo?: string | null
          orden?: never
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "minutos_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "minutos_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "minutos_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      movimientos_fondos: {
        Row: {
          anula_a_id: string | null
          cobro_id: string | null
          comprobante: string | null
          concepto: string
          contraparte: string | null
          cuenta_id: string
          fecha: string
          id: string
          importe: number
          orden: number
          pago_id: string | null
          registrado_en: string
          registrado_por: string
          solicitud_id: string | null
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_fondos_enum"]
          transferencia_grupo: string | null
        }
        Insert: {
          anula_a_id?: string | null
          cobro_id?: string | null
          comprobante?: string | null
          concepto: string
          contraparte?: string | null
          cuenta_id: string
          fecha?: string
          id?: string
          importe: number
          orden?: never
          pago_id?: string | null
          registrado_en?: string
          registrado_por?: string
          solicitud_id?: string | null
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_fondos_enum"]
          transferencia_grupo?: string | null
        }
        Update: {
          anula_a_id?: string | null
          cobro_id?: string | null
          comprobante?: string | null
          concepto?: string
          contraparte?: string | null
          cuenta_id?: string
          fecha?: string
          id?: string
          importe?: number
          orden?: never
          pago_id?: string | null
          registrado_en?: string
          registrado_por?: string
          solicitud_id?: string | null
          tipo?: Database["comercial"]["Enums"]["tipo_movimiento_fondos_enum"]
          transferencia_grupo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_fondos_anula_a_id_fkey"
            columns: ["anula_a_id"]
            isOneToOne: true
            referencedRelation: "movimientos_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_fondos_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_fondos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_fondos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_fondos"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "movimientos_fondos_pago_fk"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_fondos_solicitud_fk"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_pt: {
        Row: {
          anula_a_movimiento_id: string | null
          cantidad: number
          deposito_id: string
          despacho_id: string | null
          documento_id: string | null
          documento_tipo: string | null
          id: string
          lote_texto: string | null
          motivo: string | null
          ocurrido_en: string
          orden: number
          orden_id: string | null
          producto_id: string
          registrado_por: string
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
        }
        Insert: {
          anula_a_movimiento_id?: string | null
          cantidad: number
          deposito_id: string
          despacho_id?: string | null
          documento_id?: string | null
          documento_tipo?: string | null
          id?: string
          lote_texto?: string | null
          motivo?: string | null
          ocurrido_en?: string
          orden?: never
          orden_id?: string | null
          producto_id: string
          registrado_por?: string
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
        }
        Update: {
          anula_a_movimiento_id?: string | null
          cantidad?: number
          deposito_id?: string
          despacho_id?: string | null
          documento_id?: string | null
          documento_tipo?: string | null
          id?: string
          lote_texto?: string | null
          motivo?: string | null
          ocurrido_en?: string
          orden?: never
          orden_id?: string | null
          producto_id?: string
          registrado_por?: string
          tipo?: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_pt_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_pt_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos_pt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      movimientos_stock: {
        Row: {
          anula_a_movimiento_id: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          investigacion_id: string | null
          lote_insumo_id: string
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string
          orden: number
          periodo: string | null
          registrado_por: string
          requiere_investigacion: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id: string | null
          unidad: string
        }
        Insert: {
          anula_a_movimiento_id?: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id?: string | null
          documento_tipo?: string | null
          id?: string
          investigacion_id?: string | null
          lote_insumo_id: string
          motivo?: string | null
          motivo_tipo?:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en?: string
          orden?: never
          periodo?: string | null
          registrado_por?: string
          requiere_investigacion?: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id?: string | null
          unidad?: string
        }
        Update: {
          anula_a_movimiento_id?: string | null
          articulo_id?: string
          cantidad?: number
          deposito_id?: string
          documento_id?: string | null
          documento_tipo?: string | null
          id?: string
          investigacion_id?: string | null
          lote_insumo_id?: string
          motivo?: string | null
          motivo_tipo?:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en?: string
          orden?: never
          periodo?: string | null
          registrado_por?: string
          requiere_investigacion?: boolean
          tipo?: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id?: string | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "v_ajustes_a_investigar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "v_kardex"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["articulo_id"]
          },
        ]
      }
      pagos_proveedor: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          cuenta_id: string
          fecha: string
          id: string
          importe: number
          medio: Database["comercial"]["Enums"]["medio_pago_enum"]
          motivo_anulacion: string | null
          observacion: string | null
          proveedor_id: string
          referencia: string | null
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          cuenta_id: string
          fecha?: string
          id?: string
          importe: number
          medio: Database["comercial"]["Enums"]["medio_pago_enum"]
          motivo_anulacion?: string | null
          observacion?: string | null
          proveedor_id: string
          referencia?: string | null
          registrado_en?: string
          registrado_por?: string
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          cuenta_id?: string
          fecha?: string
          id?: string
          importe?: number
          medio?: Database["comercial"]["Enums"]["medio_pago_enum"]
          motivo_anulacion?: string | null
          observacion?: string | null
          proveedor_id?: string
          referencia?: string | null
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_proveedor_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_proveedor_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_fondos"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "pagos_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "pagos_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      parametros_costo: {
        Row: {
          cargado_en: string
          cargado_por: string
          corte_a: number | null
          corte_apertura: string | null
          corte_b: number | null
          costo_hora: number | null
          id: string
          margen_minimo: number | null
          motivo: string | null
          orden: number
          serie_tipo_cambio: string | null
          umbral_variacion: number | null
          vigencia_cotizacion_dias: number | null
        }
        Insert: {
          cargado_en?: string
          cargado_por?: string
          corte_a?: number | null
          corte_apertura?: string | null
          corte_b?: number | null
          costo_hora?: number | null
          id?: string
          margen_minimo?: number | null
          motivo?: string | null
          orden?: never
          serie_tipo_cambio?: string | null
          umbral_variacion?: number | null
          vigencia_cotizacion_dias?: number | null
        }
        Update: {
          cargado_en?: string
          cargado_por?: string
          corte_a?: number | null
          corte_apertura?: string | null
          corte_b?: number | null
          costo_hora?: number | null
          id?: string
          margen_minimo?: number | null
          motivo?: string | null
          orden?: never
          serie_tipo_cambio?: string | null
          umbral_variacion?: number | null
          vigencia_cotizacion_dias?: number | null
        }
        Relationships: []
      }
      pedido_consumos: {
        Row: {
          cantidad_real: number
          cantidad_teorica: number
          id: string
          insumo_id: string
          motivo_diferencia: string | null
          pedido_id: string
          registrado_en: string
          registrado_por: string
          tercero_id: string | null
          unidad: string
        }
        Insert: {
          cantidad_real: number
          cantidad_teorica: number
          id?: string
          insumo_id: string
          motivo_diferencia?: string | null
          pedido_id: string
          registrado_en?: string
          registrado_por?: string
          tercero_id?: string | null
          unidad: string
        }
        Update: {
          cantidad_real?: number
          cantidad_teorica?: number
          id?: string
          insumo_id?: string
          motivo_diferencia?: string | null
          pedido_id?: string
          registrado_en?: string
          registrado_por?: string
          tercero_id?: string | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "pedido_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_etiquetados: {
        Row: {
          cantidad: number
          creado_en: string
          etiquetado_id: string
          id: string
          pedido_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          creado_en?: string
          etiquetado_id: string
          id?: string
          pedido_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          creado_en?: string
          etiquetado_id?: string
          id?: string
          pedido_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_etiquetados_etiquetado_id_fkey"
            columns: ["etiquetado_id"]
            isOneToOne: false
            referencedRelation: "etiquetados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_etiquetado_id_fkey"
            columns: ["etiquetado_id"]
            isOneToOne: false
            referencedRelation: "v_etiquetados_saldo"
            referencedColumns: ["etiquetado_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      pedido_ordenes: {
        Row: {
          creado_en: string
          creado_por: string
          id: string
          orden_id: string
          pedido_id: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string
          id?: string
          orden_id: string
          pedido_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          id?: string
          orden_id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_ordenes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_ordenes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_ordenes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_ordenes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_ordenes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "pedido_ordenes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_origen_insumos: {
        Row: {
          elegido_en: string
          elegido_por: string
          id: string
          insumo_id: string
          pedido_id: string
          tercero_id: string | null
        }
        Insert: {
          elegido_en?: string
          elegido_por?: string
          id?: string
          insumo_id: string
          pedido_id: string
          tercero_id?: string | null
        }
        Update: {
          elegido_en?: string
          elegido_por?: string
          id?: string
          insumo_id?: string
          pedido_id?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_origen_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "pedido_origen_insumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_renglones: {
        Row: {
          a_producir: number | null
          alicuota_iva: number
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          cantidad: number
          de_calle5: number | null
          id: string
          pedido_id: string
          precio_base: number | null
          precio_final: number | null
          precio_manual: boolean
          precio_unitario: number | null
          producto_id: string
        }
        Insert: {
          a_producir?: number | null
          alicuota_iva?: number
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cantidad: number
          de_calle5?: number | null
          id?: string
          pedido_id: string
          precio_base?: number | null
          precio_final?: number | null
          precio_manual?: boolean
          precio_unitario?: number | null
          producto_id: string
        }
        Update: {
          a_producir?: number | null
          alicuota_iva?: number
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cantidad?: number
          de_calle5?: number | null
          id?: string
          pedido_id?: string
          precio_base?: number | null
          precio_final?: number | null
          precio_manual?: boolean
          precio_unitario?: number | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_renglones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_renglones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_renglones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_renglones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_renglones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "pedido_renglones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cliente: string
          cliente_id: string | null
          creado_en: string
          creado_por: string
          deposito_origen_id: string | null
          descuento_pct: number | null
          destino_deposito_id: string | null
          destino_envio: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          entregado_en: string | null
          entregado_por: string | null
          es_venta: boolean
          estado: Database["comercial"]["Enums"]["estado_pedido_enum"]
          estado_pago: string
          fecha: string
          fecha_entrega: string | null
          forma_pago: string | null
          gestionado_por: string | null
          id: string
          motivo_eliminacion: string | null
          numero: string
          observaciones: string | null
          para_pedido_id: string | null
          para_stock: boolean
          plan_dias: number | null
          plan_inicio: string | null
          reservar_calle5: boolean
          stock_nota: string | null
          stock_ok: boolean | null
          stock_ok_en: string | null
          stock_ok_por: string | null
          tercero_id: string | null
        }
        Insert: {
          cliente: string
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string
          deposito_origen_id?: string | null
          descuento_pct?: number | null
          destino_deposito_id?: string | null
          destino_envio?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          entregado_en?: string | null
          entregado_por?: string | null
          es_venta?: boolean
          estado?: Database["comercial"]["Enums"]["estado_pedido_enum"]
          estado_pago?: string
          fecha?: string
          fecha_entrega?: string | null
          forma_pago?: string | null
          gestionado_por?: string | null
          id?: string
          motivo_eliminacion?: string | null
          numero: string
          observaciones?: string | null
          para_pedido_id?: string | null
          para_stock?: boolean
          plan_dias?: number | null
          plan_inicio?: string | null
          reservar_calle5?: boolean
          stock_nota?: string | null
          stock_ok?: boolean | null
          stock_ok_en?: string | null
          stock_ok_por?: string | null
          tercero_id?: string | null
        }
        Update: {
          cliente?: string
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string
          deposito_origen_id?: string | null
          descuento_pct?: number | null
          destino_deposito_id?: string | null
          destino_envio?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          entregado_en?: string | null
          entregado_por?: string | null
          es_venta?: boolean
          estado?: Database["comercial"]["Enums"]["estado_pedido_enum"]
          estado_pago?: string
          fecha?: string
          fecha_entrega?: string | null
          forma_pago?: string | null
          gestionado_por?: string | null
          id?: string
          motivo_eliminacion?: string | null
          numero?: string
          observaciones?: string | null
          para_pedido_id?: string | null
          para_stock?: boolean
          plan_dias?: number | null
          plan_inicio?: string | null
          reservar_calle5?: boolean
          stock_nota?: string | null
          stock_ok?: boolean | null
          stock_ok_en?: string | null
          stock_ok_por?: string | null
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_para_pedido_id_fkey"
            columns: ["para_pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_para_pedido_id_fkey"
            columns: ["para_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_para_pedido_id_fkey"
            columns: ["para_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_para_pedido_id_fkey"
            columns: ["para_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_para_pedido_id_fkey"
            columns: ["para_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "pedidos_para_pedido_id_fkey"
            columns: ["para_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      precios_producto: {
        Row: {
          alicuota_iva: number
          cargado_en: string
          cargado_por: string
          id: string
          motivo: string | null
          orden: number
          origen: string | null
          precio_lista: number
          producto_id: string
        }
        Insert: {
          alicuota_iva?: number
          cargado_en?: string
          cargado_por?: string
          id?: string
          motivo?: string | null
          orden?: never
          origen?: string | null
          precio_lista: number
          producto_id: string
        }
        Update: {
          alicuota_iva?: number
          cargado_en?: string
          cargado_por?: string
          id?: string
          motivo?: string | null
          orden?: never
          origen?: string | null
          precio_lista?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      propuestas_fecha: {
        Row: {
          fecha_pedido: string
          id: string
          nota: string | null
          orden: number
          pedido_id: string
          propuesta_en: string
          propuesta_por: string
        }
        Insert: {
          fecha_pedido: string
          id?: string
          nota?: string | null
          orden?: never
          pedido_id: string
          propuesta_en?: string
          propuesta_por?: string
        }
        Update: {
          fecha_pedido?: string
          id?: string
          nota?: string | null
          orden?: never
          pedido_id?: string
          propuesta_en?: string
          propuesta_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_fecha_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_fecha_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "propuestas_fecha_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "propuestas_fecha_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_fecha_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "propuestas_fecha_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      propuestas_fecha_renglones: {
        Row: {
          fecha: string
          id: string
          propuesta_id: string
          renglon_id: string
        }
        Insert: {
          fecha: string
          id?: string
          propuesta_id: string
          renglon_id: string
        }
        Update: {
          fecha?: string
          id?: string
          propuesta_id?: string
          renglon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_fecha_renglones_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas_fecha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_fecha_renglones_renglon_id_fkey"
            columns: ["renglon_id"]
            isOneToOne: false
            referencedRelation: "pedido_renglones"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas_pt: {
        Row: {
          cantidad: number
          cliente_id: string | null
          consumido: number
          creado_en: string
          creado_por: string
          deposito_id: string
          id: string
          liberada: boolean
          liberada_en: string | null
          liberada_por: string | null
          motivo_liberacion: string | null
          observacion: string | null
          pedido_id: string | null
          producto_id: string
        }
        Insert: {
          cantidad: number
          cliente_id?: string | null
          consumido?: number
          creado_en?: string
          creado_por?: string
          deposito_id: string
          id?: string
          liberada?: boolean
          liberada_en?: string | null
          liberada_por?: string | null
          motivo_liberacion?: string | null
          observacion?: string | null
          pedido_id?: string | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          cliente_id?: string | null
          consumido?: number
          creado_en?: string
          creado_por?: string
          deposito_id?: string
          id?: string
          liberada?: boolean
          liberada_en?: string | null
          liberada_por?: string | null
          motivo_liberacion?: string | null
          observacion?: string | null
          pedido_id?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_pt_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_pt_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "reservas_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "reservas_pt_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "reservas_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "reservas_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      reservas_stock: {
        Row: {
          cantidad: number
          consumido: number
          creado_en: string
          creado_por: string
          id: string
          insumo_id: string
          liberada: boolean
          liberada_en: string | null
          liberada_por: string | null
          motivo: string | null
          para_tercero_id: string | null
          pedido_id: string | null
          tercero_id: string | null
          unidad: string
          vence_en: string
        }
        Insert: {
          cantidad: number
          consumido?: number
          creado_en?: string
          creado_por?: string
          id?: string
          insumo_id: string
          liberada?: boolean
          liberada_en?: string | null
          liberada_por?: string | null
          motivo?: string | null
          para_tercero_id?: string | null
          pedido_id?: string | null
          tercero_id?: string | null
          unidad: string
          vence_en?: string
        }
        Update: {
          cantidad?: number
          consumido?: number
          creado_en?: string
          creado_por?: string
          id?: string
          insumo_id?: string
          liberada?: boolean
          liberada_en?: string | null
          liberada_por?: string | null
          motivo?: string | null
          para_tercero_id?: string | null
          pedido_id?: string | null
          tercero_id?: string | null
          unidad?: string
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      series_macro: {
        Row: {
          cargado_en: string
          cargado_por: string
          es_provisorio: boolean
          fuente: string
          id: string
          mes: string
          serie: Database["comercial"]["Enums"]["serie_macro_enum"]
          valor: number
        }
        Insert: {
          cargado_en?: string
          cargado_por?: string
          es_provisorio?: boolean
          fuente: string
          id?: string
          mes: string
          serie: Database["comercial"]["Enums"]["serie_macro_enum"]
          valor: number
        }
        Update: {
          cargado_en?: string
          cargado_por?: string
          es_provisorio?: boolean
          fuente?: string
          id?: string
          mes?: string
          serie?: Database["comercial"]["Enums"]["serie_macro_enum"]
          valor?: number
        }
        Relationships: []
      }
      solicitudes_catalogo: {
        Row: {
          atendida_en: string | null
          atendida_por: string | null
          cotizacion_linea_id: string
          creado_en: string
          creado_por: string
          detalle: string | null
          estado: string
          id: string
          nombre: string
          respuesta: string | null
        }
        Insert: {
          atendida_en?: string | null
          atendida_por?: string | null
          cotizacion_linea_id: string
          creado_en?: string
          creado_por?: string
          detalle?: string | null
          estado?: string
          id?: string
          nombre: string
          respuesta?: string | null
        }
        Update: {
          atendida_en?: string | null
          atendida_por?: string | null
          cotizacion_linea_id?: string
          creado_en?: string
          creado_por?: string
          detalle?: string | null
          estado?: string
          id?: string
          nombre?: string
          respuesta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_catalogo_cotizacion_linea_id_fkey"
            columns: ["cotizacion_linea_id"]
            isOneToOne: false
            referencedRelation: "cotizacion_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_pago: {
        Row: {
          area: Database["core"]["Enums"]["sector_enum"]
          comprobante_id: string | null
          concepto: string
          creado_en: string
          destinatario: string
          estado: Database["comercial"]["Enums"]["estado_solicitud_pago_enum"]
          id: string
          importe: number
          medio_pago: Database["comercial"]["Enums"]["medio_pago_enum"] | null
          motivo: string | null
          movimiento_id: string | null
          pago_id: string | null
          proveedor_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          solicitante: string
          vencimiento: string | null
        }
        Insert: {
          area: Database["core"]["Enums"]["sector_enum"]
          comprobante_id?: string | null
          concepto: string
          creado_en?: string
          destinatario: string
          estado?: Database["comercial"]["Enums"]["estado_solicitud_pago_enum"]
          id?: string
          importe: number
          medio_pago?: Database["comercial"]["Enums"]["medio_pago_enum"] | null
          motivo?: string | null
          movimiento_id?: string | null
          pago_id?: string | null
          proveedor_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          solicitante?: string
          vencimiento?: string | null
        }
        Update: {
          area?: Database["core"]["Enums"]["sector_enum"]
          comprobante_id?: string | null
          concepto?: string
          creado_en?: string
          destinatario?: string
          estado?: Database["comercial"]["Enums"]["estado_solicitud_pago_enum"]
          id?: string
          importe?: number
          medio_pago?: Database["comercial"]["Enums"]["medio_pago_enum"] | null
          motivo?: string | null
          movimiento_id?: string | null
          pago_id?: string | null
          proveedor_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          solicitante?: string
          vencimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_pago_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_pago_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_comprobantes_proveedor_pendientes"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "solicitudes_pago_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_pago_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_pago_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "solicitudes_pago_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      stock_seguridad_sku: {
        Row: {
          aplica_stock: boolean
          clase_demanda: string | null
          cobertura_ss_dh: number | null
          creado_en: string
          demanda_lead_time: number
          descripcion: string
          estado_demanda: string | null
          id: string
          incluye_produccion: boolean
          lead_time_dh: number | null
          mu_mensual: number | null
          origen: string | null
          producto_id: string | null
          rop_planilla: number
          sigma_mensual: number | null
          sku_cod: string
          ss_planilla: number
        }
        Insert: {
          aplica_stock: boolean
          clase_demanda?: string | null
          cobertura_ss_dh?: number | null
          creado_en?: string
          demanda_lead_time?: number
          descripcion: string
          estado_demanda?: string | null
          id?: string
          incluye_produccion: boolean
          lead_time_dh?: number | null
          mu_mensual?: number | null
          origen?: string | null
          producto_id?: string | null
          rop_planilla?: number
          sigma_mensual?: number | null
          sku_cod: string
          ss_planilla?: number
        }
        Update: {
          aplica_stock?: boolean
          clase_demanda?: string | null
          cobertura_ss_dh?: number | null
          creado_en?: string
          demanda_lead_time?: number
          descripcion?: string
          estado_demanda?: string | null
          id?: string
          incluye_produccion?: boolean
          lead_time_dh?: number | null
          mu_mensual?: number | null
          origen?: string | null
          producto_id?: string | null
          rop_planilla?: number
          sigma_mensual?: number | null
          sku_cod?: string
          ss_planilla?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_seguridad_sku_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_seguridad_sku_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_seguridad_sku_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      tareas_equipo: {
        Row: {
          archivada: boolean
          compartida: boolean
          creada_en: string
          creada_por: string
          detalle: string | null
          hecha_en: string | null
          hecha_por: string | null
          id: string
          movida_en: string | null
          movida_por: string | null
          pos_x: number
          pos_y: number
          titulo: string
        }
        Insert: {
          archivada?: boolean
          compartida?: boolean
          creada_en?: string
          creada_por?: string
          detalle?: string | null
          hecha_en?: string | null
          hecha_por?: string | null
          id?: string
          movida_en?: string | null
          movida_por?: string | null
          pos_x?: number
          pos_y?: number
          titulo: string
        }
        Update: {
          archivada?: boolean
          compartida?: boolean
          creada_en?: string
          creada_por?: string
          detalle?: string | null
          hecha_en?: string | null
          hecha_por?: string | null
          id?: string
          movida_en?: string | null
          movida_por?: string | null
          pos_x?: number
          pos_y?: number
          titulo?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_ajustes_a_investigar: {
        Row: {
          cantidad: number | null
          codigo_interno: string | null
          deposito: string | null
          id: string | null
          insumo: string | null
          investigacion_id: string | null
          lote: string | null
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string | null
          registro: string | null
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"] | null
          unidad: string | null
        }
        Relationships: []
      }
      v_alertas_precio: {
        Row: {
          alerta: string | null
          banda: string | null
          codigo_interno: string | null
          costo_incompleto: boolean | null
          costo_unitario: number | null
          margen_pct: number | null
          mes_costo: string | null
          precio_neto: number | null
          producto: string | null
          producto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_costo_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_costo_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "fotos_costo_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_amortizaciones: {
        Row: {
          categoria: string | null
          cuota: number | null
          descripcion: string | null
          gasto_id: string | null
          mes: string | null
        }
        Relationships: []
      }
      v_calle5: {
        Row: {
          codigo_interno: string | null
          comprometido_fabrica: number | null
          en_calle5: number | null
          en_fabrica: number | null
          en_produccion: number | null
          falta_producir: number | null
          libre: number | null
          pedidos: number | null
          pendiente: number | null
          producto: string | null
          producto_id: string | null
          reservado: number | null
        }
        Relationships: []
      }
      v_calle5_tomado_ventas: {
        Row: {
          pedido_id: string | null
          producto_id: string | null
          tomado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_cash_flow_proyectado: {
        Row: {
          detalle: string | null
          fecha: string | null
          importe: number | null
          origen_id: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_cash_flow_real: {
        Row: {
          cuenta: string | null
          cuenta_id: string | null
          de_tercero: boolean | null
          egresos: number | null
          ingresos: number | null
          neto: number | null
          periodo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_fondos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_fondos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_fondos"
            referencedColumns: ["cuenta_id"]
          },
        ]
      }
      v_compras_trazadas: {
        Row: {
          aviso_id: string | null
          cantidad: number | null
          codigo_interno: string | null
          comprobante_id: string | null
          comprobante_tipo:
            | Database["comercial"]["Enums"]["tipo_comprobante_proveedor_enum"]
            | null
          estado: Database["comercial"]["Enums"]["estado_aviso_enum"] | null
          importe_total: number | null
          insumo: string | null
          insumo_id: string | null
          pedida_en: string | null
          pedido_id: string | null
          pendiente: number | null
          proveedor: string | null
          proveedor_id: string | null
          recepcion_id: string | null
          recepcion_numero: string | null
          recibida_en: string | null
          situacion: string | null
          unidad: string | null
        }
        Relationships: []
      }
      v_comprobantes_proveedor_pendientes: {
        Row: {
          comprobante_id: string | null
          fecha: string | null
          importe_total: number | null
          imputado: number | null
          notas_credito: number | null
          numero: number | null
          pendiente: number | null
          proveedor_id: string | null
          punto_venta: number | null
          recepcion_id: string | null
          tipo:
            | Database["comercial"]["Enums"]["tipo_comprobante_proveedor_enum"]
            | null
          vencimiento_pago: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_conciliacion_recepcion"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "comprobantes_proveedor_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_recepciones_sin_comprobante"
            referencedColumns: ["recepcion_id"]
          },
        ]
      }
      v_conciliacion_recepcion: {
        Row: {
          comprobantes: number | null
          con_aviso: boolean | null
          diferencia: number | null
          fecha: string | null
          lotes: number | null
          lotes_con_costo: number | null
          neto_comprobantes: number | null
          neto_lotes: number | null
          proveedor_id: string | null
          recepcion: string | null
          recepcion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      v_costo_producto: {
        Row: {
          acondicionamiento: number | null
          codigo_interno: string | null
          componentes_costeados: number | null
          contenido_neto: number | null
          costo_planilla: number | null
          costo_unitario: number | null
          costo_vigente: number | null
          faltantes: number | null
          formula_estado:
            | Database["gmp"]["Enums"]["estado_documento_enum"]
            | null
          formula_version: string | null
          fuente_costo: string | null
          granel: number | null
          mano_de_obra: number | null
          nombre: string | null
          origen: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          planilla_cvd: number | null
          planilla_cvi: number | null
          planilla_fuente: string | null
          planilla_id: string | null
          planilla_mod: number | null
          producto_id: string | null
          unidad_contenido: string | null
        }
        Relationships: []
      }
      v_costo_producto_planilla: {
        Row: {
          cargado_en: string | null
          cargado_por: string | null
          cvd: number | null
          cvi: number | null
          fuente: string | null
          id: string | null
          mod: number | null
          motivo: string | null
          producto_id: string | null
          reemplaza_a: string | null
          total: number | null
          vigente_desde: string | null
        }
        Insert: {
          cargado_en?: string | null
          cargado_por?: string | null
          cvd?: number | null
          cvi?: number | null
          fuente?: string | null
          id?: string | null
          mod?: number | null
          motivo?: string | null
          producto_id?: string | null
          reemplaza_a?: string | null
          total?: number | null
          vigente_desde?: string | null
        }
        Update: {
          cargado_en?: string | null
          cargado_por?: string | null
          cvd?: number | null
          cvi?: number | null
          fuente?: string | null
          id?: string | null
          mod?: number | null
          motivo?: string | null
          producto_id?: string | null
          reemplaza_a?: string | null
          total?: number | null
          vigente_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_producto_planilla_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: true
            referencedRelation: "costos_producto_planilla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: true
            referencedRelation: "v_costo_producto"
            referencedColumns: ["planilla_id"]
          },
          {
            foreignKeyName: "costos_producto_planilla_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: true
            referencedRelation: "v_costo_producto_planilla"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costo_referencia: {
        Row: {
          apertura_fecha: string | null
          codigo_interno: string | null
          costo_apertura: number | null
          costo_manual: number | null
          costo_referencia_id: string | null
          costo_ultimo_lote: number | null
          costo_unitario_ars: number | null
          desactualizado: boolean | null
          fecha: string | null
          insumo_id: string | null
          manual_desde: string | null
          nombre: string | null
          origen: string | null
          pendiente: string | null
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          tipo_cambio_aplicado: number | null
          tipo_cambio_mes: string | null
          ultimo_costo_lote_id: string | null
          ultimo_lote_fecha: string | null
          unidad_medida: string | null
        }
        Relationships: []
      }
      v_costo_ventas_mes: {
        Row: {
          costo_unitario: number | null
          costo_variable: number | null
          facturacion: number | null
          faltantes: number | null
          mano_de_obra: number | null
          mano_de_obra_vendida: number | null
          mes: string | null
          mes_foto: string | null
          producto_id: string | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_costos_lote: {
        Row: {
          accesorios_ars: number | null
          cantidad: number | null
          cantidad_en_unidad_catalogo: number | null
          cargado_en: string | null
          cargado_por: string | null
          codigo_interno: string | null
          fecha_costo: string | null
          fecha_recepcion: string | null
          id: string | null
          importe: number | null
          insumo: string | null
          insumo_id: string | null
          lote_insumo_id: string | null
          moneda: string | null
          origen: Database["comercial"]["Enums"]["origen_costo_enum"] | null
          precio_neto_ars: number | null
          proveedor_id: string | null
          recepcion_id: string | null
          tipo_cambio: number | null
          tipo_cambio_serie_mes: string | null
          tipo_comprobante:
            | Database["comercial"]["Enums"]["comprobante_costo_enum"]
            | null
          unidad: string | null
          unidad_medida: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_conciliacion_recepcion"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "lotes_insumo_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_recepciones_sin_comprobante"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      v_costos_lote_unitario: {
        Row: {
          accesorios_ars: number | null
          cantidad: number | null
          cantidad_en_unidad_catalogo: number | null
          cargado_en: string | null
          cargado_por: string | null
          codigo_interno: string | null
          costo_total_ars: number | null
          costo_unitario_ars: number | null
          fecha_costo: string | null
          fecha_recepcion: string | null
          id: string | null
          importe: number | null
          insumo: string | null
          insumo_id: string | null
          lote_insumo_id: string | null
          moneda: string | null
          origen: Database["comercial"]["Enums"]["origen_costo_enum"] | null
          precio_neto_ars: number | null
          precio_unitario_ars: number | null
          proveedor_id: string | null
          recepcion_id: string | null
          tipo_cambio: number | null
          tipo_comprobante:
            | Database["comercial"]["Enums"]["comprobante_costo_enum"]
            | null
          unidad: string | null
          unidad_medida: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_conciliacion_recepcion"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "lotes_insumo_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_recepciones_sin_comprobante"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      v_costos_pendientes: {
        Row: {
          cantidad: number | null
          codigo_interno: string | null
          detalle: string | null
          fecha_costo: string | null
          importe: number | null
          insumo_id: string | null
          moneda: string | null
          nombre: string | null
          pendiente: string | null
          peso_planilla: string | null
          unidad: string | null
          unidad_medida: string | null
        }
        Relationships: []
      }
      v_cuenta_corriente_clientes: {
        Row: {
          ambiente: string | null
          cliente_id: string | null
          cobro_id: string | null
          debe: number | null
          detalle_tipo: string | null
          factura_id: string | null
          fecha: string | null
          haber: number | null
          momento: string | null
          movimiento: string | null
          referencia: string | null
        }
        Relationships: []
      }
      v_cuenta_corriente_proveedores: {
        Row: {
          comprobante_id: string | null
          debe: number | null
          detalle_tipo: string | null
          fecha: string | null
          haber: number | null
          momento: string | null
          movimiento: string | null
          pago_id: string | null
          proveedor_id: string | null
          referencia: string | null
          vencimiento_pago: string | null
        }
        Relationships: []
      }
      v_descuentos_vigentes: {
        Row: {
          cargado_por: string | null
          cliente: string | null
          cliente_id: string | null
          codigo_interno: string | null
          motivo: string | null
          porcentaje: number | null
          producto: string | null
          producto_id: string | null
          vigente_desde: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descuentos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descuentos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "descuentos_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "descuentos_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "descuentos_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_disponible_calle5: {
        Row: {
          disponible: number | null
          en_calle5: number | null
          producto_id: string | null
          reservado: number | null
          tomado_sin_reservar: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_disponible_por_insumo: {
        Row: {
          codigo_interno: string | null
          disponible: number | null
          insumo_id: string | null
          insumo_nombre: string | null
          reservado: number | null
          saldo: number | null
          saldo_apertura: number | null
        }
        Relationships: []
      }
      v_disponible_pt: {
        Row: {
          deposito: string | null
          deposito_id: string | null
          deposito_numero: string | null
          disponible: number | null
          en_deposito: number | null
          producto_id: string | null
          reservado: number | null
          tomado_sin_reservar: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_escala_descuento: {
        Row: {
          carga: number | null
          cargado_en: string | null
          desde_monto: number | null
          porcentaje: number | null
          vigente_desde: string | null
        }
        Insert: {
          carga?: number | null
          cargado_en?: string | null
          desde_monto?: number | null
          porcentaje?: number | null
          vigente_desde?: string | null
        }
        Update: {
          carga?: number | null
          cargado_en?: string | null
          desde_monto?: number | null
          porcentaje?: number | null
          vigente_desde?: string | null
        }
        Relationships: []
      }
      v_etiquetados_saldo: {
        Row: {
          anulado: boolean | null
          cantidad: number | null
          etiquetado_id: string | null
          fecha: string | null
          producto_id: string | null
          registrado_en: string | null
          saldo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "etiquetados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_existencias: {
        Row: {
          articulo_id: string | null
          codigo_interno: string | null
          color_rotulo: string | null
          deposito_es_exterior: boolean | null
          deposito_id: string | null
          deposito_nombre: string | null
          deposito_numero: string | null
          es_inflamable: boolean | null
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"] | null
          impedimento_despacho: string | null
          insumo_id: string | null
          insumo_nombre: string | null
          insumo_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          lote_insumo_id: string | null
          lote_proveedor: string | null
          movimientos: number | null
          numero_registro_interno: string | null
          plazo_validez: string | null
          saldo: number | null
          sku: string | null
          stock_minimo: number | null
          tercero_id: string | null
          tercero_nombre: string | null
          ultimo_movimiento: string | null
          unidad: string | null
          vence_en_90_dias: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["articulo_id"]
          },
        ]
      }
      v_facturas_pendientes_cobro: {
        Row: {
          acreditado: number | null
          ambiente:
            | Database["comercial"]["Enums"]["ambiente_fiscal_enum"]
            | null
          cliente_id: string | null
          cobrado: number | null
          dias: number | null
          factura_id: string | null
          fecha: string | null
          importe_total: number | null
          numero: number | null
          pedido_id: string | null
          pendiente: number | null
          punto_venta: number | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      v_faltan_etiquetar: {
        Row: {
          codigo_interno: string | null
          definido: boolean | null
          en_stock: number | null
          etiquetados_hoy: number | null
          faltan: number | null
          nombre: string | null
          pendientes: number | null
          producto_id: string | null
        }
        Relationships: []
      }
      v_gastos: {
        Row: {
          alicuota_iva: number | null
          cargado_en: string | null
          cargado_por: string | null
          categoria: string | null
          categoria_id: string | null
          clase: Database["comercial"]["Enums"]["clase_gasto_enum"] | null
          comprobante_url: string | null
          descripcion: string | null
          es_nomina_produccion: boolean | null
          fecha: string | null
          id: string | null
          importe: number | null
          importe_neto_ars: number | null
          incluye_iva: boolean | null
          mes: string | null
          moneda: string | null
          motivo: string | null
          rectifica_a: string | null
          tipo_cambio: number | null
          tipo_comprobante:
            | Database["comercial"]["Enums"]["comprobante_costo_enum"]
            | null
          vida_util_meses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_amortizaciones"
            referencedColumns: ["gasto_id"]
          },
          {
            foreignKeyName: "gastos_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_iva_mensual: {
        Row: {
          compras_sin_factura: number | null
          compras_sin_iva_discriminado: number | null
          credito_fiscal: number | null
          debito_fiscal: number | null
          debito_homologacion: number | null
          neto_compras_a: number | null
          neto_ventas: number | null
          periodo: string | null
          posicion: number | null
        }
        Relationships: []
      }
      v_kardex: {
        Row: {
          anula_a_movimiento_id: string | null
          anulado: boolean | null
          articulo_id: string | null
          cantidad: number | null
          codigo_interno: string | null
          deposito_id: string | null
          deposito_nombre: string | null
          deposito_numero: string | null
          id: string | null
          insumo_nombre: string | null
          lote_insumo_id: string | null
          lote_proveedor: string | null
          motivo: string | null
          numero_registro_interno: string | null
          ocurrido_en: string | null
          orden: number | null
          periodo: string | null
          registrado_por: string | null
          registrado_por_nombre: string | null
          saldo_posterior: number | null
          sku: string | null
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"] | null
          transferencia_id: string | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "v_ajustes_a_investigar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_anula_a_movimiento_id_fkey"
            columns: ["anula_a_movimiento_id"]
            isOneToOne: true
            referencedRelation: "v_kardex"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["articulo_id"]
          },
        ]
      }
      v_lista_mayorista: {
        Row: {
          alicuota_iva: number | null
          codigo_interno: string | null
          es_regalo: boolean | null
          minimo: number | null
          numero_lista: string | null
          orden_lista: number | null
          precio_base: number | null
          precio_lista: number | null
          precio_promo: number | null
          producto: string | null
          producto_id: string | null
          rubro: string | null
          unidades_pack: number | null
          vigente_desde: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_mayorista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lista_mayorista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "lista_mayorista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_parametros_costo: {
        Row: {
          cargado_en: string | null
          cargado_por: string | null
          corte_a: number | null
          corte_apertura: string | null
          corte_b: number | null
          costo_hora: number | null
          margen_minimo: number | null
          serie_tipo_cambio: string | null
          umbral_variacion: number | null
          vigencia_cotizacion_dias: number | null
        }
        Relationships: []
      }
      v_pendientes_despacho: {
        Row: {
          cantidad: number | null
          cliente: string | null
          cliente_id: string | null
          codigo_interno: string | null
          despachado: number | null
          en_fabrica_para_pedido: number | null
          estado: Database["comercial"]["Enums"]["estado_pedido_enum"] | null
          fecha_entrega: string | null
          numero: string | null
          pedido_id: string | null
          pendiente: number | null
          producto: string | null
          producto_id: string | null
          reservado_para_pedido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_precios_proveedor: {
        Row: {
          codigo_interno: string | null
          compras: number | null
          compras_sin_ajustar: number | null
          insumo: string | null
          insumo_id: string | null
          precio_minimo_hoy: number | null
          precio_promedio_hoy: number | null
          proveedor: string | null
          proveedor_id: string | null
          ultima_compra: string | null
          ultimo_precio: number | null
          unidad_medida: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      v_precios_vigentes: {
        Row: {
          alicuota_iva: number | null
          cargado_por: string | null
          codigo_interno: string | null
          motivo: string | null
          origen: string | null
          precio_lista: number | null
          precio_neto: number | null
          producto: string | null
          producto_id: string | null
          vigente_desde: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_proveedores_por_insumo: {
        Row: {
          activo: boolean | null
          estado_aprobacion:
            | Database["gmp"]["Enums"]["aprobacion_proveedor_enum"]
            | null
          insumo_id: string | null
          lotes_recibidos: number | null
          proveedor_id: string | null
          razon_social: string | null
          ultima_compra: string | null
        }
        Relationships: []
      }
      v_recepciones_sin_comprobante: {
        Row: {
          fecha_hora: string | null
          numero: string | null
          numero_remito: string | null
          proveedor: string | null
          proveedor_id: string | null
          recepcion_id: string | null
          registrada_por: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      v_reservado_por_insumo: {
        Row: {
          insumo_id: string | null
          reservado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      v_reservas_vigentes: {
        Row: {
          cantidad: number | null
          codigo_interno: string | null
          consumido: number | null
          creado_en: string | null
          creado_por: string | null
          id: string | null
          insumo_id: string | null
          insumo_nombre: string | null
          motivo: string | null
          para_nombre: string | null
          para_tercero_id: string | null
          pedido_id: string | null
          pendiente: number | null
          tercero_id: string | null
          tercero_nombre: string | null
          unidad: string | null
          vence_en: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_calle5_tomado_ventas"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes_despacho"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas"
            referencedColumns: ["pedido_stock_id"]
          },
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pedidas"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      v_resultado_gestion: {
        Row: {
          amortizaciones: number | null
          costo_variable: number | null
          costos_estructura: number | null
          costos_fijos: number | null
          costos_totales: number | null
          estructura_equilibrio: number | null
          facturacion: number | null
          facturacion_equilibrio: number | null
          gastos_operativos: number | null
          gastos_sin_comprobante: number | null
          mano_de_obra_no_absorbida: number | null
          mano_de_obra_vendida: number | null
          margen_contribucion: number | null
          margen_contribucion_pct: number | null
          margen_sin_mano_de_obra: number | null
          mes: string | null
          nomina_produccion: number | null
          productos_costo_incompleto: number | null
          productos_sin_costo: number | null
          resultado: number | null
        }
        Relationships: []
      }
      v_resultado_mensual: {
        Row: {
          compras: number | null
          otros_egresos: number | null
          periodo: string | null
          resultado: number | null
          ventas_netas: number | null
        }
        Relationships: []
      }
      v_rotacion_insumos: {
        Row: {
          codigo_interno: string | null
          consumo_90d: number | null
          consumo_diario: number | null
          consumos_sin_convertir: number | null
          dias_de_stock: number | null
          insumo: string | null
          insumo_id: string | null
          lotes_sin_costo: number | null
          rotacion_anual: number | null
          saldo: number | null
          unidad_medida: string | null
          valor_ars: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      v_saldo_consumible: {
        Row: {
          insumo_id: string | null
          saldo: number | null
          saldo_apertura: number | null
          tercero_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      v_saldos_clientes: {
        Row: {
          a_30: number | null
          a_60: number | null
          a_90: number | null
          cliente_id: string | null
          cobrado: number | null
          cobrado_sin_imputar: number | null
          condicion_iva:
            | Database["comercial"]["Enums"]["condicion_iva_enum"]
            | null
          facturado: number | null
          facturas_pendientes: number | null
          mas_90: number | null
          pendiente_homologacion: number | null
          razon_social: string | null
          saldo: number | null
        }
        Relationships: []
      }
      v_saldos_fondos: {
        Row: {
          activo: boolean | null
          banco: string | null
          cuenta_id: string | null
          de_tercero: boolean | null
          moneda: string | null
          nombre: string | null
          numero: string | null
          saldo: number | null
          tipo: Database["comercial"]["Enums"]["tipo_cuenta_fondos_enum"] | null
          titular: string | null
          ultima_conciliacion: string | null
          ultimo_movimiento: string | null
        }
        Relationships: []
      }
      v_saldos_proveedores: {
        Row: {
          conciliado_al: string | null
          cuit: string | null
          debe: number | null
          diferencia_conciliacion: number | null
          haber: number | null
          proveedor_id: string | null
          proximo_vencimiento: string | null
          razon_social: string | null
          saldo: number | null
          saldo_informado: number | null
          vencido: number | null
        }
        Relationships: []
      }
      v_saldos_stock: {
        Row: {
          articulo_id: string | null
          deposito_id: string | null
          lote_insumo_id: string | null
          movimientos: number | null
          saldo: number | null
          ultimo_movimiento: string | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["articulo_id"]
          },
        ]
      }
      v_stock_por_articulo: {
        Row: {
          activo: boolean | null
          articulo_id: string | null
          bajo_minimo: boolean | null
          codigo_interno: string | null
          depositos: number | null
          es_inflamable: boolean | null
          insumo_id: string | null
          insumo_nombre: string | null
          insumo_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          lotes_con_saldo: number | null
          saldo_aprobado: number | null
          saldo_despachable: number | null
          saldo_total: number | null
          sku: string | null
          stock_minimo: number | null
          ultimo_movimiento: string | null
          unidad_medida: string | null
          vence_primero: string | null
        }
        Relationships: []
      }
      v_stock_pt: {
        Row: {
          deposito: string | null
          deposito_id: string | null
          producto: string | null
          producto_id: string | null
          retenido: number | null
          saldo: number | null
          ultimo_movimiento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_stock_pt_lotes: {
        Row: {
          codigo_interno: string | null
          deposito: string | null
          deposito_id: string | null
          deposito_numero: string | null
          estado_lote: string | null
          impedimento: string | null
          numero_lote: string | null
          orden_id: string | null
          orden_numero: string | null
          producto: string | null
          producto_id: string | null
          saldo: number | null
          vencimiento: string | null
          vencimiento_texto: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_stock_seguridad: {
        Row: {
          accion: string | null
          aplica_stock: boolean | null
          bajo_punto_de_pedido: boolean | null
          clase_demanda: string | null
          comprometido: number | null
          demanda_lt: number | null
          descripcion: string | null
          disponible: number | null
          en_calle5: number | null
          en_fabrica: number | null
          en_produccion: number | null
          estado_demanda: string | null
          falta_disponible: number | null
          falta_ss: number | null
          lead_time_dh: number | null
          meta_desde: string | null
          meta_propia: boolean | null
          mu_mensual: number | null
          origen: string | null
          pedidos_clientes: number | null
          posicion: number | null
          producto_id: string | null
          producto_nombre: string | null
          rop_meta: number | null
          rop_planilla: number | null
          sku_cod: string | null
          sku_id: string | null
          ss_meta: number | null
          ss_planilla: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_seguridad_sku_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_seguridad_sku_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_seguridad_sku_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_stock_tercero: {
        Row: {
          codigo_interno: string | null
          disponible: number | null
          insumo_id: string | null
          insumo_nombre: string | null
          insumo_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          lotes: number | null
          propio: boolean | null
          reservado: number | null
          saldo_consumible: number | null
          saldo_no_disponible: number | null
          saldo_total: number | null
          tercero_id: string | null
          unidad_medida: string | null
          vence_primero: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "articulos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: true
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      v_stock_valorizado_insumos: {
        Row: {
          articulo_id: string | null
          codigo_interno: string | null
          costo_unitario_ars: number | null
          deposito_id: string | null
          insumo: string | null
          insumo_id: string | null
          lote_insumo_id: string | null
          origen_costo:
            | Database["comercial"]["Enums"]["origen_costo_enum"]
            | null
          saldo: number | null
          saldo_unidad_catalogo: number | null
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          unidad: string | null
          unidad_medida: string | null
          valor_ars: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["articulo_id"]
          },
        ]
      }
      v_stock_valorizado_pt: {
        Row: {
          costo_unitario: number | null
          deposito: string | null
          deposito_id: string | null
          faltantes: number | null
          producto: string | null
          producto_id: string | null
          retenido: number | null
          saldo: number | null
          valor_ars: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_pt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_tareas_carga: {
        Row: {
          codigo_interno: string | null
          envase_id: string | null
          etiqueta_id: string | null
          extras: number | null
          formula_consultada: boolean | null
          nombre: string | null
          pendientes: number | null
          producto_id: string | null
          sin_formula: boolean | null
          solo_reventa: boolean | null
          tiene_formula: boolean | null
        }
        Relationships: []
      }
      v_tipo_cambio_activo: {
        Row: {
          es_provisorio: boolean | null
          mes: string | null
          serie: Database["comercial"]["Enums"]["serie_macro_enum"] | null
          valor: number | null
        }
        Relationships: []
      }
      v_trazabilidad_orden: {
        Row: {
          articulo: string | null
          cantidad: number | null
          codigo_interno: string | null
          contraparte: string | null
          lote_interno: string | null
          lote_proveedor: string | null
          momento: string | null
          orden_id: string | null
          pedido: string | null
          recepcion: string | null
          sentido: string | null
          unidad: string | null
        }
        Relationships: []
      }
      v_ultimo_conteo: {
        Row: {
          cantidad_contada: number | null
          conteo_id: string | null
          insumo_id: string | null
          provisorio: boolean | null
          registrado_en: string | null
          registrado_por: string | null
          registrado_por_nombre: string | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costo_referencia"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_costos_pendientes"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_disponible_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "conteos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_stock_por_articulo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      v_ventas: {
        Row: {
          a_producir: number | null
          cliente: string | null
          cliente_id: string | null
          creado_en: string | null
          descuento_aplicado: number | null
          descuento_pct: number | null
          despachado: number | null
          destino_envio: string | null
          entregado_en: string | null
          estado: Database["comercial"]["Enums"]["estado_pedido_enum"] | null
          estado_pago: string | null
          factura_numero: number | null
          factura_punto_venta: number | null
          factura_tipo: string | null
          fecha: string | null
          fecha_entrega: string | null
          forma_pago: string | null
          gestionado: string | null
          gestionado_por: string | null
          id: string | null
          importe_lista: number | null
          importe_total: number | null
          numero: string | null
          observaciones: string | null
          pedido_stock: string | null
          pedido_stock_estado:
            | Database["comercial"]["Enums"]["estado_pedido_enum"]
            | null
          pedido_stock_id: string | null
          pendiente: number | null
          productos: number | null
          reservar_calle5: boolean | null
          stock_nota: string | null
          stock_ok: boolean | null
          stock_ok_en: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_ventas_mensuales: {
        Row: {
          ambiente: string | null
          cliente: string | null
          cliente_id: string | null
          facturas: number | null
          iva: number | null
          neto: number | null
          periodo: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_ventas_pedidas: {
        Row: {
          aprobaciones: number | null
          aprobada_en: string | null
          cliente: string | null
          cliente_id: string | null
          descuento_aplicado: number | null
          dias_hasta_aprobar: number | null
          estado: Database["comercial"]["Enums"]["estado_pedido_enum"] | null
          fecha_comprometida: string | null
          fecha_entrega_pedida: string | null
          fecha_pedido_cliente: string | null
          foto_id: string | null
          importe_lista: number | null
          importe_pedido: number | null
          numero: string | null
          pedido_id: string | null
          periodo: string | null
          productos: number | null
          unidades: number | null
          vendedor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_ventas_producto_mes: {
        Row: {
          facturacion: number | null
          mes: string | null
          producto_id: string | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_costo_producto"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_faltan_etiquetar"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_renglones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_carga"
            referencedColumns: ["producto_id"]
          },
        ]
      }
    }
    Functions: {
      alicuota_iva_arca: { Args: { p_alicuota: number }; Returns: number }
      alta_producto_de_sku: { Args: { p_sku_id: string }; Returns: string }
      anular_cobro_cliente: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_comprobante_proveedor: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_cotizacion: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_etiquetado: {
        Args: { p_etiquetado_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_movimiento: {
        Args: { p_motivo: string; p_movimiento_id: string }
        Returns: {
          anula_a_movimiento_id: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          investigacion_id: string | null
          lote_insumo_id: string
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string
          orden: number
          periodo: string | null
          registrado_por: string
          requiere_investigacion: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id: string | null
          unidad: string
        }
        SetofOptions: {
          from: "*"
          to: "movimientos_stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      anular_movimiento_fondos: {
        Args: { p_id: string; p_motivo: string }
        Returns: string
      }
      anular_pago_proveedor: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_transferencia: {
        Args: { p_grupo: string; p_motivo: string }
        Returns: number
      }
      aplicar_precios_pedido: { Args: { p_pedido_id: string }; Returns: number }
      aprobar_venta_interna: {
        Args: { p_de_deposito?: Json; p_pedido_id: string }
        Returns: Json
      }
      articulo_de_insumo: { Args: { p_insumo_id: string }; Returns: string }
      asignar_lotes_pt: {
        Args: {
          p_cantidad: number
          p_deposito_id: string
          p_producto_id: string
          p_solo_despachable: boolean
        }
        Returns: {
          cantidad: number
          orden_id: string
        }[]
      }
      cargar_apertura_a_stock: {
        Args: { p_migracion_id: string }
        Returns: {
          anula_a_movimiento_id: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          investigacion_id: string | null
          lote_insumo_id: string
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string
          orden: number
          periodo: string | null
          registrado_por: string
          requiere_investigacion: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id: string | null
          unidad: string
        }[]
        SetofOptions: {
          from: "*"
          to: "movimientos_stock"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cargar_escala_descuento: {
        Args: { p_escalones: Json; p_vigente_desde?: string }
        Returns: number
      }
      cargar_recepcion_a_stock: {
        Args: { p_recepcion_id: string }
        Returns: {
          anula_a_movimiento_id: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          investigacion_id: string | null
          lote_insumo_id: string
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string
          orden: number
          periodo: string | null
          registrado_por: string
          requiere_investigacion: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id: string | null
          unidad: string
        }[]
        SetofOptions: {
          from: "*"
          to: "movimientos_stock"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clase_factura:
        | {
            Args: {
              p_condicion: Database["comercial"]["Enums"]["condicion_iva_enum"]
            }
            Returns: string
          }
        | {
            Args: {
              p_emisor: Database["comercial"]["Enums"]["condicion_iva_enum"]
              p_receptor: Database["comercial"]["Enums"]["condicion_iva_enum"]
            }
            Returns: string
          }
      codigo_comprobante_arca:
        | { Args: { p_clase: string }; Returns: number }
        | { Args: { p_clase: string; p_comprobante: string }; Returns: number }
      condicion_iva_arca: {
        Args: {
          p_condicion: Database["comercial"]["Enums"]["condicion_iva_enum"]
        }
        Returns: number
      }
      convertir_cantidad: {
        Args: {
          p_cantidad: number
          p_densidad?: number
          p_desde: string
          p_hacia: string
        }
        Returns: number
      }
      costear_cotizacion: {
        Args: { p_id: string }
        Returns: {
          cantidad: number
          cantidad_base: number
          densidad: number
          falta: string
          linea_id: string
          merma: number
          nombre: string
          orden: number
          origen_precio: string
          precio_base: number
          subtotal: number
          tipo: string
          unidad: string
          unidad_base: string
        }[]
      }
      costo_producto: {
        Args: { p_producto_id: string }
        Returns: {
          cantidad: number
          codigo_interno: string
          componente: string
          costo_unitario: number
          falta: string
          insumo_id: string
          merma: number
          orden: number
          origen_costo: string
          subtotal: number
          tipo: string
          unidad: string
        }[]
      }
      costos_productos: {
        Args: { p_productos?: string[] }
        Returns: {
          cantidad: number
          codigo_interno: string
          componente: string
          costo_unitario: number
          falta: string
          insumo_id: string
          merma: number
          orden: number
          origen_costo: string
          producto_id: string
          subtotal: number
          tipo: string
          unidad: string
        }[]
      }
      crear_produccion: {
        Args: {
          p_cantidad: number
          p_dias?: number
          p_inicio?: string
          p_para_pedido_id?: string
          p_producto_id: string
        }
        Returns: string
      }
      cuit_valido: { Args: { p: string }; Returns: boolean }
      densidad_insumo: { Args: { p_insumo_id: string }; Returns: number }
      deposito_de_venta: { Args: { p_pedido_id: string }; Returns: string }
      descartar_articulo: {
        Args: { p_articulo_id: string; p_motivo: string }
        Returns: number
      }
      descuento_por_monto: { Args: { p_monto: number }; Returns: number }
      deshacer_apertura: {
        Args: { p_migracion_id: string; p_motivo: string }
        Returns: {
          anula_a_movimiento_id: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          investigacion_id: string | null
          lote_insumo_id: string
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string
          orden: number
          periodo: string | null
          registrado_por: string
          requiere_investigacion: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id: string | null
          unidad: string
        }[]
        SetofOptions: {
          from: "*"
          to: "movimientos_stock"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      despachar_pedido: {
        Args: {
          p_con_faltantes?: boolean
          p_deposito?: string
          p_observacion?: string
          p_pedido_id: string
          p_renglones: Json
        }
        Returns: string
      }
      disponible_para: {
        Args: { p_insumo_id: string; p_para: string; p_titular: string }
        Returns: number
      }
      duplicar_cotizacion: { Args: { p_id: string }; Returns: string }
      eliminar_pedido: {
        Args: { p_motivo?: string; p_pedido_id: string }
        Returns: undefined
      }
      emitir_cotizacion: {
        Args: { p_id: string; p_justificacion?: string }
        Returns: number
      }
      en_etiquetados: { Args: { p_insumo_id: string }; Returns: number }
      entregar_pedido: { Args: { p_pedido_id: string }; Returns: undefined }
      enviar_armado: {
        Args: { p_motivo?: string; p_pedido_id: string; p_renglones: Json }
        Returns: string
      }
      enviar_venta: {
        Args: { p_de_calle5?: Json; p_pedido_id: string }
        Returns: Json
      }
      etiquetados_en_stock: { Args: { p_producto_id: string }; Returns: number }
      explotar_pedido: {
        Args: { p_pedido_id: string }
        Returns: Database["comercial"]["CompositeTypes"]["renglon_faltante"][]
        SetofOptions: {
          from: "*"
          to: "renglon_faltante"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      faltantes_en_curso: {
        Args: never
        Returns: {
          codigo_interno: string
          disponible: number
          faltante: number
          insumo: string
          insumo_id: string
          necesario: number
          pedidos: Json
          proveedor: string
          proveedor_estado: string
          proveedor_id: string
          saldo_apertura: number
          unidad: string
        }[]
      }
      faltantes_por_titular: {
        Args: { p_tercero_id: string }
        Returns: {
          codigo_interno: string
          disponible: number
          faltante: number
          insumo: string
          insumo_id: string
          necesario: number
          pedidos: Json
          proveedor: string
          proveedor_estado: string
          proveedor_id: string
          saldo_apertura: number
          unidad: string
        }[]
      }
      fijar_numero_factura: {
        Args: { p_clave: string; p_factura_id: string; p_numero: number }
        Returns: undefined
      }
      flujo_caja_dia: { Args: { p_fecha: string }; Returns: Json }
      flujo_caja_diario: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          egresos: number
          fecha: string
          ingresos: number
          neto: number
          saldo_bancos: number
          saldo_efectivo: number
        }[]
      }
      fn_clave_arca_valida: { Args: { p_clave: string }; Returns: boolean }
      fn_factura_para_arca: { Args: { p_factura_id: string }; Returns: Json }
      formula_para_costo: {
        Args: { p_producto_id: string }
        Returns: {
          estado: Database["gmp"]["Enums"]["estado_documento_enum"]
          formula_id: string
          version: string
        }[]
      }
      historia_precios: {
        Args: { p_meses?: number; p_producto_id: string }
        Returns: {
          banda: string
          mes: string
          precio_neto: number
        }[]
      }
      hoy: { Args: never; Returns: string }
      importar_costos_referencia: {
        Args: { p_archivo: string; p_filas: Json; p_hash: string }
        Returns: number
      }
      importe_neto_ars: {
        Args: {
          p_alicuota: number
          p_comprobante: Database["comercial"]["Enums"]["comprobante_costo_enum"]
          p_importe: number
          p_incluye_iva: boolean
          p_tipo_cambio: number
        }
        Returns: number
      }
      ingresar_stock_tercero: {
        Args: {
          p_contenedores_limpiados?: boolean
          p_items: Json
          p_observaciones?: string
          p_remito?: string
          p_tercero_id: string
        }
        Returns: string
      }
      insumos_pedido: {
        Args: { p_pedido_id: string }
        Returns: {
          codigo_interno: string
          disponible_nailshow: number
          disponible_tercero: number
          elegido: boolean
          insumo: string
          insumo_id: string
          necesario: number
          origen: string
          propio_tercero: boolean
          unidad: string
        }[]
      }
      liberar_reserva_pt: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      lineas_desde_producto: {
        Args: { p_cotizacion_id: string; p_producto_id: string }
        Returns: number
      }
      necesidad_pedido: {
        Args: { p_pedido_id: string }
        Returns: {
          insumo_id: string
          necesario: number
        }[]
      }
      necesidad_pedido_neta: {
        Args: { p_pedido_id: string }
        Returns: {
          insumo_id: string
          necesario: number
        }[]
      }
      normalizar_nombre: { Args: { p: string }; Returns: string }
      origen_insumo: {
        Args: { p_insumo_id: string; p_pedido_id: string }
        Returns: string
      }
      pagar_solicitud_con_egreso: {
        Args: {
          p_comprobante?: string
          p_cuenta_id: string
          p_fecha?: string
          p_solicitud_id: string
        }
        Returns: string
      }
      pareto: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          acumulado: number
          clase: string
          codigo_interno: string
          costo_incompleto: boolean
          costo_variable: number
          facturacion: number
          margen: number
          margen_pct: number
          participacion: number
          producto: string
          producto_id: string
          unidades: number
        }[]
      }
      pasar_a_produccion: {
        Args: { p_origenes?: Json; p_pedido_id: string }
        Returns: undefined
      }
      precio_cotizacion: {
        Args: {
          p_alicuota: number
          p_costo: number
          p_fija: string
          p_leyenda: string
          p_margen: number
          p_modo: string
          p_precio: number
          p_redondeo: number
        }
        Returns: number
      }
      precio_para: {
        Args: { p_cliente_id: string; p_producto_id: string }
        Returns: {
          alicuota_iva: number
          descuento: number
          precio_lista: number
          precio_neto: number
        }[]
      }
      preparar_factura: {
        Args: { p_emisor_id?: string; p_pedido_id: string }
        Returns: Json
      }
      preparar_nota_credito: {
        Args: { p_factura_id: string; p_motivo: string }
        Returns: Json
      }
      proponer_fecha: {
        Args: {
          p_demorados?: Json
          p_fecha: string
          p_nota?: string
          p_pedido_id: string
        }
        Returns: string
      }
      recalcular_venta: { Args: { p_pedido_id: string }; Returns: undefined }
      registrar_cobro_cliente: {
        Args: {
          p_cliente_id: string
          p_cuenta_id: string
          p_fecha?: string
          p_importe: number
          p_imputaciones?: Json
          p_medio: Database["comercial"]["Enums"]["medio_pago_enum"]
          p_observacion?: string
          p_referencia?: string
        }
        Returns: string
      }
      registrar_conteo: {
        Args: {
          p_cantidad: number
          p_insumo_id: string
          p_observacion?: string
          p_provisorio?: boolean
        }
        Returns: number
      }
      registrar_conteo_pt: {
        Args: {
          p_cantidad: number
          p_deposito_numero?: string
          p_observacion?: string
          p_producto_id: string
        }
        Returns: number
      }
      registrar_etiquetado: {
        Args: { p_cantidad: number; p_producto_id: string }
        Returns: {
          cantidad: number
          fecha: string
          id: string
          producto_id: string
          registrado_en: string
          registrado_por: string
        }
        SetofOptions: {
          from: "*"
          to: "etiquetados"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_pago_proveedor: {
        Args: {
          p_cuenta_id: string
          p_fecha?: string
          p_importe: number
          p_imputaciones?: Json
          p_medio: Database["comercial"]["Enums"]["medio_pago_enum"]
          p_observacion?: string
          p_proveedor_id: string
          p_referencia?: string
          p_solicitud_id?: string
        }
        Returns: string
      }
      registrar_resultado_factura: {
        Args: {
          p_clave: string
          p_error_envio: string
          p_factura_id: string
          p_respuesta: Json
          p_solicitud: Json
        }
        Returns: Json
      }
      reservado_pt: {
        Args: { p_deposito_id: string; p_producto_id: string }
        Returns: number
      }
      reservar_producto_venta: {
        Args: { p_pedido_id: string; p_producto_id: string }
        Returns: Json
      }
      reservar_venta: { Args: { p_pedido_id: string }; Returns: number }
      saldo_fondos: {
        Args: { p_cuenta_id: string; p_hasta?: string }
        Returns: number
      }
      sale_de_fabrica: { Args: { p_cliente: string }; Returns: boolean }
      siguiente_numero: {
        Args: { p_ambito: string; p_anio: number }
        Returns: number
      }
      terminar_orden: {
        Args: { p_cantidad: number; p_id: string; p_unidades: number }
        Returns: undefined
      }
      terminar_pedido: {
        Args: { p_consumos?: Json; p_pedido_id: string; p_produccion?: Json }
        Returns: undefined
      }
      tipo_documento_arca: {
        Args: { p_tipo: Database["comercial"]["Enums"]["tipo_documento_enum"] }
        Returns: number
      }
      tomar_foto_costos: { Args: never; Returns: number }
      transferir_deposito: {
        Args: {
          p_cantidad: number
          p_deposito_destino: string
          p_deposito_origen: string
          p_lote_id: string
          p_motivo: string
        }
        Returns: {
          anula_a_movimiento_id: string | null
          articulo_id: string
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          investigacion_id: string | null
          lote_insumo_id: string
          motivo: string | null
          motivo_tipo:
            | Database["comercial"]["Enums"]["motivo_ajuste_enum"]
            | null
          ocurrido_en: string
          orden: number
          periodo: string | null
          registrado_por: string
          requiere_investigacion: boolean
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
          transferencia_id: string | null
          unidad: string
        }[]
        SetofOptions: {
          from: "*"
          to: "movimientos_stock"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      transferir_fondos: {
        Args: {
          p_concepto: string
          p_destino: string
          p_fecha?: string
          p_importe: number
          p_origen: string
        }
        Returns: string
      }
      transferir_pt: {
        Args: {
          p_cantidad: number
          p_destino: string
          p_motivo?: string
          p_origen: string
          p_producto_id: string
        }
        Returns: undefined
      }
      ubicacion_insumos_producto: {
        Args: { p_producto_id: string }
        Returns: {
          codigo: string
          deposito: string
          estiba: string
          insumo: string
          insumo_id: string
          lote: string
          para: string
          saldo: number
          unidad: string
          vence: string
        }[]
      }
      unidad_base: { Args: { p_unidad: string }; Returns: string }
      venta_toda_reservada: { Args: { p_pedido_id: string }; Returns: boolean }
      verificar_stock_pedido: {
        Args: { p_nota?: string; p_ok: boolean; p_pedido_id: string }
        Returns: undefined
      }
      vincular_recepcion_compras: {
        Args: { p_recepcion_id: string; p_vinculos: Json }
        Returns: number
      }
      volumenes_por_contraparte: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          ambiente: string
          contraparte: string
          lado: string
          total: number
        }[]
      }
    }
    Enums: {
      ambiente_fiscal_enum: "HOMOLOGACION" | "PRODUCCION"
      clase_gasto_enum: "FIJO" | "OPERATIVO" | "INVERSION"
      comprobante_costo_enum:
        | "FACTURA_A"
        | "FACTURA_B"
        | "FACTURA_C"
        | "NO_DISCRIMINADO"
        | "SIN_COMPROBANTE"
      concepto_accesorio_enum:
        | "FLETE"
        | "SEGURO"
        | "ARANCELES"
        | "DESPACHANTE"
        | "OTRO"
      condicion_iva_enum:
        | "RESPONSABLE_INSCRIPTO"
        | "MONOTRIBUTO"
        | "EXENTO"
        | "CONSUMIDOR_FINAL"
        | "NO_ALCANZADO"
        | "NO_CATEGORIZADO"
      destino_cotizacion_enum: "CLIENTE" | "POTENCIAL" | "INTERNO"
      estado_aviso_enum: "PENDIENTE" | "EN_COMPRA" | "RESUELTO" | "DESCARTADO"
      estado_cotizacion_enum: "BORRADOR" | "EMITIDA" | "ANULADA"
      estado_factura_enum: "PENDIENTE" | "AUTORIZADA" | "RECHAZADA"
      estado_pedido_enum:
        | "BORRADOR"
        | "ESPERANDO_FECHA"
        | "FECHA_PROPUESTA"
        | "CONFIRMADO"
        | "EN_PRODUCCION"
        | "CUMPLIDO"
        | "CANCELADO"
      estado_solicitud_pago_enum:
        | "PENDIENTE"
        | "APROBADA"
        | "PAGADA"
        | "RECHAZADA"
        | "ANULADA"
      medio_pago_enum:
        | "EFECTIVO"
        | "TRANSFERENCIA"
        | "CHEQUE"
        | "TARJETA"
        | "OTRO"
      metodo_costeo_enum: "PEPS" | "PPP" | "ESTANDAR"
      motivo_ajuste_enum:
        | "ROTURA"
        | "DERRAME"
        | "VENCIMIENTO"
        | "MERMA_DE_PROCESO"
        | "DIFERENCIA_DE_INVENTARIO"
        | "ERROR_DE_REGISTRO"
        | "ROBO_O_EXTRAVIO"
        | "MUESTRA_DE_ARCHIVO"
        | "DEVOLUCION_A_PROVEEDOR"
        | "DISCONTINUADO"
      origen_costo_enum: "RECEPCION" | "APERTURA"
      serie_macro_enum: "IPC" | "TC_A3500_PROMEDIO" | "TC_A3500_CIERRE"
      tipo_comprobante_proveedor_enum:
        | "FACTURA_A"
        | "FACTURA_B"
        | "FACTURA_C"
        | "NOTA_CREDITO_A"
        | "NOTA_CREDITO_B"
        | "NOTA_CREDITO_C"
        | "SIN_FACTURA"
      tipo_cuenta_fondos_enum: "CAJA" | "BANCO" | "BILLETERA"
      tipo_documento_enum: "CUIT" | "CUIL" | "DNI" | "SIN_IDENTIFICAR"
      tipo_linea_cotizacion_enum: "CATALOGO" | "NUEVO" | "LIBRE"
      tipo_movimiento_enum:
        | "ENTRADA_COMPRA"
        | "ENTRADA_PRODUCCION"
        | "ENTRADA_DEVOLUCION"
        | "ENTRADA_AJUSTE"
        | "SALIDA_VENTA"
        | "SALIDA_CONSUMO_PRODUCCION"
        | "SALIDA_MUESTRA"
        | "SALIDA_DESCARTE"
        | "SALIDA_AJUSTE"
        | "SALIDA_RETIRO_MERCADO"
        | "TRANSFERENCIA_ENTRE_DEPOSITOS"
        | "ENTRADA_SALDO_APERTURA"
        | "ENTRADA_PROVISTO_TERCERO"
      tipo_movimiento_fondos_enum:
        | "INGRESO"
        | "EGRESO"
        | "TRANSFERENCIA"
        | "AJUSTE"
    }
    CompositeTypes: {
      renglon_faltante: {
        insumo_id: string | null
        codigo_interno: string | null
        insumo: string | null
        unidad: string | null
        necesario: number | null
        disponible: number | null
        faltante: number | null
        proveedor_id: string | null
        proveedor: string | null
        proveedor_estado: string | null
        ultima_compra: string | null
      }
    }
  }
  core: {
    Tables: {
      auditoria: {
        Row: {
          auth_uid: string | null
          datos_antes: Json | null
          datos_despues: Json | null
          db_role: string
          db_session: string
          esquema: string
          id: number
          ip: unknown
          motivo: string | null
          ocurrido_en: string
          operacion: string
          registro_id: string | null
          tabla: string
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          auth_uid?: string | null
          datos_antes?: Json | null
          datos_despues?: Json | null
          db_role?: string
          db_session?: string
          esquema: string
          id?: never
          ip?: unknown
          motivo?: string | null
          ocurrido_en?: string
          operacion: string
          registro_id?: string | null
          tabla: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          auth_uid?: string | null
          datos_antes?: Json | null
          datos_despues?: Json | null
          db_role?: string
          db_session?: string
          esquema?: string
          id?: never
          ip?: unknown
          motivo?: string | null
          ocurrido_en?: string
          operacion?: string
          registro_id?: string | null
          tabla?: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_nomina"
            referencedColumns: ["id"]
          },
        ]
      }
      giorgio_config: {
        Row: {
          activo: boolean
          cambiado_en: string
          cambiado_por: string | null
          clave_registro_sha256: string | null
          corte_proporcion: number
          id: string
          limite_diario_defecto: number
          limites_por_rol: Json
          precios: Json
          tope_diario_usd: number
          tope_mensual_usd: number
          unica: boolean
        }
        Insert: {
          activo?: boolean
          cambiado_en?: string
          cambiado_por?: string | null
          clave_registro_sha256?: string | null
          corte_proporcion?: number
          id?: string
          limite_diario_defecto?: number
          limites_por_rol?: Json
          precios?: Json
          tope_diario_usd?: number
          tope_mensual_usd?: number
          unica?: boolean
        }
        Update: {
          activo?: boolean
          cambiado_en?: string
          cambiado_por?: string | null
          clave_registro_sha256?: string | null
          corte_proporcion?: number
          id?: string
          limite_diario_defecto?: number
          limites_por_rol?: Json
          precios?: Json
          tope_diario_usd?: number
          tope_mensual_usd?: number
          unica?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "giorgio_config_cambiado_por_fkey"
            columns: ["cambiado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giorgio_config_cambiado_por_fkey"
            columns: ["cambiado_por"]
            isOneToOne: false
            referencedRelation: "v_nomina"
            referencedColumns: ["id"]
          },
        ]
      }
      giorgio_mensajes: {
        Row: {
          costo_usd: number | null
          creado_en: string
          error: string | null
          generado_por_ia: boolean
          herramientas: string[]
          id: string
          iteraciones: number | null
          latencia_ms: number | null
          modelo: string | null
          pregunta: string
          preguntado_por: string
          respuesta: string | null
          rol: Database["core"]["Enums"]["rol_enum"] | null
          ruta: string | null
          tokens_cache_escritura: number
          tokens_cache_lectura: number
          tokens_entrada: number
          tokens_salida: number
        }
        Insert: {
          costo_usd?: number | null
          creado_en?: string
          error?: string | null
          generado_por_ia?: boolean
          herramientas?: string[]
          id?: string
          iteraciones?: number | null
          latencia_ms?: number | null
          modelo?: string | null
          pregunta: string
          preguntado_por: string
          respuesta?: string | null
          rol?: Database["core"]["Enums"]["rol_enum"] | null
          ruta?: string | null
          tokens_cache_escritura?: number
          tokens_cache_lectura?: number
          tokens_entrada?: number
          tokens_salida?: number
        }
        Update: {
          costo_usd?: number | null
          creado_en?: string
          error?: string | null
          generado_por_ia?: boolean
          herramientas?: string[]
          id?: string
          iteraciones?: number | null
          latencia_ms?: number | null
          modelo?: string | null
          pregunta?: string
          preguntado_por?: string
          respuesta?: string | null
          rol?: Database["core"]["Enums"]["rol_enum"] | null
          ruta?: string | null
          tokens_cache_escritura?: number
          tokens_cache_lectura?: number
          tokens_entrada?: number
          tokens_salida?: number
        }
        Relationships: [
          {
            foreignKeyName: "giorgio_mensajes_preguntado_por_fkey"
            columns: ["preguntado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giorgio_mensajes_preguntado_por_fkey"
            columns: ["preguntado_por"]
            isOneToOne: false
            referencedRelation: "v_nomina"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          creado_en: string
          documento: string | null
          email: string | null
          es_dt_titular: boolean
          es_ejemplo: boolean
          fecha_alta: string
          fecha_baja: string | null
          id: string
          nombre_completo: string
          rol: Database["core"]["Enums"]["rol_enum"]
          roles_adicionales: Database["core"]["Enums"]["rol_enum"][]
          sector: Database["core"]["Enums"]["sector_enum"]
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          creado_en?: string
          documento?: string | null
          email?: string | null
          es_dt_titular?: boolean
          es_ejemplo?: boolean
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          nombre_completo: string
          rol: Database["core"]["Enums"]["rol_enum"]
          roles_adicionales?: Database["core"]["Enums"]["rol_enum"][]
          sector: Database["core"]["Enums"]["sector_enum"]
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          creado_en?: string
          documento?: string | null
          email?: string | null
          es_dt_titular?: boolean
          es_ejemplo?: boolean
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          nombre_completo?: string
          rol?: Database["core"]["Enums"]["rol_enum"]
          roles_adicionales?: Database["core"]["Enums"]["rol_enum"][]
          sector?: Database["core"]["Enums"]["sector_enum"]
        }
        Relationships: []
      }
      visibilidad_pantallas: {
        Row: {
          cambiado_en: string
          cambiado_por: string
          id: string
          motivo: string | null
          pantalla: string
          rol: Database["core"]["Enums"]["rol_enum"]
          visible: boolean
        }
        Insert: {
          cambiado_en?: string
          cambiado_por?: string
          id?: string
          motivo?: string | null
          pantalla: string
          rol: Database["core"]["Enums"]["rol_enum"]
          visible: boolean
        }
        Update: {
          cambiado_en?: string
          cambiado_por?: string
          id?: string
          motivo?: string | null
          pantalla?: string
          rol?: Database["core"]["Enums"]["rol_enum"]
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "visibilidad_pantallas_cambiado_por_fkey"
            columns: ["cambiado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visibilidad_pantallas_cambiado_por_fkey"
            columns: ["cambiado_por"]
            isOneToOne: false
            referencedRelation: "v_nomina"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      escrituras_privilegiadas: {
        Row: {
          db_role: string | null
          db_session: string | null
          esquema: string | null
          id: number | null
          ocurrido_en: string | null
          operacion: string | null
          registro_id: string | null
          tabla: string | null
          usuario_id: string | null
        }
        Insert: {
          db_role?: string | null
          db_session?: string | null
          esquema?: string | null
          id?: number | null
          ocurrido_en?: string | null
          operacion?: string | null
          registro_id?: string | null
          tabla?: string | null
          usuario_id?: string | null
        }
        Update: {
          db_role?: string | null
          db_session?: string | null
          esquema?: string | null
          id?: number | null
          ocurrido_en?: string | null
          operacion?: string | null
          registro_id?: string | null
          tabla?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_nomina"
            referencedColumns: ["id"]
          },
        ]
      }
      v_nomina: {
        Row: {
          activo: boolean | null
          es_ejemplo: boolean | null
          id: string | null
          nombre_completo: string | null
          rol: Database["core"]["Enums"]["rol_enum"] | null
        }
        Insert: {
          activo?: boolean | null
          es_ejemplo?: boolean | null
          id?: string | null
          nombre_completo?: string | null
          rol?: Database["core"]["Enums"]["rol_enum"] | null
        }
        Update: {
          activo?: boolean | null
          es_ejemplo?: boolean | null
          id?: string | null
          nombre_completo?: string | null
          rol?: Database["core"]["Enums"]["rol_enum"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjuntar_auditoria: { Args: { p_tabla: unknown }; Returns: undefined }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dar_de_baja_ejemplo: { Args: { p_usuario: string }; Returns: undefined }
      es_escritura_privilegiada: {
        Args: { p_db_role: string }
        Returns: boolean
      }
      es_rol: {
        Args: { p_roles: Database["core"]["Enums"]["rol_enum"][] }
        Returns: boolean
      }
      fijar_visibilidad: {
        Args: {
          p_motivo?: string
          p_pantalla: string
          p_rol: Database["core"]["Enums"]["rol_enum"]
          p_visible: boolean
        }
        Returns: undefined
      }
      giorgio_config_valida: {
        Args: { p_limites: Json; p_precios: Json }
        Returns: boolean
      }
      giorgio_estado: { Args: never; Returns: Json }
      giorgio_hoy: { Args: never; Returns: string }
      giorgio_registrar: {
        Args: {
          p_clave: string
          p_error: string
          p_herramientas: string[]
          p_iteraciones: number
          p_latencia_ms: number
          p_modelo: string
          p_pregunta: string
          p_respuesta: string
          p_ruta: string
          p_tokens_cache_escritura: number
          p_tokens_cache_lectura: number
          p_tokens_entrada: number
          p_tokens_salida: number
        }
        Returns: string
      }
      rol: { Args: never; Returns: Database["core"]["Enums"]["rol_enum"] }
      roles: { Args: never; Returns: Database["core"]["Enums"]["rol_enum"][] }
      tablas_sin_auditoria: {
        Args: never
        Returns: {
          esquema: string
          tabla: string
        }[]
      }
      usuario_actual: { Args: never; Returns: string }
      verificar_invariantes: {
        Args: never
        Returns: {
          cumple: boolean
          detalle: string
          exigencia: string
          invariante: string
        }[]
      }
    }
    Enums: {
      rol_enum:
        | "OPERARIO"
        | "CONTROL_CALIDAD"
        | "DIRECCION_TECNICA"
        | "ADMINISTRACION"
        | "GERENCIA_PRODUCCION"
        | "GERENCIA"
        | "ADMINISTRADOR_SISTEMA"
        | "ENCARGADA_STOCK"
        | "VENTAS"
        | "FINANZAS"
        | "RECEPCION"
        | "PRODUCCION"
      sector_enum:
        | "ADMINISTRACION"
        | "RECEPCION_EXPEDICION"
        | "DEPOSITO"
        | "PRODUCCION"
        | "CONTROL_CALIDAD"
        | "GARANTIA_CALIDAD"
        | "MANTENIMIENTO"
        | "DIRECCION_TECNICA"
        | "GERENCIA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  gmp: {
    Tables: {
      bloqueos_lote: {
        Row: {
          bloqueado_en: string
          bloqueado_por: string
          detalle: string
          id: string
          levantado: boolean
          levantado_en: string | null
          levantado_motivo: string | null
          levantado_por: string | null
          lote_insumo_id: string | null
          motivo: Database["gmp"]["Enums"]["motivo_bloqueo_enum"]
          orden_id: string | null
          origen: string
          origen_id: string | null
        }
        Insert: {
          bloqueado_en?: string
          bloqueado_por?: string
          detalle: string
          id?: string
          levantado?: boolean
          levantado_en?: string | null
          levantado_motivo?: string | null
          levantado_por?: string | null
          lote_insumo_id?: string | null
          motivo: Database["gmp"]["Enums"]["motivo_bloqueo_enum"]
          orden_id?: string | null
          origen?: string
          origen_id?: string | null
        }
        Update: {
          bloqueado_en?: string
          bloqueado_por?: string
          detalle?: string
          id?: string
          levantado?: boolean
          levantado_en?: string | null
          levantado_motivo?: string | null
          levantado_por?: string | null
          lote_insumo_id?: string | null
          motivo?: Database["gmp"]["Enums"]["motivo_bloqueo_enum"]
          orden_id?: string | null
          origen?: string
          origen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_lote_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueos_lote_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueos_lote_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_dt: {
        Row: {
          consultada_en: string
          consultada_por: string
          id: string
          producto_id: string
          seccion: string
        }
        Insert: {
          consultada_en?: string
          consultada_por?: string
          id?: string
          producto_id: string
          seccion: string
        }
        Update: {
          consultada_en?: string
          consultada_por?: string
          id?: string
          producto_id?: string
          seccion?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_dt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_dt_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      contadores: {
        Row: {
          ambito: string
          anio: number
          ultimo: number
        }
        Insert: {
          ambito: string
          anio: number
          ultimo?: number
        }
        Update: {
          ambito?: string
          anio?: number
          ultimo?: number
        }
        Relationships: []
      }
      contadores_analisis: {
        Row: {
          anio: number
          registro: string
          ultimo: number
        }
        Insert: {
          anio: number
          registro: string
          ultimo?: number
        }
        Update: {
          anio?: number
          registro?: string
          ultimo?: number
        }
        Relationships: []
      }
      contadores_orden: {
        Row: {
          anio: number
          ultimo: number
        }
        Insert: {
          anio: number
          ultimo?: number
        }
        Update: {
          anio?: number
          ultimo?: number
        }
        Relationships: []
      }
      densidad_composicion: {
        Row: {
          constituyente_id: string
          creado_en: string
          densidad_id: string
          fraccion_masica: number
          fuente: string
          id: string
        }
        Insert: {
          constituyente_id: string
          creado_en?: string
          densidad_id: string
          fraccion_masica: number
          fuente: string
          id?: string
        }
        Update: {
          constituyente_id?: string
          creado_en?: string
          densidad_id?: string
          fraccion_masica?: number
          fuente?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "densidad_composicion_constituyente_id_fkey"
            columns: ["constituyente_id"]
            isOneToOne: false
            referencedRelation: "densidades_referencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "densidad_composicion_densidad_id_fkey"
            columns: ["densidad_id"]
            isOneToOne: false
            referencedRelation: "densidades_referencia"
            referencedColumns: ["id"]
          },
        ]
      }
      densidades_referencia: {
        Row: {
          a0: number | null
          a1: number | null
          a2: number | null
          a3: number | null
          a4: number | null
          activo: boolean
          beta_k: number | null
          calidad: string | null
          cas: string | null
          categoria: string | null
          creado_en: string
          densidad_ref: number | null
          documento_ref: string | null
          formula_quimica: string | null
          fuente: Database["gmp"]["Enums"]["fuente_densidad_enum"]
          id: string
          incertidumbre: string | null
          insumo_id: string | null
          masa_molar: number | null
          metodo: string | null
          nombre: string
          notas: string | null
          rango_datos: string | null
          referencia: string | null
          residuo_max: number | null
          temp_fusion_c: number | null
          temp_ref_c: number
          valido_desde_c: number
          valido_hasta_c: number
          verificada_en: string | null
          verificada_por: string | null
        }
        Insert: {
          a0?: number | null
          a1?: number | null
          a2?: number | null
          a3?: number | null
          a4?: number | null
          activo?: boolean
          beta_k?: number | null
          calidad?: string | null
          cas?: string | null
          categoria?: string | null
          creado_en?: string
          densidad_ref?: number | null
          documento_ref?: string | null
          formula_quimica?: string | null
          fuente: Database["gmp"]["Enums"]["fuente_densidad_enum"]
          id?: string
          incertidumbre?: string | null
          insumo_id?: string | null
          masa_molar?: number | null
          metodo?: string | null
          nombre: string
          notas?: string | null
          rango_datos?: string | null
          referencia?: string | null
          residuo_max?: number | null
          temp_fusion_c?: number | null
          temp_ref_c?: number
          valido_desde_c?: number
          valido_hasta_c?: number
          verificada_en?: string | null
          verificada_por?: string | null
        }
        Update: {
          a0?: number | null
          a1?: number | null
          a2?: number | null
          a3?: number | null
          a4?: number | null
          activo?: boolean
          beta_k?: number | null
          calidad?: string | null
          cas?: string | null
          categoria?: string | null
          creado_en?: string
          densidad_ref?: number | null
          documento_ref?: string | null
          formula_quimica?: string | null
          fuente?: Database["gmp"]["Enums"]["fuente_densidad_enum"]
          id?: string
          incertidumbre?: string | null
          insumo_id?: string | null
          masa_molar?: number | null
          metodo?: string | null
          nombre?: string
          notas?: string | null
          rango_datos?: string | null
          referencia?: string | null
          residuo_max?: number | null
          temp_fusion_c?: number | null
          temp_ref_c?: number
          valido_desde_c?: number
          valido_hasta_c?: number
          verificada_en?: string | null
          verificada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "densidades_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "densidades_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias_recibidas"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "densidades_referencia_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      depositos: {
        Row: {
          activo: boolean
          creado_en: string
          es_exterior: boolean
          estado_admitido:
            | Database["gmp"]["Enums"]["estado_calidad_enum"]
            | null
          id: string
          nombre: string
          numero: string
          tipo_contenido: Database["gmp"]["Enums"]["tipo_contenido_enum"] | null
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          es_exterior?: boolean
          estado_admitido?:
            | Database["gmp"]["Enums"]["estado_calidad_enum"]
            | null
          id?: string
          nombre: string
          numero: string
          tipo_contenido?:
            | Database["gmp"]["Enums"]["tipo_contenido_enum"]
            | null
        }
        Update: {
          activo?: boolean
          creado_en?: string
          es_exterior?: boolean
          estado_admitido?:
            | Database["gmp"]["Enums"]["estado_calidad_enum"]
            | null
          id?: string
          nombre?: string
          numero?: string
          tipo_contenido?:
            | Database["gmp"]["Enums"]["tipo_contenido_enum"]
            | null
        }
        Relationships: []
      }
      equipos: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          creado_por: string
          id: string
          nombre: string
          proxima_calibracion: string | null
          tipo: string
          ultima_calibracion: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          creado_por?: string
          id?: string
          nombre: string
          proxima_calibracion?: string | null
          tipo: string
          ultima_calibracion?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          creado_por?: string
          id?: string
          nombre?: string
          proxima_calibracion?: string | null
          tipo?: string
          ultima_calibracion?: string | null
        }
        Relationships: []
      }
      espec_formula: {
        Row: {
          componente: string
          es_csp: boolean
          especificacion_id: string
          id: string
          orden: number
          porcentaje_max: number | null
          porcentaje_min: number | null
          quitado: boolean
        }
        Insert: {
          componente: string
          es_csp?: boolean
          especificacion_id: string
          id?: string
          orden: number
          porcentaje_max?: number | null
          porcentaje_min?: number | null
          quitado?: boolean
        }
        Update: {
          componente?: string
          es_csp?: boolean
          especificacion_id?: string
          id?: string
          orden?: number
          porcentaje_max?: number | null
          porcentaje_min?: number | null
          quitado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "espec_formula_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "especificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      espec_parametros: {
        Row: {
          condicion_ensayo: string | null
          especificacion_id: string
          grupo: Database["gmp"]["Enums"]["grupo_parametro_enum"]
          id: string
          metodo_ensayo: string | null
          nombre: string
          obligatorio: boolean
          orden: number
          quitado: boolean
          referencia_norma: string | null
          tipo_criterio: Database["gmp"]["Enums"]["tipo_criterio_enum"]
          unidad: string | null
          valor_max: number | null
          valor_min: number | null
          valor_texto: string | null
        }
        Insert: {
          condicion_ensayo?: string | null
          especificacion_id: string
          grupo: Database["gmp"]["Enums"]["grupo_parametro_enum"]
          id?: string
          metodo_ensayo?: string | null
          nombre: string
          obligatorio?: boolean
          orden: number
          quitado?: boolean
          referencia_norma?: string | null
          tipo_criterio: Database["gmp"]["Enums"]["tipo_criterio_enum"]
          unidad?: string | null
          valor_max?: number | null
          valor_min?: number | null
          valor_texto?: string | null
        }
        Update: {
          condicion_ensayo?: string | null
          especificacion_id?: string
          grupo?: Database["gmp"]["Enums"]["grupo_parametro_enum"]
          id?: string
          metodo_ensayo?: string | null
          nombre?: string
          obligatorio?: boolean
          orden?: number
          quitado?: boolean
          referencia_norma?: string | null
          tipo_criterio?: Database["gmp"]["Enums"]["tipo_criterio_enum"]
          unidad?: string | null
          valor_max?: number | null
          valor_min?: number | null
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "espec_parametros_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "especificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      especificaciones: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          codigo_poe: string
          composicion_inci: string | null
          condiciones_almacenamiento: string | null
          creado_en: string
          denominacion: string
          emitida_por: string
          estado: Database["gmp"]["Enums"]["estado_documento_enum"]
          id: string
          instrucciones_muestreo: string | null
          motivo_cambio: string | null
          periodo_reanalisis_meses: number | null
          producto_id: string | null
          tipo_producto: string
          variedad: string | null
          version: string
          vida_util_meses: number
          vigencia_desde: string | null
        }
        Insert: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          codigo_poe: string
          composicion_inci?: string | null
          condiciones_almacenamiento?: string | null
          creado_en?: string
          denominacion: string
          emitida_por?: string
          estado?: Database["gmp"]["Enums"]["estado_documento_enum"]
          id?: string
          instrucciones_muestreo?: string | null
          motivo_cambio?: string | null
          periodo_reanalisis_meses?: number | null
          producto_id?: string | null
          tipo_producto?: string
          variedad?: string | null
          version: string
          vida_util_meses: number
          vigencia_desde?: string | null
        }
        Update: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          codigo_poe?: string
          composicion_inci?: string | null
          condiciones_almacenamiento?: string | null
          creado_en?: string
          denominacion?: string
          emitida_por?: string
          estado?: Database["gmp"]["Enums"]["estado_documento_enum"]
          id?: string
          instrucciones_muestreo?: string | null
          motivo_cambio?: string | null
          periodo_reanalisis_meses?: number | null
          producto_id?: string | null
          tipo_producto?: string
          variedad?: string | null
          version?: string
          vida_util_meses?: number
          vigencia_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "especificaciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "especificaciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      etanol_agua_crc: {
        Row: {
          contraccion_20_pct: number
          pct_pp: number
          pct_vv_20: number
          rho_10: number
          rho_20: number
          rho_25: number
          rho_30: number
        }
        Insert: {
          contraccion_20_pct: number
          pct_pp: number
          pct_vv_20: number
          rho_10: number
          rho_20: number
          rho_25: number
          rho_30: number
        }
        Update: {
          contraccion_20_pct?: number
          pct_pp?: number
          pct_vv_20?: number
          rho_10?: number
          rho_20?: number
          rho_25?: number
          rho_30?: number
        }
        Relationships: []
      }
      formula_componentes: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          densidad_id: string | null
          es_csp: boolean
          etapa: string | null
          formula_id: string
          id: string
          insumo_id: string | null
          nombre_libre: string | null
          observacion: string | null
          orden: number
          porcentaje_pp: number | null
          se_mide_a_volumen: boolean
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          densidad_id?: string | null
          es_csp?: boolean
          etapa?: string | null
          formula_id: string
          id?: string
          insumo_id?: string | null
          nombre_libre?: string | null
          observacion?: string | null
          orden: number
          porcentaje_pp?: number | null
          se_mide_a_volumen?: boolean
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          densidad_id?: string | null
          es_csp?: boolean
          etapa?: string | null
          formula_id?: string
          id?: string
          insumo_id?: string | null
          nombre_libre?: string | null
          observacion?: string | null
          orden?: number
          porcentaje_pp?: number | null
          se_mide_a_volumen?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "formula_componentes_densidad_id_fkey"
            columns: ["densidad_id"]
            isOneToOne: false
            referencedRelation: "densidades_referencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_componentes_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_componentes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_componentes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias_recibidas"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "formula_componentes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["insumo_id"]
          },
        ]
      }
      formula_procedimientos: {
        Row: {
          creado_en: string
          formula_id: string
          id: string
          motivo_cambio: string | null
          redactado_por: string
          requiere_aprobacion: boolean
          texto: string
          version: number
        }
        Insert: {
          creado_en?: string
          formula_id: string
          id?: string
          motivo_cambio?: string | null
          redactado_por?: string
          requiere_aprobacion?: boolean
          texto: string
          version: number
        }
        Update: {
          creado_en?: string
          formula_id?: string
          id?: string
          motivo_cambio?: string | null
          redactado_por?: string
          requiere_aprobacion?: boolean
          texto?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "formula_procedimientos_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas_fabricacion"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas_fabricacion: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          codigo_me: string | null
          creado_en: string
          densidad_producto: number | null
          densidad_temp_c: number | null
          emitida_por: string
          especificacion_id: string | null
          estado: Database["gmp"]["Enums"]["estado_documento_enum"]
          id: string
          producto_id: string
          rendimiento: number
          variedad: string | null
          version: string
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          codigo_me?: string | null
          creado_en?: string
          densidad_producto?: number | null
          densidad_temp_c?: number | null
          emitida_por?: string
          especificacion_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_documento_enum"]
          id?: string
          producto_id: string
          rendimiento?: number
          variedad?: string | null
          version: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          codigo_me?: string | null
          creado_en?: string
          densidad_producto?: number | null
          densidad_temp_c?: number | null
          emitida_por?: string
          especificacion_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_documento_enum"]
          id?: string
          producto_id?: string
          rendimiento?: number
          variedad?: string | null
          version?: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formulas_fabricacion_especificacion_fk"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulas_fabricacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulas_fabricacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      insumos_catalogo: {
        Row: {
          activo: boolean
          capacidad: number | null
          codigo_interno: string
          creado_en: string
          densidad_referencia_id: string | null
          deposito_aprobado_id: string | null
          deposito_cuarentena_id: string | null
          es_inflamable: boolean
          id: string
          nombre: string
          requiere_pesada_recepcion: boolean
          requiere_protocolo: boolean
          tercero_id: string | null
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_capacidad: string | null
          unidad_medida: string | null
        }
        Insert: {
          activo?: boolean
          capacidad?: number | null
          codigo_interno: string
          creado_en?: string
          densidad_referencia_id?: string | null
          deposito_aprobado_id?: string | null
          deposito_cuarentena_id?: string | null
          es_inflamable?: boolean
          id?: string
          nombre: string
          requiere_pesada_recepcion?: boolean
          requiere_protocolo?: boolean
          tercero_id?: string | null
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_capacidad?: string | null
          unidad_medida?: string | null
        }
        Update: {
          activo?: boolean
          capacidad?: number | null
          codigo_interno?: string
          creado_en?: string
          densidad_referencia_id?: string | null
          deposito_aprobado_id?: string | null
          deposito_cuarentena_id?: string | null
          es_inflamable?: boolean
          id?: string
          nombre?: string
          requiere_pesada_recepcion?: boolean
          requiere_protocolo?: boolean
          tercero_id?: string | null
          tipo?: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_capacidad?: string | null
          unidad_medida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumos_catalogo_densidad_referencia_id_fkey"
            columns: ["densidad_referencia_id"]
            isOneToOne: false
            referencedRelation: "densidades_referencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_catalogo_deposito_aprobado_id_fkey"
            columns: ["deposito_aprobado_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_catalogo_deposito_cuarentena_id_fkey"
            columns: ["deposito_cuarentena_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_catalogo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas_operarias: {
        Row: {
          entrada: string
          fecha: string
          id: string
          orden: number
          salida: string
          trabaja: boolean
          usuario_id: string
        }
        Insert: {
          entrada?: string
          fecha: string
          id?: string
          orden?: number
          salida?: string
          trabaja?: boolean
          usuario_id: string
        }
        Update: {
          entrada?: string
          fecha?: string
          id?: string
          orden?: number
          salida?: string
          trabaja?: boolean
          usuario_id?: string
        }
        Relationships: []
      }
      lotes_insumo: {
        Row: {
          bultos_peso_similar: boolean | null
          cantidad_bultos: number
          cantidad_no_declarada: boolean
          cantidad_unidades: number | null
          color_origen: string | null
          contenedores_limpiados: boolean
          creado_en: string
          deposito_actual_id: string | null
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"]
          estiba: string | null
          etiquetas_por_plancha: number | null
          id: string
          insumo_id: string
          lote_proveedor: string | null
          migracion_apertura_id: string | null
          numero_registro_interno: string
          peso_pigmento_kg: number | null
          planchas_etiquetas: number | null
          plazo_validez: string | null
          protocolo_archivo_url: string | null
          protocolo_recibido: boolean | null
          recepcion_id: string | null
          registrado_por: string
          tercero_id: string | null
          total_etiquetas: number | null
          unidad: string
          unidades_contadas: number | null
        }
        Insert: {
          bultos_peso_similar?: boolean | null
          cantidad_bultos: number
          cantidad_no_declarada?: boolean
          cantidad_unidades?: number | null
          color_origen?: string | null
          contenedores_limpiados?: boolean
          creado_en?: string
          deposito_actual_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_calidad_enum"]
          estiba?: string | null
          etiquetas_por_plancha?: number | null
          id?: string
          insumo_id: string
          lote_proveedor?: string | null
          migracion_apertura_id?: string | null
          numero_registro_interno?: string
          peso_pigmento_kg?: number | null
          planchas_etiquetas?: number | null
          plazo_validez?: string | null
          protocolo_archivo_url?: string | null
          protocolo_recibido?: boolean | null
          recepcion_id?: string | null
          registrado_por?: string
          tercero_id?: string | null
          total_etiquetas?: number | null
          unidad: string
          unidades_contadas?: number | null
        }
        Update: {
          bultos_peso_similar?: boolean | null
          cantidad_bultos?: number
          cantidad_no_declarada?: boolean
          cantidad_unidades?: number | null
          color_origen?: string | null
          contenedores_limpiados?: boolean
          creado_en?: string
          deposito_actual_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_calidad_enum"]
          estiba?: string | null
          etiquetas_por_plancha?: number | null
          id?: string
          insumo_id?: string
          lote_proveedor?: string | null
          migracion_apertura_id?: string | null
          numero_registro_interno?: string
          peso_pigmento_kg?: number | null
          planchas_etiquetas?: number | null
          plazo_validez?: string | null
          protocolo_archivo_url?: string | null
          protocolo_recibido?: boolean | null
          recepcion_id?: string | null
          registrado_por?: string
          tercero_id?: string | null
          total_etiquetas?: number | null
          unidad?: string
          unidades_contadas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_deposito_actual_id_fkey"
            columns: ["deposito_actual_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias_recibidas"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "lotes_insumo_migracion_apertura_id_fkey"
            columns: ["migracion_apertura_id"]
            isOneToOne: false
            referencedRelation: "migracion_apertura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_insumo_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_insumo_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "lotes_insumo_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      materiales_acondicionamiento: {
        Row: {
          activo: boolean
          cantidad_por_unidad: number
          categoria: string | null
          creado_en: string
          id: string
          insumo_id: string
          merma: number
          origen: string | null
          producto_id: string
          rol: string | null
        }
        Insert: {
          activo?: boolean
          cantidad_por_unidad: number
          categoria?: string | null
          creado_en?: string
          id?: string
          insumo_id: string
          merma?: number
          origen?: string | null
          producto_id: string
          rol?: string | null
        }
        Update: {
          activo?: boolean
          cantidad_por_unidad?: number
          categoria?: string | null
          creado_en?: string
          id?: string
          insumo_id?: string
          merma?: number
          origen?: string | null
          producto_id?: string
          rol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiales_acondicionamiento_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_acondicionamiento_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_existencias_recibidas"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "materiales_acondicionamiento_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "materiales_acondicionamiento_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiales_acondicionamiento_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      migracion_apertura: {
        Row: {
          archivo_origen: string
          ejecutada_en: string
          ejecutada_por: string
          fecha_corte: string
          hash_archivo: string
          id: string
          observaciones: string | null
        }
        Insert: {
          archivo_origen: string
          ejecutada_en?: string
          ejecutada_por?: string
          fecha_corte: string
          hash_archivo: string
          id?: string
          observaciones?: string | null
        }
        Update: {
          archivo_origen?: string
          ejecutada_en?: string
          ejecutada_por?: string
          fecha_corte?: string
          hash_archivo?: string
          id?: string
          observaciones?: string | null
        }
        Relationships: []
      }
      muestreos: {
        Row: {
          area_muestreo: string
          cantidad_calculada: number | null
          cantidad_contenedores_verificada: number
          cantidad_tomada: number
          categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
          circunstancia_inusual: string | null
          contenedor_integro: boolean
          contenedor_limpio: boolean
          destino_sobrante: Database["gmp"]["Enums"]["destino_muestra_enum"]
          entidad_id: string
          entidad_tipo: string
          envases_muestreados: number | null
          fecha_hora: string
          id: string
          justificacion_cantidad: string | null
          lote_coincide_certificado: boolean | null
          numero: string
          realizado_por: string
          rotulado_correcto: boolean
          signos_no_conformidad: string | null
          tamano_envase_gr: number | null
          unidad: string
        }
        Insert: {
          area_muestreo: string
          cantidad_calculada?: number | null
          cantidad_contenedores_verificada: number
          cantidad_tomada: number
          categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
          circunstancia_inusual?: string | null
          contenedor_integro: boolean
          contenedor_limpio: boolean
          destino_sobrante: Database["gmp"]["Enums"]["destino_muestra_enum"]
          entidad_id: string
          entidad_tipo?: string
          envases_muestreados?: number | null
          fecha_hora?: string
          id?: string
          justificacion_cantidad?: string | null
          lote_coincide_certificado?: boolean | null
          numero?: string
          realizado_por?: string
          rotulado_correcto: boolean
          signos_no_conformidad?: string | null
          tamano_envase_gr?: number | null
          unidad: string
        }
        Update: {
          area_muestreo?: string
          cantidad_calculada?: number | null
          cantidad_contenedores_verificada?: number
          cantidad_tomada?: number
          categoria?: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
          circunstancia_inusual?: string | null
          contenedor_integro?: boolean
          contenedor_limpio?: boolean
          destino_sobrante?: Database["gmp"]["Enums"]["destino_muestra_enum"]
          entidad_id?: string
          entidad_tipo?: string
          envases_muestreados?: number | null
          fecha_hora?: string
          id?: string
          justificacion_cantidad?: string | null
          lote_coincide_certificado?: boolean | null
          numero?: string
          realizado_por?: string
          rotulado_correcto?: boolean
          signos_no_conformidad?: string | null
          tamano_envase_gr?: number | null
          unidad?: string
        }
        Relationships: []
      }
      op_etapas: {
        Row: {
          controlo_en: string | null
          controlo_por: string | null
          datos: Json
          etapa: Database["gmp"]["Enums"]["etapa_orden_enum"]
          id: string
          observaciones: string | null
          orden_id: string
          realizo_en: string
          realizo_por: string
        }
        Insert: {
          controlo_en?: string | null
          controlo_por?: string | null
          datos?: Json
          etapa: Database["gmp"]["Enums"]["etapa_orden_enum"]
          id?: string
          observaciones?: string | null
          orden_id: string
          realizo_en?: string
          realizo_por?: string
        }
        Update: {
          controlo_en?: string | null
          controlo_por?: string | null
          datos?: Json
          etapa?: Database["gmp"]["Enums"]["etapa_orden_enum"]
          id?: string
          observaciones?: string | null
          orden_id?: string
          realizo_en?: string
          realizo_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "op_etapas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_produccion: {
        Row: {
          abierta_en: string
          abierta_por: string
          cantidad_obtenida: number | null
          cantidad_teorica: number
          especificacion_id: string | null
          estado: Database["gmp"]["Enums"]["estado_orden_enum"]
          formula_id: string
          id: string
          jornada: string
          liberada_en: string | null
          liberada_por: string | null
          motivo_cierre: string | null
          numero: string
          numero_lote: string
          observaciones: string | null
          partida: number
          presentacion: number
          presentacion_texto: string | null
          procedimiento_version: number | null
          producto_id: string
          terminada_en: string | null
          terminada_por: string | null
          unidad: string
          unidades_obtenidas: number | null
          vencimiento: string
          vencimiento_texto: string
        }
        Insert: {
          abierta_en?: string
          abierta_por?: string
          cantidad_obtenida?: number | null
          cantidad_teorica: number
          especificacion_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_orden_enum"]
          formula_id: string
          id?: string
          jornada: string
          liberada_en?: string | null
          liberada_por?: string | null
          motivo_cierre?: string | null
          numero: string
          numero_lote: string
          observaciones?: string | null
          partida?: number
          presentacion?: number
          presentacion_texto?: string | null
          procedimiento_version?: number | null
          producto_id: string
          terminada_en?: string | null
          terminada_por?: string | null
          unidad?: string
          unidades_obtenidas?: number | null
          vencimiento: string
          vencimiento_texto: string
        }
        Update: {
          abierta_en?: string
          abierta_por?: string
          cantidad_obtenida?: number | null
          cantidad_teorica?: number
          especificacion_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_orden_enum"]
          formula_id?: string
          id?: string
          jornada?: string
          liberada_en?: string | null
          liberada_por?: string | null
          motivo_cierre?: string | null
          numero?: string
          numero_lote?: string
          observaciones?: string | null
          partida?: number
          presentacion?: number
          presentacion_texto?: string | null
          procedimiento_version?: number | null
          producto_id?: string
          terminada_en?: string | null
          terminada_por?: string | null
          unidad?: string
          unidades_obtenidas?: number | null
          vencimiento?: string
          vencimiento_texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_produccion_especificacion_id_fkey"
            columns: ["especificacion_id"]
            isOneToOne: false
            referencedRelation: "especificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas_fabricacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      pares_volumen_exceso: {
        Row: {
          a: number[]
          calidad: string | null
          compuesto_1_id: string
          compuesto_2_id: string
          creado_en: string
          da_dt: number[]
          fuente: string
          id: string
          notas: string | null
          rango_datos: string | null
          t_ref_c: number
        }
        Insert: {
          a: number[]
          calidad?: string | null
          compuesto_1_id: string
          compuesto_2_id: string
          creado_en?: string
          da_dt: number[]
          fuente: string
          id?: string
          notas?: string | null
          rango_datos?: string | null
          t_ref_c?: number
        }
        Update: {
          a?: number[]
          calidad?: string | null
          compuesto_1_id?: string
          compuesto_2_id?: string
          creado_en?: string
          da_dt?: number[]
          fuente?: string
          id?: string
          notas?: string | null
          rango_datos?: string | null
          t_ref_c?: number
        }
        Relationships: [
          {
            foreignKeyName: "pares_volumen_exceso_compuesto_1_id_fkey"
            columns: ["compuesto_1_id"]
            isOneToOne: false
            referencedRelation: "densidades_referencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pares_volumen_exceso_compuesto_2_id_fkey"
            columns: ["compuesto_2_id"]
            isOneToOne: false
            referencedRelation: "densidades_referencia"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimiento_aprobaciones: {
        Row: {
          aprobado_en: string
          aprobado_por: string
          procedimiento_id: string
        }
        Insert: {
          aprobado_en?: string
          aprobado_por?: string
          procedimiento_id: string
        }
        Update: {
          aprobado_en?: string
          aprobado_por?: string
          procedimiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimiento_aprobaciones_procedimiento_id_fkey"
            columns: ["procedimiento_id"]
            isOneToOne: true
            referencedRelation: "formula_procedimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimiento_aprobaciones_procedimiento_id_fkey"
            columns: ["procedimiento_id"]
            isOneToOne: true
            referencedRelation: "v_procedimiento_vigente"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          codigo_interno: string
          contenido_neto: number | null
          creado_en: string
          forma_cosmetica: string | null
          formula_consultada_en: string | null
          formula_consultada_por: string | null
          id: string
          margen_envasado_pct: number
          minutos_envasado_unidad: number | null
          minutos_etiquetado_unidad: number | null
          nombre: string
          origen: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          personas_envasado: number
          producto_base_id: string | null
          sin_formula: boolean
          solo_reventa: boolean
          tercero_id: string | null
          tipo: string | null
          unidad_contenido: string | null
          variedad: string | null
          vida_util_meses: number | null
        }
        Insert: {
          activo?: boolean
          codigo_interno: string
          contenido_neto?: number | null
          creado_en?: string
          forma_cosmetica?: string | null
          formula_consultada_en?: string | null
          formula_consultada_por?: string | null
          id?: string
          margen_envasado_pct?: number
          minutos_envasado_unidad?: number | null
          minutos_etiquetado_unidad?: number | null
          nombre: string
          origen?: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          personas_envasado?: number
          producto_base_id?: string | null
          sin_formula?: boolean
          solo_reventa?: boolean
          tercero_id?: string | null
          tipo?: string | null
          unidad_contenido?: string | null
          variedad?: string | null
          vida_util_meses?: number | null
        }
        Update: {
          activo?: boolean
          codigo_interno?: string
          contenido_neto?: number | null
          creado_en?: string
          forma_cosmetica?: string | null
          formula_consultada_en?: string | null
          formula_consultada_por?: string | null
          id?: string
          margen_envasado_pct?: number
          minutos_envasado_unidad?: number | null
          minutos_etiquetado_unidad?: number | null
          nombre?: string
          origen?: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          personas_envasado?: number
          producto_base_id?: string | null
          sin_formula?: boolean
          solo_reventa?: boolean
          tercero_id?: string | null
          tipo?: string | null
          unidad_contenido?: string | null
          variedad?: string | null
          vida_util_meses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_producto_base_id_fkey"
            columns: ["producto_base_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_producto_base_id_fkey"
            columns: ["producto_base_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "productos_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          creado_en: string
          creado_por: string
          cuit: string | null
          domicilio: string | null
          estado_aprobacion: Database["gmp"]["Enums"]["aprobacion_proveedor_enum"]
          id: string
          observaciones: string | null
          razon_social: string
          tercero_id: string | null
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_en?: string
          creado_por?: string
          cuit?: string | null
          domicilio?: string | null
          estado_aprobacion?: Database["gmp"]["Enums"]["aprobacion_proveedor_enum"]
          id?: string
          observaciones?: string | null
          razon_social: string
          tercero_id?: string | null
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_en?: string
          creado_por?: string
          cuit?: string | null
          domicilio?: string | null
          estado_aprobacion?: Database["gmp"]["Enums"]["aprobacion_proveedor_enum"]
          id?: string
          observaciones?: string | null
          razon_social?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: true
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      recepciones: {
        Row: {
          cargado_a_stock: boolean
          cargado_en: string | null
          cargado_por: string | null
          coincide_con_pedido: boolean
          creado_en: string
          fecha_hora: string
          id: string
          metodo_pago: string | null
          moneda: string
          monto: number | null
          numero: string
          numero_ap_factura: string | null
          numero_remito: string | null
          observaciones: string | null
          proveedor_id: string
          proveedor_nuevo: boolean
          registrado_por: string
        }
        Insert: {
          cargado_a_stock?: boolean
          cargado_en?: string | null
          cargado_por?: string | null
          coincide_con_pedido: boolean
          creado_en?: string
          fecha_hora?: string
          id?: string
          metodo_pago?: string | null
          moneda?: string
          monto?: number | null
          numero?: string
          numero_ap_factura?: string | null
          numero_remito?: string | null
          observaciones?: string | null
          proveedor_id: string
          proveedor_nuevo?: boolean
          registrado_por?: string
        }
        Update: {
          cargado_a_stock?: boolean
          cargado_en?: string | null
          cargado_por?: string | null
          coincide_con_pedido?: boolean
          creado_en?: string
          fecha_hora?: string
          id?: string
          metodo_pago?: string | null
          moneda?: string
          monto?: number | null
          numero?: string
          numero_ap_factura?: string | null
          numero_remito?: string | null
          observaciones?: string | null
          proveedor_id?: string
          proveedor_nuevo?: boolean
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      recepciones_eliminadas: {
        Row: {
          eliminada_en: string
          eliminada_por: string
          recepcion_id: string
        }
        Insert: {
          eliminada_en?: string
          eliminada_por?: string
          recepcion_id: string
        }
        Update: {
          eliminada_en?: string
          eliminada_por?: string
          recepcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_eliminadas_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: true
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_eliminadas_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: true
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["recepcion_id"]
          },
        ]
      }
      registros_analisis: {
        Row: {
          aprobado: boolean
          conclusiones: string
          controlo_en: string
          controlo_por: string
          descripcion: string
          fecha: string
          id: string
          lote_insumo_id: string | null
          motivo: string | null
          numero: string
          orden_id: string | null
          rectifica_a: string | null
          registro: string
          tamano_muestra: string
        }
        Insert: {
          aprobado: boolean
          conclusiones: string
          controlo_en?: string
          controlo_por?: string
          descripcion: string
          fecha?: string
          id?: string
          lote_insumo_id?: string | null
          motivo?: string | null
          numero: string
          orden_id?: string | null
          rectifica_a?: string | null
          registro: string
          tamano_muestra: string
        }
        Update: {
          aprobado?: boolean
          conclusiones?: string
          controlo_en?: string
          controlo_por?: string
          descripcion?: string
          fecha?: string
          id?: string
          lote_insumo_id?: string | null
          motivo?: string | null
          numero?: string
          orden_id?: string | null
          rectifica_a?: string | null
          registro?: string
          tamano_muestra?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_analisis_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "registros_analisis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_registros_analisis"
            referencedColumns: ["id"]
          },
        ]
      }
      rotulos: {
        Row: {
          color: string | null
          contenido: Json
          emitido_en: string
          emitido_por: string
          entidad_id: string
          entidad_tipo: string
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"]
          id: string
          reemplazado_por: string | null
          tipo_registro: string
          version_formato: string
          vigente: boolean
        }
        Insert: {
          color?: string | null
          contenido: Json
          emitido_en?: string
          emitido_por?: string
          entidad_id: string
          entidad_tipo: string
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"]
          id?: string
          reemplazado_por?: string | null
          tipo_registro: string
          version_formato: string
          vigente?: boolean
        }
        Update: {
          color?: string | null
          contenido?: Json
          emitido_en?: string
          emitido_por?: string
          entidad_id?: string
          entidad_tipo?: string
          estado?: Database["gmp"]["Enums"]["estado_calidad_enum"]
          id?: string
          reemplazado_por?: string | null
          tipo_registro?: string
          version_formato?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rotulos_reemplazado_por_fkey"
            columns: ["reemplazado_por"]
            isOneToOne: false
            referencedRelation: "rotulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotulos_reemplazado_por_fkey"
            columns: ["reemplazado_por"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["rotulo_vigente_id"]
          },
          {
            foreignKeyName: "rotulos_reemplazado_por_fkey"
            columns: ["reemplazado_por"]
            isOneToOne: false
            referencedRelation: "v_muestreos"
            referencedColumns: ["rotulo_id"]
          },
        ]
      }
      tarea_tramos: {
        Row: {
          cantidad: number | null
          cierre: string | null
          id: string
          iniciado_en: string
          iniciado_por: string
          tarea_id: string
          terminado_en: string | null
          terminado_por: string | null
        }
        Insert: {
          cantidad?: number | null
          cierre?: string | null
          id?: string
          iniciado_en?: string
          iniciado_por?: string
          tarea_id: string
          terminado_en?: string | null
          terminado_por?: string | null
        }
        Update: {
          cantidad?: number | null
          cierre?: string | null
          id?: string
          iniciado_en?: string
          iniciado_por?: string
          tarea_id?: string
          terminado_en?: string | null
          terminado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarea_tramos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_planta: {
        Row: {
          anulada: boolean
          asignada_a: string | null
          creada_en: string
          creada_por: string
          descripcion: string | null
          etapa: Database["gmp"]["Enums"]["etapa_orden_enum"] | null
          id: string
          iniciada_en: string | null
          iniciada_por: string | null
          orden_id: string | null
          terminada_en: string | null
          terminada_por: string | null
          visto_en: string | null
          visto_por: string | null
        }
        Insert: {
          anulada?: boolean
          asignada_a?: string | null
          creada_en?: string
          creada_por?: string
          descripcion?: string | null
          etapa?: Database["gmp"]["Enums"]["etapa_orden_enum"] | null
          id?: string
          iniciada_en?: string | null
          iniciada_por?: string | null
          orden_id?: string | null
          terminada_en?: string | null
          terminada_por?: string | null
          visto_en?: string | null
          visto_por?: string | null
        }
        Update: {
          anulada?: boolean
          asignada_a?: string | null
          creada_en?: string
          creada_por?: string
          descripcion?: string | null
          etapa?: Database["gmp"]["Enums"]["etapa_orden_enum"] | null
          id?: string
          iniciada_en?: string | null
          iniciada_por?: string | null
          orden_id?: string | null
          terminada_en?: string | null
          terminada_por?: string | null
          visto_en?: string | null
          visto_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_planta_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_produccion: {
        Row: {
          asignadas: string[]
          cantidad: number | null
          creada_en: string
          creada_por: string
          descripcion: string
          donde_buscar: string | null
          donde_dejar: string | null
          estado: string
          id: string
          notas: string | null
          orden_id: string | null
          prioridad: number
          producto_id: string | null
          terminada_en: string | null
          tipo: string
        }
        Insert: {
          asignadas?: string[]
          cantidad?: number | null
          creada_en?: string
          creada_por?: string
          descripcion: string
          donde_buscar?: string | null
          donde_dejar?: string | null
          estado?: string
          id?: string
          notas?: string | null
          orden_id?: string | null
          prioridad?: number
          producto_id?: string | null
          terminada_en?: string | null
          tipo: string
        }
        Update: {
          asignadas?: string[]
          cantidad?: number | null
          creada_en?: string
          creada_por?: string
          descripcion?: string
          donde_buscar?: string | null
          donde_dejar?: string | null
          estado?: string
          id?: string
          notas?: string | null
          orden_id?: string | null
          prioridad?: number
          producto_id?: string | null
          terminada_en?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_produccion_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      terceros: {
        Row: {
          activo: boolean
          color: string
          creado_en: string
          creado_por: string
          id: string
          nombre: string
          observaciones: string | null
        }
        Insert: {
          activo?: boolean
          color?: string
          creado_en?: string
          creado_por?: string
          id?: string
          nombre: string
          observaciones?: string | null
        }
        Update: {
          activo?: boolean
          color?: string
          creado_en?: string
          creado_por?: string
          id?: string
          nombre?: string
          observaciones?: string | null
        }
        Relationships: []
      }
      tramo_participantes: {
        Row: {
          desde: string
          hasta: string | null
          id: string
          sumada_por: string
          tramo_id: string
          usuario_id: string
        }
        Insert: {
          desde?: string
          hasta?: string | null
          id?: string
          sumada_por?: string
          tramo_id: string
          usuario_id: string
        }
        Update: {
          desde?: string
          hasta?: string | null
          id?: string
          sumada_por?: string
          tramo_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tramo_participantes_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "tarea_tramos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_analisis_pendientes: {
        Row: {
          descripcion: string | null
          desde: string | null
          lote_insumo_id: string | null
          orden_id: string | null
          referencia: string | null
          registro: string | null
          tipo: string | null
        }
        Relationships: []
      }
      v_bloqueos_lote: {
        Row: {
          bloqueado_en: string | null
          bloqueado_por: string | null
          bloqueado_por_nombre: string | null
          detalle: string | null
          id: string | null
          levantado: boolean | null
          levantado_en: string | null
          levantado_motivo: string | null
          levantado_por: string | null
          levantado_por_nombre: string | null
          lote_insumo_id: string | null
          motivo: Database["gmp"]["Enums"]["motivo_bloqueo_enum"] | null
          numero_registro_interno: string | null
          orden_id: string | null
          origen: string | null
          origen_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_lote_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueos_lote_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueos_lote_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
        ]
      }
      v_existencias_recibidas: {
        Row: {
          bultos: number | null
          codigo_interno: string | null
          color_rotulo: string | null
          es_inflamable: boolean | null
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"] | null
          insumo_id: string | null
          insumo_nombre: string | null
          insumo_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          lotes: number | null
          lotes_por_vencer: number | null
          lotes_sin_unidades: number | null
          peso_pigmento_kg: number | null
          total_etiquetas: number | null
          ultimo_ingreso: string | null
          unidad: string | null
          unidades: number | null
          vence_primero: string | null
        }
        Relationships: []
      }
      v_formulas_consultadas: {
        Row: {
          codigo_interno: string | null
          consultada_por: string | null
          formula_consultada_en: string | null
          nombre: string | null
          producto_id: string | null
        }
        Relationships: []
      }
      v_lotes_insumo: {
        Row: {
          cantidad_bultos: number | null
          cantidad_unidades: number | null
          codigo_interno: string | null
          color_rotulo: string | null
          contenedores_limpiados: boolean | null
          creado_en: string | null
          deposito_nombre: string | null
          deposito_numero: string | null
          es_inflamable: boolean | null
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"] | null
          id: string | null
          insumo_id: string | null
          insumo_nombre: string | null
          insumo_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] | null
          lote_proveedor: string | null
          muestreos: number | null
          numero_registro_interno: string | null
          plazo_validez: string | null
          protocolo_recibido: boolean | null
          proveedor: string | null
          proveedor_id: string | null
          recepcion_fecha: string | null
          recepcion_id: string | null
          recepcion_numero: string | null
          requiere_protocolo: boolean | null
          rotulo_emitido_en: string | null
          rotulo_estado: Database["gmp"]["Enums"]["estado_calidad_enum"] | null
          rotulo_vigente_id: string | null
          total_etiquetas: number | null
          unidad: string | null
        }
        Relationships: []
      }
      v_lotes_por_estado: {
        Row: {
          cantidad: number | null
          color_rotulo: string | null
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"] | null
        }
        Relationships: []
      }
      v_muestreos: {
        Row: {
          area_muestreo: string | null
          cantidad_calculada: number | null
          cantidad_contenedores_verificada: number | null
          cantidad_tomada: number | null
          categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"] | null
          circunstancia_inusual: string | null
          codigo_interno: string | null
          contenedor_integro: boolean | null
          contenedor_limpio: boolean | null
          destino_sobrante:
            | Database["gmp"]["Enums"]["destino_muestra_enum"]
            | null
          entidad_id: string | null
          entidad_tipo: string | null
          fecha_hora: string | null
          id: string | null
          insumo_nombre: string | null
          justificacion_cantidad: string | null
          lote_coincide_certificado: boolean | null
          lote_proveedor: string | null
          numero: string | null
          numero_registro_interno: string | null
          proveedor: string | null
          realizado_por_nombre: string | null
          rotulado_correcto: boolean | null
          rotulo_id: string | null
          signos_no_conformidad: string | null
          unidad: string | null
        }
        Relationships: []
      }
      v_pendientes_dt: {
        Row: {
          codigo_interno: string | null
          desde: string | null
          motivo: string | null
          nombre: string | null
          pedido_por: string | null
          producto_id: string | null
          seccion: string | null
        }
        Relationships: []
      }
      v_procedimiento_vigente: {
        Row: {
          aprobado_en: string | null
          aprobado_por: string | null
          creado_en: string | null
          formula_id: string | null
          id: string | null
          motivo_cambio: string | null
          redactado_por: string | null
          redactado_por_nombre: string | null
          texto: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "formula_procedimientos_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "formulas_fabricacion"
            referencedColumns: ["id"]
          },
        ]
      }
      v_produccion_semanal: {
        Row: {
          cantidad: number | null
          producto_id: string | null
          viernes: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_recepciones_por_dia: {
        Row: {
          dia: string | null
          lotes: number | null
          recepciones: number | null
        }
        Relationships: []
      }
      v_registros_analisis: {
        Row: {
          aprobado: boolean | null
          conclusiones: string | null
          controlo_en: string | null
          controlo_nombre: string | null
          controlo_por: string | null
          descripcion: string | null
          fecha: string | null
          id: string | null
          lote_insumo_id: string | null
          lote_interno: string | null
          motivo: string | null
          numero: string | null
          orden_id: string | null
          rectifica_a: string | null
          registro: string | null
          tamano_muestra: string | null
          vigente: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_analisis_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_lote_insumo_id_fkey"
            columns: ["lote_insumo_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "registros_analisis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_analisis_rectifica_a_fkey"
            columns: ["rectifica_a"]
            isOneToOne: true
            referencedRelation: "v_registros_analisis"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tablero: {
        Row: {
          insumos_activos: number | null
          lotes_aprobados: number | null
          lotes_en_analisis: number | null
          lotes_en_cuarentena: number | null
          lotes_por_vencer: number | null
          lotes_rechazados: number | null
          lotes_sin_rotular: number | null
          proveedores_activos: number | null
          proveedores_pendientes: number | null
          recepciones_del_mes: number | null
          recepciones_sin_cargar: number | null
          usuarios_activos: number | null
        }
        Relationships: []
      }
      v_tiempo_medido_producto: {
        Row: {
          minutos_persona: number | null
          minutos_por_unidad: number | null
          producto_id: string | null
          tipo: string | null
          tramos: number | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_trabajo_operarias: {
        Row: {
          cantidad: number | null
          cierre: string | null
          codigo_interno: string | null
          con_quien: string | null
          descripcion: string | null
          entrada: string | null
          fecha: string | null
          fin: string | null
          inicio: string | null
          lote: string | null
          minutos: number | null
          operaria: string | null
          orden_id: string | null
          participacion_id: string | null
          producto: string | null
          producto_id: string | null
          salida: string | null
          tarea_id: string | null
          tipo: string | null
          tramo_id: string | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarea_tramos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_produccion_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_produccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_formulas_consultadas"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "tramo_participantes_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "tarea_tramos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      alta_insumo_tercero: {
        Args: {
          p_es_inflamable?: boolean
          p_nombre: string
          p_tercero_id: string
          p_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          p_unidad: string
        }
        Returns: {
          activo: boolean
          capacidad: number | null
          codigo_interno: string
          creado_en: string
          densidad_referencia_id: string | null
          deposito_aprobado_id: string | null
          deposito_cuarentena_id: string | null
          es_inflamable: boolean
          id: string
          nombre: string
          requiere_pesada_recepcion: boolean
          requiere_protocolo: boolean
          tercero_id: string | null
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_capacidad: string | null
          unidad_medida: string | null
        }
        SetofOptions: {
          from: "*"
          to: "insumos_catalogo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alta_producto_tercero: {
        Args: {
          p_base_id?: string
          p_nombre: string
          p_tercero_id: string
          p_variedad?: string
        }
        Returns: {
          activo: boolean
          codigo_interno: string
          contenido_neto: number | null
          creado_en: string
          forma_cosmetica: string | null
          formula_consultada_en: string | null
          formula_consultada_por: string | null
          id: string
          margen_envasado_pct: number
          minutos_envasado_unidad: number | null
          minutos_etiquetado_unidad: number | null
          nombre: string
          origen: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          personas_envasado: number
          producto_base_id: string | null
          sin_formula: boolean
          solo_reventa: boolean
          tercero_id: string | null
          tipo: string | null
          unidad_contenido: string | null
          variedad: string | null
          vida_util_meses: number | null
        }
        SetofOptions: {
          from: "*"
          to: "productos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      analisis_vigente: {
        Args: { p_lote: string; p_orden: string }
        Returns: boolean
      }
      anular_orden: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      aprobar_especificacion: {
        Args: { p_id: string; p_vigencia?: string }
        Returns: undefined
      }
      asignar_deposito_lote: {
        Args: { p_deposito_id: string; p_lote_id: string }
        Returns: undefined
      }
      asignar_especificacion_orden: {
        Args: { p_especificacion_id: string; p_orden_id: string }
        Returns: undefined
      }
      asignar_estiba_lote: {
        Args: { p_estiba: string; p_lote_id: string }
        Returns: undefined
      }
      asignar_etapa: {
        Args: {
          p_etapa: Database["gmp"]["Enums"]["etapa_orden_enum"]
          p_orden_id: string
          p_usuario: string
        }
        Returns: undefined
      }
      calcular_lote: {
        Args: {
          p_formula_id: string
          p_masa_kg?: number
          p_temp_c?: number
          p_volumen_l?: number
        }
        Returns: Database["gmp"]["CompositeTypes"]["renglon_pesada"][]
        SetofOptions: {
          from: "*"
          to: "renglon_pesada"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cambiar_grupo: {
        Args: { p_entra: boolean; p_tramo_id: string; p_usuario_id: string }
        Returns: undefined
      }
      categoria_muestreo: {
        Args: { p_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] }
        Returns: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
      }
      cerrar_tramo: {
        Args: { p_cantidad?: number; p_cierre: string; p_tramo_id: string }
        Returns: undefined
      }
      color_rotulo: {
        Args: { p_estado: Database["gmp"]["Enums"]["estado_calidad_enum"] }
        Returns: string
      }
      consultar_formula: { Args: { p_producto_id: string }; Returns: undefined }
      control_rapido_materia_prima: {
        Args: {
          p_aprobado: boolean
          p_aspecto_ok: boolean
          p_coincide_protocolo: boolean
          p_contenedor_ok: boolean
          p_contenedores: number
          p_lote_id: string
          p_observacion?: string
          p_olor_ok: boolean
          p_rotulo_ok: boolean
        }
        Returns: {
          aprobado: boolean
          conclusiones: string
          controlo_en: string
          controlo_por: string
          descripcion: string
          fecha: string
          id: string
          lote_insumo_id: string | null
          motivo: string | null
          numero: string
          orden_id: string | null
          rectifica_a: string | null
          registro: string
          tamano_muestra: string
        }
        SetofOptions: {
          from: "*"
          to: "registros_analisis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      control_recepcion_envase: {
        Args: {
          p_aprobado: boolean
          p_aspecto_ok: boolean
          p_cantidad_ok: boolean
          p_contenedor_ok: boolean
          p_lote_id: string
          p_observacion?: string
          p_rotulo_ok: boolean
        }
        Returns: {
          aprobado: boolean
          conclusiones: string
          controlo_en: string
          controlo_por: string
          descripcion: string
          fecha: string
          id: string
          lote_insumo_id: string | null
          motivo: string | null
          numero: string
          orden_id: string | null
          rectifica_a: string | null
          registro: string
          tamano_muestra: string
        }
        SetofOptions: {
          from: "*"
          to: "registros_analisis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      copiar_componentes: {
        Args: { p_destino: string; p_origen: string }
        Returns: number
      }
      copiar_especificacion: {
        Args: { p_codigo_poe: string; p_origen: string; p_producto_id: string }
        Returns: string
      }
      copiar_formula: {
        Args: { p_origen: string; p_producto_id: string }
        Returns: string
      }
      copiar_procedimiento: {
        Args: { p_destino: string; p_origen: string }
        Returns: string
      }
      cumple_parametro: {
        Args: { p_parametro_id: string; p_valor: number }
        Returns: boolean
      }
      densidad_a: {
        Args: { p_densidad_id: string; p_temp_c: number }
        Returns: number
      }
      densidad_mezcla: {
        Args: { p_componentes: Json; p_temp_c?: number }
        Returns: {
          cambio_volumen_pct: number
          densidad_ideal: number
          densidad_real: number
          pares_con_datos: number
          pares_sin_datos: string[]
          sin_masa_molar: string[]
          volumen_exceso_molar: number
        }[]
      }
      densidad_mezcla_formula: {
        Args: { p_formula_id: string; p_temp_c?: number }
        Returns: {
          cambio_volumen_pct: number
          densidad_ideal: number
          densidad_real: number
          pares_con_datos: number
          pares_sin_datos: string[]
          sin_densidad: string[]
          sin_masa_molar: string[]
          volumen_exceso_molar: number
        }[]
      }
      deposito_por_defecto: { Args: { p_insumo_id: string }; Returns: string }
      destino_sobrante_sugerido: {
        Args: {
          p_categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
        }
        Returns: Database["gmp"]["Enums"]["destino_muestra_enum"]
      }
      dictaminar_granel: {
        Args: {
          p_aprobado: boolean
          p_conclusiones: string
          p_descripcion: string
          p_motivo?: string
          p_orden_id: string
          p_rectifica_a?: string
          p_tamano: string
        }
        Returns: {
          aprobado: boolean
          conclusiones: string
          controlo_en: string
          controlo_por: string
          descripcion: string
          fecha: string
          id: string
          lote_insumo_id: string | null
          motivo: string | null
          numero: string
          orden_id: string | null
          rectifica_a: string | null
          registro: string
          tamano_muestra: string
        }
        SetofOptions: {
          from: "*"
          to: "registros_analisis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dictaminar_lote_insumo: {
        Args: {
          p_aprobado: boolean
          p_conclusiones: string
          p_descripcion: string
          p_lote_id: string
          p_tamano: string
        }
        Returns: {
          aprobado: boolean
          conclusiones: string
          controlo_en: string
          controlo_por: string
          descripcion: string
          fecha: string
          id: string
          lote_insumo_id: string | null
          motivo: string | null
          numero: string
          orden_id: string | null
          rectifica_a: string | null
          registro: string
          tamano_muestra: string
        }
        SetofOptions: {
          from: "*"
          to: "registros_analisis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      elegir_deposito_envase: {
        Args: { p_deposito_id: string; p_lote_id: string }
        Returns: undefined
      }
      eliminar_recepcion: {
        Args: { p_recepcion_id: string }
        Returns: undefined
      }
      emitir_rotulo_lote_insumo: {
        Args: {
          p_estado: Database["gmp"]["Enums"]["estado_calidad_enum"]
          p_lote_id: string
        }
        Returns: {
          color: string | null
          contenido: Json
          emitido_en: string
          emitido_por: string
          entidad_id: string
          entidad_tipo: string
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"]
          id: string
          reemplazado_por: string | null
          tipo_registro: string
          version_formato: string
          vigente: boolean
        }
        SetofOptions: {
          from: "*"
          to: "rotulos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      empezar_etapa: {
        Args: {
          p_etapa: Database["gmp"]["Enums"]["etapa_orden_enum"]
          p_orden_id: string
        }
        Returns: {
          anulada: boolean
          asignada_a: string | null
          creada_en: string
          creada_por: string
          descripcion: string | null
          etapa: Database["gmp"]["Enums"]["etapa_orden_enum"] | null
          id: string
          iniciada_en: string | null
          iniciada_por: string | null
          orden_id: string | null
          terminada_en: string | null
          terminada_por: string | null
          visto_en: string | null
          visto_por: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tareas_planta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      empezar_tarea: { Args: { p_id: string }; Returns: undefined }
      es_gestor_tareas: { Args: never; Returns: boolean }
      faltantes_liberacion: {
        Args: { p_id: string }
        Returns: {
          etapa: Database["gmp"]["Enums"]["etapa_orden_enum"]
          falta: string
        }[]
      }
      formula_en_borrador: { Args: { p_formula_id: string }; Returns: boolean }
      grado_alcoholico_a_pp: { Args: { p_pct_vv: number }; Returns: number }
      impedimento_consumo: { Args: { p_lote_id: string }; Returns: string }
      impedimento_despacho: { Args: { p_lote_id: string }; Returns: string }
      impedimento_despacho_orden: {
        Args: { p_orden_id: string }
        Returns: string
      }
      ingresar_insumo_tercero: {
        Args: {
          p_contenedores_limpiados?: boolean
          p_items: Json
          p_observaciones?: string
          p_remito?: string
          p_tercero_id: string
        }
        Returns: string
      }
      iniciar_tarea: {
        Args: { p_con?: string[]; p_tarea_id: string }
        Returns: string
      }
      liberar_orden: {
        Args: { p_aprobado: boolean; p_id: string; p_motivo?: string }
        Returns: undefined
      }
      lote_consumible: { Args: { p_lote_id: string }; Returns: boolean }
      lote_despachable: { Args: { p_lote_id: string }; Returns: boolean }
      lote_es_envase: { Args: { p_lote_id: string }; Returns: boolean }
      lote_es_materia_prima: { Args: { p_lote_id: string }; Returns: boolean }
      marcar_tarea_vista: { Args: { p_id: string }; Returns: undefined }
      nueva_version_especificacion: {
        Args: { p_id: string; p_motivo: string }
        Returns: string
      }
      nueva_version_formula: { Args: { p_formula_id: string }; Returns: string }
      proveedor_de_tercero: { Args: { p_tercero_id: string }; Returns: string }
      puede_trabajar_tarea: { Args: { p_tarea_id: string }; Returns: boolean }
      reanudar_tarea: { Args: { p_tarea_id: string }; Returns: string }
      registrar_muestreo: {
        Args: {
          p_area_muestreo: string
          p_cantidad_contenedores: number
          p_cantidad_tomada: number
          p_circunstancia_inusual?: string
          p_contenedor_integro: boolean
          p_contenedor_limpio: boolean
          p_destino_sobrante: Database["gmp"]["Enums"]["destino_muestra_enum"]
          p_justificacion_cantidad?: string
          p_lote_coincide_certificado?: boolean
          p_lote_id: string
          p_rotulado_correcto: boolean
          p_signos_no_conformidad?: string
          p_unidad: string
        }
        Returns: {
          area_muestreo: string
          cantidad_calculada: number | null
          cantidad_contenedores_verificada: number
          cantidad_tomada: number
          categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
          circunstancia_inusual: string | null
          contenedor_integro: boolean
          contenedor_limpio: boolean
          destino_sobrante: Database["gmp"]["Enums"]["destino_muestra_enum"]
          entidad_id: string
          entidad_tipo: string
          envases_muestreados: number | null
          fecha_hora: string
          id: string
          justificacion_cantidad: string | null
          lote_coincide_certificado: boolean | null
          numero: string
          realizado_por: string
          rotulado_correcto: boolean
          signos_no_conformidad: string | null
          tamano_envase_gr: number | null
          unidad: string
        }
        SetofOptions: {
          from: "*"
          to: "muestreos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      siguiente_numero: {
        Args: { p_ambito: string; p_anio: number }
        Returns: number
      }
      siguiente_numero_analisis: {
        Args: { p_anio: number; p_registro: string }
        Returns: number
      }
      siguiente_numero_orden: { Args: { p_anio: number }; Returns: number }
      tamano_muestra_sugerido: {
        Args: {
          p_cantidad: number
          p_categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
          p_unidad: string
        }
        Returns: Json
      }
      terminar_orden: {
        Args: { p_cantidad: number; p_id: string; p_unidades: number }
        Returns: undefined
      }
      terminar_tarea: { Args: { p_id: string }; Returns: undefined }
      ve_productividad: { Args: never; Returns: boolean }
    }
    Enums: {
      aprobacion_proveedor_enum: "PENDIENTE" | "APROBADO" | "RECHAZADO"
      categoria_muestreo_enum:
        | "MATERIAL_ENVASE_EMPAQUE"
        | "MATERIA_PRIMA"
        | "SEMIELABORADO_GRANEL"
        | "PRODUCTO_TERMINADO"
      destino_muestra_enum:
        | "CONTRAMUESTRA"
        | "DESCARTE"
        | "REUTILIZACION_ENVASE"
      estado_calidad_enum:
        | "RECIBIDO"
        | "CUARENTENA"
        | "MUESTREADO"
        | "EN_ANALISIS"
        | "APROBADO"
        | "RECHAZADO"
        | "SALDO_APERTURA"
      estado_documento_enum:
        | "EN_DESARROLLO"
        | "BORRADOR"
        | "LISTO_PARA_EMITIR"
        | "VIGENTE"
        | "EN_REVISION"
        | "DADO_DE_BAJA"
      estado_orden_enum:
        | "ABIERTA"
        | "TERMINADA"
        | "LIBERADA"
        | "RECHAZADA"
        | "ANULADA"
      etapa_orden_enum:
        | "PESADA"
        | "ELABORACION"
        | "MUESTREO_GRANEL"
        | "CC_GRANEL"
        | "FRACCIONAMIENTO"
        | "MUESTREO_PT"
        | "CC_PT"
        | "CONTRAMUESTRA"
        | "REVISION"
      fuente_densidad_enum:
        | "LITERATURA"
        | "CERTIFICADO_PROVEEDOR"
        | "MEDICION_PROPIA"
        | "FARMACOPEA"
      grupo_parametro_enum:
        | "FISICOQUIMICO"
        | "FUNCIONAL"
        | "ORGANOLEPTICO"
        | "MICROBIOLOGICO"
      motivo_bloqueo_enum:
        | "RETIRO_MERCADO"
        | "NO_CONFORMIDAD"
        | "INVESTIGACION"
        | "VENCIMIENTO"
        | "DECISION_DIRECCION_TECNICA"
        | "EJEMPLO"
      origen_producto_enum: "FABRICADO" | "FRACCIONADO" | "IMPORTADO"
      tipo_contenido_enum:
        | "MATERIA_PRIMA"
        | "ENVASE_EMPAQUE"
        | "GRANEL"
        | "PT_NACIONAL"
        | "PT_IMPORTADO"
        | "CONTRAMUESTRA"
        | "RETIRO_MERCADO"
        | "INFLAMABLES"
      tipo_criterio_enum:
        | "RANGO"
        | "MINIMO"
        | "MAXIMO"
        | "VALOR_TEXTO"
        | "CONTRA_PATRON"
        | "REFERENCIA_EXTERNA"
        | "BINARIO"
      tipo_insumo_enum:
        | "MATERIA_PRIMA"
        | "MATERIAL_ENVASE"
        | "MATERIAL_EMPAQUE"
        | "ETIQUETA"
        | "SEMIELABORADO"
    }
    CompositeTypes: {
      renglon_pesada: {
        orden: number | null
        componente: string | null
        insumo_id: string | null
        codigo_interno: string | null
        porcentaje_pp: number | null
        masa_kg: number | null
        se_mide_a_volumen: boolean | null
        densidad_aplicada: number | null
        volumen_l: number | null
        etapa: string | null
        observacion: string | null
      }
    }
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  comercial: {
    Enums: {
      ambiente_fiscal_enum: ["HOMOLOGACION", "PRODUCCION"],
      clase_gasto_enum: ["FIJO", "OPERATIVO", "INVERSION"],
      comprobante_costo_enum: [
        "FACTURA_A",
        "FACTURA_B",
        "FACTURA_C",
        "NO_DISCRIMINADO",
        "SIN_COMPROBANTE",
      ],
      concepto_accesorio_enum: [
        "FLETE",
        "SEGURO",
        "ARANCELES",
        "DESPACHANTE",
        "OTRO",
      ],
      condicion_iva_enum: [
        "RESPONSABLE_INSCRIPTO",
        "MONOTRIBUTO",
        "EXENTO",
        "CONSUMIDOR_FINAL",
        "NO_ALCANZADO",
        "NO_CATEGORIZADO",
      ],
      destino_cotizacion_enum: ["CLIENTE", "POTENCIAL", "INTERNO"],
      estado_aviso_enum: ["PENDIENTE", "EN_COMPRA", "RESUELTO", "DESCARTADO"],
      estado_cotizacion_enum: ["BORRADOR", "EMITIDA", "ANULADA"],
      estado_factura_enum: ["PENDIENTE", "AUTORIZADA", "RECHAZADA"],
      estado_pedido_enum: [
        "BORRADOR",
        "ESPERANDO_FECHA",
        "FECHA_PROPUESTA",
        "CONFIRMADO",
        "EN_PRODUCCION",
        "CUMPLIDO",
        "CANCELADO",
      ],
      estado_solicitud_pago_enum: [
        "PENDIENTE",
        "APROBADA",
        "PAGADA",
        "RECHAZADA",
        "ANULADA",
      ],
      medio_pago_enum: [
        "EFECTIVO",
        "TRANSFERENCIA",
        "CHEQUE",
        "TARJETA",
        "OTRO",
      ],
      metodo_costeo_enum: ["PEPS", "PPP", "ESTANDAR"],
      motivo_ajuste_enum: [
        "ROTURA",
        "DERRAME",
        "VENCIMIENTO",
        "MERMA_DE_PROCESO",
        "DIFERENCIA_DE_INVENTARIO",
        "ERROR_DE_REGISTRO",
        "ROBO_O_EXTRAVIO",
        "MUESTRA_DE_ARCHIVO",
        "DEVOLUCION_A_PROVEEDOR",
        "DISCONTINUADO",
      ],
      origen_costo_enum: ["RECEPCION", "APERTURA"],
      serie_macro_enum: ["IPC", "TC_A3500_PROMEDIO", "TC_A3500_CIERRE"],
      tipo_comprobante_proveedor_enum: [
        "FACTURA_A",
        "FACTURA_B",
        "FACTURA_C",
        "NOTA_CREDITO_A",
        "NOTA_CREDITO_B",
        "NOTA_CREDITO_C",
        "SIN_FACTURA",
      ],
      tipo_cuenta_fondos_enum: ["CAJA", "BANCO", "BILLETERA"],
      tipo_documento_enum: ["CUIT", "CUIL", "DNI", "SIN_IDENTIFICAR"],
      tipo_linea_cotizacion_enum: ["CATALOGO", "NUEVO", "LIBRE"],
      tipo_movimiento_enum: [
        "ENTRADA_COMPRA",
        "ENTRADA_PRODUCCION",
        "ENTRADA_DEVOLUCION",
        "ENTRADA_AJUSTE",
        "SALIDA_VENTA",
        "SALIDA_CONSUMO_PRODUCCION",
        "SALIDA_MUESTRA",
        "SALIDA_DESCARTE",
        "SALIDA_AJUSTE",
        "SALIDA_RETIRO_MERCADO",
        "TRANSFERENCIA_ENTRE_DEPOSITOS",
        "ENTRADA_SALDO_APERTURA",
        "ENTRADA_PROVISTO_TERCERO",
      ],
      tipo_movimiento_fondos_enum: [
        "INGRESO",
        "EGRESO",
        "TRANSFERENCIA",
        "AJUSTE",
      ],
    },
  },
  core: {
    Enums: {
      rol_enum: [
        "OPERARIO",
        "CONTROL_CALIDAD",
        "DIRECCION_TECNICA",
        "ADMINISTRACION",
        "GERENCIA_PRODUCCION",
        "GERENCIA",
        "ADMINISTRADOR_SISTEMA",
        "ENCARGADA_STOCK",
        "VENTAS",
        "FINANZAS",
        "RECEPCION",
        "PRODUCCION",
      ],
      sector_enum: [
        "ADMINISTRACION",
        "RECEPCION_EXPEDICION",
        "DEPOSITO",
        "PRODUCCION",
        "CONTROL_CALIDAD",
        "GARANTIA_CALIDAD",
        "MANTENIMIENTO",
        "DIRECCION_TECNICA",
        "GERENCIA",
      ],
    },
  },
  gmp: {
    Enums: {
      aprobacion_proveedor_enum: ["PENDIENTE", "APROBADO", "RECHAZADO"],
      categoria_muestreo_enum: [
        "MATERIAL_ENVASE_EMPAQUE",
        "MATERIA_PRIMA",
        "SEMIELABORADO_GRANEL",
        "PRODUCTO_TERMINADO",
      ],
      destino_muestra_enum: [
        "CONTRAMUESTRA",
        "DESCARTE",
        "REUTILIZACION_ENVASE",
      ],
      estado_calidad_enum: [
        "RECIBIDO",
        "CUARENTENA",
        "MUESTREADO",
        "EN_ANALISIS",
        "APROBADO",
        "RECHAZADO",
        "SALDO_APERTURA",
      ],
      estado_documento_enum: [
        "EN_DESARROLLO",
        "BORRADOR",
        "LISTO_PARA_EMITIR",
        "VIGENTE",
        "EN_REVISION",
        "DADO_DE_BAJA",
      ],
      estado_orden_enum: [
        "ABIERTA",
        "TERMINADA",
        "LIBERADA",
        "RECHAZADA",
        "ANULADA",
      ],
      etapa_orden_enum: [
        "PESADA",
        "ELABORACION",
        "MUESTREO_GRANEL",
        "CC_GRANEL",
        "FRACCIONAMIENTO",
        "MUESTREO_PT",
        "CC_PT",
        "CONTRAMUESTRA",
        "REVISION",
      ],
      fuente_densidad_enum: [
        "LITERATURA",
        "CERTIFICADO_PROVEEDOR",
        "MEDICION_PROPIA",
        "FARMACOPEA",
      ],
      grupo_parametro_enum: [
        "FISICOQUIMICO",
        "FUNCIONAL",
        "ORGANOLEPTICO",
        "MICROBIOLOGICO",
      ],
      motivo_bloqueo_enum: [
        "RETIRO_MERCADO",
        "NO_CONFORMIDAD",
        "INVESTIGACION",
        "VENCIMIENTO",
        "DECISION_DIRECCION_TECNICA",
        "EJEMPLO",
      ],
      origen_producto_enum: ["FABRICADO", "FRACCIONADO", "IMPORTADO"],
      tipo_contenido_enum: [
        "MATERIA_PRIMA",
        "ENVASE_EMPAQUE",
        "GRANEL",
        "PT_NACIONAL",
        "PT_IMPORTADO",
        "CONTRAMUESTRA",
        "RETIRO_MERCADO",
        "INFLAMABLES",
      ],
      tipo_criterio_enum: [
        "RANGO",
        "MINIMO",
        "MAXIMO",
        "VALOR_TEXTO",
        "CONTRA_PATRON",
        "REFERENCIA_EXTERNA",
        "BINARIO",
      ],
      tipo_insumo_enum: [
        "MATERIA_PRIMA",
        "MATERIAL_ENVASE",
        "MATERIAL_EMPAQUE",
        "ETIQUETA",
        "SEMIELABORADO",
      ],
    },
  },
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
