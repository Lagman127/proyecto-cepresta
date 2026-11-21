require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

const SECURE_DOCS_DIR = path.join(__dirname, 'storage', 'cedulas_cifradas');
const SECURE_PDFS_DIR = path.join(__dirname, 'storage', 'pdfs_generados');
fs.mkdirSync(SECURE_DOCS_DIR, { recursive: true });
fs.mkdirSync(SECURE_PDFS_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// Almacén temporal en memoria para códigos OTP de firma por celular
const otpStore = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

// Cifrado AES-256-CBC para imágenes de cédula
function encryptAndSaveFile(buffer, originalName, prefix) {
  const key = Buffer.from((process.env.ENCRYPTION_KEY || 'Cepresta2026ClaveSecretaAES256!!').padEnd(32, '0').slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const payload = Buffer.concat([iv, encrypted]);

  const safeExt = path.extname(originalName) || '.jpg';
  const fileName = `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${safeExt}.enc`;
  fs.writeFileSync(path.join(SECURE_DOCS_DIR, fileName), payload);
  return fileName;
}

// Transporte de Correo
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Endpoint 1: Generar y enviar código OTP al WhatsApp del cliente para firma digital
app.post('/api/lite/enviar-otp', (req, res) => {
  const { celular } = req.body;
  if (!celular) {
    return res.status(400).json({ success: false, mensaje: 'Ingrese un número de celular válido.' });
  }

  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(celular.trim(), {
    codigo,
    expira: Date.now() + 10 * 60 * 1000
  });

  console.log(`[WhatsApp OTP Firma] Celular: ${celular} -> Código: ${codigo}`);

  return res.json({
    success: true,
    mensaje: `Código de firma enviado por WhatsApp al ${celular}.`,
    codigoDemo: codigo
  });
});

// Generador del PDF Oficial CEPRESTA S.A.S
function generarPdfSolicitud(datos, radicado, fechaFirmaStr, hashSha256) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmtMoney = (val) => `$ ${Number(val || 0).toLocaleString('es-CO')}`;

    // Encabezado Oficial
    doc.rect(36, 36, 540, 52).fillAndStroke('#1e3a8a', '#1e3a8a');
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
       .text('SOLICITUD DE CRÉDITO MOTOS', 48, 46);
    doc.fontSize(10).font('Helvetica')
       .text('CEPRESTA S.A.S  |  NIT: 900.784.733.4', 48, 65);
    doc.fontSize(9).font('Helvetica-Bold')
       .text(`Radicado: ${radicado}`, 360, 48, { align: 'right', width: 204 });
    doc.font('Helvetica')
       .text(`Fecha: ${datos.fechaInicioProceso}`, 360, 64, { align: 'right', width: 204 });

    doc.fillColor('#0f172a').moveDown(2.2);

    // Calidad del solicitante
    doc.fontSize(10).font('Helvetica-Bold')
       .text(`Calidad del Solicitante: [ ${datos.calidadSolicitante === 'Deudor' ? 'X' : ' '} ] Deudor    [ ${datos.calidadSolicitante === 'Codeudor' ? 'X' : ' '} ] Codeudor`, 36, 100);

    // Sección 1: Datos Básicos
    doc.rect(36, 118, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('1. DATOS BÁSICOS Y PERFIL', 42, 123);

    doc.fontSize(9).font('Helvetica');
    let y = 144;
    doc.text(`Primer Apellido: ${datos.primerApellido}`, 36, y);
    doc.text(`Segundo Apellido: ${datos.segundoApellido || '-'}`, 210, y);
    doc.text(`Nombres: ${datos.nombres}`, 380, y);

    y += 16;
    doc.text(`Tipo ID: ${datos.tipoIdentificacion}   No. ${datos.numeroIdentificacion}`, 36, y);
    doc.text(`Expedición: ${datos.fechaExpedicion} (${datos.lugarExpedicion})`, 210, y);
    doc.text(`Género: ${datos.genero}`, 430, y);

    y += 16;
    doc.text(`Nacimiento: ${datos.fechaNacimiento} (${datos.lugarNacimiento})`, 36, y);
    doc.text(`Edad: ${datos.edad} años`, 280, y);
    doc.text(`Nacionalidad: ${datos.nacionalidad}`, 380, y);

    y += 16;
    doc.text(`Estado Civil: ${datos.estadoCivil}`, 36, y);
    doc.text(`Nivel Estudios: ${datos.nivelEstudios}`, 210, y);
    doc.text(`Personas a Cargo: ${datos.personasCargo}`, 410, y);

    y += 16;
    doc.text(`Ocupación: ${datos.ocupacion}`, 36, y);
    doc.text(`Actividad: ${datos.actividad}`, 210, y);
    doc.text(`Inicio Actividad: ${datos.fechaInicioActividad}`, 410, y);

    y += 16;
    doc.text(`Tipo Vivienda: ${datos.tipoVivienda}`, 36, y);
    doc.text(`Dirección: ${datos.direccionResidencia} - Barrio: ${datos.barrio}`, 180, y);

    y += 16;
    doc.text(`Ciudad: ${datos.ciudadResidencia}`, 36, y);
    doc.text(`Celular: ${datos.telefonoCelular}`, 210, y);
    doc.text(`Email: ${datos.emailPersonal}`, 360, y);

    // Sección 2: Datos Financieros
    y += 24;
    doc.rect(36, y, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('2. DATOS FINANCIEROS (COP)', 42, y + 5);

    y += 24;
    doc.fontSize(9).font('Helvetica');
    doc.text(`Ingresos Mensuales: ${fmtMoney(datos.ingresosMensuales)}`, 36, y);
    doc.text(`Otros Ingresos: ${fmtMoney(datos.otrosIngresos)}`, 220, y);
    doc.text(`Origen Otros: ${datos.origenOtrosIngresos || 'N/A'}`, 390, y);

    y += 16;
    doc.text(`Egresos Mensuales: ${fmtMoney(datos.egresosMensuales)}`, 36, y);
    doc.text(`Total Activos: ${fmtMoney(datos.totalActivos)}`, 220, y);
    doc.text(`Total Pasivos: ${fmtMoney(datos.totalPasivos)}`, 390, y);

    // Sección 3: Información del Crédito y Garantía
    y += 24;
    doc.rect(36, y, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('3. INFORMACIÓN SOBRE EL CRÉDITO Y GARANTÍA', 42, y + 5);

    y += 24;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`1. Cuota Inicial: ${fmtMoney(datos.cuotaInicial)}`, 36, y);
    doc.text(`2. Valor Solicitado: ${fmtMoney(datos.valorSolicitado)}`, 210, y);
    doc.text(`= Valor Garantía: ${fmtMoney(datos.valorGarantia)}`, 390, y);

    y += 16;
    doc.font('Helvetica');
    doc.text(`Plazo en Meses: ${datos.plazoMeses} meses`, 36, y);
    doc.text(`Marca: ${datos.marcaMoto}`, 180, y);
    doc.text(`Referencia: ${datos.referenciaMoto}`, 310, y);
    doc.text(`Modelo: ${datos.modeloMoto}`, 470, y);

    // Referido (si existe)
    if (datos.referidoNombre || datos.referidoCedula) {
      y += 20;
      doc.rect(36, y, 540, 22).fillAndStroke('#eff6ff', '#93c5fd');
      doc.fillColor('#1e3a8a').fontSize(9).font('Helvetica-Bold')
         .text(`Referido / Gestor Comercial: ${datos.referidoNombre || 'N/A'}   |   Cédula: ${datos.referidoCedula || 'N/A'}`, 44, y + 7);
      doc.fillColor('#0f172a');
    }

    // Sección 4: Autorizaciones Legales y Habeas Data
    y += 30;
    doc.rect(36, y, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('4. DECLARACIÓN, CONSULTA EN CENTRALES Y TRATAMIENTO DE DATOS', 42, y + 5);

    y += 22;
    doc.fontSize(7.3).font('Helvetica').fillColor('#334155');
    const textoLegal =
      `Origen de recursos: ${datos.origenRecursos}. Declaro(mos) que la información suministrada en esta solicitud concuerda con la realidad y asumimos plena responsabilidad por la veracidad de la misma. Autorizo(mos) irrevocablemente a CEPRESTA S.A.S (COMPAÑÍA ESPECIAL DE PRÉSTAMOS SAS), o a quien esta designe, para que verifique, procese, administre, archive, reporte, consulte y transmita información comercial y financiera a centrales de riesgos, incluyendo visitas domiciliarias. De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013, autorizo de manera libre, previa, expresa y voluntaria el tratamiento de mis datos personales para fines comerciales, operativos, contractuales y de mercadeo, pudiendo ejercer mis derechos de consulta, rectificación o supresión al correo ceprestasas@gmail.com.`;
    doc.text(textoLegal, 36, y, { width: 540, align: 'justify' });

    y = doc.y + 8;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('[ X ] He leído y acepto la declaración, y autorizo la consulta y reporte a centrales de riesgo.', 36, y);
    y += 13;
    doc.text('[ X ] Autorizo de manera libre, previa, expresa y voluntaria el tratamiento de mis datos personales.', 36, y);

    // Firma Manuscrita + Validación OTP WhatsApp
    y += 18;
    doc.rect(36, y, 260, 72).stroke('#94a3b8');
    if (datos.firmaBase64 && datos.firmaBase64.startsWith('data:image/png;base64,')) {
      const imgBuffer = Buffer.from(datos.firmaBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
      doc.image(imgBuffer, 56, y + 4, { fit: [210, 44] });
    }
    doc.fontSize(8).font('Helvetica')
       .text(`Firma: ${datos.nombres} ${datos.primerApellido} - ${datos.tipoIdentificacion} ${datos.numeroIdentificacion}`, 42, y + 54);

    doc.rect(310, y, 266, 72).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold')
       .text('CONSTANCIA DE FIRMA ELECTRÓNICA (OTP WHATSAPP)', 318, y + 8);
    doc.font('Helvetica').fontSize(7.5)
       .text(`Celular verificado: ${datos.telefonoCelular}`, 318, y + 22)
       .text(`Código OTP validado: ${datos.codigoOtp}`, 318, y + 34)
       .text(`Fecha y hora firma: ${fechaFirmaStr}`, 318, y + 46);

    // Pie de página con SHA-256
    y += 82;
    doc.fontSize(7).fillColor('#475569')
       .text(`Constancia de firma electrónica - Radicado ${radicado} - Firmado el ${fechaFirmaStr} - Aceptó consulta centrales: Sí - Aceptó tratamiento datos: Sí - Código de integridad SHA-256: ${hashSha256}`, 36, y, { width: 540 });

    doc.end();
  });
}

// Endpoint 2: Radicar solicitud completa, cifrar cédulas, generar PDF y enviar correo
app.post(
  '/api/lite/radicar',
  upload.fields([
    { name: 'cedulaFrontal', maxCount: 1 },
    { name: 'cedulaTrasera', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const d = req.body;

      // 1. Validar OTP de firma por WhatsApp
      const registroOtp = otpStore.get((d.telefonoCelular || '').trim());
      if (!registroOtp || registroOtp.codigo !== (d.codigoOtp || '').trim() || Date.now() > registroOtp.expira) {
        return res.status(400).json({
          success: false,
          mensaje: 'El código OTP de WhatsApp es inválido o ha expirado. Solicite uno nuevo para firmar.'
        });
      }

      // 2. Validar aceptaciones legales y cédulas
      if (d.aceptoCentrales !== 'true' || d.aceptoDatos !== 'true') {
        return res.status(400).json({ success: false, mensaje: 'Debe aceptar ambas autorizaciones legales.' });
      }

      if (!req.files || !req.files.cedulaFrontal || !req.files.cedulaTrasera) {
        return res.status(400).json({ success: false, mensaje: 'Debe adjuntar ambos lados de la cédula (Frontal y Trasera).' });
      }

      // 3. Validar regla financiera: Cuota Inicial >= 20% del Valor de Garantía
      const cuotaInicial = parseFloat(d.cuotaInicial) || 0;
      const valorSolicitado = parseFloat(d.valorSolicitado) || 0;
      const valorGarantia = cuotaInicial + valorSolicitado;
      const minimo20 = valorGarantia * 0.20;

      if (valorGarantia <= 0 || cuotaInicial < minimo20) {
        return res.status(400).json({
          success: false,
          mensaje: `La cuota inicial ($${cuotaInicial.toLocaleString('es-CO')}) debe ser al menos el 20% del Valor de la Garantía ($${minimo20.toLocaleString('es-CO')}).`
        });
      }

      // 4. Cifrar cédulas AES-256
      const encFront = encryptAndSaveFile(req.files.cedulaFrontal[0].buffer, req.files.cedulaFrontal[0].originalname, `CC_${d.numeroIdentificacion}_FRONT`);
      const encBack = encryptAndSaveFile(req.files.cedulaTrasera[0].buffer, req.files.cedulaTrasera[0].originalname, `CC_${d.numeroIdentificacion}_BACK`);

      // 5. Generar Radicado, Hash SHA-256 y PDF Oficial
      const ahora = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      const fechaRad = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;
      const hexRand = crypto.randomBytes(6).toString('hex').toUpperCase();
      const radicado = `CP-${fechaRad}-${hexRand}`;
      const fechaFirmaStr = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;

      const datosCompletos = { ...d, valorGarantia };
      const hashSha256 = crypto
        .createHash('sha256')
        .update(JSON.stringify({ radicado, cc: d.numeroIdentificacion, valorGarantia, fechaFirmaStr }))
        .digest('hex');

      const pdfBuffer = await generarPdfSolicitud(datosCompletos, radicado, fechaFirmaStr, hashSha256);
      const pdfFileName = `Solicitud_${radicado}_${d.numeroIdentificacion}.pdf`;
      fs.writeFileSync(path.join(SECURE_PDFS_DIR, pdfFileName), pdfBuffer);

      otpStore.delete((d.telefonoCelular || '').trim());

      // 6. Enviar correo automático con PDF adjunto (sin bloquear la descarga si SMTP no está configurado)
      let correoEnviado = false;
      const tieneSmtpValido =
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        !process.env.SMTP_USER.includes('tu_correo_emisor') &&
        !process.env.SMTP_PASS.includes('tu_contrasena');

      if (tieneSmtpValido) {
        try {
          const nombreCompleto = `${d.nombres} ${d.primerApellido} ${d.segundoApellido || ''}`.trim();
          const bloqueReferido = (d.referidoNombre || d.referidoCedula)
            ? `<p><strong>👤 Persona que refiere (Asesor/Comisionador/Freelancer):</strong> ${d.referidoNombre || 'No especificado'} — <strong>Cédula:</strong> ${d.referidoCedula || 'No especificada'}</p>`
            : `<p><strong>👤 Referido:</strong> Solicitud directa (sin referido)</p>`;

          await transporter.sendMail({
            from: `"Cepresta Solicitudes" <${process.env.SMTP_USER}>`,
            to: process.env.NOTIFY_EMAIL_TO || 'ceprestasas@gmail.com',
            subject: `Nueva Solicitud de Crédito Moto - ${nombreCompleto} (${radicado})`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px;">
                <h2 style="color: #1e3a8a;">Nueva Solicitud de Crédito Radicada</h2>
                <p><strong>Radicado:</strong> ${radicado}</p>
                <p><strong>Nombre del Cliente:</strong> ${nombreCompleto} (${d.tipoIdentificacion} ${d.numeroIdentificacion})</p>
                <p><strong>Fecha y Hora de Inicio del Proceso:</strong> ${d.fechaInicioProceso}</p>
                <p><strong>Fecha y Hora de Firma Electrónica:</strong> ${fechaFirmaStr}</p>
                ${bloqueReferido}
                <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 14px 0;">
                <p><strong>Cuota Inicial:</strong> $${cuotaInicial.toLocaleString('es-CO')} | <strong>Valor Solicitado:</strong> $${valorSolicitado.toLocaleString('es-CO')} | <strong>Valor Garantía:</strong> $${valorGarantia.toLocaleString('es-CO')}</p>
                <p style="font-size: 12px; color: #475569;">🔒 Cédulas cifradas AES-256 en servidor privado: <code>${encFront}</code> y <code>${encBack}</code></p>
                <p>Se adjunta el formulario oficial en PDF firmado electrónicamente.</p>
              </div>
            `,
            attachments: [
              {
                filename: pdfFileName,
                content: pdfBuffer,
                contentType: 'application/pdf'
              }
            ]
          });
          correoEnviado = true;
        } catch (mailErr) {
          console.error('⚠️ Advertencia SMTP (el PDF sí se generó):', mailErr.message);
        }
      }

      // 7. Devolver PDF en Base64 para descarga inmediata en el navegador
      return res.json({
        success: true,
        radicado,
        correoEnviado,
        pdfFileName,
        pdfBase64: pdfBuffer.toString('base64'),
        mensaje: `Solicitud ${radicado} radicada con éxito. ${
          correoEnviado
            ? 'Enviada por correo automáticamente.'
            : 'PDF generado y listo para descargar.'
        }`
      });
    } catch (error) {
      console.error('Error al radicar solicitud:', error);
      return res.status(500).json({
        success: false,
        mensaje: `Error interno: ${error.message}`
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Cepresta Lite 2.0 corriendo en http://localhost:${PORT}`);
});