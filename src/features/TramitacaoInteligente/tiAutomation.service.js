const axios = require('axios');
const cheerio = require('cheerio');
const settingsService = require('../Settings/settings.service');

class TIAutomationService {
    constructor() {
        this.client = axios.create({
            baseURL: 'https://planilha.tramitacaointeligente.com.br',
            withCredentials: true,
            maxRedirects: 0, // We want to handle 303/302 manually to capture cookies
            validateStatus: (status) => status >= 200 && status < 400
        });
        this.cookies = [];
    }

    async getCredentials() {
        const email = process.env.TI_USER_EMAIL;
        const password = process.env.TI_USER_PASSWORD;
        if (!email || !password) throw new Error('TI credentials not found in environment');
        return { email, password };
    }

    async login() {
        try {
            console.log('📡 TI Automation: Starting login flow...');

            // 1. Get initial login page to grab CSRF token
            const initialPage = await this.client.get('/usuarios/login');
            const $ = cheerio.load(initialPage.data);
            const authenticityToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="authenticity_token"]').val();

            this.updateCookies(initialPage.headers['set-cookie']);

            if (!authenticityToken) {
                throw new Error('Could not find authenticity_token in login page');
            }

            // 2. Perform Login POST
            const { email, password } = await this.getCredentials();

            const params = new URLSearchParams();
            params.append('authenticity_token', authenticityToken);
            params.append('user[email]', email);
            params.append('user[password]', password);
            params.append('user[remember_me]', '1');

            const loginRes = await this.client.post('/usuarios/login', params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': this.getCookieString(),
                    'Referer': 'https://planilha.tramitacaointeligente.com.br/usuarios/login'
                }
            });

            this.updateCookies(loginRes.headers['set-cookie']);

            console.log('✅ TI Automation: Login successful (Status 303/200)');
            return true;
        } catch (error) {
            console.error('❌ TI Automation Login Error:', error.response?.data || error.message);
            throw new Error(`TI Login failed: ${error.message}`);
        }
    }

    async generateDocuments(customerIid, payloadTemplate) {
        try {
            // Ensure logged in
            await this.login();

            console.log(`📡 TI Automation: Generating documents for Customer IID: ${customerIid}...`);

            // 1. Get a fresh CSRF token from a protected page (e.g., dashboard or the 'new' page)
            const generatorPage = await this.client.get('/documentos/geradores/novo', {
                headers: { 'Cookie': this.getCookieString() }
            });
            const $ = cheerio.load(generatorPage.data);
            const csrfToken = $('meta[name="csrf-token"]').attr('content');

            // 2. Post generation request
            const res = await this.client.post('/documentos/geradores/lotes-de-documentos', payloadTemplate, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Cookie': this.getCookieString(),
                    'X-CSRF-Token': csrfToken,
                    'Referer': 'https://planilha.tramitacaointeligente.com.br/documentos/geradores/novo'
                }
            });

            console.log('✅ TI Automation: Documents generated successfully!');
            return res.data;
        } catch (error) {
            console.error('❌ TI Automation Generation Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendToSignatures(envelopeIid, payload) {
        try {
            console.log(`📡 TI Automation: Sending Envelope ${envelopeIid} for signatures...`);

            // Get CSRF again just in case
            const editPage = await this.client.get(`/assinaturas/${envelopeIid}/editar`, {
                headers: { 'Cookie': this.getCookieString() }
            });
            const $ = cheerio.load(editPage.data);
            const csrfToken = $('meta[name="csrf-token"]').attr('content');

            const res = await this.client.patch(`/assinaturas/${envelopeIid}`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Cookie': this.getCookieString(),
                    'X-CSRF-Token': csrfToken,
                    'Referer': `https://planilha.tramitacaointeligente.com.br/assinaturas/${envelopeIid}/editar`
                }
            });

            console.log('✅ TI Automation: Sent for signatures!');
            return res.data;
        } catch (error) {
            console.error('❌ TI Automation Signature Error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Helper to manage cookies
    updateCookies(newCookies) {
        if (!newCookies) return;
        newCookies.forEach(cookie => {
            const parts = cookie.split(';');
            const kv = parts[0];
            const name = kv.split('=')[0];

            // Filter out existing and update
            this.cookies = this.cookies.filter(c => !c.startsWith(`${name}=`));
            this.cookies.push(kv);
        });
    }

    getCookieString() {
        return this.cookies.join('; ');
    }

    // Workflow principal para o escritório
    async generateFullPackage(chat) {
        if (!chat.tramitacaoCustomerId) throw new Error('Cliente ainda não está vinculado ao TI');

        const payload = {
            customer_iid: chat.tramitacaoCustomerId,
            generator_name: "Batch",
            generator_params: {
                Procuracao: {
                    outorgados: "<b>ADVOCACIATRABALHISTAPREVIGMAILCOM</b> , OAB nº 397.243/SP, integrante da sociedade de advogados ESCRITÓRIO DE ADVOCACIATRABALHISTAPREVI@GMAILCOM, CNPJ nº 46.703.584/0001-62, OAB nº 397.42, com endereço profissional na Rua Wally Selma Sara Leyser nº 42, Jardim Vaz de Lima, São Paulo/SP, CEP 05833400.",
                    poderes_especificos: {
                        requerer_beneficios_previdenciarios: true,
                        copias_pa: true,
                        acessar_sistemas_inss: true,
                        agendamento_servicos: true,
                        receber_dar_quitacao: true,
                        levantar_valores: true,
                        obter_extratos_contas_judiciais: true,
                        expedir_documentos_certidoes: true,
                        obter_documentos_ppp_laudo: true,
                        obter_documentos_medicos: false,
                        firmar_compromisso: true,
                        receber_citacao: false,
                        confessar: true,
                        reconhecer_procedencia_pedido: true,
                        transigir: true,
                        desistir: true,
                        renunciar_direito: true,
                        assinar_declaracao_hipossuficiencia: true,
                        assinar_autodeclaracao_rural: true,
                        substabelecer: true
                    },
                    poderes_gerais: "judicial_e_administrativa",
                    como_chamar_os_outorgados: "outorgado"
                },
                ContratoDeHonorarios: {
                    contratados: "<b>SHEILA DIAS DE ARAUJO CANDIDO</b> , OAB nº 397.243/SP, integrante da sociedade de advogados SHEILA ARAUJO ADVOCACIA ESPECIALIZAD, CNPJ nº 46.703.584/0001-62, OAB nº XXXXXX, com endereço profissional na Rua Wally Selma Sara Leyser nº 42, Jardim Vaz de Lima, São Paulo/SP, CEP 05833400.",
                    corpo_do_contrato: this.getContractBody(chat.city || 'São Paulo'),
                    placeholders: {
                        corpo_do_contrato: this.getContractBodyTemplate()
                    }
                },
                TermoDeRenuncia: {},
                DeclaracaoDePobreza: {},
                DeclaracaoDeNaoRecebimentoDeBeneficio: {
                    recebe: false,
                    tipo_de_beneficio: null,
                    relacao_com_o_instituidor_era_conjuge: null,
                    ente_de_origem: null,
                    tipo_de_servidor: null,
                    data_de_inicio_do_beneficio: "",
                    nome_do_orgao: null,
                    ultima_remuneracao_bruta: null,
                    mes_ano_da_ultima_remuneracao: ""
                }
            },
            generator_action: "send_to_signatures",
            generators_ui_version: 2
        };

        const result = await this.generateDocuments(chat.tramitacaoCustomerId, payload);
        return result;
    }

    getContractBody(city) {
        let body = this.getContractBodyTemplate();
        return body.replace(/Comarca de \*\*\*/g, `Comarca de ${city}`);
    }

    getContractBodyTemplate() {
        return `<p><b>1) DO OBJETO</b></p>\n\n<p>A parte contratada se obriga a prestar os serviços profissionais para defender os direitos da parte contratante, <b>patrocinando pedido administrativo e/ou ação judicial</b>, tanto em primeiro grau quanto nas instâncias superiores (conforme análise de cabimento da parte contratada), não estando incluídos os serviços de sustentação oral, recurso extraordinário, especial, agravo de instrumento, incidentes de uniformização dos ritos dos Juizados Especiais, ações autônomas de impugnação de decisões como mandado de segurança e outros serviços advocatícios.</p>\n\n<p><b>2) DAS OBRIGAÇÕES DA PARTE CONTRATADA</b></p>\n\n<p>A parte contratada se compromete a empregar todo seu conhecimento jurídico e empenho a fim de obter o melhor resultado possível, em consonância com os objetivos da parte contratante; ainda assim, a parte contratante declara ciência de que se trata de obrigação de meio, e não de resultado, inexistindo garantia de resultado favorável.</p>\n\n<p><b>3) DAS OBRIGAÇÕES DA PARTE CONTRATANTE</b></p>\n\n<p>A parte contratante, visando ao melhor resultado possível do processo previdenciário, compromete-se a:</p>\n\n<ol>\n\t<li>Fornecer todas as informações e documentos necessários ao deslinde processual;</li>\n\t<li>Manter seus dados atualizados perante a parte contratada, tendo a obrigação de informar imediatamente toda e qualquer alteração de endereço, telefone ou e-mail;</li>\n\t<li>Caso necessite de prova testemunhal, indicar 3 testemunhas até 30 dias antes da audiência, justificação judicial ou justificação administrativa;</li>\n\t<li>Comparecer em todas as audiências, justificações judiciais ou justificações administrativas;</li>\n\t<li>Notificar a parte contratada de qualquer alteração contributiva, como: desligamento do emprego, novo emprego, modificação nas contribuições como contribuinte individual, recebimento de qualquer benefício previdenciário, resultado de reclamação trabalhista, etc.;</li>\n</ol>\n\n<p><b>4) DOS HONORÁRIOS ADVOCATÍCIOS</b></p>\n\n<p>A parte contratante se obriga a pagar à parte contratada, a título de honorários advocatícios:</p>\n\n<p><b>a)</b> Havendo a procedência do pedido na fase administrativa, mesmo que parcial, o equivalente a <u><b>30% (trinta por cento)</b></u> sobre os valores que a parte contratante receber;</p>\n\n<p><b>b)</b> No caso de atuação na esfera judicial, havendo a procedência do pedido, ainda que parcial, o equivalente a <u><b>30% (trinta por cento)</b></u> sobre o proveito econômico do processo;</p>\n\n<p><b>c)</b>&nbsp;Caso a decisão judicial conceda apenas a averbação do tempo de contribuição, sem a concessão de benefício previdenciário, o valor de <b>1/12 (um doze avos) do salário-mínimo</b>&nbsp;por mês averbado a mais da decisão administrativa, com vencimento no trânsito em julgado do processo de conhecimento. O valor do salário-mínimo a ser considerado é aquele&nbsp;vigente<b>&nbsp;</b>na época do trânsito em julgado da decisão favorável.</p>\n\n<p>Parágrafo primeiro: O proveito econômico, sobre o qual incidem os honorários advocatícios, é o valor brute composto por todas as parcelas vencidas e parcelas vincendas, juros e atualização monetária calculadas até a data do trânsito em julgado, sem dedução de benefícios previdenciários já recebidos, sejam decorrentes do presente processo ou de outros processos administrativos ou judiciais. Desta forma, proveito econômico não se confunde com o valor líquido recebido por meio de RPV ou Precatório.</p>\n\n<p>Parágrafo segundo: Caso a decisão judicial ou administrativa oportunize à parte contratante escolher entre a averbação do tempo de contribuição ou a concessão do benefício previdenciário, e esta escolha a averbação do tempo de contribuição, serão devidos à parte contratada os honorários advocatícios, segundo itens “a” e “b” desta cláusula. Para tanto, será considerado proveito econômico o valor das parcelas vencidas e vincendas até o trânsito em julgado como se a parte contratante tivesse optado pela implantação do benefício, com vencimento na data da opção da parte contratante.</p>\n\n<p>Parágheiro terceiro: Os honorários incluídos na condenação por arbitramento ou sucumbência pertencem à parte contratada, sem qualquer redução dos honorários contratuais.</p>\n\n<p>Parágrafo quarto: Fica estipulado entre as partes que, caso a parte contratada optar em destacar os honorários advocatícios separando a parte do valor devido cobrado da parte contratante, na referida ação, juntará o contrato de prestação de serviço no processo para que se cumpra sua finalidade do contrato.</p>\n\n<p>Parágrafo quinto: Todos os valores descritos nas alíneas acima não poderão ser compensados.</p>\n\n<p>Parágrafo sexto: O valor dos honorários advocatícios contratados poderá ser retido ao final do processo judicial, na expedição da requisição de pagamento ou no local onde forem depositados os valores advindos da condenação.</p>\n\n<p>Parágrafo sétimo:<i> </i>Não estão inclusos nos valores elencados nas alíneas, o montante entregue pelo contratante para ressarcimento de custas, despesas processuais e honorários pagos para a parte contrária.</p>\n\n\n<p><b>5) DAS CUSTAS E DESPESAS JUDICIAIS</b></p>\n\n<p>São de responsabilidade da parte contratante as custas e despesas judiciais, inclusive honorários de outro advogado contratado para acompanhar precatórias ou diligências em comarca diversa do processo e para interposição de recurso nas instâncias superiores.</p>\n\n<p>Parágrafo único: Se a parte contratante desistir ou abandonar a causa, as importâncias entregues para as custas e emolumentos judiciais ou extrajudiciais não serão devolvidas, sendo que tais valores serão cobrados além dos honorários contratados no presente contrato.</p>\n\n<p><b>6) RESCISÃO CONTRATUAL, SUBSTABELECIMENTO, REVOGAÇÃO DO MANDATO E DESISTÊNCIA</b></p>\n\n<p>Em caso de desistência da ação pela parte contratante, revogação do mandato ou substabelecimento sem anuência da parte contratada, será devido a esta:</p>\n\n<ol>\n\t<li>O valor de um salário mínimo vigente à época da desistência, se a desistência for antes do ajuizamento da demanda;</li>\n\t<li>Se a desistência for após o ajuizamento da demanda, em havendo qualquer proveito econômico oriundo da ação, o valor integral dos honorários advocatícios aqui pactuados, ainda que o feito continue tramitando com ou sem patrocínio de outros advogados;</li>\n\t<li>Se a desistência for após o ajuizamento da demanda, em não havendo qualquer proveito econômico oriundo da ação, o valor de 5% (cinco por cento) do valor da causa;</li>\n</ol>\n\n<p>Parágrafo primeiro: No caso da parte contratante pretender a revogação do contrato, deverá comunicar à parte contratada sobre sua intenção com, no mínimo, 30 (trinta) dias de antecedência.</p>\n\n<p>Parágrafo segundo: Com a revogação do mandato, a parte contratada estará desobrigada das obrigações aqui assumidas.</p>\n\n\n<p><b>7) DOS SERVIÇOS DE REALIZAÇÃO NECESSÁRIA ALÉM DA COMARCA SEDE</b></p>\n\n<p>Havendo necessidade de realização de serviços em outro local que não o da sede, a parte contratada terá o direito de executar de forma pessoal ou substabelecer o mandato, ficando por responsabilidade da parte contratante o pagamento dos encargos despendidos.</p>\n\n<p><b>8) DOS HONORÁRIOS DE SUCUMBÊNCIA</b></p>\n\n<p>Os honorários de sucumbência, conforme art. 22 da Lei 8.906/94, pagos pela parte contrária pertencerão integralmente à parte contratada.</p>\n\n<p><b>9) DOS DOCUMENTOS NECESSÁRIOS À AÇÃO</b></p>\n\n<p>Será de responsabilidade da parte contratante o fornecimento dos documentos e explicações solicitadas pela parte contratada, para esta promover a boa defesa dos interesses da parte contratante.</p>\n\n<p><b>10) DO VENCIMENTO DOS HONORÁRIOS ADVOCATÍCIOS</b></p>\n\n<p>Os honorários contratados serão considerados vencidos e exigíveis, independente de notificação, nas seguintes situações:</p>\n\n<p>a) Com o trânsito em julgado do processo;</p>\n\n<p>b) Com a solução consensual feita pelas partes litigantes;</p>\n\n<p>c) Com o não prosseguimento do processo administrativo ou judicial por circunstâncias alheias e não provocadas pela parte contratada;</p>\n\n<p>d) Com o trânsito em julgado da sentença;</p>\n\n<p>e) Com a cassação da procuração sem culpa da parte contratada.</p>\n\n<p><b>11) RESPONSABILIDADES</b></p>\n\n<p>Com comprovado erro na intimação eletrônica, fica a parte contratada livre de qualquer responsabilidade.</p>\n\n<p><b>12) DA COMUNICAÇÃO ENTRE AS PARTES</b></p>\n\n<p>As partes acordam que as comunicações devem ser feitas eletronicamente, via e-mail, whatsapp, SMS, ou outros meios digitais, mesmo na esfera judicial, conforme art. 190 do CPC.</p>\n\n<p>Parágrafo único: O mesmo meio de comunicação aplica-se, também, para anuência da parte contratante quanto à renúncia dos poderes outorgados à parte contratada, de acordo com o art. 12 do Código de Ética da OAB.</p>\n\n<p><b>13) DECADÊNCIA E PRESCRIÇÃO</b></p>\n\n<p>As partes acordam o prazo decadencial de 1 (um) ano após o trânsito em julgado da ação objeto deste mandato para requererem a reparação de danos entre si, com fulcro no art. 190 do CPC.</p>\n\n<p>Em relação ao prazo prescricional, ele terá o prazo de 1 (um) ano.</p>\n\n<p><b>14) FORO</b></p>\n\n<p>Fica eleito o foro da Comarca de São Paulo para dirimir quaisquer dúvidas provenientes do presente contrato, seja qual for o domicílio da parte contratante.</p>\n\n<p>E por estarem assim justos e contratados e, de comum acordo, aceitarem as condições deste termo, o assinam, de modo a garantir os seus jurídicos e legais efeitos.`;
    }
}

module.exports = new TIAutomationService();
