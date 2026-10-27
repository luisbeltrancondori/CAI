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

export function isSrpDropoutIndicator(indicator: Pick<IndicatorIdentity, 'numero_indicador'> | undefined): boolean {
  return Number(indicator?.numero_indicador) === 14
}

export function isPentavalentDropoutIndicator(
  indicator: Pick<IndicatorIdentity, 'numero_indicador'> | undefined,
): boolean {
  return Number(indicator?.numero_indicador) === 11
}

export function isCalculatedDropoutIndicator(
  indicator: Pick<IndicatorIdentity, 'numero_indicador'> | undefined,
): boolean {
  return isSrpDropoutIndicator(indicator) || isPentavalentDropoutIndicator(indicator)
}

export function getDropoutSourceIndicators<T extends IndicatorIdentity>(
  dropoutIndicator: IndicatorIdentity | undefined,
  indicators: T[],
): { firstDose: T | undefined; finalDose: T | undefined } {
  if (isSrpDropoutIndicator(dropoutIndicator)) {
    return {
      firstDose: indicators.find((indicator) => Number(indicator.numero_indicador) === 12),
      finalDose: indicators.find((indicator) => Number(indicator.numero_indicador) === 13),
    }
  }

  if (!isPentavalentDropoutIndicator(dropoutIndicator)) {
    return { firstDose: undefined, finalDose: undefined }
  }

  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const isThirdPentavalentDose = (indicator: T) => {
    if (indicator === dropoutIndicator || Number(indicator.numero_indicador) === 57) return false
    const description = normalize(indicator.descripcion ?? '')
    return (
      description.includes('pentavalent') &&
      /\b(3(?:ra|era|er)|tercera)\b/.test(description) &&
      /dosis/.test(description)
    )
  }
  const thirdDoseIndicator10 = indicators.find(
    (indicator) => Number(indicator.numero_indicador) === 10 && isThirdPentavalentDose(indicator),
  )
  const matchingThirdDoseIndicators = indicators.filter(isThirdPentavalentDose)

  return {
    firstDose: indicators.find((indicator) => Number(indicator.numero_indicador) === 57),
    finalDose: thirdDoseIndicator10 ??
      (matchingThirdDoseIndicators.length === 1 ? matchingThirdDoseIndicators[0] : undefined),
  }
}

export function calculateDropoutRate(firstDoses: number, finalDoses: number): number | null {
  if (!Number.isFinite(firstDoses) || firstDoses <= 0) return 0
  if (!Number.isFinite(finalDoses)) return null
  return Number((((firstDoses - finalDoses) / firstDoses) * 100).toFixed(2))
}

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
