require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Importar módulos locais
const Database = require('./database');
const Auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000; // CORREÇÃO: Mudou de 10000 para 3000

// ==============================================
// DIAGNÓSTICO DE PASTAS (para debug)
// ==============================================
console.log('🔍 ===== DIAGNÓSTICO DE PASTAS =====');
console.log('📁 Pasta atual (backend):', __dirname);
console.log('📁 Pasta pai:', path.dirname(__dirname));

// Testar diferentes caminhos para frontend
const possiveisCaminhos = [
    path.join(path.dirname(__dirname), 'frontend'),
    path.join(__dirname, '../frontend'),
    path.join(__dirname, 'frontend'),
    path.join(path.dirname(__dirname), 'frontend')
];

let frontendPath = null;
possiveisCaminhos.forEach((caminho, index) => {
    console.log(`🔍 Testando caminho ${index + 1}: ${caminho}`);
    if (fs.existsSync(caminho)) {
        console.log(`✅ ENCONTRADO: ${caminho}`);
        if (!frontendPath) frontendPath = caminho;
    } else {
        console.log(`❌ Não existe: ${caminho}`);
    }
});
console.log('===============================');

// ==============================================
// CONFIGURAÇÕES DE SEGURANÇA
// ==============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"], // CORREÇÃO: Permitir eventos inline
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'"],
        },
    },
}));

// CORREÇÃO: CORS mais permissivo para desenvolvimento
app.use(cors({
    origin: function (origin, callback) {
        // Durante desenvolvimento, permitir qualquer origem
        // CORREÇÃO: TRUST PROXY PARA RENDER
        if (process.env.NODE_ENV === 'production') {
            app.set('trust proxy', 1);
            console.log('✅ Trust proxy configurado para produção');
        }
        // Em produção, usar lista específica
        const allowedOrigins = [
            'https://super-duper-spork-rfk8.onrender.com',
            'http://localhost:3000',
            'http://localhost:10000'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido pelo CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// CORREÇÃO: Rate limiting mais específico
const apiLimiter = rateLimit({
    windowMs: (parseInt(process.env.LOGIN_ATTEMPTS_WINDOW) || 15) * 60 * 1000,
    max: parseInt(process.env.LOGIN_ATTEMPTS_MAX) || 5,
    message: { sucesso: false, mensagem: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path !== '/api/login' // Só aplicar no login
});

const inscricaoLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 3, // 3 inscrições por minuto
    message: { sucesso: false, mensagem: 'Muitas tentativas de inscrição. Tente novamente em 1 minuto.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ==============================================
// MIDDLEWARES
// ==============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// CORREÇÃO: Middleware para logs de acesso melhorado
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} de ${ip}`);
    next();
});

// ==============================================
// CONFIGURAR SERVIR ARQUIVOS ESTÁTICOS
// ==============================================

// CORREÇÃO: Verificar se public existe e criar estrutura
const publicPath = path.join(__dirname, 'public');
console.log('📁 Public path:', publicPath);
if (fs.existsSync(publicPath)) {
    app.use('/admin', express.static(publicPath));
    console.log('✅ ADMIN: Servindo de', publicPath);
} else {
    console.log('❌ ADMIN: Pasta public não encontrada - criando...');
    try {
        fs.mkdirSync(publicPath, { recursive: true });
        console.log('✅ ADMIN: Pasta public criada');
    } catch (error) {
        console.error('❌ Erro ao criar pasta public:', error);
    }
}

// CORREÇÃO: Servir frontend na raiz com fallback
if (frontendPath && fs.existsSync(frontendPath)) {
    app.use('/', express.static(frontendPath));
    console.log('✅ FRONTEND: Servindo de', frontendPath);
    
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('✅ INDEX.HTML encontrado:', indexPath);
    } else {
        console.log('❌ INDEX.HTML não encontrado');
    }
    
    // Servir imagens
    const imagesPath = path.join(frontendPath, 'images');
    if (fs.existsSync(imagesPath)) {
        app.use('/images', express.static(imagesPath));
        console.log('✅ IMAGES: Servindo de', imagesPath);
    }
} else {
    console.log('❌ FRONTEND: Pasta não encontrada');
    
    // Fallback: servir uma página básica se frontend não existir
    app.get('/', (req, res) => {
        res.send(`
            <html>
                <head><title>Semana de Inovação 2025</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>🚀 Semana de Inovação 2025</h1>
                    <p>Sistema temporariamente em manutenção</p>
                    <p><a href="/api/status">Ver Status da API</a></p>
                </body>
            </html>
        `);
    });
}

// ==============================================
// INICIALIZAR COMPONENTES
// ==============================================
const db = new Database();
const auth = new Auth();

// ==============================================
// ROTAS DE AUTENTICAÇÃO
// ==============================================
app.post('/api/login', apiLimiter, async (req, res) => {
    try {
        const { email, senha } = req.body;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        
        console.log(`🔐 Tentativa de login: ${email} de ${ip}`);
        
        if (!email || !senha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Email e senha são obrigatórios'
            });
        }

        const resultado = await auth.verificarLogin(email, senha, ip);
        
        if (resultado.sucesso) {
            res.cookie('authToken', resultado.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 2 * 60 * 60 * 1000
            });
            console.log(`✅ Login bem-sucedido: ${email}`);
        } else {
            console.log(`❌ Login falhado: ${email} - ${resultado.mensagem}`);
        }
        
        res.status(resultado.sucesso ? 200 : 401).json(resultado);
        
    } catch (error) {
        console.error('❌ Erro no endpoint de login:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

app.post('/api/logout', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    console.log(`🔓 Logout de ${ip}`);
    
    res.clearCookie('authToken');
    res.json({ sucesso: true, mensagem: 'Logout realizado com sucesso' });
});

app.get('/api/verificar-token', auth.middlewareAuth.bind(auth), (req, res) => {
    res.json({
        sucesso: true,
        usuario: req.usuario
    });
});

// ==============================================
// ROTAS DA API
// ==============================================

// Rota de status (pública)
app.get('/api/status', (req, res) => {
    res.json({
        status: 'Sistema Online',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: '2.0.1',
        frontend: frontendPath ? 'Configurado' : 'Não encontrado',
        database: 'SQLite',
        port: PORT
    });
});

// CORREÇÃO: Rota para submeter inscrição (pública) com melhor validação
app.post('/api/inscricoes', inscricaoLimiter, async (req, res) => {
    try {
        const inscricaoData = req.body;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        
        console.log(`📝 Nova inscrição de ${ip}:`, {
            nome: inscricaoData.nomeCompleto || 'Não informado',
            email: inscricaoData.email || 'Não informado'
        });
        
        // Validação básica
        if (!inscricaoData.nomeCompleto || !inscricaoData.email) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Nome completo e email são obrigatórios'
            });
        }
        
        // Mapear dados do frontend para formato do banco
        const dadosFormatados = dadosInscricao;
        
        const resultado = await db.criarInscricao(dadosFormatados);
        
        if (resultado.sucesso) {
            console.log(`✅ Inscrição salva - ID: ${resultado.id}`);
        } else {
            console.log(`❌ Erro ao salvar inscrição: ${resultado.mensagem}`);
        }
        
        res.status(resultado.sucesso ? 201 : 400).json(resultado);
        
    } catch (error) {
        console.error('❌ Erro no endpoint de inscrições:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor',
            erro: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ROTAS PROTEGIDAS (precisam de autenticação)
app.get('/api/inscricoes', auth.middlewareAuth.bind(auth), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        
        const resultado = await db.listarInscricoes(page, limit, search);
        res.json(resultado);
        
    } catch (error) {
        console.error('❌ Erro ao listar inscrições:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

app.get('/api/estatisticas', auth.middlewareAuth.bind(auth), async (req, res) => {
    try {
        const stats = await db.obterEstatisticas();
        res.json(stats);
        
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

app.delete('/api/inscricoes/:id', auth.middlewareAuth.bind(auth), async (req, res) => {
    try {
        const id = req.params.id;
        const resultado = await db.deletarInscricao(id);
        
        if (resultado.sucesso) {
            console.log(`🗑️ Inscrição ${id} deletada por ${req.usuario.email}`);
        }
        
        res.json(resultado);
        
    } catch (error) {
        console.error('❌ Erro ao deletar inscrição:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

app.get('/api/exportar', auth.middlewareAuth.bind(auth), async (req, res) => {
    try {
        const formato = req.query.formato || 'json';
        const resultado = await db.exportarDados(formato);
        
        if (resultado.sucesso) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="inscricoes_${new Date().toISOString().split('T')[0]}.${formato}"`);
            res.send(resultado.dados);
        } else {
            res.status(400).json(resultado);
        }
        
    } catch (error) {
        console.error('❌ Erro ao exportar dados:', error);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

// ==============================================
// ROTAS DO FRONTEND
// ==============================================

// CORREÇÃO: Rota para a raiz (formulário) com fallback
app.get('/', (req, res) => {
    if (frontendPath) {
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send(`
                <html>
                    <head><title>Página não encontrada</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>📄 Página não encontrada</h1>
                        <p>O arquivo index.html não foi encontrado em: ${indexPath}</p>
                        <p><a href="/api/status">Ver Status do Sistema</a></p>
                    </body>
                </html>
            `);
        }
    } else {
        res.status(404).send(`
            <html>
                <head><title>Frontend não configurado</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>⚙️ Frontend não configurado</h1>
                    <p>Pasta frontend não encontrada</p>
                    <p><a href="/api/status">Ver Status do Sistema</a></p>
                </body>
            </html>
        `);
    }
});

// Rotas específicas para admin
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Tentando acessar admin path:', adminPath);
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send(`
            <html>
                <head><title>Dashboard Admin</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>🔧 Dashboard em desenvolvimento</h1>
                    <p>Arquivo admin.html não encontrado em: ${adminPath}</p>
                    <p><a href="/api/status">Ver Status do Sistema</a></p>
                    <p><a href="/">Voltar ao formulário</a></p>
                </body>
            </html>
        `);
    }
});

app.get('/admin/', (req, res) => {
    res.redirect('/admin');
});

// ==============================================
// MIDDLEWARE DE ERRO GLOBAL
// ==============================================
app.use((error, req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const timestamp = new Date().toISOString();
    
    console.error(`[${timestamp}] 💥 ERRO GLOBAL de ${ip}:`, error.message);
    console.error(error.stack);
    
    res.status(error.status || 500).json({
        sucesso: false,
        mensagem: process.env.NODE_ENV === 'production' 
            ? 'Erro interno do servidor' 
            : error.message,
        timestamp: timestamp
    });
});

// ==============================================
// ROTA 404 (deve ser a última)
// ==============================================
app.use('*', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    console.log(`🚫 Rota não encontrada: ${req.originalUrl} de ${ip}`);
    res.status(404).json({
        sucesso: false,
        mensagem: 'Rota não encontrada',
        rota: req.originalUrl,
        metodo: req.method
    });
});

// ==============================================
// INICIALIZAR SERVIDOR
// ==============================================
const iniciarServidor = async () => {
    try {
        console.log('🚀 Iniciando servidor...');
        
        // Conectar banco de dados
        await db.conectar();
        console.log('📊 Banco de dados conectado!');
        
        // Criar tabelas
        await db.criarTabelas();
        console.log('✅ Tabela de inscrições criada/verificada!');
        
        // Iniciar servidor
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('🔒 ================================');
            console.log('   SEMANA DE INOVAÇÃO 2025');
            console.log('   🛡️  MODO SEGURO ATIVADO');
            console.log('================================');
            console.log(`🚀 Servidor: http://localhost:${PORT}`);
            console.log(`📱 Frontend: ${frontendPath ? '✅ Configurado' : '❌ Não encontrado'}`);
            console.log(`📋 Dashboard: http://localhost:${PORT}/admin`);
            console.log(`🔐 Login: ${process.env.ADMIN_EMAIL || 'thais@teste.com'} / [senha protegida]`);
            console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
            console.log(`📝 API Inscrições: http://localhost:${PORT}/api/inscricoes`);
            console.log('💾 Banco: SQLite conectado');
            console.log('🛡️  Rate Limiting: ✅ Ativo');
            console.log('🔒 JWT Security: ✅ Ativo');
            console.log('📝 Logs Seguros: ✅ Ativo');
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================');
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🔄 Recebido SIGTERM, fechando servidor...');
            server.close(() => {
                console.log('✅ Servidor fechado');
                db.fechar();
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('❌ Erro ao inicializar servidor:', error);
        process.exit(1);
    }
};

// Tratar erros não capturados
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection em:', promise, 'razão:', reason);
    process.exit(1);
});

// Inicializar
iniciarServidor();