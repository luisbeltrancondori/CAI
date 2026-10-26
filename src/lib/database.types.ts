export interface Database {
  public: {
    Tables: {
      cai_establecimientos: {
        Row: {
          id: string
          nombre: string
          nivel: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          nivel?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          nivel?: string | null
          created_at?: string
        }
        Relationships: []
      }
      cai_operadores: {
        Row: {
          id: string
          nombre_completo: string
          telefono: string | null
          establecimiento_id: string
          usuario: string
          contrasena_hash: string | null
          password_hash: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nombre_completo: string
          telefono?: string | null
          establecimiento_id: string
          usuario: string
          contrasena_hash?: string | null
          password_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nombre_completo?: string
          telefono?: string | null
          establecimiento_id?: string
          usuario?: string
          contrasena_hash?: string
          password_hash?: string | null
          created_at?: string
        }
        Relationships: []
      }
      cai_grupos: {
        Row: {
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          id?: string
          nombre: string
          orden: number
        }
        Update: {
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      cai_indicadores: {
        Row: {
          id: string
          grupo_id: string
          numero_indicador: string
          descripcion: string
          numerador_explicacion: string | null
          denominador_explicacion: string | null
        }
        Insert: {
          id?: string
          grupo_id: string
          numero_indicador: string
          descripcion: string
          numerador_explicacion?: string | null
          denominador_explicacion?: string | null
        }
        Update: {
          id?: string
          grupo_id?: string
          numero_indicador?: string
          descripcion?: string
          numerador_explicacion?: string | null
          denominador_explicacion?: string | null
        }
        Relationships: []
      }
      cai_config_establecimiento: {
        Row: {
          establecimiento_id: string
          indicador_id: string
          gestion: number
          compromiso_gestion: number
          poblacion_programada: number
        }
        Insert: {
          establecimiento_id: string
          indicador_id: string
          gestion: number
          compromiso_gestion: number
          poblacion_programada: number
        }
        Update: {
          establecimiento_id?: string
          indicador_id?: string
          gestion?: number
          compromiso_gestion?: number
          poblacion_programada?: number
        }
        Relationships: []
      }
      cai_registros_mensuales: {
        Row: {
          establecimiento_id: string
          indicador_id: string
          gestion: number
          mes: number
          valor_numerador: number
          valor_denominador: number | null
        }
        Insert: {
          establecimiento_id: string
          indicador_id: string
          gestion: number
          mes: number
          valor_numerador: number
          valor_denominador?: number | null
        }
        Update: {
          establecimiento_id?: string
          indicador_id?: string
          gestion?: number
          mes?: number
          valor_numerador?: number
          valor_denominador?: number | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      cai_operador_login: {
        Args: {
          p_usuario: string
          p_contrasena: string
        }
        Returns: {
          id: string
          nombre_completo: string
          telefono: string | null
          establecimiento_id: string
          establecimiento_nombre: string
          usuario: string
        }[]
      }
      cai_operador_registrar: {
        Args: {
          p_nombre_completo: string
          p_telefono: string
          p_establecimiento_id: string
          p_usuario: string
          p_contrasena: string
        }
        Returns: {
          id: string
          nombre_completo: string
          telefono: string | null
          establecimiento_id: string
          establecimiento_nombre: string
          usuario: string
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
