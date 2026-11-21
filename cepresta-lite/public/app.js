document.addEventListener('DOMContentLoaded', () => {
  // Registrar fecha y hora exacta en que se inicia el proceso
  const inicio = new Date();
  const fechaInicioProceso = inicio.toLocaleString('es-CO');

  // Navegación Wizard
  const panels = document.querySelectorAll('.step-panel');
  const pills = document.querySelectorAll('.step-pill');

  function goToStep(stepNum) {
    panels.forEach(p => p.classList.remove('active'));
    pills.forEach(b => b.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');
    document.querySelector(`.step-pill[data-step="${stepNum}"]`).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.next-step').forEach(btn => {
    btn.addEventListener('click', () => goToStep(btn.dataset.next));
  });
  document.querySelectorAll('.prev-step').forEach(btn => {
    btn.addEventListener('click', () => goToStep(btn.dataset.prev));
  });
  pills.forEach(pill => {
    pill.addEventListener('click', () => goToStep(pill.dataset.step));
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

  // Carga de Cédula Frontal y Trasera
  const boxFront = document.getElementById('boxFront');
  const fileFront = document.getElementById('cedulaFrontal');
  const boxBack = document.getElementById('boxBack');
  const fileBack = document.getElementById('cedulaTrasera');

  boxFront.addEventListener('click', () => fileFront.click());
  boxBack.addEventListener('click', () => fileBack.click());
  fileFront.addEventListener('change', (e) => previewImg(e, 'previewFront', 'txtFront'));
  fileBack.addEventListener('change', (e) => previewImg(e, 'previewBack', 'txtBack'));

  function previewImg(event, imgId, txtId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.getElementById(imgId);
      img.src = ev.target.result;
      img.style.display = 'block';
      document.getElementById(txtId).innerText = 'Cargada y lista para cifrar ✓';
    };
    reader.readAsDataURL(file);
  }

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

  // Enviar código OTP por WhatsApp
  document.getElementById('btnSendOtp').addEventListener('click', async () => {
    const celular = document.getElementById('telefonoCelular').value.trim();
    const feedback = document.getElementById('otpFeedback');
    if (!celular) {
      alert('Por favor ingresa primero tu número de celular en el Paso 1.');
      goToStep(1);
      return;
    }

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

  // Envío Final y Descarga del PDF Oficial
  let generatedPdfBase64 = null;
  let generatedPdfName = 'Solicitud_Cepresta.pdf';

  document.getElementById('wizardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!hasSigned) {
      alert('Por favor realiza tu firma manuscrita en el recuadro antes de finalizar.');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Cifrando cédulas, generando PDF y enviando correo...';

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
        alert(`⚠️ ${result.mensaje}`);
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
      alert('Error de conexión con el servidor.');
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