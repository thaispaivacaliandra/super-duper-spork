const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'inscricoes.db');
        this.db = null;
        this.conectar();
    }

    conectar() {
        return new Promise((resolve, reject) => {
            console.log('💾 Database path:', this.dbPath);
            
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Erro ao conectar com o banco:', err);
                    this.db = null;
                    reject(err);
                } else {
                    console.log('✅ Banco de dados conectado com sucesso');
                    this.criarTabelas();
                    resolve();
                }
            });
        });
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
        if (!this.db) {
            console.error('❌ Não foi possível criar tabelas - DB não conectado');
            return;
        }

        const sql = `
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
        `;

        this.db.run(sql, (err) => {
            if (err) {
                console.error('❌ Erro ao criar tabelas:', err);
            } else {
                console.log('✅ Tabelas criadas/verificadas com sucesso');
            }
        });
    }

    async criarInscricao(dados) {
        return new Promise((resolve, reject) => {
            if (!this.verificarConexao()) {
                reject(new Error('Database não disponível'));
                return;
            }

            // Converter arrays para JSON string
            if (Array.isArray(dados.areas_interesse)) {
                dados.areas_interesse = JSON.stringify(dados.areas_interesse);
            }
            if (Array.isArray(dados.tipos_deficiencia)) {
                dados.tipos_deficiencia = JSON.stringify(dados.tipos_deficiencia);
            }

            const sql = `
                INSERT INTO inscricoes (
                    nome_completo, cpf, email, senha, nome_social, celular, data_nascimento,
                    pais, estado, vinculo_institucional, empresa, cargo, outro_cargo,
                    lideranca, servidor_publico, tipo_participacao, areas_interesse,
                    deficiencia, tipos_deficiencia, raca, genero, inovagov, comunicacoes,
                    laboratorio, nome_laboratorio, termos_participacao, compartilhamento_dados,
                    processamento_dados, uso_imagem, alteracoes_evento, criado_em, atualizado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                dados.nome_completo, dados.cpf, dados.email, dados.senha, dados.nome_social,
                dados.celular, dados.data_nascimento, dados.pais, dados.estado,
                dados.vinculo_institucional, dados.empresa, dados.cargo, dados.outro_cargo,
                dados.lideranca, dados.servidor_publico, dados.tipo_participacao,
                dados.areas_interesse, dados.deficiencia, dados.tipos_deficiencia,
                dados.raca, dados.genero, dados.inovagov, dados.comunicacoes,
                dados.laboratorio, dados.nome_laboratorio, dados.termos_participacao,
                dados.compartilhamento_dados, dados.processamento_dados, dados.uso_imagem,
                dados.alteracoes_evento, dados.criado_em, dados.atualizado_em
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ Erro ao criar inscrição:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async verificarEmailExiste(email) {
        return new Promise((resolve, reject) => {
            if (!this.verificarConexao()) {
                resolve(false);
                return;
            }

            const sql = 'SELECT id FROM inscricoes WHERE email = ?';
            this.db.get(sql, [email], (err, row) => {
                if (err) {
                    console.error('❌ Erro ao verificar email:', err);
                    resolve(false);
                } else {
                    resolve(!!row);
                }
            });
        });
    }

    async verificarCPFExiste(cpf) {
        return new Promise((resolve, reject) => {
            if (!this.verificarConexao()) {
                resolve(false);
                return;
            }

            const sql = 'SELECT id FROM inscricoes WHERE cpf = ?';
            this.db.get(sql, [cpf], (err, row) => {
                if (err) {
                    console.error('❌ Erro ao verificar CPF:', err);
                    resolve(false);
                } else {
                    resolve(!!row);
                }
            });
        });
    }

    async buscarInscricaoPorEmail(email) {
        return new Promise((resolve, reject) => {
            if (!this.verificarConexao()) {
                resolve(null);
                return;
            }

            const sql = 'SELECT * FROM inscricoes WHERE email = ?';
            this.db.get(sql, [email], (err, row) => {
                if (err) {
                    console.error('❌ Erro ao buscar inscrição por email:', err);
                    resolve(null);
                } else {
                    if (row && row.areas_interesse) {
                        try {
                            row.areas_interesse = JSON.parse(row.areas_interesse);
                        } catch (e) {
                            row.areas_interesse = [];
                        }
                    }
                    
                    if (row && row.tipos_deficiencia) {
                        try {
                            row.tipos_deficiencia = JSON.parse(row.tipos_deficiencia);
                        } catch (e) {
                            row.tipos_deficiencia = [];
                        }
                    }
                    resolve(row);
                }
            });
        });
    }

    async listarInscricoes(page = 1, limit = 50, search = '') {
        return new Promise((resolve, reject) => {
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
            const countSql = `SELECT COUNT(*) as total FROM inscricoes ${whereClause}`;
            
            this.db.get(countSql, params, (err, countResult) => {
                if (err) {
                    console.error('❌ Erro ao contar inscrições:', err);
                    resolve({
                        inscricoes: [],
                        paginacao: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
                    });
                    return;
                }

                const total = countResult ? countResult.total : 0;

                // Buscar inscrições
                const sql = `
                    SELECT * FROM inscricoes 
                    ${whereClause}
                    ORDER BY criado_em DESC 
                    LIMIT ? OFFSET ?
                `;
                
                const queryParams = [...params, limit, offset];
                
                this.db.all(sql, queryParams, (err, rows) => {
                    if (err) {
                        console.error('❌ Erro ao buscar inscrições:', err);
                        resolve({
                            inscricoes: [],
                            paginacao: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
                        });
                        return;
                    }

                    // Processar dados
                    const inscricoesProcessadas = rows.map(ins => {
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
                });
            });
        });
    }

    async listarTodasInscricoes() {
        return new Promise((resolve, reject) => {
            if (!this.verificarConexao()) {
                console.log('❌ Database não disponível para exportar');
                resolve([]);
                return;
            }

            const sql = 'SELECT * FROM inscricoes ORDER BY criado_em DESC';
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Erro ao listar todas inscrições:', err);
                    resolve([]);
                } else {
                    // Processar dados
                    const inscricoesProcessadas = rows.map(ins => {
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
                }
            });
        });
    }

    async obterEstatisticas() {
        return new Promise((resolve, reject) => {
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

            // Estatísticas básicas
            const sql = 'SELECT COUNT(*) as total FROM inscricoes';
            
            this.db.get(sql, [], (err, result) => {
                if (err) {
                    console.error('❌ Erro ao obter estatísticas:', err);
                    resolve({
                        total: 0,
                        participacao: [],
                        servidores: [],
                        estados: [],
                        areas: []
                    });
                } else {
                    const total = result ? result.total : 0;
                    
                    resolve({
                        total: total,
                        participacao: [],
                        servidores: [],
                        estados: [],
                        areas: []
                    });
                }
            });
        });
    }

    fechar() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Erro ao fechar database:', err);
                } else {
                    console.log('✅ Database fechado com sucesso');
                }
            });
        }
    }
}

module.exports = Database;