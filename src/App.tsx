import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { CaiIdentificacionForm, type CaiSession } from './components/CaiIdentificacionForm'
import { CaiRegistroForm } from './components/CaiRegistroForm'
import { getSupabaseClient } from './lib/supabaseClient'
import type { Database } from './lib/database.types'
import logoGam from './assets/logo gam.png'
import logoSus from './assets/logo_SUS.png'

const SESSION_STORAGE_KEY = 'sicofs_operador'
type Grupo = Database['public']['Tables']['cai_grupos']['Row']
type ActiveView = 'inicio' | 'registro' | 'reportes'
const CaiReportes = lazy(() =>
  import('./components/CaiReportes').then((module) => ({ default: module.CaiReportes })),
)

type SidebarProps = {
  grupos: Grupo[]
  grupoActivoId: string
  activeView: ActiveView
  isLoading: boolean
  onSelect: (groupId: string) => void
  onHome: () => void
  onOpenReports: () => void
  onLogout: () => void
  session: CaiSession
  isMobile?: boolean
  onCloseMobile?: () => void
  isCollapsed?: boolean
  onToggleCollapsed?: () => void
}

function readStoredSession(): CaiSession | null {
  try {
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!storedSession) return null

    const session: unknown = JSON.parse(storedSession)
    if (
      typeof session === 'object' &&
      session !== null &&
      'responsable' in session &&
      'telefono' in session &&
      'establecimientoId' in session &&
      'establecimientoNombre' in session &&
      'operadorId' in session &&
      'usuario' in session &&
      typeof session.operadorId === 'string' &&
      typeof session.usuario === 'string' &&
      typeof session.responsable === 'string' &&
      typeof session.telefono === 'string' &&
      typeof session.establecimientoId === 'string' &&
      typeof session.establecimientoNombre === 'string'
    ) {
      return session as CaiSession
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }

  return null
}

function Sidebar({
  grupos,
  grupoActivoId,
  activeView,
  isLoading,
  onSelect,
  onHome,
  onOpenReports,
  onLogout,
  session,
  isMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const [isAccordionOpen, setIsAccordionOpen] = useState(true)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <aside
      className={`flex flex-col bg-[#0d4859] text-white shadow-xl transition-all duration-300 ${
        isMobile
          ? 'relative z-auto h-full w-full'
          : `fixed inset-y-0 left-0 z-30 ${isCollapsed ? 'w-16' : 'w-64'}`
      }`}
    >
      {!isMobile && (
        <div
          className={`flex items-center border-b border-white/15 py-4 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {!isCollapsed && <span className="text-sm font-bold">Navegación CAI</span>}
          {onToggleCollapsed && (
            <button
              type="button"
              aria-label={isCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
              aria-expanded={!isCollapsed}
              onClick={onToggleCollapsed}
              className="rounded-lg px-2 py-1 text-lg text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            >
              {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
          )}
        </div>
      )}
      {isMobile && (
        <div className="flex items-center justify-between border-b border-white/15 px-5 py-4">
          <span className="text-sm font-bold">Navegación CAI</span>
          {onCloseMobile && (
            <button
              type="button"
              aria-label="Cerrar menú de navegación"
              onClick={onCloseMobile}
              className="rounded-lg p-2 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <X size={20} />
            </button>
          )}
        </div>
      )}

      <div className={`border-b border-white/15 py-5 ${isCollapsed ? 'px-2 text-center' : 'px-5'}`}>
        {!isCollapsed ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
              Establecimiento activo
            </p>
            <p className="mt-2 text-sm font-bold leading-5 text-white">{session.establecimientoNombre}</p>
            <p className="mt-3 text-xs leading-5 text-teal-100">
              Operador · {session.responsable}
              {session.telefono && <span className="block">Contacto · {session.telefono}</span>}
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-4 flex w-full items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <LogOut size={15} />
              Cambiar Centro / Salir
            </button>
          </>
        ) : (
          <span title={session.establecimientoNombre} className="text-sm font-bold">
            {session.establecimientoNombre.slice(0, 1)}
          </span>
        )}
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-5 space-y-1">
          <button
            type="button"
            aria-current={activeView === 'inicio' ? 'page' : undefined}
            onClick={onHome}
            title={isCollapsed ? 'Inicio' : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-white ${
              activeView === 'inicio'
                ? 'bg-white font-semibold text-[#0d4859] shadow-sm'
                : 'text-teal-50 hover:bg-white/10'
            }`}
          >
            <Home size={19} aria-hidden="true" />
            {!isCollapsed && <span>INICIO</span>}
          </button>
          <button
            type="button"
            aria-current={activeView === 'registro' ? 'page' : undefined}
            onClick={() => (grupoActivoId ? onSelect(grupoActivoId) : undefined)}
            disabled={!grupoActivoId}
            title={isCollapsed ? 'Registro de datos' : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-white disabled:cursor-not-allowed disabled:opacity-60 ${
              activeView === 'registro'
                ? 'bg-white font-semibold text-[#0d4859] shadow-sm'
                : 'text-teal-50 hover:bg-white/10'
            }`}
          >
            <ClipboardList size={19} aria-hidden="true" />
            {!isCollapsed && <span>Registro de Datos</span>}
          </button>
          <button
            type="button"
            aria-current={activeView === 'reportes' ? 'page' : undefined}
            onClick={onOpenReports}
            title={isCollapsed ? 'Reportes de Cobertura' : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-white ${
              activeView === 'reportes'
                ? 'bg-white font-semibold text-[#0d4859] shadow-sm'
                : 'text-teal-50 hover:bg-white/10'
            }`}
          >
            <BarChart3 size={19} aria-hidden="true" />
            {!isCollapsed && <span>Reportes de Cobertura</span>}
          </button>
        </div>
        {!isCollapsed && (
          <>
            <button
              type="button"
              aria-expanded={isAccordionOpen}
              aria-controls="indicator-groups"
              onClick={() => setIsAccordionOpen((open) => !open)}
              className="flex w-full items-center justify-between px-3 pb-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-teal-200 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <span>Grupos de indicadores</span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`transition-transform duration-300 ${isAccordionOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isAccordionOpen && (
              <div id="indicator-groups">
                {isLoading ? (
                  <p className="px-3 py-2 text-sm text-teal-100">Cargando grupos…</p>
                ) : grupos.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-teal-100">No hay grupos disponibles.</p>
                ) : (
                  <ul className="space-y-1">
                    {grupos.map((grupo, index) => {
                      const isActive = grupo.id === grupoActivoId
                      const isOpen = openGroup === grupo.id
                      const groupId = `indicator-group-${grupo.id}`
                      return (
                        <li key={grupo.id}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={groupId}
                            onClick={() => setOpenGroup((current) => current === grupo.id ? null : grupo.id)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-white ${
                              isActive
                                ? 'bg-white font-semibold text-[#0d4859] shadow-sm'
                                : 'text-teal-50 hover:bg-white/10'
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                isActive ? 'bg-cai-100 text-cai-900' : 'bg-white/10 text-white'
                              }`}
                            >
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">{grupo.nombre}</span>
                            {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                          </button>
                          {isOpen && (
                            <div id={groupId} className="pb-1 pl-12 pr-2">
                              <button
                                type="button"
                                onClick={() => onSelect(grupo.id)}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-teal-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
                              >
                                Registrar datos
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
        {isCollapsed && !isLoading && (
          <ul className="space-y-1" aria-label="Grupos de indicadores">
            {grupos.map((grupo, index) => (
              <li key={grupo.id}>
                  <button
                    type="button"
                    aria-current={grupo.id === grupoActivoId ? 'page' : undefined}
                    onClick={() => onSelect(grupo.id)}
                    title={grupo.nombre}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-white ${
                      grupo.id === grupoActivoId
                        ? 'bg-white font-semibold text-[#0d4859] shadow-sm'
                        : 'text-teal-50 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                  </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {!isCollapsed && (
        <div className="border-t border-white/15 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white">SICOFS · CAI 2026</p>
          <p className="mt-1 text-xs text-teal-200">Secretaría Municipal de Salud</p>
        </div>
      )}
      {isCollapsed && (
        <div className="border-t border-white/15 px-2 py-3">
          <button
            type="button"
            aria-label="Cambiar Centro / Salir"
            title="Cambiar Centro / Salir"
            onClick={onLogout}
            className="w-full rounded-lg px-2 py-2 text-sm text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <LogOut size={18} className="mx-auto" />
          </button>
        </div>
      )}
    </aside>
  )
}

function InstitutionalBanner() {
  return (
    <header
      aria-label="Identidad institucional"
      className="mb-6 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-gradient-to-r from-[#0a2e35] via-[#0d3c45] to-[#134e5a] px-5 py-5 shadow-lg sm:px-7"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm">
          <img
            src={logoGam}
            alt="Logotipo del Gobierno Autónomo Municipal de Montero"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200 sm:text-sm">
            Gobierno Autónomo Municipal de Montero
          </p>
          <p className="mt-1 text-sm font-medium text-white sm:text-base">
            Secretaría Municipal de Salud
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center rounded-xl bg-white px-4 py-2.5 shadow-sm">
        <img
          src={logoSus}
          alt="Insignia del Sistema Único de Salud"
          className="h-10 w-auto object-contain sm:h-12"
        />
      </div>
    </header>
  )
}

export function App() {
  const [session, setSession] = useState<CaiSession | null>(readStoredSession)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoActivoId, setGrupoActivoId] = useState('')
  const [activeView, setActiveView] = useState<ActiveView>('inicio')
  const [isLoadingGrupos, setIsLoadingGrupos] = useState(true)
  const [gruposError, setGruposError] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  useEffect(() => {
    let active = true

    async function loadGrupos() {
      setIsLoadingGrupos(true)
      setGruposError('')
      try {
        const { data, error } = await getSupabaseClient()
          .from('cai_grupos')
          .select('id, nombre, orden')
          .order('orden')
        if (error) throw error
        if (active) {
          const loadedGroups = data ?? []
          setGrupos(loadedGroups)
          setGrupoActivoId((currentId) =>
            loadedGroups.some((grupo) => grupo.id === currentId)
              ? currentId
              : (loadedGroups[0]?.id ?? ''),
          )
        }
      } catch (error) {
        if (active) {
          setGruposError(
            `No se pudieron cargar los grupos: ${
              error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
            }`,
          )
        }
      } finally {
        if (active) setIsLoadingGrupos(false)
      }
    }

    void loadGrupos()
    return () => {
      active = false
    }
  }, [])

  function handleIdentified(nextSession: CaiSession) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
  }

  function handleLogout() {
    localStorage.removeItem('sicofs_operador')
    setSession(null)
    setIsMobileMenuOpen(false)
  }

  function handleGroupSelect(groupId: string) {
    setGrupoActivoId(groupId)
    setActiveView('registro')
    setIsMobileMenuOpen(false)
  }

  function handleHome() {
    setActiveView('inicio')
    setIsMobileMenuOpen(false)
  }

  function handleOpenReports() {
    setActiveView('reportes')
    setIsMobileMenuOpen(false)
  }

  if (!session) {
    return <CaiIdentificacionForm onIdentified={handleIdentified} />
  }

  const grupoActivo = grupos.find((grupo) => grupo.id === grupoActivoId)
  const navigationProps: SidebarProps = {
    grupos,
    grupoActivoId,
    activeView,
    isLoading: isLoadingGrupos,
    onSelect: handleGroupSelect,
    onHome: handleHome,
    onOpenReports: handleOpenReports,
    onLogout: handleLogout,
    session,
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="hidden md:block">
        <Sidebar
          {...navigationProps}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
        />
      </div>

      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">Compromisos de Gestión CAI</p>
              <p className="truncate text-xs text-slate-500">{session.establecimientoNombre}</p>
            </div>
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-group-menu"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="shrink-0 rounded-lg bg-[#0d4859] px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cai-600 focus:ring-offset-2"
            >
              {isMobileMenuOpen ? (
                <span className="inline-flex items-center gap-2"><X size={16} /> Cerrar</span>
              ) : (
                <span className="inline-flex items-center gap-2"><Menu size={16} /> Grupos</span>
              )}
            </button>
          </div>
        </header>

        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-slate-950/40 md:hidden">
            <aside
              id="mobile-group-menu"
              className="flex h-full w-[min(20rem,88vw)] flex-col bg-[#0d4859] text-white shadow-2xl"
            >
              <Sidebar {...navigationProps} isMobile onCloseMobile={() => setIsMobileMenuOpen(false)} />
            </aside>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="absolute inset-0 -z-10 cursor-default"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          </div>
        )}

        <main className="w-full max-w-none px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
          <InstitutionalBanner />
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cai-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cai-700">
                Sistema SICOFS
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                Gestión 2026
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {activeView === 'inicio'
                ? 'SISTEMA SICOFS · Gestión 2026'
                : activeView === 'reportes'
                  ? 'Reportes de Cobertura'
                  : 'Compromisos de Gestión CAI 2026'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {activeView === 'inicio'
                ? 'Comité de Análisis de Información · Gobierno Autónomo Municipal de Montero'
                : activeView === 'reportes'
                  ? 'Analice la cobertura y el avance de los indicadores por establecimiento.'
                  : 'Registre la configuración anual y el avance mensual de los indicadores de su establecimiento.'}
            </p>
          </header>

          {gruposError && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {gruposError}
            </div>
          )}

          {activeView === 'inicio' ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cai-700">
                  Comité de Análisis de Información (CAI)
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">
                  Compromisos de Gestión CAI 2026
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Bienvenido al sistema de seguimiento de compromisos e indicadores de salud.
                  Seleccione una opción para registrar avances o revisar los reportes de cobertura
                  de {session.establecimientoNombre}.
                </p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
                <button
                  type="button"
                  onClick={() => handleGroupSelect(grupoActivoId)}
                  disabled={!grupoActivoId}
                  className="rounded-xl border border-cai-100 bg-cai-50 p-5 text-left transition hover:border-cai-600 focus:outline-none focus:ring-2 focus:ring-cai-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ClipboardList size={24} className="text-cai-700" aria-hidden="true" />
                  <span className="mt-3 block font-semibold text-cai-900">Registro de datos</span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Registre la configuración anual y el avance mensual de los indicadores.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenReports}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-cai-600 focus:outline-none focus:ring-2 focus:ring-cai-600"
                >
                  <BarChart3 size={24} className="text-cai-700" aria-hidden="true" />
                  <span className="mt-3 block font-semibold text-slate-900">Reportes de cobertura</span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Consulte el avance y la cobertura de los compromisos de gestión.
                  </span>
                </button>
              </div>
            </section>
          ) : activeView === 'reportes' ? (
            <Suspense
              fallback={
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  Cargando el dashboard de reportes…
                </div>
              }
            >
              <CaiReportes gestion={2026} />
            </Suspense>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cai-700">Grupo activo</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                  {isLoadingGrupos ? 'Cargando grupos…' : grupoActivo?.nombre ?? 'Seleccione un grupo'}
                </h2>
                {grupoActivo && (
                  <p className="mt-1 text-sm text-slate-500">
                    Seleccione un indicador para consultar y registrar sus resultados.
                  </p>
                )}
              </div>
              <div className="p-5 sm:p-7">
                {grupoActivoId ? (
                  <CaiRegistroForm
                    key={`${session.establecimientoId}-${grupoActivoId}`}
                    establecimientoId={session.establecimientoId}
                    grupoId={grupoActivoId}
                    gestion={2026}
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    {isLoadingGrupos
                      ? 'Cargando el catálogo de grupos de indicadores…'
                      : 'No hay grupos disponibles para mostrar.'}
                  </p>
                )}
              </div>
            </section>
          )}

          <footer className="py-6 text-center text-xs text-slate-400">
            Secretaría Municipal de Salud · Sistema SICOFS
          </footer>
        </main>
      </div>
    </div>
  )
}
