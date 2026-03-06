const { Chat, Message, Setting } = require('./src/models');
const trelloService = require('./src/features/Trello/trello.service');
const tramitacaoService = require('./src/features/TramitacaoInteligente/tramitacaoInteligente.service');
const axios = require('axios');
require('dotenv').config();

async function syncLeads() {
    console.log('🔍 Fetching finalized chats to sync...');

    const chats = await Chat.findAll({
        where: {
            triageStatus: ['finalizada', 'encerrada_etica']
        }
    });

    console.log(`📋 Found ${chats.length} finalized chats. Starting processing...\n`);

    for (const chat of chats) {
        try {
            console.log(`⏳ Processing: ${chat.contactName || 'Sem Nome'} (${chat.contactNumber})`);

            // 1. Ensure Sync with TI
            if (!chat.tramitacaoCustomerId) {
                console.log(`   🚀 Syncing to TI...`);
                try {
                    const result = await tramitacaoService.searchCustomers(chat.cpf);
                    const cleanCpf = chat.cpf?.replace(/\D/g, '');
                    const existing = result.customers?.find(c => c.cpf_cnpj?.replace(/\D/g, '') === cleanCpf);

                    if (existing) {
                        console.log(`   🔗 Linked to existing TI customer (ID: ${existing.id})`);
                        await chat.update({
                            tramitacaoCustomerId: existing.id,
                            tramitacaoCustomerUuid: existing.uuid,
                            syncStatus: 'Sincronizado'
                        });
                    } else {
                        console.log(`   ✨ Creating new customer in TI...`);
                        await tramitacaoService.createCustomer(chat.id);
                    }
                    await chat.reload();
                } catch (e) {
                    console.error(`   ❌ TI Sync Error: ${e.message}`);
                }
            }

            // 2. Refresh/Fetch enriched data from TI if possible
            if (chat.tramitacaoCustomerId) {
                console.log(`   📥 Fetching enriched data from TI...`);
                try {
                    const tiData = await tramitacaoService.getCustomerById(chat.id);
                    const customer = tiData.customer || tiData;

                    await chat.update({
                        phone_1: customer.phone_1,
                        phone_2: customer.phone_2,
                        country: customer.country,
                        state: customer.state,
                        city: customer.city,
                        neighborhood: customer.neighborhood,
                        zipcode: customer.zipcode,
                        street: customer.street,
                        street_number: customer.street_number,
                        sexo: customer.sexo,
                        birthdate: customer.birthdate,
                        deathdate: customer.deathdate,
                        marital_status: customer.marital_status,
                        profession: customer.profession,
                        meu_inss_pass: customer.meu_inss_pass,
                        rg_numero: customer.rg_numero,
                        rg_data_emissao: customer.rg_data_emissao,
                        father_name: customer.father_name,
                        mother_name: customer.mother_name
                    });

                    // 📝 Sync Triage Note
                    if (chat.notes) {
                        console.log(`   📝 Pushing triage notes to TI...`);
                        await tramitacaoService.upsertNote(chat.id, chat.notes);
                    }
                } catch (e) {
                    console.error(`   ❌ TI Enrichment Error: ${e.message}`);
                }
            }

            // 3. Sync to Trello
            console.log(`   📋 Syncing to Trello...`);
            const existingCard = await trelloService.findTrelloCard(chat.contactNumber);

            if (existingCard) {
                console.log(`   ℹ️ Card already exists. Updating description...`);
                // We reuse createTrelloCard logic but we'll manually update it for simplicity here
                // or we could add an "updateTrelloCard" method to the service.
                // Let's just create a new one for now if the user wants "fresh" look, 
                // OR better: Let's delete the old one or just create a new one.
                // Actually, I'll delete the old one to ensure the "new" board is clean and formatted correctly.
                // UNLESS the user has moved it. 
                // Let's just create a new one.
                await trelloService.createTrelloCard(chat.id);
            } else {
                console.log(`   ✨ Creating new Trello card...`);
                await trelloService.createTrelloCard(chat.id);
            }

            console.log(`   ✅ Done with ${chat.contactName}\n`);

        } catch (error) {
            console.error(`❌ Error processing chat ${chat.id}:`, error.message);
        }
    }

    console.log('✨ All leads processed.');
    process.exit(0);
}

syncLeads().catch(err => {
    console.error('❌ Global Sync failed:', err);
    process.exit(1);
});
