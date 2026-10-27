# Compromisos de Gestión CAI 2026

Interfaz React + TypeScript + Tailwind CSS para registrar la configuración anual del indicador y el numerador mensual en Supabase.

## Inicio

1. Instale dependencias con `npm install`.
2. Copie `.env.example` a `.env` y complete `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Aplique las migraciones de `supabase/migrations` al proyecto Supabase (por ejemplo, con `supabase db push`). Para un proyecto donde la RPC ya existía antes de agregar `password_hash`, aplique también `20261023000200_sync_operator_password_hashes.sql`. La migración `20261027000000_manual_operator_approval.sql` conserva como activos a los operadores ya registrados y deja pendientes los nuevos.
4. Ejecute `npm run dev`; para verificar la compilación de producción, ejecute `npm run build`.

El acceso admite inicio de sesión y registro de operadores. Los registros nuevos requieren cédula y quedan en estado `pendiente`; solo los operadores `activo` pueden acceder. Los datos de perfil y establecimiento de los operadores se conservan en `localStorage` bajo la clave `sicofs_operador`. Las contraseñas de operadores no se guardan en texto plano: se almacenan como hashes bcrypt generados en PostgreSQL y se verifican mediante funciones RPC `SECURITY DEFINER`. La tabla `cai_operadores` no concede acceso directo a `anon` ni `authenticated`; aplique las migraciones SQL antes de usar el formulario.

### Aprobar operadores

El panel de aprobación se autentica con Supabase Auth y cada operación se vuelve a autorizar en el servidor mediante `auth.uid()`; no se debe exponer una clave `service_role` en el frontend. Para habilitar al administrador:

1. Cree una cuenta del administrador en **Supabase Dashboard → Authentication → Users** (o use una cuenta Auth institucional existente) y habilite el acceso por contraseña.
2. Copie el UUID de esa cuenta e insértelo en SQL Editor de Supabase:

   ```sql
   insert into public.cai_administradores (auth_user_id)
   values ('UUID-DE-LA-CUENTA-AUTH');
   ```

3. Inicie sesión desde **Acceso administrador** en la aplicación. La lista muestra exclusivamente solicitudes pendientes y permite aprobarlas (`activo`) o rechazarlas (`rechazado`). Las RPC protegidas verifican el rol en base de datos en cada lectura y cambio de estado.

El panel principal incluye una vista INICIO, reportes y registro de datos; los grupos ordenados por `orden` se muestran en una barra lateral responsiva con acordeón y modo compacto. El encabezado institucional utiliza los logos del GAM Montero y del SUS.

## Esquema esperado

El cliente tipado y el formulario esperan estas columnas:

- `cai_grupos`: `id`, `nombre`, `orden`.
- `cai_establecimientos`: `id`, `nombre`.
- `cai_operadores`: `id`, `nombre_completo`, `telefono`, `establecimiento_id`, `usuario`, `contrasena_hash`, `password_hash`, `created_at` (creada por la migración de autenticación; las dos columnas de contraseña guardan el mismo hash bcrypt para compatibilidad con esquemas existentes).
- `cai_indicadores`: `id`, `grupo_id`, `numero_indicador`, `descripcion`, `numerador_explicacion`, `denominador_explicacion`.
- `cai_config_establecimiento`: `establecimiento_id`, `indicador_id`, `gestion`, `compromiso_gestion`, `poblacion_programada`.
- `cai_registros_mensuales`: `establecimiento_id`, `indicador_id`, `gestion`, `mes`, `valor_numerador` y `valor_denominador` (nullable; añadido por la migración de productividad).

El Indicador 52 del grupo Odontología y otros indicadores identificados como productividad/cociente registran actividades y consultas por separado. El reporte calcula actividades ÷ consultas; para la evaluación normativa redondea la tasa a dos decimales y clasifica 0.00–0.25 como Bajo, 0.26–0.59 como Regular (incluye el intervalo 0.51–0.59), 0.60–0.75 como Bueno y desde 0.76 como Muy bueno. Para habilitar esta captura y los reportes, aplicar `supabase/migrations/20261026000000_add_monthly_denominator.sql`.

Se asume que las claves `id`, `grupo_id`, `indicador_id` y `establecimiento_id` son UUID (texto) y que `mes` es un entero del 1 al 12. Las dos tablas de persistencia deben tener las restricciones únicas indicadas por los conflictos de upsert: `(establecimiento_id, indicador_id, gestion)` y `(establecimiento_id, indicador_id, gestion, mes)`.

El componente reutilizable se exporta desde `src/components/CaiRegistroForm.tsx` y recibe `establecimientoId` y, opcionalmente, `gestion`.

El panel incluye **Reportes de Cobertura**, con filtros por centro, mes, grupo e indicador, KPIs, comparación semestral por establecimiento y exportación CSV compatible con Excel. Los reportes consultan `cai_config_establecimiento` y `cai_registros_mensuales` por páginas para la gestión seleccionada y calculan la cobertura acumulada hasta el mes del filtro. El gráfico apila el porcentaje logrado entre enero y junio con el incremento de julio hasta el mes seleccionado, e identifica ambos segmentos y el total acumulado; el tooltip también presenta la brecha restante frente a la meta institucional. La tabla detalla población, atendidos y porcentaje a junio, acumulado al mes seleccionado, incremento del segundo semestre, diferencia porcentual, compromiso de gestión y semáforo. El KPI de calificación mide el cumplimiento de la meta (cobertura/meta): rojo hasta 50%, amarillo por encima de 50% y hasta 80%, verde por encima de 80%; los registros sin meta se muestran como “Sin meta”.

El **Indicador 14: Índice de Deserción SRP** es de solo lectura y se calcula con las dosis acumuladas hasta el mes seleccionado de los indicadores 12 (1ras dosis) y 13 (2das dosis): `((1ras dosis − 2das dosis) ÷ 1ras dosis) × 100`. El resultado se redondea a dos decimales y, cuando no hay primeras dosis, se muestra como 0 para evitar una división inválida. No se guarda un registro manual para el Indicador 14. La captura muestra el resultado y los reportes (incluidos gráfico mensual y CSV) lo evalúan con semáforo verde si está entre 0% y menos del 5%, y rojo si es negativo o igual/superior al 5%; el gráfico admite valores negativos y los representa bajo el cero.

El **Indicador 11: Índice de Deserción 3ra Pentavalente** sigue el mismo modo calculado y de solo lectura. Usa el indicador 57 como primeras dosis y el indicador 10 (`Cobertura de 3ra dosis de Pentavalente en < de 1 año`) como dosis finales. El cálculo usa los registros mensuales guardados por `indicador_id`, acumulados hasta el mes seleccionado. Usa la fórmula de deserción y el límite menor al 5%; los valores negativos o iguales/superiores al 5% se resaltan en rojo.
