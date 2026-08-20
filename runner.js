const { spawn } = require('child_process');

// Buộc Node.js hiển thị màu sắc trên console (nếu có)
process.env.FORCE_COLOR = '1';

const child = spawn('node', ['app.js'], {
    // Chuyển hướng stdout và stderr để ta có thể đọc và in ra màn hình
    stdio: ['pipe', 'pipe', process.stderr],
    env: process.env
});

// Danh sách các câu trả lời sẽ được tự động điền theo thứ tự
const inputs = [
    "3",
    "MALE431984",
    "n",
    "MALE431984_07",
    "PICK112330",
    "n",
    "PICK112330_03, PICK112330_04, PICK112330_05, PICK112330_06, PICK112330_07, PICK112330_11",
    "ECOM430984",
    "n",
    "ECOM430984_04, ECOM430984_05"
];

let currentIndex = 0;

child.stdout.on('data', (data) => {
    // In nội dung của app.js ra màn hình
    process.stdout.write(data);

    const str = data.toString();

    // Nhận diện các câu hỏi để tự động nhập câu trả lời tương ứng
    if (str.includes('Bạn muốn đăng ký bao nhiêu') ||
        str.includes('Nhập mã môn học') ||
        str.includes('CHỈ chọn lớp MOOC không') ||
        str.includes('CHỈ ĐỊNH CHÍNH XÁC mã lớp không')) {

        if (currentIndex < inputs.length) {
            // Đợi một tích tắc để đảm bảo giao diện đã sẵn sàng nhận input
            setTimeout(() => {
                child.stdin.write(inputs[currentIndex] + '\n');
                currentIndex++;
            }, 100);
        }
    }
});

child.on('close', (code) => {
    process.exit(code);
});
