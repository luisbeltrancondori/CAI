import { useCallback, useEffect, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { Database } from '../lib/database.types'

type Solicitud = Database['public']['Functions']['cai_admin_solicitudes_pendientes']['Returns'][number]

type CaiAprobacionesProps = {
  adminEmail: string
  error?: string
  onSignOut: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') return message
  }
  return 'Ocurrió un error inesperado.'
}

export function CaiAprobaciones({ adminEmail, error: authError = '', onSignOut }: CaiAprobacionesProps) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeSolicitudId, setActiveSolicitudId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadSolicitudes = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const { data, error: loadError } = await getSupabaseClient().rpc(
        'cai_admin_solicitudes_pendientes',
      )
      if (loadError) throw loadError
      setSolicitudes(data ?? [])
    } catch (loadError) {
      setError(`No se pudieron cargar las solicitudes pendientes: ${errorMessage(loadError)}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSolicitudes()
  }, [loadSolicitudes])

  async function resolveSolicitud(solicitud: Solicitud, aprobar: boolean) {
    setActiveSolicitudId(solicitud.id)
    setError('')
    setNotice('')
    try {
      const { error: resolveError } = await getSupabaseClient().rpc(
        'cai_admin_resolver_solicitud',
        {
          p_operador_id: solicitud.id,
          p_aprobar: aprobar,
        },
      )
      if (resolveError) throw resolveError
      setNotice(
        aprobar
          ? `La cuenta de ${solicitud.nombre_completo} fue aprobada.`
          : `La solicitud de ${solicitud.nombre_completo} fue rechazada.`,
      )
      await loadSolicitudes()
    } catch (resolveError) {
      setError(`No se pudo procesar la solicitud: ${errorMessage(resolveError)}`)
    } finally {
      setActiveSolicitudId('')
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#0d4859] px-5 py-5 text-white shadow-lg sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">
              Administración de acceso
            </p>
            <h1 className="mt-1 text-2xl font-bold">Solicitudes de operadores</h1>
            <p className="mt-2 text-sm text-teal-50">{adminEmail}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadSolicitudes()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0d4859] hover:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {authError && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {authError}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <h2 className="text-lg font-bold text-slate-900">Cuentas pendientes de aprobación</h2>
            <p className="mt-1 text-sm text-slate-500">
              Verifique la identidad y el centro de salud antes de aprobar el acceso.
            </p>
          </div>
          {isLoading ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">Cargando solicitudes…</p>
          ) : solicitudes.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No hay solicitudes pendientes de aprobación.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Nombre completo</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Cédula</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Centro solicitado</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Fecha</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {solicitudes.map((solicitud) => (
                    <tr key={solicitud.id}>
                      <th scope="row" className="px-5 py-4 text-left font-semibold text-slate-800">
                        {solicitud.nombre_completo}
                        {solicitud.telefono && (
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            Tel. {solicitud.telefono}
                          </span>
                        )}
                      </th>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-700">{solicitud.cedula || '—'}</td>
                      <td className="px-5 py-4 text-slate-700">{solicitud.establecimiento_nombre}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                        {new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(
                          new Date(solicitud.created_at),
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void resolveSolicitud(solicitud, true)}
                            disabled={Boolean(activeSolicitudId)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Check size={15} aria-hidden="true" />
                            {activeSolicitudId === solicitud.id ? 'Procesando…' : 'Aprobar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void resolveSolicitud(solicitud, false)}
                            disabled={Boolean(activeSolicitudId)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <X size={15} aria-hidden="true" />
                            Rechazar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
