const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        try {
            // Criar/conectar ao banco
            this.db = await open({
                filename: path.join(__dirname, 'inscricoes.db'),
                driver: sqlite3.Database
            });

            console.log('📊 Banco de dados conectado!');
            
            // Criar tabela se não existir
            await this.createTable();
            
        } catch (error) {
            console.error('❌ Erro ao conectar banco:', error);
        }
    }

    async createTable() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS inscricoes (
                id TEXT PRIMARY KEY,
                data_inscricao TEXT NOT NULL,
                nome_completo TEXT NOT NULL,
                cpf TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                senha TEXT NOT NULL,
                nome_social TEXT,
                celular TEXT,
                data_nascimento TEXT,
                pais TEXT,
                estado TEXT,
                vinculo_institucional TEXT,
                empresa TEXT,
                cargo TEXT,
                outro_cargo TEXT,
                lideranca TEXT,
                servidor TEXT,
                participacao TEXT,
                areas_interesse TEXT,
                deficiencia TEXT,
                tipos_deficiencia TEXT,
                raca TEXT,
                genero TEXT,
                inovagov TEXT,
                comunicacoes TEXT,
                laboratorio TEXT,
                nome_laboratorio TEXT,
                termos_participacao BOOLEAN,
                compartilhamento_dados BOOLEAN,
                processamento_dados BOOLEAN,
                uso_imagem BOOLEAN,
                alteracoes_evento BOOLEAN,
                status TEXT DEFAULT 'Concluída',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.db.exec(createTableSQL);
        console.log('✅ Tabela de inscrições criada/verificada!');
    }

    async salvarInscricao(dados) {
        try {
            const sql = `
                INSERT INTO inscricoes (
                    id, data_inscricao, nome_completo, cpf, email, senha,
                    nome_social, celular, data_nascimento, pais, estado,
                    vinculo_institucional, empresa, cargo, outro_cargo,
                    lideranca, servidor, participacao, areas_interesse,
                    deficiencia, tipos_deficiencia, raca, genero,
                    inovagov, comunicacoes, laboratorio, nome_laboratorio,
                    termos_participacao, compartilhamento_dados,
                    processamento_dados, uso_imagem, alteracoes_evento, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                dados.id,
                dados.dataInscricao,
                dados.nomeCompleto,
                dados.cpf,
                dados.email,
                dados.senha,
                dados.nomeSocial || '',
                dados.celular || '',
                dados.dataNascimento || '',
                dados.pais || '',
                dados.estado || '',
                dados.vinculoInstitucional || '',
                dados.empresa || '',
                dados.cargo || '',
                dados.outroCargo || '',
                dados.lideranca || '',
                dados.servidor || '',
                dados.participacao || '',
                JSON.stringify(dados.areasInteresse || []),
                dados.deficiencia || '',
                JSON.stringify(dados.tiposDeficiencia || []),
                dados.raca || '',
                dados.genero || '',
                dados.inovagov || '',
                dados.comunicacoes || '',
                dados.laboratorio || '',
                dados.nomeLaboratorio || '',
                dados.termosParticipacao || false,
                dados.compartilhamentoDados || false,
                dados.processamentoDados || false,
                dados.usoImagem || false,
                dados.alteracoesEvento || false,
                dados.status || 'Concluída'
            ];

            const result = await this.db.run(sql, params);
            console.log(`✅ Inscrição salva no banco! ID: ${dados.id}`);
            return result;

        } catch (error) {
            console.error('❌ Erro ao salvar no banco:', error);
            throw error;
        }
    }

    async listarInscricoes() {
        try {
            const sql = 'SELECT * FROM inscricoes ORDER BY created_at DESC';
            const inscricoes = await this.db.all(sql);
            return inscricoes;
        } catch (error) {
            console.error('❌ Erro ao listar inscrições:', error);
            throw error;
        }
    }

    async getEstatisticas() {
        try {
            const stats = {};
            
            // Total de inscrições
            const total = await this.db.get('SELECT COUNT(*) as total FROM inscricoes');
            stats.total = total.total;
            
            // Por participação
            const participacao = await this.db.all(`
                SELECT participacao, COUNT(*) as count 
                FROM inscricoes 
                WHERE participacao IS NOT NULL 
                GROUP BY participacao
            `);
            stats.participacao = participacao;
            
            // Por servidor público
            const servidores = await this.db.all(`
                SELECT servidor, COUNT(*) as count 
                FROM inscricoes 
                WHERE servidor IS NOT NULL 
                GROUP BY servidor
            `);
            stats.servidores = servidores;
            
            return stats;
        } catch (error) {
            console.error('❌ Erro ao gerar estatísticas:', error);
            throw error;
        }
    }
}

module.exports = Database;