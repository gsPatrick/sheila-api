/**
 * Test script for publication sync
 * Run this to test the full sync and search for a specific CPF
 */

require('dotenv').config();
const publicationSync = require('./src/features/TramitacaoInteligente/publicationSync.service');

async function main() {
    const targetCpf = process.argv[2] || '05538537323'; // Default to Érico's CPF

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TI PUBLICATION SYNC - FULL SCAN');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Target CPF: ${targetCpf}`);
    console.log(`  Started at: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        // Login
        await publicationSync.login();

        // Fetch all publications
        const allPubs = await publicationSync.fetchAllPublications();

        // Search for target CPF
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(`  SEARCHING FOR CPF: ${targetCpf}`);
        console.log('═══════════════════════════════════════════════════════════\n');

        const cleanCpf = targetCpf.replace(/\D/g, '');
        const matches = allPubs.filter(pub =>
            pub.cpfs.some(c => c === cleanCpf)
        );

        if (matches.length > 0) {
            console.log(`✅ FOUND ${matches.length} publications for CPF ${targetCpf}:\n`);

            matches.forEach((m, i) => {
                console.log(`  [${i + 1}] Publication #${m.id}`);
                console.log(`      Processo: ${m.processo}`);
                console.log(`      Data: ${m.dataPublicacao}`);
                console.log(`      Prazo: ${m.prazo}`);
                console.log(`      Ação: ${m.acaoNecessaria}`);
                console.log(`      Resumo: ${m.summary.substring(0, 200)}...`);
                console.log('');
            });
        } else {
            console.log(`❌ No publications found for CPF ${targetCpf}`);
        }

        // Summary
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  SYNC SUMMARY');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`  Total publications: ${allPubs.length}`);

        // Count unique CPFs
        const allCpfs = new Set();
        allPubs.forEach(p => p.cpfs.forEach(c => allCpfs.add(c)));
        console.log(`  Unique CPFs: ${allCpfs.size}`);

        // Count by read status
        const unread = allPubs.filter(p => !p.isRead).length;
        console.log(`  Unread: ${unread}`);
        console.log(`  Read: ${allPubs.length - unread}`);

        console.log(`  Completed at: ${new Date().toISOString()}`);
        console.log('═══════════════════════════════════════════════════════════\n');

        // Save results to file for inspection
        const fs = require('fs');
        fs.writeFileSync('sync_results.json', JSON.stringify({
            syncedAt: new Date().toISOString(),
            totalPublications: allPubs.length,
            uniqueCpfs: allCpfs.size,
            publications: allPubs,
            searchResults: {
                cpf: targetCpf,
                matches
            }
        }, null, 2));

        console.log('📁 Results saved to sync_results.json');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
}

main();
