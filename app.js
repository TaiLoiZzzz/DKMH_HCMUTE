// ==============================================================================
// HỆ THỐNG AUTO-KILL ĐĂNG KÝ MÔN HỌC (BẢN TỐI THƯỢNG - FULLY AUTOMATED)
// Kiến trúc: Tàng hình (Stealth) + Đánh chặn Token + Auto Recovery + Random Jitter + Multi-threading
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
let isSystemHalted = false; // Semaphore khóa luồng tác chiến
let isRecovering = false;   // Lock khi xin lại Token
let ignoredClasses = [];    // Blacklist các lớp trùng lịch chung

// Mảng chứa danh sách các môn mục tiêu
let targets = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

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

// 2. Sinh thời gian ngẫu nhiên (Từ 240s -> 360s) để né Tường lửa đếm nhịp
function getRandomInterval() {
    const min = 120 * 1000;
    const max = 240 * 1000;
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// 3. Hàm điều phối luồng chạy ngầm cho từng môn
function scheduleNextRun(targetIndex, customDelay = null) {
    const target = targets[targetIndex];
    if (target.isDone) return;

    const delay = customDelay || getRandomInterval();
    target.nextRunTime = new Date(Date.now() + delay).toLocaleTimeString();

    setTimeout(() => {
        checkAvailableSlots(targetIndex);
    }, delay);

    renderDashboard();
}

// 4. Render Dashboard tập trung
function renderDashboard() {
    if (isSystemHalted) return; // Đang tác chiến thì ngừng render đè màn hình

    console.clear();
    console.log("====================================================================");
    console.log(" HỆ THỐNG AUTO-KILL ĐKMH (MULTI-THREADING)");
    console.log(` Trạng thái Token: ${jwtToken ? "🟢 Hoạt động" : "🔴 Đang lấy/Phục hồi"}`);
    console.log("====================================================================\n");

    targets.forEach((t, index) => {
        if (t.isDone) {
            console.log(`[🎯 MỤC TIÊU ${index + 1}: ${t.maMon}] -> ✅ ĐÃ HOÀN THÀNH`);
            console.log("------------------------------------------------------------------");
        } else {
            let targetType = t.isOnlyMooc ? "(Chỉ MOOC)" : (t.specificClasses && t.specificClasses.length > 0 ? `(Lớp: ${t.specificClasses.join(', ')})` : "(Tất cả)");
            console.log(`[📡 RADAR ${index + 1}] Mục tiêu: ${t.maMon} ${targetType}`);
            console.log(`-> Nhịp quét tiếp theo lúc: ${t.nextRunTime || 'Đang chờ...'}`);

            if (t.tableData && t.tableData.length > 0) {
                console.table(t.tableData);
            } else if (t.lastMessage) {
                console.log(`-> ${t.lastMessage}`);
            }
            console.log("------------------------------------------------------------------");
        }
    });
}

// ==========================================
// KHỞI ĐỘNG HỆ THỐNG (CLI)
// ==========================================
async function initSystem() {
    console.clear();
    console.log("====================================================================");
    console.log(" HỆ THỐNG AUTO-KILL ĐKMH ");
    console.log("====================================================================\n");

    let numStr = await askQuestion(' Bạn muốn đăng ký bao nhiêu môn cùng lúc? (VD: 2): ');
    let numTargets = parseInt(numStr.trim());
    if (isNaN(numTargets) || numTargets <= 0) {
        console.log(" Lỗi: Số lượng không hợp lệ.");
        process.exit(1);
    }

    for (let i = 0; i < numTargets; i++) {
        console.log(`\n--- NHẬP THÔNG TIN MÔN THỨ ${i + 1} ---`);
        let maMonInput = await askQuestion(' Nhập mã môn học (VD: 261LLCT120205): ');
        let maMon = `261${maMonInput.trim()}`;
        if (!maMonInput.trim()) {
            console.log(" Lỗi: Mã môn trống. Bỏ qua môn này.");
            continue;
        }

        let moocAns = await askQuestion(' Bạn có muốn CHỈ chọn lớp MOOC không? (y = Chỉ MOOC, n = Tất cả các lớp): ');
        let isOnlyMooc = moocAns.trim().toLowerCase() === 'y';

        let specificClasses = [];
        if (!isOnlyMooc) {
            let specificAns = await askQuestion(' Bạn có muốn CHỈ ĐỊNH CHÍNH XÁC mã lớp không? (Nhập các mã lớp cách nhau bằng dấu phẩy, hoặc nhấn Enter để chọn tất cả): ');
            if (specificAns.trim()) {
                specificClasses = specificAns.split(',').map(c => c.trim().toUpperCase()).filter(c => c);
            }
        }

        targets.push({
            maMon: maMon,
            isOnlyMooc: isOnlyMooc,
            specificClasses: specificClasses,
            tableData: [],
            isDone: false,
            nextRunTime: null,
            lastMessage: "Chờ quét lần đầu...",
            payload: { ReqParam1: STUDY_PROGRAM_ID, ReqParam2: "NKH", ReqParam3: maMon }
        });

        let targetType = isOnlyMooc ? "(Chỉ MOOC)" : (specificClasses.length > 0 ? `(Lớp: ${specificClasses.join(', ')})` : "(Tất cả)");
        console.log(`-> [LOCKED] Đã khóa mục tiêu ${i + 1}: ${maMon} ${targetType}`);
    }

    rl.close();

    if (targets.length === 0) {
        console.log("Không có môn nào được chọn. Thoát.");
        process.exit(0);
    }

    console.log("\n-> Kích hoạt chuỗi dây chuyền...");
    startSniffer();
}

// Bắt đầu
initSystem();

// ==========================================
// PHASE 1: VƯỢT GOOGLE & TRỘM TOKEN (TÍCH HỢP AUTO-RECOVERY)
// ==========================================
async function startSniffer() {
    if (jwtToken) return; // Nếu đã có token thì thôi (đề phòng gọi nhiều lần)

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

    // CHIÊU 1: Đánh chặn Outbound Request
    page.on('request', async (request) => {
        if (isTokenGrabbed) return;

        const url = request.url();
        const headers = request.headers();

        if (url.includes('dangkyapi.hcmute.edu.vn/api/') && headers['authorization'] && headers['authorization'].includes('Bearer')) {
            jwtToken = headers['authorization'].split('Bearer ')[1].trim();
            isTokenGrabbed = true;

            console.log(`\n-> [THÀNH CÔNG] Đã móc được Token từ phiên đăng nhập cục bộ!`);
            await browser.close().catch(e => { });

            finishSniffer();
        }
    });

    // CHIÊU 2: Đánh chặn Inbound Response
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

                    finishSniffer();
                }
            } catch (err) { }
        }
    });

    try {
        await page.goto('https://dkmh.hcmute.edu.vn/', { waitUntil: 'networkidle2' });

        // AUTO-LOGIN LOGIC
        (async () => {
            try {
                console.log("-> [AUTO-LOGIN] Đang chờ giao diện tải...");

                // Đợi tối đa 15s cho đến khi thấy nút Đăng nhập trên màn hình
                await page.waitForFunction(() => {
                    const elements = Array.from(document.querySelectorAll('a, button, div, span'));
                    return elements.some(el => el.innerText && el.innerText.toLowerCase().includes('đăng nhập với google'));
                }, { timeout: 15000 });

                if (isTokenGrabbed) return;

                console.log("-> [AUTO-LOGIN] Đã thấy nút Đăng nhập, đang thực hiện click...");
                const clicked = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('a, button, div, span'));
                    // Tìm tất cả các thẻ có chứa chữ đăng nhập với google
                    const loginBtns = elements.filter(el => el.innerText && el.innerText.toLowerCase().includes('đăng nhập với google'));

                    if (loginBtns.length > 0) {
                        // Ưu tiên click vào thẻ Button hoặc thẻ Link (A), nếu không có thì click thằng đầu tiên
                        let target = loginBtns.find(el => el.tagName === 'BUTTON' || el.tagName === 'A') || loginBtns[0];
                        target.click();
                        return true;
                    }
                    return false;
                });

                if (clicked) {
                    console.log("-> [AUTO-LOGIN] Đã click nút! Chờ màn hình chọn Google Account...");
                    const target = await browser.waitForTarget(t => t.url().includes('accounts.google.com'), { timeout: 15000 });
                    const googlePage = await target.page();

                    if (googlePage) {
                        console.log("-> [AUTO-LOGIN] Đang tìm email đuôi @student.hcmute.edu.vn...");

                        // Chờ tài khoản xuất hiện trên màn hình
                        await googlePage.waitForFunction(() => {
                            const elements = Array.from(document.querySelectorAll('div, span, li, a'));
                            return elements.some(el => el.innerText && el.innerText.includes('@student.hcmute.edu.vn'));
                        }, { timeout: 15000 });

                        // Đợi thêm 1s cho UI ổn định
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        await googlePage.evaluate(() => {
                            const emailSuffix = '@student.hcmute.edu.vn';

                            // 1. Thử tìm theo chuẩn của Google (data-identifier)
                            const accountDiv = document.querySelector(`[data-identifier*="${emailSuffix}"]`);
                            if (accountDiv) {
                                accountDiv.click();
                                return;
                            }

                            // 2. Tìm thẻ chứa text, sau đó lùi lên tìm vùng bấm (click handler)
                            const elements = Array.from(document.querySelectorAll('div, span, li, a'));
                            const emailEls = elements.filter(el => el.innerText && el.innerText.includes(emailSuffix));

                            if (emailEls.length > 0) {
                                // Lấy thẻ nằm sâu nhất (chính là dòng chữ email)
                                let target = emailEls[emailEls.length - 1];

                                // Dò ngược lên DOM tree để tìm thẻ bọc bên ngoài có sự kiện click
                                let parent = target;
                                while (parent && parent !== document.body) {
                                    const role = parent.getAttribute('role');
                                    if (parent.tagName === 'LI' || role === 'button' || role === 'link' || parent.hasAttribute('jsaction')) {
                                        parent.click();
                                        return;
                                    }
                                    parent = parent.parentElement;
                                }

                                // Nếu không tìm thấy thẻ bọc chuẩn, thì click thẳng vào chữ
                                target.click();
                            }
                        });
                        console.log("-> [AUTO-LOGIN] Đã click chọn tài khoản sinh viên thành công!");
                    }
                } else {
                    console.log("-> [AUTO-LOGIN] Không click được nút Đăng nhập với Google.");
                }
            } catch (e) {
                if (!e.message.includes('Target closed') && !e.message.includes('detached')) {
                    console.log("-> [AUTO-LOGIN] Lỗi khi đang tự động đăng nhập:", e.message);
                }
            }
        })();

    } catch (error) {
        if (!error.message.includes('detached') && !error.message.includes('Target closed') && !error.message.includes('Session closed')) {
            console.error(`->  Lỗi phụ khi load trang:`, error.message);
        }
    }
}

// Hàm được gọi khi lấy xong Token
function finishSniffer() {
    console.log("-> [2] Giật sập trình duyệt. Kích hoạt Radar cào dữ liệu ngầm.\n");
    isRecovering = false;

    // Kích hoạt tất cả các luồng chưa hoàn thành
    targets.forEach((t, index) => {
        if (!t.isDone) {
            checkAvailableSlots(index);
        }
    });
}

// ==========================================
// PHASE 2 & 3: RADAR + PRE-CHECK + AUTO KILL
// ==========================================
async function checkAvailableSlots(targetIndex) {
    if (isSystemHalted || isRecovering) {
        // Đang tác chiến hoặc đang xin Token thì luồng này ngủ thêm 5 giây rồi dậy check lại
        setTimeout(() => checkAvailableSlots(targetIndex), 5000);
        return;
    }

    let target = targets[targetIndex];
    if (target.isDone) return;

    const timeNow = new Date().toLocaleTimeString();
    try {
        // Quét lấy danh sách lớp
        const response = await axios.post(CHECK_API, target.payload, { headers: getHeaders() });
        const classes = response.data;

        if (!classes || classes.length === 0) {
            target.lastMessage = `[${timeNow}] Hệ thống báo: Không có lớp nào cho mã này.`;
            target.tableData = [];
            scheduleNextRun(targetIndex);
            return;
        }

        let tableData = [];
        let targetToKill = null;

        for (let cls of classes) {
            let classId = cls.ScheduleStudyUnitAlias || 'N/A';

            // Nếu bật cờ CHỈ săn MOOC nhưng thông tin lớp này không chứa chữ UTExMC thì bỏ qua
            let classInfoStr = JSON.stringify(cls).toUpperCase();
            if (target.isOnlyMooc && !classInfoStr.includes('UTEXMC')) {
                continue;
            }

            // Nếu có danh sách lớp chỉ định cụ thể, bỏ qua nếu mã lớp không nằm trong danh sách
            if (target.specificClasses && target.specificClasses.length > 0) {
                if (!target.specificClasses.includes(classId.toUpperCase())) {
                    continue;
                }
            }

            let emptySlots = parseInt(cls.NumberRegistOfEmpty);

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
                let maLopHienThi = cls.ScheduleStudyUnitAlias || classId;

                tableData.push({
                    'Mã Lớp': maLopHienThi,
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
            isSystemHalted = true; // Khóa luồng toàn cục để ưu tiên mạng cho thằng này
            console.clear();
            console.log(`\n PHÁT HIỆN KHE HỞ MÔN [${target.maMon}]! MỤC TIÊU: ${targetToKill.CurriculumID} `);
            console.log(`-> Bước 1: Đang Validation (Kiểm tra trùng lịch)...`);

            try {
                // Pre-Check (Kiểm định trước khi bắn lệnh ghi Database)
                const checkRes = await axios.post(CHECK_CONFLICT_API, [targetToKill], { headers: getHeaders() });
                const checkData = checkRes.data;

                if (checkData.IsConflict || checkData.IsFull) {
                    console.log(`\n BỎ QUA: Lớp này bị trùng lịch thời khóa biểu của mày!`);
                    let targetAlias = targetToKill.ScheduleStudyUnitAlias || targetToKill.CurriculumID;
                    console.log(`-> Đã ném ${targetAlias} vào Blacklist. Tiếp tục quét...`);

                    ignoredClasses.push(targetAlias);
                    isSystemHalted = false; // Mở khóa cho các luồng khác
                    scheduleNextRun(targetIndex);
                    return;
                }

                // Chốt Hạ (Ghi thẳng vào Database trường)
                console.log(` Pre-Check An toàn. Đang bóp cò (POST Regist)...`);
                const registResponse = await axios.post(REGIST_API, [targetToKill], { headers: getHeaders() });

                console.log(`-> [SERVER TRẢ VỀ]:`, registResponse.data);
                console.log(`\n TÁC CHIẾN THÀNH CÔNG! ĐÃ CƯỚP ĐƯỢC SLOT MÔN ${target.maMon}! `);
                let targetAlias = targetToKill.ScheduleStudyUnitAlias || targetToKill.CurriculumID;
                console.log(`-> Môn: ${targetAlias}`);
                console.log(`-> GV:  ${targetToKill.ProfessorName.trim()}`);
                console.log('\x07\x07\x07\x07\x07'); // Kêu báo động chiến thắng 5 lần

                target.isDone = true; // Đánh dấu đã xong
                isSystemHalted = false; // Mở khóa

                // Kiểm tra xem tất cả các mục tiêu đã xong chưa
                if (targets.every(t => t.isDone)) {
                    console.log(`\n☠️ HỆ THỐNG ĐÃ HOÀN THÀNH TẤT CẢ NHIỆM VỤ VÀ TỰ HỦY. VÀO WEB KIỂM TRA LẠI TKB!`);
                    process.exit(0);
                } else {
                    console.log(`\n-> Vẫn còn môn chưa đăng ký xong. Chuyển về Dashboard ngầm...`);
                    // Delay tí rồi render lại dashboard
                    setTimeout(renderDashboard, 2000);
                }

            } catch (error) {
                console.error(`->  LỖI MẠNG KHI CƯỚP SLOT:`, error.message);
                isSystemHalted = false;
                scheduleNextRun(targetIndex);
            }
        } else {
            // Cập nhật log cho Dashboard
            target.tableData = tableData;
            target.lastMessage = `Quét lúc ${timeNow}`;
            scheduleNextRun(targetIndex);
        }

    } catch (error) {
        // ==========================================
        // HỆ THỐNG XỬ LÝ LỖI (AUTO-RECOVERY CORE)
        // ==========================================
        if (error.response && error.response.status === 401) {
            if (!isRecovering) {
                isRecovering = true; // Block các luồng khác
                console.error(`\n[${timeNow}]  BÁO ĐỘNG: Token hết hạn (401)!`);
                console.log(`->  KÍCH HOẠT AUTO-RECOVERY: Hệ thống tự động phục hồi khóa mới...`);
                jwtToken = ""; // Xóa bộ nhớ đệm thẻ cũ

                startSniffer();
            }
            // Luồng hiện tại ngủ chờ token mới
            setTimeout(() => checkAvailableSlots(targetIndex), 5000);
        } else {
            target.lastMessage = `[${timeNow}]  LỖI MẠNG HOẶC SERVER SẬP: ${error.message}`;
            scheduleNextRun(targetIndex);
        }
    }
}