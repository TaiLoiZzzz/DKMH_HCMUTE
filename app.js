// ==============================================================================
// HỆ THỐNG AUTO-KILL ĐĂNG KÝ MÔN HỌC (BẢN TỐI THƯỢNG - FULLY AUTOMATED)
// Kiến trúc: Tàng hình (Stealth) + Đánh chặn Token + Auto Recovery + Random Jitter
// ==============================================================================

const puppeteer = require('puppeteer-extra');
require('dotenv').config()

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const axios = require('axios');
const readline = require('readline');

// ==========================================
// 1. CẤU HÌNH LÕI HỆ THỐNG
// ==========================================
const API_KEY = process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

const TURN_ID = process.env.TURN_ID;
const STUDY_PROGRAM_ID = process.env.STUDY_PROGRAM_ID;

// API Endpoints
const CHECK_API = "https://dangkyapi.hcmute.edu.vn/api/Regist/GetAllScheduleUnitAllowRegist";
const CHECK_CONFLICT_API = `https://dangkyapi.hcmute.edu.vn/api/Regist/CheckExitsRegist?StudyProgramID=${STUDY_PROGRAM_ID}`;
const REGIST_API = `https://dangkyapi.hcmute.edu.vn/api/Regist/RegistScheduleStudyUnit?TurnID=${TURN_ID}&Action=REGIST&StudyProgramID=${STUDY_PROGRAM_ID}`;

// Biến trạng thái toàn cục
let jwtToken = "";
let PAYLOAD = { ReqParam1: STUDY_PROGRAM_ID, ReqParam2: "NKH", ReqParam3: "" };
let isSystemHalted = false; // Semaphore khóa luồng
let ignoredClasses = [];    // Blacklist các lớp trùng lịch

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ==========================================
// HÀM BỔ TRỢ
// ==========================================
// 1. Sinh Header ngụy trang chống Bot (Browser Spoofing)
function getHeaders() {
    return {
        'Apikey': API_KEY,
        'Authorization': `Bearer ${jwtToken}`,
        'Clientid': CLIENT_ID,
        'Content-Type': 'application/json',
        'Origin': 'https://dkmh.hcmute.edu.vn',
        'Referer': 'https://dkmh.hcmute.edu.vn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    };
}

// 2. Sinh thời gian ngẫu nhiên (Từ 50s -> 75s) để né Tường lửa đếm nhịp
function getRandomInterval() {
    const min = 240 * 1000;
    const max = 360 * 1000;
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// 3. Hàm điều phối luồng chạy ngầm
function scheduleNextRun() {
    const delay = getRandomInterval();
    console.log(`\n⏳ Nằm vùng. Nhịp quét tiếp theo sau: ${(delay / 1000).toFixed(1)} giây...`);
    setTimeout(checkAvailableSlots, delay);
}

// ==========================================
// KHỞI ĐỘNG HỆ THỐNG
// ==========================================
console.clear();
console.log("====================================================================");
console.log(" HỆ THỐNG AUTO-KILL ĐKMH ");
console.log("====================================================================\n");
rl.question(' Nhập mã môn học mày muốn săn (VD: 261LLCT120205): ', (answer) => {
    let maMon = `261${answer.trim()}`; // Nhập full mã môn cho chính xác
    if (!maMon) {
        console.log(" Lỗi: Mã môn trống. Khởi động lại đi.");
        process.exit(1);
    }
    PAYLOAD.ReqParam3 = maMon;
    console.log(`\n-> [LOCKED] Đã khóa mục tiêu: ${PAYLOAD.ReqParam3}`);
    rl.close();

    // Kích hoạt chuỗi dây chuyền
    startSniffer();
});

// ==========================================
// PHASE 1: VƯỢT GOOGLE & TRỘM TOKEN (TÍCH HỢP AUTO-RECOVERY)
// ==========================================
async function startSniffer() {
    console.log("-> [1] Kích hoạt Stealth Engine & Phục hồi Cookie...");

    const browser = await puppeteer.launch({
        headless: false, // Để hiện trình duyệt cho Google thấy màn hình render (né bot)
        defaultViewport: null,
        userDataDir: './chrome_profile_dkmh', // Tâm điểm của việc lưu phiên
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-position=0,0'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });

    const page = await browser.newPage();
    let isTokenGrabbed = false;

    // CHIÊU 1: Đánh chặn Outbound Request (Bắt Token lúc gửi đi)
    page.on('request', async (request) => {
        if (isTokenGrabbed) return;

        const url = request.url();
        const headers = request.headers();

        if (url.includes('dangkyapi.hcmute.edu.vn/api/') && headers['authorization'] && headers['authorization'].includes('Bearer')) {
            jwtToken = headers['authorization'].split('Bearer ')[1].trim();
            isTokenGrabbed = true;

            console.log(`\n-> [THÀNH CÔNG] Đã móc được Token từ phiên đăng nhập cục bộ!`);
            await browser.close().catch(e => { });

            console.log("-> [2] Giật sập trình duyệt. Kích hoạt Radar cào dữ liệu ngầm.\n");
            checkAvailableSlots(); // Đẩy sang Phase 2
        }
    });

    // CHIÊU 2: Đánh chặn Inbound Response (Bắt Token lúc Server trả về nếu Token cũ chết hẳn)
    page.on('response', async (response) => {
        if (isTokenGrabbed) return;

        const url = response.url();
        if (url.includes('/api/Authen/AuthenticateGoogle') && response.status() === 200) {
            try {
                const data = await response.json();
                if (data && data.Token) {
                    jwtToken = data.Token;
                    isTokenGrabbed = true;

                    console.log(`\n-> [THÀNH CÔNG] Đã cấp quyền mới cho: ${data.FullName}`);
                    console.log(`-> Hạn Token: ${data.Expire}`);

                    await browser.close().catch(e => { });
                    console.log("-> [2] Giật sập trình duyệt. Kích hoạt Radar cào dữ liệu ngầm.\n");

                    checkAvailableSlots(); // Đẩy sang Phase 2
                }
            } catch (err) { }
        }
    });

    // Ép trình duyệt truy cập web để mồi cho 2 hàm chặn luồng phía trên hoạt động
    try {
        await page.goto('https://dkmh.hcmute.edu.vn/', { waitUntil: 'networkidle2' });

        // AUTO-LOGIN LOGIC: Bấm "Đăng nhập với Google" và chọn tài khoản trong popup
        setTimeout(async () => {
            if (!isTokenGrabbed) {
                console.log("-> [AUTO-LOGIN] Đang thử tự động đăng nhập...");
                try {
                    // 1. Tìm và click nút "Đăng nhập với Google" trên trang chính
                    await page.evaluate(() => {
                        const elements = Array.from(document.querySelectorAll('button, div, span'));
                        const loginBtn = elements.find(el => el.innerText && el.innerText.includes('Đăng nhập với Google'));
                        if (loginBtn) loginBtn.click();
                    });

                    // 2. Đợi cửa sổ popup của Google xuất hiện (URL chứa accounts.google.com)
                    const target = await browser.waitForTarget(t => t.url().includes('accounts.google.com'), { timeout: 10000 });
                    const popup = await target.page();

                    if (popup) {
                        console.log("-> [AUTO-LOGIN] Đã bắt được Popup Google, đang chọn email...");
                        // Đợi một chút cho danh sách tài khoản load xong
                        await new Promise(resolve => setTimeout(resolve, 3000)); 

                        // 3. Click vào tài khoản sinh viên
                        await popup.evaluate(() => {
                            // Tìm element có chứa đuôi email sinh viên trường và click
                            const elements = Array.from(document.querySelectorAll('*'));
                            const emailEl = elements.find(el => el.innerText && el.innerText.includes('@student.hcmute.edu.vn'));
                            if (emailEl) {
                                emailEl.click();
                            }
                        });
                    }
                } catch (e) {
                    // Lỗi (timeout ko thấy popup) thì im lặng, vì có thể token đã lấy được ngầm
                }
            }
        }, 3000);

    } catch (error) {
        // Nếu lỗi là do trình duyệt bị giật sập giữa chừng (detached/closed) thì bỏ qua
        if (!error.message.includes('detached') && !error.message.includes('Target closed') && !error.message.includes('Session closed')) {
            console.error(`->  Lỗi phụ khi load trang:`, error.message);
        }
    }
}

// ==========================================
// PHASE 2 & 3: RADAR + PRE-CHECK + AUTO KILL
// ==========================================
async function checkAvailableSlots() {
    if (isSystemHalted) return;

    const timeNow = new Date().toLocaleTimeString();
    try {
        // Quét lấy danh sách lớp
        const response = await axios.post(CHECK_API, PAYLOAD, { headers: getHeaders() });
        const classes = response.data;

        if (!classes || classes.length === 0) {
            console.log(`[${timeNow}]  Hệ thống báo: Không có lớp nào cho mã này. Dò tiếp nhịp sau...`);
            scheduleNextRun();
            return;
        }

        let tableData = [];
        let targetToKill = null;

        for (let cls of classes) {
            let emptySlots = parseInt(cls.NumberRegistOfEmpty);
            let classId = cls.CurriculumID;

            // ĐIỀU KIỆN CHỐT HẠ: Slot > 0 AND Chưa có mục tiêu AND Không nằm trong Blacklist
            if (emptySlots > 0 && !targetToKill && !ignoredClasses.includes(classId)) {
                targetToKill = cls;
                break; // Đập vỡ vòng lặp, giành ưu tiên cao nhất cho lớp này
            }

            // Ghi log để build Dashboard
            if (!targetToKill) {
                let maxSlots = parseInt(cls.MaxStudentNumber);
                let currentStudents = parseInt(cls.NumberOfStudents);
                let scheduleClean = cls.Schedules ? cls.Schedules.replace(/<br\/>/g, ' | ').trim() : 'N/A';
                let status = ignoredClasses.includes(classId) ? ' TRÙNG LỊCH' : ' FULL';

                tableData.push({
                    'Mã Lớp': classId,
                    'Giảng Viên': cls.ProfessorName.trim(),
                    'Lịch Học': scheduleClean,
                    'Sĩ Số': `${currentStudents}/${maxSlots}`,
                    'Trạng Thái': status
                });
            }
        }

        // ==========================================
        // KHỐI XỬ LÝ CƯỚP SLOT (CRITICAL SECTION)
        // ==========================================
        if (targetToKill) {
            isSystemHalted = true; // Khóa luồng toàn cục
            console.clear();
            console.log(`\n PHÁT HIỆN KHE HỞ! MỤC TIÊU: ${targetToKill.CurriculumID} `);
            console.log(`-> Bước 1: Đang Validation (Kiểm tra trùng lịch)...`);

            try {
                // Pre-Check (Kiểm định trước khi bắn lệnh ghi Database)
                const checkRes = await axios.post(CHECK_CONFLICT_API, [targetToKill], { headers: getHeaders() });
                const checkData = checkRes.data;

                if (checkData.IsConflict || checkData.IsFull) {
                    console.log(`\n BỎ QUA: Lớp này bị trùng lịch thời khóa biểu của mày!`);
                    console.log(`-> Đã ném ${targetToKill.CurriculumID} vào Blacklist. Tiếp tục quét...`);

                    ignoredClasses.push(targetToKill.CurriculumID);
                    isSystemHalted = false; // Mở khóa
                    scheduleNextRun();
                    return;
                }

                // Chốt Hạ (Ghi thẳng vào Database trường)
                console.log(` Pre-Check An toàn. Đang bóp cò (POST Regist)...`);
                const registResponse = await axios.post(REGIST_API, [targetToKill], { headers: getHeaders() });

                console.log(`-> [SERVER TRẢ VỀ]:`, registResponse.data);
                console.log(`\n TÁC CHIẾN THÀNH CÔNG! ĐÃ CƯỚP ĐƯỢC SLOT! `);
                console.log(`-> Môn: ${targetToKill.CurriculumID}`);
                console.log(`-> GV:  ${targetToKill.ProfessorName.trim()}`);
                console.log('\x07\x07\x07\x07\x07'); // Kêu báo động chiến thắng 5 lần

                console.log(`\n☠️ HỆ THỐNG HOÀN THÀNH NHIỆM VỤ VÀ TỰ HỦY. VÀO WEB KIỂM TRA LẠI TKB!`);
                process.exit(0); // Rút ống thở

            } catch (error) {
                console.error(`->  LỖI MẠNG KHI CƯỚP SLOT:`, error.message);
                isSystemHalted = false;
                scheduleNextRun();
            }
        } else {
            // Render giao diện giám sát
            console.clear();
            console.log(`==============================================================================`);
            console.log(`[📡 RADAR] Mục tiêu: ${PAYLOAD.ReqParam3} | Trạng thái: ${timeNow}`);
            console.log(`==============================================================================\n`);
            console.table(tableData);

            scheduleNextRun(); // Chuyển sang nhịp quét tiếp theo
        }

    } catch (error) {
        // ==========================================
        // HỆ THỐNG XỬ LÝ LỖI (AUTO-RECOVERY CORE)
        // ==========================================
        if (error.response && error.response.status === 401) {
            console.error(`\n[${timeNow}]  BÁO ĐỘNG: Token hết hạn (401)!`);
            console.log(`->  KÍCH HOẠT AUTO-RECOVERY: Hệ thống tự động phục hồi khóa mới...`);

            jwtToken = ""; // Xóa bộ nhớ đệm thẻ cũ
            isSystemHalted = false; // Mở khóa

            startSniffer(); // Gọi ngược lên Phase 1
            return; // Đảm bảo đứt đoạn luồng cũ
        } else {
            console.error(`\n[${timeNow}]  LỖI MẠNG HOẶC SERVER TRƯỜNG SẬP:`, error.message);
            isSystemHalted = false;
            scheduleNextRun(); // Lỗi linh tinh thì bỏ qua, chờ nhịp sau
        }
    }
}