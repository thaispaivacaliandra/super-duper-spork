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
const PORT = process.env.PORT || 10000;

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
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://super-duper-spork-rfk8.onrender.com'] 
        : ['http://localhost:3000', 'http://localhost:10000'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: (parseInt(process.env.LOGIN_ATTEMPTS_WINDOW) || 15) * 60 * 1000,
    max: parseInt(process.env.LOGIN_ATTEMPTS_MAX) || 5,
    message: { sucesso: false, mensagem: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ==============================================
// MIDDLEWARES
// ==============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Middleware para logs de acesso
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (req.path.startsWith('/api/')) {
        console.log(`📡 API ${req.method} ${req.path} de ${ip}`);
    }
    next();
});

// ==============================================
// CONFIGURAR SERVIR ARQUIVOS ESTÁTICOS
// ==============================================

// Verificar se public existe
const publicPath = path.join(__dirname, 'public');
console.log('📁 Public path:', publicPath);
if (fs.existsSync(publicPath)) {
    app.use('/admin', express.static(publicPath));
    console.log('✅ ADMIN: Servindo de', publicPath);
} else {
    console.log('❌ ADMIN: Pasta public não encontrada');
}

// Servir frontend na raiz
if (frontendPath && fs.existsSync(frontendPath)) {
    app.use('/', express.static(frontendPath));
    console.log('✅ FRONTEND: Servindo de', frontendPath);
    
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('✅ INDEX.HTML encontrado:', indexPath);
    } else {
        console.log('❌ INDEX.HTML não encontrado');
    }
} else {
    console.log('❌ FRONTEND: Pasta não encontrada');
}

// Servir imagens do frontend (CORREÇÃO)
if (frontendPath) {
    const imagesPath = path.join(frontendPath, 'images');
    if (fs.existsSync(imagesPath)) {
        app.use('/images', express.static(imagesPath));
        console.log('✅ IMAGES: Servindo de', imagesPath);
    }
}

// ==============================================
// INICIALIZAR COMPONENTES
// ==============================================
const db = new Database();
const auth = new Auth();

// ==============================================
// ROTAS DE AUTENTICAÇÃO
// ==============================================
app.post('/api/login', limiter, async (req, res) => {
    try {
        const { email, senha } = req.body;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        
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
        version: '2.0.0'
    });
});

// Rota para submeter inscrição (pública)
app.post('/api/inscricoes', async (req, res) => {
    try {
        const inscricaoData = req.body;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        
        console.log(`📝 Nova inscrição de ${ip}:`, {
            nome: inscricaoData.nome,
            email: inscricaoData.email
        });
        
        const resultado = await db.criarInscricao(inscricaoData);
        
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
            mensagem: 'Erro interno do servidor'
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

// Rota para a raiz (formulário)
app.get('/', (req, res) => {
    if (frontendPath) {
        const indexPath = path.join(frontendPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Página não encontrada');
        }
    } else {
        res.status(404).send('Frontend não configurado');
    }
});

// Rotas específicas para admin
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Admin path:', adminPath);
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send('Dashboard não encontrado');
    }
});

app.get('/admin/', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Admin path:', adminPath);
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send('Dashboard não encontrado');
    }
});

// ==============================================
// MIDDLEWARE DE ERRO GLOBAL
// ==============================================
app.use((error, req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    console.error(`💥 ERRO GLOBAL de ${ip}:`, error.message);
    console.error(error.stack);
    
    res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno do servidor'
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
        mensagem: 'Rota não encontrada'
    });
});

// ==============================================
// INICIALIZAR SERVIDOR
// ==============================================
const iniciarServidor = async () => {
    try {
        // Conectar banco de dados
        await db.conectar();
        console.log('📊 Banco de dados conectado!');
        
        // Criar tabelas
        await db.criarTabelas();
        console.log('✅ Tabela de inscrições criada/verificada!');
        
        // Iniciar servidor
        app.listen(PORT, '0.0.0.0', () => {
            console.log('🔒 ================================');
            console.log('   SEMANA DE INOVAÇÃO 2025');
            console.log('   🛡️  MODO SEGURO ATIVADO');
            console.log('================================');
            console.log(`🚀 Servidor: http://localhost:${PORT}`);
            console.log('📱 Frontend: ✅ Configurado');
            console.log(`📋 Dashboard: http://localhost:${PORT}/admin`);
            console.log(`🔐 Login: ${process.env.ADMIN_EMAIL || 'thais@teste.com'} / [senha protegida]`);
            console.log(`📊 API: http://localhost:${PORT}/api/inscricoes`);
            console.log('💾 Banco: SQLite conectado');
            console.log('🛡️  Rate Limiting: ✅ Ativo');
            console.log('🔒 JWT Security: ✅ Ativo');
            console.log('📝 Logs Seguros: ✅ Ativo');
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================');
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