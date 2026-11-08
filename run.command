#!/bin/bash
# minidash 一键跑：macOS 双击即可。读 CSV → 出 md / svg / png，跑完自动打开产出目录。
# 也可以命令行用：bash run.command [数据目录] [输出目录]

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" || exit 1

DATA_DIR="$1"
OUT_DIR="$2"
[ -z "$DATA_DIR" ] && DATA_DIR="data-demo"
[ -z "$OUT_DIR" ] && OUT_DIR="out"
NO_OPEN="0"
[ -n "$MINIDASH_NO_OPEN" ] && NO_OPEN="$MINIDASH_NO_OPEN"

say() { printf '%s\n' "$*"; }
pause_if_interactive() {
  if [ -t 0 ]; then
    printf '\n按回车键关闭这个窗口...'
    read -r _ || true
  fi
}

say "=============================================="
say " minidash · 每日经营日报（一键出图）"
say "=============================================="
say ""

# 1) 检查 node
if ! command -v node >/dev/null 2>&1; then
  say "没有找到 node（需要 Node.js 18 或更高版本）。"
  say ""
  say "请先装 Node.js：打开 https://nodejs.org 下载 LTS 版，双击安装包一路下一步，"
  say "装完重新双击本文件即可。"
  say ""
  pause_if_interactive
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
[ -z "$NODE_MAJOR" ] && NODE_MAJOR="0"
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  say "当前 node 版本是 $(node -v)，需要 18 或更高。请升级后再双击本文件。"
  say ""
  pause_if_interactive
  exit 1
fi
say "node $(node -v)"

# 2) 检查数据目录
if [ ! -d "$DATA_DIR" ]; then
  say ""
  say "找不到数据目录：$DATA_DIR"
  say "请把 CSV 放进 $HERE/$DATA_DIR/（文件名以 orders- / accounts- / projects- 开头，扩展名 .csv）"
  say "现在目录里有："
  ls -1 "$HERE" | sed 's/^/  /'
  say ""
  pause_if_interactive
  exit 1
fi
say "数据目录：$DATA_DIR"

# 3) 跑日报
say ""
node bin/report.mjs --data "$DATA_DIR" --out "$OUT_DIR"
STATUS=$?

say ""
if [ -d "$OUT_DIR" ]; then
  say "产出目录：$(cd "$OUT_DIR" && pwd)"
  ls -1 "$OUT_DIR" | sed 's/^/  /'
else
  say "没有生成产出目录：$OUT_DIR"
fi

if ! ls "$OUT_DIR"/*.png >/dev/null 2>&1; then
  say ""
  say "提示：这次没有生成 PNG（md 与 svg 已生成）。"
  say "PNG 需要本机的 rsvg-convert：打开「终端」执行  brew install librsvg  之后重新双击即可。"
fi

say ""
if [ "$STATUS" -eq 0 ]; then
  say "完成。"
else
  say "有一步没成功（退出码 $STATUS），上面是原因。"
fi

# 4) 打开产出目录（不想弹 Finder 时设 MINIDASH_NO_OPEN=1）
if [ -d "$OUT_DIR" ] && [ "$NO_OPEN" != "1" ]; then
  open "$OUT_DIR" 2>/dev/null || true
fi

pause_if_interactive
exit "$STATUS"
