export interface Solicitud {
  id?: number;
  codigoSolicitud: string;
  clienteId: number;
  valorMoto: number;
  valorTramites: number;
  valorTotal?: number;      // Campo calculado en BD
  cuotaInicial: number;
  montoFinanciar?: number;  // Campo calculado en BD
  estado: 'PENDIENTE_OTP' | 'PRE_APROBADO' | 'DENEGADO' | 'EN_REVISION';
  motivoRechazo?: string;
  creadoEn?: Date;
}
