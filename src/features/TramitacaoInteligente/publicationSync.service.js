/**
 * TI Publication Sync Service
 * Syncs all publications from Tramitação Inteligente to local database
 * Designed to run once per day with proper rate limiting
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Chat = require('../../models/Chat');

class PublicationSyncService {
    constructor() {
        this.baseURL = 'https://planilha.tramitacaointeligente.com.br';
        this.cookies = [];
        this.client = axios.create({
            baseURL: this.baseURL,
            withCredentials: true,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // Rate limiting settings
        this.delayBetweenPages = 1000; // 1 second between page requests
        this.delayBetweenPublications = 500; // 0.5 second between publication requests
        this.delayOnRateLimit = 30000; // 30 seconds on rate limit
        this.maxRetries = 3;
    }

    async login() {
        console.log('📡 PublicationSync: Starting login...');

        // Get login page for CSRF token
        const initialPage = await this.client.get('/usuarios/login');
        const $ = cheerio.load(initialPage.data);
        const authenticityToken = $('input[name="authenticity_token"]').val();
        this.updateCookies(initialPage.headers['set-cookie']);

        if (!authenticityToken) {
            throw new Error('Could not find authenticity_token');
        }

        const email = process.env.TI_USER_EMAIL;
        const password = process.env.TI_USER_PASSWORD;

        const params = new URLSearchParams();
        params.append('authenticity_token', authenticityToken);
        params.append('user[email]', email);
        params.append('user[password]', password);
        params.append('user[remember_me]', '1');

        const loginRes = await this.client.post('/usuarios/login', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': this.getCookieString(),
                'Referer': `${this.baseURL}/usuarios/login`
            }
        });

        this.updateCookies(loginRes.headers['set-cookie']);
        console.log('✅ PublicationSync: Login successful');
        return true;
    }

    updateCookies(newCookies) {
        if (!newCookies) return;
        newCookies.forEach(cookie => {
            const parts = cookie.split(';');
            const kv = parts[0];
            const name = kv.split('=')[0];
            this.cookies = this.cookies.filter(c => !c.startsWith(`${name}=`));
            this.cookies.push(kv);
        });
    }

    getCookieString() {
        return this.cookies.join('; ');
    }

    async request(method, path, options = {}, retryCount = 0) {
        try {
            const res = await this.client.request({
                method,
                url: path,
                headers: {
                    'Cookie': this.getCookieString(),
                    ...options.headers
                },
                ...options,
                validateStatus: () => true
            });

            this.updateCookies(res.headers['set-cookie']);

            // Handle rate limiting
            if (res.status === 429) {
                if (retryCount < this.maxRetries) {
                    console.log(`  ⏳ Rate limited. Waiting ${this.delayOnRateLimit / 1000}s...`);
                    await this.sleep(this.delayOnRateLimit);
                    return this.request(method, path, options, retryCount + 1);
                }
                throw new Error('Max retries exceeded on rate limit');
            }

            // Handle redirects
            if ([301, 302, 303].includes(res.status) && res.headers.location) {
                const location = res.headers.location.startsWith('http')
                    ? res.headers.location.replace(this.baseURL, '')
                    : res.headers.location;
                return this.request('GET', location, {});
            }

            return res;
        } catch (error) {
            if (retryCount < this.maxRetries) {
                console.log(`  ⚠️ Request error, retrying... (${retryCount + 1}/${this.maxRetries})`);
                await this.sleep(5000);
                return this.request(method, path, options, retryCount + 1);
            }
            throw error;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch all publications from all pages
     * @returns {Array} Array of publication objects
     */
    async fetchAllPublications() {
        console.log('\n📋 Fetching all publications...');

        const allPublications = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            console.log(`\n  Page ${page}...`);

            const res = await this.request('GET', '/publicacoes', { params: { page } });

            if (res.status !== 200) {
                console.log(`    ❌ Failed: ${res.status}`);
                break;
            }

            const $ = cheerio.load(res.data);

            // Extract publication IDs from this page
            const pubIds = new Set();
            $('form[action^="/publicacoes/"]').each((i, form) => {
                const action = $(form).attr('action');
                const match = action.match(/\/publicacoes\/(\d+)$/);
                if (match) pubIds.add(match[1]);
            });

            if (pubIds.size === 0) {
                console.log('    No more publications.');
                hasMore = false;
                continue;
            }

            console.log(`    Found ${pubIds.size} publications`);

            // Fetch each publication's details
            for (const pubId of pubIds) {
                const pub = await this.fetchPublicationDetails(pubId);
                if (pub) {
                    allPublications.push(pub);
                }
                await this.sleep(this.delayBetweenPublications);
            }

            page++;
            await this.sleep(this.delayBetweenPages);
        }

        console.log(`\n✅ Total publications fetched: ${allPublications.length}`);
        return allPublications;
    }

    /**
     * Fetch details of a single publication
     * @param {string} pubId Publication ID
     * @returns {Object|null} Publication object or null
     */
    async fetchPublicationDetails(pubId) {
        try {
            const res = await this.request('GET', `/publicacoes/${pubId}`);

            if (res.status !== 200) {
                return null;
            }

            const $ = cheerio.load(res.data);
            const bodyText = $('body').text();

            // Extract processo number (CNJ format)
            const processoMatch = bodyText.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);

            // Extract all CPFs mentioned
            const cpfMatches = bodyText.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) || [];
            const cpfs = [...new Set(cpfMatches.map(c => c.replace(/\D/g, '')))];

            // Extract summary
            const summaryMatch = bodyText.match(/Resumo:\s*([^\n]+(?:\n[^\n]+)*)/i);
            const summary = summaryMatch?.[1]?.trim().substring(0, 500) || '';

            // Extract prazo
            const prazoMatch = bodyText.match(/Prazo:\s*([^\n]+)/i);
            const prazo = prazoMatch?.[1]?.trim() || '';

            // Extract ação necessária
            const acaoMatch = bodyText.match(/Ação necessária:\s*([^\n]+)/i);
            const acaoNecessaria = acaoMatch?.[1]?.trim() || '';

            // Extract data de publicação
            const dataMatch = bodyText.match(/Data da publicação:\s*(\d{2}\/\d{2}\/\d{4})/i);
            const dataPublicacao = dataMatch?.[1] || '';

            // Check if read
            const isRead = bodyText.includes('Marcada como lida');

            return {
                id: pubId,
                processo: processoMatch?.[1] || null,
                cpfs,
                summary,
                prazo,
                acaoNecessaria,
                dataPublicacao,
                isRead,
                fetchedAt: new Date()
            };
        } catch (error) {
            console.log(`    ⚠️ Error fetching pub ${pubId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Find publications for a specific CPF
     * @param {string} cpf CPF to search for
     * @param {Array} publications Array of all publications (optional, will fetch if not provided)
     * @returns {Array} Publications matching the CPF
     */
    async findPublicationsByCpf(cpf, publications = null) {
        const cleanCpf = cpf.replace(/\D/g, '');

        if (!publications) {
            await this.login();
            publications = await this.fetchAllPublications();
        }

        return publications.filter(pub =>
            pub.cpfs.some(c => c === cleanCpf)
        );
    }

    /**
     * Sync publications to database and match with existing chats
     * @returns {Object} Sync results
     */
    async syncToDatabase() {
        console.log('\n🔄 Starting full publication sync...');

        await this.login();
        const publications = await this.fetchAllPublications();

        // Group publications by CPF
        const pubsByCpf = {};
        for (const pub of publications) {
            for (const cpf of pub.cpfs) {
                if (!pubsByCpf[cpf]) {
                    pubsByCpf[cpf] = [];
                }
                pubsByCpf[cpf].push(pub);
            }
        }

        console.log(`\n📊 Found publications for ${Object.keys(pubsByCpf).length} unique CPFs`);

        // Match with existing chats
        const results = {
            totalPublications: publications.length,
            uniqueCpfs: Object.keys(pubsByCpf).length,
            matchedChats: 0,
            unmatchedCpfs: []
        };

        for (const cpf of Object.keys(pubsByCpf)) {
            // Find chat with this CPF
            const chat = await Chat.findOne({
                where: { cpf: cpf }
            });

            if (chat) {
                results.matchedChats++;

                // Update chat with publication data
                const pubs = pubsByCpf[cpf];
                const latestPub = pubs[0]; // Assuming sorted by date

                await chat.update({
                    latestPublicationId: latestPub.id,
                    latestPublicationProcesso: latestPub.processo,
                    latestPublicationSummary: latestPub.summary,
                    latestPublicationPrazo: latestPub.prazo,
                    publicationsCount: pubs.length,
                    publicationsSyncedAt: new Date()
                });

                console.log(`  ✅ Updated chat for CPF ${cpf}: ${pubs.length} publications`);
            } else {
                results.unmatchedCpfs.push(cpf);
            }
        }

        console.log(`\n✅ Sync complete!`);
        console.log(`  Total publications: ${results.totalPublications}`);
        console.log(`  Unique CPFs: ${results.uniqueCpfs}`);
        console.log(`  Matched chats: ${results.matchedChats}`);
        console.log(`  Unmatched CPFs: ${results.unmatchedCpfs.length}`);

        return results;
    }
}

module.exports = new PublicationSyncService();
