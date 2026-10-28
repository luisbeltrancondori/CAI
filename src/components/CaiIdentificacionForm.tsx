import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { Database } from '../lib/database.types'

export type CaiSession = {
  operadorId: string
  usuario: string
  responsable: string
  telefono: string
  establecimientoId: string
  establecimientoNombre: string
}

export type CaiAdminSession = {
  email: string
}

type Establecimiento = Pick<
  Database['public']['Tables']['cai_establecimientos']['Row'],
  'id' | 'nombre'
>

type CaiIdentificacionFormProps = {
  onIdentified: (session: CaiSession) => void
  onAdminIdentified: (session: CaiAdminSession) => void
  onGuestAccess: () => void
}

type AuthMode = 'login' | 'register' | 'admin'

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

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code
    if (typeof code === 'string') return code
  }
  return undefined
}

export function CaiIdentificacionForm({
  onIdentified,
  onAdminIdentified,
  onGuestAccess,
}: CaiIdentificacionFormProps) {
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [mode, setMode] = useState<AuthMode>('login')
  const [nombreCompleto, setNombreCompleto] = useState('')
  const [cedula, setCedula] = useState('')
  const [telefono, setTelefono] = useState('')
  const [establecimientoId, setEstablecimientoId] = useState('')
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [isLoadingEstablecimientos, setIsLoadingEstablecimientos] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [establecimientosError, setEstablecimientosError] = useState('')

  useEffect(() => {
    let active = true

    async function loadEstablecimientos() {
      setIsLoadingEstablecimientos(true)
      try {
        const { data, error: queryError } = await getSupabaseClient()
          .from('cai_establecimientos')
          .select('id, nombre')
          .order('nombre')
        if (queryError) throw queryError
        if (active) setEstablecimientos(data ?? [])
      } catch (loadError) {
        if (active) {
          setEstablecimientosError(`No se pudieron cargar los establecimientos: ${errorMessage(loadError)}`)
        }
      } finally {
        if (active) setIsLoadingEstablecimientos(false)
      }
    }

    void loadEstablecimientos()
    return () => {
      active = false
    }
  }, [])

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setRegistrationMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const normalizedUsuario = usuario.trim()
    if (!normalizedUsuario || !contrasena) {
      setError('Ingrese el usuario y la contraseña.')
      return
    }

    if (mode === 'register') {
      if (contrasena.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.')
        return
      }
      if (!nombreCompleto.trim()) {
        setError('Ingrese el nombre completo del operador.')
        return
      }
      if (!cedula.trim()) {
        setError('Ingrese el número de cédula.')
        return
      }
      if (!establecimientos.find((item) => item.id === establecimientoId)) {
        setError('Seleccione un centro de salud válido.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const supabase = getSupabaseClient()
      if (mode === 'admin') {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: normalizedUsuario,
          password: contrasena,
        })
        if (loginError) throw loginError
        const { data: isAuthorized, error: authorizationError } = await supabase.rpc(
          'cai_admin_es_autorizado',
        )
        if (authorizationError) {
          const { error: signOutError } = await supabase.auth.signOut()
          if (signOutError) throw signOutError
          throw authorizationError
        }
        if (!isAuthorized) {
          const { error: signOutError } = await supabase.auth.signOut()
          if (signOutError) throw signOutError
          setError('Esta cuenta no está autorizada como Administrador.')
          return
        }
        onAdminIdentified({ email: data.user.email ?? normalizedUsuario })
        return
      }

      if (mode === 'login') {
        const { data, error: loginError } = await supabase.rpc('cai_operador_login', {
          p_usuario: normalizedUsuario,
          p_contrasena: contrasena,
        })
        if (loginError) throw loginError
        const operator = data?.[0]
        if (!operator) {
          setError('Usuario o contraseña incorrectos.')
          return
        }
        if (operator.estado !== 'activo') {
          setError(
            operator.estado === 'pendiente'
              ? 'Su cuenta aún se encuentra pendiente de aprobación por el Administrador de la Secretaría de Salud.'
              : 'Esta cuenta no está activa. Comuníquese con el Administrador de la Secretaría de Salud.',
          )
          return
        }
        onIdentified({
          operadorId: operator.id,
          usuario: operator.usuario,
          responsable: operator.nombre_completo,
          telefono: operator.telefono ?? '',
          establecimientoId: operator.establecimiento_id,
          establecimientoNombre: operator.establecimiento_nombre,
        })
        return
      }

      const { data, error: registerError } = await supabase.rpc('cai_operador_registrar', {
        p_nombre_completo: nombreCompleto.trim(),
        p_cedula: cedula.trim(),
        p_telefono: telefono.trim(),
        p_establecimiento_id: establecimientoId,
        p_usuario: normalizedUsuario,
        p_contrasena: contrasena,
      })
      if (registerError) throw registerError
      const operator = data?.[0]
      if (!operator) throw new Error('El registro no devolvió los datos del operador.')

      setRegistrationMessage(
        '¡Registro completado! Su cuenta está pendiente de aprobación por el Administrador de la Secretaría de Salud. Podrá iniciar sesión una vez sea autorizada.',
      )
      setMode('login')
      setContrasena('')
      setCedula('')
    } catch (submitError) {
      const message = errorMessage(submitError)
      if (mode === 'login' && errorCode(submitError) === '28000') {
        setError('Usuario o contraseña incorrectos.')
      } else if (mode === 'register' && errorCode(submitError) === '23505') {
        setError(
          message.includes('cai_operadores_cedula')
            ? 'Ese número de cédula ya tiene una solicitud o cuenta registrada.'
            : 'Ese nombre de usuario ya está registrado.',
        )
      } else {
        setError(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <header className="mb-6 text-center text-slate-800">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cai-50 text-sm font-bold tracking-wide text-cai-900"
          >
            SMS
          </div>
          <h1 className="text-lg font-bold uppercase tracking-wide">
            Secretaría Municipal de Salud
          </h1>
          <p className="mt-2 text-xs font-semibold tracking-[0.18em] text-cai-700">
            SISTEMA SICOFS · GESTIÓN 2026
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8"
        >
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'login'
                ? 'Iniciar sesión'
                : mode === 'admin'
                  ? 'Acceso administrador'
                  : 'Crear cuenta de operador'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login'
                ? 'Ingrese sus credenciales para acceder al sistema.'
                : mode === 'admin'
                  ? 'Ingrese con su cuenta institucional de Supabase Auth.'
                  : 'Registre sus datos para ingresar al sistema CAI.'}
            </p>
          </div>

          {registrationMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            >
              {registrationMessage}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {error}
            </div>
          )}

          {mode === 'register' && (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Nombre completo
                <input
                  className={inputClassName}
                  type="text"
                  autoComplete="name"
                  placeholder="Ingrese su nombre completo"
                  value={nombreCompleto}
                  onChange={(event) => setNombreCompleto(event.target.value)}
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Cédula de identidad
                <input
                  className={inputClassName}
                  type="text"
                  autoComplete="off"
                  inputMode="text"
                  placeholder="Ingrese su número de cédula"
                  value={cedula}
                  onChange={(event) => setCedula(event.target.value)}
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Teléfono
                <input
                  className={inputClassName}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="Ingrese un número de contacto"
                  value={telefono}
                  onChange={(event) => setTelefono(event.target.value)}
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Centro de salud
                <select
                  className={inputClassName}
                  value={establecimientoId}
                  onChange={(event) => setEstablecimientoId(event.target.value)}
                  disabled={isLoadingEstablecimientos || establecimientos.length === 0}
                  required
                >
                  <option value="">
                    {isLoadingEstablecimientos
                      ? 'Cargando establecimientos…'
                      : establecimientos.length === 0
                        ? 'No hay establecimientos disponibles'
                        : 'Seleccione su centro de salud'}
                  </option>
                  {establecimientos.map((establecimiento) => (
                    <option key={establecimiento.id} value={establecimiento.id}>
                      {establecimiento.nombre}
                    </option>
                  ))}
                </select>
                {establecimientosError && (
                  <span role="alert" className="mt-2 block text-xs text-rose-700">
                    {establecimientosError}
                  </span>
                )}
              </label>
            </>
          )}

          <label className="block text-sm font-medium text-slate-700">
            {mode === 'admin' ? 'Correo de administrador' : 'Usuario'}
            <input
              className={inputClassName}
              type={mode === 'admin' ? 'email' : 'text'}
              autoComplete={mode === 'admin' ? 'email' : 'username'}
              placeholder={mode === 'admin' ? 'Ingrese su correo institucional' : 'Ingrese su usuario'}
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <input
              className={inputClassName}
              type="password"
              autoComplete={mode !== 'register' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : 'Ingrese su contraseña'}
              minLength={mode === 'register' ? 8 : undefined}
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              (mode === 'register' &&
                (isLoadingEstablecimientos || establecimientos.length === 0))
            }
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#0d4859] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3947] focus:outline-none focus:ring-2 focus:ring-[#0d4859] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting
              ? mode === 'register' ? 'Registrando…' : 'Ingresando…'
              : mode === 'register' ? 'Registrarse' : mode === 'admin' ? 'Ingresar como administrador' : 'Iniciar sesión'}
          </button>

          <p className="text-center text-sm text-slate-600">
            {mode === 'login' ? (
              <>
                ¿No tiene una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-semibold text-cai-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-cai-600"
                >
                  Registrarse
                </button>
                {' o '}
                <button
                  type="button"
                  onClick={onGuestAccess}
                  className="font-semibold text-cai-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-cai-600"
                >
                  Ingresar como Invitado
                </button>
              </>
            ) : mode === 'register' ? (
              <>
                ¿Ya tiene una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-cai-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-cai-600"
                >
                  Iniciar sesión
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-semibold text-cai-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-cai-600"
              >
                Volver al acceso de operadores
              </button>
            )}
          </p>
          {mode === 'login' && (
            <p className="text-center text-sm text-slate-600">
              <button
                type="button"
                onClick={() => switchMode('admin')}
                className="font-semibold text-cai-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-cai-600"
              >
                Acceso administrador
              </button>
            </p>
          )}
          <p className="text-center text-xs text-slate-400">Compromisos de Gestión CAI · Gestión 2026</p>
          
        </form>
      </div>
    </main>
  )
}
