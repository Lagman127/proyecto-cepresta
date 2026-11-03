export interface IngresoFamiliar {
  id?: number;
  solicitudId: number;
  parentesco: 'Esposa' | 'Padre' | 'Hijo' | 'Hermano';
  nombreCompleto: string;
  numeroCc: string;
  actividadEconomica?: string;
  ingresosMensuales: number;
  egresosMensuales: number;
  creadoEn?: Date;
}