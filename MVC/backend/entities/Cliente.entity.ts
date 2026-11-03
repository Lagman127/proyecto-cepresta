export interface Cliente {
  id?: number;
  numeroCc: string;
  nombreCompleto: string;
  celularWhatsapp: string;
  tipoContrato?: 'Asalariado' | 'Independiente' | 'Pensionado';
  ingresosMensuales: number;
  egresosMensuales: number;
  fotoCedulaFrontal?: string;
  fotoCedulaTrasera?: string;
  creadoEn?: Date;
}