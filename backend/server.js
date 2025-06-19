require('dotenv').config(); // DEVE SER A PRIMEIRA LINHA!

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs'); // ADICIONAR AQUI NO TOPO
const rateLimit = require('express-rate-limit');
const Database = require('./database');
const Auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database();
const auth = new Auth();

// Rate limiting para login (anti força bruta)
const loginLimiter = rateLimit({
    windowMs: parseInt(process.env.LOGIN_ATTEMPTS_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.LOGIN_ATTEMPTS_MAX) || 5, // máximo 5 tentativas
    message: {
        sucesso: false,
        mensagem: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
        tipo: 'rate_limit'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        console.log(`🚫 SECURITY ALERT: Rate limit excedido para login de ${ip}`);
        res.status(429).json({
            sucesso: false,
            mensagem: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
            tipo: 'rate_limit',
            tentarNovamenteEm: '15 minutos'
        });
    }
});

// Rate limiting geral para API
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // máximo 100 requests por minuto
    message: {
        sucesso: false,
        mensagem: 'Muitas requisições. Tente novamente em alguns instantes.',
        tipo: 'rate_limit'
    }
});

// Middlewares
app.use(helmet({
    contentSecurityPolicy: false // Permitir inline scripts para o dashboard
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Trust proxy para IP real (necessário para rate limiting)
app.set('trust proxy', 1);

// Rate limiting geral
app.use('/api/', apiLimiter);

// 🔍 DIAGNÓSTICO: Verificar estrutura de pastas
console.log('\n🔍 ===== DIAGNÓSTICO DE PASTAS =====');
console.log('📁 Pasta atual (backend):', __dirname);
console.log('📁 Pasta pai:', path.dirname(__dirname));

// Verificar pastas
const possiveisCaminhos = [
    path.join(__dirname, '..', 'frontend'),
    path.join(__dirname, '../frontend'),
    path.join(__dirname, 'frontend'),
    path.join(path.dirname(__dirname), 'frontend')
];

let frontendEncontrado = false;
let frontendPath = '';

possiveisCaminhos.forEach((caminho, index) => {
    console.log(`🔍 Testando caminho ${index + 1}: ${caminho}`);
    if (fs.existsSync(caminho)) {
        console.log(`✅ ENCONTRADO: ${caminho}`);
        if (!frontendEncontrado) {
            frontendPath = caminho;
            frontendEncontrado = true;
        }
    } else {
        console.log(`❌ Não existe: ${caminho}`);
    }
});

console.log('===============================\n');

// Servir arquivos estáticos (dashboard admin)
const publicPath = path.join(__dirname, 'public');
console.log('📁 Public path:', publicPath);
app.use('/admin', express.static(publicPath));


// Rotas específicas para admin
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Admin path:', adminPath);
    res.sendFile(adminPath);
});

app.get('/admin/', (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    console.log('📄 Admin path:', adminPath);
    res.sendFile(adminPath);
});

// 🔥 SERVIR FRONTEND COM DIAGNÓSTICO
if (frontendEncontrado) {
    console.log(`✅ FRONTEND: Servindo de ${frontendPath}`);
    app.use('/', express.static(frontendPath));
    
    // Verificar se index.html existe
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log(`✅ INDEX.HTML encontrado: ${indexPath}`);
    } else {
        console.log(`❌ INDEX.HTML não encontrado: ${indexPath}`);
    }
} else {
    console.log('❌ FRONTEND: Nenhuma pasta frontend encontrada!');
    
    // Rota manual de fallback
    app.get('/', (req, res) => {
        console.log('🔄 Servindo fallback para rota principal');
        res.json({
            message: '📱 Sistema Semana de Inovação 2025',
            status: 'Frontend não encontrado no servidor',
            debug: {
                backendPath: __dirname,
                testados: possiveisCaminhos,
                encontrado: 'Nenhum'
            },
            dashboard: '/admin',
            api: '/api/status',
            timestamp: new Date().toISOString()
        });
    });
}

// ROTA DE LOGIN COM RATE LIMITING E LOGS DE SEGURANÇA
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { email, senha } = req.body;
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        // Log da tentativa de login
        console.log(`🔐 Tentativa de login: ${email} de ${ip}`);
        
        if (!email || !senha) {
            console.log(`🚫 SECURITY: Login sem credenciais de ${ip}`);
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Email e senha são obrigatórios'
            });
        }
        
        // Verificar credenciais
        const resultado = await auth.verificarLogin(email, senha, ip);
        
        if (resultado.sucesso) {
            console.log(`✅ SECURITY: Login autorizado para ${email} de ${ip}`);
            res.json(resultado);
        } else {
            console.log(`❌ SECURITY: Login negado para ${email} de ${ip} - ${resultado.mensagem}`);
            res.status(401).json(resultado);
        }
        
    } catch (error) {
        const ip = req.ip || 'unknown';
        console.error(`❌ SECURITY: Erro no endpoint de login de ${ip}:`, error.message);
        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro interno do servidor'
        });
    }
});

// ROTA: Verificar token
app.get('/api/verificar-token', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const ip = req.ip || 'unknown';
    
    if (!token) {
        console.log(`🚫 SECURITY: Verificação de token sem token de ${ip}`);
        return res.status(401).json({ valido: false });
    }
    
    const verificacao = auth.verificarToken(token);
    
    if (verificacao.valido) {
        res.json({ valido: true, usuario: verificacao.usuario });
    } else {
        console.log(`🚫 SECURITY: Token inválido de ${ip}: ${verificacao.mensagem}`);
        res.status(401).json({ valido: false, mensagem: verificacao.mensagem });
    }
});

// ROTA PÚBLICA: Receber inscrições (COM LOGS SEGUROS)
app.post('/api/inscricoes', async (req, res) => {
    try {
        const ip = req.ip || 'unknown';
        
        // Log seguro - SEM dados sensíveis como CPF, senha, etc
        const logData = {
            nome: req.body.nomeCompleto,
            email: req.body.email,
            empresa: req.body.empresa || 'Não informado',
            participacao: req.body.participacao || 'Não informado',
            estado: req.body.estado || 'Não informado',
            timestamp: new Date().toISOString(),
            ip: ip
        };
        
        console.log('📋 Nova inscrição recebida:', logData);
        
        // Validações básicas
        if (!req.body.nomeCompleto || !req.body.cpf || !req.body.email) {
            console.log(`🚫 Inscrição inválida de ${ip}: campos obrigatórios faltando`);
            return res.status(400).json({
                success: false,
                message: 'Campos obrigatórios não preenchidos'
            });
        }
        
        // Salvar no banco de dados
        await db.salvarInscricao(req.body);
        
        console.log(`✅ Inscrição salva: ${req.body.id} - ${logData.nome}`);
        
        res.json({
            success: true,
            message: 'Inscrição salva com sucesso no banco de dados!',
            id: req.body.id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const ip = req.ip || 'unknown';
        console.error(`❌ Erro ao processar inscrição de ${ip}:`, error.message);
        
        // Erro de CPF duplicado
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({
                success: false,
                message: 'CPF já cadastrado! Cada CPF pode fazer apenas uma inscrição.',
                error: 'duplicate_cpf'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: 'server_error'
        });
    }
});

// ROTA PROTEGIDA: Listar todas as inscrições
app.get('/api/inscricoes', auth.middlewareAuth, async (req, res) => {
    try {
        const inscricoes = await db.listarInscricoes();
        
        console.log(`📊 Lista de inscrições acessada por ${req.usuario.email} de ${req.ip}`);
        
        res.json({
            success: true,
            total: inscricoes.length,
            inscricoes: inscricoes
        });
    } catch (error) {
        console.error('❌ Erro ao listar inscrições:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar inscrições'
        });
    }
});

// ROTA PROTEGIDA: Estatísticas
app.get('/api/estatisticas', auth.middlewareAuth, async (req, res) => {
    try {
        const stats = await db.getEstatisticas();
        
        console.log(`📈 Estatísticas acessadas por ${req.usuario.email} de ${req.ip}`);
        
        res.json({
            success: true,
            estatisticas: stats
        });
    } catch (error) {
        console.error('❌ Erro ao gerar estatísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar estatísticas'
        });
    }
});

// ROTA PROTEGIDA: Export CSV
app.get('/api/export/csv', auth.middlewareAuth, async (req, res) => {
    try {
        const inscricoes = await db.listarInscricoes();
        
        if (inscricoes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Nenhuma inscrição encontrada'
            });
        }
        
        // Criar CSV com mais campos
        const headers = [
            'ID', 'Data Inscrição', 'Nome Completo', 'CPF', 'Email', 
            'Nome Social', 'Celular', 'Data Nascimento', 'País', 'Estado',
            'Vínculo Institucional', 'Empresa', 'Cargo', 'Liderança', 
            'Servidor Público', 'Participação', 'Áreas de Interesse',
            'Deficiência', 'Raça/Etnia', 'Gênero', 'InovaGov', 'Comunicações',
            'Laboratório', 'Nome Laboratório', 'Status'
        ].join(',');
        
        const rows = inscricoes.map(ins => [
            ins.id,
            ins.data_inscricao,
            `"${ins.nome_completo}"`,
            ins.cpf,
            ins.email,
            `"${ins.nome_social || ''}"`,
            ins.celular || '',
            ins.data_nascimento || '',
            ins.pais || '',
            ins.estado || '',
            ins.vinculo_institucional || '',
            `"${ins.empresa || ''}"`,
            ins.cargo || '',
            ins.lideranca || '',
            ins.servidor || '',
            ins.participacao || '',
            `"${ins.areas_interesse || ''}"`,
            ins.deficiencia || '',
            ins.raca || '',
            ins.genero || '',
            ins.inovagov || '',
            ins.comunicacoes || '',
            ins.laboratorio || '',
            `"${ins.nome_laboratorio || ''}"`,
            ins.status || ''
        ].join(','));
        
        const csv = [headers, ...rows].join('\n');
        
        console.log(`📥 EXPORT: CSV solicitado por ${req.usuario.email} de ${req.ip} - ${inscricoes.length} registros`);
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=inscricoes-semana-inovacao-2025.csv');
        res.send('\ufeff' + csv); // UTF-8 BOM para Excel
        
    } catch (error) {
        console.error('❌ Erro ao exportar CSV:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao exportar CSV' 
        });
    }
});

// Health check para monitoramento
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
    });
});

// ROTA DE STATUS DETALHADO
app.get('/api/status', (req, res) => {
    res.json({
        message: '🎉 API da Semana de Inovação 2025 funcionando!',
        status: 'online',
        database: 'conectado',
        security: 'habilitada',
        frontend: frontendEncontrado ? 'encontrado' : 'não encontrado',
        frontendPath: frontendPath || 'nenhum',
        dashboard: '/admin',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// Rota 404 personalizada
app.use('*', (req, res) => {
    const ip = req.ip || 'unknown';
    console.log(`🚫 Rota não encontrada: ${req.originalUrl} de ${ip}`);
    
    res.status(404).json({
        message: '🚫 Rota não encontrada',
        path: req.originalUrl,
        frontend: frontendEncontrado ? 'encontrado' : 'não encontrado',
        endpoints: {
            'Dashboard Admin': '/admin',
            'API Status': '/api/status',
            'API Inscrições': '/api/inscricoes',
            'Health Check': '/health'
        }
    });
});

// Tratamento de erros globais
app.use((error, req, res, next) => {
    const ip = req.ip || 'unknown';
    console.error(`💥 ERRO GLOBAL de ${ip}:`, error);
    
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        timestamp: new Date().toISOString()
    });
});

// Inicializar banco e servidor
async function iniciarServidor() {
    try {
        // Conectar ao banco primeiro
        await db.init();
        
        // Verificar variáveis de ambiente críticas
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            console.warn('⚠️  AVISO: JWT_SECRET muito simples! Use uma chave mais complexa em produção.');
        }
        
        // Depois iniciar o servidor
        app.listen(PORT, () => {
            console.log('\n🔒 ================================');
            console.log('   SEMANA DE INOVAÇÃO 2025');
            console.log('   🛡️  MODO SEGURO ATIVADO');
            console.log('================================');
            console.log(`🚀 Servidor: http://localhost:${PORT}`);
            console.log(`📱 Frontend: ${frontendEncontrado ? '✅ Configurado' : '❌ Não encontrado'}`);
            console.log(`📋 Dashboard: http://localhost:${PORT}/admin`);
            console.log(`🔐 Login: ${process.env.ADMIN_EMAIL} / [senha protegida]`);
            console.log(`📊 API: http://localhost:${PORT}/api/inscricoes`);
            console.log(`💾 Banco: SQLite conectado`);
            console.log(`🛡️  Rate Limiting: ✅ Ativo`);
            console.log(`🔒 JWT Security: ✅ Ativo`);
            console.log(`📝 Logs Seguros: ✅ Ativo`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================\n');
        });
        
    } catch (error) {
        console.error('❌ Erro crítico ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Servidor sendo encerrado graciosamente...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 Servidor interrompido pelo usuário...');
    process.exit(0);
});

// Iniciar tudo
iniciarServidor();