import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CircleCheck,
  Download,
  Eye,
  Target,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { Database } from '../lib/database.types'
import {
  calculateDropoutRate,
  getDropoutSourceIndicators,
  getProductivityLevel,
  isCalculatedDropoutIndicator,
  isMonthlyProductivityIndicator,
  isSrpDropoutIndicator,
} from '../lib/indicatorMetrics'

type Establecimiento = Pick<Database['public']['Tables']['cai_establecimientos']['Row'], 'id' | 'nombre'>
type Grupo = Pick<Database['public']['Tables']['cai_grupos']['Row'], 'id' | 'nombre' | 'orden'>
type Indicador = Pick<
  Database['public']['Tables']['cai_indicadores']['Row'],
  | 'id'
  | 'grupo_id'
  | 'numero_indicador'
  | 'descripcion'
  | 'numerador_explicacion'
  | 'denominador_explicacion'
>
type Configuracion = Pick<
  Database['public']['Tables']['cai_config_establecimiento']['Row'],
  'establecimiento_id' | 'indicador_id' | 'compromiso_gestion' | 'poblacion_programada'
>
type RegistroMensual = Pick<
  Database['public']['Tables']['cai_registros_mensuales']['Row'],
  'establecimiento_id' | 'indicador_id' | 'mes' | 'valor_numerador' | 'valor_denominador'
>

type ReporteEstablecimiento = {
  id: string
  nombre: string
  poblacion: number
  atendidos: number
  primerSemestre: number
  incrementoSegundoSemestre: number
  incrementoAtendidos: number
  porcentajeJunio: number
  porcentajeIncremento: number
  cobertura: number
  meta: number | null
  avanceMeta: number | null
  brechaMeta: number | null
  tasaProductividad: number | null
  tasaDesercion: number | null
}

type EstadoSemaforo = {
  label:
    | 'COLOR ROJO'
    | 'COLOR AMARILLO'
    | 'COLOR VERDE'
    | 'SIN META'
    | 'BAJO'
    | 'REGULAR'
    | 'BUENO'
    | 'MUY BUENO'
    | 'SIN DATOS'
    | 'ADECUADO'
    | 'SOBRE EL LÍMITE'
  shortLabel: 'Rojo' | 'Amarillo' | 'Verde' | 'Sin meta' | 'Bajo' | 'Regular' | 'Bueno' | 'Muy bueno' | 'Sin datos' | 'Adecuado' | 'Sobre el límite'
  dotClass: string
  badgeClass: string
}

type CaiReportesProps = {
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

const selectClassName =
  'block w-full rounded-xl border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-cai-600 focus:ring-cai-600'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') return message
  }
  return 'Ocurrió un error inesperado.'
}

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => Promise<{
    data: T[] | null
    error: { message: string } | null
  }>,
): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await loadPage(from, from + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
    from += pageSize
  }
}

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0

  const normalized = value.trim().replace(/%/g, '').replace(/,/g, '.')
  if (!normalized) return 0

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function asPercentage(value: number): number {
  return value <= 1 ? value * 100 : value
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(value)
}

function formatPercentage(value: number | null): string {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`
}

function formatProductivityRate(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function getEstadoSemaforo(cumplimientoMeta: number | null): EstadoSemaforo {
  if (cumplimientoMeta === null) {
    return {
      label: 'SIN META',
      shortLabel: 'Sin meta',
      dotClass: 'bg-slate-400',
      badgeClass: 'bg-slate-100 text-slate-700',
    }
  }

  if (cumplimientoMeta <= 50) {
    return {
      label: 'COLOR ROJO',
      shortLabel: 'Rojo',
      dotClass: 'bg-red-500',
      badgeClass: 'bg-red-100 text-red-800',
    }
  }

  if (cumplimientoMeta <= 80) {
    return {
      label: 'COLOR AMARILLO',
      shortLabel: 'Amarillo',
      dotClass: 'bg-amber-400',
      badgeClass: 'bg-amber-100 text-amber-900',
    }
  }

  return {
    label: 'COLOR VERDE',
    shortLabel: 'Verde',
    dotClass: 'bg-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-800',
  }
}

function getProductivitySemaforo(rate: number | null): EstadoSemaforo {
  const level = getProductivityLevel(rate)
  if (level === 'Bajo') {
    return { label: 'BAJO', shortLabel: level, dotClass: 'bg-red-500', badgeClass: 'bg-red-100 text-red-800' }
  }
  if (level === 'Regular') {
    return { label: 'REGULAR', shortLabel: level, dotClass: 'bg-amber-400', badgeClass: 'bg-amber-100 text-amber-900' }
  }
  if (level === 'Bueno') {
    return { label: 'BUENO', shortLabel: level, dotClass: 'bg-sky-500', badgeClass: 'bg-sky-100 text-sky-900' }
  }
  if (level === 'Muy bueno') {
    return { label: 'MUY BUENO', shortLabel: level, dotClass: 'bg-emerald-600', badgeClass: 'bg-emerald-100 text-emerald-800' }
  }
  return { label: 'SIN META', shortLabel: 'Sin meta', dotClass: 'bg-slate-400', badgeClass: 'bg-slate-100 text-slate-700' }
}

function getDropoutSemaforo(rate: number | null): EstadoSemaforo {
  if (rate === null || !Number.isFinite(rate)) {
    return { label: 'SIN DATOS', shortLabel: 'Sin datos', dotClass: 'bg-slate-400', badgeClass: 'bg-slate-100 text-slate-700' }
  }
  if (rate >= 0 && rate < 5) {
    return { label: 'ADECUADO', shortLabel: 'Adecuado', dotClass: 'bg-emerald-600', badgeClass: 'bg-emerald-100 text-emerald-800' }
  }
  return { label: 'SOBRE EL LÍMITE', shortLabel: 'Sobre el límite', dotClass: 'bg-red-500', badgeClass: 'bg-red-100 text-red-800' }
}

function escapeCsv(value: string | number): string {
  const text = String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function isReporteEstablecimiento(value: unknown): value is ReporteEstablecimiento {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nombre' in value &&
    typeof value.nombre === 'string' &&
    'cobertura' in value &&
    typeof value.cobertura === 'number' &&
    'porcentajeJunio' in value &&
    typeof value.porcentajeJunio === 'number' &&
    'porcentajeIncremento' in value &&
    typeof value.porcentajeIncremento === 'number' &&
    'brechaMeta' in value &&
    (typeof value.brechaMeta === 'number' || value.brechaMeta === null)
  )
}

function CoverageTooltip({
  active,
  payload,
  label,
  incrementalLabel,
  firstSemesterLabel,
  isProductivity,
  isDropout,
  dropoutName,
}: TooltipProps<number, string> & {
  incrementalLabel: string
  firstSemesterLabel: string
  isProductivity: boolean
  isDropout: boolean
  dropoutName: string
}) {
  const row = payload?.map((item) => item.payload).find(isReporteEstablecimiento)
  if (!active || !row) return null

  const values = isDropout
    ? [
        { label: '1ras dosis acumuladas', value: row.poblacion, color: '#2F6B3F', percentage: false },
        { label: 'Dosis finales acumuladas', value: row.atendidos, color: '#D32E3A', percentage: false },
        { label: dropoutName, value: row.tasaDesercion, color: '#334155', percentage: true },
      ]
    : [
        { label: firstSemesterLabel, value: row.porcentajeJunio, color: '#2F6B3F', percentage: isProductivity },
        { label: incrementalLabel, value: row.porcentajeIncremento, color: '#D32E3A', percentage: isProductivity },
        { label: isProductivity ? 'Tasa actividades/consultas' : 'Cobertura Total Acumulada', value: row.cobertura, color: '#334155', percentage: isProductivity },
      ]

  return (
    <div className="min-w-56 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="mb-3 text-sm font-bold text-slate-900">{String(label ?? row.nombre)}</p>
      <dl className="space-y-2">
        {values.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 text-xs">
            <dt className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </dt>
            <dd className="font-semibold text-slate-900">
              {item.value === null
                ? '—'
                : item.percentage
                  ? formatPercentage(item.value)
                  : isProductivity
                    ? formatProductivityRate(item.value)
                    : formatPercentage(item.value)}
            </dd>
          </div>
        ))}
        {!isProductivity && !isDropout && (
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-2 text-xs">
            <dt className="text-slate-600">Brecha restante para la meta</dt>
            <dd className="font-semibold text-rose-700">
              {row.brechaMeta === null ? 'Sin meta' : formatPercentage(row.brechaMeta)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  accent,
  breakdown,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  accent: string
  breakdown?: {
    firstLabel: string
    firstValue: number
    incrementLabel: string
    incrementValue: number
    incrementPrefix?: string
    formatAsRatio?: boolean
  }
}) {
  const Icon = icon

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`} aria-hidden="true">
          <Icon size={21} strokeWidth={1.8} />
        </span>
      </div>
      {breakdown && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="text-slate-500">{breakdown.firstLabel}</span>
            <span className="font-semibold text-amber-600">
              {breakdown.formatAsRatio
                ? formatProductivityRate(breakdown.firstValue)
                : formatPercentage(breakdown.firstValue)}
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-slate-500">{breakdown.incrementLabel}</span>
            <span className="font-semibold text-emerald-600">
              {breakdown.incrementPrefix ?? '+'}
              {breakdown.formatAsRatio
                ? formatProductivityRate(breakdown.incrementValue)
                : formatPercentage(breakdown.incrementValue)}
            </span>
          </span>
        </div>
      )}
    </article>
  )
}

export function CaiReportes({ gestion = 2026 }: CaiReportesProps) {
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [indicadores, setIndicadores] = useState<Indicador[]>([])
  const [configuraciones, setConfiguraciones] = useState<Configuracion[]>([])
  const [registros, setRegistros] = useState<RegistroMensual[]>([])
  const [establecimientoId, setEstablecimientoId] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [indicadorId, setIndicadorId] = useState('')
  const [establecimientoModal, setEstablecimientoModal] = useState<Pick<Establecimiento, 'id' | 'nombre'> | null>(null)
  const [mes, setMes] = useState(12)
  const [isLoadingCatalogos, setIsLoadingCatalogos] = useState(true)
  const [isLoadingIndicadores, setIsLoadingIndicadores] = useState(false)
  const [isLoadingDatos, setIsLoadingDatos] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadCatalogos() {
      setIsLoadingCatalogos(true)
      setError('')
      try {
        const supabase = getSupabaseClient()
        const [establecimientosResponse, gruposResponse] = await Promise.all([
          supabase.from('cai_establecimientos').select('id, nombre').order('nombre'),
          supabase.from('cai_grupos').select('id, nombre, orden').order('orden'),
        ])
        if (establecimientosResponse.error) throw establecimientosResponse.error
        if (gruposResponse.error) throw gruposResponse.error
        if (active) {
          setEstablecimientos(establecimientosResponse.data ?? [])
          setGrupos(gruposResponse.data ?? [])
        }
      } catch (loadError) {
        if (active) setError(`No se pudieron cargar los filtros: ${errorMessage(loadError)}`)
      } finally {
        if (active) setIsLoadingCatalogos(false)
      }
    }

    void loadCatalogos()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setIndicadores([])
    setIndicadorId('')

    async function loadIndicadores() {
      setIsLoadingIndicadores(true)
      try {
        let query = getSupabaseClient()
          .from('cai_indicadores')
          .select('id, grupo_id, numero_indicador, descripcion, numerador_explicacion, denominador_explicacion')
        const { data, error: queryError } = await query
        if (queryError) throw queryError
        if (active) {
          const sortedIndicators = (data ?? []).sort(
            (a, b) => (Number.parseInt(a.numero_indicador, 10) || 0) - (Number.parseInt(b.numero_indicador, 10) || 0),
          )
          setIndicadores(sortedIndicators)
        }
      } catch (loadError) {
        if (active) setError(`No se pudieron cargar los indicadores del filtro: ${errorMessage(loadError)}`)
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
    setConfiguraciones([])
    setRegistros([])

    if (!grupoId || !indicadorId) {
      setIsLoadingDatos(false)
      return () => {
        active = false
      }
    }

    if (isLoadingCatalogos || isLoadingIndicadores) {
      setIsLoadingDatos(true)
      return () => {
        active = false
      }
    }

    const selectedIndicatorForFetch = indicadores.find(
      (indicador) => indicador.id === indicadorId && indicador.grupo_id === grupoId,
    )
    const dropoutSources = selectedIndicatorForFetch && isCalculatedDropoutIndicator(selectedIndicatorForFetch)
      ? Object.values(getDropoutSourceIndicators(selectedIndicatorForFetch, indicadores))
          .filter((indicator): indicator is Indicador => Boolean(indicator))
      : []
    const indicadorIds = selectedIndicatorForFetch
      ? [selectedIndicatorForFetch.id, ...dropoutSources.map((indicator) => indicator.id)]
      : []

    if (indicadorIds.length === 0) {
      setIsLoadingDatos(false)
      return () => {
        active = false
      }
    }

    async function loadData() {
      setIsLoadingDatos(true)
      setError('')
      try {
        const supabase = getSupabaseClient()
        const loadConfiguraciones = () =>
          fetchAllPages(async (from, to) => {
            let query = supabase
              .from('cai_config_establecimiento')
              .select('establecimiento_id, indicador_id, compromiso_gestion, poblacion_programada')
              .eq('gestion', gestion)
              .eq('indicador_id', indicadorId)
            return await query.range(from, to)
          })
        const loadRegistros = () =>
          fetchAllPages(async (from, to) => {
            let query = supabase
              .from('cai_registros_mensuales')
              .select('establecimiento_id, indicador_id, mes, valor_numerador, valor_denominador')
              .eq('gestion', gestion)
              .lte('mes', 12)
              .in('indicador_id', indicadorIds)
            return await query.range(from, to)
          })

        const [configData, registroData] = await Promise.all([loadConfiguraciones(), loadRegistros()])
        if (active) {
          setConfiguraciones(configData)
          setRegistros(registroData)
        }
      } catch (loadError) {
        if (active) setError(`No se pudieron cargar los datos de cobertura: ${errorMessage(loadError)}`)
      } finally {
        if (active) setIsLoadingDatos(false)
      }
    }

    void loadData()
    return () => {
      active = false
    }
  }, [
    establecimientoId,
    gestion,
    grupoId,
    indicadorId,
    indicadores,
    isLoadingCatalogos,
    isLoadingIndicadores,
    mes,
  ])

  const selectedIndicator = indicadores.find((indicador) => indicador.id === indicadorId)
  const hasRequiredSelection =
    Boolean(grupoId) && selectedIndicator?.grupo_id === grupoId
  const isProductivityIndicator =
    hasRequiredSelection && isMonthlyProductivityIndicator(selectedIndicator, grupos)
  const isDropoutIndicator =
    hasRequiredSelection && isCalculatedDropoutIndicator(selectedIndicator)
  const isSrpDropout =
    isDropoutIndicator && isSrpDropoutIndicator(selectedIndicator)
  const dropoutName = isSrpDropout ? 'Deserción SRP' : 'Deserción 3ra Pentavalente'
  const dropoutSourceIndicators = isDropoutIndicator && selectedIndicator
    ? Object.values(getDropoutSourceIndicators(selectedIndicator, indicadores))
        .filter((indicator): indicator is Indicador => Boolean(indicator))
    : []
  const hasDropoutSources =
    dropoutSourceIndicators.length === 2
  const dropoutFirstDoseIndicator = dropoutSourceIndicators.find(
    (indicator) =>
      Number(indicator.numero_indicador) === (isSrpDropout ? 12 : 57),
  )
  const dropoutFinalDoseIndicator = isDropoutIndicator && selectedIndicator
    ? getDropoutSourceIndicators(selectedIndicator, indicadores).finalDose
    : undefined

  const reporte = useMemo(() => {
    if (!hasRequiredSelection || !selectedIndicator) {
      return {
        rows: [],
        poblacionTotal: 0,
        atendidosTotal: 0,
        coberturaPromedio: 0,
        porcentajePrimerPeriodo: 0,
        porcentajeIncremento: 0,
        metaInstitucional: null,
        cumplimientoMetaInstitucional: null,
        tasaProductividadInstitucional: null,
        tasaDesercionInstitucional: null,
      }
    }

    const productivityMode = isProductivityIndicator
    const dropoutMode = isDropoutIndicator
    const establecimientosFiltrados = establecimientoId
      ? establecimientos.filter((establecimiento) => establecimiento.id === establecimientoId)
      : establecimientos

    const rows = establecimientosFiltrados.map((establecimiento): ReporteEstablecimiento => {
      const configRows = configuraciones.filter((item) => item.establecimiento_id === establecimiento.id)
      const registroRows = registros.filter((item) => item.establecimiento_id === establecimiento.id)
      if (dropoutMode) {
        const sourceRows = registroRows.filter((item) => item.mes <= mes)
        const totalFirstDoses = dropoutFirstDoseIndicator
          ? sourceRows
              .filter((item) => item.indicador_id === dropoutFirstDoseIndicator.id)
              .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
          : 0
        const totalSecondDoses = dropoutFinalDoseIndicator
          ? sourceRows
              .filter((item) => item.indicador_id === dropoutFinalDoseIndicator.id)
              .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
          : 0
        const firstDosesAtJune = dropoutFirstDoseIndicator
          ? sourceRows
              .filter((item) => item.indicador_id === dropoutFirstDoseIndicator.id && item.mes <= 6)
              .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
          : 0
        const secondDosesAtJune = dropoutFinalDoseIndicator
          ? sourceRows
              .filter((item) => item.indicador_id === dropoutFinalDoseIndicator.id && item.mes <= 6)
              .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
          : 0
        const tasaDesercion = dropoutFirstDoseIndicator && dropoutFinalDoseIndicator
          ? calculateDropoutRate(totalFirstDoses, totalSecondDoses)
          : null
        const tasaDesercionJunio = dropoutFirstDoseIndicator && dropoutFinalDoseIndicator
          ? calculateDropoutRate(firstDosesAtJune, secondDosesAtJune)
          : null

        return {
          id: establecimiento.id,
          nombre: establecimiento.nombre,
          poblacion: totalFirstDoses,
          atendidos: totalSecondDoses,
          primerSemestre: firstDosesAtJune,
          incrementoSegundoSemestre: Math.max(totalFirstDoses - firstDosesAtJune, 0),
          incrementoAtendidos: totalSecondDoses,
          porcentajeJunio: tasaDesercionJunio ?? 0,
          porcentajeIncremento: tasaDesercion ?? 0,
          cobertura: tasaDesercion ?? 0,
          meta: 5,
          avanceMeta: null,
          brechaMeta: null,
          tasaProductividad: null,
          tasaDesercion,
        }
      }
      if (productivityMode) {
        const registroHastaMes = registroRows.filter((item) => item.mes <= mes)
        const registroPrimerSemestre = registroRows.filter((item) => item.mes <= Math.min(mes, 6))
        const registroSegundoSemestre = registroHastaMes.filter((item) => item.mes > 6)
        const actividades = (items: RegistroMensual[]) =>
          items.reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
        const consultas = (items: RegistroMensual[]) =>
          items.reduce((total, item) => total + Number(item.valor_denominador || 0), 0)
        const totalActividades = actividades(registroHastaMes)
        const totalConsultas = consultas(registroHastaMes)
        const tasaProductividad = totalConsultas > 0 ? totalActividades / totalConsultas : null
        const actividadesPrimerSemestre = actividades(registroPrimerSemestre)
        const consultasPrimerSemestre = consultas(registroPrimerSemestre)
        const actividadesSegundoSemestre = actividades(registroSegundoSemestre)
        const consultasSegundoSemestre = consultas(registroSegundoSemestre)

        return {
          id: establecimiento.id,
          nombre: establecimiento.nombre,
          poblacion: totalConsultas,
          atendidos: totalActividades,
          primerSemestre: actividadesPrimerSemestre,
          incrementoSegundoSemestre: actividadesSegundoSemestre,
          incrementoAtendidos: actividadesSegundoSemestre,
          porcentajeJunio:
            consultasPrimerSemestre > 0
              ? actividadesPrimerSemestre / consultasPrimerSemestre
              : 0,
          porcentajeIncremento:
            consultasSegundoSemestre > 0
              ? actividadesSegundoSemestre / consultasSegundoSemestre
              : 0,
          cobertura: tasaProductividad ?? 0,
          meta: null,
          avanceMeta: null,
          brechaMeta: null,
          tasaProductividad,
          tasaDesercion: null,
        }
      }
      const poblacion = configRows.reduce((total, item) => total + Number(item.poblacion_programada || 0), 0)
      const metaWeight = configRows.reduce(
        (total, item) =>
          total + asPercentage(Number(item.compromiso_gestion || 0)) * Number(item.poblacion_programada || 0),
        0,
      )
      const primerSemestre = registroRows
        .filter((item) => item.mes <= Math.min(mes, 6))
        .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
      const atendidos = registroRows
        .filter((item) => item.mes <= mes)
        .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
      const incrementoSegundoSemestre =
        mes > 6
          ? atendidos - primerSemestre
          : 0
      const cobertura = poblacion > 0 ? (atendidos / poblacion) * 100 : 0
      const meta = poblacion > 0 && configRows.length > 0 ? metaWeight / poblacion : null

      return {
        id: establecimiento.id,
        nombre: establecimiento.nombre,
        poblacion,
        atendidos,
        primerSemestre,
        incrementoSegundoSemestre,
        incrementoAtendidos: incrementoSegundoSemestre,
        porcentajeJunio: poblacion > 0 ? (primerSemestre / poblacion) * 100 : 0,
        porcentajeIncremento: poblacion > 0 ? (incrementoSegundoSemestre / poblacion) * 100 : 0,
        cobertura,
        meta,
        avanceMeta: meta !== null && meta > 0 ? (cobertura / meta) * 100 : null,
        brechaMeta: meta === null ? null : Math.max(meta - cobertura, 0),
        tasaProductividad: null,
        tasaDesercion: null,
      }
    })

    if (dropoutMode) {
      const sourceRows = registros.filter((item) => item.mes <= mes)
      const totalFirstDoses = dropoutFirstDoseIndicator
        ? sourceRows
            .filter((item) => item.indicador_id === dropoutFirstDoseIndicator.id)
            .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
        : 0
      const totalSecondDoses = dropoutFinalDoseIndicator
        ? sourceRows
            .filter((item) => item.indicador_id === dropoutFinalDoseIndicator.id)
            .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
        : 0
      const sourceRowsAtJune = registros.filter((item) => item.mes <= Math.min(mes, 6))
      const firstDosesAtJune = dropoutFirstDoseIndicator
        ? sourceRowsAtJune
            .filter((item) => item.indicador_id === dropoutFirstDoseIndicator.id)
            .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
        : 0
      const secondDosesAtJune = dropoutFinalDoseIndicator
        ? sourceRowsAtJune
            .filter((item) => item.indicador_id === dropoutFinalDoseIndicator.id)
            .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
        : 0
      const tasaDesercion = dropoutFirstDoseIndicator && dropoutFinalDoseIndicator
        ? calculateDropoutRate(totalFirstDoses, totalSecondDoses)
        : null
      const tasaDesercionJunio = dropoutFirstDoseIndicator && dropoutFinalDoseIndicator
        ? calculateDropoutRate(firstDosesAtJune, secondDosesAtJune)
        : null
      return {
        rows,
        poblacionTotal: totalFirstDoses,
        atendidosTotal: totalSecondDoses,
        coberturaPromedio: tasaDesercion ?? 0,
        porcentajePrimerPeriodo: tasaDesercionJunio ?? 0,
        porcentajeIncremento: tasaDesercion ?? 0,
        metaInstitucional: 5,
        cumplimientoMetaInstitucional: null,
        tasaProductividadInstitucional: null,
        tasaDesercionInstitucional: tasaDesercion,
      }
    }

    if (productivityMode) {
      const registrosHastaMes = registros.filter((item) => item.mes <= mes)
      const registrosPrimerSemestre = registros.filter((item) => item.mes <= Math.min(mes, 6))
      const registrosSegundoSemestre = registrosHastaMes.filter((item) => item.mes > 6)
      const actividades = (items: RegistroMensual[]) =>
        items.reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
      const consultas = (items: RegistroMensual[]) =>
        items.reduce((total, item) => total + Number(item.valor_denominador || 0), 0)
      const totalActividades = actividades(registrosHastaMes)
      const totalConsultas = consultas(registrosHastaMes)
      const consultasPrimerSemestre = consultas(registrosPrimerSemestre)
      const consultasSegundoSemestre = consultas(registrosSegundoSemestre)

      return {
        rows,
        poblacionTotal: totalConsultas,
        atendidosTotal: totalActividades,
        coberturaPromedio: totalConsultas > 0 ? totalActividades / totalConsultas : 0,
        porcentajePrimerPeriodo:
          consultasPrimerSemestre > 0
            ? actividades(registrosPrimerSemestre) / consultasPrimerSemestre
            : 0,
        porcentajeIncremento:
          consultasSegundoSemestre > 0
            ? actividades(registrosSegundoSemestre) / consultasSegundoSemestre
            : 0,
        metaInstitucional: null,
        cumplimientoMetaInstitucional: null,
        tasaProductividadInstitucional:
          totalConsultas > 0 ? totalActividades / totalConsultas : null,
        tasaDesercionInstitucional: null,
      }
    }

    const poblacionTotal = configuraciones.reduce(
      (total, item) => total + Number(item.poblacion_programada || 0),
      0,
    )
    const atendidosTotal = registros
      .filter((item) => item.mes <= mes)
      .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
    const atendidosPrimerPeriodo = registros
      .filter((item) => item.mes <= Math.min(mes, 6))
      .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
    const atendidosIncremento = registros
      .filter((item) => item.mes > 6 && item.mes <= mes)
      .reduce((total, item) => total + Number(item.valor_numerador || 0), 0)
    const metaTotalPonderada = configuraciones.reduce(
      (total, item) =>
        total +
        asPercentage(Number(item.compromiso_gestion || 0)) * Number(item.poblacion_programada || 0),
      0,
    )

    return {
      rows,
      poblacionTotal,
      atendidosTotal,
      coberturaPromedio: poblacionTotal > 0 ? (atendidosTotal / poblacionTotal) * 100 : 0,
      porcentajePrimerPeriodo:
        poblacionTotal > 0 ? (atendidosPrimerPeriodo / poblacionTotal) * 100 : 0,
      porcentajeIncremento:
        poblacionTotal > 0 ? (atendidosIncremento / poblacionTotal) * 100 : 0,
      metaInstitucional: poblacionTotal > 0 ? metaTotalPonderada / poblacionTotal : null,
      cumplimientoMetaInstitucional:
        poblacionTotal > 0 && metaTotalPonderada > 0
          ? (atendidosTotal / metaTotalPonderada) * 10000
          : null,
      tasaProductividadInstitucional: null,
      tasaDesercionInstitucional: null,
    }
  }, [
    establecimientoId,
    establecimientos,
    configuraciones,
    registros,
    mes,
    selectedIndicator,
    hasRequiredSelection,
    isProductivityIndicator,
    isDropoutIndicator,
    hasDropoutSources,
    dropoutFirstDoseIndicator,
    dropoutFinalDoseIndicator,
    indicadores,
  ])

  const coverageYAxisMax = useMemo(() => {
    if (!hasRequiredSelection || isProductivityIndicator) return 100
    if (isDropoutIndicator) {
      const highestRate = reporte.rows.reduce(
        (highest, row) => Math.max(highest, row.tasaDesercion ?? 0),
        0,
      )
      return Math.max(10, Math.ceil(highestRate / 5) * 5)
    }

    const highestCoverage = reporte.rows.reduce(
      (highest, row) => Math.max(highest, row.cobertura),
      0,
    )
    const highestValue = Math.max(highestCoverage, reporte.metaInstitucional ?? 0)
    return highestValue > 0 ? Math.ceil(highestValue / 10) * 10 : 100
  }, [hasRequiredSelection, isProductivityIndicator, isDropoutIndicator, reporte.rows, reporte.metaInstitucional])

  const chartData = useMemo<ReporteEstablecimiento[]>(
    () => reporte.rows.map((row) => {
      const porcentajeJunio = parseNumericValue(row.porcentajeJunio)
      const cobertura = parseNumericValue(row.cobertura)

      return {
        ...row,
        nombre: String(row.nombre ?? ''),
        poblacion: parseNumericValue(row.poblacion),
        atendidos: parseNumericValue(row.atendidos),
        primerSemestre: parseNumericValue(row.primerSemestre),
        incrementoSegundoSemestre: parseNumericValue(row.incrementoSegundoSemestre),
        incrementoAtendidos: parseNumericValue(row.incrementoAtendidos),
        porcentajeJunio,
        porcentajeIncremento: mes <= 6
          ? 0
          : isProductivityIndicator
            ? parseNumericValue(row.porcentajeIncremento)
            : cobertura - porcentajeJunio,
        cobertura,
        meta: row.meta === null ? null : parseNumericValue(row.meta),
        avanceMeta: row.avanceMeta === null ? null : parseNumericValue(row.avanceMeta),
        brechaMeta: row.brechaMeta === null ? null : parseNumericValue(row.brechaMeta),
        tasaProductividad: row.tasaProductividad === null
          ? null
          : parseNumericValue(row.tasaProductividad),
        tasaDesercion: row.tasaDesercion === null
          ? null
          : parseNumericValue(row.tasaDesercion),
      }
    }),
    [reporte.rows, isProductivityIndicator, mes],
  )

  const dropoutYAxisMin = useMemo(() => {
    if (!isDropoutIndicator) return 0
    const lowestRate = reporte.rows.reduce(
      (lowest, row) => Math.min(lowest, row.tasaDesercion ?? 0),
      0,
    )
    return Math.min(-20, lowestRate < 0 ? Math.floor(lowestRate / 5) * 5 : 0)
  }, [isDropoutIndicator, reporte.rows])

  const datosMensualesModal = useMemo(() => {
    if (!establecimientoModal) return []

    let atendidosAcumulados = 0
    const productivityMode = isProductivityIndicator
    const dropoutMode = isDropoutIndicator
    const { firstDose: firstDoseIndicator, finalDose: finalDoseIndicator } = dropoutMode
      ? getDropoutSourceIndicators(selectedIndicator, indicadores)
      : { firstDose: undefined, finalDose: undefined }
    let firstDosesAccumulated = 0
    let secondDosesAccumulated = 0
    return MESES.slice(0, mes).map((nombre, index) => {
      const monthRecords = registros.filter(
        (registro) =>
          registro.establecimiento_id === establecimientoModal.id &&
          registro.mes === index + 1,
      )
      const monthActivities = monthRecords.reduce(
        (total, registro) => total + Number(registro.valor_numerador || 0),
        0,
      )
      if (dropoutMode) {
        firstDosesAccumulated += monthRecords
          .filter((record) => record.indicador_id === firstDoseIndicator?.id)
          .reduce((total, record) => total + Number(record.valor_numerador || 0), 0)
        secondDosesAccumulated += monthRecords
          .filter((record) => record.indicador_id === finalDoseIndicator?.id)
          .reduce((total, record) => total + Number(record.valor_numerador || 0), 0)
        return {
          mes: nombre.slice(0, 3),
          atendidos: firstDoseIndicator && finalDoseIndicator
            ? calculateDropoutRate(firstDosesAccumulated, secondDosesAccumulated)
            : null,
        }
      }
      if (productivityMode) {
        const monthConsultations = monthRecords.reduce(
          (total, registro) => total + Number(registro.valor_denominador || 0),
          0,
        )
        return {
          mes: nombre.slice(0, 3),
          atendidos: monthConsultations > 0 ? monthActivities / monthConsultations : null,
        }
      }
      atendidosAcumulados += monthActivities

      return {
        mes: nombre.slice(0, 3),
        atendidos: atendidosAcumulados,
      }
    })
  }, [establecimientoModal, registros, mes, isProductivityIndicator, isDropoutIndicator, indicadores, selectedIndicator])
  const maxDesercionMensual = Math.max(
    10,
    Math.ceil(datosMensualesModal.reduce((max, item) => Math.max(max, item.atendidos ?? 0), 0) / 5) * 5,
  )
  const minDesercionMensual = Math.min(
    -20,
    Math.floor(
      datosMensualesModal.reduce((min, item) => Math.min(min, item.atendidos ?? 0), 0) / 5,
    ) * 5,
  )

  useEffect(() => {
    if (!establecimientoModal) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setEstablecimientoModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [establecimientoModal])

  function handleGroupChange(value: string) {
    setGrupoId(value)
    setIndicadorId('')
  }

  function exportToExcel() {
    const nombreMes = MESES[mes - 1]
    const header = isDropoutIndicator
      ? [
          'Centro de Salud',
          `1ras dosis ${isSrpDropout ? 'SRP' : 'pentavalente'} acumuladas a ${nombreMes}`,
          `${isSrpDropout ? '2das' : '3ras'} dosis ${isSrpDropout ? 'SRP' : 'pentavalente'} acumuladas a ${nombreMes}`,
          `Índice de ${dropoutName} (%)`,
          'Meta (<5%)',
          'Estado',
        ]
      : [
      'Centro de Salud',
      isProductivityIndicator ? 'Consultas Nuevas y Repetidas' : 'Población Programada',
      isProductivityIndicator ? 'Actividades hasta Junio' : 'Atendidos a Junio',
      isProductivityIndicator ? 'Tasa hasta Junio' : '% Logrado a Junio',
      isProductivityIndicator ? `Actividades a ${nombreMes}` : `Atendidos a ${nombreMes} (Acum.)`,
      isProductivityIndicator ? `Tasa a ${nombreMes} (%)` : `% Logrado a ${nombreMes}`,
      isProductivityIndicator
        ? `Actividades Julio-${nombreMes}`
        : `Incremento Atendidos (Jul-${nombreMes})`,
      isProductivityIndicator
        ? `Tasa Julio-${nombreMes}`
        : 'Incremento % (Diferencia)',
      isProductivityIndicator ? 'Rango normativo' : 'Compromiso Gestión (Meta)',
      'Estado / Semáforo',
    ]
    const csvRows = reporte.rows.map((row) =>
      isDropoutIndicator
        ? [
            row.nombre,
            row.poblacion,
            row.atendidos,
            row.tasaDesercion?.toFixed(2) ?? '',
            '<5%',
            getDropoutSemaforo(row.tasaDesercion).shortLabel,
          ]
        : [
            row.nombre,
            row.poblacion,
            row.primerSemestre,
            row.porcentajeJunio.toFixed(2),
            row.atendidos,
            row.cobertura.toFixed(2),
            row.incrementoAtendidos,
            isProductivityIndicator
              ? row.porcentajeIncremento.toFixed(2)
              : (row.cobertura - row.porcentajeJunio).toFixed(2),
            isProductivityIndicator ? '0.00–0.25 Bajo; 0.26–0.59 Regular; 0.60–0.75 Bueno; 0.76–1.00 Muy bueno' : row.meta?.toFixed(2) ?? '',
            (isProductivityIndicator
              ? getProductivitySemaforo(row.tasaProductividad)
              : getEstadoSemaforo(row.avanceMeta)).shortLabel,
          ],
    )
    const csv = [header, ...csvRows].map((row) => row.map(escapeCsv).join(';')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reporte-cai-${gestion}-mes-${mes}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const firstSemesterLabel = isDropoutIndicator
    ? mes < 6
      ? `${isSrpDropout ? 'Deserción SRP' : 'Deserción pentavalente'} a ${MESES[mes - 1]}`
      : `${isSrpDropout ? 'Deserción SRP' : 'Deserción pentavalente'} acumulada a junio`
    : isProductivityIndicator
      ? 'Tasa hasta Junio'
      : mes < 6
      ? `Logro Ene–${MESES[mes - 1]}`
      : 'Logro a Junio'
  const incrementalLabel = isDropoutIndicator
    ? `${isSrpDropout ? 'Deserción SRP' : 'Deserción pentavalente'} acumulada a ${MESES[mes - 1]}`
    : isProductivityIndicator
      ? `Tasa Julio–${MESES[mes - 1]}`
      : `Incremento Jul–${MESES[mes - 1]}`
  const firstSemesterChartLabel =
    isDropoutIndicator
      ? isSrpDropout ? 'Índice de Deserción SRP' : 'Índice de Deserción 3ra Pentavalente'
      : isProductivityIndicator
        ? 'Tasa hasta Junio'
        : mes < 6
          ? `Logrado Ene–${MESES[mes - 1]}`
          : '% Logrado a Junio'
  const semaforoInstitucional = isDropoutIndicator
    ? getDropoutSemaforo(reporte.tasaDesercionInstitucional)
    : isProductivityIndicator
      ? getProductivitySemaforo(reporte.tasaProductividadInstitucional)
      : getEstadoSemaforo(reporte.cumplimientoMetaInstitucional)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Filtros de reporte</h2>
            <p className="mt-1 text-sm text-slate-500">Los indicadores se actualizan al cambiar los filtros.</p>
          </div>
          <button
            type="button"
            onClick={exportToExcel}
            disabled={isLoadingDatos || reporte.rows.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cai-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cai-900 focus:outline-none focus:ring-2 focus:ring-cai-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Download size={17} aria-hidden="true" />
            Exportar a Excel
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-600">
            Establecimiento de Salud
            <select
              className={`${selectClassName} mt-2`}
              value={establecimientoId}
              onChange={(event) => setEstablecimientoId(event.target.value)}
              disabled={isLoadingCatalogos}
            >
              <option value="">-- Todos los Establecimientos --</option>
              {establecimientos.map((establecimiento) => (
                <option key={establecimiento.id} value={establecimiento.id}>
                  {establecimiento.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Mes de Evaluación
            <select
              className={`${selectClassName} mt-2`}
              value={mes}
              onChange={(event) => setMes(Number(event.target.value))}
            >
              {MESES.map((nombre, index) => (
                <option key={nombre} value={index + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Grupo de Indicadores
            <select
              className={`${selectClassName} mt-2`}
              value={grupoId}
              onChange={(event) => handleGroupChange(event.target.value)}
              disabled={isLoadingCatalogos}
            >
              <option value="">Todos los grupos</option>
              {grupos.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Indicador Específico
            <select
              className={`${selectClassName} mt-2`}
              value={indicadorId}
              onChange={(event) => setIndicadorId(event.target.value)}
              disabled={isLoadingIndicadores || indicadores.length === 0}
            >
              <option value="">
                {isLoadingIndicadores ? 'Cargando indicadores…' : 'Todos los indicadores'}
              </option>
              {indicadores.filter((indicador) => !grupoId || indicador.grupo_id === grupoId).map((indicador) => (
                <option key={indicador.id} value={indicador.id}>
                  {indicador.numero_indicador}. {indicador.descripcion}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasRequiredSelection && selectedIndicator && (
          <p className="mt-4 text-center text-sm font-bold uppercase text-slate-700" style={{ color: '#2F6B3F' }}>
            Indicador filtrado: {selectedIndicator.numero_indicador}. {selectedIndicator.descripcion}
          </p>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {isDropoutIndicator && !hasDropoutSources && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {isSrpDropout
            ? 'No se encontraron los indicadores 12 y 13 en el catálogo; el índice no puede calcularse.'
            : 'No se encontró el indicador 57 o el indicador de 3ra dosis pentavalente; el índice no puede calcularse.'}
        </div>
      )}

      {selectedIndicator && (
      <section aria-label="Indicadores clave" className="grid w-full grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          icon={Users}
          label={
            isDropoutIndicator
              ? isSrpDropout ? '1ras dosis SRP acumuladas' : '1ras dosis pentavalente acumuladas'
              : isProductivityIndicator
                ? 'Consultas Nuevas y Repetidas'
                : 'Población Total Programada'
          }
          value={formatNumber(reporte.poblacionTotal)}
          detail={
            isDropoutIndicator
              ? `${gestion} · indicador ${isSrpDropout ? '12' : '57'} hasta ${MESES[mes - 1]}`
              : isProductivityIndicator
                ? `${gestion} · denominador acumulado hasta ${MESES[mes - 1]}`
                : `${gestion} · población acumulada del filtro`
          }
          accent="bg-sky-50"
        />
        <MetricCard
          icon={CircleCheck}
          label={
            isDropoutIndicator
              ? isSrpDropout ? '2das dosis SRP acumuladas' : '3ras dosis pentavalente acumuladas'
              : isProductivityIndicator
                ? 'Actividades clínicas realizadas'
                : 'Atendidos / Alcanzados'
          }
          value={formatNumber(reporte.atendidosTotal)}
          detail={
            isDropoutIndicator
              ? `${isSrpDropout ? 'Indicador 13' : '3ra dosis pentavalente'} · acumulado hasta ${MESES[mes - 1]}`
              : `Acumulado hasta ${MESES[mes - 1]}`
          }
          accent="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          icon={Activity}
          label={
            isDropoutIndicator
              ? isSrpDropout ? 'Índice de Deserción SRP' : 'Índice de Deserción 3ra Pentavalente'
              : isProductivityIndicator
                ? 'Tasa actividades / consultas'
                : '% Cobertura Promedio Red'
          }
          value={isDropoutIndicator
            ? formatPercentage(reporte.tasaDesercionInstitucional)
            : isProductivityIndicator
              ? formatProductivityRate(reporte.coberturaPromedio)
              : formatPercentage(reporte.coberturaPromedio)}
          detail={
            isDropoutIndicator
              ? '((1ras dosis − dosis finales) ÷ 1ras dosis) × 100'
              : isProductivityIndicator
                ? 'Actividades clínicas ÷ consultas'
                : 'Alcanzados sobre población programada'
          }
          accent="bg-violet-50 text-violet-700"
          breakdown={{
            firstLabel: isDropoutIndicator
              ? mes < 6
                ? `Deserción a ${MESES[mes - 1]}`
                : 'Deserción a junio'
              : isProductivityIndicator
                ? 'Tasa hasta Junio'
                : mes < 6
                ? `Logrado Ene–${MESES[mes - 1]}`
                : 'Logrado a Junio',
            firstValue: reporte.porcentajePrimerPeriodo,
            incrementLabel: isDropoutIndicator
              ? `Deserción a ${MESES[mes - 1]}`
              : isProductivityIndicator
                ? `Tasa Julio–${MESES[mes - 1]}`
                : mes > 6
                ? `Inc. Jul–${MESES[mes - 1]}`
                : 'Inc. Jul–Dic',
            incrementValue: reporte.porcentajeIncremento,
            incrementPrefix: isProductivityIndicator || isDropoutIndicator ? '' : undefined,
            formatAsRatio: isProductivityIndicator,
          }}
        />
        <MetricCard
          icon={Target}
          label={
            isDropoutIndicator
              ? 'Umbral máximo'
              : isProductivityIndicator
                ? 'Rangos normativos'
                : 'Meta Institucional'
          }
          value={isDropoutIndicator
            ? '<5%'
            : isProductivityIndicator
              ? '0.00–1.00'
              : formatPercentage(reporte.metaInstitucional)}
          detail={
            isDropoutIndicator
              ? 'El valor de 5% ya supera el límite'
              : isProductivityIndicator
                ? 'Bajo ≤0.25 · Regular ≤0.59 · Bueno ≤0.75 · Muy bueno ≥0.76'
                : 'Promedio ponderado por población'
          }
          accent="bg-amber-50 text-amber-700"
        />
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isDropoutIndicator
              ? `Evaluación de ${dropoutName}`
              : isProductivityIndicator
                ? 'Calificación de Productividad'
                : 'Calificación de Cobertura'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span
              aria-label={semaforoInstitucional.shortLabel}
              className={`h-5 w-5 shrink-0 rounded-full ring-4 ring-slate-100 ${semaforoInstitucional.dotClass}`}
            />
            <p className="text-lg font-bold leading-tight text-slate-900">{semaforoInstitucional.label}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {isDropoutIndicator
              ? 'Meta: índice menor al 5%'
              : isProductivityIndicator
                ? 'Según tasa actividades / consultas (0–1)'
                : 'De la Meta Semestral/Institucional'}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {isDropoutIndicator
              ? `Índice: ${formatPercentage(reporte.tasaDesercionInstitucional)}`
              : isProductivityIndicator
                ? `Tasa: ${formatProductivityRate(reporte.tasaProductividadInstitucional)}`
                : `Cumplimiento: ${formatPercentage(reporte.cumplimientoMetaInstitucional)}`}
          </p>
        </article>
      </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isDropoutIndicator
                ? isSrpDropout
                  ? 'Índice de Deserción SRP por centro de salud'
                  : 'Índice de Deserción 3ra Pentavalente por centro de salud'
                : isProductivityIndicator
                  ? 'Tasa de productividad por centro de salud'
                  : 'Evolución y logro por centro de salud'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isDropoutIndicator
                ? isSrpDropout
                  ? `Dosis acumuladas de los indicadores 12 y 13 hasta ${MESES[mes - 1]} de ${gestion}; el límite es menor al 5%.`
                  : `Dosis acumuladas del indicador 57 y de 3ra dosis pentavalente hasta ${MESES[mes - 1]} de ${gestion}; el límite es menor al 5%.`
                : isProductivityIndicator
                  ? `Tasa de actividades clínicas por consultas en los periodos seleccionados de ${gestion}.`
                  : `${firstSemesterLabel} e incremento julio–${MESES[mes - 1]} de ${gestion}.`}
            </p>
          </div>
          {isLoadingDatos && <span className="text-xs font-medium text-cai-700">Actualizando datos…</span>}
        </div>
        {!hasRequiredSelection || !selectedIndicator ? (
          <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 px-6 text-center text-sm text-slate-600">
            Por favor, seleccione un Grupo de Indicadores y un Indicador Específico para visualizar el reporte de cobertura.
          </div>
        ) : reporte.rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
            No hay establecimientos para mostrar con los filtros seleccionados.
          </div>
        ) : (
          <div className="h-[420px] w-full lg:h-[480px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 30, right: isProductivityIndicator ? 190 : isDropoutIndicator ? 48 : 100, left: 4, bottom: 70 }}
                barCategoryGap="28%"
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="nombre"
                  interval={0}
                  angle={0}
                  textAnchor="middle"
                  height={85}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  unit={isProductivityIndicator ? undefined : '%'}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={
                    isProductivityIndicator
                      ? [0, 1]
                      : isDropoutIndicator
                        ? [dropoutYAxisMin, coverageYAxisMax]
                        : [0, coverageYAxisMax]
                  }
                  ticks={isProductivityIndicator ? [0, 0.25, 0.5, 0.75, 1] : undefined}
                  tickFormatter={(value: number) =>
                    isProductivityIndicator
                      ? formatProductivityRate(value)
                      : isDropoutIndicator
                        ? `${value}%`
                        : String(value)
                  }
                />
                {isDropoutIndicator && (
                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} isFront />
                )}
                {isProductivityIndicator && (
                  <>
                    <ReferenceLine
                      y={0.25}
                      stroke="#94a3b8"
                      strokeDasharray="3 3"
                      isFront
                      ifOverflow="extendDomain"
                      label={{
                        value: '0.25 - Bajo',
                        fill: '#64748b',
                        position: 'right',
                        offset: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        stroke: '#ffffff',
                        strokeWidth: 4,
                        paintOrder: 'stroke',
                      }}
                    />
                    <ReferenceLine
                      y={0.50}
                      stroke="#a8a29e"
                      strokeDasharray="3 3"
                      isFront
                      ifOverflow="extendDomain"
                      label={{
                        value: '0.50 - Regular',
                        fill: '#78716c',
                        position: 'right',
                        offset: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        stroke: '#ffffff',
                        strokeWidth: 4,
                        paintOrder: 'stroke',
                      }}
                    />
                    <ReferenceLine
                      y={0.75}
                      stroke="#94a3b8"
                      strokeDasharray="3 3"
                      isFront
                      ifOverflow="extendDomain"
                      label={{
                        value: '0.75 - Bueno',
                        fill: '#64748b',
                        position: 'right',
                        offset: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        stroke: '#ffffff',
                        strokeWidth: 4,
                        paintOrder: 'stroke',
                      }}
                    />
                    <ReferenceLine
                      y={1.00}
                      stroke="#a8a29e"
                      strokeDasharray="3 3"
                      isFront
                      ifOverflow="extendDomain"
                      label={{
                        value: '1.00 - Muy bueno',
                        fill: '#78716c',
                        position: 'right',
                        offset: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        stroke: '#ffffff',
                        strokeWidth: 4,
                        paintOrder: 'stroke',
                      }}
                    />
                  </>
                )}
                <Tooltip
                  content={
                    <CoverageTooltip
                      incrementalLabel={incrementalLabel}
                      firstSemesterLabel={firstSemesterLabel}
                      isProductivity={isProductivityIndicator}
                      isDropout={isDropoutIndicator}
                      dropoutName={dropoutName}
                    />
                  }
                  cursor={{ fill: '#f1f5f9', opacity: 0.65 }}
                />
                <Legend
                  align="right"
                  verticalAlign="top"
                  wrapperStyle={{ paddingBottom: 16, fontSize: 12 }}
                />
                {reporte.metaInstitucional !== null && (
                  <ReferenceLine
                    y={reporte.metaInstitucional}
                    stroke="#dc2626"
                    strokeDasharray="3 3"
                    strokeWidth={2}
                    label={{
                      value: isDropoutIndicator
                        ? 'Límite: 5%'
                        : `Meta: ${formatPercentage(reporte.metaInstitucional)}`,
                      fill: '#dc2626',
                      fontSize: 11,
                      position: 'right',
                      offset: 12,
                    }}
                  />
                )}
                {isDropoutIndicator && (
                  <Bar
                    name={`Índice de ${dropoutName}`}
                    dataKey="tasaDesercion"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                    barSize={48}
                    maxBarSize={48}
                  >
                    {chartData.map((row) => (
                      <Cell
                        key={row.id}
                        fill={row.tasaDesercion === null || row.tasaDesercion < 0 || row.tasaDesercion >= 5
                          ? '#dc2626'
                          : '#16a34a'}
                      />
                    ))}
                    <LabelList
                      dataKey="tasaDesercion"
                      position="top"
                      formatter={(value: number | null) => value === null ? '' : formatPercentage(value)}
                      fill="#334155"
                      fontSize={11}
                      fontWeight={700}
                      pointerEvents="none"
                    />
                  </Bar>
                )}
                {!isDropoutIndicator && isProductivityIndicator && (
                  <Bar
                    name={firstSemesterChartLabel}
                    dataKey="porcentajeJunio"
                    fill="#2F6B3F"
                    radius={[4, 4, 0, 0]}
                    barSize={48}
                    maxBarSize={48}
                  >
                    <LabelList
                      dataKey="porcentajeJunio"
                      position="top"
                      formatter={(value: number) => value > 0 ? formatProductivityRate(value) : ''}
                      fill="#334155"
                      fontSize={12}
                      fontWeight={700}
                    />
                  </Bar>
                )}
                {!isDropoutIndicator && isProductivityIndicator && (
                  <Bar
                    name={incrementalLabel}
                    dataKey="porcentajeIncremento"
                    fill="#D32E3A"
                    radius={[4, 4, 0, 0]}
                    barSize={48}
                    maxBarSize={48}
                  >
                    <LabelList
                      dataKey="porcentajeIncremento"
                      position="top"
                      formatter={(value: number) => value > 0 ? formatProductivityRate(value) : ''}
                      fill="#334155"
                      fontSize={12}
                      fontWeight={700}
                    />
                  </Bar>
                )}
                {!isDropoutIndicator && !isProductivityIndicator && (
                  <Bar
                    name="% Logrado a Junio"
                    dataKey="porcentajeJunio"
                    stackId="cobertura"
                    fill="#2F6B3F"
                    radius={[0, 0, 0, 0]}
                    barSize={48}
                    maxBarSize={48}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="porcentajeJunio"
                      position="inside"
                      formatter={(value: number | null) =>
                        value !== null && parseNumericValue(value) > 0.01
                          ? formatPercentage(parseNumericValue(value))
                          : ''
                      }
                      fill="#ffffff"
                      fontSize={10}
                      fontWeight={700}
                      pointerEvents="none"
                    />
                  </Bar>
                )}
                {!isDropoutIndicator && !isProductivityIndicator && (
                  <Bar
                    name="Incremento % (Diferencia)"
                    dataKey="porcentajeIncremento"
                    stackId="cobertura"
                    fill="#D32E3A"
                    radius={[4, 4, 0, 0]}
                    barSize={48}
                    maxBarSize={48}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="porcentajeIncremento"
                      position="inside"
                      formatter={(value: number | null) =>
                        value !== null && parseNumericValue(value) > 0.01
                          ? formatPercentage(parseNumericValue(value))
                          : ''
                      }
                      fill="#ffffff"
                      fontSize={10}
                      fontWeight={700}
                      pointerEvents="none"
                    />
                    <LabelList
                      dataKey="cobertura"
                      position="top"
                      formatter={(value: number | null) =>
                        value === null ? '' : formatPercentage(parseNumericValue(value))
                      }
                      fill="#334155"
                      fontSize={11}
                      fontWeight={700}
                      pointerEvents="none"
                    />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {hasRequiredSelection && selectedIndicator && (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">Detalle analítico por establecimiento</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isDropoutIndicator
              ? `Índice calculado con dosis acumuladas hasta ${MESES[mes - 1]} de ${gestion}.`
              : isProductivityIndicator
                ? `Tasa acumulada hasta ${MESES[mes - 1]} de ${gestion}.`
                : `Cobertura acumulada hasta ${MESES[mes - 1]} de ${gestion}.`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className={`${isDropoutIndicator ? 'min-w-[900px]' : 'min-w-[1240px]'} divide-y divide-slate-200 text-sm`}>
            <thead className="bg-[#0d4859] text-left text-xs uppercase tracking-wide text-white">
              <tr>
                <th scope="col" className="min-w-48 px-4 py-3 font-bold">Centro de Salud</th>
                {isDropoutIndicator ? (
                  <>
                    <th scope="col" className="min-w-36 px-4 py-3 text-right font-bold">
                      1ras dosis {isSrpDropout ? 'SRP' : 'pentavalente'}
                    </th>
                    <th scope="col" className="min-w-36 px-4 py-3 text-right font-bold">
                      {isSrpDropout ? '2das' : '3ras'} dosis {isSrpDropout ? 'SRP' : 'pentavalente'}
                    </th>
                    <th scope="col" className="min-w-40 bg-sky-900 px-4 py-3 text-right font-bold">Deserción a junio</th>
                    <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                      {dropoutName} a {MESES[mes - 1]}
                    </th>
                    <th scope="col" className="min-w-32 bg-amber-900 px-4 py-3 text-right font-bold">Meta (&lt;5%)</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="min-w-32 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? 'Consultas (Nuevas y Repetidas)' : 'Población Programada'}
                    </th>
                    <th scope="col" className="min-w-32 bg-sky-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? 'Actividades hasta Junio' : 'Atendidos a Junio'}
                    </th>
                    <th scope="col" className="min-w-32 bg-sky-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? 'Tasa hasta Junio' : '% Logrado a Junio'}
                    </th>
                    <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? `Actividades a ${MESES[mes - 1]}` : `Atendidos a ${MESES[mes - 1]} (Acum.)`}
                    </th>
                    <th scope="col" className="min-w-36 bg-emerald-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? `Tasa a ${MESES[mes - 1]}` : `% Logrado a ${MESES[mes - 1]}`}
                    </th>
                    <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? `Actividades Julio-${MESES[mes - 1]}` : `Incremento Atendidos (Jul-${MESES[mes - 1]})`}
                    </th>
                    <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? `Tasa Julio-${MESES[mes - 1]}` : 'Incremento % (Diferencia)'}
                    </th>
                    <th scope="col" className="min-w-40 bg-amber-900 px-4 py-3 text-right font-bold">
                      {isProductivityIndicator ? 'Rango normativo' : 'Compromiso Gestión (Meta)'}
                    </th>
                  </>
                )}
                <th scope="col" className="min-w-36 bg-[#0d4859] px-4 py-3 text-center font-bold">
                  Estado / Semáforo
                </th>
                <th scope="col" className="min-w-20 bg-[#0d4859] px-4 py-3 text-center font-bold">
                  Ver
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {reporte.rows.map((row) => {
                const porcentajeDiferencia = row.cobertura - row.porcentajeJunio
                const semaforo = isDropoutIndicator
                  ? getDropoutSemaforo(row.tasaDesercion)
                  : isProductivityIndicator
                    ? getProductivitySemaforo(row.tasaProductividad)
                    : getEstadoSemaforo(row.avanceMeta)
                return (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <th scope="row" className="whitespace-nowrap px-4 py-4 text-left font-semibold text-slate-800">
                      {row.nombre}
                    </th>
                    {isDropoutIndicator ? (
                      <>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-slate-600">{formatNumber(row.poblacion)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-slate-600">{formatNumber(row.atendidos)}</td>
                        <td className="whitespace-nowrap bg-sky-50 px-4 py-4 text-right font-semibold text-sky-950">
                          {formatPercentage(row.porcentajeJunio)}
                        </td>
                        <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-semibold text-emerald-950">
                          {formatPercentage(row.tasaDesercion)}
                        </td>
                        <td className="whitespace-nowrap bg-amber-50 px-4 py-4 text-right font-semibold text-amber-950">&lt;5%</td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-slate-600">
                          {formatNumber(row.poblacion)}
                        </td>
                        <td className="whitespace-nowrap bg-sky-50 px-4 py-4 text-right font-medium text-sky-950">
                          {formatNumber(row.primerSemestre)}
                        </td>
                        <td className="whitespace-nowrap bg-sky-50 px-4 py-4 text-right font-semibold text-sky-950">
                          {isProductivityIndicator
                            ? formatProductivityRate(row.porcentajeJunio)
                            : formatPercentage(row.porcentajeJunio)}
                        </td>
                        <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-medium text-emerald-950">
                          {formatNumber(row.atendidos)}
                        </td>
                        <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-semibold text-emerald-950">
                          {isProductivityIndicator
                            ? formatProductivityRate(row.cobertura)
                            : formatPercentage(row.cobertura)}
                        </td>
                        <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right text-emerald-950">
                          {formatNumber(row.incrementoAtendidos)}
                        </td>
                        <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-medium text-emerald-950">
                          {isProductivityIndicator
                            ? formatProductivityRate(row.porcentajeIncremento)
                            : formatPercentage(porcentajeDiferencia)}
                        </td>
                        <td className="whitespace-nowrap bg-amber-50 px-4 py-4 text-right font-semibold text-amber-950">
                          {isProductivityIndicator ? '0.00–1.00' : formatPercentage(row.meta)}
                        </td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${semaforo.badgeClass}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${semaforo.dotClass}`} aria-hidden="true" />
                        {semaforo.shortLabel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-center">
                      <button
                        type="button"
                        aria-label={`Ver comportamiento mensual de ${row.nombre}`}
                        onClick={() => setEstablecimientoModal({ id: row.id, nombre: row.nombre })}
                        className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      >
                        <Eye size={18} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {reporte.rows.length === 0 && (
                <tr>
                  <td colSpan={isDropoutIndicator ? 8 : 11} className="px-5 py-10 text-center text-sm text-slate-500">
                    No hay datos para mostrar con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {hasRequiredSelection && selectedIndicator && establecimientoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEstablecimientoModal(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="monthly-coverage-title"
            className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
              <div>
                <h2 id="monthly-coverage-title" className="text-lg font-bold text-slate-900 sm:text-xl">
                  {establecimientoModal.nombre}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isDropoutIndicator
                  ? `Índice de ${dropoutName} acumulado hasta ${MESES[mes - 1]} de ${gestion}`
                    : isProductivityIndicator
                      ? `Tasa mensual de actividades/consultas hasta ${MESES[mes - 1]} de ${gestion}`
                      : `Atenciones acumuladas hasta ${MESES[mes - 1]} de ${gestion}`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar gráfico mensual"
                onClick={() => setEstablecimientoModal(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cai-600"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="h-[360px] p-4 sm:h-[460px] sm:p-6">
              {isLoadingDatos ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Cargando datos mensuales…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosMensualesModal} margin={{ top: 20, right: 20, left: 4, bottom: 8 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fill: '#475569', fontSize: 12 }} />
                    <YAxis
                      unit={undefined}
                      allowDecimals={isProductivityIndicator || isDropoutIndicator}
                      domain={
                        isProductivityIndicator
                          ? [0, 1]
                          : isDropoutIndicator
                            ? [minDesercionMensual, maxDesercionMensual]
                            : undefined
                      }
                      tickFormatter={(value: number) =>
                        isProductivityIndicator
                          ? formatProductivityRate(value)
                          : isDropoutIndicator
                            ? `${value}%`
                            : formatNumber(value)
                      }
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [
                        isDropoutIndicator
                          ? formatPercentage(value === null ? null : Number(value))
                          : isProductivityIndicator
                            ? formatProductivityRate(value === null ? null : Number(value))
                            : formatNumber(Number(value)),
                        isDropoutIndicator
                          ? `${dropoutName} acumulada`
                          : isProductivityIndicator
                            ? 'Tasa del mes'
                            : 'Atendidos acumulados',
                      ]}
                      labelFormatter={(label) => `Mes: ${label}`}
                    />
                    {isDropoutIndicator && (
                      <>
                        <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} isFront />
                        <ReferenceLine y={5} stroke="#dc2626" strokeDasharray="4 4" label="Límite 5%" />
                      </>
                    )}
                    <Bar
                      dataKey="atendidos"
                      name={
                        isDropoutIndicator
                          ? `Índice de ${dropoutName}`
                          : isProductivityIndicator
                            ? 'Tasa mensual'
                            : 'Atendidos acumulados'
                      }
                      fill={isDropoutIndicator ? '#16a34a' : '#10b981'}
                      radius={[5, 5, 0, 0]}
                    >
                      {isDropoutIndicator &&
                        datosMensualesModal.map((item) => (
                          <Cell
                            key={item.mes}
                            fill={
                              typeof item.atendidos !== 'number'
                                ? '#94a3b8'
                                : item.atendidos < 0 || item.atendidos >= 5
                                  ? '#dc2626'
                                  : '#16a34a'
                            }
                          />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
