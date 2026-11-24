document.addEventListener('DOMContentLoaded', () => {
  const inicio = new Date();
  const fechaInicioProceso = inicio.toLocaleString('es-CO');

  // Banner elegante integrado en la página (sin popups alert del navegador)
  const pageBanner = document.getElementById('pageBanner');
  function mostrarMensajePagina(texto, tipo = 'error') {
    pageBanner.className = `page-banner ${tipo}`;
    pageBanner.innerText = texto;
    pageBanner.style.display = 'block';
    pageBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function ocultarMensajePagina() {
    pageBanner.style.display = 'none';
  }

  // Navegación Wizard
  const panels = document.querySelectorAll('.step-panel');
  const pills = document.querySelectorAll('.step-pill');

  function goToStep(stepNum) {
    panels.forEach(p => p.classList.remove('active'));
    pills.forEach(b => b.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');
    document.querySelector(`.step-pill[data-step="${stepNum}"]`).classList.add('active');
  }

  document.querySelectorAll('.next-step').forEach(btn => {
    btn.addEventListener('click', () => {
      ocultarMensajePagina();
      goToStep(btn.dataset.next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  document.querySelectorAll('.prev-step').forEach(btn => {
    btn.addEventListener('click', () => {
      ocultarMensajePagina();
      goToStep(btn.dataset.prev);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      ocultarMensajePagina();
      goToStep(pill.dataset.step);
    });
  });

  // Tipo de Identificación: C.C., C.E. y Otro (con campo desplegable)
  const radiosTipoId = document.querySelectorAll('input[name="tipoIdentificacion"]');
  const otroTipoIdGroup = document.getElementById('otroTipoIdGroup');
  const otroTipoInput = document.getElementById('otroTipoIdentificacion');

  radiosTipoId.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'Otro' && radio.checked) {
        otroTipoIdGroup.style.display = 'block';
        otroTipoInput.setAttribute('required', 'true');
        otroTipoInput.focus();
      } else if (radio.checked) {
        otroTipoIdGroup.style.display = 'none';
        otroTipoInput.removeAttribute('required');
        otroTipoInput.value = '';
        otroTipoInput.classList.remove('field-invalid');
      }
    });
  });

  // Auto-relleno de Origen de Recursos desde el campo Actividad (en MAYÚSCULAS)
  const actividadInput = document.getElementById('actividad');
  const origenInput = document.getElementById('origenRecursos');
  const spanOrigen = document.getElementById('spanOrigenRecursos');
  let origenEditadoManual = false;

  function sincronizarTextoOrigen() {
    const val = origenInput.value.trim().toUpperCase();
    spanOrigen.innerText = val || '________________________';
  }

  actividadInput.addEventListener('input', () => {
    if (!origenEditadoManual) {
      origenInput.value = actividadInput.value.toUpperCase();
      sincronizarTextoOrigen();
    }
  });

  origenInput.addEventListener('input', () => {
    origenEditadoManual = true;
    origenInput.value = origenInput.value.toUpperCase();
    sincronizarTextoOrigen();
  });

  // Cálculo automático de Edad desde Fecha de Nacimiento
  const fechaNacInput = document.getElementById('fechaNacimiento');
  const edadInput = document.getElementById('edad');
  fechaNacInput.addEventListener('change', () => {
    const nac = new Date(fechaNacInput.value);
    if (!isNaN(nac)) {
      const diff = Date.now() - nac.getTime();
      const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      edadInput.value = age > 0 ? age : 0;
    }
  });

  // Carga de Cédula Frontal y Trasera (Soporta Cámara Directa y Galería en Celular)
  function configurarFotoDocumento(btnCamId, btnGalId, camInputId, mainInputId, previewId, txtId, boxId) {
    const btnCam = document.getElementById(btnCamId);
    const btnGal = document.getElementById(btnGalId);
    const camInput = document.getElementById(camInputId);
    const mainInput = document.getElementById(mainInputId);
    const preview = document.getElementById(previewId);
    const txt = document.getElementById(txtId);
    const box = document.getElementById(boxId);

    btnCam.addEventListener('click', (e) => {
      e.stopPropagation();
      camInput.click();
    });

    btnGal.addEventListener('click', (e) => {
      e.stopPropagation();
      mainInput.click();
    });

    function mostrarPreview(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        preview.src = ev.target.result;
        preview.style.display = 'block';
        txt.innerText = 'Cargada y lista para cifrar ✓';
        box.classList.remove('field-invalid');
        ocultarMensajePagina();
      };
      reader.readAsDataURL(file);
    }

    // Cuando toma foto con cámara directa, transferimos el archivo al input principal del FormData
    camInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      mainInput.files = dt.files;
      mostrarPreview(file);
    });

    mainInput.addEventListener('change', (e) => {
      mostrarPreview(e.target.files[0]);
    });
  }

  configurarFotoDocumento('btnCamFront', 'btnGalFront', 'camFront', 'cedulaFrontal', 'previewFront', 'txtFront', 'boxFront');
  configurarFotoDocumento('btnCamBack', 'btnGalBack', 'camBack', 'cedulaTrasera', 'previewBack', 'txtBack', 'boxBack');

  // Cálculo: 1. Cuota Inicial + 2. Valor Solicitado = Valor de la Garantía (y regla >= 20%)
  const cuotaInput = document.getElementById('cuotaInicial');
  const solicitadoInput = document.getElementById('valorSolicitado');
  const garantiaInput = document.getElementById('valorGarantia');
  const warnCuota = document.getElementById('warnCuota');
  const lblMinCuota = document.getElementById('lblMinCuota');
  const btnSubmit = document.getElementById('btnSubmit');

  function actualizarGarantia() {
    const cuota = parseFloat(cuotaInput.value) || 0;
    const solicitado = parseFloat(solicitadoInput.value) || 0;
    const garantia = cuota + solicitado;
    const minimo20 = garantia * 0.20;

    garantiaInput.value = garantia;
    lblMinCuota.innerText = minimo20.toLocaleString('es-CO');

    if (cuota < minimo20) {
      warnCuota.style.display = 'block';
      btnSubmit.disabled = true;
    } else {
      warnCuota.style.display = 'none';
      btnSubmit.disabled = false;
    }
  }
  cuotaInput.addEventListener('input', actualizarGarantia);
  solicitadoInput.addEventListener('input', actualizarGarantia);
  actualizarGarantia();

  // Toggle bloque opcional de Referido
  const toggleReferido = document.getElementById('toggleReferido');
  const referidoFields = document.getElementById('referidoFields');
  toggleReferido.addEventListener('change', () => {
    referidoFields.style.display = toggleReferido.checked ? 'block' : 'none';
  });

  // Canvas Firma Manuscrita
  const canvas = document.getElementById('signaturePad');
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#1e3a8a';
  let drawing = false;
  let hasSigned = false;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => { drawing = true; hasSigned = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove', (e) => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup', () => { drawing = false; });

  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; hasSigned = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('touchend', () => { drawing = false; });

  document.getElementById('btnClearSign').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSigned = false;
  });

  // Limpiar borde rojo al escribir en un campo
  document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('field-invalid'));
    el.addEventListener('change', () => el.classList.remove('field-invalid'));
  });

  // Enviar código OTP por WhatsApp
  document.getElementById('btnSendOtp').addEventListener('click', async () => {
    const celularInput = document.getElementById('telefonoCelular');
    const celular = celularInput.value.trim();
    const feedback = document.getElementById('otpFeedback');

    if (!celular) {
      goToStep(1);
      celularInput.classList.add('field-invalid');
      mostrarMensajePagina('⚠️ Por favor ingresa primero tu número de celular en el Paso 1 para enviarte el código por WhatsApp.');
      celularInput.focus();
      return;
    }

    ocultarMensajePagina();
    const res = await fetch('/api/lite/enviar-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ celular })
    });
    const data = await res.json();
    feedback.innerText = data.success
      ? `${data.mensaje} (Código prueba: ${data.codigoDemo})`
      : data.mensaje;
  });

  // Validación elegante en la página y Envío Final
  let generatedPdfBase64 = null;
  let generatedPdfName = 'Solicitud_Cepresta.pdf';

  document.getElementById('wizardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarMensajePagina();

    const camposRequeridos = e.target.querySelectorAll('[required]');
    for (const campo of camposRequeridos) {
      let vacio = false;
      if (campo.type === 'checkbox') vacio = !campo.checked;
      else if (campo.type === 'file') vacio = !campo.files || campo.files.length === 0;
      else vacio = !campo.value.trim();

      if (vacio) {
        const panelPadre = campo.closest('.step-panel');
        if (panelPadre) {
          goToStep(panelPadre.id.replace('step-', ''));
        }
        const nombreCampo = campo.dataset.label || 'un campo obligatorio';

        if (campo.id === 'cedulaFrontal') {
          document.getElementById('boxFront').classList.add('field-invalid');
        } else if (campo.id === 'cedulaTrasera') {
          document.getElementById('boxBack').classList.add('field-invalid');
        } else {
          campo.classList.add('field-invalid');
          campo.focus();
        }

        mostrarMensajePagina(`⚠️ Falta completar el campo obligatorio: "${nombreCampo}". Por favor diligéncialo para continuar.`);
        return;
      }
    }

    if (!hasSigned) {
      mostrarMensajePagina('⚠️ Por favor realiza tu firma manuscrita en el recuadro antes de generar el PDF.');
      canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Cifrando documento, generando PDF y enviando correo...';

    try {
      const formData = new FormData(e.target);
      formData.append('fechaInicioProceso', fechaInicioProceso);
      formData.append('firmaBase64', canvas.toDataURL('image/png'));

      const response = await fetch('/api/lite/radicar', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (!result.success) {
        mostrarMensajePagina(`⚠️ ${result.mensaje}`);
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Finalizar y Generar PDF ➔';
        return;
      }

      generatedPdfBase64 = result.pdfBase64;
      generatedPdfName = result.pdfFileName;

      document.getElementById('wizardForm').style.display = 'none';
      document.querySelector('.stepper').style.display = 'none';
      document.getElementById('finalMessage').innerText = result.mensaje;
      document.getElementById('finalScreen').style.display = 'block';
    } catch (err) {
      mostrarMensajePagina('⚠️ No se pudo conectar con el servidor en este momento. Intenta nuevamente.');
      btnSubmit.disabled = false;
      btnSubmit.innerText = 'Finalizar y Generar PDF ➔';
    }
  });

  document.getElementById('btnDownloadPdf').addEventListener('click', () => {
    if (!generatedPdfBase64) return;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${generatedPdfBase64}`;
    link.download = generatedPdfName;
    link.click();
  });
});