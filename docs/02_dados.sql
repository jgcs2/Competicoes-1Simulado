START TRANSACTION;

SET time_zone = '+00:00';

INSERT INTO usuarios (id, nome, cpf, email, senha_hash) VALUES
(1, 'Lúcia Almeida', '00000000001', 'lucia@example.org', 'pbkdf2_sha256$600000$a2ed07dad46506b6669edbaacd1d4ebe$7014f6acc8f10269386f773e9e0e8c3d488b3937ac745b2a594d0ba54f97e2bc'),
(2, 'Caio Almeida', '00000000002', 'caio@example.org', 'pbkdf2_sha256$600000$0973665fab4729cbd736a66ff7e1f3f3$dda7b46b17e60cd36eecdd236389375a5e796ff6b5ca8a29753fcf4787d07dcc'),
(3, 'Helena Prado', '00000000003', 'helena@example.org', 'pbkdf2_sha256$600000$25dc8f9c2f0482316de364ef6082a5ba$47eb8f8ac48e59f4a58e23f2cfcd83970310f49fc6f27058f1e493e8f9aae839'),
(4, 'Rosa Lima', '00000000004', 'rosa@example.org', 'pbkdf2_sha256$600000$f562735e9cd42ad9ded4ed27d5f2d682$05f5aa5d617a41ce018f2816c2157c3f60e46397a261527d883305b1256d8007');

INSERT INTO pacientes (usuario_id) VALUES
(1),
(4);

INSERT INTO cuidadores (usuario_id) VALUES
(2);

INSERT INTO profissionais (usuario_id, especialidades) VALUES
(3, 'Enfermagem');

INSERT INTO vinculos_cuidado (pacientes_id, cuidador_id) VALUES
(1, 2),
(4, 2);

INSERT INTO agendamentos
(id, paciente_id, profissional_id, inicio_utc, stats)
VALUES
(1, 1, 3, UNIX_TIMESTAMP('2026-11-26 12:00:00'), 'marcado');

INSERT INTO medidas
(id, paciente_id, instante_utc, tipo, glicemia_mg_dl, sistolica_mmhg, diastolica_mmhg)
VALUES
(1, 1, UNIX_TIMESTAMP('2026-11-25 10:15:00'), 'glicemia', 96, NULL, NULL),
(2, 1, UNIX_TIMESTAMP('2026-11-25 10:30:00'), 'pressao', NULL, 120, 80);


COMMIT;

SELECT * FROM usuarios;
SELECT * FROM pacientes;
SELECT * FROM cuidadores;
SELECT * FROM profissionais;
SELECT * FROM vinculos_cuidado;
SELECT * FROM agendamentos;
SELECT * FROM medidas;


SELECT 
p.nome AS paciente,
c.nome AS cuidador
FROM vinculos_cuidado AS v
JOIN usuarios AS p
ON v.pacientes_id = p.id
JOIN usuarios AS c
ON v.cuidador_id = c.id;