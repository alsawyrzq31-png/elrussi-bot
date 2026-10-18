const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

const DEVELOPER_NUMBER = "201552943986@s.whatsapp.net";
const TARGET_PHONE = "201552943986"; // رقمك بالصيغة الدولية لتوليد الكود له

let groupSettings = {
    welcome: true,       
    adminOnly: false,    
    antiLink: false,     
    antiBadWords: false  
};

const badWords = ["شتيمة1", "شتيمة2"]; 

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    // توليد رمز الاقتران (Pairing Code) وطباعته بوضوح في سجلات Railway
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        
        if (connection === 'open') {
            console.log('✅ تم اتصال بوت (الروسي) بنجاح!');
        }

        // إذا لم يكن الرقم مقترناً بعد، اطلب الرمز فور بدء الاتصال
        if (!sock.authState.creds.registered && (connection === 'connecting' || !connection)) {
            setTimeout(async () => {
                try {
                    console.log('⏳ جاري طلب رمز الاقتران لرقمك من خوادم واتساب...');
                    let code = await sock.requestPairingCode(TARGET_PHONE);
                    console.log(`\n=========================================`);
                    console.log(`🔑 رمز الاقتران الخاص بك هو:  ${code}  `);
                    console.log(`=========================================\n`);
                    console.log('اكتب هذا الرمز في واتساب فوراً قبل انتهاء صلاحيته!\n');
                } catch (err) {
                    console.log("❌ تعذر طلب الكود في هذه المحاولة، جاري إعادة المحاولة:", err?.message || err);
                }
            }, 5000);
        }
    });

    // الترحيب بالأعضاء الجدد
    sock.ev.on('group-participants.update', async (update) => {
        if (groupSettings.welcome && update.action === 'add') {
            for (let num of update.participants) {
                await sock.sendMessage(update.id, {
                    text: `🌸 أهلاً بك يا @${num.split('@')[0]} في المجموعة!\n🤖 مع تحيات بوت **الروسي**.`,
                    mentions: [num]
                });
            }
        }
    });

    // معالجة الأوامر والتحكم
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
        const from = m.key.remoteJid;
        const sender = m.key.participant || from;
        const isGroup = from.endsWith('@g.us');
        const isOwner = sender === DEVELOPER_NUMBER;

        let isAdmin = false;
        if (isGroup) {
            const groupMetadata = await sock.groupMetadata(from);
            const participant = groupMetadata.participants.find(p => p.id === sender);
            isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
        }

        if (isGroup && !isOwner) {
            if (groupSettings.adminOnly && !isAdmin) return;
            if (groupSettings.antiLink && (body.includes("chat.whatsapp.com") || body.includes("http"))) {
                await sock.sendMessage(from, { delete: m.key });
                return;
            }
            if (groupSettings.antiBadWords && badWords.some(word => body.toLowerCase().includes(word))) {
                await sock.sendMessage(from, { delete: m.key });
                return;
            }
        }

        if (body.startsWith('.')) {
            const args = body.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            if (isGroup && (isAdmin || isOwner)) {
                if (command === 'حذف') {
                    const contextInfo = m.message.extendedTextMessage?.contextInfo;
                    if (contextInfo) {
                        await sock.sendMessage(from, { 
                            delete: { remoteJid: from, id: contextInfo.stanzaId, participant: contextInfo.participant } 
                        });
                    }
                }
                if (command === 'طرد') {
                    const userToKick = m.message.extendedTextMessage?.contextInfo?.participant;
                    if (userToKick) {
                        await sock.groupParticipantsUpdate(from, [userToKick], "remove");
                        await sock.sendMessage(from, { text: "❌ تم طرد العضو بنجاح بواسطة الروسي." });
                    }
                }
            }

            if (isOwner) {
                if (command === 'الروابط') {
                    groupSettings.antiLink = !groupSettings.antiLink;
                    await sock.sendMessage(from, { text: `🔗 منع الروابط الآن: ${groupSettings.antiLink ? 'مفعل ✅' : 'متوقف ❌'}` });
                }
                if (command === 'المطور' || command === 'الروسي') {
                    await sock.sendMessage(from, { text: "👑 أهلاً بك يا مطورنا الكبير. بوت (الروسي) يعمل بكامل الصلاحيات والتحكم المطلق تحت إشرافك!" });
                }
            } else if (['الروابط', 'الترحيب', 'المطور', 'الروسي'].includes(command)) {
                await sock.sendMessage(from, { text: "❌ عذراً، تعديل إعدادات البوت متاح للمطور الأساسي فقط." });
            }
        }
    });
}

startBot();
