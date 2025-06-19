require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configurações seguras - APENAS fallbacks para desenvolvimento local
const JWT_SECRET = process.env.JWT_SECRET || 'desenvolvimento-local-apenas';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'thais@teste.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

// Hash da senha do admin (calculado uma vez)
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 12);

class Auth {
    
    // Verificar login com logs de segurança
    async verificarLogin(email, senha, ip = 'unknown') {
        try {
            console.log(`🔐 Tentativa de login: ${email} de ${ip}`);
            
            // Verificar se é o admin
            if (email !== ADMIN_EMAIL) {
                console.log(`❌ Email não encontrado: ${email}`);
                return { sucesso: false, mensagem: 'Credenciais inválidas' };
            }

            // Verificar senha
            const senhaValida = bcrypt.compareSync(senha, ADMIN_PASSWORD_HASH);
            if (!senhaValida) {
                console.log(`❌ Senha incorreta para: ${email} de ${ip}`);
                return { sucesso: false, mensagem: 'Credenciais inválidas' };
            }

            // Gerar token JWT seguro
            const token = jwt.sign(
                { 
                    email: email, 
                    tipo: 'admin',
                    ip: ip,
                    timestamp: Date.now()
                },
                JWT_SECRET,
                { 
                    expiresIn: '2h',
                    issuer: 'semana-inovacao-2025',
                    audience: 'admin-dashboard'
                }
            );

            console.log(`✅ Login bem-sucedido: ${email} de ${ip}`);
            
            return { 
                sucesso: true, 
                token: token,
                usuario: { email: email, tipo: 'admin' },
                expiresIn: '2h'
            };

        } catch (error) {
            console.error(`❌ Erro no login para ${email}:`, error.message);
            return { sucesso: false, mensagem: 'Erro interno do servidor' };
        }
    }

    // Verificar token com validações extras
    verificarToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET, {
                issuer: 'semana-inovacao-2025',
                audience: 'admin-dashboard'
            });
            
            // Verificar se token não é muito antigo (além do exp)
            const agora = Date.now();
            const tokenAge = agora - decoded.timestamp;
            const maxAge = 2 * 60 * 60 * 1000; // 2 horas em ms
            
            if (tokenAge > maxAge) {
                return { valido: false, mensagem: 'Token expirado por idade' };
            }
            
            return { valido: true, usuario: decoded };
            
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valido: false, mensagem: 'Token expirado' };
            } else if (error.name === 'JsonWebTokenError') {
                return { valido: false, mensagem: 'Token inválido' };
            } else {
                console.error('❌ Erro na verificação do token:', error.message);
                return { valido: false, mensagem: 'Erro na validação' };
            }
        }
    }

    // Middleware melhorado - CORREÇÃO DEFINITIVA DO IP
    middlewareAuth(req, res, next) {
        const token = req.headers.authorization?.replace('Bearer ', '') || 
                     req.cookies?.authToken;
        
        // CORREÇÃO: Usar variável separada para IP (não modificar req.ip)
        const userIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

        if (!token) {
            console.log(`🚫 Acesso negado - sem token de ${userIp}`);
            return res.status(401).json({ 
                sucesso: false, 
                mensagem: 'Token de acesso requerido' 
            });
        }

        const verificacao = new Auth().verificarToken(token);
        if (!verificacao.valido) {
            console.log(`🚫 Token inválido de ${userIp}: ${verificacao.mensagem}`);
            return res.status(401).json({ 
                sucesso: false, 
                mensagem: verificacao.mensagem 
            });
        }

        // Log de acesso autorizado
        console.log(`✅ Acesso autorizado: ${verificacao.usuario.email} de ${userIp}`);
        
        // CORREÇÃO: Adicionar propriedades customizadas (não modificar req.ip)
        req.usuario = verificacao.usuario;
        req.userIp = userIp; // Nova propriedade customizada
        next();
    }

    // Middleware para logs de segurança
    logSeguranca(evento, detalhes = {}) {
        const timestamp = new Date().toISOString();
        console.log(`🔒 [SECURITY] ${timestamp} - ${evento}:`, detalhes);
    }
}

module.exports = Auth;