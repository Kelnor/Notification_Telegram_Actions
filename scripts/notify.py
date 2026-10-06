#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# KST 시간대 (UTC+9)
KST = timezone(timedelta(hours=9))

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', '.github', 'data', 'schedules.json')
JSON_PATH = os.path.abspath(JSON_PATH)

def get_env_or_config(key, fallback_val=""):
    val = os.environ.get(key, "").strip()
    return val if val else fallback_val

def send_telegram_message(token, chat_id, text):
    if not token or not chat_id:
        print(f"[ERROR] Telegram Bot Token or Chat ID is missing. Token: {'Set' if token else 'Empty'}, ChatID: {'Set' if chat_id else 'Empty'}")
        return False
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            if res_json.get("ok"):
                print("[SUCCESS] Telegram message sent successfully!")
                return True
            else:
                print(f"[ERROR] Telegram API Error: {res_json}")
                return False
    except Exception as e:
        print(f"[ERROR] Exception sending Telegram message: {e}")
        return False

def parse_iso_datetime(dt_str):
    try:
        if dt_str.endswith('Z'):
            dt_str = dt_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=KST)
        return dt
    except Exception as e:
        print(f"[WARNING] Failed to parse datetime '{dt_str}': {e}")
        return None

def main():
    print("=== Precise Telegram Notifier Started ===")
    if not os.path.exists(JSON_PATH):
        print(f"[ERROR] JSON file not found at {JSON_PATH}")
        sys.exit(1)
        
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    daily_limit = data.get("daily_limit", 30)
    schedules = data.get("schedules", [])
    
    token = get_env_or_config("TELEGRAM_BOT_TOKEN", data.get("telegram_bot_token", ""))
    default_chat_id = get_env_or_config("TELEGRAM_CHAT_ID", data.get("telegram_chat_id", ""))
    
    now_kst = datetime.now(KST)
    today_str = now_kst.strftime("%Y-%m-%d")
    
    print(f"[TIME] Current KST Time: {now_kst.strftime('%Y-%m-%d %H:%M:%S KST')}")

    # 오늘 (KST 기준) 이미 전송된 알림 개수 세기
    sent_today_count = 0
    for item in schedules:
        if item.get("status") == "sent" and item.get("sent_at"):
            sent_dt = parse_iso_datetime(item.get("sent_at"))
            if sent_dt and sent_dt.astimezone(KST).strftime("%Y-%m-%d") == today_str:
                sent_today_count += 1
                
    if sent_today_count >= daily_limit:
        print(f"[WARNING] Reached daily limit ({daily_limit}). Skipping pending notifications for today.")
        sys.exit(0)
        
    updated_count = 0
    
    # Sort pending items by scheduled time
    pending_items = []
    for item in schedules:
        if item.get("status") == "pending":
            dt_obj = parse_iso_datetime(item.get("datetime"))
            if dt_obj:
                pending_items.append((dt_obj, item))
                
    pending_items.sort(key=lambda x: x[0])
    
    for target_dt, item in pending_items:
        current_now = datetime.now(KST)
        remaining_seconds = (target_dt - current_now).total_seconds()
        
        print(f"[SCHEDULE CHECK] Title='{item.get('title')}', Scheduled={target_dt.strftime('%Y-%m-%d %H:%M:%S KST')}, Remaining={remaining_seconds:.1f}s")

        # Case 1: 이미 예약 시간이 지난 경우 -> 즉시 발송
        # Case 2: 미래 15분(900초) 이내의 예약인 경우 -> 정밀 대기 후 00초 정각에 발송
        if remaining_seconds > 900:
            print(f"[INFO] Next schedule is more than 15 minutes away ({remaining_seconds/60:.1f}m). Will be picked up by next trigger.")
            break

        if remaining_seconds > 0:
            print(f"[PRECISION WAIT] Waiting {remaining_seconds:.1f} seconds until target time {target_dt.strftime('%H:%M:%S KST')}...")
            time.sleep(remaining_seconds)
            current_now = datetime.now(KST)

        target_chat_id = str(item.get("chat_id") or "").strip() or default_chat_id
        recipient_name = item.get("recipient_name", "")

        # 발송 처리
        if sent_today_count >= daily_limit:
            print(f"[WARNING] Daily limit reached during processing.")
            send_telegram_message(
                token, target_chat_id or default_chat_id,
                f"⚠️ <b>[텔레그램 알림이 경고]</b>\n오늘 일일 알림 한도({daily_limit}회)에 도달하여 추가 알림 발송이 일시 중단됩니다."
            )
            break
            
        title = item.get("title", "예약 알림")
        message = item.get("message", "")
        time_display = target_dt.astimezone(KST).strftime("%Y-%m-%d %H-%M")
        
        telegram_text = (
            f"<b>[Notification] {title}</b>\n"
            f"----------------------------------------\n"
            f"{message}\n"
            f"----------------------------------------\n"
            f"예약일시 : {time_display}"
        )
        
        target_desc = f"{recipient_name} ({target_chat_id})" if recipient_name else target_chat_id
        print(f"[SENDING] Triggering Telegram API for '{title}' to {target_desc} at {datetime.now(KST).strftime('%H:%M:%S KST')}...")
        success = send_telegram_message(token, target_chat_id, telegram_text)
        
        if success:
            item["status"] = "sent"
            item["sent_at"] = datetime.now(KST).isoformat()
            sent_today_count += 1
            updated_count += 1
        else:
            print(f"[ERROR] Failed to send notification ID={item.get('id')}")

    if updated_count > 0:
        data["schedules"] = schedules
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[SUCCESS] Updated {updated_count} schedule(s) in {JSON_PATH}")
    else:
        print("[INFO] No pending schedules due for delivery at this time.")

if __name__ == "__main__":
    main()
