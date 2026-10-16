#!/bin/sh
# 把功能分支合回 dev：rebase、fast-forward、檢查、更新版本號、push、刪分支、確認部署。
#
# 用法（在 repo 內任何位置執行）：
#   sh tools/merge-dev.sh                    合併目前所在的分支
#   sh tools/merge-dev.sh feat-a feat-b      合併多個分支，版本號只加一次
#   sh tools/merge-dev.sh sync-sheet         只有 origin 有的分支會先建立本機追蹤分支
#   sh tools/merge-dev.sh --dry-run feat-a   只印出會做的事，不改任何東西
#   sh tools/merge-dev.sh --no-wait feat-a   push 後不等 GitHub Pages 部署結果
#
# 版本號是 app.js 第一行的 APP_VERSION：日期.當天第幾次（例如 2026.10.16.2），日期用台灣時間。
# sw.js 的 VERSION 會設成同一個字串，快取優先的檔案改了也不會漏換快取。
# rebase 有衝突時會停下來，dev 和分支都還原成原本的樣子。
set -eu

DRY=''
WAIT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --no-wait) WAIT=''; shift ;;
    --) shift; break ;;
    -*) echo "✗ 不認得的選項 $1（可用 --dry-run、--no-wait）" >&2; exit 2 ;;
    *) break ;;
  esac
done

die() { echo "✗ $*" >&2; exit 1; }
say() { echo "$*"; }
run() { if [ -n "$DRY" ]; then echo "  (dry-run) $*"; else "$@"; fi; }
sha() { git rev-parse -q --verify "$1^{commit}" 2>/dev/null; }

# 在目前所在的 repo 執行（不是腳本所在的資料夾），測試時才不會動到別的 repo
top=$(git rev-parse --show-toplevel 2>/dev/null) || die '要在 git repo 裡執行'
cd "$top"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die '有還沒 commit 的變更，先 commit 再執行'
git rev-parse -q --verify HEAD >/dev/null || die 'repo 還沒有任何 commit'

if [ $# -eq 0 ]; then
  cur=$(git symbolic-ref -q --short HEAD) || die '目前不在任何分支上，請指定要合併的分支'
  set -- "$cur"
fi
for b in "$@"; do
  case "$b" in dev|main) die "不能合併 ${b}，請指定功能分支" ;; esac
  git check-ref-format --branch "$b" >/dev/null 2>&1 || die "分支名稱不正確：$b"
done
BRANCHES="$*"

if [ -n "$DRY" ]; then
  say '→ (dry-run) 不 fetch，用目前已知的 origin 狀態推算'
else
  say '→ 取得 origin 最新狀態'
  git fetch -q --prune origin || die 'git fetch 失敗，確認網路與 origin 設定'
fi

# 找出每個分支；只有 origin 有的分支要先建立本機追蹤分支
created=''
for b in "$@"; do
  if sha "refs/heads/$b" >/dev/null; then
    r=$(sha "refs/remotes/origin/$b" || true)
    if [ -n "$r" ] && ! git merge-base --is-ancestor "$r" "refs/heads/$b"; then
      say "⚠ origin/$b 有本機 $b 沒有的 commit，這次只合併本機的 ${b}，origin/$b 不會被刪"
    fi
  elif sha "refs/remotes/origin/$b" >/dev/null; then
    say "→ 本機沒有 ${b}，從 origin/$b 建立追蹤分支"
    run git branch -q --track "$b" "origin/$b"
    created="$created $b"
  else
    die "找不到分支 ${b}（本機和 origin 都沒有）"
  fi
done

ref_of() { # dry-run 時尚未建立的分支改看 origin/<名稱>
  if sha "refs/heads/$1" >/dev/null; then echo "refs/heads/$1"; else echo "refs/remotes/origin/$1"; fi
}

# 更新 dev
sha refs/remotes/origin/dev >/dev/null || die '找不到 origin/dev'
if [ -n "$DRY" ]; then
  if ! sha refs/heads/dev >/dev/null; then
    say '  (dry-run) git checkout -b dev origin/dev'
    base=$(sha refs/remotes/origin/dev)
  elif git merge-base --is-ancestor refs/heads/dev refs/remotes/origin/dev; then
    say '  (dry-run) git checkout dev && git merge --ff-only origin/dev'
    base=$(sha refs/remotes/origin/dev)
  elif git merge-base --is-ancestor refs/remotes/origin/dev refs/heads/dev; then
    base=$(sha refs/heads/dev)
  else
    die 'dev 和 origin/dev 分岔了，先手動處理'
  fi
else
  say '→ 更新 dev'
  if sha refs/heads/dev >/dev/null; then
    git checkout -q dev || die '無法切到 dev（若 dev 正在其他 worktree 使用中，請到那個資料夾執行）'
  else
    git checkout -q -b dev --track origin/dev
  fi
  git merge -q --ff-only origin/dev || die 'dev 和 origin/dev 分岔了，先手動處理（dev 沒有被改動）'
  base=$(git rev-parse HEAD)
fi

# 記下原本的位置，出錯時用來還原
origs=''
for b in "$@"; do origs="$origs $b=$(sha "$(ref_of "$b")")"; done
orig_of() { for p in $origs; do [ "${p%%=*}" = "$1" ] && echo "${p#*=}"; done; return 0; }

restore() { # 把 dev 與分支還原成合併前
  git checkout -q dev
  git reset -q --hard "$base"
  for b in "$@"; do
    case " $created " in *" $b "*) git branch -q -D "$b" 2>/dev/null || true; continue ;; esac
    o=$(orig_of "$b")
    [ -n "$o" ] && git branch -q -f "$b" "$o"
  done
}

restore_hint() {
  echo "  還原方式：git checkout dev && git reset --hard $base" >&2
  for b in "$@"; do
    case " $created " in *" $b "*) echo "            git branch -D $b   （這次才建立的追蹤分支）" >&2; continue ;; esac
    echo "            git branch -f $b $(orig_of "$b")" >&2
  done
}

# 逐一 rebase 並 fast-forward 合併
for b in "$@"; do
  say "→ 合併 $b"
  if [ -n "$DRY" ]; then
    if git merge-base --is-ancestor "$base" "$(ref_of "$b")"; then
      say "  (dry-run) git merge --ff-only $b"
    else
      say "  (dry-run) git rebase dev $b"
      say "  (dry-run) git merge --ff-only $b"
      say '  （rebase 是否有衝突要實際執行才知道）'
    fi
    continue
  fi
  if ! git merge-base --is-ancestor dev "$b"; then
    if ! err=$(git rebase -q dev "$b" 2>&1 >/dev/null); then
      if [ ! -d "$(git rev-parse --git-path rebase-merge)" ] && [ ! -d "$(git rev-parse --git-path rebase-apply)" ]; then
        git checkout -q dev 2>/dev/null || true
        restore "$@"
        echo "✗ 無法 rebase ${b}，已還原：$err" >&2
        echo '  若分支正在其他 worktree 使用中，先在那邊切到別的分支再執行' >&2
        exit 1
      fi
      conflicts=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
      git rebase --abort 2>/dev/null || true
      restore "$@"
      echo "✗ $b rebase 到 dev 有衝突，已還原，dev 和分支都沒有改動" >&2
      [ -n "$conflicts" ] && echo "  衝突檔案：$(echo $conflicts)" >&2
      echo "  修正方式：git checkout $b && git rebase dev，解完衝突後再執行一次這支腳本" >&2
      exit 1
    fi
    git checkout -q dev
  fi
  git merge -q --ff-only "$b" || { restore "$@"; die "$b 無法 fast-forward 合併，已還原"; }
done

# 合併後、更新版本號前先檢查
if [ -n "$DRY" ]; then
  say '→ (dry-run) 合併後會執行檢查：node --check、node --test、tools/check-data.cjs、tools/check-font.cjs（存在才執行）'
else
  say '→ 檢查'
  check_fail() {
    echo "✗ $1，沒有 push" >&2
    echo '  本機 dev 已合併但還沒推送；修好後重新合併，或先還原：' >&2
    restore_hint $BRANCHES
    exit 1
  }
  for f in ./*.js dev-server.cjs; do
    [ -f "$f" ] || continue
    node --check "$f" || check_fail "語法檢查沒過：$f"
  done
  if ! out=$(node --test app.test.cjs trip-data.test.cjs maps.test.cjs visits.test.cjs sw.test.cjs 2>&1); then
    printf '%s\n' "$out" | grep -E '^not ok|^# (fail|pass)' >&2 || true
    check_fail '測試沒過（執行 npm test 看完整錯誤）'
  fi
  say '  ✓ 語法與測試'
  if [ -f tools/check-data.cjs ]; then
    if node tools/check-data.cjs; then say '  ✓ 資料檢查'; else
      check_fail '資料檢查沒過（node tools/check-data.cjs 看錯誤）'
    fi
  fi
  if [ -f tools/check-font.cjs ]; then
    if node tools/check-font.cjs; then say '  ✓ 字型檢查'; else
      say '⚠ 字型檢查沒過（不阻擋合併）。修正方式：執行 node tools/check-font.cjs 看缺哪些字，重新產生字型子集後另開分支合併'
    fi
  fi
fi

# 版本號：同一天就加 1，換天從 1 開始
today=$(TZ=Asia/Taipei date +%Y.%m.%d)
if [ -n "$DRY" ]; then line1=$(git show "$base:app.js" | head -n 1); else line1=$(head -n 1 app.js); fi
old=$(printf '%s\n' "$line1" | sed -n "s/^const APP_VERSION = '\([^']*\)';.*/\1/p")
[ -n "$old" ] || die "app.js 第一行不是 const APP_VERSION = '...';"
case "$old" in
  "$today".*)
    n=${old#"$today".}
    case "$n" in ''|*[!0-9]*) n=1 ;; *) n=$((n + 1)) ;; esac ;;
  *) n=1 ;;
esac
ver="$today.$n"
say "→ 版本號 $old → ${ver}（app.js APP_VERSION、sw.js VERSION）"
if [ -z "$DRY" ]; then
  grep -q "^const VERSION = '[^']*';" sw.js || { restore_hint "$@"; die "sw.js 找不到 const VERSION = '...';"; }
  sed "1s/^const APP_VERSION = '[^']*';/const APP_VERSION = '$ver';/" app.js > app.js.tmp && mv app.js.tmp app.js
  sed "s/^const VERSION = '[^']*';/const VERSION = '$ver';/" sw.js > sw.js.tmp && mv sw.js.tmp sw.js
  git add app.js sw.js
  git commit -q -m "版本：更新至 $ver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
fi

say '→ push dev'
if [ -z "$DRY" ]; then
  if ! git push -q origin dev; then
    echo '✗ push 失敗，origin/dev 可能有別人（或試算表同步）新推的 commit' >&2
    echo '  本機 dev 已合併並更新版本號但還沒推送。可以先還原再重跑：' >&2
    restore_hint "$@"
    exit 1
  fi
else
  say '  (dry-run) git push origin dev'
fi
pushed=$(git rev-parse HEAD)

# 刪除已完整合併的分支：先看是否為 dev 的祖先；origin 上 rebase 前的舊 commit 改比對內容（git cherry）
merged_into_dev() { # $1 = commit；dry-run 時以 dev 會包含的分支為準
  target=dev
  [ -n "$DRY" ] && target=$base
  git merge-base --is-ancestor "$1" "$target" && return 0
  [ -n "$DRY" ] && return 1
  ! git cherry dev "$1" | grep -q '^+'
}

say '→ 刪除已合併的分支'
for b in "$@"; do
  case "$b" in dev|main) continue ;; esac
  if [ -n "$DRY" ]; then
    case " $created " in *" $b "*) ;; *) say "  (dry-run) git branch -D ${b}（確認已完整合併後）" ;; esac
    sha "refs/remotes/origin/$b" >/dev/null && say "  (dry-run) git push origin --delete ${b}（確認已完整合併後）"
    continue
  fi
  if merged_into_dev "refs/heads/$b"; then
    if git branch -q -D "$b"; then say "  ✓ 刪除本機 $b"; else say "⚠ 刪除本機 $b 失敗（可能在其他 worktree 使用中），請手動處理"; fi
  else
    say "⚠ 本機 $b 沒有完整合進 dev，沒有刪"
  fi
  r=$(git ls-remote --heads origin "refs/heads/$b" 2>/dev/null | cut -f1)
  if [ -n "$r" ]; then
    if git cat-file -e "$r^{commit}" 2>/dev/null && merged_into_dev "$r"; then
      if git push -q origin --delete "$b"; then say "  ✓ 刪除 origin/$b"; else say "⚠ 刪除 origin/$b 失敗，請手動處理"; fi
    else
      say "⚠ origin/$b 有沒合進 dev 的 commit，沒有刪"
    fi
  fi
done
[ -n "$DRY" ] || git fetch -q --prune origin || true

# 部署確認
url=$(git config --get remote.origin.url 2>/dev/null || true)
slug=$(printf '%s\n' "$url" | sed -n 's#^.*github\.com[:/]\([^/]*/[^/]*\)$#\1#p' | sed 's#\.git$##')
site=''
if [ -n "$slug" ]; then
  site="https://$(echo "${slug%%/*}" | tr 'A-Z' 'a-z').github.io/${slug#*/}/"
  say "  預覽：https://raw.githack.com/$slug/$pushed/index.html"
fi

if [ -n "$DRY" ]; then
  say "✓ dry-run 結束：版本會是 ${ver}，沒有改動任何東西"
  exit 0
fi

pending() { say "⚠ 尚未確認部署：$*"; say "✓ 已合併並 push，版本 ${ver}（commit ${pushed}）"; exit 0; }
[ -n "$WAIT" ] || pending '使用了 --no-wait，請到 GitHub 的 Actions 或 Pages 頁面確認'
[ -n "$slug" ] || pending 'origin 不是 GitHub，無法查詢 Pages'
command -v gh >/dev/null 2>&1 || pending '沒有安裝 gh，請到 GitHub 的 Actions 或 Pages 頁面確認'
gh auth status >/dev/null 2>&1 || pending 'gh 尚未登入（gh auth login），請到 GitHub 頁面確認'
s=$(gh api "repos/$slug/pages" --jq .html_url 2>/dev/null || true)
[ -n "$s" ] && site=$s

say "→ 等待 GitHub Pages 部署（每 10 秒查一次，最多約 3 分鐘）"
i=0
while [ $i -lt 18 ]; do
  i=$((i + 1))
  sleep 10
  info=$(gh api "repos/$slug/pages/builds/latest" --jq '.status + " " + .commit' 2>/dev/null || true)
  status=${info%% *}
  commit=${info#* }
  [ -n "$info" ] || continue
  # 只認這次 push 的 commit，或包含它的更新 commit（例如試算表同步）
  if [ "$commit" != "$pushed" ]; then
    git cat-file -e "$commit^{commit}" 2>/dev/null || git fetch -q origin dev 2>/dev/null || true
    git cat-file -e "$commit^{commit}" 2>/dev/null && git merge-base --is-ancestor "$pushed" "$commit" || continue
  fi
  case "$status" in
    built) say "✓ 部署完成：$site"; say "✓ 版本 ${ver}（commit ${pushed}）"; exit 0 ;;
    errored) say "✗ 部署失敗（errored）：到 GitHub 的 Actions 頁面看「pages build and deployment」的錯誤"; say "  已 push 版本 ${ver}（commit ${pushed}）"; exit 1 ;;
  esac
done
pending "等了約 3 分鐘還沒完成，稍後到 $site 或 GitHub 的 Actions 頁面確認"
