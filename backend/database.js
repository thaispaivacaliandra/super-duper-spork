const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // CORREÇÃO: usar sqlite3 em vez de sqlite

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, process.env.DB_NAME || 'inscricoes.db');
        this.db = null;
        this.maxConnections = process.env.MAX_DB_CONNECTIONS || 10;
    }
    
    // Implementar pool de conexões para alta concorrência
    async getConnection() {
        // Lógica de pool aqui
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
            const sql = `
                CREATE TABLE IF NOT EXISTS inscricoes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    telefone TEXT,
                    orgao TEXT,
                    cargo TEXT,
                    expectativas TEXT,
                    experiencia_ai TEXT,
                    ferramenta_ai TEXT,
                    interesse_workshop TEXT,
                    tema_interesse TEXT,
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
            const {
                nome, email, telefone, orgao, cargo, expectativas,
                experiencia_ai, ferramenta_ai, interesse_workshop, tema_interesse
            } = dadosInscricao;

            // Validações básicas
            if (!nome || !email) {
                return resolve({
                    sucesso: false,
                    mensagem: 'Nome e email são obrigatórios'
                });
            }

            const sql = `
                INSERT INTO inscricoes (
                    nome, email, telefone, orgao, cargo, expectativas,
                    experiencia_ai, ferramenta_ai, interesse_workshop, tema_interesse
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                nome, email, telefone, orgao, cargo, expectativas,
                experiencia_ai, ferramenta_ai, interesse_workshop, tema_interesse
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        resolve({
                            sucesso: false,
                            mensagem: 'Este email já está cadastrado'
                        });
                    } else {
                        console.error('❌ Erro ao inserir inscrição:', err.message);
                        resolve({
                            sucesso: false,
                            mensagem: 'Erro ao salvar inscrição'
                        });
                    }
                } else {
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
                sql += ' WHERE nome LIKE ? OR email LIKE ? OR orgao LIKE ?';
                countSql += ' WHERE nome LIKE ? OR email LIKE ? OR orgao LIKE ?';
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

                        resolve({
                            sucesso: true,
                            dados: rows,
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

            // Queries para diferentes estatísticas
            const queries = [
                {
                    key: 'totalInscricoes',
                    sql: 'SELECT COUNT(*) as count FROM inscricoes'
                },
                {
                    key: 'inscricoesPorOrgao',
                    sql: 'SELECT orgao, COUNT(*) as count FROM inscricoes WHERE orgao IS NOT NULL GROUP BY orgao ORDER BY count DESC LIMIT 10'
                },
                {
                    key: 'experienciaAI',
                    sql: 'SELECT experiencia_ai, COUNT(*) as count FROM inscricoes WHERE experiencia_ai IS NOT NULL GROUP BY experiencia_ai'
                },
                {
                    key: 'interesseWorkshop',
                    sql: 'SELECT interesse_workshop, COUNT(*) as count FROM inscricoes WHERE interesse_workshop IS NOT NULL GROUP BY interesse_workshop'
                },
                {
                    key: 'inscricoesPorDia',
                    sql: 'SELECT DATE(criado_em) as data, COUNT(*) as count FROM inscricoes GROUP BY DATE(criado_em) ORDER BY data DESC LIMIT 30'
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
                        // Converter para CSV
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
                        // JSON (padrão)
                        resolve({
                            sucesso: true,
                            dados: JSON.stringify(rows, null, 2)
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