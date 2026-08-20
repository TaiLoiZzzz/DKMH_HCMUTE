#!/bin/bash
# Script tự động nhập liệu cho app.js trên Ubuntu/Linux có delay
# (Khắc phục lỗi Node.js readline nuốt dòng khi dùng pipe/HereDoc)

(
    echo "3"
    sleep 0.5
    echo "MALE431984"
    sleep 0.5
    echo "n"
    sleep 0.5
    echo "MALE431984_07"
    sleep 0.5
    echo "PICK112330"
    sleep 0.5
    echo "n"
    sleep 0.5
    echo "PICK112330_03, PICK112330_04, PICK112330_05, PICK112330_06, PICK112330_07, PICK112330_11"
    sleep 0.5
    echo "ECOM430984"
    sleep 0.5
    echo "n"
    sleep 0.5
    echo "ECOM430984_04, ECOM430984_05"
    sleep 0.5
    cat # Giữ cho stdin không bị đóng để Node.js không bị thoát đột ngột!
) | node app.js
