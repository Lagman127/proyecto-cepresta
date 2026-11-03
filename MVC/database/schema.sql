-- 1. Tabla de Usuarios / Roles (Para Acceso Administrativo y RBAC)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('ADMIN', 'ASESOR')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Clientes (Solicitantes)
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    numero_cc VARCHAR(20) UNIQUE NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    celular_whatsapp VARCHAR(20) NOT NULL,
    tipo_contrato VARCHAR(50), -- Asalariado, Independiente, Pensionado
    ingresos_mensuales NUMERIC(12, 2) NOT NULL,
    egresos_mensuales NUMERIC(12, 2) NOT NULL,
    foto_cedula_frontal TEXT, -- URL / Path en Cloudflare R2 / S3
    foto_cedula_trasera TEXT,  -- URL / Path en Cloudflare R2 / S3
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Solicitudes de Crédito
CREATE TABLE solicitudes (
    id SERIAL PRIMARY KEY,
    codigo_solicitud VARCHAR(20) UNIQUE NOT NULL, -- Ej: SOL-1001
    cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    valor_moto NUMERIC(12, 2) NOT NULL,
    valor_tramites NUMERIC(12, 2) NOT NULL,
    valor_total NUMERIC(12, 2) GENERATED ALWAYS AS (valor_moto + valor_tramites) STORED,
    cuota_inicial NUMERIC(12, 2) NOT NULL,
    monto_financiar NUMERIC(12, 2) GENERATED ALWAYS AS ((valor_moto + valor_tramites) - cuota_inicial) STORED,
    estado VARCHAR(30) DEFAULT 'PENDIENTE_OTP' CHECK (estado IN ('PENDIENTE_OTP', 'PRE_APROBADO', 'DENEGADO', 'EN_REVISION')),
    motivo_rechazo TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_cuota_minima CHECK (cuota_inicial >= ((valor_moto + valor_tramites) * 0.20))
);

-- 4. Tabla de Ingresos Familiares (Opcional - Relación 1:N o 1:1)
CREATE TABLE ingresos_familiares (
    id SERIAL PRIMARY KEY,
    solicitud_id INT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    parentesco VARCHAR(30) NOT NULL CHECK (parentesco IN ('Esposa', 'Padre', 'Hijo', 'Hermano')),
    nombre_completo VARCHAR(150) NOT NULL,
    numero_cc VARCHAR(20) NOT NULL,
    actividad_economica VARCHAR(100),
    ingresos_mensuales NUMERIC(12, 2) DEFAULT 0,
    egresos_mensuales NUMERIC(12, 2) DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Logs de Verificación (OTP y WhatsApp)
CREATE TABLE logs_validacion (
    id SERIAL PRIMARY KEY,
    solicitud_id INT REFERENCES solicitudes(id) ON DELETE CASCADE,
    codigo_otp VARCHAR(10) NOT NULL,
    intentos INT DEFAULT 0,
    verificado BOOLEAN DEFAULT FALSE,
    expira_en TIMESTAMP NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);