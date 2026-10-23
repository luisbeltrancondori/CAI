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

type Establecimiento = Pick<Database['public']['Tables']['cai_establecimientos']['Row'], 'id' | 'nombre'>
type Grupo = Pick<Database['public']['Tables']['cai_grupos']['Row'], 'id' | 'nombre' | 'orden'>
type Indicador = Pick<
  Database['public']['Tables']['cai_indicadores']['Row'],
  'id' | 'grupo_id' | 'numero_indicador' | 'descripcion'
>
type Configuracion = Pick<
  Database['public']['Tables']['cai_config_establecimiento']['Row'],
  'establecimiento_id' | 'indicador_id' | 'compromiso_gestion' | 'poblacion_programada'
>
type RegistroMensual = Pick<
  Database['public']['Tables']['cai_registros_mensuales']['Row'],
  'establecimiento_id' | 'indicador_id' | 'mes' | 'valor_numerador'
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
}

type EstadoSemaforo = {
  label: 'COLOR ROJO' | 'COLOR AMARILLO' | 'COLOR VERDE' | 'SIN META'
  shortLabel: 'Rojo' | 'Amarillo' | 'Verde' | 'Sin meta'
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
}: TooltipProps<number, string> & {
  incrementalLabel: string
  firstSemesterLabel: string
}) {
  const row = payload?.map((item) => item.payload).find(isReporteEstablecimiento)
  if (!active || !row) return null

  const values = [
    { label: firstSemesterLabel, value: row.porcentajeJunio, color: '#f59e0b' },
    { label: incrementalLabel, value: row.porcentajeIncremento, color: '#10b981' },
    { label: 'Cobertura Total Acumulada', value: row.cobertura, color: '#334155' },
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
            <dd className="font-semibold text-slate-900">{formatPercentage(item.value)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-2 text-xs">
          <dt className="text-slate-600">Brecha restante para la meta</dt>
          <dd className="font-semibold text-rose-700">
            {row.brechaMeta === null ? 'Sin meta' : formatPercentage(row.brechaMeta)}
          </dd>
        </div>
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
            <span className="font-semibold text-amber-600">{formatPercentage(breakdown.firstValue)}</span>
          </span>
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-slate-500">{breakdown.incrementLabel}</span>
            <span className="font-semibold text-emerald-600">
              +{formatPercentage(breakdown.incrementValue)}
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
          .select('id, grupo_id, numero_indicador, descripcion')
        if (grupoId) query = query.eq('grupo_id', grupoId)
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

    if (isLoadingCatalogos || isLoadingIndicadores) {
      setIsLoadingDatos(true)
      return () => {
        active = false
      }
    }

    const indicadorIds = indicadorId
      ? indicadores.some((indicador) => indicador.id === indicadorId)
        ? [indicadorId]
        : []
      : indicadores.map((indicador) => indicador.id)

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
              .in('indicador_id', indicadorIds)
            if (establecimientoId) query = query.eq('establecimiento_id', establecimientoId)
            return await query.range(from, to)
          })
        const loadRegistros = () =>
          fetchAllPages(async (from, to) => {
            let query = supabase
              .from('cai_registros_mensuales')
              .select('establecimiento_id, indicador_id, mes, valor_numerador')
              .eq('gestion', gestion)
              .lte('mes', 12)
              .in('indicador_id', indicadorIds)
            if (establecimientoId) query = query.eq('establecimiento_id', establecimientoId)
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
    indicadorId,
    indicadores,
    isLoadingCatalogos,
    isLoadingIndicadores,
    mes,
  ])

  const reporte = useMemo(() => {
    const establecimientosFiltrados = establecimientoId
      ? establecimientos.filter((establecimiento) => establecimiento.id === establecimientoId)
      : establecimientos

    const rows = establecimientosFiltrados.map((establecimiento): ReporteEstablecimiento => {
      const configRows = configuraciones.filter((item) => item.establecimiento_id === establecimiento.id)
      const registroRows = registros.filter((item) => item.establecimiento_id === establecimiento.id)
      const poblacion = configRows.reduce((total, item) => total + Number(item.poblacion_programada || 0), 0)
      const metaWeight = configRows.reduce(
        (total, item) =>
          total + asPercentage(Number(item.compromiso_gestion || 0)) * Number(item.poblacion_programada || 0),
        0,
      )
      const primerSemestre = registroRows
        .filter((item) => item.mes <= 6)
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
      }
    })

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
    }
  }, [establecimientoId, establecimientos, configuraciones, registros, mes])

  const datosMensualesModal = useMemo(() => {
    if (!establecimientoModal) return []

    let atendidosAcumulados = 0
    return MESES.slice(0, mes).map((nombre, index) => {
      atendidosAcumulados += registros
        .filter(
          (registro) =>
            registro.establecimiento_id === establecimientoModal.id &&
            registro.mes === index + 1,
        )
        .reduce((total, registro) => total + Number(registro.valor_numerador || 0), 0)

      return {
        mes: nombre.slice(0, 3),
        atendidos: atendidosAcumulados,
      }
    })
  }, [establecimientoModal, configuraciones, registros, mes])

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
    const header = [
      'Centro de Salud',
      'Población Programada',
      'Atendidos a Junio',
      '% Logrado a Junio',
      `Atendidos a ${nombreMes} (Acum.)`,
      `% Logrado a ${nombreMes}`,
      `Incremento Atendidos (Jul-${nombreMes})`,
      'Incremento % (Diferencia)',
      'Compromiso Gestión (Meta)',
      'Estado / Semáforo',
    ]
    const csvRows = reporte.rows.map((row) => [
      row.nombre,
      row.poblacion,
      row.primerSemestre,
      row.porcentajeJunio.toFixed(2),
      row.atendidos,
      row.cobertura.toFixed(2),
      row.incrementoAtendidos,
      (row.cobertura - row.porcentajeJunio).toFixed(2),
      row.meta?.toFixed(2) ?? '',
      getEstadoSemaforo(row.avanceMeta).shortLabel,
    ])
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

  const selectedIndicator = indicadores.find((indicador) => indicador.id === indicadorId)
  const firstSemesterLabel = mes < 6 ? `Logro Ene–${MESES[mes - 1]}` : 'Logro a Junio'
  const incrementalLabel = `Incremento Jul–${MESES[mes - 1]}`
  const firstSemesterChartLabel =
    mes < 6 ? `Logrado Ene–${MESES[mes - 1]}` : '% Logrado a Junio'
  const semaforoInstitucional = getEstadoSemaforo(reporte.cumplimientoMetaInstitucional)

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
              {indicadores.map((indicador) => (
                <option key={indicador.id} value={indicador.id}>
                  {indicador.numero_indicador}. {indicador.descripcion}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedIndicator && (
          <p className="mt-3 text-xs text-slate-500">
            Indicador filtrado: {selectedIndicator.numero_indicador}. {selectedIndicator.descripcion}
          </p>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <section aria-label="Indicadores clave" className="grid w-full grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          icon={Users}
          label="Población Total Programada"
          value={formatNumber(reporte.poblacionTotal)}
          detail={`${gestion} · población acumulada del filtro`}
          accent="bg-sky-50"
        />
        <MetricCard
          icon={CircleCheck}
          label="Atendidos / Alcanzados"
          value={formatNumber(reporte.atendidosTotal)}
          detail={`Acumulado hasta ${MESES[mes - 1]}`}
          accent="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          icon={Activity}
          label="% Cobertura Promedio Red"
          value={formatPercentage(reporte.coberturaPromedio)}
          detail="Alcanzados sobre población programada"
          accent="bg-violet-50 text-violet-700"
          breakdown={{
            firstLabel: mes < 6 ? `Logrado Ene–${MESES[mes - 1]}` : 'Logrado a Junio',
            firstValue: reporte.porcentajePrimerPeriodo,
            incrementLabel: mes > 6 ? `Inc. Jul–${MESES[mes - 1]}` : 'Inc. Jul–Dic',
            incrementValue: reporte.porcentajeIncremento,
          }}
        />
        <MetricCard
          icon={Target}
          label="Meta Institucional"
          value={formatPercentage(reporte.metaInstitucional)}
          detail="Promedio ponderado por población"
          accent="bg-amber-50 text-amber-700"
        />
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Calificación de Cobertura
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span
              aria-label={semaforoInstitucional.shortLabel}
              className={`h-5 w-5 shrink-0 rounded-full ring-4 ring-slate-100 ${semaforoInstitucional.dotClass}`}
            />
            <p className="text-lg font-bold leading-tight text-slate-900">{semaforoInstitucional.label}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">De la Meta Semestral/Institucional</p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Cumplimiento: {formatPercentage(reporte.cumplimientoMetaInstitucional)}
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Evolución y logro por centro de salud</h2>
            <p className="mt-1 text-sm text-slate-500">
              {firstSemesterLabel} e incremento julio–{MESES[mes - 1]} de {gestion}.
            </p>
          </div>
          {isLoadingDatos && <span className="text-xs font-medium text-cai-700">Actualizando datos…</span>}
        </div>
        {reporte.rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
            No hay establecimientos para mostrar con los filtros seleccionados.
          </div>
        ) : (
          <div className="h-[420px] w-full lg:h-[480px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reporte.rows}
                margin={{ top: 30, right: 24, left: 4, bottom: 70 }}
                barCategoryGap="28%"
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="nombre"
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={85}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  unit="%"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
                />
                <Tooltip
                  content={
                    <CoverageTooltip
                      incrementalLabel={incrementalLabel}
                      firstSemesterLabel={firstSemesterLabel}
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
                      value: `Meta: ${formatPercentage(reporte.metaInstitucional)}`,
                      fill: '#dc2626',
                      fontSize: 11,
                      position: 'top',
                    }}
                  />
                )}
                <Bar
                  name={firstSemesterChartLabel}
                  dataKey="porcentajeJunio"
                  stackId="a"
                  fill="#f59e0b"
                  radius={[0, 0, 0, 0]}
                  maxBarSize={48}
                >
                  <LabelList
                    dataKey="porcentajeJunio"
                    position="inside"
                    formatter={(value: number) => (value > 0 ? formatPercentage(value) : '')}
                    fill="#ffffff"
                    fontSize={10}
                    fontWeight={700}
                    pointerEvents="none"
                  />
                </Bar>
                <Bar
                  name={incrementalLabel}
                  dataKey="porcentajeIncremento"
                  stackId="a"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                >
                  <LabelList
                    dataKey="porcentajeIncremento"
                    position="inside"
                    formatter={(value: number) => (value > 0 ? formatPercentage(value) : '')}
                    fill="#ffffff"
                    fontSize={10}
                    fontWeight={700}
                    pointerEvents="none"
                  />
                  <LabelList
                    dataKey="cobertura"
                    position="top"
                    formatter={(value: number) => formatPercentage(value)}
                    fill="#334155"
                    fontSize={11}
                    fontWeight={700}
                    pointerEvents="none"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">Detalle analítico por establecimiento</h2>
          <p className="mt-1 text-sm text-slate-500">Cobertura acumulada hasta {MESES[mes - 1]} de {gestion}.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1240px] divide-y divide-slate-200 text-sm">
            <thead className="bg-[#0d4859] text-left text-xs uppercase tracking-wide text-white">
              <tr>
                <th scope="col" className="min-w-48 px-4 py-3 font-bold">Centro de Salud</th>
                <th scope="col" className="min-w-32 px-4 py-3 text-right font-bold">Población Programada</th>
                <th scope="col" className="min-w-32 bg-sky-900 px-4 py-3 text-right font-bold">Atendidos a Junio</th>
                <th scope="col" className="min-w-32 bg-sky-900 px-4 py-3 text-right font-bold">% Logrado a Junio</th>
                <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                  Atendidos a {MESES[mes - 1]} (Acum.)
                </th>
                <th scope="col" className="min-w-36 bg-emerald-900 px-4 py-3 text-right font-bold">
                  % Logrado a {MESES[mes - 1]}
                </th>
                <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                  Incremento Atendidos (Jul-{MESES[mes - 1]})
                </th>
                <th scope="col" className="min-w-40 bg-emerald-900 px-4 py-3 text-right font-bold">
                  Incremento % (Diferencia)
                </th>
                <th scope="col" className="min-w-40 bg-amber-900 px-4 py-3 text-right font-bold">
                  Compromiso Gestión (Meta)
                </th>
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
                const semaforo = getEstadoSemaforo(row.avanceMeta)
                return (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <th scope="row" className="whitespace-nowrap px-4 py-4 text-left font-semibold text-slate-800">
                      {row.nombre}
                    </th>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-slate-600">
                      {formatNumber(row.poblacion)}
                    </td>
                    <td className="whitespace-nowrap bg-sky-50 px-4 py-4 text-right font-medium text-sky-950">
                      {formatNumber(row.primerSemestre)}
                    </td>
                    <td className="whitespace-nowrap bg-sky-50 px-4 py-4 text-right font-semibold text-sky-950">
                      {formatPercentage(row.porcentajeJunio)}
                    </td>
                    <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-medium text-emerald-950">
                      {formatNumber(row.atendidos)}
                    </td>
                    <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-semibold text-emerald-950">
                      {formatPercentage(row.cobertura)}
                    </td>
                    <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right text-emerald-950">
                      {formatNumber(row.incrementoAtendidos)}
                    </td>
                    <td className="whitespace-nowrap bg-emerald-50 px-4 py-4 text-right font-medium text-emerald-950">
                      {formatPercentage(porcentajeDiferencia)}
                    </td>
                    <td className="whitespace-nowrap bg-amber-50 px-4 py-4 text-right font-semibold text-amber-950">
                      {formatPercentage(row.meta)}
                    </td>
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
                  <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-500">
                    No hay datos para mostrar con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {establecimientoModal && (
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
                  Atenciones acumuladas hasta {MESES[mes - 1]} de {gestion}
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
                      allowDecimals={false}
                      tickFormatter={(value: number) => formatNumber(value)}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [formatNumber(Number(value)), 'Atendidos acumulados']}
                      labelFormatter={(label) => `Mes: ${label}`}
                    />
                    <Bar dataKey="atendidos" name="Atendidos acumulados" fill="#10b981" radius={[5, 5, 0, 0]} />
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
