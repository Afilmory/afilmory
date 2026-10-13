import type { Matrix3 } from './jpeg-gainmap'
import { inverseMatrix, multiplyMatrices } from './jpeg-gainmap'

// CICP primaries, D65 XYZ, column-major. Do not mix these with ICC D50 colorants.
const primaries: Record<number, Matrix3> = {
  1: [0.4123908, 0.2126390, 0.0193308, 0.3575843, 0.7151687, 0.1191948, 0.1804808, 0.0721923, 0.9505322],
  12: [0.48657095, 0.22897456, 0, 0.26566769, 0.69173852, 0.04511338, 0.19821729, 0.07928691, 1.04394437],
  9: [0.63695805, 0.26270021, 0, 0.1446169, 0.67799807, 0.02807269, 0.16888098, 0.05930172, 1.06098506],
}

export function gainMapColorTransforms(primary: number) {
  const space = primaries[primary]
  if (!space) {
    return null
  }
  const toDisplayP3 = multiplyMatrices(inverseMatrix(primaries[12]), space)
  return { toDisplayP3, toGainSpace: inverseMatrix(toDisplayP3) }
}
