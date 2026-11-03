export interface CrearSolicitudDto {
  // Datos del Vehículo y Cuota
  valorMoto: number;
  valorTramites: number;
  cuotaInicial: number;

  // Datos del Cliente
  nombreCompleto: string;
  numeroCc: string;
  celularWhatsapp: string;
  ingresosMensuales: number;
  egresosMensuales: number;

  // Cédula (Archivos o URLs de subida)
  fotoCedulaFrontal?: string;
  fotoCedulaTrasera?: string;

  // Datos del Familiar (Opcional)
  ingresosFamiliares?: {
    parentesco: 'Esposa' | 'Padre' | 'Hijo' | 'Hermano';
    nombreCompleto: string;
    numeroCc: string;
    actividadEconomica?: string;
    ingresosMensuales: number;
    egresosMensuales: number;
  };
}