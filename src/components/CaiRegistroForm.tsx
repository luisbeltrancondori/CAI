import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { Database } from '../lib/database.types'

type Indicador = Database['public']['Tables']['cai_indicadores']['Row']
type Grupo = Database['public']['Tables']['cai_grupos']['Row']

type CaiRegistroFormProps = {
  establecimientoId: string
  grupoId: string
  grupos: Grupo[]
  onGrupoChange: (grupoId: string) => void
  gestion?: number
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const inputClassName =
  'mt-2 block w-full rounded-xl border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-cai-600 focus:ring-cai-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') return message
  }

  return 'Ocurrió un error inesperado.'
}

export function CaiRegistroForm({
  establecimientoId,
  grupoId,
  grupos,
  onGrupoChange,
  gestion = 2026,
}: CaiRegistroFormProps) {
  const [indicadores, setIndicadores] = useState<Indicador[]>([])
  const [indicadorId, setIndicadorId] = useState('')
  const [mes, setMes] = useState('')
  const [compromiso, setCompromiso] = useState('')
  const [poblacion, setPoblacion] = useState('')
  const [numerador, setNumerador] = useState('')
  const [isLoadingIndicadores, setIsLoadingIndicadores] = useState(false)
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isLoadingRegistro, setIsLoadingRegistro] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string }>()

  useEffect(() => {
    let active = true
    setIndicadores([])
    setIndicadorId('')
    setMes('')
    setCompromiso('')
    setPoblacion('')
    setNumerador('')

    if (!grupoId) {
      setIsLoadingIndicadores(false)
      return () => {
        active = false
      }
    }

    async function loadIndicadores() {
      setIsLoadingIndicadores(true)
      try {
        const { data, error } = await getSupabaseClient()
          .from('cai_indicadores')
          .select('id, grupo_id, numero_indicador, descripcion, numerador_explicacion, denominador_explicacion')
          .eq('grupo_id', grupoId)
        if (error) throw error
        if (active) {
          const indicadoresOrdenados = (data ?? []).sort((a, b) => {
            const numA = Number.parseInt(a.numero_indicador, 10) || 0
            const numB = Number.parseInt(b.numero_indicador, 10) || 0
            return numA - numB
          })
          setIndicadores(indicadoresOrdenados)
        }
      } catch (error) {
        if (active) {
          setNotice({ type: 'error', text: `No se pudieron cargar los indicadores: ${errorMessage(error)}` })
        }
      } finally {
        if (active) setIsLoadingIndicadores(false)
      }
    }

    void loadIndicadores()
    return () => {
      active = false
    }
  }, [grupoId])

  useEffect(() => {
    let active = true
    setCompromiso('')
    setPoblacion('')

    if (!indicadorId) {
      setIsLoadingConfig(false)
      return () => {
        active = false
      }
    }

    async function loadConfig() {
      setIsLoadingConfig(true)
      try {
        const { data, error } = await getSupabaseClient()
          .from('cai_config_establecimiento')
          .select('compromiso_gestion, poblacion_programada')
          .eq('establecimiento_id', establecimientoId)
          .eq('indicador_id', indicadorId)
          .eq('gestion', gestion)
          .maybeSingle()
        if (error) throw error
        if (active && data) {
          setCompromiso(String(data.compromiso_gestion))
          setPoblacion(String(data.poblacion_programada))
        }
      } catch (error) {
        if (active) {
          setNotice({ type: 'error', text: `No se pudo cargar la configuración anual: ${errorMessage(error)}` })
        }
      } finally {
        if (active) setIsLoadingConfig(false)
      }
    }

    void loadConfig()
    return () => {
      active = false
    }
  }, [establecimientoId, gestion, indicadorId])

  useEffect(() => {
    let active = true
    setNumerador('')

    if (!indicadorId || !mes) {
      setIsLoadingRegistro(false)
      return () => {
        active = false
      }
    }

    async function loadRegistro() {
      setIsLoadingRegistro(true)
      try {
        const { data, error } = await getSupabaseClient()
          .from('cai_registros_mensuales')
          .select('valor_numerador')
          .eq('establecimiento_id', establecimientoId)
          .eq('indicador_id', indicadorId)
          .eq('gestion', gestion)
          .eq('mes', Number(mes))
          .maybeSingle()
        if (error) throw error
        if (active && data) setNumerador(String(data.valor_numerador))
      } catch (error) {
        if (active) {
          setNotice({ type: 'error', text: `No se pudo cargar el registro mensual: ${errorMessage(error)}` })
        }
      } finally {
        if (active) setIsLoadingRegistro(false)
      }
    }

    void loadRegistro()
    return () => {
      active = false
    }
  }, [establecimientoId, gestion, indicadorId, mes])

  const indicadorSeleccionado = indicadores.find((item) => item.id === indicadorId)

  function handleIndicadorChange(value: string) {
    setNotice(undefined)
    setIndicadorId(value)
  }

  function handleMesChange(value: string) {
    setNotice(undefined)
    setMes(value)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(undefined)

    if (!establecimientoId.trim()) {
      setNotice({ type: 'error', text: 'Debe seleccionar o configurar un establecimiento válido.' })
      return
    }

    const compromisoValue = Number(compromiso)
    const poblacionValue = Number(poblacion)
    const numeradorValue = Number(numerador)

    if (
      !indicadorId ||
      !mes ||
      compromiso.trim() === '' ||
      poblacion.trim() === '' ||
      numerador.trim() === '' ||
      !Number.isFinite(compromisoValue) ||
      !Number.isFinite(poblacionValue) ||
      !Number.isFinite(numeradorValue) ||
      compromisoValue < 0 ||
      poblacionValue < 0 ||
      numeradorValue < 0
    ) {
      setNotice({ type: 'error', text: 'Complete todos los campos con valores numéricos válidos, iguales o mayores a cero.' })
      return
    }

    setIsSaving(true)
    try {
      const supabase = getSupabaseClient()
      const { error: configError } = await supabase
        .from('cai_config_establecimiento')
        .upsert(
          {
            establecimiento_id: establecimientoId,
            indicador_id: indicadorId,
            gestion,
            compromiso_gestion: compromisoValue,
            poblacion_programada: poblacionValue,
          },
          { onConflict: 'establecimiento_id,indicador_id,gestion' },
        )

      if (configError) throw new Error(`No se pudo guardar la configuración anual: ${configError.message}`)

      const { error: registroError } = await supabase
        .from('cai_registros_mensuales')
        .upsert(
          {
            establecimiento_id: establecimientoId,
            indicador_id: indicadorId,
            gestion,
            mes: Number(mes),
            valor_numerador: numeradorValue,
          },
          { onConflict: 'establecimiento_id,indicador_id,gestion,mes' },
        )

      if (registroError) {
        throw new Error(
          `La configuración anual se guardó, pero no se pudo guardar el registro mensual: ${registroError.message}`,
        )
      }

      setNotice({ type: 'success', text: 'La configuración y el registro mensual se guardaron correctamente.' })
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      <section aria-labelledby="seleccion-heading" className="space-y-5">
        <div>
          <h2 id="seleccion-heading" className="text-lg font-semibold text-slate-900">
            Selección de grupo e indicador
          </h2>
          <p className="mt-1 text-sm text-slate-500">Seleccione un grupo para filtrar sus indicadores.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Grupo de indicadores
            <select
              className={inputClassName}
              value={grupoId}
              onChange={(event) => onGrupoChange(event.target.value)}
              disabled={grupos.length === 0}
              required
            >
              {grupos.length === 0 ? (
                <option value="">No hay grupos disponibles</option>
              ) : (
                grupos.map((grupo) => (
                  <option key={grupo.id} value={grupo.id}>
                    {grupo.nombre}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Indicador
            <select
              className={inputClassName}
              value={indicadorId}
              onChange={(event) => handleIndicadorChange(event.target.value)}
              disabled={!grupoId || isLoadingIndicadores || indicadores.length === 0}
              required
            >
              <option value="">
                {!grupoId
                  ? 'Seleccione primero un grupo'
                  : isLoadingIndicadores
                    ? 'Cargando indicadores…'
                    : indicadores.length === 0
                      ? 'No hay indicadores para este grupo'
                      : 'Seleccione un indicador'}
              </option>
              {indicadores.map((indicador) => (
                <option key={indicador.id} value={indicador.id}>
                  {indicador.numero_indicador}. {indicador.descripcion}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {indicadorSeleccionado && (
        <section aria-labelledby="guia-heading" className="rounded-2xl border border-cai-100 bg-cai-50/70 p-5">
          <h2 id="guia-heading" className="text-base font-semibold text-cai-900">
            Guía explicativa del indicador
          </h2>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-cai-700">Numerador</dt>
              <dd className="mt-1 text-sm leading-6 text-slate-700">
                {indicadorSeleccionado.numerador_explicacion || 'Sin explicación registrada.'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-cai-700">Denominador</dt>
              <dd className="mt-1 text-sm leading-6 text-slate-700">
                {indicadorSeleccionado.denominador_explicacion || 'Sin explicación registrada.'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section aria-labelledby="config-heading" className="space-y-5">
        <div>
          <h2 id="config-heading" className="text-lg font-semibold text-slate-900">
            Configuración anual · {gestion}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Los valores existentes se cargan al elegir el indicador.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Compromiso de Gestión (meta)
            <input
              className={inputClassName}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Ej. 0.96"
              value={compromiso}
              onChange={(event) => setCompromiso(event.target.value)}
              disabled={!indicadorId || isLoadingConfig}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Población programada
            <input
              className={inputClassName}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Ej. 250"
              value={poblacion}
              onChange={(event) => setPoblacion(event.target.value)}
              disabled={!indicadorId || isLoadingConfig}
              required
            />
          </label>
        </div>
        {isLoadingConfig && <p className="text-xs text-slate-500">Consultando configuración guardada…</p>}
      </section>

      <section aria-labelledby="mensual-heading" className="space-y-5">
        <div>
          <h2 id="mensual-heading" className="text-lg font-semibold text-slate-900">
            Registro mensual
          </h2>
          <p className="mt-1 text-sm text-slate-500">Seleccione el mes e ingrese el numerador alcanzado.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Mes
            <select
              className={inputClassName}
              value={mes}
              onChange={(event) => handleMesChange(event.target.value)}
              disabled={!indicadorId}
              required
            >
              <option value="">Seleccione un mes</option>
              {MESES.map((nombre, index) => (
                <option key={nombre} value={index + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Numerador alcanzado en el mes
            <input
              className={inputClassName}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Ingrese el valor alcanzado"
              value={numerador}
              onChange={(event) => setNumerador(event.target.value)}
              disabled={!mes || isLoadingRegistro}
              required
            />
          </label>
        </div>
        {isLoadingRegistro && <p className="text-xs text-slate-500">Consultando registro mensual…</p>}
      </section>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Establecimiento · {establecimientoId}</p>
        <button
          type="submit"
          disabled={!indicadorId || !mes || isSaving || isLoadingConfig || isLoadingRegistro}
          className="inline-flex items-center justify-center rounded-xl bg-cai-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cai-900 focus:outline-none focus:ring-2 focus:ring-cai-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving ? 'Guardando…' : 'Guardar Registro Mensual'}
        </button>
      </div>
    </form>
  )
}
