// Controlador de cepresta - Lógica de Negocio y Eventos de la Interfaz

document.addEventListener('DOMContentLoaded', () => {
  // Referencias a elementos de la vista
  const motoInput = document.getElementById('motoPrice');
  const feesInput = document.getElementById('feesPrice');
  const initialInput = document.getElementById('initialInput');
  const minWarning = document.getElementById('minWarning');
  const minAmountLabel = document.getElementById('minAmountLabel');
  const btnSubmit = document.getElementById('btnSubmit');

  const boxFront = document.getElementById('boxFront');
  const fileFront = document.getElementById('idFront');
  const boxBack = document.getElementById('boxBack');
  const fileBack = document.getElementById('idBack');

  const toggleFamily = document.getElementById('toggleFamily');
  const familyFields = document.getElementById('familyFields');
  const creditForm = document.getElementById('creditForm');

  // 1. Regla de Negocio: Cuota Inicial >= 20% (Moto + Trámites)
  function calculateValidation() {
    const moto = parseFloat(motoInput.value) || 0;
    const fees = parseFloat(feesInput.value) || 0;
    const initial = parseFloat(initialInput.value) || 0;

    const totalSum = moto + fees;
    const minRequired = totalSum * 0.20;

    minAmountLabel.innerText = minRequired.toLocaleString('es-CO');

    if (initial < minRequired) {
      minWarning.style.display = 'block';
      btnSubmit.disabled = true;
      btnSubmit.style.opacity = '0.5';
      btnSubmit.style.cursor = 'not-allowed';
    } else {
      minWarning.style.display = 'none';
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
      btnSubmit.style.cursor = 'pointer';
    }
  }

  // Escuchar eventos de cambio en valores numéricos
  motoInput.addEventListener('input', calculateValidation);
  feesInput.addEventListener('input', calculateValidation);
  initialInput.addEventListener('input', calculateValidation);

  // 2. Control de Carga de Cédula (Frontal y Trasera)
  boxFront.addEventListener('click', () => fileFront.click());
  boxBack.addEventListener('click', () => fileBack.click());

  fileFront.addEventListener('change', (e) => handleFileSelect(e, 'previewFront', 'txtFront'));
  fileBack.addEventListener('change', (e) => handleFileSelect(e, 'previewBack', 'txtBack'));

  function handleFileSelect(event, previewId, textId) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const preview = document.getElementById(previewId);
        preview.src = e.target.result;
        preview.style.display = 'block';
        document.getElementById(textId).innerText = "Cargada ✓";
      };
      reader.readAsDataURL(file);
    }
  }

  // 3. Control del Desplegable de Ingresos Familiares
  toggleFamily.addEventListener('change', () => {
    familyFields.style.display = toggleFamily.checked ? 'block' : 'none';
  });

  // 4. Envío del Formulario
  creditForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('¡Solicitud registrada correctamente! Enviando código de validación OTP por WhatsApp...');
  });

  // Ejecutar primera validación al cargar
  calculateValidation();
});