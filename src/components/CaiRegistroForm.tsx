import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { Database } from '../lib/database.types'
import {
  calculateDropoutRate,
  getDropoutSourceIndicators,
  getProductivityLevel,
  isCalculatedDropoutIndicator,
  isMonthlyProductivityIndicator,
} from '../lib/indicatorMetrics'

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
  const [denominador, setDenominador] = useState('')
  const [dosisPrimera, setDosisPrimera] = useState<number | null>(null)
  const [dosisSegunda, setDosisSegunda] = useState<number | null>(null)
  const [isLoadingDesercion, setIsLoadingDesercion] = useState(false)
  const [isLoadingIndicadores, setIsLoadingIndicadores] = useState(false)
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isLoadingRegistro, setIsLoadingRegistro] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string }>()
  const indicadorSeleccionado = indicadores.find((item) => item.id === indicadorId)
  const isCalculatedDropout = isCalculatedDropoutIndicator(indicadorSeleccionado)
  const isSrpDropout = Number(indicadorSeleccionado?.numero_indicador) === 14
  const isProductivity = isMonthlyProductivityIndicator(indicadorSeleccionado, grupos)
  const dropoutRate = dosisPrimera === null || dosisSegunda === null
    ? null
    : calculateDropoutRate(dosisPrimera, dosisSegunda)

  useEffect(() => {
    let active = true
    setIndicadores([])
    setIndicadorId('')
    setMes('')
    setCompromiso('')
    setPoblacion('')
    setNumerador('')
    setDenominador('')
    setDosisPrimera(null)
    setDosisSegunda(null)

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

    const selectedIndicator = indicadores.find((item) => item.id === indicadorId)
    if (
      isMonthlyProductivityIndicator(selectedIndicator, grupos) ||
      isCalculatedDropoutIndicator(selectedIndicator)
    ) {
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
  }, [establecimientoId, gestion, indicadorId, indicadores, grupos])

  useEffect(() => {
    let active = true
    setNumerador('')
    setDenominador('')
    setDosisPrimera(null)
    setDosisSegunda(null)

    if (!indicadorId || !mes) {
      setIsLoadingRegistro(false)
      setIsLoadingDesercion(false)
      return () => {
        active = false
      }
    }

    const selectedIndicator = indicadores.find((item) => item.id === indicadorId)
    if (isCalculatedDropoutIndicator(selectedIndicator)) {
      const { firstDose, finalDose } = getDropoutSourceIndicators(selectedIndicator, indicadores)
      if (!firstDose || !finalDose) {
        setIsLoadingDesercion(false)
        setNotice({
          type: 'error',
          text: isSrpDropout
            ? 'No se encontraron los indicadores 12 y 13 en el catálogo.'
            : 'No se encontró el indicador 57 o no se pudo identificar de forma única la 3ra dosis pentavalente.',
        })
        return () => {
          active = false
        }
      }
      const firstDoseIndicatorId = firstDose.id
      const finalDoseIndicatorId = finalDose.id

      async function loadSrpDoseTotals() {
        setIsLoadingDesercion(true)
        try {
          const { data, error } = await getSupabaseClient()
            .from('cai_registros_mensuales')
            .select('indicador_id, valor_numerador')
            .eq('establecimiento_id', establecimientoId)
            .eq('gestion', gestion)
            .lte('mes', Number(mes))
            .in('indicador_id', [firstDoseIndicatorId, finalDoseIndicatorId])
          if (error) throw error
          if (active) {
            const firstDoses = (data ?? [])
              .filter((record) => record.indicador_id === firstDoseIndicatorId)
              .reduce((total, record) => total + Number(record.valor_numerador || 0), 0)
            const secondDoses = (data ?? [])
              .filter((record) => record.indicador_id === finalDoseIndicatorId)
              .reduce((total, record) => total + Number(record.valor_numerador || 0), 0)
            setDosisPrimera(firstDoses)
            setDosisSegunda(secondDoses)
          }
        } catch (error) {
          if (active) {
            setNotice({
              type: 'error',
              text: `No se pudieron calcular las dosis del indicador de deserción: ${errorMessage(error)}`,
            })
          }
        } finally {
          if (active) setIsLoadingDesercion(false)
        }
      }

      void loadSrpDoseTotals()
      return () => {
        active = false
      }
    }

    async function loadRegistro() {
      setIsLoadingRegistro(true)
      try {
        const { data, error } = await getSupabaseClient()
          .from('cai_registros_mensuales')
          .select('valor_numerador, valor_denominador')
          .eq('establecimiento_id', establecimientoId)
          .eq('indicador_id', indicadorId)
          .eq('gestion', gestion)
          .eq('mes', Number(mes))
          .maybeSingle()
        if (error) throw error
        if (active && data) {
          setNumerador(String(data.valor_numerador))
          setDenominador(data.valor_denominador === null ? '' : String(data.valor_denominador))
        }
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
  }, [establecimientoId, gestion, indicadorId, mes, indicadores])

  const denominatorValue = Number(denominador)
  const monthlyNumerator = Number(numerador)
  const productivityRate =
    numerador.trim() !== '' &&
    denominador.trim() !== '' &&
    Number.isFinite(monthlyNumerator) &&
    monthlyNumerator >= 0 &&
    Number.isFinite(denominatorValue) &&
    denominatorValue > 0
      ? monthlyNumerator / denominatorValue
      : null
  const productivityLevel = getProductivityLevel(productivityRate)

  function handleIndicadorChange(value: string) {
    setNotice(undefined)
    setIndicadorId(value)
    setDenominador('')
  }

  function handleMesChange(value: string) {
    setNotice(undefined)
    setMes(value)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(undefined)

    if (isCalculatedDropout) {
      setNotice({
        type: 'error',
        text: `El Indicador ${indicadorSeleccionado?.numero_indicador} es calculado automáticamente y no admite registros manuales.`,
      })
      return
    }

    if (!establecimientoId.trim()) {
      setNotice({ type: 'error', text: 'Debe seleccionar o configurar un establecimiento válido.' })
      return
    }

    const compromisoValue = Number(compromiso)
    const poblacionValue = Number(poblacion)
    const numeradorValue = Number(numerador)
    const monthlyDenominator = Number(denominador)

    const hasInvalidMonthlyValues =
      !indicadorId ||
      !mes ||
      numerador.trim() === '' ||
      !Number.isFinite(numeradorValue) ||
      numeradorValue < 0 ||
      (isProductivity &&
        (denominador.trim() === '' ||
          !Number.isFinite(monthlyDenominator) ||
          monthlyDenominator < 0))
    const hasInvalidAnnualValues =
      compromiso.trim() === '' ||
      poblacion.trim() === '' ||
      !Number.isFinite(compromisoValue) ||
      !Number.isFinite(poblacionValue) ||
      compromisoValue < 0 ||
      poblacionValue < 0

    if (hasInvalidMonthlyValues || (!isProductivity && hasInvalidAnnualValues)) {
      setNotice({ type: 'error', text: 'Complete todos los campos con valores numéricos válidos, iguales o mayores a cero.' })
      return
    }

    setIsSaving(true)
    try {
      const supabase = getSupabaseClient()
      if (!isProductivity) {
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
      }

      const { error: registroError } = await supabase
        .from('cai_registros_mensuales')
        .upsert(
          {
            establecimiento_id: establecimientoId,
            indicador_id: indicadorId,
            gestion,
            mes: Number(mes),
            valor_numerador: numeradorValue,
            valor_denominador: isProductivity ? monthlyDenominator : null,
          },
          { onConflict: 'establecimiento_id,indicador_id,gestion,mes' },
        )

      if (registroError) {
        throw new Error(
          `La configuración anual se guardó, pero no se pudo guardar el registro mensual: ${registroError.message}`,
        )
      }

      setNotice({
        type: 'success',
        text: isProductivity
          ? 'El registro mensual de productividad se guardó correctamente.'
          : 'La configuración y el registro mensual se guardaron correctamente.',
      })
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
              {indicadores.filter((indicador) => indicador.grupo_id === grupoId).map((indicador) => (
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

      {!isProductivity && !isCalculatedDropout && (
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
              step={isProductivity ? '1' : 'any'}
              inputMode={isProductivity ? 'numeric' : 'decimal'}
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
      )}

      {isCalculatedDropout ? (
        <section aria-labelledby="mensual-heading" className="space-y-5">
          <div>
            <h2 id="mensual-heading" className="text-lg font-semibold text-slate-900">
              {isSrpDropout
                ? `Índice de Deserción SRP · ${gestion}`
                : `Índice de Deserción 3ra Pentavalente · ${gestion}`}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isSrpDropout
                ? 'Resultado automático con dosis acumuladas de los indicadores 12 y 13 hasta el mes seleccionado.'
                : 'Resultado automático con dosis acumuladas de los indicadores 57 y 3ra dosis pentavalente hasta el mes seleccionado.'}
            </p>
          </div>
          <label className="block max-w-md text-sm font-medium text-slate-700">
            Mes de corte
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
          <div
            className={`rounded-xl border px-4 py-4 ${
              dropoutRate === null
                ? 'border-slate-200 bg-slate-50 text-slate-800'
                : dropoutRate < 0 || dropoutRate >= 5
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
            aria-live="polite"
          >
            {isLoadingDesercion ? (
              <p className="text-sm">
                {isSrpDropout
                  ? 'Calculando con los registros de los indicadores 12 y 13…'
                  : 'Calculando con los registros del indicador 57 y de la 3ra dosis pentavalente…'}
              </p>
            ) : (
              <>
                <p className="text-lg font-bold">
                  {isSrpDropout ? 'Índice de Deserción SRP:' : 'Índice de Deserción 3ra Pentavalente:'}{' '}
                  {dropoutRate === null ? 'No evaluable (sin primeras dosis)' : `${dropoutRate.toFixed(2)}%`}
                </p>
                <p className="mt-2 text-sm">
                  1ras dosis: {dosisPrimera === null ? '—' : dosisPrimera} · {isSrpDropout ? '2das dosis' : '3ras dosis'}:{' '}
                  {dosisSegunda === null ? '—' : dosisSegunda}
                </p>
                <p className="mt-1 text-xs">
                  Meta: menor al 5%. El cálculo usa ((1ras dosis − dosis finales) ÷ 1ras dosis) × 100.
                </p>
              </>
            )}
          </div>
        </section>
      ) : (
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
            {isProductivity
              ? 'Total actividades clínicas realizadas'
              : 'Numerador alcanzado en el mes'}
            <input
              className={inputClassName}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Ingrese el valor alcanzado"
              value={numerador}
              onChange={(event) => setNumerador(event.target.value)}
              disabled={!mes || isLoadingRegistro}
              required
            />
          </label>
          {isProductivity && (
            <label className="block text-sm font-medium text-slate-700">
              Total de consultas (Nuevas y Repetidas)
              <input
                className={inputClassName}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="Ingrese el total de consultas"
                value={denominador}
                onChange={(event) => setDenominador(event.target.value)}
                disabled={!mes || isLoadingRegistro}
                required
              />
            </label>
          )}
        </div>
        {isProductivity && (
          <div
            className="rounded-xl border border-cai-100 bg-cai-50 px-4 py-3 text-sm text-cai-900"
            aria-live="polite"
          >
            <p className="font-semibold">
              Tasa del mes:{' '}
              {productivityRate === null ? 'No evaluable (sin consultas)' : productivityRate.toFixed(2)}
              {' · '}
              {productivityLevel}
            </p>
            <p className="mt-1 text-xs text-cai-800">
              Se calcula como actividades clínicas ÷ consultas. El registro conserva ambos valores.
            </p>
            <p className="mt-1 text-xs text-cai-800">
              Rangos: Bajo 0–0.25 · Regular 0.26–0.59 · Bueno 0.60–0.75 · Muy bueno 0.76–1.00.
            </p>
          </div>
        )}
        {isLoadingRegistro && <p className="text-xs text-slate-500">Consultando registro mensual…</p>}
      </section>
      )}

      {!isCalculatedDropout && (
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
      )}
    </form>
  )
}
