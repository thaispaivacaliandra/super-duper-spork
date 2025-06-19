const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor() {
        const dbName = process.env.DB_NAME || 'inscricoes.db';
        this.dbPath = path.join(__dirname, dbName);
        this.db = null;
        
        console.log(`💾 Database path: ${this.dbPath}`);
    }

    async conectar() {
        return new Promise((resolve, reject) => {
            try {
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('❌ Erro ao conectar com SQLite:', err.message);
                        reject(err);
                    } else {
                        console.log('✅ Conectado ao banco SQLite');
                        resolve();
                    }
                });
            } catch (error) {
                console.error('❌ Erro fatal ao criar banco:', error);
                reject(error);
            }
        });
    }

    async criarTabelas() {
        return new Promise((resolve, reject) => {
            // CORREÇÃO: Schema atualizado para corresponder aos dados do frontend
            const sql = `
                CREATE TABLE IF NOT EXISTS inscricoes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    
                    -- Dados Básicos
                    nome_completo TEXT NOT NULL,
                    cpf TEXT,
                    email TEXT NOT NULL UNIQUE,
                    senha TEXT,
                    nome_social TEXT,
                    
                    -- Contato
                    celular TEXT,
                    data_nascimento DATE,
                    
                    -- Localização
                    pais TEXT,
                    estado TEXT,
                    
                    -- Profissional
                    vinculo_institucional TEXT,
                    empresa TEXT,
                    cargo TEXT,
                    outro_cargo TEXT,
                    lideranca TEXT,
                    servidor_publico TEXT,
                    
                    -- Participação
                    tipo_participacao TEXT,
                    areas_interesse TEXT, -- JSON
                    
                    -- Acessibilidade e Diversidade
                    deficiencia TEXT,
                    tipos_deficiencia TEXT, -- JSON
                    raca TEXT,
                    genero TEXT,
                    
                    -- Rede e Comunicação
                    inovagov TEXT,
                    comunicacoes TEXT,
                    laboratorio TEXT,
                    nome_laboratorio TEXT,
                    
                    -- Termos e Autorizações
                    termos_participacao BOOLEAN,
                    compartilhamento_dados BOOLEAN,
                    processamento_dados BOOLEAN,
                    uso_imagem BOOLEAN,
                    alteracoes_evento BOOLEAN,
                    
                    -- Metadados
                    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.run(sql, (err) => {
                if (err) {
                    console.error('❌ Erro ao criar tabela:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Tabela de inscrições verificada/criada');
                    resolve();
                }
            });
        });
    }

    async criarInscricao(dadosInscricao) {
        return new Promise((resolve, reject) => {
            // CORREÇÃO: Receber dados com nomes corretos do frontend
            const {
                nomeCompleto, cpf, email, senha, nomeSocial,
                celular, dataNascimento, pais, estado,
                vinculoInstitucional, empresa, cargo, outroCargo,
                lideranca, servidor, participacao, areasInteresse,
                deficiencia, tiposDeficiencia, raca, genero,
                inovagov, comunicacoes, laboratorio, nomeLaboratorio,
                termosParticipacao, compartilhamentoDados, processamentoDados,
                usoImagem, alteracoesEvento
            } = dadosInscricao;

            // Validações básicas
            if (!nomeCompleto || !email) {
                return resolve({
                    sucesso: false,
                    mensagem: 'Nome completo e email são obrigatórios'
                });
            }

            // CORREÇÃO: SQL com nomes de campos corretos
            const sql = `
                INSERT INTO inscricoes (
                    nome_completo, cpf, email, senha, nome_social,
                    celular, data_nascimento, pais, estado,
                    vinculo_institucional, empresa, cargo, outro_cargo,
                    lideranca, servidor_publico, tipo_participacao, areas_interesse,
                    deficiencia, tipos_deficiencia, raca, genero,
                    inovagov, comunicacoes, laboratorio, nome_laboratorio,
                    termos_participacao, compartilhamento_dados, processamento_dados,
                    uso_imagem, alteracoes_evento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                nomeCompleto, cpf, email, senha, nomeSocial,
                celular, dataNascimento, pais, estado,
                vinculoInstitucional, empresa, cargo, outroCargo,
                lideranca, servidor, participacao, 
                areasInteresse ? JSON.stringify(areasInteresse) : null,
                deficiencia, 
                tiposDeficiencia ? JSON.stringify(tiposDeficiencia) : null,
                raca, genero, inovagov, comunicacoes, laboratorio, nomeLaboratorio,
                termosParticipacao ? 1 : 0,
                compartilhamentoDados ? 1 : 0,
                processamentoDados ? 1 : 0,
                usoImagem ? 1 : 0,
                alteracoesEvento ? 1 : 0
            ];

            console.log('📝 Inserindo dados:', {
                nome: nomeCompleto,
                email: email,
                campos_total: params.length
            });

            this.db.run(sql, params, function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        resolve({
                            sucesso: false,
                            mensagem: 'Este email já está cadastrado'
                        });
                    } else {
                        console.error('❌ Erro ao inserir inscrição:', err.message);
                        console.error('📊 SQL:', sql);
                        console.error('📊 Params:', params);
                        resolve({
                            sucesso: false,
                            mensagem: 'Erro ao salvar inscrição: ' + err.message
                        });
                    }
                } else {
                    console.log('✅ Inscrição salva com ID:', this.lastID);
                    resolve({
                        sucesso: true,
                        id: this.lastID,
                        mensagem: 'Inscrição realizada com sucesso'
                    });
                }
            });
        });
    }

    async listarInscricoes(page = 1, limit = 50, search = '') {
        return new Promise((resolve, reject) => {
            const offset = (page - 1) * limit;
            
            let sql = 'SELECT * FROM inscricoes';
            let countSql = 'SELECT COUNT(*) as total FROM inscricoes';
            let params = [];

            if (search) {
                const searchPattern = `%${search}%`;
                sql += ' WHERE nome_completo LIKE ? OR email LIKE ? OR empresa LIKE ?';
                countSql += ' WHERE nome_completo LIKE ? OR email LIKE ? OR empresa LIKE ?';
                params = [searchPattern, searchPattern, searchPattern];
            }

            sql += ' ORDER BY criado_em DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            // Primeiro buscar o total
            this.db.get(countSql, search ? [params[0], params[1], params[2]] : [], (err, countResult) => {
                if (err) {
                    console.error('❌ Erro ao contar inscrições:', err.message);
                    return resolve({
                        sucesso: false,
                        mensagem: 'Erro ao buscar dados'
                    });
                }

                // Depois buscar os dados
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        console.error('❌ Erro ao listar inscrições:', err.message);
                        resolve({
                            sucesso: false,
                            mensagem: 'Erro ao buscar inscrições'
                        });
                    } else {
                        const total = countResult.total;
                        const totalPages = Math.ceil(total / limit);

                        // Converter campos JSON de volta para objetos
                        const dadosProcessados = rows.map(row => {
                            try {
                                if (row.areas_interesse) {
                                    row.areas_interesse = JSON.parse(row.areas_interesse);
                                }
                                if (row.tipos_deficiencia) {
                                    row.tipos_deficiencia = JSON.parse(row.tipos_deficiencia);
                                }
                            } catch (e) {
                                console.warn('⚠️ Erro ao processar JSON:', e.message);
                            }
                            return row;
                        });

                        resolve({
                            sucesso: true,
                            dados: dadosProcessados,
                            paginacao: {
                                page: page,
                                limit: limit,
                                total: total,
                                totalPages: totalPages,
                                hasNext: page < totalPages,
                                hasPrev: page > 1
                            }
                        });
                    }
                });
            });
        });
    }

    async obterEstatisticas() {
        return new Promise((resolve, reject) => {
            const estatisticas = {};

            const queries = [
                {
                    key: 'totalInscricoes',
                    sql: 'SELECT COUNT(*) as count FROM inscricoes'
                },
                {
                    key: 'inscricoesPorEmpresa',
                    sql: 'SELECT empresa, COUNT(*) as count FROM inscricoes WHERE empresa IS NOT NULL AND empresa != "" GROUP BY empresa ORDER BY count DESC LIMIT 10'
                },
                {
                    key: 'tipoParticipacao',
                    sql: 'SELECT tipo_participacao, COUNT(*) as count FROM inscricoes WHERE tipo_participacao IS NOT NULL GROUP BY tipo_participacao'
                },
                {
                    key: 'vinculoInstitucional',
                    sql: 'SELECT vinculo_institucional, COUNT(*) as count FROM inscricoes WHERE vinculo_institucional IS NOT NULL GROUP BY vinculo_institucional'
                },
                {
                    key: 'inscricoesPorDia',
                    sql: 'SELECT DATE(criado_em) as data, COUNT(*) as count FROM inscricoes GROUP BY DATE(criado_em) ORDER BY data DESC LIMIT 30'
                },
                {
                    key: 'diversidade',
                    sql: 'SELECT raca, COUNT(*) as count FROM inscricoes WHERE raca IS NOT NULL GROUP BY raca'
                }
            ];

            let completed = 0;
            
            queries.forEach(query => {
                this.db.all(query.sql, [], (err, rows) => {
                    if (err) {
                        console.error(`❌ Erro na query ${query.key}:`, err.message);
                        estatisticas[query.key] = [];
                    } else {
                        if (query.key === 'totalInscricoes') {
                            estatisticas[query.key] = rows[0].count;
                        } else {
                            estatisticas[query.key] = rows;
                        }
                    }
                    
                    completed++;
                    if (completed === queries.length) {
                        resolve({
                            sucesso: true,
                            dados: estatisticas
                        });
                    }
                });
            });
        });
    }

    async deletarInscricao(id) {
        return new Promise((resolve, reject) => {
            if (!id || isNaN(id)) {
                return resolve({
                    sucesso: false,
                    mensagem: 'ID inválido'
                });
            }

            const sql = 'DELETE FROM inscricoes WHERE id = ?';
            
            this.db.run(sql, [id], function(err) {
                if (err) {
                    console.error('❌ Erro ao deletar inscrição:', err.message);
                    resolve({
                        sucesso: false,
                        mensagem: 'Erro ao deletar inscrição'
                    });
                } else if (this.changes === 0) {
                    resolve({
                        sucesso: false,
                        mensagem: 'Inscrição não encontrada'
                    });
                } else {
                    resolve({
                        sucesso: true,
                        mensagem: 'Inscrição deletada com sucesso'
                    });
                }
            });
        });
    }

    async exportarDados(formato = 'json') {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM inscricoes ORDER BY criado_em DESC';
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Erro ao exportar dados:', err.message);
                    resolve({
                        sucesso: false,
                        mensagem: 'Erro ao exportar dados'
                    });
                } else {
                    if (formato === 'csv') {
                        if (rows.length === 0) {
                            return resolve({
                                sucesso: true,
                                dados: 'Nenhum dado encontrado'
                            });
                        }

                        const headers = Object.keys(rows[0]).join(',');
                        const csvData = rows.map(row => 
                            Object.values(row).map(val => 
                                typeof val === 'string' && val.includes(',') ? `"${val}"` : val
                            ).join(',')
                        ).join('\n');
                        
                        resolve({
                            sucesso: true,
                            dados: `${headers}\n${csvData}`
                        });
                    } else {
                        // Processar JSON para campos que foram armazenados como string
                        const dadosProcessados = rows.map(row => {
                            try {
                                if (row.areas_interesse && typeof row.areas_interesse === 'string') {
                                    row.areas_interesse = JSON.parse(row.areas_interesse);
                                }
                                if (row.tipos_deficiencia && typeof row.tipos_deficiencia === 'string') {
                                    row.tipos_deficiencia = JSON.parse(row.tipos_deficiencia);
                                }
                            } catch (e) {
                                console.warn('⚠️ Erro ao processar JSON no export:', e.message);
                            }
                            return row;
                        });

                        resolve({
                            sucesso: true,
                            dados: JSON.stringify(dadosProcessados, null, 2)
                        });
                    }
                }
            });
        });
    }

    fechar() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Erro ao fechar banco:', err.message);
                } else {
                    console.log('✅ Banco de dados fechado');
                }
            });
        }
    }
}

module.exports = Database;