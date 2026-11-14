#!/bin/bash

# Double-click this file in Finder to run the local development site.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

pause_on_error() {
  printf '\nОшибка: %s\n' "$1"
  printf 'Нажмите Enter, чтобы закрыть окно... '
  read -r _
  exit 1
}

project_dir="$(cd "$(dirname "$0")" && pwd)" || pause_on_error "Не удалось найти папку проекта."
cd "$project_dir" || pause_on_error "Не удалось открыть папку проекта."

command -v node >/dev/null 2>&1 || pause_on_error "Установите Node.js 20.9 или новее: https://nodejs.org/"
command -v npm >/dev/null 2>&1 || pause_on_error "npm не найден. Переустановите Node.js: https://nodejs.org/"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)' \
  || pause_on_error "Нужен Node.js 20.9 или новее. Сейчас установлен $(node --version)."

if [ ! -x node_modules/.bin/next ]; then
  printf 'Устанавливаю зависимости проекта...\n'
  npm ci || pause_on_error "Не удалось установить зависимости. Проверьте интернет и повторите запуск."
fi

# Reuse an already running copy of this site instead of starting a duplicate.
if curl --silent --show-error --max-time 3 http://127.0.0.1:3000/ 2>/dev/null \
  | grep -q '<title>Planetary Analog Explorer</title>'; then
  printf 'Сайт уже работает: http://localhost:3000\n'
  if [ "${NASA_SKIP_BROWSER:-0}" != "1" ]; then open http://localhost:3000; fi
  exit 0
fi

port=""
for candidate in {3000..3010}; do
  if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
    port="$candidate"
    break
  fi
done
[ -n "$port" ] || pause_on_error "Порты 3000–3010 заняты. Закройте другие локальные серверы и повторите запуск."

printf '\nЗапускаю сайт: http://localhost:%s\n' "$port"
printf 'Оставьте это окно открытым. Для остановки нажмите Control+C.\n\n'

npm run dev -- --hostname 127.0.0.1 --port "$port" &
server_pid=$!
cleanup() {
  if kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null
    wait "$server_pid" 2>/dev/null
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ready=0
for _ in {1..120}; do
  if curl --silent --fail --output /dev/null --max-time 2 "http://127.0.0.1:$port/"; then
    ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    pause_on_error "Сервер завершился до запуска. Сообщение об ошибке показано выше."
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || pause_on_error "Сервер не ответил за две минуты. Проверьте сообщение выше."

printf '\nСайт готов: http://localhost:%s\n' "$port"
if [ "${NASA_SKIP_BROWSER:-0}" != "1" ]; then open "http://localhost:$port"; fi
wait "$server_pid"
