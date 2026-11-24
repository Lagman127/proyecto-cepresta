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

//const transporter = nodemailer.createTransport({
  //host: process.env.SMTP_HOST || 'smtp.gmail.com',
  //port: Number(process.env.SMTP_PORT) || 587,
  //secure: false, // Puerto 587 con STARTTLS (funciona sin bloqueos en Render)
  //requireTLS: true,
  //connectionTimeout: 8000, // Máximo 8 segundos para conectar
  //greetingTimeout: 8000,
  //socketTimeout: 10000,
  //auth: {
    //user: process.env.SMTP_USER,
    //pass: process.env.SMTP_PASS
  //}
//});

// Endpoint 1: Generar y enviar código OTP por WhatsApp para firma digital
// Endpoint 1: Generar y enviar código OTP por WhatsApp (Demo o Meta Cloud API)
app.post('/api/lite/enviar-otp', async (req, res) => {
  const { celular } = req.body;
  if (!celular || celular.trim().length < 7) {
    return res.status(400).json({ ok: false, error: 'Número de celular inválido.' });
  }

  // Normalizar número a formato internacional Colombia (57 + 10 dígitos)
  const digits = celular.replace(/\D/g, '');
  const telefonoE164 = digits.startsWith('57') ? digits : `57${digits}`;

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(celular.trim(), {
    codigo,
    expira: Date.now() + 10 * 60 * 1000 // 10 minutos
  });

  const mode = process.env.WHATSAPP_MODE || 'demo';

  if (mode === 'meta') {
    const token = process.env.META_WA_TOKEN;
    const phoneId = process.env.META_WA_PHONE_ID;

    if (!token || !phoneId) {
      return res.status(500).json({ ok: false, error: 'Faltan credenciales META_WA_TOKEN o META_WA_PHONE_ID en el servidor.' });
    }

    try {
      const templateName = process.env.META_WA_TEMPLATE || 'hello_world';
      const payload = templateName === 'hello_world'
        ? {
            messaging_product: 'whatsapp',
            to: telefonoE164,
            type: 'template',
            template: { name: 'hello_world', language: { code: 'en_US' } }
          }
        : {
            messaging_product: 'whatsapp',
            to: telefonoE164,
            type: 'template',
            template: {
              name: templateName,
              language: { code: 'es_CO' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: codigo }] },
                { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] }
              ]
            }
          };

      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        console.error('⚠️ Error Meta WhatsApp API:', metaData);
        return res.status(502).json({
          ok: false,
          error: metaData.error?.message || 'Error al enviar mensaje por Meta WhatsApp API.'
        });
      }

      console.log(`✅ WhatsApp enviado vía Meta a ${telefonoE164} | OTP: ${codigo}`);
      return res.json({
        ok: true,
        modo: 'meta',
        mensaje: `Código de verificación enviado por WhatsApp al ${celular}.`,
        ...(templateName === 'hello_world' ? { codigoDemo: codigo } : {})
      });
    } catch (err) {
      console.error('⚠️ Error conexión Meta API:', err.message);
      return res.status(500).json({ ok: false, error: 'No se pudo conectar con Meta WhatsApp API.' });
    }
  }

  // Modo demo
  console.log(`[WHATSAPP DEMO] Código OTP para ${celular}: ${codigo}`);
  return res.json({
    ok: true,
    modo: 'demo',
    mensaje: `Código de firma enviado por WhatsApp al ${celular}.`,
    codigoDemo: codigo
  });
});

// Generador del PDF Oficial CEPRESTA S.A.S (2 Páginas exactas, sin referido, con textos legales completos y recuadro Comité)
function generarPdfSolicitud(datos, radicado, fechaFirmaStr, hashSha256) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmtMoney = (val) => `$ ${Number(val || 0).toLocaleString('es-CO')}`;
    const origenMayus = (datos.origenRecursos || datos.actividad || 'NO ESPECIFICADO').toUpperCase();
    const tipoDocFinal = datos.tipoIdentificacion === 'Otro'
      ? (datos.otroTipoIdentificacion || 'Otro').toUpperCase()
      : datos.tipoIdentificacion;

    // ==================== PÁGINA 1: DATOS DEL SOLICITANTE Y CRÉDITO ====================
    doc.rect(36, 36, 540, 50).fillAndStroke('#1e3a8a', '#1e3a8a');
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
       .text('SOLICITUD DE CRÉDITO MOTOS', 48, 45);
    doc.fontSize(10).font('Helvetica')
       .text('CEPRESTA S.A.S  |  NIT: 900.784.733.4', 48, 63);
    doc.fontSize(9).font('Helvetica-Bold')
       .text(`Radicado: ${radicado}`, 350, 47, { align: 'right', width: 214 });
    doc.font('Helvetica')
       .text(`Fecha: ${datos.fechaInicioProceso}`, 350, 63, { align: 'right', width: 214 });

    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold')
       .text(`Calidad del Solicitante:   [ ${datos.calidadSolicitante === 'Deudor' ? 'X' : ' '} ] Deudor      [ ${datos.calidadSolicitante === 'Codeudor' ? 'X' : ' '} ] Codeudor`, 36, 98);

    // 1. DATOS BÁSICOS
    doc.rect(36, 116, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('1. DATOS BÁSICOS Y PERFIL', 42, 121);

    doc.fontSize(9).font('Helvetica');
    let y = 144;
    doc.text(`Primer Apellido: ${datos.primerApellido}`, 36, y);
    doc.text(`Segundo Apellido: ${datos.segundoApellido || '-'}`, 215, y);
    doc.text(`Nombres: ${datos.nombres}`, 385, y);

    y += 18;
    doc.text(`Tipo ID: ${tipoDocFinal}   No. ${datos.numeroIdentificacion}`, 36, y);
    doc.text(`Expedición: ${datos.fechaExpedicion} (${datos.lugarExpedicion})`, 215, y);
    doc.text(`Género: ${datos.genero}`, 440, y);

    y += 18;
    doc.text(`Nacimiento: ${datos.fechaNacimiento} (${datos.lugarNacimiento})`, 36, y);
    doc.text(`Edad: ${datos.edad} años`, 285, y);
    doc.text(`Nacionalidad: ${datos.nacionalidad}`, 385, y);

    y += 18;
    doc.text(`Estado Civil: ${datos.estadoCivil}`, 36, y);
    doc.text(`Nivel Estudios: ${datos.nivelEstudios}`, 215, y);
    doc.text(`Personas a Cargo: ${datos.personasCargo}`, 420, y);

    y += 18;
    doc.text(`Ocupación: ${datos.ocupacion}`, 36, y);
    doc.text(`Actividad: ${datos.actividad}`, 215, y);
    doc.text(`Inicio Actividad: ${datos.fechaInicioActividad}`, 420, y);

    y += 18;
    doc.text(`Tipo Vivienda: ${datos.tipoVivienda}`, 36, y);
    doc.text(`Dirección: ${datos.direccionResidencia} - Barrio: ${datos.barrio}`, 185, y);

    y += 18;
    doc.text(`Ciudad: ${datos.ciudadResidencia}`, 36, y);
    doc.text(`Celular: ${datos.telefonoCelular}`, 215, y);
    doc.text(`Email: ${datos.emailPersonal}`, 365, y);

    // 2. DATOS FINANCIEROS
    y += 30;
    doc.rect(36, y, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('2. DATOS FINANCIEROS (COP)', 42, y + 5);

    y += 26;
    doc.fontSize(9).font('Helvetica');
    doc.text(`Ingresos Mensuales: ${fmtMoney(datos.ingresosMensuales)}`, 36, y);
    doc.text(`Otros Ingresos: ${fmtMoney(datos.otrosIngresos)}`, 225, y);
    doc.text(`Origen Otros: ${datos.origenOtrosIngresos || 'N/A'}`, 395, y);

    y += 18;
    doc.text(`Egresos Mensuales: ${fmtMoney(datos.egresosMensuales)}`, 36, y);
    doc.text(`Total Activos (Bienes): ${fmtMoney(datos.totalActivos)}`, 225, y);
    doc.text(`Total Pasivos (Deudas): ${fmtMoney(datos.totalPasivos)}`, 395, y);

    // 3. INFORMACIÓN SOBRE EL CRÉDITO
    y += 30;
    doc.rect(36, y, 540, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('3. INFORMACIÓN SOBRE EL CRÉDITO Y MOTOCICLETA', 42, y + 5);

    y += 26;
    doc.fontSize(9.5).font('Helvetica-Bold');
    doc.text(`1. Cuota Inicial: ${fmtMoney(datos.cuotaInicial)}`, 36, y);
    doc.text(`2. Valor Solicitado: ${fmtMoney(datos.valorSolicitado)}`, 215, y);
    doc.text(`= Valor de la Garantía: ${fmtMoney(datos.valorGarantia)}`, 390, y);

    y += 20;
    doc.fontSize(9).font('Helvetica');
    doc.text(`Plazo en Meses: ${datos.plazoMeses} meses`, 36, y);
    doc.text(`Marca: ${datos.marcaMoto}`, 185, y);
    doc.text(`Referencia: ${datos.referenciaMoto}`, 315, y);
    doc.text(`Modelo: ${datos.modeloMoto}`, 475, y);

    doc.fontSize(8).fillColor('#64748b').text('Páginas: 1/2', 36, 735, { align: 'right', width: 540 });

    // ==================== PÁGINA 2: AUTORIZACIÓN COMPLETA, FIRMA Y USO EXCLUSIVO ====================
    doc.addPage({ size: 'LETTER', margin: 36 });

    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold')
       .text('CEPRESTA S.A.S  |  NIT: 900.784.733.4', 36, 36);
    doc.fontSize(8.5).font('Helvetica').fillColor('#475569')
       .text(`Radicado: ${radicado}`, 360, 36, { align: 'right', width: 216 });

    doc.moveTo(36, 52).lineTo(576, 52).stroke('#cbd5e1');

    // Título AUTORIZACIÓN
    doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
       .text('AUTORIZACIÓN', 36, 62, { align: 'center', width: 540 });

    // Párrafo 1: Declaración y autorización de consulta con origen de recursos subrayado
    doc.fontSize(7.8).font('Helvetica').fillColor('#1e293b');
    doc.text(
      'Declaro(mos) que la información suministrada en esta solicitud concuerda con la realidad y asumimos plena responsabilidad por la veracidad de la misma y certifico(mos) que mis (nuestros) recursos provienen de ',
      36, 82, { continued: true, width: 540, align: 'justify' }
    );
    doc.font('Helvetica-Bold').fillColor('#1e3a8a')
       .text(`  ${origenMayus}  `, { continued: true, underline: true });
    doc.font('Helvetica').fillColor('#1e293b')
       .text(
         ' y en ningún caso provienen de actividades ilícitas. Autorizo(mos) irrevocablemente a CEPRESTA SAS, o a quien esta designe, para que verifique, procese, administre, archive, reporte, consulte y transmita información comercial y financiera que sobre el (los) suscrito(s), reciba, recolecte, o consulte a tercero(s) y/o centrales de riesgos. Lo anterior incluye visitas domiciliarias u otros medios de verificación. Hago (hacemos) constar que he (hemos) sido informado(s) del derecho a consultar mis (nuestros) datos personales y actualizarlos, rectificarlos, revocarlos y suprimirlos de conformidad con el Decreto 1377 de 2013, mediante solicitud dirigida al área de Operaciones de CEPRESTA SAS, al correo electrónico ceprestasas@gmail.com.',
         { align: 'justify' }
       );

    // Párrafo 2: Autorización de tratamiento de datos personales COMPLETO (1 a 5 y finalidades i a v)
    doc.moveDown(0.7);
    doc.fontSize(7.8).font('Helvetica').fillColor('#1e293b').text(
      'Declaro con la firma del presente documento lo siguiente: 1. Que me ha sido informado, conozco y acepto la Política de Tratamiento de Información y Datos Personales de COMPAÑÍA ESPECIAL DE PRÉSTAMOS SAS. 2. Que conozco el procedimiento y trámite para realizar de manera respetuosa cualquier tipo de consulta, queja y/o reclamo relacionado con el tratamiento de mis datos personales que presenté como titular de los mismos. 3. Que COMPAÑÍA ESPECIAL DE PRÉSTAMOS SAS es el responsable del tratamiento de los datos personales de los cuales soy titular y que por ende, podrá recolectar, transferir, almacenar, usar, circular, suprimir, compartir, actualizar y transmitir mis datos personales para el cumplimiento de los propósitos de la Firma consignados en su Política de Tratamiento de Datos Personales. 4. Que conozco mis derechos como titular de los datos personales previstos en la Constitución, la Ley y la Política de Tratamiento de la Información y Datos Personales de la Firma, especialmente el derecho a conocer, actualizar, rectificar y suprimir mi información personal, así como el derecho a revocar el consentimiento otorgado para el tratamiento de datos personales en cualquier momento. De igual forma, a solicitar información sobre el uso que se le ha dado a mis datos personales, y a presentar quejas cuando a ello haya lugar ante la Superintendencia de Industria y Comercio por el uso indebido de estos mismos. 5. Que, una vez otorgada la presente autorización, COMPAÑÍA ESPECIAL DE PRÉSTAMOS SAS estará facultada para enviarme información de contenido institucional o promocional que tenga que ver con los servicios prestados por la Firma, y demás información relativa al portafolio de servicios de ésta, a través de los medios idóneos facultados para ello. Conforme lo anterior, de manera libre, previa, expresa y voluntaria AUTORIZO a COMPAÑÍA ESPECIAL DE PRÉSTAMOS SAS para continuar con el tratamiento de los Datos Personales de los cuales soy titular, para las finalidades (i) a (v) descritas en el formato de solicitud: (i) Facilitar los fines comerciales, corporativos, laborales, tributarios y contables de la Firma, (ii) Realizar los fines de mercadeo y publicidad con el propósito de ofrecer nuevos servicios de la Firma, lo que incluye el mantenimiento, actualización y custodia de la base de datos de clientes, empleados, ex empleados, contratistas de la empresa. (iii) Cumplir con los procesos administrativos internos para el manejo de contratistas y proveedores, y demás fines operativos de LA EMPRESA. (iv) Cumplir con la prestación de los servicios contratados por los clientes de LA EMPRESA enmarcados en el objeto social y de acuerdo con las solicitudes y necesidades de los clientes. (v) Cumplir con las demás finalidades que permitan el desarrollo de las actividades, funciones y operaciones comprendidas dentro del objeto social de LA EMPRESA y las otorgadas por la Ley.',
      36, doc.y, { width: 540, align: 'justify' }
    );

    // Casillas de aceptación
    let y2 = doc.y + 12;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('[ X ] He leído y acepto la declaración, y autorizo la consulta y reporte a centrales de riesgo.', 36, y2);
    y2 += 14;
    doc.text('[ X ] Autorizo de manera libre, previa, expresa y voluntaria el tratamiento de mis datos personales.', 36, y2);

    // Firma Manuscrita + Constancia OTP WhatsApp
    y2 += 20;
    doc.rect(36, y2, 262, 82).stroke('#94a3b8');
    if (datos.firmaBase64 && datos.firmaBase64.startsWith('data:image/png;base64,')) {
      const imgBuffer = Buffer.from(datos.firmaBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
      doc.image(imgBuffer, 56, y2 + 4, { fit: [215, 48] });
    }
    doc.fontSize(8).font('Helvetica').fillColor('#0f172a')
       .text(`Firma: ${datos.nombres} ${datos.primerApellido}`, 42, y2 + 56)
       .text(`No. de documento de identidad: ${datos.tipoIdentificacion} ${datos.numeroIdentificacion} de ${datos.lugarExpedicion}`, 42, y2 + 67);

    doc.rect(310, y2, 266, 82).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold')
       .text('CONSTANCIA DE FIRMA ELECTRÓNICA (OTP WHATSAPP)', 318, y2 + 10);
    doc.font('Helvetica').fontSize(7.8)
       .text(`Celular verificado: ${datos.telefonoCelular}`, 318, y2 + 26)
       .text(`Código OTP validado: ${datos.codigoOtp}`, 318, y2 + 40)
       .text(`Fecha y hora firma: ${fechaFirmaStr}`, 318, y2 + 54);

    // Recuadro Oficial: PARA USO EXCLUSIVO DE CEPRESTA SAS (3 columnas en blanco para comité)
    y2 += 96;
    doc.rect(36, y2, 540, 20).fillAndStroke('#e2e8f0', '#64748b');
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold')
       .text('PARA USO EXCLUSIVO DE CEPRESTA SAS', 36, y2 + 6, { align: 'center', width: 540 });

    const yTabla = y2 + 20;
    const altoTabla = 46;
    // Borde exterior y divisiones de 3 columnas
    doc.rect(36, yTabla, 540, altoTabla).stroke('#64748b');
    doc.moveTo(190, yTabla).lineTo(190, yTabla + altoTabla).stroke('#64748b');
    doc.moveTo(395, yTabla).lineTo(395, yTabla + altoTabla).stroke('#64748b');

    // Columna 1: Documentación Completa
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a')
       .text('Documentación Completa:', 44, yTabla + 8)
       .text('Sí ____    No ____', 44, yTabla + 24);

    // Columna 2: Comité de Crédito
    doc.text('Comité de Crédito:', 198, yTabla + 8);

    // Columna 3: Aprobado Sí [ ] No [ ] Archivo [ ]
    doc.text('Aprobado', 404, yTabla + 8);
    doc.font('Helvetica').text('Sí', 404, yTabla + 24);
    doc.rect(418, yTabla + 23, 10, 10).stroke('#0f172a');

    doc.text('No', 444, yTabla + 24);
    doc.rect(460, yTabla + 23, 10, 10).stroke('#0f172a');

    doc.text('Archivo', 486, yTabla + 24);
    doc.rect(522, yTabla + 23, 10, 10).stroke('#0f172a');

    // Pie de página con SHA-256
    const yPie = yTabla + altoTabla + 12;
    doc.fontSize(7).fillColor('#475569')
       .text(`Constancia de firma electrónica - Radicado ${radicado} Firmado el ${fechaFirmaStr} - Aceptó declaración y consulta en centrales: Sí - Aceptó tratamiento de datos: Sí - Código de integridad SHA-256: ${hashSha256}`, 36, yPie, { width: 540 });

    doc.fontSize(8).fillColor('#64748b').text('Páginas: 2/2', 36, 735, { align: 'right', width: 540 });

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

      // 6. Enviar correo automático via API HTTPS (Resend - puerto 443 compatible con Render)
      let correoEnviado = false;
      const resendApiKey = process.env.RESEND_API_KEY;

      if (resendApiKey) {
        try {
          const nombreCompleto = `${d.nombres} ${d.primerApellido} ${d.segundoApellido || ''}`.trim();
          const tipoDocFinal = d.tipoIdentificacion === 'Otro'
            ? (d.otroTipoIdentificacion || 'Otro').toUpperCase()
            : d.tipoIdentificacion;

          const bloqueReferido = (d.referidoNombre || d.referidoCedula)
            ? `<div style="background: #eff6ff; border-left: 4px solid #1e3a8a; padding: 10px 14px; margin-top: 14px;">
                <strong>🤝 Referido por (Asesor / Comisionador / Freelancer):</strong><br>
                Nombre: ${d.referidoNombre || 'No especificado'}<br>
                Cédula: ${d.referidoCedula || 'No especificada'}
               </div>`
            : `<p style="margin-top: 14px; color: #64748b;"><strong>🤝 Referido por:</strong> Solicitud directa (sin referido)</p>`;

          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Cepresta Solicitudes <onboarding@resend.dev>',
              to: [process.env.NOTIFY_EMAIL_TO || 'dalejandrocla@gmail.com'],
              subject: `Nueva Solicitud de Crédito Moto - ${nombreCompleto} (${radicado})`,
              html: `
                <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 620px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px;">
                  <h2 style="color: #1e3a8a; margin-top: 0;">Nueva Solicitud de Crédito Radicada</h2>
                  <p><strong>Radicado:</strong> ${radicado}</p>
                  <p><strong>Nombre del Cliente:</strong> ${nombreCompleto} (${tipoDocFinal} ${d.numeroIdentificacion})</p>
                  <p><strong>Fecha y Hora de Inicio del Proceso:</strong> ${d.fechaInicioProceso}</p>
                  <p><strong>Cuota Inicial:</strong> $${cuotaInicial.toLocaleString('es-CO')} | <strong>Valor Solicitado:</strong> $${valorSolicitado.toLocaleString('es-CO')} | <strong>Valor Garantía:</strong> $${valorGarantia.toLocaleString('es-CO')}</p>
                  <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 14px 0;">
                  <p style="font-size: 12px; color: #334155;">
                    <strong>Constancia de firma electrónica:</strong> Firmado el ${fechaFirmaStr} mediante OTP WhatsApp (${d.telefonoCelular})<br>
                    <strong>Código de integridad SHA-256:</strong> <code>${hashSha256}</code>
                  </p>
                  ${bloqueReferido}
                  <p style="font-size: 12px; color: #475569; margin-top: 14px;">🔒 Cédulas cifradas AES-256 en servidor privado: <code>${encFront}</code> y <code>${encBack}</code></p>
                  <p>Se adjunta el formato oficial de solicitud en PDF.</p>
                </div>
              `,
              attachments: [
                {
                  filename: pdfFileName,
                  content: pdfBuffer.toString('base64')
                }
              ]
            })
          });

          const emailData = await emailRes.json();
          if (emailRes.ok) {
            correoEnviado = true;
            console.log('✅ Correo enviado vía Resend ID:', emailData.id);
          } else {
            console.error('⚠️ Error Resend API:', emailData);
          }
        } catch (mailErr) {
          console.error('⚠️ Error enviando correo:', mailErr.message);
        }
      }

      return res.json({
        success: true,
        radicado,
        correoEnviado,
        pdfFileName,
        pdfBase64: pdfBuffer.toString('base64'),
        mensaje: `Solicitud ${radicado} radicada con éxito. ${
          correoEnviado
            ? 'Enviada por correo automáticamente.'
            : 'PDF oficial generado y listo para descargar.'
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