import { CrearSolicitudDto } from '../dtos/CrearSolicitud.dto';
import { Solicitud } from '../entities/Solicitud.entity';
import { Cliente } from '../entities/Cliente.entity';
import { IngresoFamiliar } from '../entities/IngresoFamiliar.entity';

export class SolicitudController {
  
  /**
   * Endpoint: POST /api/solicitudes
   * Procesa la captura de datos del formulario de la Landing Page / App Móvil
   */
  public async crearSolicitud(payload: CrearSolicitudDto): Promise<{ success: boolean; mensaje: string; data?: any }> {
    try {
      // 1. Validaciones de Regla de Negocio en el Servidor
      const totalVehiculo = payload.valorMoto + payload.valorTramites;
      const cuotaMinima = totalVehiculo * 0.20;

      if (payload.cuotaInicial < cuotaMinima) {
        return {
          success: false,
          mensaje: `Rechazado: La cuota inicial ($${payload.cuotaInicial.toLocaleString('es-CO')}) no puede ser menor al 20% del total ($${cuotaMinima.toLocaleString('es-CO')}).`
        };
      }

      // 2. Estructurar la entidad del Cliente
      const nuevoCliente: Cliente = {
        numeroCc: payload.numeroCc,
        nombreCompleto: payload.nombreCompleto,
        celularWhatsapp: payload.celularWhatsapp,
        ingresosMensuales: payload.ingresosMensuales,
        egresosMensuales: payload.egresosMensuales,
        fotoCedulaFrontal: payload.fotoCedulaFrontal || undefined,
        fotoCedulaTrasera: payload.fotoCedulaTrasera || undefined
      };

      // 3. Estructurar la entidad de la Solicitud
      const codigoGenerado = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;
      
      const nuevaSolicitud: Solicitud = {
        codigoSolicitud: codigoGenerado,
        clienteId: 0, // Se asignará tras la inserción en PostgreSQL
        valorMoto: payload.valorMoto,
        valorTramites: payload.valorTramites,
        cuotaInicial: payload.cuotaInicial,
        estado: 'PENDIENTE_OTP'
      };

      // 4. Estructurar Ingreso Familiar (si fue Diligenciado)
      let datosFamiliar: IngresoFamiliar | null = null;
      if (payload.ingresosFamiliares) {
        datosFamiliar = {
          solicitudId: 0,
          parentesco: payload.ingresosFamiliares.parentesco,
          nombreCompleto: payload.ingresosFamiliares.nombreCompleto,
          numeroCc: payload.ingresosFamiliares.numeroCc,
          actividadEconomica: payload.ingresosFamiliares.actividadEconomica,
          ingresosMensuales: payload.ingresosFamiliares.ingresosMensuales,
          egresosMensuales: payload.ingresosFamiliares.egresosMensuales
        };
      }

      // 5. Simulación de Respuesta (Pre-Aprobación / Generación de OTP)
      return {
        success: true,
        mensaje: 'Solicitud recibida con éxito. OTP generado y enviado por WhatsApp.',
        data: {
          codigoSolicitud: codigoGenerado,
          cliente: nuevoCliente.nombreCompleto,
          montoFinanciar: totalVehiculo - payload.cuotaInicial,
          estado: nuevaSolicitud.estado,
          familiarIncluido: !!datosFamiliar
        }
      };

    } catch (error) {
      return {
        success: false,
        mensaje: 'Error interno al procesar la solicitud de crédito.'
      };
    }
  }
}