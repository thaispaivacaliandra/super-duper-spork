const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const Database = require('./database');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'semana-inovacao-2025-secret-key';

// Inicializar banco de dados
const db = new Database();

// Trust proxy para Render
app.set('trust proxy', 1);

// Middlewares de segurança
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cookieParser());

// CORS configurado
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 requests por IP
    message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 tentativas de login por IP
    message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);
app.use('/api/login', loginLimiter);

// Parse JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de autenticação
function verificarAuth(req, res, next) {
    const token = req.cookies.authToken;
    
    if (!token) {
        return res.status(401).json({ 
            sucesso: false, 
            mensagem: 'Acesso negado. Login necessário.' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log(`✅ Acesso autorizado: ${decoded.email} de ${req.ip}`);
        next();
    } catch (error) {
        console.log(`❌ Token inválido de ${req.ip}`);
        res.status(401).json({ 
            sucesso: false, 
            mensagem: 'Token inválido' 
        });
    }
}

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ROTAS PÚBLICAS

// Status da API
app.get('/api/status', (req, res) => {
    res.json({
        status: 'Sistema Online',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: '2.0.2',
        frontend: 'Configurado',
        database: 'SQLite',
        port: PORT.toString()
    });
});

// Rota de inscrição (PÚBLICA)
app.post('/api/inscricoes', async (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        console.log(`📝 Nova inscrição de ${clientIP}:`, { 
            nome: req.body.nome_completo, 
            email: req.body.email 
        });

        // Validar dados obrigatórios
        const { nome_completo, email, cpf } = req.body;
        
        if (!nome_completo || !email || !cpf) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Nome completo, email e CPF são obrigatórios'
            });
        }

        // Verificar se email já existe
        const emailExiste = await db.verificarEmailExiste(email);
        if (emailExiste) {
            console.log(`❌ Erro ao salvar inscrição: Este email já está cadastrado`);
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Este email já está cadastrado'
            });
        }

        // Verificar se CPF já existe
        const cpfExiste = await db.verificarCPFExiste(cpf);
        if (cpfExiste) {
            console.log(`❌ Erro ao salvar inscrição: Este CPF já está cadastrado`);
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Este CPF já está cadastrado'
            });
        }

        // Preparar dados para inserção
        const dadosInscricao = {
            ...req.body,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
        };

        console.log('📝 Inserindo dados:', {
            nome: dadosInscricao.nome_completo,
            email: dadosInscricao.email,
            campos_total: Object.keys(dadosInscricao).length
        });

        // Salvar no banco
        const id = await db.criarInscricao(dadosInscricao);
        
        console.log(`✅ Inscrição salva com ID: ${id}`);
        console.log(`✅ Inscrição salva - ID: ${id}`);

        res.status(201).json({
            sucesso: true,
            mensagem: 'Inscrição realizada com sucesso!',
            id: id
        });

    } catch (error) {
        console.error('❌ Erro ao processar inscrição:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

// Login (PÚBLICO)
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log(`🔐 Tentativa de login: ${email} de ${clientIP}`);
        console.log(`🔐 Tentativa de login: ${email} de ${clientIP}`);

        if (!email || !senha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Email e senha são obrigatórios'
            });
        }

        // Buscar usuário
        const usuario = await db.buscarUsuarioPorEmail(email);
        
        if (!usuario) {
            console.log(`❌ Email não encontrado: ${email}`);
            console.log(`❌ Login falhado: ${email} - Credenciais inválidas`);
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Credenciais inválidas'
            });
        }

        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            console.log(`❌ Senha incorreta para: ${email}`);
            console.log(`❌ Login falhado: ${email} - Credenciais inválidas`);
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Credenciais inválidas'
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { 
                id: usuario.id, 
                email: usuario.email,
                nome: usuario.nome_completo
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Definir cookie httpOnly
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 horas
        });

        console.log(`✅ Login bem-sucedido: ${email} de ${clientIP}`);
        console.log(`✅ Login bem-sucedido: ${email}`);

        res.json({
            sucesso: true,
            mensagem: 'Login realizado com sucesso',
            usuario: {
                id: usuario.id,
                email: usuario.email,
                nome: usuario.nome_completo
            }
        });

    } catch (error) {
        console.error('❌ Erro no login:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

// APLICAR PROTEÇÃO DE AUTENTICAÇÃO NAS ROTAS SENSÍVEIS
app.use('/api/inscricoes', verificarAuth);
app.use('/api/estatisticas', verificarAuth);
app.use('/api/exportar', verificarAuth);
app.use('/api/verificar-token', verificarAuth);

// ROTAS PROTEGIDAS (SOMENTE ADMIN)

// Verificar token
app.get('/api/verificar-token', (req, res) => {
    // Se chegou aqui, o token é válido (verificado no middleware)
    res.json({
        sucesso: true,
        usuario: {
            id: req.user.id,
            email: req.user.email,
            nome: req.user.nome
        }
    });
});

// Listar inscrições (PROTEGIDA)
app.get('/api/inscricoes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';

        const resultado = await db.listarInscricoes(page, limit, search);
        
        // REMOVER SENHAS das respostas por segurança
        const inscricoesSemSenha = resultado.inscricoes.map(ins => {
            const { senha, ...dadosSeguros } = ins;
            return dadosSeguros;
        });

        res.json({
            sucesso: true,
            dados: inscricoesSemSenha, // Dados sem senhas
            paginacao: resultado.paginacao
        });

    } catch (error) {
        console.error('❌ Erro ao listar inscrições:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao carregar inscrições'
        });
    }
});

// Estatísticas (PROTEGIDA)
app.get('/api/estatisticas', async (req, res) => {
    try {
        const stats = await db.obterEstatisticas();
        
        res.json({
            sucesso: true,
            dados: stats
        });

    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao carregar estatísticas'
        });
    }
});

// Exportar dados (PROTEGIDA)
app.get('/api/exportar', async (req, res) => {
    try {
        const formato = req.query.formato || 'csv';
        
        if (formato === 'csv') {
            const inscricoes = await db.listarTodasInscricoes();
            
            // REMOVER SENHAS do export por segurança
            const inscricoesSemSenha = inscricoes.map(ins => {
                const { senha, ...dadosSeguros } = ins;
                return dadosSeguros;
            });
            
            // Gerar CSV
            const headers = Object.keys(inscricoesSemSenha[0] || {});
            const csvContent = [
                headers.join(','),
                ...inscricoesSemSenha.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        // Escapar vírgulas e aspas
                        return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                            ? `"${value.replace(/"/g, '""')}"` 
                            : value;
                    }).join(',')
                )
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=inscricoes-${new Date().toISOString().split('T')[0]}.csv`);
            res.send('\ufeff' + csvContent); // BOM para UTF-8
        } else {
            res.status(400).json({
                sucesso: false,
                mensagem: 'Formato não suportado'
            });
        }

    } catch (error) {
        console.error('❌ Erro ao exportar:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao exportar dados'
        });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('authToken');
    res.json({
        sucesso: true,
        mensagem: 'Logout realizado com sucesso'
    });
});

// Rota do admin
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Tentando acessar admin path:', adminPath);
    res.sendFile(adminPath);
});

app.get('/admin/', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Tentando acessar admin path:', adminPath);
    res.sendFile(adminPath);
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware de erro 404
app.use('*', (req, res) => {
    res.status(404).json({
        sucesso: false,
        mensagem: 'Rota não encontrada'
    });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
    console.error('❌ Erro não tratado:', error);
    res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno do servidor'
    });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌍 URL: http://localhost:${PORT}`);
    console.log(`🔒 Autenticação: JWT com cookies httpOnly`);
    console.log(`📊 Database: SQLite inicializado`);
    console.log(`🛡️ Segurança: Rotas protegidas ativadas`);
});

module.exports = app;