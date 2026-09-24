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
    PostgrestVersion: "14.5"
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
          nota: string | null
          pedido_id: string | null
          proveedor_id: string | null
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
          nota?: string | null
          pedido_id?: string | null
          proveedor_id?: string | null
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
          nota?: string | null
          pedido_id?: string | null
          proveedor_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          unidad?: string
        }
        Relationships: [
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
            foreignKeyName: "avisos_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_proveedores_por_insumo"
            referencedColumns: ["proveedor_id"]
          },
        ]
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
      movimientos_pt: {
        Row: {
          anula_a_movimiento_id: string | null
          cantidad: number
          deposito_id: string
          documento_id: string | null
          documento_tipo: string | null
          id: string
          lote_texto: string | null
          motivo: string | null
          ocurrido_en: string
          orden: number
          producto_id: string
          registrado_por: string
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
        }
        Insert: {
          anula_a_movimiento_id?: string | null
          cantidad: number
          deposito_id: string
          documento_id?: string | null
          documento_tipo?: string | null
          id?: string
          lote_texto?: string | null
          motivo?: string | null
          ocurrido_en?: string
          orden?: never
          producto_id: string
          registrado_por?: string
          tipo: Database["comercial"]["Enums"]["tipo_movimiento_enum"]
        }
        Update: {
          anula_a_movimiento_id?: string | null
          cantidad?: number
          deposito_id?: string
          documento_id?: string | null
          documento_tipo?: string | null
          id?: string
          lote_texto?: string | null
          motivo?: string | null
          ocurrido_en?: string
          orden?: never
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
          unidad?: string
        }
        Relationships: [
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
        ]
      }
      pedido_renglones: {
        Row: {
          cantidad: number
          id: string
          pedido_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          pedido_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          pedido_id?: string
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
        ]
      }
      pedidos: {
        Row: {
          cliente: string
          creado_en: string
          creado_por: string
          estado: Database["comercial"]["Enums"]["estado_pedido_enum"]
          fecha: string
          fecha_entrega: string | null
          id: string
          numero: string
          observaciones: string | null
        }
        Insert: {
          cliente: string
          creado_en?: string
          creado_por?: string
          estado?: Database["comercial"]["Enums"]["estado_pedido_enum"]
          fecha?: string
          fecha_entrega?: string | null
          id?: string
          numero: string
          observaciones?: string | null
        }
        Update: {
          cliente?: string
          creado_en?: string
          creado_por?: string
          estado?: Database["comercial"]["Enums"]["estado_pedido_enum"]
          fecha?: string
          fecha_entrega?: string | null
          id?: string
          numero?: string
          observaciones?: string | null
        }
        Relationships: []
      }
      reservas_stock: {
        Row: {
          cantidad: number
          creado_en: string
          creado_por: string
          id: string
          insumo_id: string
          liberada: boolean
          liberada_en: string | null
          pedido_id: string | null
          unidad: string
          vence_en: string
        }
        Insert: {
          cantidad: number
          creado_en?: string
          creado_por?: string
          id?: string
          insumo_id: string
          liberada?: boolean
          liberada_en?: string | null
          pedido_id?: string | null
          unidad: string
          vence_en?: string
        }
        Update: {
          cantidad?: number
          creado_en?: string
          creado_por?: string
          id?: string
          insumo_id?: string
          liberada?: boolean
          liberada_en?: string | null
          pedido_id?: string | null
          unidad?: string
          vence_en?: string
        }
        Relationships: [
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
        ]
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
          saldo: number | null
          ultimo_movimiento: string | null
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
    }
    Functions: {
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
      articulo_de_insumo: { Args: { p_insumo_id: string }; Returns: string }
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
      necesidad_pedido: {
        Args: { p_pedido_id: string }
        Returns: {
          insumo_id: string
          necesario: number
        }[]
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
      terminar_pedido: {
        Args: { p_consumos?: Json; p_pedido_id: string }
        Returns: undefined
      }
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
    }
    Enums: {
      estado_aviso_enum: "PENDIENTE" | "EN_COMPRA" | "RESUELTO" | "DESCARTADO"
      estado_pedido_enum:
        | "BORRADOR"
        | "CONFIRMADO"
        | "EN_PRODUCCION"
        | "CUMPLIDO"
        | "CANCELADO"
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
      usuarios: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          creado_en: string
          documento: string | null
          email: string | null
          es_dt_titular: boolean
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
          id: string | null
          nombre_completo: string | null
          rol: Database["core"]["Enums"]["rol_enum"] | null
        }
        Insert: {
          activo?: boolean | null
          id?: string | null
          nombre_completo?: string | null
          rol?: Database["core"]["Enums"]["rol_enum"] | null
        }
        Update: {
          activo?: boolean | null
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
      es_escritura_privilegiada: {
        Args: { p_db_role: string }
        Returns: boolean
      }
      es_rol: {
        Args: { p_roles: Database["core"]["Enums"]["rol_enum"][] }
        Returns: boolean
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
          lote_insumo_id: string
          motivo: Database["gmp"]["Enums"]["motivo_bloqueo_enum"]
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
          lote_insumo_id: string
          motivo: Database["gmp"]["Enums"]["motivo_bloqueo_enum"]
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
          lote_insumo_id?: string
          motivo?: Database["gmp"]["Enums"]["motivo_bloqueo_enum"]
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
      formula_componentes: {
        Row: {
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
            foreignKeyName: "formulas_fabricacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos_catalogo: {
        Row: {
          activo: boolean
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
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_medida: string | null
        }
        Insert: {
          activo?: boolean
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
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_medida?: string | null
        }
        Update: {
          activo?: boolean
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
          tipo?: Database["gmp"]["Enums"]["tipo_insumo_enum"]
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
        ]
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
          etiquetas_por_plancha: number | null
          id: string
          insumo_id: string
          lote_proveedor: string
          migracion_apertura_id: string | null
          numero_registro_interno: string
          peso_pigmento_kg: number | null
          planchas_etiquetas: number | null
          plazo_validez: string | null
          protocolo_archivo_url: string | null
          protocolo_recibido: boolean | null
          recepcion_id: string | null
          registrado_por: string
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
          etiquetas_por_plancha?: number | null
          id?: string
          insumo_id: string
          lote_proveedor: string
          migracion_apertura_id?: string | null
          numero_registro_interno?: string
          peso_pigmento_kg?: number | null
          planchas_etiquetas?: number | null
          plazo_validez?: string | null
          protocolo_archivo_url?: string | null
          protocolo_recibido?: boolean | null
          recepcion_id?: string | null
          registrado_por?: string
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
          etiquetas_por_plancha?: number | null
          id?: string
          insumo_id?: string
          lote_proveedor?: string
          migracion_apertura_id?: string | null
          numero_registro_interno?: string
          peso_pigmento_kg?: number | null
          planchas_etiquetas?: number | null
          plazo_validez?: string | null
          protocolo_archivo_url?: string | null
          protocolo_recibido?: boolean | null
          recepcion_id?: string | null
          registrado_por?: string
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
        ]
      }
      materiales_acondicionamiento: {
        Row: {
          activo: boolean
          cantidad_por_unidad: number
          creado_en: string
          id: string
          insumo_id: string
          merma: number
          origen: string | null
          producto_id: string
        }
        Insert: {
          activo?: boolean
          cantidad_por_unidad: number
          creado_en?: string
          id?: string
          insumo_id: string
          merma?: number
          origen?: string | null
          producto_id: string
        }
        Update: {
          activo?: boolean
          cantidad_por_unidad?: number
          creado_en?: string
          id?: string
          insumo_id?: string
          merma?: number
          origen?: string | null
          producto_id?: string
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
      productos: {
        Row: {
          activo: boolean
          codigo_interno: string
          creado_en: string
          forma_cosmetica: string | null
          id: string
          nombre: string
          origen: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          tipo: string | null
          variedad: string | null
          vida_util_meses: number | null
        }
        Insert: {
          activo?: boolean
          codigo_interno: string
          creado_en?: string
          forma_cosmetica?: string | null
          id?: string
          nombre: string
          origen?: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          tipo?: string | null
          variedad?: string | null
          vida_util_meses?: number | null
        }
        Update: {
          activo?: boolean
          codigo_interno?: string
          creado_en?: string
          forma_cosmetica?: string | null
          id?: string
          nombre?: string
          origen?: Database["gmp"]["Enums"]["origen_producto_enum"] | null
          tipo?: string | null
          variedad?: string | null
          vida_util_meses?: number | null
        }
        Relationships: []
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
        }
        Relationships: []
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
          numero_remito: string
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
          numero_remito: string
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
          numero_remito?: string
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
    }
    Views: {
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
      v_recepciones_por_dia: {
        Row: {
          dia: string | null
          lotes: number | null
          recepciones: number | null
        }
        Relationships: []
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
    }
    Functions: {
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
      categoria_muestreo: {
        Args: { p_tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"] }
        Returns: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
      }
      color_rotulo: {
        Args: { p_estado: Database["gmp"]["Enums"]["estado_calidad_enum"] }
        Returns: string
      }
      densidad_a: {
        Args: { p_densidad_id: string; p_temp_c: number }
        Returns: number
      }
      destino_sobrante_sugerido: {
        Args: {
          p_categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
        }
        Returns: Database["gmp"]["Enums"]["destino_muestra_enum"]
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
      impedimento_consumo: { Args: { p_lote_id: string }; Returns: string }
      impedimento_despacho: { Args: { p_lote_id: string }; Returns: string }
      lote_consumible: { Args: { p_lote_id: string }; Returns: boolean }
      lote_despachable: { Args: { p_lote_id: string }; Returns: boolean }
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
      tamano_muestra_sugerido: {
        Args: {
          p_cantidad: number
          p_categoria: Database["gmp"]["Enums"]["categoria_muestreo_enum"]
          p_unidad: string
        }
        Returns: Json
      }
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
      fuente_densidad_enum:
        | "LITERATURA"
        | "CERTIFICADO_PROVEEDOR"
        | "MEDICION_PROPIA"
        | "FARMACOPEA"
      motivo_bloqueo_enum:
        | "RETIRO_MERCADO"
        | "NO_CONFORMIDAD"
        | "INVESTIGACION"
        | "VENCIMIENTO"
        | "DECISION_DIRECCION_TECNICA"
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
      estado_aviso_enum: ["PENDIENTE", "EN_COMPRA", "RESUELTO", "DESCARTADO"],
      estado_pedido_enum: [
        "BORRADOR",
        "CONFIRMADO",
        "EN_PRODUCCION",
        "CUMPLIDO",
        "CANCELADO",
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
      ],
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
      fuente_densidad_enum: [
        "LITERATURA",
        "CERTIFICADO_PROVEEDOR",
        "MEDICION_PROPIA",
        "FARMACOPEA",
      ],
      motivo_bloqueo_enum: [
        "RETIRO_MERCADO",
        "NO_CONFORMIDAD",
        "INVESTIGACION",
        "VENCIMIENTO",
        "DECISION_DIRECCION_TECNICA",
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
