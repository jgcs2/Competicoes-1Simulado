const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const banco = require('./banco');
const openapi = require('./openapi.json');

const app = express();
const segredo = process.env.JWT_SECRET;

if (!segredo || segredo.length < 32) {
  throw new Error('Defina JWT_SECRET no .env com pelo menos 32 caracteres.');
}

app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.post('/cadastro', async (req, res) => {
  const { nome, cpf, email, senha } = req.body ?? {};
  const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
  const emailLimpo = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (
    !nomeLimpo ||
    nomeLimpo.length > 255 ||
    typeof cpf !== 'string' ||
    !/^\d{11}$/.test(cpf) ||
    emailLimpo.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo) ||
    typeof senha !== 'string' ||
    senha.length < 8 ||
    Buffer.byteLength(senha, 'utf8') > 72
  ) {
    return res.status(400).json({
      erro: 'Informe nome, CPF com 11 dígitos, e-mail válido e senha de 8 caracteres a 72 bytes.'
    });
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const conexao = await banco.getConnection();
  let id;

  try {
    await conexao.beginTransaction();

    const [resultado] = await conexao.execute(`
      INSERT INTO usuarios (nome, cpf, email, senha_hash)
      VALUES (?, ?, ?, ?)
    `, [nomeLimpo, cpf, emailLimpo, senhaHash]);

    id = resultado.insertId;

    await conexao.execute(`
      INSERT INTO pacientes (usuario_id)
      VALUES (?)
    `, [id]);

    await conexao.commit();
  } catch (erro) {
    await conexao.rollback();

    if (erro.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado.' });
    }

    throw erro;
  } finally {
    conexao.release();
  }

  return res.status(201).json({
    id,
    nome: nomeLimpo,
    email: emailLimpo
  });
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    !email.trim() ||
    typeof senha !== 'string' ||
    !senha ||
    Buffer.byteLength(senha, 'utf8') > 72
  ) {
    return res.status(400).json({ erro: 'Informe e-mail e senha válidos.' });
  }

  const [[usuario]] = await banco.execute(`
    SELECT id, senha_hash
    FROM usuarios
    WHERE email = ?
  `, [email.trim().toLowerCase()]);

  if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
    return res.status(401).json({ erro: 'Credenciais inválidas.' });
  }

  const token = jwt.sign({}, segredo, {
    algorithm: 'HS256',
    subject: String(usuario.id),
    expiresIn: '1h'
  });

  return res.json({ token });
});

function idValido(id) {
  return Number.isInteger(id) && id >= 1 && id <= 4294967295;
}

async function autenticarPaciente(req, res, next) {
  const token = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '')?.[1];

  if (!token) {
    return res.status(401).json({ erro: 'Token obrigatório.' });
  }

  let credencial;

  try {
    credencial = jwt.verify(token, segredo, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }

  const id = Number(credencial.sub);

  if (!idValido(id)) {
    return res.status(401).json({ erro: 'Token inválido.' });
  }

  const [[paciente]] = await banco.execute(`
    SELECT usuario_id
    FROM pacientes
    WHERE usuario_id = ?
  `, [id]);

  if (!paciente) {
    return res.status(403).json({ erro: 'Esta operação exige perfil de paciente.' });
  }

  req.pacienteId = id;
  next();
}

function lerIdAgendamento(req, res, next) {
  const texto = req.params.id;
  const id = Number(texto);

  if (!/^[1-9]\d*$/.test(texto) || !idValido(id)) {
    return res.status(400).json({ erro: 'ID de agendamento inválido.' });
  }

  req.agendamentoId = id;
  next();
}

async function validarAgendamento(req, res, next) {
  const { profissionalId, dataHora } = req.body ?? {};

  if (
    !idValido(profissionalId) ||
    profissionalId === req.pacienteId ||
    typeof dataHora !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(dataHora)
  ) {
    return res.status(400).json({
      erro: 'Informe um ID de profissional diferente do paciente e uma data UTC no formato AAAA-MM-DDTHH:mm:ssZ.'
    });
  }

  const data = new Date(dataHora);

  if (
    Number.isNaN(data.getTime()) ||
    data.toISOString() !== dataHora.replace('Z', '.000Z')
  ) {
    return res.status(400).json({ erro: 'Data inválida.' });
  }

  const [[profissional]] = await banco.execute(`
    SELECT usuario_id
    FROM profissionais
    WHERE usuario_id = ?
  `, [profissionalId]);

  if (!profissional) {
    return res.status(404).json({ erro: 'Profissional não encontrado.' });
  }

  req.dadosAgendamento = {
    profissionalId,
    inicioUtc: data.getTime() / 1000
  };

  next();
}

app.use('/agendamentos', autenticarPaciente);

app.get('/agendamentos', async (req, res) => {
  const [agendamentos] = await banco.execute(`
    SELECT
      id,
      profissional_id AS profissionalId,
      inicio_utc AS inicioUtc,
      stats
    FROM agendamentos
    WHERE paciente_id = ?
    ORDER BY inicio_utc, id
  `, [req.pacienteId]);

  return res.json(agendamentos);
});

app.post('/agendamentos', validarAgendamento, async (req, res) => {
  const { profissionalId, inicioUtc } = req.dadosAgendamento;

  const [resultado] = await banco.execute(`
    INSERT INTO agendamentos (paciente_id, profissional_id, inicio_utc)
    VALUES (?, ?, ?)
  `, [req.pacienteId, profissionalId, inicioUtc]);

  return res.status(201).json({
    id: resultado.insertId,
    profissionalId,
    inicioUtc,
    stats: 'Marcado'
  });
});

app.put(
  '/agendamentos/:id',
  lerIdAgendamento,
  validarAgendamento,
  async (req, res) => {
    const { profissionalId, inicioUtc } = req.dadosAgendamento;

    const [resultado] = await banco.execute(`
      UPDATE agendamentos
      SET profissional_id = ?, inicio_utc = ?
      WHERE id = ? AND paciente_id = ? AND stats = 'Marcado'
    `, [profissionalId, inicioUtc, req.agendamentoId, req.pacienteId]);

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Agendamento ativo não encontrado.' });
    }

    return res.json({
      id: req.agendamentoId,
      profissionalId,
      inicioUtc,
      stats: 'Marcado'
    });
  }
);

app.delete('/agendamentos/:id', lerIdAgendamento, async (req, res) => {
  const [resultado] = await banco.execute(`
    UPDATE agendamentos
    SET stats = 'Cancelado'
    WHERE id = ? AND paciente_id = ? AND stats = 'Marcado'
  `, [req.agendamentoId, req.pacienteId]);

  if (resultado.affectedRows === 0) {
    return res.status(404).json({ erro: 'Agendamento ativo não encontrado.' });
  }

  return res.status(204).end();
});

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

app.use((erro, req, res, next) => {
  if (res.headersSent) {
    return next(erro);
  }

  if (erro.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      erro: 'Paciente ou profissional já tem agendamento ativo nesse horário.'
    });
  }

  if (erro.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(404).json({ erro: 'Paciente ou profissional não encontrado.' });
  }

  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }

  if (erro.status === 413) {
    return res.status(413).json({ erro: 'Corpo da requisição muito grande.' });
  }

  console.error(erro.code ?? erro.message);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

async function iniciar() {
  await banco.query('SELECT 1');

  const servidor = app.listen(3000, '127.0.0.1', () => {
    console.log('Swagger em http://127.0.0.1:3000/docs/');
  });

  servidor.on('error', async (erro) => {
    console.error('Falha ao abrir a porta 3000:', erro.message);
    process.exitCode = 1;
    await banco.end();
  });
}

iniciar().catch(async (erro) => {
  console.error('Falha ao conectar ao MySQL:', erro.message);
  process.exitCode = 1;
  await banco.end();
});