type IndicatorIdentity = {
  numero_indicador: string
  grupo_id: string
  descripcion?: string
  numerador_explicacion?: string | null
  denominador_explicacion?: string | null
}

type GroupIdentity = {
  id: string
  nombre: string
}

export type ProductivityLevel = 'Bajo' | 'Regular' | 'Bueno' | 'Muy bueno' | 'Sin datos'

export function isMonthlyProductivityIndicator(
  indicator: IndicatorIdentity | undefined,
  groups: GroupIdentity[],
): boolean {
  if (!indicator) return false

  const groupName = groups.find((group) => group.id === indicator.grupo_id)?.nombre ?? ''
  const normalizedGroup = groupName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
  return Number(indicator.numero_indicador) === 52 && normalizedGroup.includes('odontologia')
}

export function getProductivityLevel(rate: number | null): ProductivityLevel {
  if (rate === null || !Number.isFinite(rate) || rate < 0) return 'Sin datos'
  const roundedRate = Math.round(rate * 100) / 100
  if (roundedRate <= 0.25) return 'Bajo'
  if (roundedRate <= 0.59) return 'Regular'
  if (roundedRate <= 0.75) return 'Bueno'
  return 'Muy bueno'
}
