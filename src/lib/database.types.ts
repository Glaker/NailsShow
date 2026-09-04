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
        ]
      }
    }
    Functions: {
      adjuntar_auditoria: { Args: { p_tabla: unknown }; Returns: undefined }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
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
      insumos_catalogo: {
        Row: {
          activo: boolean
          codigo_interno: string
          creado_en: string
          deposito_aprobado_id: string | null
          deposito_cuarentena_id: string | null
          es_inflamable: boolean
          id: string
          nombre: string
          requiere_pesada_recepcion: boolean
          requiere_protocolo: boolean
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_medida: string
        }
        Insert: {
          activo?: boolean
          codigo_interno: string
          creado_en?: string
          deposito_aprobado_id?: string | null
          deposito_cuarentena_id?: string | null
          es_inflamable?: boolean
          id?: string
          nombre: string
          requiere_pesada_recepcion?: boolean
          requiere_protocolo?: boolean
          tipo: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_medida: string
        }
        Update: {
          activo?: boolean
          codigo_interno?: string
          creado_en?: string
          deposito_aprobado_id?: string | null
          deposito_cuarentena_id?: string | null
          es_inflamable?: boolean
          id?: string
          nombre?: string
          requiere_pesada_recepcion?: boolean
          requiere_protocolo?: boolean
          tipo?: Database["gmp"]["Enums"]["tipo_insumo_enum"]
          unidad_medida?: string
        }
        Relationships: [
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
          cantidad_unidades: number | null
          contenedores_limpiados: boolean
          creado_en: string
          deposito_actual_id: string | null
          estado: Database["gmp"]["Enums"]["estado_calidad_enum"]
          etiquetas_por_plancha: number | null
          id: string
          insumo_id: string
          lote_proveedor: string
          numero_registro_interno: string
          peso_pigmento_kg: number | null
          planchas_etiquetas: number | null
          plazo_validez: string | null
          protocolo_archivo_url: string | null
          protocolo_recibido: boolean | null
          recepcion_id: string
          registrado_por: string
          total_etiquetas: number | null
          unidad: string
          unidades_contadas: number | null
        }
        Insert: {
          bultos_peso_similar?: boolean | null
          cantidad_bultos: number
          cantidad_unidades?: number | null
          contenedores_limpiados?: boolean
          creado_en?: string
          deposito_actual_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_calidad_enum"]
          etiquetas_por_plancha?: number | null
          id?: string
          insumo_id: string
          lote_proveedor: string
          numero_registro_interno?: string
          peso_pigmento_kg?: number | null
          planchas_etiquetas?: number | null
          plazo_validez?: string | null
          protocolo_archivo_url?: string | null
          protocolo_recibido?: boolean | null
          recepcion_id: string
          registrado_por?: string
          total_etiquetas?: number | null
          unidad: string
          unidades_contadas?: number | null
        }
        Update: {
          bultos_peso_similar?: boolean | null
          cantidad_bultos?: number
          cantidad_unidades?: number | null
          contenedores_limpiados?: boolean
          creado_en?: string
          deposito_actual_id?: string | null
          estado?: Database["gmp"]["Enums"]["estado_calidad_enum"]
          etiquetas_por_plancha?: number | null
          id?: string
          insumo_id?: string
          lote_proveedor?: string
          numero_registro_interno?: string
          peso_pigmento_kg?: number | null
          planchas_etiquetas?: number | null
          plazo_validez?: string | null
          protocolo_archivo_url?: string | null
          protocolo_recibido?: boolean | null
          recepcion_id?: string
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
            referencedRelation: "v_lotes_insumo"
            referencedColumns: ["insumo_id"]
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
        ]
      }
    }
    Views: {
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
      color_rotulo: {
        Args: { p_estado: Database["gmp"]["Enums"]["estado_calidad_enum"] }
        Returns: string
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
      siguiente_numero: {
        Args: { p_ambito: string; p_anio: number }
        Returns: number
      }
    }
    Enums: {
      aprobacion_proveedor_enum: "PENDIENTE" | "APROBADO" | "RECHAZADO"
      estado_calidad_enum:
        | "RECIBIDO"
        | "CUARENTENA"
        | "MUESTREADO"
        | "EN_ANALISIS"
        | "APROBADO"
        | "RECHAZADO"
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
      [_ in never]: never
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
    Enums: {},
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
      estado_calidad_enum: [
        "RECIBIDO",
        "CUARENTENA",
        "MUESTREADO",
        "EN_ANALISIS",
        "APROBADO",
        "RECHAZADO",
      ],
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
