const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'inscricoes.db');
        this.db = null;
        this.conectar();
        this.criarTabelas();
    }

    conectar() {
        try {
            console.log('💾 Database path:', this.dbPath);
            this.db = new Database(this.dbPath, { 
                verbose: console.log,
                fileMustExist: false
            });
            
            // Configurações de performance
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = 1000');
            this.db.pragma('temp_store = memory');
            
            console.log('✅ Banco de dados conectado com sucesso');
        } catch (error) {
            console.error('❌ Erro ao conectar com o banco:', error);
            this.db = null;
        }
    }

    // Verificar se DB está disponível
    verificarConexao() {
        if (!this.db) {
            console.log('⚠️ Database não conectado, tentando reconectar...');
            this.conectar();
        }
        return this.db !== null;
    }

    criarTabelas() {
        if (!this.verificarConexao()) {
            console.error('❌ Não foi possível criar tabelas - DB não conectado');
            return;
        }

        try {
            // Criar tabela de inscrições
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS inscricoes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome_completo TEXT NOT NULL,
                    cpf TEXT UNIQUE,
                    email TEXT UNIQUE NOT NULL,
                    senha TEXT,
                    nome_social TEXT,
                    celular TEXT,
                    data_nascimento TEXT,
                    pais TEXT DEFAULT 'BR',
                    estado TEXT,
                    vinculo_institucional TEXT,
                    empresa TEXT,
                    cargo TEXT,
                    outro_cargo TEXT,
                    lideranca TEXT,
                    servidor_publico TEXT,
                    tipo_participacao TEXT,
                    areas_interesse TEXT,
                    deficiencia TEXT DEFAULT 'nao',
                    tipos_deficiencia TEXT,
                    raca TEXT,
                    genero TEXT,
                    inovagov TEXT,
                    comunicacoes TEXT,
                    laboratorio TEXT DEFAULT 'nao',
                    nome_laboratorio TEXT,
                    termos_participacao INTEGER DEFAULT 1,
                    compartilhamento_dados INTEGER DEFAULT 1,
                    processamento_dados INTEGER DEFAULT 1,
                    uso_imagem INTEGER DEFAULT 1,
                    alteracoes_evento INTEGER DEFAULT 1,
                    criado_em TEXT NOT NULL,
                    atualizado_em TEXT NOT NULL
                )
            `);

            console.log('✅ Tabelas criadas/verificadas com sucesso');
        } catch (error) {
            console.error('❌ Erro ao criar tabelas:', error);
        }
    }

    async criarInscricao(dados) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    throw new Error('Database não disponível');
                }

                // Converter arrays para JSON string
                if (Array.isArray(dados.areas_interesse)) {
                    dados.areas_interesse = JSON.stringify(dados.areas_interesse);
                }
                if (Array.isArray(dados.tipos_deficiencia)) {
                    dados.tipos_deficiencia = JSON.stringify(dados.tipos_deficiencia);
                }

                const stmt = this.db.prepare(`
                    INSERT INTO inscricoes (
                        nome_completo, cpf, email, senha, nome_social, celular, data_nascimento,
                        pais, estado, vinculo_institucional, empresa, cargo, outro_cargo,
                        lideranca, servidor_publico, tipo_participacao, areas_interesse,
                        deficiencia, tipos_deficiencia, raca, genero, inovagov, comunicacoes,
                        laboratorio, nome_laboratorio, termos_participacao, compartilhamento_dados,
                        processamento_dados, uso_imagem, alteracoes_evento, criado_em, atualizado_em
                    ) VALUES (
                        @nome_completo, @cpf, @email, @senha, @nome_social, @celular, @data_nascimento,
                        @pais, @estado, @vinculo_institucional, @empresa, @cargo, @outro_cargo,
                        @lideranca, @servidor_publico, @tipo_participacao, @areas_interesse,
                        @deficiencia, @tipos_deficiencia, @raca, @genero, @inovagov, @comunicacoes,
                        @laboratorio, @nome_laboratorio, @termos_participacao, @compartilhamento_dados,
                        @processamento_dados, @uso_imagem, @alteracoes_evento, @criado_em, @atualizado_em
                    )
                `);

                const result = stmt.run(dados);
                resolve(result.lastInsertRowid);
            } catch (error) {
                console.error('❌ Erro ao criar inscrição:', error);
                reject(error);
            }
        });
    }

    async verificarEmailExiste(email) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    resolve(false); // Se DB não está disponível, assumir que não existe
                    return;
                }

                const stmt = this.db.prepare('SELECT id FROM inscricoes WHERE email = ?');
                const result = stmt.get(email);
                resolve(!!result);
            } catch (error) {
                console.error('❌ Erro ao verificar email:', error);
                resolve(false);
            }
        });
    }

    async verificarCPFExiste(cpf) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    resolve(false); // Se DB não está disponível, assumir que não existe
                    return;
                }

                const stmt = this.db.prepare('SELECT id FROM inscricoes WHERE cpf = ?');
                const result = stmt.get(cpf);
                resolve(!!result);
            } catch (error) {
                console.error('❌ Erro ao verificar CPF:', error);
                resolve(false);
            }
        });
    }

    async buscarInscricaoPorEmail(email) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    resolve(null);
                    return;
                }

                const stmt = this.db.prepare('SELECT * FROM inscricoes WHERE email = ?');
                const result = stmt.get(email);
                
                if (result && result.areas_interesse) {
                    try {
                        result.areas_interesse = JSON.parse(result.areas_interesse);
                    } catch (e) {
                        result.areas_interesse = [];
                    }
                }
                
                if (result && result.tipos_deficiencia) {
                    try {
                        result.tipos_deficiencia = JSON.parse(result.tipos_deficiencia);
                    } catch (e) {
                        result.tipos_deficiencia = [];
                    }
                }

                resolve(result);
            } catch (error) {
                console.error('❌ Erro ao buscar inscrição por email:', error);
                resolve(null);
            }
        });
    }

    async listarInscricoes(page = 1, limit = 50, search = '') {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    console.log('❌ Database não disponível para listar inscrições');
                    resolve({
                        inscricoes: [],
                        paginacao: {
                            page: 1,
                            limit: 50,
                            total: 0,
                            totalPages: 0,
                            hasNext: false,
                            hasPrev: false
                        }
                    });
                    return;
                }

                const offset = (page - 1) * limit;
                
                // Query de busca
                let whereClause = '';
                let params = [];
                
                if (search) {
                    whereClause = 'WHERE nome_completo LIKE ? OR email LIKE ? OR empresa LIKE ?';
                    const searchTerm = `%${search}%`;
                    params = [searchTerm, searchTerm, searchTerm];
                }

                // Contar total
                const countStmt = this.db.prepare(`
                    SELECT COUNT(*) as total FROM inscricoes ${whereClause}
                `);
                
                const countResult = countStmt.get(...params);
                const total = countResult ? countResult.total : 0;

                // Buscar inscrições
                const stmt = this.db.prepare(`
                    SELECT * FROM inscricoes 
                    ${whereClause}
                    ORDER BY criado_em DESC 
                    LIMIT ? OFFSET ?
                `);
                
                const inscricoes = stmt.all(...params, limit, offset);

                // Processar dados
                const inscricoesProcessadas = inscricoes.map(ins => {
                    if (ins.areas_interesse) {
                        try {
                            ins.areas_interesse = JSON.parse(ins.areas_interesse);
                        } catch (e) {
                            ins.areas_interesse = [];
                        }
                    }
                    
                    if (ins.tipos_deficiencia) {
                        try {
                            ins.tipos_deficiencia = JSON.parse(ins.tipos_deficiencia);
                        } catch (e) {
                            ins.tipos_deficiencia = [];
                        }
                    }
                    
                    return ins;
                });

                const totalPages = Math.ceil(total / limit);

                resolve({
                    inscricoes: inscricoesProcessadas,
                    paginacao: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1
                    }
                });

            } catch (error) {
                console.error('❌ Erro ao listar inscrições:', error);
                // Retornar estrutura vazia em caso de erro
                resolve({
                    inscricoes: [],
                    paginacao: {
                        page: 1,
                        limit: 50,
                        total: 0,
                        totalPages: 0,
                        hasNext: false,
                        hasPrev: false
                    }
                });
            }
        });
    }

    async listarTodasInscricoes() {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    console.log('❌ Database não disponível para exportar');
                    resolve([]);
                    return;
                }

                const stmt = this.db.prepare('SELECT * FROM inscricoes ORDER BY criado_em DESC');
                const inscricoes = stmt.all();

                // Processar dados
                const inscricoesProcessadas = inscricoes.map(ins => {
                    if (ins.areas_interesse) {
                        try {
                            ins.areas_interesse = JSON.parse(ins.areas_interesse);
                        } catch (e) {
                            ins.areas_interesse = [];
                        }
                    }
                    
                    if (ins.tipos_deficiencia) {
                        try {
                            ins.tipos_deficiencia = JSON.parse(ins.tipos_deficiencia);
                        } catch (e) {
                            ins.tipos_deficiencia = [];
                        }
                    }
                    
                    return ins;
                });

                resolve(inscricoesProcessadas);
            } catch (error) {
                console.error('❌ Erro ao listar todas inscrições:', error);
                resolve([]);
            }
        });
    }

    async obterEstatisticas() {
        return new Promise((resolve, reject) => {
            try {
                if (!this.verificarConexao()) {
                    console.log('❌ Database não disponível para estatísticas');
                    resolve({
                        total: 0,
                        participacao: [],
                        servidores: [],
                        estados: [],
                        areas: []
                    });
                    return;
                }

                const queries = [
                    {
                        name: 'total',
                        sql: 'SELECT COUNT(*) as count FROM inscricoes'
                    },
                    {
                        name: 'participacao',
                        sql: 'SELECT tipo_participacao, COUNT(*) as count FROM inscricoes WHERE tipo_participacao IS NOT NULL GROUP BY tipo_participacao'
                    },
                    {
                        name: 'servidores',
                        sql: 'SELECT servidor_publico, COUNT(*) as count FROM inscricoes WHERE servidor_publico IS NOT NULL GROUP BY servidor_publico'
                    },
                    {
                        name: 'estados',
                        sql: 'SELECT estado, COUNT(*) as count FROM inscricoes WHERE estado IS NOT NULL GROUP BY estado ORDER BY count DESC LIMIT 10'
                    }
                ];

                const stats = {};

                queries.forEach(query => {
                    try {
                        if (!this.db) {
                            console.log(`⚠️ Database não disponível para query: ${query.name}`);
                            return;
                        }

                        const stmt = this.db.prepare(query.sql);
                        const result = stmt.all();
                        
                        if (query.name === 'total') {
                            stats[query.name] = result[0] ? result[0].count : 0;
                        } else {
                            stats[query.name] = result || [];
                        }
                    } catch (error) {
                        console.error(`❌ Erro na query ${query.name}:`, error);
                        if (query.name === 'total') {
                            stats[query.name] = 0;
                        } else {
                            stats[query.name] = [];
                        }
                    }
                });

                resolve(stats);

            } catch (error) {
                console.error('❌ Erro geral ao obter estatísticas:', error);
                resolve({
                    total: 0,
                    participacao: [],
                    servidores: [],
                    estados: [],
                    areas: []
                });
            }
        });
    }

    fechar() {
        if (this.db) {
            try {
                this.db.close();
                console.log('✅ Database fechado com sucesso');
            } catch (error) {
                console.error('❌ Erro ao fechar database:', error);
            }
        }
    }
}

module.exports = DatabaseManager;