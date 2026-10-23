# Compromisos de Gestión CAI 2026

Interfaz React + TypeScript + Tailwind CSS para registrar la configuración anual del indicador y el numerador mensual en Supabase.

## Inicio

1. Instale dependencias con `npm install`.
2. Copie `.env.example` a `.env` y complete `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Aplique las migraciones de `supabase/migrations` al proyecto Supabase (por ejemplo, con `supabase db push`). Para un proyecto donde la RPC ya existía antes de agregar `password_hash`, aplique también `20261023000200_sync_operator_password_hashes.sql`.
4. Ejecute `npm run dev`; para verificar la compilación de producción, ejecute `npm run build`.

El acceso admite inicio de sesión y registro de operadores. Los datos del perfil y establecimiento seleccionados se conservan en `localStorage` bajo la clave `sicofs_operador`. Las contraseñas no se guardan en texto plano: se almacenan como hashes bcrypt generados en PostgreSQL y se verifican mediante funciones RPC `SECURITY DEFINER`. La tabla no concede acceso directo a `anon` ni `authenticated`; aplique la migración SQL antes de usar el formulario.

El panel principal incluye una vista INICIO, reportes y registro de datos; los grupos ordenados por `orden` se muestran en una barra lateral responsiva con acordeón y modo compacto. El encabezado institucional utiliza los logos del GAM Montero y del SUS.

## Esquema esperado

El cliente tipado y el formulario esperan estas columnas:

- `cai_grupos`: `id`, `nombre`, `orden`.
- `cai_establecimientos`: `id`, `nombre`.
- `cai_operadores`: `id`, `nombre_completo`, `telefono`, `establecimiento_id`, `usuario`, `contrasena_hash`, `password_hash`, `created_at` (creada por la migración de autenticación; las dos columnas de contraseña guardan el mismo hash bcrypt para compatibilidad con esquemas existentes).
- `cai_indicadores`: `id`, `grupo_id`, `numero_indicador`, `descripcion`, `numerador_explicacion`, `denominador_explicacion`.
- `cai_config_establecimiento`: `establecimiento_id`, `indicador_id`, `gestion`, `compromiso_gestion`, `poblacion_programada`.
- `cai_registros_mensuales`: `establecimiento_id`, `indicador_id`, `gestion`, `mes`, `valor_numerador`.

Se asume que las claves `id`, `grupo_id`, `indicador_id` y `establecimiento_id` son UUID (texto) y que `mes` es un entero del 1 al 12. Las dos tablas de persistencia deben tener las restricciones únicas indicadas por los conflictos de upsert: `(establecimiento_id, indicador_id, gestion)` y `(establecimiento_id, indicador_id, gestion, mes)`.

El componente reutilizable se exporta desde `src/components/CaiRegistroForm.tsx` y recibe `establecimientoId` y, opcionalmente, `gestion`.

El panel incluye **Reportes de Cobertura**, con filtros por centro, mes, grupo e indicador, KPIs, comparación semestral por establecimiento y exportación CSV compatible con Excel. Los reportes consultan `cai_config_establecimiento` y `cai_registros_mensuales` por páginas para la gestión seleccionada y calculan la cobertura acumulada hasta el mes del filtro. El gráfico apila el porcentaje logrado entre enero y junio con el incremento de julio hasta el mes seleccionado, e identifica ambos segmentos y el total acumulado; el tooltip también presenta la brecha restante frente a la meta institucional. La tabla detalla población, atendidos y porcentaje a junio, acumulado al mes seleccionado, incremento del segundo semestre, diferencia porcentual, compromiso de gestión y semáforo. El KPI de calificación mide el cumplimiento de la meta (cobertura/meta): rojo hasta 50%, amarillo por encima de 50% y hasta 80%, verde por encima de 80%; los registros sin meta se muestran como “Sin meta”.
