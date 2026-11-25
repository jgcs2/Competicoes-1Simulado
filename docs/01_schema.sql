CREATE TABLE usuarios (
id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
nome VARCHAR(255) NOT NULL,
cpf CHAR(11) NOT NULL UNIQUE,
email VARCHAR(255) NOT NULL UNIQUE,
senha_hash VARCHAR(255) NOT NULL,
CHECK (CHAR_LENGTH(TRIM(nome)) > 0),
CHECK (CHAR_LENGTH(TRIM(email)) = CHAR_LENGTH(email) AND LOCATE ('@',email) > 1),
CHECK (CHAR_LENGTH(TRIM(senha_hash)) > 0)
);

CREATE TABLE pacientes (
usuario_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
	FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
 );
 
CREATE TABLE cuidadores ( 
 usuario_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, 
	FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
 );
 
CREATE TABLE profissionais (
usuario_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
especialidades VARCHAR(150) NOT NULL,
FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
 CHECK (CHAR_LENGTH(TRIM(especialidades)) > 0)
);
 
 
CREATE TABLE vinculos_cuidado (
pacientes_id INT UNSIGNED NOT NULL,
cuidador_id INT UNSIGNED NOT NULL,
PRIMARY KEY (pacientes_id, cuidador_id),
FOREIGN KEY (pacientes_id) REFERENCES pacientes (usuario_id),
FOREIGN KEY (cuidador_id) REFERENCES cuidadores (usuario_id),
CHECK (pacientes_id <> cuidador_id)
);
 

CREATE TABLE agendamentos (
id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
paciente_id INT UNSIGNED NOT NULL,
profissional_id INT UNSIGNED NOT NULL,
inicio_utc BIGINT NOT NULL COMMENT 'Segundos Unix em UTC',
stats VARCHAR (10) NOT NULL DEFAULT 'Marcado' COMMENT 'Marcado ou Cancelado',
vaga_ativa_utc BIGINT GENERATED ALWAYS AS (
CASE WHEN stats = 'Marcado' THEN inicio_utc ELSE NULL END
) STORED, 

FOREIGN KEY (paciente_id) REFERENCES pacientes (usuario_id),
FOREIGN KEY (profissional_id) REFERENCES profissionais (usuario_id),

CHECK (paciente_id <> profissional_id),
CHECK (stats IN ('Marcado', 'Cancelado')),
UNIQUE KEY agenda_profissional_ativa (profissional_id, vaga_ativa_utc),
UNIQUE KEY agenda_paciente_ativa (paciente_id, vaga_ativa_utc)
);

CREATE TABLE medidas (
id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
paciente_id INT UNSIGNED NOT NULL,
instante_utc INT NOT NULL COMMENT 'Segundos Unix em UTC',
tipo VARCHAR(10) NOT NULL,
glicemia_mg_dl INT UNSIGNED,
sistolica_mmHg INT UNSIGNED,
diastolica_mmHg INT UNSIGNED, 

FOREIGN KEY (paciente_id) REFERENCES pacientes (usuario_id),
INDEX historico_paciente (paciente_id, instante_utc DESC), 

CHECK (
( tipo = 'glicemia'
AND glicemia_mg_dl IS NOT NULL AND glicemia_mg_dl > 0 
AND sistolica_mmHg IS NULL AND diastolica_mmHg IS NULL )
OR 
(tipo = 'pressao' AND glicemia_mg_dl IS NULL
AND sistolica_mmHg IS NOT NULL AND sistolica_mmHg > 0 
AND diastolica_mmHg IS NOT NULL AND diastolica_mmHg > 0)
)
);

