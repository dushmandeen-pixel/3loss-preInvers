const axios = require('axios');
const http = require('http');

// --- কনফিগারেশন ---
const TG_TOKEN = "8555971778:AAFfHnnuRaSGhBAykQk_gpuymAafHPcxK38";
const TG_CHAT_ID = "@HABIB898900";
const HISTORY_API = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

// স্টিকার আইডি সমূহ
const START_STICKER = "CAACAgUAAxkBAAEQQPppakFbk3fqeWzooRLIx3RKgAHIrwACUhYAAlEJ-VVZvLkjcrQPSTgE"; // আপনার স্টার্ট স্টিকার আইডি
const WIN_STICKER_ID = "CAACAgUAAxkBAAEQPxppaN9TvHfLso-wPWE3vCjEmAHc_QACaxoAAuqzcFTth7hpguaGHDgE"; // উইন হলে যে স্টিকার যাবে
const END_STICKER = "CAACAgUAAxkBAAEQQPxpakFtr-vvDe05t6M7KXqUvc6xEQACIhYAAi3U8FUVaqmrOChRqDgE"; 

let isRunning = false;
let lastSentPeriod = "";
let sessionResults = [];
let totalWins = 0;
let totalLosses = 0;
let lastPrediction = null; 
let lastPredictedPeriod = null;

// --- টেলিগ্রাম ফাংশনসমূহ ---
async function sendTelegram(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID, text, parse_mode: "Markdown"
        });
    } catch (e) { console.log("Error sending text"); }
}

async function sendSticker(stickerId) {
    if(!stickerId) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendSticker`, {
            chat_id: TG_CHAT_ID, sticker: stickerId
        });
    } catch (e) { console.log("Error sending sticker"); }
}

// --- সেশন রিপোর্ট জেনারেটর ---
function generateReport() {
    let report = "🏆 SESSION SUMMARY REPORT 🏆\n\n----------------------------------------\n";
    sessionResults.forEach((res, index) => {
        report += `${index + 1}. PD: ${res.pd} | ${res.status}\n`;
    });
    report += `-----------------------------------------\n✅ Total Wins: ${totalWins}\n🚫 Total Losses: ${totalLosses}\n🎯 Powered by RK VIP System`;
    return report;
}

// --- মূল প্রেডিকশন লজিক ---
async function runPrediction() {
    if (!isRunning) return;

    try {
        const res = await axios.get(`${HISTORY_API}?pageSize=50&pageNo=1&type=1`);
        const list = res.data.data.list;

        const now = new Date();
        const dateStr = now.getUTCFullYear() + String(now.getUTCMonth() + 1).padStart(2, "0") + String(now.getUTCDate()).padStart(2, "0");
        const currentPeriod = dateStr + "1000" + String(10001 + (now.getUTCHours() * 60 + now.getUTCMinutes()));
        const lastDigit = parseInt(currentPeriod.slice(-1));

        // উইন/লস চেক করা (আগের প্রেডিকশন অনুযায়ী)
        if (lastPrediction && lastPredictedPeriod) {
            const match = list.find(m => m.issueNumber === lastPredictedPeriod);
            if (match) {
                const actual = parseInt(match.number) >= 5 ? "BIG" : "SMALL";
                const isWin = actual === lastPrediction;
                const statusStr = isWin ? "WIN ✅✅✅✅" : "Loss 🚫🚫🚫🚫";
                
                sessionResults.push({ pd: lastPredictedPeriod.slice(-3), status: statusStr });
                
                if (isWin) {
                    totalWins++;
                    await sendSticker(WIN_STICKER_ID); // উইন হলে স্টিকার পাঠানো
                    await sendTelegram(`🎯 Result: ${actual}\n🔥 Status: WIN ✅`);
                } else {
                    totalLosses++;
                }

                lastPrediction = null; // রিসেট
                
                if (totalWins >= 30) {
                    await sendTelegram("🎯 Target 30 Wins Reached! Closing Session...");
                    stopSession();
                    return;
                }
            }
        }

        // নতুন প্রেডিকশন দেওয়া (যখন শেষ ডিজিট ৫)
        if (lastDigit === 5 && currentPeriod !== lastSentPeriod) {
            const refPeriod = (BigInt(currentPeriod) - 9n).toString();
            const refMatch = list.find(m => m.issueNumber === refPeriod);

            if (refMatch) {
                const prediction = parseInt(refMatch.number) >= 5 ? "BIG" : "SMALL";
                lastSentPeriod = currentPeriod;
                lastPrediction = prediction;
                lastPredictedPeriod = (BigInt(currentPeriod) + 1n).toString();

                const msg = `🎯 *WINGO 1 MIN*\n📌 Period: \`${currentPeriod}\`\n📊 Prediction: *${prediction}*`;
                await sendTelegram(msg);
            }
        }
    } catch (e) { console.log("API Error"); }
}

// --- সেশন কন্ট্রোল ---
async function startSession() {
    if (isRunning) return;
    isRunning = true;
    totalWins = 0;
    totalLosses = 0;
    sessionResults = [];
    await sendSticker(START_STICKER);
    await sendTelegram("🚀 AI Prediction Session Started!");
}

async function stopSession() {
    if (!isRunning) return;
    isRunning = false;
    await sendSticker(END_STICKER);
    await sendTelegram("🛑 Session Ended.");
    await sendTelegram(generateReport());
}

// --- টেলিগ্রাম কমান্ড হ্যান্ডলার ---
let lastUpdateId = 0;
async function checkCommands() {
    try {
        const res = await axios.get(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`);
        res.data.result.forEach(update => {
            lastUpdateId = update.update_id;
            const text = update.message?.text;
            if (text === "/prediction") startSession();
            if (text === "/stop") stopSession();
            if (text === "/summary") sendTelegram(generateReport());
        });
    } catch (e) {}
}

setInterval(runPrediction, 30000); 
setInterval(checkCommands, 3000);

http.createServer((req, res) => {
    res.write('Bot is Active');
    res.end();
}).listen(process.env.PORT || 3000);
