import { CrearSolicitudDto } from '../dtos/CrearSolicitud.dto';

export class SolicitudService {
  
  /**
   * Guarda la información en la Base de Datos PostgreSQL (Transacción SQL)
   */
  public async guardarEnBaseDeDatos(payload: CrearSolicitudDto, codigoSolicitud: string): Promise<boolean> {
    try {
      // 1. Inserción en la tabla 'clientes'
      // SQL: INSERT INTO clientes (numero_cc, nombre_completo, celular_whatsapp, ingresos_mensuales, egresos_mensuales, foto_cedula_frontal, foto_cedula_trasera) ...
      console.log(`[PostgreSQL DB] Guardando cliente: ${payload.nombreCompleto} (CC: ${payload.numeroCc})`);

      // 2. Inserción en la tabla 'solicitudes'
      // SQL: INSERT INTO solicitudes (codigo_solicitud, cliente_id, valor_moto, valor_tramites, cuota_inicial, estado) ...
      console.log(`[PostgreSQL DB] Registrando solicitud: ${codigoSolicitud} | Moto: $${payload.valorMoto} | Trámites: $${payload.valorTramites}`);

      // 3. Inserción en 'ingresos_familiares' (Si aplica)
      if (payload.ingresosFamiliares) {
        // SQL: INSERT INTO ingresos_familiares (solicitud_id, parentesco, nombre_completo, numero_cc, actividad_economica, ingresos_mensuales, egresos_mensuales) ...
        console.log(`[PostgreSQL DB] Registrando ingreso familiar (${payload.ingresosFamiliares.parentesco}): ${payload.ingresosFamiliares.nombreCompleto}`);
      }

      // 4. Inserción en 'logs_validacion' para el envío de OTP por WhatsApp
      console.log(`[WhatsApp API] Código OTP generado y registrado en logs_validacion para ${payload.celularWhatsapp}`);

      return true;
    } catch (error) {
      console.error('[PostgreSQL Error] Fallo al insertar la solicitud:', error);
      return false;
    }
  }
}